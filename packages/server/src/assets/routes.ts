import { randomUUID } from "node:crypto";
import { ASSET_MAX_BYTES, ASSET_MAX_TRIANGLES } from "@oth/model";
import { eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import type { AppEnv } from "../app";
import { requireUser } from "../auth/middleware";
import { assets } from "../db/schema";
import { InvalidAssetError, inspectGlb } from "./inspect";
import { readAsset, storeAsset } from "./storage";

export const assetRoutes = new Hono<AppEnv>();

assetRoutes.use("*", requireUser);

assetRoutes.get("/", async c =>
  c.json({ items: await c.get("db").select().from(assets).where(isNull(assets.deletedAt)) }),
);

assetRoutes.post("/", async c => {
  const form = await c.req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return c.json({ error: "expected a multipart 'file' field" }, 400);

  const bytes = new Uint8Array(await file.arrayBuffer());

  // Budgets come from @oth/model so editor, server and publish agree.
  if (bytes.byteLength > ASSET_MAX_BYTES) {
    return c.json({ error: `asset exceeds the ${ASSET_MAX_BYTES} byte size budget` }, 422);
  }

  let stats;
  try {
    stats = await inspectGlb(bytes);
  } catch (err) {
    if (err instanceof InvalidAssetError) return c.json({ error: err.message }, 422);
    throw err;
  }

  if (stats.triangleCount > ASSET_MAX_TRIANGLES) {
    return c.json({ error: `asset exceeds the ${ASSET_MAX_TRIANGLES} triangle budget` }, 422);
  }

  const stored = await storeAsset(c.get("dataDir"), bytes);
  const id = `asset_${randomUUID()}`;
  await c.get("db").insert(assets).values({
    id,
    filename: file.name,
    storagePath: stored.storagePath,
    checksum: stored.checksum,
    sizeBytes: bytes.byteLength,
    triangleCount: stats.triangleCount,
    bbox: stats.bbox,
    uploadedBy: c.get("user").id,
  });

  const [row] = await c.get("db").select().from(assets).where(eq(assets.id, id));
  return c.json({ asset: row }, 201);
});

assetRoutes.get("/:id/file", async c => {
  const [row] = await c.get("db").select().from(assets).where(eq(assets.id, c.req.param("id")));
  if (!row) return c.json({ error: "not found" }, 404);
  const bytes = await readAsset(c.get("dataDir"), row.storagePath);
  return c.body(bytes.buffer as ArrayBuffer, 200, {
    "content-type": "model/gltf-binary",
    "content-disposition": `inline; filename="${row.filename}"`,
  });
});
