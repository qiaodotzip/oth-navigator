import type { Word } from "./text";
import { GRID_MM } from "./words";

/** A run is a line of at least this many dimensions sharing a coordinate. */
export const MIN_RUN_WORDS = 8;
export const LANE_TOLERANCE_PT = 6;
/** A run shorter than this on paper is too short to trust. */
export const MIN_RUN_PT = 50;
/**
 * A pair spaced more than 1.5× its run's own spacing, or less than 2/3 of it,
 * has a dimension missing between them or a stray number in between. The band
 * is as wide as the script's, so the pairs that wander with the lettering
 * stay in, and cancel over the run (checked on L1: 0.750511, 2 of 3, as the
 * script finds).
 */
export const PAIR_BAND = [2 / 3, 1.5] as const;
/** Runs this close to the median are the sheet's scale (spec §5.2: 0.5%). */
export const RUN_AGREEMENT = 0.005;
const PLAUSIBLE_M_PER_PT = [0.001, 10] as const;

export type Run = { axis: "x" | "y"; mm: number; pt: number; words: Word[] };
export type Calibration = { metresPerPoint: number | null; runsAgree: number; runsFound: number; runs: Run[] };

/** The upper median, as the script takes it. */
const median = (values: readonly number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!;

/**
 * The sheet's runs of grid dimensions, the script's way. A dimension is
 * printed centred in the bay it measures, so the gap between two neighbours
 * is the mean of their bays. Individual gaps wander with the lettering; the
 * sum over a whole run does not.
 *
 * Two departures from the script, both on purpose:
 * - A pair is judged against its own run's spacing (PAIR_BAND). The script
 *   bounded the spacing to 0.5–2 m per point instead. That was right for L1
 *   (0.75), but it would throw out a sheet drawn at 1:100 altogether.
 * - A run whose numbers straddle a rounding boundary sits in two lanes. It is
 *   still counted once, so it cannot agree with itself.
 */
export function dimensionRuns(words: readonly Word[]): Run[] {
  const dims = words.filter(w => GRID_MM.test(w.text));
  const runs: Run[] = [];
  for (const axis of ["x", "y"] as const) {
    const along = (w: Word) => (axis === "x" ? w.x : w.y);
    const across = (w: Word) => (axis === "x" ? w.y : w.x);
    const lanes = new Map<number, number>();
    for (const d of dims) lanes.set(Math.round(across(d)), (lanes.get(Math.round(across(d))) ?? 0) + 1);
    const counted = new Set<string>();
    for (const [lane, n] of lanes) {
      if (n < MIN_RUN_WORDS) continue;
      const row = dims.filter(d => Math.abs(across(d) - lane) < LANE_TOLERANCE_PT).sort((p, q) => along(p) - along(q));
      const key = row.map(d => dims.indexOf(d)).join(",");
      if (counted.has(key)) continue;
      counted.add(key);
      const pairs: { gap: number; span: number; a: Word; b: Word }[] = [];
      for (let i = 0; i + 1 < row.length; i++) {
        const a = row[i]!;
        const b = row[i + 1]!;
        const gap = along(b) - along(a);
        if (gap > 0) pairs.push({ gap, span: (Number(a.text) + Number(b.text)) / 2, a, b });
      }
      if (pairs.length === 0) continue;
      const spacing = median(pairs.map(p => p.gap / p.span));
      let mm = 0;
      let pt = 0;
      const used = new Set<Word>();
      for (const p of pairs) {
        const relative = p.gap / p.span / spacing;
        if (!(relative > PAIR_BAND[0] && relative < PAIR_BAND[1])) continue;
        mm += p.span;
        pt += p.gap;
        used.add(p.a);
        used.add(p.b);
      }
      if (pt > MIN_RUN_PT) runs.push({ axis, mm, pt, words: [...used] });
    }
  }
  return runs;
}

/**
 * Metres per point, from the sheet's own dimension strings (the script's
 * `calibrate`). Never the printed ratio: OTH's L1 sheet says 1:500 and is
 * out by 4.25×, and its 2020 sheets carry a scale bar that is out by 3×.
 * The agreeing majority is the scale: the median, and the runs within 0.5%
 * of it. Fewer than two agreeing runs is no scale at all.
 */
export function calibrate(words: readonly Word[]): Calibration {
  const runs = dimensionRuns(words);
  if (runs.length < 2) return { metresPerPoint: null, runsAgree: 0, runsFound: runs.length, runs };
  const mid = median(runs.map(r => r.mm / r.pt));
  const keep = runs.filter(r => Math.abs(r.mm / r.pt - mid) / mid < RUN_AGREEMENT);
  if (keep.length < 2) return { metresPerPoint: null, runsAgree: keep.length, runsFound: runs.length, runs: keep };
  const metresPerPoint = keep.reduce((s, r) => s + r.mm, 0) / keep.reduce((s, r) => s + r.pt, 0) / 1000;
  if (metresPerPoint < PLAUSIBLE_M_PER_PT[0] || metresPerPoint > PLAUSIBLE_M_PER_PT[1]) {
    return { metresPerPoint: null, runsAgree: 0, runsFound: runs.length, runs: [] };
  }
  return { metresPerPoint, runsAgree: keep.length, runsFound: runs.length, runs: keep };
}

/** What the Floorplan step says about a PDF's scale (spec §5.2 step 2). */
export function describeCalibration(cal: Calibration, hasText: boolean): string {
  if (cal.metresPerPoint != null) {
    return `Scale from the drawing's grid: ${cal.metresPerPoint.toFixed(4)} m per point, ` +
      `${cal.runsAgree} of ${cal.runsFound} dimension runs agree.`;
  }
  const how = "Set it with Sheet scale or Measure scale.";
  if (!hasText) return `Not scaled: the drawing has no text to read a scale from, so it may be a scan. ${how}`;
  if (cal.runsFound === 0) return `Not scaled: the drawing has no runs of grid dimensions to read a scale from. ${how}`;
  if (cal.runsFound === 1) return `Not scaled: the drawing has only 1 run of grid dimensions, and two must agree. ${how}`;
  return `Not scaled: the drawing's ${cal.runsFound} runs of grid dimensions disagree. ${how}`;
}
