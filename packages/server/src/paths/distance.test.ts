import { describe, expect, it } from "vitest";
import { distanceToEdge } from "./distance";
import { cellIndex, walkableRaster } from "./raster";
import { floor, LEVEL, rect } from "./testing";

describe("distanceToEdge", () => {
  it("measures from each cell's centre to the nearest edge, and is 0 off the surface", () => {
    const r = walkableRaster(floor([{ footprint: rect(0, 0, 20, 4) }]), LEVEL);
    const d = distanceToEdge(r);
    expect(d[cellIndex(r, [10, 0.1])]!).toBeCloseTo(0.125, 5);
    expect(d[cellIndex(r, [10, 1.1])]!).toBeCloseTo(1.125, 5);
    expect(d[cellIndex(r, [10, 1.9])]!).toBeCloseTo(1.875, 5);
    expect(d[cellIndex(r, [10, 2.1])]!).toBeCloseTo(1.875, 5);
    expect(d[cellIndex(r, [10, -0.5])]!).toBe(0);
  });

  it("is straight-line distance, not a count of steps", () => {
    // Diagonally off a hole's corner: 3 cells across and 3 up from the nearest
    // cell in the hole, which is √18 cells, not 3 (chessboard) or 6 (city block).
    const r = walkableRaster(floor([{ footprint: rect(0, 0, 10, 10), holes: [rect(4, 4, 6, 6)] }]), LEVEL);
    const d = distanceToEdge(r);
    expect(d[cellIndex(r, [3.4, 3.4])]!).toBeCloseTo((Math.sqrt(18) - 0.5) * 0.25, 5);
  });
});
