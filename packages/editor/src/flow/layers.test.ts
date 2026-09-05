import { parseModel } from "@oth/model";
import { describe, expect, it } from "vitest";
import { levelLayers } from "./layers";

const model = parseModel({
  building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
  levels: [
    { id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6 },
    { id: "oth-L2", buildingId: "oth", code: "L2", ordinal: 2, nameEn: "L2", nameZh: "二楼", elevationM: 6, heightM: 4 },
  ],
  rooms: [
    { id: "L1-lobby", levelId: "oth-L1", kind: "area", footprint: [[0, 0], [10, 0], [10, 10], [0, 10]], heightM: 6, walkable: true, nameEn: "Town Square", nameZh: "广场" },
    { id: "L1-nameless", levelId: "oth-L1", kind: "room", footprint: [[20, 0], [30, 0], [30, 10]], heightM: 3, walkable: true },
    { id: "L2-a", levelId: "oth-L2", kind: "room", footprint: [[0, 0], [5, 0], [5, 5]], heightM: 3, walkable: true },
  ],
  doorways: [
    { id: "L1-door", levelId: "oth-L1", roomA: "L1-lobby", roomB: "L1-nameless", segment: [[10, 4], [10, 6]], widthM: 2 },
  ],
  entrances: [
    { id: "L1-main", levelId: "oth-L1", roomId: "L1-lobby", point: [5, 1], nameEn: "Main Entrance", nameZh: "正门" },
  ],
  portals: [{ id: "p1", kind: "lift", nameEn: "Lift A", nameZh: "A电梯" }],
  portalEndpoints: [
    { id: "p1-L1", portalId: "p1", levelId: "oth-L1", roomId: "L1-lobby", point: [2, 2] },
    { id: "p1-L2", portalId: "p1", levelId: "oth-L2", roomId: "L2-a", point: [2, 2] },
  ],
  assets: [{
    id: "asset_1", filename: "arch.glb", storagePath: "a", checksum: "c",
    sizeBytes: 10, triangleCount: 5,
    bbox: { minX: 0, minY: 0, minZ: 0, maxX: 1, maxY: 1, maxZ: 1 },
  }],
  placements: [{ id: "pl_1", levelId: "oth-L1", assetId: "asset_1", position: [5, 5, 0] }],
});

const groups = (levelId: string | null) =>
  Object.fromEntries(levelLayers(model, levelId).map(g => [g.type, g]));

describe("levelLayers", () => {
  it("keeps every group even when empty, so nothing looks unsupported", () => {
    const g = levelLayers(null, null);
    expect(g.map(x => x.type)).toEqual(["room", "doorway", "entrance", "portalEndpoint", "placement"]);
    expect(g.every(x => x.items.length === 0)).toBe(true);
  });

  it("lists rooms on the active level only", () => {
    expect(groups("oth-L1").room?.items.map(i => i.id)).toEqual(["L1-lobby", "L1-nameless"]);
    expect(groups("oth-L2").room?.items.map(i => i.id)).toEqual(["L2-a"]);
  });

  it("labels a room by its name", () => {
    expect(groups("oth-L1").room?.items[0]?.label).toBe("Town Square");
  });

  it("falls back to the id when a room has no name", () => {
    expect(groups("oth-L1").room?.items[1]?.label).toBe("L1-nameless");
  });

  it("labels a doorway by what it connects, since it has no name of its own", () => {
    expect(groups("oth-L1").doorway?.items[0]?.label).toBe("Town Square ↔ L1-nameless");
  });

  it("labels a portal endpoint by its portal", () => {
    expect(groups("oth-L1").portalEndpoint?.items[0]?.label).toBe("Lift A");
  });

  it("labels a placement by its asset filename", () => {
    expect(groups("oth-L1").placement?.items[0]?.label).toBe("arch.glb");
  });

  it("marks only named entities as renamable", () => {
    const g = groups("oth-L1");
    expect(g.room?.items[0]?.renamable).toBe(true);
    expect(g.entrance?.items[0]?.renamable).toBe(true);
    expect(g.doorway?.items[0]?.renamable).toBe(false);
    expect(g.placement?.items[0]?.renamable).toBe(false);
  });

  it("carries the version, so delete and rename can be optimistically locked", () => {
    expect(groups("oth-L1").room?.items[0]?.version).toBe(0);
  });

  it("scopes portal endpoints to the level, not the portal", () => {
    expect(groups("oth-L1").portalEndpoint?.items.map(i => i.id)).toEqual(["p1-L1"]);
  });
});
