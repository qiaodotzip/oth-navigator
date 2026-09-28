import type { PlanSheet, PlanSource } from "@oth/model";
import { describe, expect, it } from "vitest";
import type { LevelImage } from "../api/client";
import { placePlan } from "./placement";

const L1_SCALE = 0.7505;
const sheet = (over: Partial<PlanSheet> = {}): PlanSheet => ({
  page: 1, pageCount: 1, pageSizePt: [792, 612], rotation: 90, clipPt: [100, 50, 700, 560],
  pointsPerPixel: 0.07 / L1_SCALE, metresPerPoint: L1_SCALE, runsAgree: 2, runsFound: 3, ...over,
});
const source = (s: PlanSheet): PlanSource => ({ ...s, pdfId: "pdf_1", checksum: "a".repeat(64), filename: "L1.pdf" });
const image = (over: Partial<LevelImage> = {}): LevelImage => ({
  id: "img_below", levelId: "oth-L1", filename: "L1.jpg", widthPx: 6000, heightPx: 5000, sizeBytes: 1,
  metresPerPixel: 0.07, offsetX: -25, offsetY: 300, opacity: 0.6, version: 3, source: source(sheet()), ...over,
});
const plan = (s: PlanSheet, metresPerPixel: number | null = 0.07) => ({ sheet: s, widthPx: 4000, heightPx: 3000, metresPerPixel });

describe("placePlan", () => {
  it("puts a sheet of the same set exactly where the floor below's sits: one CAD set shares its viewport", () => {
    const placed = placePlan(plan(sheet({ clipPt: [120, 40, 690, 580] })), null, image());
    expect(placed.how).toBe("same-sheet");
    // 20 pt east and 10 pt north of the floor below's window, at 0.7505 m a point.
    expect(placed.offsetX).toBeCloseTo(-25 + 20 * L1_SCALE, 6);
    expect(placed.offsetY).toBeCloseTo(300 + 10 * L1_SCALE, 6);
  });

  it("prefers the plan it replaces when that was the same sheet: a new revision keeps its place", () => {
    const current = image({ id: "img_current", offsetX: 5, offsetY: 280 });
    const placed = placePlan(plan(sheet()), current, image());
    expect(placed).toMatchObject({ how: "same-sheet", offsetX: 5, offsetY: 280 });
    expect(placed.on?.id).toBe("img_current");
  });

  it("centres a sheet of another size on the floor below's plan", () => {
    const placed = placePlan(plan(sheet({ pageSizePt: [1190.55, 841.89] }), 0.05), null, image());
    expect(placed.how).toBe("centred");
    // The floor below's centre is (185, 125); this plan is 200 × 150 m.
    expect(placed.offsetX).toBeCloseTo(185 - 100, 6);
    expect(placed.offsetY).toBeCloseTo(125 + 75, 6);
  });

  it("does not take a sheet more than 0.5% off in scale for the same set", () => {
    expect(placePlan(plan(sheet({ metresPerPoint: 0.76 })), null, image()).how).toBe("centred");
  });

  it("reads the floor below at the scale it has now, after a hand correction", () => {
    // 1% more metres per pixel on the same render is 1% more metres per point: not the same set any more.
    expect(placePlan(plan(sheet()), null, image({ metresPerPixel: 0.0707 })).how).toBe("centred");
  });

  it("centres on a floor below whose plan came from an image", () => {
    expect(placePlan(plan(sheet()), null, image({ source: null })).how).toBe("centred");
  });

  it("leaves an unscaled plan, or one with nothing to go by, at the origin for Align", () => {
    expect(placePlan(plan(sheet(), null), null, image())).toMatchObject({ how: "unplaced", offsetX: 0, offsetY: 0 });
    expect(placePlan(plan(sheet()), null, null)).toMatchObject({ how: "unplaced", offsetX: 0, offsetY: 0 });
  });
});
