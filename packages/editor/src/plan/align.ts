/** Where a floorplan's top-left pixel sits, in world metres. */
export type PlanOffset = { offsetX: number; offsetY: number };

/** Below this a press is a click that wobbled, not a drag: it moves nothing and saves nothing. */
const DRAG_THRESHOLD_PX = 3;

/** Whether the pointer has moved far enough from where it was pressed to be a drag. */
export function movedEnough(dxPx: number, dyPx: number): boolean {
  return Math.hypot(dxPx, dyPx) >= DRAG_THRESHOLD_PX;
}

const toCm = (m: number) => Math.round(m * 100) / 100;

/**
 * Where the plan's corner lands after dragging it by (dx, dy) screen pixels.
 * Screen y grows downward while world y is north, hence the minus.
 */
export function draggedOffset(start: PlanOffset, dxPx: number, dyPx: number, pixelsPerMetre: number): PlanOffset {
  return {
    offsetX: toCm(start.offsetX + dxPx / pixelsPerMetre),
    offsetY: toCm(start.offsetY - dyPx / pixelsPerMetre),
  };
}
