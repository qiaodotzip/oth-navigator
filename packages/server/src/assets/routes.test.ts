import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Document, NodeIO } from "@gltf-transform/core";
import { ASSET_MAX_TRIANGLES } from "@oth/model";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { createUser } from "../auth/users";
import type { Database } from "../db/client";
import { createTestDb, json } from "../testing/harness";

let db: Database;
let app: ReturnType<typeof createApp>;
let cookie: string;

/**
 * Indexed geometry, so a high triangle count stays well under the byte budget —
 * otherwise the size check would fire first and we would not be testing the
 * triangle check at all.
 */
async function triangleGlb(count: number): Promise<Uint8Array> {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const position = doc.createAccessor()
    .setArray(new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0]))
    .setType("VEC3")
    .setBuffer(buffer);
  const indices = doc.createAccessor()
    .setArray(new Uint32Array(Array.from({ length: count * 3 }, (_, i) => i % 3)))
    .setType("SCALAR")
    .setBuffer(buffer);
  const prim = doc.createPrimitive().setAttribute("POSITION", position).setIndices(indices);
  doc.createScene().addChild(doc.createNode().setMesh(doc.createMesh().addPrimitive(prim)));
  return new NodeIO().writeBinary(doc);
}

function upload(bytes: Uint8Array, filename = "arch.glb") {
  const form = new FormData();
  form.append("file", new Blob([bytes]), filename);
  return app.request("/api/assets", { method: "POST", headers: { cookie }, body: form });
}

beforeEach(async () => {
  db = await createTestDb();
  app = createApp({ db, dataDir: await mkdtemp(join(tmpdir(), "oth-assets-routes-")) });
  const wei = await createUser(db, { email: "wei@example.com", password: "passphrase", displayName: "Wei" });
  cookie = (await app.request("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ userId: wei.id }),
  })).headers.get("set-cookie") ?? "";
});

describe("asset routes", () => {
  it("requires authentication", async () => {
    expect((await app.request("/api/assets")).status).toBe(401);
  });

  it("accepts a valid glb and records its stats", async () => {
    const res = await upload(await triangleGlb(2));
    expect(res.status).toBe(201);
    const { asset } = await json<{ asset: Record<string, unknown> }>(res);
    expect(asset.triangleCount).toBe(2);
    expect(asset.checksum).toMatch(/^[0-9a-f]{64}$/);
    expect(asset.uploadedBy).toMatch(/^user_/);
  });

  it("rejects a file that is not a glb with 422, not 500", async () => {
    expect((await upload(new Uint8Array([1, 2, 3]))).status).toBe(422);
  });

  it("rejects an upload over the triangle budget", async () => {
    const res = await upload(await triangleGlb(ASSET_MAX_TRIANGLES + 1));
    expect(res.status).toBe(422);
    expect((await json<{ error: string }>(res)).error).toMatch(/triangle/i);
  });

  it("serves the stored bytes back", async () => {
    const { asset } = await json<{ asset: { id: string } }>(await upload(await triangleGlb(1)));
    const file = await app.request(`/api/assets/${asset.id}/file`, { headers: { cookie } });
    expect(file.status).toBe(200);
    expect(file.headers.get("content-type")).toBe("model/gltf-binary");
  });

  it("lists uploaded assets", async () => {
    await upload(await triangleGlb(1));
    const list = await app.request("/api/assets", { headers: { cookie } });
    expect((await json<{ items: unknown[] }>(list)).items).toHaveLength(1);
  });
});
