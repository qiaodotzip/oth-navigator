import type { PlanSheet } from "@oth/model";
import type { LevelImage } from "../api/client";

export type NewPlan = { sheet: PlanSheet; widthPx: number; heightPx: number; metresPerPixel: number | null };
export type Placed = { offsetX: number; offsetY: number; how: "same-sheet" | "centred" | "unplaced"; on: LevelImage | null };

const SAME_SIZE_PT = 1;
const SAME_SCALE = 0.005;

/**
 * Whether a new sheet is one CAD set's with a plan already placed: the same
 * size and turn on the page, and the same scale as that plan has now. The
 * sheets of one set usually share their viewport (spec §5.2 step 4), so a
 * point on one is the same place in the building on the other.
 */
export function sameSheet(sheet: PlanSheet, ref: LevelImage): boolean {
  const src = ref.source;
  if (!src || ref.metresPerPixel == null || sheet.metresPerPoint == null) return false;
  const refScale = ref.metresPerPixel / src.pointsPerPixel;
  return src.rotation === sheet.rotation &&
    Math.abs(src.pageSizePt[0] - sheet.pageSizePt[0]) <= SAME_SIZE_PT &&
    Math.abs(src.pageSizePt[1] - sheet.pageSizePt[1]) <= SAME_SIZE_PT &&
    Math.abs(sheet.metresPerPoint - refScale) / refScale < SAME_SCALE;
}

/**
 * Where a new plan goes (spec §5.2 step 4). Where the same sheet already
 * sits: the plan it replaces, then the floor below's. Otherwise centred on
 * one of them. An unscaled plan, or one with nothing to go by, waits at the
 * origin. Align finishes the job either way.
 */
export function placePlan(plan: NewPlan, current: LevelImage | null, below: LevelImage | null): Placed {
  if (plan.metresPerPixel == null) return { offsetX: 0, offsetY: 0, how: "unplaced", on: null };
  for (const ref of [current, below]) {
    if (!ref || !sameSheet(plan.sheet, ref)) continue;
    const src = ref.source!;
    const refScale = ref.metresPerPixel! / src.pointsPerPixel;
    return {
      offsetX: ref.offsetX + (plan.sheet.clipPt[0] - src.clipPt[0]) * refScale,
      offsetY: ref.offsetY - (plan.sheet.clipPt[1] - src.clipPt[1]) * refScale,
      how: "same-sheet",
      on: ref,
    };
  }
  for (const ref of [current, below]) {
    if (!ref || ref.metresPerPixel == null) continue;
    const cx = ref.offsetX + (ref.widthPx * ref.metresPerPixel) / 2;
    const cy = ref.offsetY - (ref.heightPx * ref.metresPerPixel) / 2;
    return {
      offsetX: cx - (plan.widthPx * plan.metresPerPixel) / 2,
      offsetY: cy + (plan.heightPx * plan.metresPerPixel) / 2,
      how: "centred",
      on: ref,
    };
  }
  return { offsetX: 0, offsetY: 0, how: "unplaced", on: null };
}
