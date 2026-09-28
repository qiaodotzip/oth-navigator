import type { Vec2 } from "@oth/model";
import { describe, expect, it } from "vitest";
import { simplify } from "./simplify";

describe("simplify", () => {
  it("straightens a run of pixel centres that wanders less than the tolerance", () => {
    const run: Vec2[] = Array.from({ length: 41 }, (_, i) => [i * 0.25, i % 2 === 0 ? 0 : 0.125]);
    expect(simplify(run, 0.3)).toEqual([[0, 0], [10, 0]]);
  });

  it("keeps a corner", () => {
    const bend: Vec2[] = [[0, 0], [5, 0], [10, 0], [10, 5], [10, 10]];
    expect(simplify(bend, 0.3)).toEqual([[0, 0], [10, 0], [10, 10]]);
  });

  it("keeps a bump past the tolerance and drops one inside it", () => {
    expect(simplify([[0, 0], [5, 0.4], [10, 0]], 0.3)).toEqual([[0, 0], [5, 0.4], [10, 0]]);
    expect(simplify([[0, 0], [5, 0.2], [10, 0]], 0.3)).toEqual([[0, 0], [10, 0]]);
  });

  it("keeps a loop's corners, and its closing point", () => {
    const square: Vec2[] = [[0, 0], [5, 0], [10, 0], [10, 5], [10, 10], [5, 10], [0, 10], [0, 5], [0, 0]];
    expect(simplify(square, 0.3)).toEqual([[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]);
  });

  it("gives back two points or fewer as they are", () => {
    expect(simplify([[1, 2], [3, 4]], 0.3)).toEqual([[1, 2], [3, 4]]);
  });
});
