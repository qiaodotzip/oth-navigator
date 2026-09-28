import { describe, expect, it } from "vitest";
import { PAPER_SIZES, SHAPE_TOLERANCE, parseRatio, sheetScale } from "./sheetScale";

describe("parseRatio", () => {
  it.each([
    ["1:1500", 1500],
    ["1 : 1500", 1500],
    ["1500", 1500],
    [" 1:500 ", 500],
    ["1:1500.5", 1500.5],
  ])("reads %j as %d", (text, n) => {
    expect(parseRatio(text)).toBe(n);
  });

  it.each(["", "1:0", "0", "-5", "1:-5", "abc", "2:1500", "1:"])("refuses %j", text => {
    expect(parseRatio(text)).toBeNull();
  });
});

describe("sheetScale", () => {
  it("gives OTH's 2020 sheets 0.21 m per pixel: 420 mm at 1:1500 is 630 m, over 3000 px", () => {
    const s = sheetScale("A3", 1500, 3000, 2121);
    expect(s.metresPerPixel).toBeCloseTo(0.21, 10);
    expect(s.shapeMismatch).toBeLessThan(0.001);
  });

  it("reads the long side as the long side, however the sheet was scanned", () => {
    expect(sheetScale("A3", 1500, 2121, 3000).metresPerPixel).toBeCloseTo(0.21, 10);
  });

  it("scales with the paper and the ratio", () => {
    expect(sheetScale("A1", 1500, 3000, 2121).metresPerPixel).toBeCloseTo(0.4205, 10);
    // The drawn bar's 1:500 on the same sheet: the factor-of-three trap.
    expect(sheetScale("A3", 500, 3000, 2121).metresPerPixel).toBeCloseTo(0.07, 10);
  });

  it("notices an image that is not the sheet's shape — cropped, or trimmed to the drawing", () => {
    expect(sheetScale("A3", 1500, 3000, 1500).shapeMismatch).toBeGreaterThan(SHAPE_TOLERANCE);
  });

  it("knows the ISO A sizes, long side first", () => {
    expect(PAPER_SIZES.A3).toEqual([420, 297]);
    expect(PAPER_SIZES.A0).toEqual([1189, 841]);
  });
});
