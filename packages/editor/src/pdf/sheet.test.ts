import { describe, expect, it } from "vitest";
import type { Run } from "./calibrate";
import { openPdf } from "./pdfjs";
import {
  PIXEL_BUDGET, drawingWindow, fitBudget, normaliseRotation, readSheet, renderMetresPerPixel,
  sheetToModel, unscaledPointsPerPixel, windowMarks,
} from "./sheet";
import type { TextItem, Word } from "./text";
import { PLAN_SHEET_SCALE, planSheet, syntheticPdf } from "./testing/syntheticPdf";

describe("renderMetresPerPixel", () => {
  it("is 0.05, or 0.07 for a sheet wider than 400 m", () => {
    expect(renderMetresPerPixel(400)).toBe(0.05);
    expect(renderMetresPerPixel(400.1)).toBe(0.07);
  });
  it("gives L1's sheet (792 pt at 0.750504 m per point) the 0.07 plan:l1 rendered it at", () => {
    expect(renderMetresPerPixel(792 * 0.750504)).toBe(0.07);
  });
});

describe("drawingWindow", () => {
  const page = { width: 400, height: 300 };
  it("is the whole sheet when there is no scale, or nothing to go round", () => {
    expect(drawingWindow(page, [{ x0: 10, y0: 10, x1: 20, y1: 20 }], null)).toEqual({ x0: 0, y0: 0, x1: 400, y1: 300 });
    expect(drawingWindow(page, [], 0.5)).toEqual({ x0: 0, y0: 0, x1: 400, y1: 300 });
  });
  it("goes 10 m round the marks, and no further than the sheet", () => {
    expect(drawingWindow(page, [{ x0: 100, y0: 5, x1: 200, y1: 100 }, { x0: 150, y0: 50, x1: 390, y1: 60 }], 0.5))
      .toEqual({ x0: 80, y0: 0, x1: 400, y1: 120 });
  });
});

describe("windowMarks", () => {
  // A grid dimensioned from (50, 50) to (230, 230), at 0.5 m per point: 30 m is 60 pt.
  const dim = (x: number, y: number): Word => ({ text: "9000", x, y, box: { x0: x - 1, y0: y - 1, x1: x + 1, y1: y + 1 } });
  const runs: Run[] = [
    { axis: "x", mm: 90_000, pt: 180, words: [dim(50, 50), dim(230, 50)] },
    { axis: "y", mm: 90_000, pt: 180, words: [dim(50, 50), dim(50, 230)] },
  ];
  const label = (text: string, x0: number, y: number): TextItem => ({ text, box: { x0, y0: y - 1, x1: x0 + 20, y1: y + 1 }, ux: 1, uy: 0 });
  const shop = label("SHOP", 120, 140);
  // 20 m past the grid's last dimension, as a kiosk on a building's edge is.
  const kiosk = label("KIOSK", 231 + 40, 140);
  // 100 m past it, as the name of the building next door is.
  const neighbour = label("OCBC TAMPINES CENTRE 2", 231 + 200, 140);

  it("goes round the agreeing runs, and the names of spaces within 30 m of them", () => {
    const marks = windowMarks([shop, kiosk, neighbour], runs);
    expect(marks).toEqual([{ x0: 49, y0: 49, x1: 231, y1: 231 }, shop.box, kiosk.box]);
    // So the window stops 10 m past the kiosk, and never reaches next door.
    expect(drawingWindow({ width: 800, height: 400 }, marks, 0.5).x1).toBe(kiosk.box.x1 + 20);
  });

  it("never goes round a line that only marks an edge", () => {
    expect(windowMarks([label("TUNNEL OUTER LINE", 120, 100)], runs)).toEqual([{ x0: 49, y0: 49, x1: 231, y1: 231 }]);
  });

  it("has nothing to go round without runs to anchor it, so the whole sheet is drawn", () => {
    expect(windowMarks([shop, kiosk], [])).toEqual([]);
  });
});

describe("fitBudget", () => {
  it("keeps the resolution asked for when the window fits", () => {
    expect(fitBudget({ x0: 0, y0: 0, x1: 400, y1: 300 }, 0.5, 0.05)).toBe(0.05);
  });
  it("coarsens it just enough to fit the pixel budget", () => {
    const window = { x0: 0, y0: 0, x1: 1000, y1: 1000 };
    const mpp = fitBudget(window, 1, 0.05);
    expect(mpp).toBe(0.167);
    expect((1000 / mpp) ** 2).toBeLessThanOrEqual(PIXEL_BUDGET);
  });
});

describe("unscaledPointsPerPixel", () => {
  it("draws a sheet with no scale at 4 pixels a point, with no side over 8000 px", () => {
    expect(unscaledPointsPerPixel({ x0: 0, y0: 0, x1: 400, y1: 300 })).toBe(0.25);
    expect(unscaledPointsPerPixel({ x0: 0, y0: 0, x1: 4000, y1: 300 })).toBe(0.5);
  });
  it("keeps an A0 sheet with no scale within the pixel budget, which 8000 px a side alone would not", () => {
    // 8000 px across an A0 sheet (3370 × 2384 pt) is 8000 × 5659 px: 45 Mpx.
    const a0 = { x0: 0, y0: 0, x1: 3370, y1: 2384 };
    const pointsPerPixel = unscaledPointsPerPixel(a0);
    expect(pointsPerPixel).toBeGreaterThan(3370 / 8000);
    expect((3370 / pointsPerPixel) * (2384 / pointsPerPixel) / PIXEL_BUDGET).toBeCloseTo(1, 6);
  });
});

describe("sheetToModel", () => {
  const sheet = { clipPt: [100, 50, 700, 560] as const, pointsPerPixel: 0.1 };
  it("puts the window's corner at the plan's offset, x east and y north", () => {
    const toModel = sheetToModel(sheet, { metresPerPixel: 0.05, offsetX: -25, offsetY: 300 });
    expect(toModel(100, 50)).toEqual([-25, 300]);
    expect(toModel(110, 60)).toEqual([-20, 295]);
  });
  it("follows the plan when Align moves it, or Measure scale rescales it", () => {
    const moved = sheetToModel(sheet, { metresPerPixel: 0.05, offsetX: 0, offsetY: 0 });
    expect(moved(110, 60)).toEqual([5, -5]);
    // Twice the metres per pixel on the same pixels is twice the metres per point, about the same corner.
    const rescaled = sheetToModel(sheet, { metresPerPixel: 0.1, offsetX: 0, offsetY: 0 });
    expect(rescaled(110, 60)).toEqual([10, -10]);
  });
});

describe("normaliseRotation", () => {
  it("reads any turn as one of four", () => {
    expect([0, 90, 180, 270, 360, -90, 450].map(normaliseRotation)).toEqual([0, 90, 180, 270, 0, 270, 90]);
  });
});

describe("readSheet", () => {
  it("reads the sheet's size, its scale, and a window round the drawing that leaves the title block out", async () => {
    const { doc, close } = await openPdf(syntheticPdf([{ width: 400, height: 300, content: planSheet() }]));
    try {
      const r = await readSheet(await doc.getPage(1));
      expect([r.width, r.height, r.rotation]).toEqual([400, 300, 0]);
      expect(r.calibration.metresPerPoint).toBeCloseTo(PLAN_SHEET_SCALE, 6);
      expect([r.calibration.runsAgree, r.calibration.runsFound]).toEqual([2, 2]);
      // The side run's left edge (56.5 pt) and the top run's last number (225.7 pt), with 20 pt (10 m) round them.
      expect(r.window.x0).toBeCloseTo(36.5, 0);
      expect(r.window.x1).toBeCloseTo(245.7, 0);
      expect(r.window.y0).toBeCloseTo(78.5, 0);
      expect(r.window.y1).toBeCloseTo(291.7, 0);
    } finally {
      await close();
    }
  });
});
