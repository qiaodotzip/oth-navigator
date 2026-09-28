import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { storeAsset } from "../assets/storage";
import type { Database } from "../db/client";
import { assets, buildings, levels, publishedVersions } from "../db/schema";
import { createEntity } from "../entities/repository";
import { createTestDb } from "../testing/harness";
import { PublishBlockedError, publish } from "./service";

let db: Database;
let dir: string;

const lobby = {
  id: "L1-lobby", levelId: "oth-L1", kind: "area",
  footprint: [[0, 0], [10, 0], [10, 10], [0, 10]],
  heightM: 6, walkable: true, nameEn: "Lobby", nameZh: "大堂",
};
const entrance = { id: "e-main", levelId: "oth-L1", roomId: "L1-lobby", point: [5, 5] };

beforeEach(async () => {
  db = await createTestDb();
  dir = await mkdtemp(join(tmpdir(), "oth-publish-"));
  await db.insert(buildings).values({ id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94, rotationDeg: 0 });
  await db.insert(levels).values({
    id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1,
    nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6,
  });
});

async function seedPublishable() {
  await createEntity(db, "room", lobby, "user_1");
  await createEntity(db, "entrance", entrance, "user_1");
}

describe("publish", () => {
  it("writes the bundle files to disk", async () => {
    await seedPublishable();
    const result = await publish(db, dir, { createdBy: "user_1", notes: "first" });
    const files = await readdir(join(dir, "published", result.version));
    expect(files.sort()).toEqual(["building.json", "levels", "manifest.json", "nav.json", "placements.json"]);
  });

  it("records the version in the database", async () => {
    await seedPublishable();
    const result = await publish(db, dir, { createdBy: "user_1", notes: "first" });
    const rows = await db.select().from(publishedVersions);
    expect(rows[0]?.id).toBe(result.version);
    expect(rows[0]?.notes).toBe("first");
  });

  it("refuses to publish a model with validation errors", async () => {
    // Walkable room with no entrance → unreachable.
    await createEntity(db, "room", lobby, "user_1");
    await expect(publish(db, dir, { createdBy: "user_1" })).rejects.toBeInstanceOf(PublishBlockedError);
  });

  it("carries the validation report on the block so the editor can list the problems", async () => {
    await createEntity(db, "room", lobby, "user_1");
    await expect(publish(db, dir, { createdBy: "user_1" }))
      .rejects.toMatchObject({ report: expect.objectContaining({ ok: false }) });
  });

  it("writes nothing to disk when publishing is blocked", async () => {
    await createEntity(db, "room", lobby, "user_1");
    await publish(db, dir, { createdBy: "user_1" }).catch(() => {});
    await expect(readdir(join(dir, "published"))).rejects.toThrow();
  });

  it("reports warnings without blocking", async () => {
    await createEntity(db, "room", { ...lobby, nameEn: "", nameZh: "" }, "user_1");
    await createEntity(db, "entrance", entrance, "user_1");
    const result = await publish(db, dir, { createdBy: "user_1" });
    expect(result.warningCount).toBeGreaterThan(0);
  });

  it("points latest at the newest version", async () => {
    await seedPublishable();
    const first = await publish(db, dir, { createdBy: "user_1" });
    const latest = JSON.parse(await readFile(join(dir, "published", "latest.json"), "utf8"));
    expect(latest.version).toBe(first.version);
  });

  it("never puts a level image in the bundle", async () => {
    // Level images are authoring aids. This guards against a later change
    // quietly starting to publish them.
    await seedPublishable();
    const result = await publish(db, dir, { createdBy: "user_1" });
    const files = await readdir(join(dir, "published", result.version));
    expect(files).not.toContain("levelImages.json");
    const building = await readFile(join(dir, "published", result.version, "building.json"), "utf8");
    expect(building).not.toContain("level_images");
  });

  it("writes a level file named by the level code", async () => {
    await seedPublishable();
    const result = await publish(db, dir, { createdBy: "user_1" });
    expect(await readdir(join(dir, "published", result.version, "levels"))).toEqual(["L1.json"]);
  });

  it("copies a kind's model for the objects that show it", async () => {
    await seedPublishable();
    const stored = await storeAsset(dir, new Uint8Array([7, 7, 7]));
    await db.insert(assets).values({
      id: "asset_bin", filename: "wastebin.glb", storagePath: stored.storagePath, checksum: stored.checksum,
      sizeBytes: 3, triangleCount: 12, bbox: { minX: -0.25, minY: -0.25, minZ: 0, maxX: 0.25, maxY: 0.25, maxZ: 1 },
    });
    await createEntity(db, "objectKind", { id: "ok_bin", nameEn: "wastebin", size: { w: 0.5, d: 0.5, h: 1 }, assetId: "asset_bin" }, "user_1");
    await createEntity(db, "placement", { id: "L1-bin-1", levelId: "oth-L1", objectKindId: "ok_bin", position: [5, 5, 0] }, "user_1");
    const result = await publish(db, dir, { createdBy: "user_1" });
    expect(await readdir(join(dir, "published", result.version, "assets"))).toEqual([`${stored.checksum}.glb`]);
  });
});
