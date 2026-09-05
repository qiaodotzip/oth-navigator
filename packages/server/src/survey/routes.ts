import { randomUUID } from "node:crypto";
import { eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import type { AppEnv } from "../app";
import { readAsset, storeAsset } from "../assets/storage";
import { requireUser } from "../auth/middleware";
import { captures, keyframes } from "../db/schema";
import { toModelRow } from "../db/rows";
import { IMAGE_MAX_BYTES, InvalidImageError, readImageSize } from "../images/inspect";

/**
 * Keyframes have their own route rather than going through generic entity CRUD,
 * because one arrives as image bytes. A JSON create would be a way to record a
 * frame with no picture behind it, which is the one thing this layer exists to
 * prevent.
 */
export const keyframeRoutes = new Hono<AppEnv>();

keyframeRoutes.use("*", requireUser);

keyframeRoutes.get("/", async c =>
  c.json({
    items: (await c.get("db").select().from(keyframes).where(isNull(keyframes.deletedAt)))
      .map(toModelRow),
  }),
);

keyframeRoutes.post("/", async c => {
  const db = c.get("db");
  const form = await c.req.formData().catch(() => null);
  const file = form?.get("file");
  const captureId = form?.get("captureId");
  const timeMsRaw = form?.get("timeMs");

  if (!(file instanceof File) || typeof captureId !== "string") {
    return c.json({ error: "expected multipart fields 'file' and 'captureId'" }, 400);
  }

  const capture = (await db.select().from(captures).where(eq(captures.id, captureId)))[0];
  if (!capture) return c.json({ error: `no such capture: ${captureId}` }, 422);

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.byteLength > IMAGE_MAX_BYTES) {
    return c.json({ error: `frame exceeds the ${IMAGE_MAX_BYTES} byte budget` }, 422);
  }

  let info;
  try {
    info = readImageSize(bytes);
  } catch (err) {
    if (err instanceof InvalidImageError) return c.json({ error: err.message }, 422);
    throw err;
  }

  const stored = await storeAsset(c.get("dataDir"), bytes, info.format === "png" ? "png" : "jpg");
  const id = `kf_${randomUUID()}`;
  const timeMs = typeof timeMsRaw === "string" && timeMsRaw !== "" ? Number(timeMsRaw) : null;

  await db.insert(keyframes).values({
    id,
    captureId,
    // A photo has no timeline, and a bad number must not become NaN in the row.
    timeMs: timeMs !== null && Number.isFinite(timeMs) ? timeMs : null,
    imageId: id,
    storagePath: stored.storagePath,
    checksum: stored.checksum,
    widthPx: info.widthPx,
    heightPx: info.heightPx,
    sizeBytes: bytes.byteLength,
    updatedBy: c.get("user").id,
  });

  const [row] = await db.select().from(keyframes).where(eq(keyframes.id, id));
  return c.json({ keyframe: toModelRow(row!) }, 201);
});

keyframeRoutes.get("/:id/file", async c => {
  const db = c.get("db");
  const [row] = await db.select().from(keyframes).where(eq(keyframes.id, c.req.param("id")));
  if (!row) return c.json({ error: "not found" }, 404);
  const bytes = await readAsset(c.get("dataDir"), row.storagePath);
  return c.body(bytes.buffer as ArrayBuffer, 200, {
    "content-type": row.storagePath.endsWith(".png") ? "image/png" : "image/jpeg",
    "cache-control": "public, max-age=31536000, immutable",
  });
});
