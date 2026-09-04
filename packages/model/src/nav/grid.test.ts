import { describe, expect, it } from "vitest";
import { parseModel } from "../schema/model";
import { bakeNavGrid, navGridWalkableAt } from "./grid";

const building = { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 };
const level = {
  id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1,
  nameEn: "Level 1", nameZh: "一楼", elevationM: 0, heightM: 6,
};

const roomA = {
  id: "L1-room-a", levelId: "oth-L1", kind: "room",
  footprint: [[0, 0], [10, 0], [10, 10], [0, 10]], heightM: 3.5, walkable: true,
};

const roomB = {
  id: "L1-room-b", levelId: "oth-L1", kind: "room",
  footprint: [[10, 0], [20, 0], [20, 10], [10, 10]], heightM: 3.5, walkable: true,
};

function grid(rooms: unknown[]) {
  return bakeNavGrid(parseModel({ building, levels: [level], rooms }), "oth-L1");
}

describe("bakeNavGrid", () => {
  it("marks the interior of a walkable room as walkable", () => {
    expect(navGridWalkableAt(grid([roomA]), [5, 5])).toBe(true);
  });

  it("marks the area outside every room as blocked", () => {
    expect(navGridWalkableAt(grid([roomA]), [-5, 5])).toBe(false);
  });

  it("blocks a band along the room boundary — that band is the wall", () => {
    expect(navGridWalkableAt(grid([roomA]), [0.05, 5])).toBe(false);
  });

  it("keeps a point one metre inside walkable", () => {
    expect(navGridWalkableAt(grid([roomA]), [1, 5])).toBe(true);
  });

  it("does not rasterise a non-walkable room", () => {
    expect(navGridWalkableAt(grid([{ ...roomA, walkable: false }]), [5, 5])).toBe(false);
  });

  it("blocks the inside of a hole — an atrium void is not floor", () => {
    const withHole = { ...roomA, holes: [[[4, 4], [6, 4], [6, 6], [4, 6]]] };
    expect(navGridWalkableAt(grid([withHole]), [5, 5])).toBe(false);
    expect(navGridWalkableAt(grid([withHole]), [1, 1])).toBe(true);
  });

  it("separates two abutting rooms when no doorway joins them", () => {
    const g = grid([roomA, roomB]);
    expect(navGridWalkableAt(g, [9.9, 5])).toBe(false);
    expect(navGridWalkableAt(g, [10.1, 5])).toBe(false);
    expect(navGridWalkableAt(g, [5, 5])).toBe(true);
    expect(navGridWalkableAt(g, [15, 5])).toBe(true);
  });

  it("produces an empty grid for a level with no walkable rooms", () => {
    const g = grid([]);
    expect(g.cols).toBe(0);
    expect(g.rows).toBe(0);
  });

  it("uses the 0.25 m cell size from the spec", () => {
    expect(grid([roomA]).cellSizeM).toBe(0.25);
  });

  it("ignores soft-deleted rooms", () => {
    const g = grid([{ ...roomA, deletedAt: "2026-09-01T00:00:00.000Z" }]);
    expect(g.cols).toBe(0);
  });
});

describe("bakeNavGrid — doorways", () => {
  function gridWithDoorways(rooms: unknown[], doorways: unknown[]) {
    return bakeNavGrid(parseModel({ building, levels: [level], rooms, doorways }), "oth-L1");
  }

  const doorway = {
    id: "L1-door-ab", levelId: "oth-L1", roomA: "L1-room-a", roomB: "L1-room-b",
    segment: [[10, 4], [10, 6]], widthM: 2,
  };

  it("opens the wall along the doorway segment", () => {
    const g = gridWithDoorways([roomA, roomB], [doorway]);
    expect(navGridWalkableAt(g, [10, 5])).toBe(true);
    expect(navGridWalkableAt(g, [9.9, 5])).toBe(true);
    expect(navGridWalkableAt(g, [10.1, 5])).toBe(true);
  });

  it("leaves the wall closed away from the doorway", () => {
    const g = gridWithDoorways([roomA, roomB], [doorway]);
    expect(navGridWalkableAt(g, [10, 1])).toBe(false);
    expect(navGridWalkableAt(g, [10, 9])).toBe(false);
  });

  it("opens a wide opening for open-plan boundaries", () => {
    const wide = { ...doorway, segment: [[10, 0], [10, 10]], widthM: 10 };
    const g = gridWithDoorways([roomA, roomB], [wide]);
    expect(navGridWalkableAt(g, [10, 2])).toBe(true);
    expect(navGridWalkableAt(g, [10, 8])).toBe(true);
  });

  it("does not open cells outside both of its rooms", () => {
    const g = gridWithDoorways([roomA, roomB], [doorway]);
    expect(navGridWalkableAt(g, [10, 12])).toBe(false);
  });

  it("ignores a soft-deleted doorway", () => {
    const g = gridWithDoorways([roomA, roomB], [{ ...doorway, deletedAt: "2026-09-01T00:00:00.000Z" }]);
    expect(navGridWalkableAt(g, [10, 5])).toBe(false);
  });
});
