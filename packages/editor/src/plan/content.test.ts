import type { Ring } from "@oth/model";
import { describe, expect, it } from "vitest";
import { contentBBox, hasArea } from "./content";

const square: Ring = [[0, 0], [10, 0], [10, 8], [0, 8]];
const far: Ring = [[100, 100], [110, 100], [110, 108]];

describe("contentBBox", () => {
  it("bounds a single ring", () => {
    expect(contentBBox([square])).toEqual({ minX: 0, minY: 0, maxX: 10, maxY: 8 });
  });

  it("unions several rings", () => {
    expect(contentBBox([square, far])).toEqual({ minX: 0, minY: 0, maxX: 110, maxY: 108 });
  });

  it("includes the extra box, which is how the underlay gets framed", () => {
    expect(contentBBox([square], { minX: -5, minY: -5, maxX: 5, maxY: 5 }))
      .toEqual({ minX: -5, minY: -5, maxX: 10, maxY: 8 });
  });

  it("returns the extra box alone when there is no geometry yet", () => {
    const only = { minX: 0, minY: 0, maxX: 200, maxY: 150 };
    expect(contentBBox([], only)).toEqual(only);
  });

  it("returns an empty box when there is nothing at all", () => {
    expect(hasArea(contentBBox([], null))).toBe(false);
  });
});

describe("hasArea", () => {
  it("is true for a real box", () => {
    expect(hasArea({ minX: 0, minY: 0, maxX: 1, maxY: 1 })).toBe(true);
  });

  it("is false for an inverted empty box", () => {
    expect(hasArea({ minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity })).toBe(false);
  });

  it("is false for a zero-area box, which cannot be fitted", () => {
    expect(hasArea({ minX: 5, minY: 5, maxX: 5, maxY: 5 })).toBe(false);
  });
});
