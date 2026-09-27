import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import type { AppEnv } from "../app";
import { readAsset, storeAsset } from "../assets/storage";
import { requireUser } from "../auth/middleware";
import { captures, keyframes, sightings } from "../db/schema";
import { toModelRow } from "../db/rows";
import { IMAGE_MAX_BYTES, InvalidImageError, readImageSize } from "../images/inspect";

/**
 * Keyframes have their own route rather than going through generic entity CRUD,
 * because one arrives as image bytes. A JSON create would be a way to record a
 * frame with no picture behind it, which is the one thing this layer exists to
 * prevent.
 */
export const keyframeRoutes = new Hono<AppEnv>();

/**
 * Retires a capture and everything under it.
 *
 * Deleting only the capture would leave its frames and their labels adrift:
 * still counted toward places, still in the model, reachable from nothing. So
 * the cascade is the behaviour, and it is soft the whole way down.
 */
export const captureRoutes = new Hono<AppEnv>();
captureRoutes.use("*", requireUser);

captureRoutes.delete("/:id", async c => {
  const db = c.get("db");
  const id = c.req.param("id");
  const now = new Date();
  const by = c.get("user").id;

  const [capture] = await db.select().from(captures).where(eq(captures.id, id));
  if (!capture) return c.json({ error: "not found" }, 404);

  const frames = await db.select().from(keyframes)
    .where(and(eq(keyframes.captureId, id), isNull(keyframes.deletedAt)));

  for (const frame of frames) {
    await db.update(sightings)
      .set({ deletedAt: now, updatedBy: by, updatedAt: now })
      .where(and(eq(sightings.keyframeId, frame.id), isNull(sightings.deletedAt)));
  }

  await db.update(keyframes)
    .set({ deletedAt: now, updatedBy: by, updatedAt: now })
    .where(and(eq(keyframes.captureId, id), isNull(keyframes.deletedAt)));

  await db.update(captures)
    .set({ deletedAt: now, updatedBy: by, updatedAt: now })
    .where(eq(captures.id, id));

  return c.json({ frames: frames.length }, 200);
});

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

/**
 * Retires a frame and everything said about it.
 *
 * A soft delete, like every other removal here, so a frame binned by mistake is
 * recoverable. The sightings go with it: a label pointing at a frame nobody can
 * see is worse than no label, because it still counts toward a place.
 */
keyframeRoutes.delete("/:id", async c => {
  const db = c.get("db");
  const id = c.req.param("id");
  const now = new Date();
  const by = c.get("user").id;

  const [row] = await db.select().from(keyframes).where(eq(keyframes.id, id));
  if (!row) return c.json({ error: "not found" }, 404);

  await db.update(sightings)
    .set({ deletedAt: now, updatedBy: by, updatedAt: now })
    .where(and(eq(sightings.keyframeId, id), isNull(sightings.deletedAt)));

  await db.update(keyframes)
    .set({ deletedAt: now, updatedBy: by, updatedAt: now })
    .where(eq(keyframes.id, id));

  return c.body(null, 204);
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
