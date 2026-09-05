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

describe("bakeNavGrid — pathways", () => {
  function gridWith(rooms: unknown[], pathways: unknown[], doorways: unknown[] = []) {
    return bakeNavGrid(
      parseModel({ building, levels: [level], rooms, doorways, pathways }),
      "oth-L1",
    );
  }

  const path = { id: "L1-path", levelId: "oth-L1", polyline: [[5, 5], [15, 5]], widthM: 2 };

  it("opens the cells along its centre line", () => {
    expect(navGridWalkableAt(gridWith([roomA, roomB], [path]), [10, 5])).toBe(true);
  });

  it("carves straight through a wall between two rooms, with no doorway", () => {
    // The whole point: a doorway needs the footprints to abut exactly, and a
    // pathway does not.
    const g = gridWith([roomA, roomB], [path]);
    expect(navGridWalkableAt(g, [9.9, 5])).toBe(true);
    expect(navGridWalkableAt(g, [10.1, 5])).toBe(true);
  });

  it("opens cells outside every room, unlike a doorway", () => {
    const outside = { ...path, polyline: [[-8, 5], [-2, 5]] };
    expect(navGridWalkableAt(gridWith([roomA], [outside]), [-5, 5])).toBe(true);
  });

  it("respects its width", () => {
    expect(navGridWalkableAt(gridWith([roomA, roomB], [{ ...path, widthM: 6 }]), [10, 7.5])).toBe(true);
    expect(navGridWalkableAt(gridWith([roomA, roomB], [path]), [10, 7.5])).toBe(false);
  });

  it("wins over the wall band, because it is carved last", () => {
    const alongWall = { ...path, polyline: [[10, 0], [10, 10]], widthM: 1 };
    expect(navGridWalkableAt(gridWith([roomA, roomB], [alongWall]), [10, 2])).toBe(true);
  });

  it("extends the grid to cover a pathway outside the rooms", () => {
    const far = { ...path, polyline: [[40, 5], [60, 5]] };
    expect(navGridWalkableAt(gridWith([roomA], [far]), [50, 5])).toBe(true);
  });

  it("bakes a level that has only a pathway and no rooms at all", () => {
    // The state a level is in the moment someone starts drawing.
    const g = gridWith([], [path]);
    expect(g.cols).toBeGreaterThan(0);
    expect(navGridWalkableAt(g, [10, 5])).toBe(true);
  });

  it("ignores a soft-deleted pathway", () => {
    const g = gridWith([roomA], [{ ...path, deletedAt: "2026-09-01T00:00:00.000Z" }]);
    expect(navGridWalkableAt(g, [12, 5])).toBe(false);
  });

  it("ignores a pathway on another level", () => {
    const g = gridWith([roomA], [{ ...path, levelId: "oth-L9" }]);
    expect(navGridWalkableAt(g, [12, 5])).toBe(false);
  });
});

describe("bakeNavGrid — cost", () => {
  function bigModel(roomCount: number) {
    const rooms = Array.from({ length: roomCount }, (_, i) => ({
      id: `L1-r${i}`, levelId: "oth-L1", kind: "room",
      // Spread along a 180 m frontage, as shop units are.
      footprint: [[i * 6, 0], [i * 6 + 5, 0], [i * 6 + 5, 8], [i * 6, 8]],
      heightM: 3, walkable: true,
    }));
    return parseModel({ building, levels: [level], rooms });
  }

  it("stays under a second for a floor's worth of units", () => {
    // The old bake scanned every cell of the whole grid once per room.
    const model = bigModel(30);
    const t0 = performance.now();
    bakeNavGrid(model, "oth-L1");
    expect(performance.now() - t0).toBeLessThan(1000);
  });

  it("keeps every unit's interior open", () => {
    // The optimisation changes which cells we visit, never which end up open.
    // Asserted from the geometry so the lock does not depend on the code.
    const g = bakeNavGrid(bigModel(6), "oth-L1");
    for (let i = 0; i < 6; i++) {
      expect(navGridWalkableAt(g, [i * 6 + 2.5, 4])).toBe(true);
    }
  });

  it("keeps the gaps between units closed", () => {
    // Units span x = i*6 .. i*6+5, so x = i*6+5.5 is the gap between them.
    const g = bakeNavGrid(bigModel(6), "oth-L1");
    for (let i = 0; i < 5; i++) {
      expect(navGridWalkableAt(g, [i * 6 + 5.5, 4])).toBe(false);
    }
  });
});

describe("bakeNavGrid — details", () => {
  it("gives a detail no cells, walkable or blocked", () => {
    // A vending machine is furniture. Blocking routes on approximate geometry
    // is a worse failure than a route that clips a bench.
    const area = {
      id: "L1-sq", levelId: "oth-L1", kind: "area",
      footprint: [[0, 0], [20, 0], [20, 20], [0, 20]], heightM: 6, walkable: true,
    };
    const detail = {
      id: "L1-vend", levelId: "oth-L1", kind: "detail",
      footprint: [[8, 8], [12, 8], [12, 12], [8, 12]], heightM: 1.9, walkable: false,
    };
    const g = bakeNavGrid(parseModel({ building, levels: [level], rooms: [area, detail] }), "oth-L1");
    expect(navGridWalkableAt(g, [10, 10])).toBe(true);
  });
});
