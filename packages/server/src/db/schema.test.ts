import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createTestDb } from "../testing/harness";
import { buildings, floorSetup, levelImages, levels, objectKinds, placements, places, rooms } from "./schema";

describe("entity tables", () => {
  it("round-trips a room with a jsonb footprint", async () => {
    const db = await createTestDb();
    await db.insert(buildings).values({
      id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94, rotationDeg: 0,
    });
    await db.insert(levels).values({
      id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1,
      nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6,
    });
    await db.insert(rooms).values({
      id: "L1-lobby", levelId: "oth-L1", kind: "area",
      footprint: [[0, 0], [10, 0], [10, 10], [0, 10]],
      holes: [], heightM: 6, walkable: true,
      nameEn: "Lobby", nameZh: "大堂",
      verification: { status: "unverified", evidence: [] },
    });

    const [row] = await db.select().from(rooms).where(eq(rooms.id, "L1-lobby"));
    expect(row?.footprint).toEqual([[0, 0], [10, 0], [10, 10], [0, 10]]);
    expect(row?.version).toBe(0);
    expect(row?.deletedAt).toBeNull();
  });

  it("defaults version to 0 so the first optimistic update expects 0", async () => {
    const db = await createTestDb();
    await db.insert(buildings).values({
      id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94, rotationDeg: 0,
    });
    const [row] = await db.select().from(buildings);
    expect(row?.version).toBe(0);
  });
});

describe("levelImages", () => {
  it("round-trips an uncalibrated image", async () => {
    const db = await createTestDb();
    await db.insert(buildings).values({
      id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94, rotationDeg: 0,
    });
    await db.insert(levels).values({
      id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1,
      nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6,
    });
    await db.insert(levelImages).values({
      id: "img_1", levelId: "oth-L1", filename: "L1.jpg",
      storagePath: "assets/ab/abc.jpg", checksum: "abc",
      widthPx: 3000, heightPx: 2121, sizeBytes: 1234,
    });

    const [row] = await db.select().from(levelImages).where(eq(levelImages.id, "img_1"));
    expect(row?.widthPx).toBe(3000);
    // Uncalibrated until someone measures against a known dimension.
    expect(row?.metresPerPixel).toBeNull();
    expect(row?.offsetX).toBe(0);
    expect(row?.opacity).toBeCloseTo(0.6);
    expect(row?.version).toBe(0);
  });
});

describe("objects", () => {
  it("round-trips a kind of object with its size, and no model yet", async () => {
    const db = await createTestDb();
    await db.insert(objectKinds).values({ id: "ok_bin", nameEn: "wastebin", size: { w: 0.5, d: 0.5, h: 1 } });
    const [row] = await db.select().from(objectKinds);
    expect(row).toMatchObject({ nameZh: "", notes: "", assetId: null, size: { w: 0.5, d: 0.5, h: 1 }, version: 0 });
  });

  it("keeps an object with a kind and no model of its own, with no survey tags yet", async () => {
    const db = await createTestDb();
    await db.insert(placements).values({ id: "L1-bin-1", levelId: "oth-L1", objectKindId: "ok_bin", position: [1, 2, 0] });
    const [row] = await db.select().from(placements);
    expect(row?.assetId).toBeNull();
    expect(row?.sightingIds).toEqual([]);
  });

  it("refuses, in the database itself, a placement with neither a model nor a kind", async () => {
    const db = await createTestDb();
    await expect(db.insert(placements).values({ id: "L1-x", levelId: "oth-L1", position: [1, 2, 0] }))
      .rejects.toThrow(/placements_asset_or_kind/);
  });

  it("marks a place as a kind of object", async () => {
    const db = await createTestDb();
    await db.insert(places).values({ id: "pl_bin", nameEn: "wastebin", category: "facility", objectKindId: "ok_bin" });
    const [row] = await db.select().from(places);
    expect(row?.objectKindId).toBe("ok_bin");
  });
});

describe("floorSetup", () => {
  it("starts a step open, with no note and nobody's name on it", async () => {
    const db = await createTestDb();
    await db.insert(floorSetup).values({ levelId: "oth-L1", step: 2 });
    const [row] = await db.select().from(floorSetup);
    expect(row).toEqual({
      levelId: "oth-L1", step: 2, status: "open", note: "", finishedBy: null, finishedVia: null, finishedAt: null,
    });
  });

  it("holds one row per floor and step", async () => {
    const db = await createTestDb();
    await db.insert(floorSetup).values({ levelId: "oth-L1", step: 2 });
    await db.insert(floorSetup).values({ levelId: "oth-L2", step: 2 });
    await expect(db.insert(floorSetup).values({ levelId: "oth-L1", step: 2 })).rejects.toThrow(/duplicate key/);
  });
});
