/** Where a floorplan's top-left pixel sits, in world metres. */
export type PlanOffset = { offsetX: number; offsetY: number };

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
