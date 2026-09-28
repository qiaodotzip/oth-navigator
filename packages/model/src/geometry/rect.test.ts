import { describe, expect, it } from "vitest";
import type { Vec2 } from "../primitives";
import { minAreaRect, rectCorners } from "./rect";

describe("minAreaRect", () => {
  it("finds the long axis of an upright rectangle", () => {
    const r = minAreaRect([[0, 0], [2, 0], [2, 10], [0, 10]]);
    expect(r.centre[0]).toBeCloseTo(1);
    expect(r.centre[1]).toBeCloseTo(5);
    expect(r.halfLength).toBeCloseTo(5);
    expect(r.halfWidth).toBeCloseTo(1);
    expect(r.axis[0]).toBeCloseTo(0);
    expect(r.axis[1]).toBeCloseTo(1);
  });

  it("follows a rectangle drawn at an angle", () => {
    const a = Math.PI / 6;
    const u: Vec2 = [Math.cos(a), Math.sin(a)];
    const v: Vec2 = [-Math.sin(a), Math.cos(a)];
    const at = (s: number, t: number): Vec2 => [s * u[0] + t * v[0], s * u[1] + t * v[1]];
    const r = minAreaRect([at(0, 0), at(12, 0), at(12, 1.5), at(0, 1.5)]);
    expect(r.halfLength).toBeCloseTo(6);
    expect(r.halfWidth).toBeCloseTo(0.75);
    expect(Math.abs(r.axis[0] * u[0] + r.axis[1] * u[1])).toBeCloseTo(1);
  });

  it("encloses every point of a ragged outline", () => {
    const ring: Vec2[] = [[0, 0], [3, 0.2], [6, 0], [6.3, 2], [6, 4], [3, 3.7], [0, 4], [0.4, 2]];
    const r = minAreaRect(ring);
    for (const [x, y] of ring) {
      const dx = x - r.centre[0];
      const dy = y - r.centre[1];
      expect(Math.abs(dx * r.axis[0] + dy * r.axis[1])).toBeLessThanOrEqual(r.halfLength + 1e-9);
      expect(Math.abs(-dx * r.axis[1] + dy * r.axis[0])).toBeLessThanOrEqual(r.halfWidth + 1e-9);
    }
  });

  it("points its axis east, whichever way round the ring runs", () => {
    const r = minAreaRect([[10, 0], [10, 2], [0, 2], [0, 0]]);
    expect(r.axis[0]).toBeCloseTo(1);
  });
});

describe("rectCorners", () => {
  it("gives the four corners counter-clockwise", () => {
    const corners = rectCorners({ centre: [5, 1], axis: [1, 0], halfLength: 5, halfWidth: 1 });
    expect(corners.map(([x, y]) => [Math.round(x), Math.round(y)])).toEqual([[0, 0], [10, 0], [10, 2], [0, 2]]);
  });
});
