import { randomUUID } from "node:crypto";
import { and, asc, eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../app";
import { readAsset, storeAsset } from "../assets/storage";
import { requireUser } from "../auth/middleware";
import { levelImages, levels } from "../db/schema";
import { IMAGE_MAX_BYTES, InvalidImageError, readImageSize } from "./inspect";

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
    .where(and(eq(levelImages.id, id), eq(levelImages.version, body.data.expectedVersion)))
    .returning();

  const row = updated[0];
  if (!row) {
    const [current] = await db.select().from(levelImages).where(eq(levelImages.id, id));
    if (!current) return c.json({ error: "not found" }, 404);
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
