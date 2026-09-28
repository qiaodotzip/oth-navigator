import type { Vec2 } from "@oth/model";
import { describe, expect, it } from "vitest";
import { pruneSpurs, skeletonGraph, type SkeletonEdge, type SkeletonGraph } from "./graph";
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
