import { describe, expect, it } from "vitest";
import { openPdf } from "./pdfjs";
import {
  PIXEL_BUDGET, drawingWindow, fitBudget, normaliseRotation, readSheet, renderMetresPerPixel,
  sheetToModel, unscaledPointsPerPixel,
} from "./sheet";
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
