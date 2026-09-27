/**
 * The largest size with the frame's shape that fits the space, so the frame is
 * never scrolled to (spec §9). Nothing, rather than NaN, for either of no size.
 */
export function fitSize(
  space: { width: number; height: number },
  frame: { widthPx: number; heightPx: number },
): { width: number; height: number } {
  if (space.width <= 0 || space.height <= 0 || frame.widthPx <= 0 || frame.heightPx <= 0) {
    return { width: 0, height: 0 };
  }
  const scale = Math.min(space.width / frame.widthPx, space.height / frame.heightPx);
  return { width: Math.floor(frame.widthPx * scale), height: Math.floor(frame.heightPx * scale) };
}
