import { describe, expect, it } from "vitest";
import { calibrate, describeCalibration, dimensionRuns } from "./calibrate";
import type { Word } from "./text";

const word = (text: string, x: number, y: number): Word => ({ text, x, y, box: { x0: x - 1, y0: y - 1, x1: x + 1, y1: y + 1 } });

/**
 * A printed run of grid dimensions. Each is centred in the bay it measures,
 * so the next one along sits half this bay and half the next further on.
 */
function run(axis: "x" | "y", lane: number, start: number, mm: readonly number[], metresPerPoint: number): Word[] {
  let at = start;
  return mm.map((value, i) => {
    if (i > 0) at += (mm[i - 1]! + value) / 2 / 1000 / metresPerPoint;
    return axis === "x" ? word(String(value), at, lane) : word(String(value), lane, at);
  });
}
const bays = (n: number, mm = 9000) => Array.from({ length: n }, () => mm);

describe("calibrate", () => {
  it("reads L1's 0.750504 m per point from its grid, as plan:l1 has it, and throws out the run that disagrees", () => {
    const L1 = 0.750504;
    const cal = calibrate([
      ...run("x", 89, 226, bays(22), L1),
      ...run("y", 138, 100, [7700, 7700, 8350, ...bays(23)], L1),
      // The real sheet's third run comes out at 0.7646 m per point: not the sheet's scale.
      ...run("x", 469, 300, bays(10, 7260), 0.7646),
    ]);
    expect(cal.metresPerPoint).toBeCloseTo(L1, 6);
    expect([cal.runsAgree, cal.runsFound]).toEqual([2, 3]);
  });

  it("reads OTH's 2020 A3 sheets at 1:1500 from their grid, which is 0.21 m per pixel, not the scale bar's 0.07", () => {
    const a3At1500 = (25.4 / 72 / 1000) * 1500;
    const cal = calibrate([
      ...run("x", 60, 100, bays(10), a3At1500),
      ...run("y", 40, 120, bays(10), a3At1500),
      // The title block's printed ratio, and a drawn bar marked 25 and 50 m that is 3× wrong: never read.
      word("SCALE", 1000, 800), word("1", 1030, 800), word(":", 1035, 800), word("500", 1045, 800),
      word("0", 1000, 780), word("25", 1020, 780), word("50", 1040, 780),
    ]);
    expect(cal.metresPerPoint).toBeCloseTo(a3At1500, 6);
    // The 2020 raster is this A3 sheet (1190.55 pt across) at 3000 px.
    expect((1190.55 * cal.metresPerPoint!) / 3000).toBeCloseTo(0.21, 4);
  });

  it("never reads a printed ratio: a sheet with no runs of dimensions has no scale", () => {
    const cal = calibrate([word("SCALE", 10, 10), word("1:500", 40, 10), word("1:1500", 80, 10)]);
    expect(cal).toMatchObject({ metresPerPoint: null, runsFound: 0 });
  });

  it("needs two runs that agree: one alone gives no scale", () => {
    expect(calibrate(run("x", 50, 0, bays(10), 0.75)).metresPerPoint).toBeNull();
  });

  // The runs below sit along the top and down the side, as on a sheet, never crossing.
  it("gives no scale when two runs disagree", () => {
    const cal = calibrate([...run("x", 50, 0, bays(10), 0.75), ...run("y", -30, 100, bays(10), 0.6)]);
    expect(cal).toMatchObject({ metresPerPoint: null, runsFound: 2 });
  });

  it("counts a run once when its numbers straddle two lanes", () => {
    // The script counted lanes by rounded position, so a run printed at 88.4 and 88.6 was two runs, and agreed with itself.
    const straddling = run("x", 0, 0, bays(16), 0.75).map((w, i) => ({ ...w, y: i % 2 ? 88.6 : 88.4 }));
    const cal = calibrate(straddling);
    expect(cal).toMatchObject({ metresPerPoint: null, runsFound: 1 });
  });

  it("keeps a run with one dimension missing: only the pair across the gap is left out", () => {
    const gappy = run("x", 50, 0, bays(12), 0.75).filter((_, i) => i !== 5);
    const cal = calibrate([...gappy, ...run("y", -30, 100, bays(10), 0.75)]);
    expect(cal.metresPerPoint).toBeCloseTo(0.75, 6);
  });

  it("keeps the pairs whose lettering wanders, which cancel over the run, as the script does", () => {
    // Every other number printed 2 pt late: the pairs are 14 and 10 pt apart, and the run is still 12 pt a bay.
    const wandering = run("x", 50, 0, bays(13), 0.75).map((w, i) => (i % 2 ? { ...w, x: w.x + 2 } : w));
    const cal = calibrate([...wandering, ...run("y", -30, 100, bays(10), 0.75)]);
    expect(cal.metresPerPoint).toBeCloseTo(0.75, 6);
  });

  it("does not count a run shorter than 50 points", () => {
    // Eight 1 m bays at 0.75 m per point span 9 pt.
    expect(dimensionRuns([...run("x", 50, 0, bays(8, 1000), 0.75)])).toEqual([]);
  });
});

describe("describeCalibration", () => {
  const none = { metresPerPoint: null, runsAgree: 0, runs: [] };
  it("says where the scale came from", () => {
    expect(describeCalibration({ metresPerPoint: 0.750511, runsAgree: 2, runsFound: 3, runs: [] }, true))
      .toBe("Scale from the drawing's grid: 0.7505 m per point, 2 of 3 dimension runs agree.");
  });
  it("says why there is none, and what to do", () => {
    expect(describeCalibration({ ...none, runsFound: 0 }, false)).toMatch(/^Not scaled: the drawing has no text to read a scale from, so it may be a scan\. Set it with Sheet scale or Measure scale\.$/);
    expect(describeCalibration({ ...none, runsFound: 0 }, true)).toMatch(/no runs of grid dimensions/);
    expect(describeCalibration({ ...none, runsFound: 1 }, true)).toMatch(/only 1 run of grid dimensions, and two must agree/);
    expect(describeCalibration({ ...none, runsFound: 3 }, true)).toMatch(/3 runs of grid dimensions disagree/);
  });
});
