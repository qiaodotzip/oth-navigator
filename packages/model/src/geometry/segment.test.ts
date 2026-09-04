import { describe, expect, it } from "vitest";
import type { Vec2 } from "../primitives";
import { distancePointToSegment, segmentsProperlyIntersect } from "./segment";

describe("segmentsProperlyIntersect", () => {
  it("detects a clean crossing", () => {
    expect(segmentsProperlyIntersect([0, 0], [2, 2], [0, 2], [2, 0])).toBe(true);
  });

  it("is false for parallel segments", () => {
    expect(segmentsProperlyIntersect([0, 0], [2, 0], [0, 1], [2, 1])).toBe(false);
  });

  it("is false when segments merely share an endpoint", () => {
    expect(segmentsProperlyIntersect([0, 0], [1, 1], [1, 1], [2, 0])).toBe(false);
  });

  it("is false for a T-touch, where an endpoint lands on the other segment", () => {
    expect(segmentsProperlyIntersect([0, 0], [2, 0], [1, 0], [1, 2])).toBe(false);
  });

  it("is false for disjoint segments", () => {
    expect(segmentsProperlyIntersect([0, 0], [1, 0], [5, 5], [6, 6])).toBe(false);
  });
});

describe("distancePointToSegment", () => {
  const a: Vec2 = [0, 0];
  const b: Vec2 = [10, 0];

  it("measures perpendicular distance to the interior of the segment", () => {
    expect(distancePointToSegment([5, 3], a, b)).toBeCloseTo(3, 10);
  });

  it("clamps to the near endpoint when the projection falls outside", () => {
    expect(distancePointToSegment([-4, 0], a, b)).toBeCloseTo(4, 10);
    expect(distancePointToSegment([14, 0], a, b)).toBeCloseTo(4, 10);
  });

  it("is zero on the segment", () => {
    expect(distancePointToSegment([5, 0], a, b)).toBeCloseTo(0, 10);
  });

  it("handles a degenerate zero-length segment as distance to the point", () => {
    expect(distancePointToSegment([3, 4], [0, 0], [0, 0])).toBeCloseTo(5, 10);
  });
});
