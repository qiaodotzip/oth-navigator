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
/** Runs this close to each other agree (spec §5.2: 0.5%). */
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
 * - A run whose numbers straddle a rounding boundary sits in two lanes. The
 *   fuller lane is read, and a lane within LANE_TOLERANCE_PT of one already
 *   read as a run is skipped. So one printed run cannot agree with itself,
 *   even when a stray number puts the two lanes' rows a word apart.
 */
export function dimensionRuns(words: readonly Word[]): Run[] {
  const dims = words.filter(w => GRID_MM.test(w.text));
  const runs: Run[] = [];
  for (const axis of ["x", "y"] as const) {
    const along = (w: Word) => (axis === "x" ? w.x : w.y);
    const across = (w: Word) => (axis === "x" ? w.y : w.x);
    const lanes = new Map<number, number>();
    for (const d of dims) lanes.set(Math.round(across(d)), (lanes.get(Math.round(across(d))) ?? 0) + 1);
    const read: number[] = [];
    for (const [lane, n] of [...lanes].sort((p, q) => q[1] - p[1])) {
      if (n < MIN_RUN_WORDS) break;
      if (read.some(r => Math.abs(r - lane) < LANE_TOLERANCE_PT)) continue;
      const row = dims.filter(d => Math.abs(across(d) - lane) < LANE_TOLERANCE_PT).sort((p, q) => along(p) - along(q));
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
      if (pt > MIN_RUN_PT) {
        runs.push({ axis, mm, pt, words: [...used] });
        read.push(lane);
      }
    }
  }
  return runs;
}

/**
 * The largest group of runs within RUN_AGREEMENT of each other, or null when
 * no group has two, or another group is as large. A sheet whose runs split two
 * and two has two scales, and picking one would be a guess.
 */
function agreeing(runs: readonly Run[]): Run[] | null {
  const ratio = (r: Run) => r.mm / r.pt;
  const sorted = [...runs].sort((p, q) => ratio(p) - ratio(q));
  let best: Run[] = [];
  let tied = false;
  for (let i = 0; i < sorted.length; i++) {
    const least = ratio(sorted[i]!);
    let j = i;
    while (j + 1 < sorted.length && (ratio(sorted[j + 1]!) - least) / least < RUN_AGREEMENT) j++;
    // A group starting later that is as large ends later too: a different group.
    if (j + 1 - i > best.length) {
      best = sorted.slice(i, j + 1);
      tied = false;
    } else if (j + 1 - i === best.length) {
      tied = true;
    }
  }
  return best.length >= 2 && !tied ? best : null;
}

/**
 * Metres per point, from the sheet's own dimension strings (the script's
 * `calibrate`). Never the printed ratio: OTH's L1 sheet says 1:500 and is
 * out by 4.25×, and its 2020 sheets carry a scale bar that is out by 3×.
 * The scale is the one group of runs that agree with each other, and outnumber
 * any other group; it takes two at least. Anything else is no scale at all.
 */
export function calibrate(words: readonly Word[]): Calibration {
  const runs = dimensionRuns(words);
  if (runs.length < 2) return { metresPerPoint: null, runsAgree: 0, runsFound: runs.length, runs };
  const keep = agreeing(runs);
  if (!keep) return { metresPerPoint: null, runsAgree: 0, runsFound: runs.length, runs: [] };
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
