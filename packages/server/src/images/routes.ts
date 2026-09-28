import { randomUUID } from "node:crypto";
import { PlanSheetSchema } from "@oth/model";
import { and, asc, eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import type { AppEnv } from "../app";
import { readAsset, storeAsset } from "../assets/storage";
import { requireUser } from "../auth/middleware";
import { levelImages, levels, planPdfs } from "../db/schema";
import { IMAGE_MAX_BYTES, InvalidImageError, readImageSize } from "./inspect";
import { PDF_MAX_BYTES, attachmentName, capFilename, looksLikePdf } from "./pdf";

const PatchBody = z.object({
  expectedVersion: z.number().int().nonnegative(),
  data: z.object({
    metresPerPixel: z.number().positive().nullable().optional(),
    offsetX: z.number().finite().optional(),
    offsetY: z.number().finite().optional(),
    opacity: z.number().min(0).max(1).optional(),
  }),
});

export const levelImageRoutes = new Hono<AppEnv>();

levelImageRoutes.use("*", requireUser);

/**
 * In one order, every time: last saved last, then by id. Without an ORDER BY
 * the database returns rows as they lie on disk, and saving one moves it, so
 * a floor with two plans showed one, then the other after any edit. There is
 * no created_at on this table, and the editor's `imageForLevel` picks by the
 * same rule, so the plan it shows is the one listed last for its floor.
 */
levelImageRoutes.get("/", async c =>
  c.json({
    items: await c.get("db").select().from(levelImages)
      .where(isNull(levelImages.deletedAt))
      .orderBy(asc(levelImages.updatedAt), asc(levelImages.id)),
  }),
);

levelImageRoutes.post("/", async c => {
  const db = c.get("db");
  const form = await c.req.formData().catch(() => null);
  const file = form?.get("file");
  const levelId = form?.get("levelId");

  if (!(file instanceof File) || typeof levelId !== "string") {
    return c.json({ error: "expected multipart fields 'file' and 'levelId'" }, 400);
  }

  const level = (await db.select().from(levels).where(eq(levels.id, levelId)))[0];
  if (!level) return c.json({ error: `no such level: ${levelId}` }, 422);

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.byteLength > IMAGE_MAX_BYTES) {
    return c.json({ error: `image exceeds the ${IMAGE_MAX_BYTES} byte budget` }, 422);
  }

  let info;
  try {
    info = readImageSize(bytes);
  } catch (err) {
    if (err instanceof InvalidImageError) return c.json({ error: err.message }, 422);
    throw err;
  }

  const stored = await storeAsset(c.get("dataDir"), bytes, info.format === "png" ? "png" : "jpg");
  const id = `img_${randomUUID()}`;

  // At most one live image per level: the previous one is retired here.
  await db.update(levelImages)
    .set({ deletedAt: new Date(), updatedBy: c.get("user").id, updatedAt: new Date() })
    .where(and(eq(levelImages.levelId, levelId), isNull(levelImages.deletedAt)));

  await db.insert(levelImages).values({
    id,
    levelId,
    filename: file.name,
    storagePath: stored.storagePath,
    checksum: stored.checksum,
    widthPx: info.widthPx,
    heightPx: info.heightPx,
    sizeBytes: bytes.byteLength,
    uploadedBy: c.get("user").id,
  });

  const [row] = await db.select().from(levelImages).where(eq(levelImages.id, id));
  return c.json({ image: row }, 201);
});

levelImageRoutes.patch("/:id", async c => {
  const db = c.get("db");
  const body = PatchBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: "expected { expectedVersion, data }" }, 400);

  const id = c.req.param("id");
  const updated = await db.update(levelImages)
    .set({
      ...body.data.data,
      version: body.data.expectedVersion + 1,
      updatedBy: c.get("user").id,
      updatedAt: new Date(),
    })
    // A retired plan is no longer anyone's to change: a save that was queued
    // behind its Replace would otherwise land on a sheet nobody sees.
    .where(and(eq(levelImages.id, id), eq(levelImages.version, body.data.expectedVersion), isNull(levelImages.deletedAt)))
    .returning();

  const row = updated[0];
  if (!row) {
    const [current] = await db.select().from(levelImages).where(eq(levelImages.id, id));
    if (!current || current.deletedAt) return c.json({ error: "not found" }, 404);
    return c.json({ error: "version conflict", current }, 409);
  }
  return c.json({ image: row });
});

levelImageRoutes.delete("/:id", async c => {
  const db = c.get("db");
  await db.update(levelImages)
    .set({ deletedAt: new Date(), updatedBy: c.get("user").id, updatedAt: new Date() })
    .where(eq(levelImages.id, c.req.param("id")));
  return c.body(null, 204);
});

levelImageRoutes.get("/:id/file", async c => {
  const db = c.get("db");
  const [row] = await db.select().from(levelImages).where(eq(levelImages.id, c.req.param("id")));
  if (!row) return c.json({ error: "not found" }, 404);
  const bytes = await readAsset(c.get("dataDir"), row.storagePath);
  return c.body(bytes.buffer as ArrayBuffer, 200, {
    "content-type": row.storagePath.endsWith(".png") ? "image/png" : "image/jpeg",
    "cache-control": "public, max-age=31536000, immutable",
  });
});

/**
 * The PDF a plan was drawn from, kept beside it so any teammate can find rooms
 * in it later (spec §5.3). Checked by its header and its size, and nothing
 * else.
 */
levelImageRoutes.post(
  "/:id/source",
  bodyLimit({ maxSize: PDF_MAX_BYTES + 1024 * 1024, onError: c => c.json({ error: "The PDF is over 50 MB." }, 413) }),
  async c => {
    const db = c.get("db");
    const id = c.req.param("id");
    const form = await c.req.formData().catch(() => null);
    const file = form?.get("file");
    const sheetText = form?.get("sheet");
    const expectedVersion = Number(form?.get("expectedVersion"));
    if (!(file instanceof File) || typeof sheetText !== "string" || !Number.isInteger(expectedVersion) || expectedVersion < 0) {
      return c.json({ error: "expected multipart fields 'file', 'sheet' and 'expectedVersion'" }, 400);
    }
    let sheetJson: unknown = null;
    try {
      sheetJson = JSON.parse(sheetText);
    } catch {
      // Refused just below, as any other sheet the schema will not take.
    }
    const sheet = PlanSheetSchema.safeParse(sheetJson);
    if (!sheet.success) return c.json({ error: "invalid sheet", detail: String(sheet.error) }, 422);

    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.byteLength > PDF_MAX_BYTES) return c.json({ error: "The PDF is over 50 MB." }, 422);
    if (!looksLikePdf(bytes)) return c.json({ error: "not a PDF file" }, 422);

    // A retired plan is no one's to change, as PATCH says; and a stale version
    // is answered before the file is written, so a refused send stores nothing.
    const [image] = await db.select().from(levelImages).where(eq(levelImages.id, id));
    if (!image || image.deletedAt) return c.json({ error: "not found" }, 404);
    if (image.version !== expectedVersion) return c.json({ error: "version conflict", current: image }, 409);

    const stored = await storeAsset(c.get("dataDir"), bytes, "pdf");
    const pdfId = `pdf_${stored.checksum.slice(0, 16)}`;
    const filename = capFilename(file.name);
    // Content-addressed like every stored file: the same PDF sent for two floors is kept once.
    await db.insert(planPdfs).values({
      id: pdfId, filename, storagePath: stored.storagePath, checksum: stored.checksum,
      sizeBytes: bytes.byteLength, uploadedBy: c.get("user").id,
    }).onConflictDoNothing();

    const [row] = await db.update(levelImages)
      .set({
        source: { ...sheet.data, pdfId, checksum: stored.checksum, filename },
        version: expectedVersion + 1,
        updatedBy: c.get("user").id,
        updatedAt: new Date(),
      })
      .where(and(eq(levelImages.id, id), eq(levelImages.version, expectedVersion), isNull(levelImages.deletedAt)))
      .returning();
    if (!row) {
      // Someone saved or replaced the plan in the moment since it was read.
      const [current] = await db.select().from(levelImages).where(eq(levelImages.id, id));
      if (!current || current.deletedAt) return c.json({ error: "not found" }, 404);
      return c.json({ error: "version conflict", current }, 409);
    }
    return c.json({ image: row });
  },
);

levelImageRoutes.get("/:id/source", async c => {
  const db = c.get("db");
  const [row] = await db.select().from(levelImages).where(eq(levelImages.id, c.req.param("id")));
  const pdfId = row?.source?.pdfId;
  if (!pdfId) return c.json({ error: "this plan did not come from a PDF" }, 404);
  const [pdf] = await db.select().from(planPdfs).where(eq(planPdfs.id, pdfId));
  if (!pdf) return c.json({ error: "not found" }, 404);
  const bytes = await readAsset(c.get("dataDir"), pdf.storagePath);
  return c.body(bytes.buffer as ArrayBuffer, 200, {
    "content-type": "application/pdf",
    // A download, never a page: a PDF shown on the app's own origin would run whatever it carries there.
    "content-disposition": `attachment; filename="${attachmentName(pdf.filename)}"`,
    "x-content-type-options": "nosniff",
    "cache-control": "private, no-cache",
  });
});
