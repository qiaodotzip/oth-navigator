import type { BBox, RoomKind } from "@oth/model";
import { bestName, groupLabels, isJunk, isWording, kindOf, tidy, type ModelLine } from "./labels";
import {
  Flooder, and, clean, cleanPad, cropLike, countSet, dilate, dropCollinear, erode, firstSet,
  invert, loops, nearest, rdp, regionWindow, type Grid, type Pt, type Window,
} from "./raster";
import { FLIGHT_WORDS, NOT_A_NAME, OPEN_WORDS, ROOMY, hasWordIn } from "./words";

export const PINCH_M = 0.5;
export const LABEL_PAD_M = 0.35;
export const MIN_AREA_M2 = 3;
export const MAX_AREA_M2 = 2500;
export const SIMPLIFY_M = 0.4;
export const MIN_HOLE_M2 = 6;
/** The longest name a draft takes (`RoomDraftSchema`): one label longer would fail the whole save. */
export const MAX_NAME_CHARS = 200;

/** A raster of the plan as it is placed now, and its text in model metres. */
export type FindInput = {
  /** 1 where the drawing has ink, row-major. Not changed: the lettering is erased from the open floor, a grid of its own. */
  ink: Uint8Array;
  width: number;
  height: number;
  metresPerPixel: number;
  /** Model metres of the raster's top-left corner. */
  originX: number;
  originY: number;
  lines: ModelLine[];
};

/** A draft as the finder makes it: `RoomDraftInput`'s shape. */
export type RoomCandidate = {
  nameEn: string;
  kind: RoomKind;
  /** Absent for a space the drawing leaves open. */
  footprint?: Pt[];
  holes?: Pt[][];
  labelPoint: Pt;
  areaM2: number;
};
/** A label left out on purpose (escalators and stairs), with where it is: Part D draws those as flights. */
export type SkippedLabel = { text: string; at: Pt };
export type FindResult = { drafts: RoomCandidate[]; skippedLabels: SkippedLabel[] };

type Row = { labels: string[]; areaM2: number; footprint: Pt[]; holes: Pt[][]; labelPoint: Pt };

const round2 = (v: number) => Math.round(v * 100) / 100;
const capName = (name: string) => name.slice(0, MAX_NAME_CHARS).trimEnd();
const clampTo = (v: number, hi: number) => Math.min(Math.max(v, 0), hi);

function boxAreaPx(ring: readonly Pt[]): number {
  const xs = ring.map(p => p[0]);
  const ys = ring.map(p => p[1]);
  return (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
}

/**
 * The script's method (spec §5.2 step 5), over a raster of the plan as it is
 * placed now:
 * - The lettering is erased: text is not architecture, and left in place it
 *   walls a label off from its own room.
 * - Doorways are pinched shut by eroding the open floor by half a metre, so a
 *   flood stays in its room; dilating back puts the walls where they were. A
 *   space too narrow to survive the pinch is a riser or a shaft, taken whole.
 * - A name the script calls open, whose flood escapes anyway, is a plaza or a
 *   walkway: listed to draw by hand.
 *
 * Part B departs from the script twice: escalators and stairs are left out and
 * reported, and a void is kept as a void.
 */
export function findRooms(input: FindInput): FindResult {
  const { width: W, height: H, metresPerPixel: mpp, originX, originY } = input;
  const px = (x: number, y: number): Pt => [Math.round((x - originX) / mpp), Math.round((originY - y) / mpp)];
  const lines = input.lines.filter(l => isWording(l.text));

  // The open floor, with the lettering erased from it rather than from a copy
  // of the ink: on L1 that is one 25 MB grid the fewer.
  const free = invert({ width: W, height: H, data: input.ink });
  for (const line of lines) {
    const [a, b] = px(line.box.minX - LABEL_PAD_M, line.box.maxY + LABEL_PAD_M);
    const [c, d] = px(line.box.maxX + LABEL_PAD_M, line.box.minY - LABEL_PAD_M);
    // Both ends clamped: a label off the plan erases nothing, rather than wrapping round to the far side.
    const x0 = clampTo(a, W);
    const x1 = clampTo(c, W);
    for (let y = clampTo(b, H); y < clampTo(d, H); y++) free.data.fill(1, y * W + x0, y * W + x1);
  }
  const R = Math.floor(PINCH_M / mpp);
  const tight = erode(free, R);
  const flooder = new Flooder(W, H);
  const limit = Math.floor(MAX_AREA_M2 / (mpp * mpp));
  const pad = R + cleanPad(mpp);

  const rows: Row[] = [];
  const seen = new Map<string, Row>();
  const open: { text: string; at: Pt }[] = [];
  const skippedLabels: SkippedLabel[] = [];

  for (const label of groupLabels(lines)) {
    if (NOT_A_NAME.test(label.text) || !hasWordIn(label.text, ROOMY)) continue;
    const [sx, sy] = px(label.x, label.y);
    if (sx < 0 || sy < 0 || sx >= W || sy >= H) continue;
    const at: Pt = [round2(label.x), round2(label.y)];
    if (hasWordIn(label.text, FLIGHT_WORDS)) {
      skippedLabels.push({ text: tidy(label.text), at });
      continue;
    }

    if (hasWordIn(label.text, OPEN_WORDS)) {
      const loose = nearest(free, sx, sy);
      if (loose && flooder.fill(free.data, loose, limit) === null) {
        open.push({ text: label.text, at });
        continue;
      }
    }

    let win: Window;
    let mask: Grid;
    const seed = nearest(tight, sx, sy);
    if (seed) {
      const region = flooder.fill(tight.data, seed, limit);
      // Bigger than any room: the flood got out.
      if (!region) continue;
      win = regionWindow(region, free, pad);
      mask = and(dilate(win, R), cropLike(free, win));
    } else {
      const loose = nearest(free, sx, sy);
      if (!loose) continue;
      const region = flooder.fill(free.data, loose, limit);
      if (!region) continue;
      win = regionWindow(region, free, pad);
      mask = win;
    }

    const n = countSet(mask);
    const areaM2 = n * mpp * mpp;
    if (areaM2 < MIN_AREA_M2 || areaM2 > MAX_AREA_M2) continue;
    const first = firstSet(mask);
    const key = `${n}:${(win.y0 + Math.floor(first / mask.width)) * W + win.x0 + (first % mask.width)}`;
    const same = seen.get(key);
    if (same) {
      same.labels.push(label.text);
      continue;
    }

    const place = ([x, y]: Pt): Pt => [round2(originX + (x + win.x0) * mpp), round2(originY - (y + win.y0) * mpp)];
    const poly = (ring: Pt[]): Pt[] | null => {
      const r = dropCollinear(ring);
      const c = rdp([...r, r[0]!], SIMPLIFY_M / mpp).slice(0, -1);
      return c.length >= 3 ? c.map(place) : null;
    };
    const rings = loops(clean(mask, mpp)).sort((p, q) => q.length - p.length);
    const outer = rings[0] ? poly(rings[0]) : null;
    if (!outer) continue;
    const holes: Pt[][] = [];
    for (const ring of rings.slice(1)) {
      if (boxAreaPx(ring) * mpp * mpp < MIN_HOLE_M2) continue;
      const hole = poly(ring);
      if (hole) holes.push(hole);
    }
    const row: Row = { labels: [label.text], areaM2, footprint: outer, holes, labelPoint: at };
    seen.set(key, row);
    rows.push(row);
  }

  const drafts: RoomCandidate[] = [];
  for (const row of rows) {
    const name = bestName(row.labels);
    if (!name || isJunk(name)) continue;
    drafts.push({
      nameEn: capName(name), kind: kindOf(name), footprint: row.footprint, holes: row.holes,
      labelPoint: row.labelPoint, areaM2: Math.round(row.areaM2 * 10) / 10,
    });
  }
  drafts.sort((a, b) => b.areaM2 - a.areaM2);
  for (const o of open) {
    const name = tidy(o.text);
    if (name) drafts.push({ nameEn: capName(name), kind: kindOf(name), holes: [], labelPoint: o.at, areaM2: 0 });
  }
  return { drafts, skippedLabels };
}

/** The extent of the rooms found: Part D's finders look for columns only inside it. */
export function roomsExtent(drafts: readonly RoomCandidate[]): BBox | null {
  const points = drafts.flatMap(d => d.footprint ?? []);
  if (points.length === 0) return null;
  return {
    minX: Math.min(...points.map(p => p[0])), minY: Math.min(...points.map(p => p[1])),
    maxX: Math.max(...points.map(p => p[0])), maxY: Math.max(...points.map(p => p[1])),
  };
}
