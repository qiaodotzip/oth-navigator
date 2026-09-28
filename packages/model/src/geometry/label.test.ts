import { describe, expect, it } from "vitest";
import type { Ring } from "../primitives";
import { labelPoint, labelSpan } from "./label";
import { pointInPolygon, pointInRing } from "./point";
import { ringCentroid } from "./ring";

const square: Ring = [[0, 0], [10, 0], [10, 10], [0, 10]];
/** An L one metre wide: its centroid falls in the crook, outside it. */
const thinL: Ring = [[0, 0], [10, 0], [10, 1], [1, 1], [1, 10], [0, 10]];
const hole: Ring = [[3, 3], [7, 3], [7, 7], [3, 7]];

describe("labelPoint", () => {
  it("finds the middle of a square, as far from every wall as it can be", () => {
    const { point, distance } = labelPoint(square);
    expect(point[0]).toBeCloseTo(5, 1);
    expect(point[1]).toBeCloseTo(5, 1);
    expect(distance).toBeCloseTo(5, 1);
  });

  it("stays inside an L-shaped unit, where the centroid does not", () => {
    expect(pointInRing(ringCentroid(thinL), thinL)).toBe(false);
    const { point, distance } = labelPoint(thinL);
    expect(pointInRing(point, thinL)).toBe(true);
    // The widest circle that fits is 0.586 m in radius, across the corner;
    // the answer is within the 0.1 m asked for.
    expect(distance).toBeGreaterThan(0.48);
    expect(distance).toBeLessThanOrEqual(0.59);
  });

  it("keeps out of a room's holes", () => {
    const { point, distance } = labelPoint(square, [hole]);
    expect(pointInPolygon(point, square, [hole])).toBe(true);
    // The deepest points are in the corners, 1.76 m from both walls and the hole's corner.
    expect(distance).toBeGreaterThan(1.65);
  });

  it("gives the same answer whichever way the ring runs", () => {
    const reversed = [...thinL].reverse();
    expect(labelPoint(reversed).distance).toBeCloseTo(labelPoint(thinL).distance, 5);
  });

  it("finishes on a sliver a thousand times longer than it is wide", () => {
    const sliver: Ring = [[0, 0], [1000, 0], [1000, 0.02], [0, 0.02]];
    const { point, distance } = labelPoint(sliver);
    expect(pointInRing(point, sliver)).toBe(true);
    expect(distance).toBeCloseTo(0.01, 2);
  });

  it("answers a ring with no area without throwing: nothing fits there", () => {
    const { point, distance } = labelPoint([[0, 0], [1, 0], [2, 0]]);
    expect(point.every(Number.isFinite)).toBe(true);
    expect(distance).toBe(0);
  });

  it("answers a ring that crosses itself without hanging", () => {
    const bowtie: Ring = [[0, 0], [10, 10], [10, 0], [0, 10]];
    expect(labelPoint(bowtie).point.every(Number.isFinite)).toBe(true);
  });

  it("answers a ring of fewer than three points with a finite point and no room", () => {
    expect(labelPoint([])).toEqual({ point: [0, 0], distance: 0 });
    expect(labelPoint([[3, 4]])).toEqual({ point: [3, 4], distance: 0 });
    expect(labelPoint([[0, 0], [4, 2]])).toEqual({ point: [2, 1], distance: 0 });
  });

  it("answers a line drawn on the diagonal, whose box is square, without searching it", () => {
    // The box test cannot see this one: its box is 1000 m square.
    expect(labelPoint([[0, 0], [500, 500], [1000, 1000]])).toEqual({ point: [500, 500], distance: 0 });
    // Collinear up to rounding, as a PDF extraction's points are.
    const { point, distance } = labelPoint([[0.1, 0.3], [0.2, 0.6], [0.3, 0.9]]);
    expect(point[0]).toBeCloseTo(0.2, 9);
    expect(point[1]).toBeCloseTo(0.6, 9);
    expect(distance).toBe(0);
  });

  it("answers a speck narrower than rounding at its coordinates without hanging", () => {
    // One step across it, a 64th of its width, is lost to rounding at x = 1000,
    // so stepping from one side of its box would never reach the other.
    const speck: Ring = [[1000, 0.001], [1000 + 2 ** -43, 0.001], [1000, 0.001 + 1e-18]];
    const { point, distance } = labelPoint(speck);
    expect(point.every(Number.isFinite)).toBe(true);
    expect(distance).toBeLessThan(1e-12);
  });
});

describe("labelSpan", () => {
  it("measures a square across and up through its middle", () => {
    expect(labelSpan([5, 5], square)).toEqual({ width: 10, height: 10 });
  });

  it("measures only the arm of an L that the point is in", () => {
    expect(labelSpan([5, 0.5], thinL)).toEqual({ width: 10, height: 1 });
  });

  it("measures what a centred label can use, not the whole line through the point", () => {
    // In the crook of the L: 0.5 m to the left wall, 9.5 m to the right.
    expect(labelSpan([0.5, 0.5], thinL)).toEqual({ width: 1, height: 1 });
    expect(labelSpan([2, 5], square)).toEqual({ width: 4, height: 10 });
  });

  it("stops at a hole", () => {
    expect(labelSpan([1.5, 5], square, [hole])).toEqual({ width: 3, height: 10 });
  });

  it("is zero outside the shape", () => {
    expect(labelSpan([20, 5], square)).toEqual({ width: 0, height: 0 });
  });
});
