import type { Ring } from "@oth/model";
import { describe, expect, it } from "vitest";
import { deleteVertex, insertVertex, moveVertex, nearestEdgeIndex } from "./ring";

const square: Ring = [[0, 0], [10, 0], [10, 10], [0, 10]];

describe("moveVertex", () => {
  it("moves the named vertex", () => {
    expect(moveVertex(square, 1, [12, 1])[1]).toEqual([12, 1]);
  });

  it("leaves the other vertices alone", () => {
    const moved = moveVertex(square, 1, [12, 1]);
    expect(moved[0]).toEqual([0, 0]);
    expect(moved[3]).toEqual([0, 10]);
  });

  it("does not mutate the input", () => {
    moveVertex(square, 0, [99, 99]);
    expect(square[0]).toEqual([0, 0]);
  });

  it("ignores an out-of-range index rather than corrupting the ring", () => {
    expect(moveVertex(square, 9, [1, 1])).toEqual(square);
  });
});

describe("insertVertex", () => {
  it("inserts after the given edge", () => {
    const r = insertVertex(square, 0, [5, 0]);
    expect(r).toHaveLength(5);
    expect(r[1]).toEqual([5, 0]);
  });

  it("inserts after the last edge, wrapping to the end", () => {
    const r = insertVertex(square, 3, [0, 5]);
    expect(r).toHaveLength(5);
    expect(r[4]).toEqual([0, 5]);
  });
});

describe("deleteVertex", () => {
  it("removes the vertex", () => {
    const r = deleteVertex(square, 2);
    expect(r).toHaveLength(3);
    expect(r).not.toContainEqual([10, 10]);
  });

  it("refuses to go below three points, which would stop being a ring", () => {
    const triangle: Ring = [[0, 0], [1, 0], [0, 1]];
    expect(deleteVertex(triangle, 0)).toEqual(triangle);
  });
});

describe("nearestEdgeIndex", () => {
  it("finds the bottom edge", () => {
    expect(nearestEdgeIndex(square, [5, 0.1])).toBe(0);
  });

  it("finds the closing edge, which wraps from last to first", () => {
    expect(nearestEdgeIndex(square, [0.1, 5])).toBe(3);
  });

  it("returns -1 for a ring too short to have edges", () => {
    expect(nearestEdgeIndex([[0, 0]], [1, 1])).toBe(-1);
  });
});
