import { describe, expect, it } from "vitest";
import type { Ring } from "../primitives";
import { normaliseRing, ringArea, ringCentroid, ringIsClockwise, ringIsSimple } from "./ring";

const unitSquareCCW: Ring = [[0, 0], [1, 0], [1, 1], [0, 1]];
const unitSquareCW: Ring = [[0, 0], [0, 1], [1, 1], [1, 0]];

describe("ringArea", () => {
  it("returns positive area for a counter-clockwise ring", () => {
    expect(ringArea(unitSquareCCW)).toBeCloseTo(1, 10);
  });

  it("returns negative area for a clockwise ring", () => {
    expect(ringArea(unitSquareCW)).toBeCloseTo(-1, 10);
  });

  it("computes a realistic room area in square metres", () => {
    const room: Ring = [[0, 0], [10, 0], [10, 8], [0, 8]];
    expect(ringArea(room)).toBeCloseTo(80, 10);
  });

  it("returns zero for a degenerate collinear ring", () => {
    expect(ringArea([[0, 0], [1, 0], [2, 0]])).toBeCloseTo(0, 10);
  });
});

describe("ringIsClockwise", () => {
  it("is false for counter-clockwise", () => {
    expect(ringIsClockwise(unitSquareCCW)).toBe(false);
  });

  it("is true for clockwise", () => {
    expect(ringIsClockwise(unitSquareCW)).toBe(true);
  });
});

describe("normaliseRing", () => {
  it("leaves a counter-clockwise ring alone", () => {
    expect(normaliseRing(unitSquareCCW)).toEqual([[0, 0], [1, 0], [1, 1], [0, 1]]);
  });

  it("reverses a clockwise ring to counter-clockwise", () => {
    expect(ringIsClockwise(normaliseRing(unitSquareCW))).toBe(false);
  });

  it("drops a repeated closing point — the closing edge is implicit", () => {
    const closed: Ring = [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]];
    expect(normaliseRing(closed)).toHaveLength(4);
  });

  it("is idempotent", () => {
    const once = normaliseRing(unitSquareCW);
    expect(normaliseRing(once)).toEqual(once);
  });
});

describe("ringIsSimple", () => {
  it("accepts a convex square", () => {
    expect(ringIsSimple([[0, 0], [1, 0], [1, 1], [0, 1]])).toBe(true);
  });

  it("accepts a realistic L-shaped room", () => {
    expect(ringIsSimple([[0, 0], [10, 0], [10, 4], [4, 4], [4, 8], [0, 8]])).toBe(true);
  });

  it("rejects a bowtie", () => {
    expect(ringIsSimple([[0, 0], [2, 2], [2, 0], [0, 2]])).toBe(false);
  });

  it("rejects a ring with fewer than three points", () => {
    expect(ringIsSimple([[0, 0], [1, 1]])).toBe(false);
  });

  it("rejects a ring containing a duplicate vertex", () => {
    expect(ringIsSimple([[0, 0], [1, 0], [1, 0], [1, 1], [0, 1]])).toBe(false);
  });
});

describe("ringCentroid", () => {
  it("finds the middle of a square", () => {
    expect(ringCentroid([[0, 0], [4, 0], [4, 4], [0, 4]])).toEqual([2, 2]);
  });

  it("is area-weighted, not a vertex average", () => {
    // Extra vertices bunched along one edge would drag a vertex average toward
    // them, and a footprint traced by hand has exactly that shape.
    const traced: Ring = [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [4, 4], [0, 4]];
    expect(ringCentroid(traced)[0]).toBeCloseTo(2, 6);
  });

  it("does not care which way the ring winds", () => {
    expect(ringCentroid([[0, 0], [0, 4], [4, 4], [4, 0]])).toEqual([2, 2]);
  });

  it("falls back to the vertex average for a degenerate ring of no area", () => {
    expect(ringCentroid([[0, 0], [2, 0], [4, 0]])).toEqual([2, 0]);
  });

  it("sits inside an L shape's own bounds", () => {
    const l: Ring = [[0, 0], [6, 0], [6, 2], [2, 2], [2, 6], [0, 6]];
    const [x, y] = ringCentroid(l);
    expect(x).toBeGreaterThan(0);
    expect(x).toBeLessThan(6);
    expect(y).toBeGreaterThan(0);
    expect(y).toBeLessThan(6);
  });
});
