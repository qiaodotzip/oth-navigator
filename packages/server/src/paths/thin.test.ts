import { describe, expect, it } from "vitest";
import { cellCentre, walkableRaster, type Raster } from "./raster";
import { thin } from "./thin";
import { floor, LEVEL, rect, type Pt } from "./testing";

/** Each skeleton pixel's count of set neighbours, by pixel. */
function degrees(img: Uint8Array, r: Raster): Map<number, number> {
  const around = [-r.cols - 1, -r.cols, -r.cols + 1, -1, 1, r.cols - 1, r.cols, r.cols + 1];
  const out = new Map<number, number>();
  for (let i = 0; i < img.length; i++) if (img[i]) out.set(i, around.filter(o => img[i + o]).length);
  return out;
}

describe("thin", () => {
  it("thins a corridor to one line of pixels down its middle", () => {
    const r = walkableRaster(floor([{ footprint: rect(0, 0, 20, 4) }]), LEVEL);
    const skeleton = thin(r);
    const d = degrees(skeleton, r);
    expect(d.size).toBe(64);
    for (const [i, n] of d) {
      expect(Math.abs(cellCentre(r, i)[1] - 2)).toBeLessThan(0.2);
      expect(n).toBeLessThanOrEqual(2);
    }
    expect([...d.values()].filter(n => n === 1)).toHaveLength(2);
  });

  // Zhang and Suen alone leaves a corner pixel wherever this loop turns 45°,
  // which reads as a fork: this is the test that pins the corner step.
  it("keeps the loop round a hole, with every pixel on it having two neighbours", () => {
    const r = walkableRaster(floor([{ footprint: rect(0, 0, 30, 20), holes: [rect(10, 7, 20, 13)] }]), LEVEL);
    const d = degrees(thin(r), r);
    expect(d.size).toBeGreaterThan(200);
    expect([...d.values()].every(n => n === 2)).toBe(true);
  });

  it("thins a diagonal corridor to one line with two ends and no fork", () => {
    // 3 m wide, running north-east for 28 m.
    const h = 1.5 / Math.SQRT2;
    const footprint: Pt[] = [[-h, h], [h, -h], [20 + h, 20 - h], [20 - h, 20 + h]];
    const r = walkableRaster(floor([{ footprint }]), LEVEL);
    const d = degrees(thin(r), r);
    expect([...d.values()].filter(n => n >= 3)).toEqual([]);
    expect([...d.values()].filter(n => n === 1)).toHaveLength(2);
  });

  it("does not change the raster it is given", () => {
    const r = walkableRaster(floor([{ footprint: rect(0, 0, 20, 4) }]), LEVEL);
    const before = r.cells.slice();
    thin(r);
    expect(r.cells).toEqual(before);
  });
});
