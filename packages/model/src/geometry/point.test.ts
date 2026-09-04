import { describe, expect, it } from "vitest";
import type { Ring } from "../primitives";
import { bboxContains, bboxOfRing, bboxOfRings, pointInPolygon, pointInRing } from "./point";

const square: Ring = [[0, 0], [10, 0], [10, 10], [0, 10]];
const hole: Ring = [[4, 4], [6, 4], [6, 6], [4, 6]];

describe("pointInRing", () => {
  it("is true well inside", () => {
    expect(pointInRing([5, 5], square)).toBe(true);
  });

  it("is false well outside", () => {
    expect(pointInRing([15, 5], square)).toBe(false);
  });

  it("is false outside on the other axis", () => {
    expect(pointInRing([5, -1], square)).toBe(false);
  });

  it("handles an L-shaped room's concave notch", () => {
    const lShape: Ring = [[0, 0], [10, 0], [10, 4], [4, 4], [4, 10], [0, 10]];
    expect(pointInRing([2, 8], lShape)).toBe(true);
    expect(pointInRing([8, 8], lShape)).toBe(false);
  });
});

describe("pointInPolygon", () => {
  it("is true inside the outer ring with no holes", () => {
    expect(pointInPolygon([5, 5], square)).toBe(true);
  });

  it("is false inside a hole — an atrium void is not walkable", () => {
    expect(pointInPolygon([5, 5], square, [hole])).toBe(false);
  });

  it("is true inside the outer ring but outside the hole", () => {
    expect(pointInPolygon([1, 1], square, [hole])).toBe(true);
  });
});

describe("bboxOfRing", () => {
  it("bounds a square", () => {
    expect(bboxOfRing(square)).toEqual({ minX: 0, minY: 0, maxX: 10, maxY: 10 });
  });

  it("bounds negative coordinates", () => {
    expect(bboxOfRing([[-5, -2], [3, -2], [3, 4]])).toEqual({
      minX: -5, minY: -2, maxX: 3, maxY: 4,
    });
  });
});

describe("bboxOfRings", () => {
  it("unions several rings", () => {
    expect(bboxOfRings([square, [[12, 0], [14, 0], [14, 2]]])).toEqual({
      minX: 0, minY: 0, maxX: 14, maxY: 10,
    });
  });

  it("returns an empty bbox for no rings", () => {
    const b = bboxOfRings([]);
    expect(b.minX > b.maxX).toBe(true);
  });
});

describe("bboxContains", () => {
  it("is true when fully inside", () => {
    expect(bboxContains(bboxOfRing(square), bboxOfRing(hole))).toBe(true);
  });

  it("is false when it escapes", () => {
    expect(bboxContains(bboxOfRing(square), bboxOfRing([[9, 9], [12, 9], [12, 12]]))).toBe(false);
  });
});
