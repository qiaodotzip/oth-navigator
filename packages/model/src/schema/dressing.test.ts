import { describe, expect, it } from "vitest";
import { AssetSchema, PlacementSchema } from "./dressing";

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
});
