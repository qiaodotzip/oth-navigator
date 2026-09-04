import type { Ring } from "@oth/model";
import { describe, expect, it } from "vitest";
import { snapPoint } from "./snapping";

const square: Ring = [[0, 0], [10, 0], [10, 10], [0, 10]];
const opts = { toleranceM: 0.5, gridM: 1 };

describe("snapPoint", () => {
  it("snaps to a nearby vertex", () => {
    const s = snapPoint([10.2, 0.1], { rings: [square] }, opts);
    expect(s.kind).toBe("vertex");
    expect(s.point).toEqual([10, 0]);
  });

  it("prefers a vertex over an edge when both are in range", () => {
    expect(snapPoint([0.1, 0.1], { rings: [square] }, opts).kind).toBe("vertex");
  });

  it("snaps to a point on an edge when no vertex is close", () => {
    const s = snapPoint([5, 0.2], { rings: [square] }, opts);
    expect(s.kind).toBe("edge");
    expect(s.point[0]).toBeCloseTo(5);
    expect(s.point[1]).toBeCloseTo(0);
  });

  it("falls back to the grid when nothing else is close", () => {
    const s = snapPoint([3.1, 6.9], { rings: [] }, opts);
    expect(s.kind).toBe("grid");
    expect(s.point).toEqual([3, 7]);
  });

  it("returns the point unchanged when the grid is disabled and nothing is near", () => {
    const s = snapPoint([3.1, 6.9], { rings: [] }, { toleranceM: 0.5 });
    expect(s.kind).toBe("none");
    expect(s.point).toEqual([3.1, 6.9]);
  });

  it("respects the tolerance", () => {
    expect(snapPoint([12, 0], { rings: [square] }, { toleranceM: 0.5 }).kind).toBe("none");
  });

  it("snaps across several rings", () => {
    const other: Ring = [[20, 20], [30, 20], [30, 30]];
    expect(snapPoint([20.1, 20.1], { rings: [square, other] }, opts).point).toEqual([20, 20]);
  });
});
