import { describe, expect, it } from "vitest";
import { placementTransform } from "./placementTransform";

describe("placementTransform", () => {
  it("stands a placement where the plan puts it, its height up Y and north toward -Z", () => {
    expect(placementTransform({ position: [10, -3, 0.5], rotationDeg: 0, scale: 1 }).position).toEqual([10, 0.5, 3]);
  });

  it("turns it about the vertical axis, in radians", () => {
    expect(placementTransform({ position: [0, 0, 0], rotationDeg: 90, scale: 1 }).rotationY).toBeCloseTo(Math.PI / 2);
  });

  it("keeps its scale", () => {
    expect(placementTransform({ position: [0, 0, 0], rotationDeg: 0, scale: 2.5 }).scale).toBe(2.5);
  });
});
