import { describe, expect, it } from "vitest";
import { AssetSchema, ObjectKindSchema, PlacementSchema } from "./dressing";

describe("AssetSchema", () => {
  const asset = {
    id: "asset-library-arch",
    filename: "library-arch.glb",
    storagePath: "assets/9f2a.glb",
    checksum: "9f2a1b3c",
    sizeBytes: 1_240_000,
    triangleCount: 48_000,
    bbox: { minX: 0, minY: 0, minZ: 0, maxX: 6, maxY: 3, maxZ: 4 },
  };

  it("accepts an asset within budget", () => {
    expect(AssetSchema.parse(asset).triangleCount).toBe(48_000);
  });

  it("rejects an asset over the 5 MB budget", () => {
    expect(() => AssetSchema.parse({ ...asset, sizeBytes: 6_000_000 })).toThrow();
  });

  it("rejects an asset over the 150k triangle budget", () => {
    expect(() => AssetSchema.parse({ ...asset, triangleCount: 150_001 })).toThrow();
  });
});

describe("PlacementSchema", () => {
  const placement = {
    id: "L2-place-library-arch",
    levelId: "oth-L2",
    assetId: "asset-library-arch",
    roomId: "L2-room-library",
    position: [12, 40, 0],
  };

  it("accepts a placement and defaults rotation and scale", () => {
    const p = PlacementSchema.parse(placement);
    expect(p.rotationDeg).toBe(0);
    expect(p.scale).toBe(1);
  });

  it("rejects a non-positive scale", () => {
    expect(() => PlacementSchema.parse({ ...placement, scale: 0 })).toThrow();
  });

  it("accepts an object: a kind and no model of its own, and no survey tags yet", () => {
    const p = PlacementSchema.parse({ id: "L1-bin-1", levelId: "oth-L1", objectKindId: "ok_wastebin", position: [3, 4, 0] });
    expect(p.assetId).toBeUndefined();
    expect(p.objectKindId).toBe("ok_wastebin");
    expect(p.sightingIds).toEqual([]);
  });

  it("leaves 'an asset or a kind' to validation, so a partial update still parses", () => {
    // The entity registry and updateEntity need a plain object schema (interfaces.md).
    expect(() => PlacementSchema.parse({ id: "L1-x", levelId: "oth-L1", position: [0, 0, 0] })).not.toThrow();
  });
});

describe("ObjectKindSchema", () => {
  const bin = { id: "ok_wastebin", nameEn: "wastebin", size: { w: 0.5, d: 0.5, h: 1 } };

  it("needs only a name and a size, and has no model until one is made", () => {
    const kind = ObjectKindSchema.parse(bin);
    expect(kind).toMatchObject({ nameZh: "", notes: "", version: 0 });
    expect(kind.assetId).toBeUndefined();
  });

  it("refuses a side that is zero, negative or not a number", () => {
    for (const size of [{ ...bin.size, w: 0 }, { ...bin.size, d: -0.5 }, { ...bin.size, h: Number.POSITIVE_INFINITY }]) {
      expect(() => ObjectKindSchema.parse({ ...bin, size })).toThrow();
    }
  });

  it("refuses a kind with no name", () => {
    expect(() => ObjectKindSchema.parse({ ...bin, nameEn: "" })).toThrow();
  });
});
