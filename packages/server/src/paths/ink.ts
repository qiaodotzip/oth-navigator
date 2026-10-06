import type { Vec2 } from "@oth/model";
import sharp from "sharp";
import { planPixel, type PlanImage } from "../mcp/plan";

/**
 * Contract v6's ink probe: the question draw_paths used to put to Claude over
 * `view_plan` — *does the drawing show open floor between here and there?* —
 * answered from the plan's own pixels, on the mapping `view_plan` uses
 * (`planPixel`). Three rehearsals showed Claude skips the looking, so the
 * server looks.
 *
 * Everything about it fails closed: unreadable, ambiguous or off the plan is
 * "not open", and the island is named for a person instead of bridged wrongly.
 *
 * Two readings answer, because neither alone can tell a wall from the lines a
 * drawing is covered in:
 *
 * - **How much ink is about.** The share of a square window, INK_WINDOW_M on a
 *   side, slid along the run. A dimension line crossing a 1 m window is 0.07 m
 *   of the metre it spans — 7%; a 0.2 m wall is 20%; hatching, stairs,
 *   furniture, a planter or a printed word are 25–90%. Over INK_SHARE is not
 *   floor.
 * - **Whether anything spans the run.** The share of a band INK_BAND_M across
 *   it, at each step. A wall crossing the run blackens the whole band; so does
 *   a dimension line, which is why one span is not enough: a span INK_SPAN_M
 *   or longer is a wall's thickness, and two spans within INK_PAIR_M are the
 *   two faces of one wall — the cavity wall that defeats a rule that passes
 *   every thin line.
 */

/** A pixel this dark or darker is ink. L1's plan is 85% paper, at grey 240 and over. */
export const INK_GREY = 200;
/** The square whose ink share is read at each step along the run. */
export const INK_WINDOW_M = 1;
/** More ink than this share of a window is not open floor. */
export const INK_SHARE = 0.2;
/** How far across the run the probe looks for something spanning it. */
export const INK_BAND_M = 1;
/** This share of the band dark at one step: something spans the run there. */
export const INK_SPAN = 0.5;
/** A span this long along the run is a wall, not a line drawn across the floor. */
export const INK_SPAN_M = 0.15;
/** Two spans this close are one wall drawn as two lines with white between. */
export const INK_PAIR_M = 0.4;

/** The plan as grey pixels, row-major, one byte each. */
export type PlanGrey = { data: Uint8Array; widthPx: number; heightPx: number };

/** What the drawing shows along one straight run. */
export type InkRun = {
  /** Whether it shows open floor the whole way. */
  open: boolean;
  /** How much of the run, from its start, reads as open floor. */
  openM: number;
  runM: number;
  /** What stopped it, in a person's words; "" when it is open. */
  why: string;
};

/**
 * The probe `connect_rooms` carries: one plan, any number of runs, two
 * questions.
 *
 * `run` is the whole question — does the drawing show open floor here? — and is
 * for ground no room covers. `crossed` is the narrower one — does anything the
 * drawing shows cross this line? — and is for ground the map already calls
 * floor, where the first question is the wrong one: a room is drawn full of its
 * own furniture, fixtures and name, none of which stops anyone walking, while a
 * partition drawn across it does. A bridge must pass both: `crossed` along the
 * whole of it, `run` along every stretch no room covers.
 */
export type PlanInk = {
  run: (a: Vec2, b: Vec2) => InkRun;
  crossed: (a: Vec2, b: Vec2) => InkRun;
};

const shut = (openM: number, runM: number, why: string): InkRun => ({ open: false, openM, runM, why });

/**
 * What the drawing shows along the straight run from `a` to `b`, in metres.
 * Sampled every half pixel, which is finer than any line the plan is drawn
 * with, so no wall is stepped over. With `density` off, only the second reading
 * is taken: what crosses the run, not how much ink is about (see PlanInk).
 */
function walk(grey: PlanGrey, image: PlanImage, a: Vec2, b: Vec2, density: boolean): InkRun {
  const runM = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (runM === 0) return { open: true, openM: 0, runM: 0, why: "" };
  const ux = (b[0] - a[0]) / runM;
  const uy = (b[1] - a[1]) / runM;
  const m = image.metresPerPixel;
  /** Grey at a world point, or null off the plan — which is never open. */
  const at = (x: number, y: number): number | null => {
    const [px, py] = planPixel(image, [x, y]);
    const col = Math.round(px);
    const row = Math.round(py);
    if (col < 0 || row < 0 || col >= grey.widthPx || row >= grey.heightPx) return null;
    return grey.data[row * grey.widthPx + col]!;
  };

  // Half a pixel along the run, and two samples a pixel across the window and
  // the band: a window turned with the run lands between pixels, and sampling
  // it one for one makes a 0.2 m wall read 19% or 24% by where it falls.
  const steps = Math.max(1, Math.ceil(runM / (m / 2)));
  const window = Math.max(2, Math.round((2 * INK_WINDOW_M) / m));
  const band = Math.max(2, Math.round((2 * INK_BAND_M) / m));
  let spanFrom = -1;
  let spanTo = -Infinity;
  let last = 0;
  for (let s = 0; s <= steps; s++) {
    const t = (s * runM) / steps;
    const x = a[0] + ux * t;
    const y = a[1] + uy * t;

    if (density) {
      let dark = 0;
      for (let i = 0; i <= window; i++) {
        const along = -INK_WINDOW_M / 2 + (INK_WINDOW_M * i) / window;
        for (let j = 0; j <= window; j++) {
          const side = -INK_WINDOW_M / 2 + (INK_WINDOW_M * j) / window;
          const g = at(x + ux * along - uy * side, y + uy * along + ux * side);
          if (g === null) return shut(t, runM, `off the plan ${t.toFixed(1)} m along`);
          if (g <= INK_GREY) dark++;
        }
      }
      const share = dark / ((window + 1) * (window + 1));
      if (share > INK_SHARE) return shut(t, runM, `${Math.round(share * 100)}% of the drawing is ink ${t.toFixed(1)} m along`);
    }

    let across = 0;
    for (let i = 0; i <= band; i++) {
      const side = -INK_BAND_M / 2 + (INK_BAND_M * i) / band;
      const g = at(x - uy * side, y + ux * side);
      if (g === null) return shut(t, runM, `off the plan ${t.toFixed(1)} m along`);
      if (g <= INK_GREY) across++;
    }
    if (across / (band + 1) >= INK_SPAN) {
      if (spanFrom < 0) {
        if (t - spanTo <= INK_PAIR_M) return shut(spanTo, runM, `two lines ${(t - spanTo).toFixed(2)} m apart ${t.toFixed(1)} m along`);
        spanFrom = t;
      }
      if (t - spanFrom >= INK_SPAN_M) return shut(spanFrom, runM, `a line along ${(t - spanFrom).toFixed(2)} m of it ${t.toFixed(1)} m along`);
    } else if (spanFrom >= 0) {
      spanTo = last;
      spanFrom = -1;
    }
    last = t;
  }
  return { open: true, openM: runM, runM, why: "" };
}

/** Does the drawing show open floor all along this run? For ground no room covers. */
export function inkRun(grey: PlanGrey, image: PlanImage, a: Vec2, b: Vec2): InkRun {
  return walk(grey, image, a, b, true);
}

/** Does anything the drawing shows cross this run? For ground the map already calls floor. */
export function inkCrossed(grey: PlanGrey, image: PlanImage, a: Vec2, b: Vec2): InkRun {
  return walk(grey, image, a, b, false);
}

/**
 * The probe for one floor's plan: its bytes read as grey pixels, the way
 * `renderPlan` reads them for the picture. It throws on bytes that are no
 * picture, and `connect_rooms` then bridges nothing.
 */
export async function planInk(plan: Uint8Array, image: PlanImage): Promise<PlanInk> {
  const { data, info } = await sharp(plan).greyscale().raw().toBuffer({ resolveWithObject: true });
  const grey: PlanGrey = { data: new Uint8Array(data.buffer, data.byteOffset, data.length), widthPx: info.width, heightPx: info.height };
  return {
    run: (a, b) => inkRun(grey, image, a, b),
    crossed: (a, b) => inkCrossed(grey, image, a, b),
  };
}
