import { describe, expect, it } from "vitest";
import { subtractIntervals } from "./intervals";

describe("subtractIntervals", () => {
  it("keeps the whole length when nothing is cut", () => {
    expect(subtractIntervals(4, [])).toEqual([[0, 4]]);
  });

  it("leaves a piece either side of a cut in the middle", () => {
    expect(subtractIntervals(4, [[1, 2]])).toEqual([[0, 1], [2, 4]]);
  });

  it("merges cuts that overlap, given in any order and either way round", () => {
    expect(subtractIntervals(10, [[6, 8], [2, 1], [1.5, 3]])).toEqual([[0, 1], [3, 6], [8, 10]]);
  });

  it("clamps cuts that run past either end", () => {
    expect(subtractIntervals(4, [[-1, 0.5], [3.5, 9]])).toEqual([[0.5, 3.5]]);
  });

  it("leaves nothing when a cut covers everything", () => {
    expect(subtractIntervals(4, [[-1, 5]])).toEqual([]);
  });

  it("drops slivers shorter than asked", () => {
    expect(subtractIntervals(4, [[0.02, 2]], 0.05)).toEqual([[2, 4]]);
  });

  it("ignores cuts that miss the length entirely", () => {
    expect(subtractIntervals(4, [[5, 6], [-3, -1]])).toEqual([[0, 4]]);
  });
});
