import { describe, expect, it } from "vitest";
import {
  fitViewport, panViewport, screenToWorld, worldToScreen, zoomViewport, type Viewport,
} from "./viewport";

const vp: Viewport = { originX: 0, originY: 0, scale: 10 };

describe("worldToScreen", () => {
  it("puts the world origin at the viewport origin", () => {
    expect(worldToScreen(vp, [0, 0])).toEqual([0, 0]);
  });

  it("scales metres to pixels", () => {
    expect(worldToScreen(vp, [3, 0])).toEqual([30, 0]);
  });

  it("flips y, because screen y grows downward and world y is north", () => {
    expect(worldToScreen(vp, [0, 3])).toEqual([0, -30]);
  });

  it("applies the pan origin", () => {
    expect(worldToScreen({ ...vp, originX: 5, originY: 2 }, [0, 0])).toEqual([5, 2]);
  });
});

describe("screenToWorld", () => {
  it("inverts worldToScreen", () => {
    const p: [number, number] = [12.5, -4.25];
    const [sx, sy] = worldToScreen(vp, p);
    const [wx, wy] = screenToWorld(vp, [sx, sy]);
    expect(wx).toBeCloseTo(p[0]);
    expect(wy).toBeCloseTo(p[1]);
  });

  it("inverts under a pan and zoom too", () => {
    const moved = zoomViewport(panViewport(vp, 40, -15), 2, [100, 100]);
    const [sx, sy] = worldToScreen(moved, [7, -3]);
    const [wx, wy] = screenToWorld(moved, [sx, sy]);
    expect(wx).toBeCloseTo(7);
    expect(wy).toBeCloseTo(-3);
  });
});

describe("panViewport", () => {
  it("shifts the origin by the pixel delta", () => {
    expect(panViewport(vp, 10, -4)).toEqual({ originX: 10, originY: -4, scale: 10 });
  });
});

describe("zoomViewport", () => {
  it("multiplies the scale", () => {
    expect(zoomViewport(vp, 2, [0, 0]).scale).toBe(20);
  });

  it("keeps the world point under the anchor fixed", () => {
    const anchor: [number, number] = [123, 77];
    const before = screenToWorld(vp, anchor);
    const after = screenToWorld(zoomViewport(vp, 2.5, anchor), anchor);
    expect(after[0]).toBeCloseTo(before[0]);
    expect(after[1]).toBeCloseTo(before[1]);
  });

  it("clamps to a sane range so the canvas cannot be zoomed into uselessness", () => {
    expect(zoomViewport(vp, 1e9, [0, 0]).scale).toBeLessThanOrEqual(500);
    expect(zoomViewport(vp, 1e-9, [0, 0]).scale).toBeGreaterThanOrEqual(0.1);
  });
});

describe("fitViewport", () => {
  it("fits a bounding box into the canvas", () => {
    expect(fitViewport({ minX: 0, minY: 0, maxX: 100, maxY: 50 }, 800, 600, 0).scale).toBeCloseTo(8);
  });

  it("fits by the tighter axis", () => {
    expect(fitViewport({ minX: 0, minY: 0, maxX: 100, maxY: 100 }, 800, 400, 0).scale).toBeCloseTo(4);
  });

  it("centres the box", () => {
    const fitted = fitViewport({ minX: 0, minY: 0, maxX: 100, maxY: 50 }, 800, 600, 0);
    const [cx, cy] = worldToScreen(fitted, [50, 25]);
    expect(cx).toBeCloseTo(400);
    expect(cy).toBeCloseTo(300);
  });

  it("falls back to a usable viewport for an empty box", () => {
    const fitted = fitViewport(
      { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }, 800, 600,
    );
    expect(Number.isFinite(fitted.scale)).toBe(true);
    expect(fitted.scale).toBeGreaterThan(0);
  });
});
