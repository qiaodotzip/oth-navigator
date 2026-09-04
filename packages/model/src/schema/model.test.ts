import { describe, expect, it } from "vitest";
import { emptyModel, parseModel } from "./model";

describe("emptyModel", () => {
  it("produces a model with every collection present and empty", () => {
    const m = emptyModel({
      id: "oth",
      name: "Our Tampines Hub",
      anchorLat: 1.3531,
      anchorLng: 103.9447,
    });
    expect(m.levels).toEqual([]);
    expect(m.rooms).toEqual([]);
    expect(m.doorways).toEqual([]);
    expect(m.entrances).toEqual([]);
    expect(m.portals).toEqual([]);
    expect(m.portalEndpoints).toEqual([]);
    expect(m.navHints).toEqual([]);
    expect(m.assets).toEqual([]);
    expect(m.placements).toEqual([]);
    expect(m.tenants).toEqual([]);
  });
});

describe("parseModel", () => {
  const raw = {
    building: {
      id: "oth",
      name: "Our Tampines Hub",
      anchorLat: 1.3531,
      anchorLng: 103.9447,
    },
    levels: [
      {
        id: "oth-L1",
        buildingId: "oth",
        code: "L1",
        ordinal: 1,
        nameEn: "Level 1",
        nameZh: "一楼",
        elevationM: 0,
        heightM: 6,
      },
    ],
    rooms: [
      {
        id: "L1-corridor-main",
        levelId: "oth-L1",
        kind: "corridor",
        footprint: [[0, 0], [20, 0], [20, 4], [0, 4]],
        heightM: 6,
        walkable: true,
      },
    ],
  };

  it("fills every missing collection with an empty array", () => {
    const m = parseModel(raw);
    expect(m.rooms).toHaveLength(1);
    expect(m.tenants).toEqual([]);
  });

  it("applies nested defaults through the whole tree", () => {
    const room = parseModel(raw).rooms[0];
    expect(room?.holes).toEqual([]);
    expect(room?.verification.status).toBe("unverified");
  });

  it("throws on a structurally invalid model", () => {
    expect(() => parseModel({ ...raw, levels: [{ id: "bad" }] })).toThrow();
  });
});
