import type { Vec2 } from "@oth/model";
import { describe, expect, it } from "vitest";
import { linesThroughForks, pruneSpurs, skeletonGraph, type SkeletonEdge, type SkeletonGraph } from "./graph";
import { walkableRaster } from "./raster";
import { thin } from "./thin";
import { floor, LEVEL, rect, type TestRoom } from "./testing";

function graphOf(rooms: TestRoom[]): SkeletonGraph {
  const r = walkableRaster(floor(rooms), LEVEL);
  return skeletonGraph(thin(r), r);
}

/** A 24 × 4 m corridor with a 2 m wide opening `depth` deep off its north side at x 11–13. */
const withAlcove = (depth: number): TestRoom[] => [{
  footprint: [[0, 0], [24, 0], [24, 4], [13, 4], [13, 4 + depth], [11, 4 + depth], [11, 4], [0, 4]],
}];

/** A graph drawn by hand: node i at points[i], and an edge per pair, straight. */
function drawn(points: Vec2[], pairs: Array<[number, number, number]>): SkeletonGraph {
  const edges: SkeletonEdge[] = pairs.map(([a, b, lengthM]) => ({ a, b, points: [points[a]!, points[b]!], lengthM }));
  return { nodes: points, edges };
}

describe("skeletonGraph", () => {
  it("makes a corridor one edge between its two ends", () => {
    const { edges } = graphOf([{ footprint: rect(0, 0, 20, 4) }]);
    expect(edges).toHaveLength(1);
    expect(edges[0]!.a).not.toBe(edges[0]!.b);
    expect(edges[0]!.lengthM).toBeCloseTo(15.75, 1);
  });

  it("makes a T three edges that meet at one node", () => {
    const { edges } = graphOf(withAlcove(5));
    expect(edges).toHaveLength(3);
    const ends = edges.flatMap(e => [e.a, e.b]);
    const fork = ends.find(n => ends.filter(m => m === n).length === 3);
    expect(fork).toBeDefined();
  });

  it("makes a loop with no fork on it one edge from a node back to itself", () => {
    const { edges } = graphOf([{ footprint: rect(0, 0, 30, 20), holes: [rect(10, 7, 20, 13)] }]);
    expect(edges).toHaveLength(1);
    expect(edges[0]!.a).toBe(edges[0]!.b);
    expect(edges[0]!.points[0]).toEqual(edges[0]!.points.at(-1));
  });

  it("gives a room too small to thin into a line a node and no edge", () => {
    const g = graphOf([{ footprint: rect(0, 0, 0.75, 0.75) }]);
    expect([g.nodes.length, g.edges.length]).toEqual([1, 0]);
  });
});

describe("pruneSpurs", () => {
  it("drops a spur shorter than 2 m and joins the line through where it was", () => {
    const raw = graphOf(withAlcove(1));
    expect(raw.edges).toHaveLength(3);
    const { edges } = pruneSpurs(raw, 2);
    expect(edges).toHaveLength(1);
    expect(edges[0]!.lengthM).toBeGreaterThan(19);
  });

  it("keeps a spur 2 m long or more", () => {
    expect(pruneSpurs(graphOf(withAlcove(1.5)), 2).edges).toHaveLength(3);
  });

  it("drops the shorter of two prongs first, so the line keeps its length", () => {
    // A line from (0,0) to a fork at (10,0), with prongs of 1 m and 1.5 m beyond.
    const g = drawn([[0, 0], [10, 0], [10, 1], [11.5, 0]], [[0, 1, 10], [1, 2, 1], [1, 3, 1.5]]);
    const { edges } = pruneSpurs(g, 2);
    expect(edges).toHaveLength(1);
    expect(edges[0]!.lengthM).toBe(11.5);
    expect(edges[0]!.points).toEqual([[0, 0], [10, 0], [11.5, 0]]);
  });

  it("drops a small loop hanging off a fork", () => {
    const g: SkeletonGraph = {
      nodes: [[0, 0], [10, 0], [20, 0]],
      edges: [
        { a: 0, b: 1, points: [[0, 0], [10, 0]], lengthM: 10 },
        { a: 1, b: 2, points: [[10, 0], [20, 0]], lengthM: 10 },
        { a: 1, b: 1, points: [[10, 0], [10.5, 0.5], [10, 1], [10, 0]], lengthM: 1.7 },
      ],
    };
    const { edges } = pruneSpurs(g, 2);
    expect(edges).toHaveLength(1);
    expect(edges[0]!.lengthM).toBe(20);
  });

  it("never prunes a piece standing on its own, however short", () => {
    expect(pruneSpurs(drawn([[0, 0], [1, 0]], [[0, 1, 1]]), 2).edges).toHaveLength(1);
  });
});

/** 10 m from the origin, `deg` clockwise from north. */
const out = (deg: number): Vec2 => [10 * Math.sin((deg * Math.PI) / 180), 10 * Math.cos((deg * Math.PI) / 180)];
/** Three lines 10 m long from a fork at the origin: one from the south, and one each way given. */
const y = (right: number, left: number): SkeletonGraph =>
  drawn([[0, 0], [0, -10], out(right), out(-left)], [[1, 0, 10], [0, 2, 10], [0, 3, 10]]);
const sameWidth = () => 2;

describe("linesThroughForks", () => {
  it("runs a line on through the straightest pair at a fork: a 20° bend, not a 50° one", () => {
    const lines = linesThroughForks(y(20, 50), sameWidth);
    expect(lines).toHaveLength(2);
    const through = lines.find(l => l.points.length === 3)!;
    expect(through.points).toEqual([[0, -10], [0, 0], out(20)]);
    expect(through.lengthM).toBe(20);
    expect(lines.find(l => l !== through)!.points).toEqual([[0, 0], out(-50)]);
  });

  it("leaves a bend of 30° or more as a fork", () => {
    expect(linesThroughForks(y(35, 50), sameWidth)).toHaveLength(3);
  });

  it("measures the bend about 3 m out, so a kink at the fork itself does not count", () => {
    // The line north jinks 0.5 m east at the fork, then runs straight on.
    const g: SkeletonGraph = {
      nodes: [[0, 0], [0, -10], [0.5, 10], [-10, 0]],
      edges: [
        { a: 1, b: 0, points: [[0, -10], [0, 0]], lengthM: 10 },
        { a: 0, b: 2, points: [[0, 0], [0.5, 0.5], [0.5, 10]], lengthM: 10.2 },
        { a: 0, b: 3, points: [[0, 0], [-10, 0]], lengthM: 10 },
      ],
    };
    expect(linesThroughForks(g, sameWidth)).toHaveLength(2);
  });

  it("does not run a line on into one more than 1.5 times as wide or narrow", () => {
    const g = drawn([[0, 0], [-10, 0], [10, 0], [0, 10]], [[1, 0, 10], [0, 2, 10], [0, 3, 10]]);
    const eastWidth = (east: number) => (points: readonly Vec2[]) => (points.some(p => p[0] > 0) ? east : 2);
    expect(linesThroughForks(g, eastWidth(3.1))).toHaveLength(3);
    expect(linesThroughForks(g, eastWidth(3))).toHaveLength(2);
  });

  it("says what each end of a line meets: a fork, a dead end, or itself round a loop", () => {
    const g: SkeletonGraph = {
      nodes: [[0, 0], [-10, 0], [10, 0], [0, 10], [50, 0]],
      edges: [
        { a: 1, b: 0, points: [[-10, 0], [0, 0]], lengthM: 10 },
        { a: 0, b: 2, points: [[0, 0], [10, 0]], lengthM: 10 },
        { a: 0, b: 3, points: [[0, 0], [0, 10]], lengthM: 10 },
        { a: 4, b: 4, points: [[50, 0], [55, 5], [60, 0], [55, -5], [50, 0]], lengthM: 28.3 },
      ],
    };
    const ends = linesThroughForks(g, sameWidth).map(l => l.ends);
    expect(ends).toContainEqual(["end", "end"]);
    expect(ends).toContainEqual(["fork", "end"]);
    expect(ends).toContainEqual(["loop", "loop"]);
  });

  it("numbers each network of lines that join up by its total length, the longest 0", () => {
    // A T of 30 m in all, and one straight line of 25 m standing apart.
    const g = drawn(
      [[0, 0], [-10, 0], [10, 0], [0, 10], [100, 0], [125, 0]],
      [[1, 0, 10], [0, 2, 10], [0, 3, 10], [4, 5, 25]],
    );
    const lines = linesThroughForks(g, sameWidth);
    const networkOf = (lengthM: number) => lines.find(l => l.lengthM === lengthM)!.network;
    expect([networkOf(20), networkOf(10), networkOf(25)]).toEqual([0, 0, 1]);
  });

  it("leaves out a line of no length, and does not count it as a network", () => {
    const g = drawn([[0, 0], [10, 0], [50, 50], [50, 50]], [[0, 1, 10], [2, 3, 0]]);
    expect(linesThroughForks(g, sameWidth).map(l => [l.lengthM, l.network])).toEqual([[10, 0]]);
  });
});
