import { RoomSchema, type Room } from "@oth/model";
import { describe, expect, it } from "vitest";
import { DEFAULT_WALL_M, wallPieces, type WallPiece } from "./wallPlan";

function room(id: string, footprint: Array<[number, number]>, holes: Array<Array<[number, number]>> = []): Room {
  return RoomSchema.parse({ id, levelId: "oth-L1", kind: "room", heightM: 3.5, footprint, holes });
}
const box = (id: string, x0: number, y0: number, x1: number, y1: number) =>
  room(id, [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]);

const shared = (pieces: WallPiece[]) => pieces.filter(p => p.rooms.length === 2);
const length = (p: WallPiece) => Math.hypot(p.b[0] - p.a[0], p.b[1] - p.a[1]);
const lengthFor = (pieces: WallPiece[], id: string) =>
  pieces.filter(p => p.rooms.includes(id)).reduce((sum, p) => sum + length(p), 0);

describe("wallPieces", () => {
  it("walls a room on its own on every edge, a courtyard's included", () => {
    const courtyard = room("L1-a", [[0, 0], [10, 0], [10, 10], [0, 10]], [[[3, 3], [6, 3], [6, 6], [3, 6]]]);
    const pieces = wallPieces([courtyard]);
    expect(pieces).toHaveLength(8);
    expect(pieces.every(p => p.thicknessM === DEFAULT_WALL_M && p.rooms.join() === "L1-a")).toBe(true);
  });

  it("builds one wall where two rooms share an edge, not two", () => {
    const pieces = wallPieces([box("L1-a", 0, 0, 4, 3), box("L1-b", 4, 0, 8, 3)]);
    expect(pieces).toHaveLength(7);
    const [wall] = shared(pieces);
    expect([...wall!.rooms].sort()).toEqual(["L1-a", "L1-b"]);
    expect(wall!.a[0]).toBeCloseTo(4);
    expect(wall!.b[0]).toBeCloseTo(4);
    expect(length(wall!)).toBeCloseTo(3);
    expect(wall!.thicknessM).toBe(DEFAULT_WALL_M);
  });

  it("stands the shared wall midway across the drawing's gap, as thick as the gap", () => {
    const pieces = wallPieces([box("L1-a", 0, 0, 4, 3), box("L1-b", 4.3, 0, 8, 3)]);
    const [wall] = shared(pieces);
    expect(wall!.a[0]).toBeCloseTo(4.15);
    expect(wall!.b[0]).toBeCloseTo(4.15);
    expect(wall!.thicknessM).toBeCloseTo(0.3);
    expect(pieces).toHaveLength(7);
  });

  it("merges edges up to half a metre apart, the thickest partition L1 draws", () => {
    const pieces = wallPieces([box("L1-a", 0, 0, 4, 3), box("L1-b", 4.45, 0, 8, 3)]);
    const [wall] = shared(pieces);
    expect(wall!.a[0]).toBeCloseTo(4.225);
    expect(wall!.thicknessM).toBeCloseTo(0.45);
    expect(pieces).toHaveLength(7);
  });

  it("keeps two walls when the rooms are further apart than a wall is thick", () => {
    const pieces = wallPieces([box("L1-a", 0, 0, 4, 3), box("L1-b", 4.55, 0, 8, 3)]);
    expect(shared(pieces)).toHaveLength(0);
    expect(pieces).toHaveLength(8);
  });

  it("shares only the stretch the rooms have in common", () => {
    const pieces = wallPieces([box("L1-a", 0, 0, 4, 6), box("L1-b", 4, 2, 8, 4)]);
    const [wall] = shared(pieces);
    expect(length(wall!)).toBeCloseTo(2);
    expect(pieces).toHaveLength(9);
    // A's east side is still walled all the way along: 2 m shared, 4 m its own.
    expect(lengthFor(pieces, "L1-a")).toBeCloseTo(4 + 6 + 4 + 6);
  });

  it("does not merge edges more than 5 degrees off parallel", () => {
    // B's west edge leans about 10 degrees, yet stays within 0.5 m of A's for 2 m.
    const pieces = wallPieces([box("L1-a", 0, 0, 4, 3), room("L1-b", [[4, 0], [8, 0], [8, 2], [4.35, 2]])]);
    expect(shared(pieces)).toHaveLength(0);
  });

  it("never merges a room with itself, however narrow its notch", () => {
    const u = room("L1-u", [[0, 0], [5, 0], [5, 4], [2.65, 4], [2.65, 1], [2.35, 1], [2.35, 4], [0, 4]]);
    const pieces = wallPieces([u]);
    expect(shared(pieces)).toHaveLength(0);
    expect(pieces).toHaveLength(8);
  });

  it("stands one wall either side of a room thinner than the merge gap, never a third across it", () => {
    // A 0.3 m sliver between A and B: A's and B's edges are within reach of each other too.
    const a = box("L1-a", 0, 0, 4, 3);
    const sliver = box("L1-s", 4, 0, 4.3, 3);
    const b = box("L1-b", 4.3, 0, 8, 3);
    for (const rooms of [[a, sliver, b], [sliver, a, b], [b, sliver, a]]) {
      const pieces = wallPieces(rooms);
      const walls = shared(pieces).map(p => [...p.rooms].sort().join("|")).sort();
      expect(walls).toEqual(["L1-a|L1-s", "L1-b|L1-s"]);
      // The two shared walls, A's other three sides, the sliver's two ends, B's other three.
      expect(pieces).toHaveLength(2 + 3 + 2 + 3);
    }
  });

  it("merges rooms whichever way round their outlines are drawn", () => {
    const clockwise = room("L1-b", [[4, 0], [4, 3], [8, 3], [8, 0]]);
    expect(shared(wallPieces([box("L1-a", 0, 0, 4, 3), clockwise]))).toHaveLength(1);
  });

  it("skips a repeated point rather than building a wall of no length", () => {
    expect(wallPieces([room("L1-a", [[0, 0], [4, 0], [4, 0], [4, 3], [0, 3]])])).toHaveLength(4);
  });

  it("handles a whole floor: a 20 by 20 grid shares every inner wall exactly once", () => {
    const rooms: Room[] = [];
    for (let i = 0; i < 20; i++) {
      for (let j = 0; j < 20; j++) rooms.push(box(`r-${i}-${j}`, i * 5, j * 5, i * 5 + 5, j * 5 + 5));
    }
    const pieces = wallPieces(rooms);
    expect(shared(pieces)).toHaveLength(2 * 20 * 19);
    expect(pieces).toHaveLength(2 * 20 * 19 + 4 * 20);
  });

  it("shares a long corridor wall with every shop along it, on a floor the size of L1", () => {
    // 24 rows of 25 shops between 25 corridors that run the floor's full width,
    // every partition drawn 0.2 m thick: 2,500 edges, as many as the real L1.
    const rooms: Room[] = [];
    for (let k = 0; k <= 24; k++) {
      const y = k * 10.4;
      rooms.push(box(`c-${k}`, 0, y, 25 * 5.2 - 0.2, y + 4));
      if (k === 24) break;
      for (let i = 0; i < 25; i++) rooms.push(box(`s-${k}-${i}`, i * 5.2, y + 4.2, i * 5.2 + 5, y + 10.2));
    }
    expect(rooms.flatMap(r => r.footprint)).toHaveLength(2500);

    // Each shop shares a wall with its neighbours in the row and with the corridor either side.
    expect(shared(wallPieces(rooms))).toHaveLength(24 * 24 + 2 * 24 * 25);
  });

  it("compares each edge only with its neighbours, not with every edge on the floor", () => {
    // A row of 1,000 boxes is 4,000 edges: about 8 million pairs if every edge
    // met every other, a few tens of thousands if the west-to-east sweep stops
    // where it should. Counting pairs, not milliseconds, keeps a busy machine
    // from failing this.
    const rooms = Array.from({ length: 1000 }, (_, i) => box(`r-${i}`, i * 5, 0, i * 5 + 5, 5));
    const stats = { pairsTested: 0 };
    expect(shared(wallPieces(rooms, stats))).toHaveLength(999);
    expect(stats.pairsTested).toBeGreaterThan(0);
    expect(stats.pairsTested).toBeLessThan(100_000);
  });
});
