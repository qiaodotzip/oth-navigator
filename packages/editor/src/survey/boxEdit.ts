import type { Box } from "@oth/model";

/** Small enough to be a mis-drag, large enough to still be grabbable. */
export const MIN_SIDE = 0.02;

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** Slide a box, keeping the whole of it on the frame rather than clipping it. */
export function moveBox(box: Box, dx: number, dy: number): Box {
  return {
    ...box,
    x: Math.min(1 - box.w, Math.max(0, box.x + dx)),
    y: Math.min(1 - box.h, Math.max(0, box.y + dy)),
  };
}

export type Corner = "nw" | "ne" | "sw" | "se";

/**
 * Drag one corner, leaving the opposite one where it is.
 *
 * Kept above a minimum side so a box cannot be resized into something that
 * can no longer be grabbed to fix.
 */
export function resizeBox(box: Box, corner: Corner, dx: number, dy: number): Box {
  const left = corner === "nw" || corner === "sw";
  const top = corner === "nw" || corner === "ne";

  const anchorX = left ? box.x + box.w : box.x;
  const anchorY = top ? box.y + box.h : box.y;
  const movedX = clamp01((left ? box.x : box.x + box.w) + dx);
  const movedY = clamp01((top ? box.y : box.y + box.h) + dy);

  const x = Math.min(anchorX, movedX);
  const y = Math.min(anchorY, movedY);
  const w = Math.max(MIN_SIDE, Math.abs(anchorX - movedX));
  const h = Math.max(MIN_SIDE, Math.abs(anchorY - movedY));

  return { x: Math.min(x, 1 - w), y: Math.min(y, 1 - h), w, h };
}

/**
 * Where a box's label should sit.
 *
 * Above it normally, inside it when the box is near the top of the frame —
 * otherwise the label, and the control that deletes the tag, are drawn off the
 * image and cannot be reached.
 */
export function labelInside(box: Box): boolean {
  return box.y < 0.06;
}
