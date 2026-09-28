import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq, isNull } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { createUser } from "../auth/users";
import type { Database } from "../db/client";
import { buildings, levelImages, levels } from "../db/schema";
import { createTestDb, json } from "../testing/harness";

let db: Database;
let app: ReturnType<typeof createApp>;
let cookie: string;

function png(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

function upload(bytes: Uint8Array, levelId = "oth-L1", filename = "L1.png") {
  const form = new FormData();
  form.append("file", new Blob([bytes]), filename);
  form.append("levelId", levelId);
  return app.request("/api/level-images", { method: "POST", headers: { cookie }, body: form });
}

beforeEach(async () => {
  db = await createTestDb();
  app = createApp({ db, dataDir: await mkdtemp(join(tmpdir(), "oth-img-")) });
  const wei = await createUser(db, { email: "wei@example.com", password: "passphrase", displayName: "Wei" });
  cookie = (await app.request("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ userId: wei.id }),
  })).headers.get("set-cookie") ?? "";
  await db.insert(buildings).values({ id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94, rotationDeg: 0 });
  await db.insert(levels).values({
    id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1,
    nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6,
  });
});

describe("level image routes", () => {
  it("requires authentication", async () => {
    expect((await app.request("/api/level-images")).status).toBe(401);
  });

  it("accepts a PNG and records its dimensions", async () => {
    const res = await upload(png(3000, 2121));
    expect(res.status).toBe(201);
    const { image } = await json<{ image: Record<string, unknown> }>(res);
    expect(image.widthPx).toBe(3000);
    expect(image.heightPx).toBe(2121);
    expect(image.metresPerPixel).toBeNull();
    expect(image.uploadedBy).toMatch(/^user_/);
  });

  it("rejects a file that is not an image with 422, not 500", async () => {
    expect((await upload(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]))).status).toBe(422);
  });

  it("rejects an unknown level", async () => {
    expect((await upload(png(10, 10), "oth-L9")).status).toBe(422);
  });

  it("keeps only one live image per level", async () => {
    await upload(png(100, 100), "oth-L1", "first.png");
    await upload(png(200, 200), "oth-L1", "second.png");
    const live = await db.select().from(levelImages).where(isNull(levelImages.deletedAt));
    expect(live).toHaveLength(1);
    expect(live[0]?.filename).toBe("second.png");
  });

  it("stores calibration through a patch", async () => {
    const { image } = await json<{ image: { id: string } }>(await upload(png(100, 100)));
    const res = await app.request(`/api/level-images/${image.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ expectedVersion: 0, data: { metresPerPixel: 0.071, offsetX: 5, offsetY: -2 } }),
    });
    expect(res.status).toBe(200);
    const [row] = await db.select().from(levelImages).where(eq(levelImages.id, image.id));
    expect(row?.metresPerPixel).toBeCloseTo(0.071);
    expect(row?.offsetX).toBe(5);
    expect(row?.version).toBe(1);
  });

  it("409s a stale calibration patch", async () => {
    const { image } = await json<{ image: { id: string } }>(await upload(png(100, 100)));
    const patch = (expectedVersion: number) =>
      app.request(`/api/level-images/${image.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ expectedVersion, data: { metresPerPixel: 0.1 } }),
      });
    await patch(0);
    expect((await patch(0)).status).toBe(409);
  });

  it("refuses a patch to a plan a newer one has retired, as it does a missing one", async () => {
    const { image: old } = await json<{ image: { id: string } }>(await upload(png(100, 100), "oth-L1", "first.png"));
    await upload(png(200, 200), "oth-L1", "second.png");
    const res = await app.request(`/api/level-images/${old.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ expectedVersion: 0, data: { metresPerPixel: 0.21 } }),
    });
    expect(res.status).toBe(404);
    const [row] = await db.select().from(levelImages).where(eq(levelImages.id, old.id));
    expect(row?.metresPerPixel).toBeNull();
    expect(row?.version).toBe(0);
  });

  it("serves the stored bytes back as an image", async () => {
    const { image } = await json<{ image: { id: string } }>(await upload(png(100, 100)));
    const file = await app.request(`/api/level-images/${image.id}/file`, { headers: { cookie } });
    expect(file.status).toBe(200);
    expect(file.headers.get("content-type")).toBe("image/png");
  });

  it("lists only live images", async () => {
    await upload(png(100, 100), "oth-L1", "first.png");
    await upload(png(200, 200), "oth-L1", "second.png");
    const list = await app.request("/api/level-images", { headers: { cookie } });
    expect((await json<{ items: unknown[] }>(list)).items).toHaveLength(1);
  });

  it("lists in one order every time: last saved last, then by id", async () => {
    // Stored in an order the list must not follow: without an ORDER BY, the
    // database hands rows back as they lie on disk, and an edit moves them.
    const plan = (id: string, updatedAt: string) => ({
      id, levelId: "oth-L1", filename: `${id}.png`, storagePath: `assets/${id}.png`, checksum: id,
      widthPx: 10, heightPx: 10, sizeBytes: 1, updatedAt: new Date(updatedAt),
    });
    await db.insert(levelImages).values(plan("img_z", "2026-09-02T00:00:00Z"));
    await db.insert(levelImages).values(plan("img_b", "2026-09-01T00:00:00Z"));
    await db.insert(levelImages).values(plan("img_a", "2026-09-01T00:00:00Z"));
    const list = await app.request("/api/level-images", { headers: { cookie } });
    const ids = (await json<{ items: { id: string }[] }>(list)).items.map(i => i.id);
    expect(ids).toEqual(["img_a", "img_b", "img_z"]);
  });
});
