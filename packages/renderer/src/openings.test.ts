import { DoorwaySchema, PathwaySchema, type Doorway, type Pathway } from "@oth/model";
import { describe, expect, it } from "vitest";
import type { Interval } from "./intervals";
import { MAX_PATH_OPENING_M, doorwayOpenings, pathwayOpenings, shopfrontOpening, wallRuns } from "./openings";
import type { WallPiece } from "./wallPlan";

let n = 0;
const path = (polyline: Array<[number, number]>, widthM = 2): Pathway =>
  PathwaySchema.parse({ id: `p${n++}`, levelId: "oth-L1", polyline, widthM });
const door = (segment: [[number, number], [number, number]], widthM: number): Doorway =>
  DoorwaySchema.parse({ id: `d${n++}`, levelId: "oth-L1", roomA: "L1-shop", roomB: "L1-hall", segment, widthM });

/** Rounded, so a crossing computed as 2.9999999999999996 reads as 3. The + 0 turns -0 into 0. */
const r6 = (x: number) => Math.round(x * 1e6) / 1e6 + 0;
const tidy = (xs: Interval[]) => xs.map(([a, b]) => [r6(a), r6(b)]);

/** A shop's 6 m front along y = 0; the shop is to the north. */
const front: WallPiece = { a: [0, 0], b: [6, 0], thicknessM: 0.15, rooms: ["L1-shop"] };

describe("pathwayOpenings", () => {
  it("opens the wall where a pathway crosses it, as wide as the pathway", () => {
    expect(tidy(pathwayOpenings(front, [path([[3, -5], [3, 5]], 2)]))).toEqual([[2, 4]]);
  });

  it("opens at most 3 m, however wide the pathway", () => {
    const [[from, to]] = pathwayOpenings(front, [path([[3, -5], [3, 5]], 8)]) as [Interval];
    expect(to - from).toBeCloseTo(MAX_PATH_OPENING_M);
  });

  it("still opens for a pathway that stops just short of the wall", () => {
    expect(pathwayOpenings(front, [path([[3, -5], [3, -0.3]])])).toHaveLength(1);
  });

  it("does not open for a pathway that stops a metre short", () => {
    expect(pathwayOpenings(front, [path([[3, -5], [3, -1]])])).toEqual([]);
  });

  it("opens nothing for a pathway running along the wall", () => {
    expect(pathwayOpenings(front, [path([[-2, 0], [8, 0]])])).toEqual([]);
  });

  it("finds the crossing on a pathway that meets the wall at an angle", () => {
    const [[from, to]] = pathwayOpenings(front, [path([[0, -3], [6, 3]], 2)]) as [Interval];
    expect((from + to) / 2).toBeCloseTo(3);
  });

  it("opens for a pathway crossing at the wall's very end, where the quick box test is at its edge", () => {
    expect(tidy(pathwayOpenings(front, [path([[6, -5], [6, 5]], 2)]))).toEqual([[5, 7]]);
  });
});

describe("doorwayOpenings", () => {
  it("opens the wall along a doorway that lies on it", () => {
    expect(tidy(doorwayOpenings(front, [door([[1, 0], [2.5, 0]], 1.5)]))).toEqual([[1, 2.5]]);
  });

  it("widens a doorway drawn shorter than its width, about its middle", () => {
    expect(tidy(doorwayOpenings(front, [door([[3, 0.1], [3.5, 0.1]], 2)]))).toEqual([[2.25, 4.25]]);
  });

  it("ignores a doorway a metre off the wall", () => {
    expect(doorwayOpenings(front, [door([[1, 1], [2, 1]], 1)])).toEqual([]);
  });

  it("ignores a doorway on the same line but past the wall's end", () => {
    expect(doorwayOpenings(front, [door([[8, 0], [9, 0]], 1)])).toEqual([]);
  });
});

describe("shopfrontOpening", () => {
  it("faces a pathway passing within 3 m, centred where it runs alongside", () => {
    const opening = shopfrontOpening(front, [path([[-10, -2], [20, -2]], 2)]);
    expect(opening?.distance).toBeCloseTo(2);
    expect(tidy([opening!.interval])).toEqual([[2, 4]]);
  });

  it("slides back inside the wall rather than hang off its end", () => {
    const opening = shopfrontOpening(front, [path([[8, -1], [20, -1]], 2)]);
    expect(tidy([opening!.interval])).toEqual([[4, 6]]);
  });

  it("is no wider than the wall", () => {
    const kiosk: WallPiece = { a: [0, 0], b: [1.5, 0], thicknessM: 0.15, rooms: ["L1-kiosk"] };
    expect(tidy([shopfrontOpening(kiosk, [path([[-10, -1], [10, -1]], 2.4)])!.interval])).toEqual([[0, 1.5]]);
  });

  it("offers nothing for a pathway more than 3 m away", () => {
    expect(shopfrontOpening(front, [path([[-10, -4], [20, -4]], 2)])).toBeNull();
  });
});

describe("wallRuns", () => {
  const shop = (): WallPiece[] => [
    { a: [0, 0], b: [6, 0], thicknessM: 0.15, rooms: ["L1-shop"] },
    { a: [6, 0], b: [6, 4], thicknessM: 0.15, rooms: ["L1-shop", "L1-next"] },
    { a: [6, 4], b: [0, 4], thicknessM: 0.15, rooms: ["L1-shop"] },
    { a: [0, 4], b: [0, 0], thicknessM: 0.15, rooms: ["L1-shop"] },
  ];
  const onFront = (runs: WallPiece[]) =>
    runs.filter(r => r.a[1] === 0 && r.b[1] === 0).map(r => [r6(r.a[0]), r6(r.b[0])]);

  it("leaves a gap where a pathway goes in, and walls the rest", () => {
    const runs = wallRuns(shop(), [path([[3, -5], [3, 2]], 2)], []);
    expect(onFront(runs)).toEqual([[0, 2], [4, 6]]);
    expect(runs).toHaveLength(5);
  });

  it("gives a shop a front door onto a pathway that passes it without going in", () => {
    const runs = wallRuns(shop(), [path([[-10, -2], [20, -2]], 2)], []);
    expect(onFront(runs)).toEqual([[0, 2], [4, 6]]);
  });

  it("never puts the front door on a wall shared with the shop next door", () => {
    // The pathway passes just east of the shared wall, nearer it than the front.
    const runs = wallRuns(shop(), [path([[7, -10], [7, 10]], 2)], []);
    const between = runs.filter(r => r.rooms.length === 2);
    expect(between).toHaveLength(1);
    expect(between[0]!.a).toEqual([6, 0]);
    expect(between[0]!.b).toEqual([6, 4]);
    expect(onFront(runs)).toEqual([[0, 4]]);
  });

  it("adds no front door to a room a pathway already goes into", () => {
    const runs = wallRuns(shop(), [path([[3, -5], [3, 2]], 2), path([[-10, 6], [20, 6]], 2)], []);
    // The second pathway passes 2 m behind the shop; the back wall stays whole.
    expect(runs.filter(r => r.a[1] === 4 && r.b[1] === 4)).toHaveLength(1);
  });

  it("leaves a room no pathway comes near closed", () => {
    expect(wallRuns(shop(), [path([[-10, -9], [20, -9]], 2)], [])).toHaveLength(4);
  });

  it("opens a wall along a doorway", () => {
    const runs = wallRuns(shop(), [], [door([[1, 0], [2.5, 0]], 1.5)]);
    expect(onFront(runs)).toEqual([[0, 1], [2.5, 6]]);
  });

  it("drops a wall entirely when its opening is wider than it", () => {
    const stub: WallPiece = { a: [0, 0], b: [1, 0], thicknessM: 0.15, rooms: ["L1-kiosk"] };
    expect(wallRuns([stub], [path([[0.5, -3], [0.5, 3]], 2.4)], [])).toEqual([]);
  });

  it("clamps an opening near a wall's end", () => {
    const wall: WallPiece = { a: [0, 0], b: [4, 0], thicknessM: 0.15, rooms: ["L1-kiosk"] };
    const runs = wallRuns([wall], [path([[0.5, -3], [0.5, 3]], 2.4)], []);
    expect(runs).toHaveLength(1);
    expect(runs[0]!.a[0]).toBeCloseTo(1.7);
    expect(runs[0]!.b[0]).toBeCloseTo(4);
  });
});
