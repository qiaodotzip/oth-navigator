/** ISO A paper sizes in millimetres, long side first. */
export const PAPER_SIZES = {
  A0: [1189, 841],
  A1: [841, 594],
  A2: [594, 420],
  A3: [420, 297],
  A4: [297, 210],
} as const;

export type PaperSize = keyof typeof PAPER_SIZES;

/** Above this, the image is not the shape of the sheet — cropped, trimmed, or a reduction. */
export const SHAPE_TOLERANCE = 0.02;

/** "1:1500", "1 : 1500" or "1500" is 1500. Null for anything that is not a positive scale. */
export function parseRatio(text: string): number | null {
  const match = /^\s*(?:1\s*:\s*)?(\d+(?:\.\d+)?)\s*$/.exec(text);
  if (!match) return null;
  const ratio = Number(match[1]);
  return ratio > 0 ? ratio : null;
}

/**
 * A sheet's scale from its paper size and printed ratio.
 *
 * The right method for OTH's plans: their drawn scale bars are wrong by a
 * factor of three, but the sheet is exact — 420 mm across an A3 at 1:1500 is
 * 630 m, over 3000 px is 0.21 m/px. The image's long side is the paper's long
 * side, whichever way up it was scanned. `shapeMismatch` says how far the
 * image is from the paper's proportions; a cropped image would give a scale
 * that looks right and is not.
 */
export function sheetScale(
  paper: PaperSize, ratio: number, widthPx: number, heightPx: number,
): { metresPerPixel: number; shapeMismatch: number } {
  const [longMm, shortMm] = PAPER_SIZES[paper];
  const longPx = Math.max(widthPx, heightPx);
  const shortPx = Math.min(widthPx, heightPx);
  const paperShape = longMm / shortMm;
  return {
    metresPerPixel: (longMm * ratio) / 1000 / longPx,
    shapeMismatch: Math.abs(longPx / shortPx - paperShape) / paperShape,
  };
}
