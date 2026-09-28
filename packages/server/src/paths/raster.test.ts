import type { Vec2 } from "@oth/model";
import { describe, expect, it } from "vitest";
import { cellCentre, cellIndex, SurfaceTooLarge, walkableAt, walkableRaster, type Raster } from "./raster";
import { floor, LEVEL, rect } from "./testing";

const at = (r: Raster, x: number, y: number) => walkableAt(r, [x, y]);
const cellCount = (r: Raster) => r.cells.reduce((sum, v) => sum + v, 0);
const areaM2 = (r: Raster) => cellCount(r) * r.cellM * r.cellM;

/** How many walkable cells can be reached from `from` through their sides. */
function reach(r: Raster, from: Vec2): number {
  const start = cellIndex(r, from);
  const seen = new Uint8Array(r.cells.length);
  const stack = [start];
  seen[start] = 1;
  let count = 0;
  while (stack.length > 0) {
    const i = stack.pop()!;
    count++;
    for (const j of [i - 1, i + 1, i - r.cols, i + r.cols]) {
      if (r.cells[j] && !seen[j]) {
        seen[j] = 1;
        stack.push(j);
      }
    }
  }
  return count;
}

describe("walkableRaster", () => {
  it("covers a walkable room at 0.25 m, cell by cell centre, and nothing else", () => {
    const r = walkableRaster(floor([{ footprint: rect(0, 0, 10, 4) }]), LEVEL);
    expect(r.cellM).toBe(0.25);
    expect(areaM2(r)).toBeCloseTo(40);
    expect(at(r, 5, 2)).toBe(true);
    expect(at(r, 0.1, 0.1)).toBe(true);
    expect(at(r, -0.1, 2)).toBe(false);
    expect(at(r, 10.1, 2)).toBe(false);
  });

  it("leaves a room's holes out", () => {
    const r = walkableRaster(floor([{ footprint: rect(0, 0, 10, 10), holes: [rect(4, 4, 6, 6)] }]), LEVEL);
    expect(at(r, 5, 5)).toBe(false);
    expect(areaM2(r)).toBeCloseTo(96);
  });

  it("makes one surface of rooms that overlap or abut: the union, with no clipping", () => {
    const r = walkableRaster(floor([
      { footprint: rect(0, 0, 10, 4) },
      { footprint: rect(8, 0, 20, 4) },
      { footprint: rect(20, 0, 24, 4) },
    ]), LEVEL);
    expect(areaM2(r)).toBeCloseTo(96);
    expect(reach(r, [1, 1])).toBe(cellCount(r));
  });

  it("bridges the drawing's wall between two walkable rooms, up to 0.5 m, and no wider", () => {
    const joined = walkableRaster(floor([{ footprint: rect(0, 0, 10, 4) }, { footprint: rect(10.3, 0, 20, 4) }]), LEVEL);
    expect(at(joined, 10.15, 2)).toBe(true);
    expect(reach(joined, [1, 1])).toBe(cellCount(joined));
    const apart = walkableRaster(floor([{ footprint: rect(0, 0, 10, 4) }, { footprint: rect(11, 0, 20, 4) }]), LEVEL);
    expect(at(apart, 10.5, 2)).toBe(false);
  });

  it("cuts out what stands on the surface and is not walked on: a room, a service space, a void", () => {
    const r = walkableRaster(floor([
      { footprint: rect(0, 0, 30, 10) },
      { footprint: rect(2, 2, 6, 6), kind: "room", walkable: false },
      { footprint: rect(10, 2, 14, 6), kind: "service", walkable: false },
      { footprint: rect(18, 2, 22, 6), kind: "void" },
    ]), LEVEL);
    expect(at(r, 4, 4)).toBe(false);
    expect(at(r, 12, 4)).toBe(false);
    expect(at(r, 20, 4)).toBe(false);
    expect(at(r, 8, 4)).toBe(true);
    expect(at(r, 26, 8)).toBe(true);
  });

  it("walks straight over details: furniture is not a hole", () => {
    const r = walkableRaster(floor([
      { footprint: rect(0, 0, 10, 10) },
      { footprint: rect(4, 4, 6, 6), kind: "detail", walkable: false },
    ]), LEVEL);
    expect(at(r, 5, 5)).toBe(true);
  });

  it("drops the sliver left between two shops standing on a walkable hall", () => {
    // The shops are 0.4 m apart: the drawing's wall between them, not a way through.
    const r = walkableRaster(floor([
      { footprint: rect(0, 0, 20, 12) },
      { footprint: rect(4, 4, 10, 12), kind: "room", walkable: false },
      { footprint: rect(10.4, 4, 16, 12), kind: "room", walkable: false },
    ]), LEVEL);
    expect(at(r, 10.2, 8)).toBe(false);
    expect(at(r, 10.2, 2)).toBe(true);
  });

  it("reads only this floor's live rooms, and only the walkable ones", () => {
    const r = walkableRaster(floor([
      { footprint: rect(0, 0, 10, 4) },
      { footprint: rect(20, 0, 30, 4), levelId: "oth-L2" },
      { footprint: rect(40, 0, 50, 4), deletedAt: "2026-09-28T10:00:00.000Z" },
      { footprint: rect(60, 0, 70, 4), walkable: false },
    ]), LEVEL);
    expect(areaM2(r)).toBeCloseTo(40);
    expect([at(r, 25, 2), at(r, 45, 2), at(r, 65, 2)]).toEqual([false, false, false]);
  });

  it("is empty for a floor with no walkable room", () => {
    const r = walkableRaster(floor([{ footprint: rect(0, 0, 10, 4), walkable: false }]), LEVEL);
    expect([r.cols, r.rows, r.cells.length]).toEqual([0, 0, 0]);
  });

  it("refuses a surface over a kilometre square rather than fill the server's memory", () => {
    const stray = floor([{ footprint: rect(0, 0, 10, 4) }, { footprint: rect(2000, 2000, 2010, 2004) }]);
    expect(() => walkableRaster(stray, LEVEL)).toThrow(SurfaceTooLarge);
    expect(() => walkableRaster(stray, LEVEL)).toThrow(/span 2010 by 2004 m/);
  });

  it("keeps a margin all round, so no walkable cell is on the raster's edge", () => {
    const r = walkableRaster(floor([{ footprint: rect(-3.1, 7.2, 12.9, 11) }]), LEVEL);
    let onEdge = 0;
    for (let col = 0; col < r.cols; col++) onEdge += r.cells[col]! + r.cells[(r.rows - 1) * r.cols + col]!;
    for (let row = 0; row < r.rows; row++) onEdge += r.cells[row * r.cols]! + r.cells[row * r.cols + r.cols - 1]!;
    expect(onEdge).toBe(0);
  });
});

describe("cellIndex and cellCentre", () => {
  it("agree with each other, and say -1 off the raster", () => {
    const r = walkableRaster(floor([{ footprint: rect(0, 0, 10, 4) }]), LEVEL);
    expect(cellCentre(r, cellIndex(r, [3.1, 2.2]))).toEqual([3.125, 2.125]);
    expect(cellIndex(r, [-100, 0])).toBe(-1);
  });
});
