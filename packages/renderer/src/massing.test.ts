import { RoomSchema, type Room } from "@oth/model";
import { describe, expect, it } from "vitest";
import { SLAB_HEIGHT_M } from "./geometry";
import { massingHeight, massingOf } from "./massing";
import { shellWalls } from "./shell";

function room(over: Partial<Room> = {}): Room {
  return RoomSchema.parse({
    id: "r1", levelId: "oth-L1", kind: "room", heightM: 4.5,
    footprint: [[0, 0], [4, 0], [4, 3], [0, 3]],
    ...over,
  });
}

describe("massing", () => {
  it("raises walls around an enclosed room", () => {
    expect(massingOf(room({ kind: "room" }))).toBe("shell");
    expect(massingOf(room({ kind: "service" }))).toBe("shell");
  });

  it("leaves floor you cross as floor", () => {
    // The whole distinction between arriving in a space and walking over it.
    expect(massingOf(room({ kind: "area" }))).toBe("slab");
    expect(massingHeight(room({ kind: "area" }))).toBe(SLAB_HEIGHT_M);
  });

  it("builds a detail solid, to its own height", () => {
    const column = room({ kind: "detail", heightM: 5 });
    expect(massingOf(column)).toBe("solid");
    expect(massingHeight(column)).toBe(5);
  });

  it("builds nothing for a void", () => {
    expect(massingOf(room({ kind: "void" }))).toBe("none");
  });
});

describe("shellWalls", () => {
  it("stands a box on every edge of the boundary", () => {
    const g = shellWalls(room());
    const count = g.getAttribute("position").count;
    // Four edges, each a box of four sides plus a cap: 5 quads, 2 triangles,
    // 3 vertices.
    expect(count).toBe(4 * 5 * 6);
  });

  it("reaches the height it was asked for, and no further", () => {
    const g = shellWalls(room(), { heightM: 4.5 });
    const pos = g.getAttribute("position");
    let top = 0;
    for (let i = 0; i < pos.count; i++) top = Math.max(top, pos.getY(i));
    expect(top).toBeCloseTo(4.5, 5);
  });

  it("gives the wall thickness, so it does not vanish edge-on", () => {
    const g = shellWalls(room(), { thicknessM: 0.4 });
    const pos = g.getAttribute("position");
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      min = Math.min(min, pos.getX(i));
      max = Math.max(max, pos.getX(i));
    }
    // The footprint spans x 0..4; walls straddle it by half the thickness.
    expect(min).toBeCloseTo(-0.2, 5);
    expect(max).toBeCloseTo(4.2, 5);
  });

  it("walls a courtyard's inner edge as well as its outer one", () => {
    const withHole = room({
      footprint: [[0, 0], [10, 0], [10, 10], [0, 10]],
      holes: [[[3, 3], [6, 3], [6, 6], [3, 6]]],
    });
    expect(shellWalls(withHole).getAttribute("position").count)
      .toBe(shellWalls(room({ footprint: withHole.footprint })).getAttribute("position").count * 2);
  });

  it("skips a repeated point rather than building a wall of no length", () => {
    const doubled = room({ footprint: [[0, 0], [4, 0], [4, 0], [4, 3], [0, 3]] });
    expect(shellWalls(doubled).getAttribute("position").count).toBe(4 * 5 * 6);
  });
});
