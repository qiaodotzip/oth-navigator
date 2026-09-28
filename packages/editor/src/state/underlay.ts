import type { BBox } from "@oth/model";
import type { LevelImage } from "../api/client";
import type { Calibration } from "../plan/calibration";

/**
 * The one plan a floor shows: its newest, by when it was last saved, then by
 * id. A floor should only ever have one live plan (an upload retires the
 * last), but one that has two must not show whichever the list happened to
 * give first: that flipped the view to the other drawing after any edit. The
 * plan you edit becomes the newest, so it stays the one on screen. The server
 * lists in this order and `plans:one-per-floor` keeps by the same rule.
 */
export function imageForLevel(
  images: readonly LevelImage[], levelId: string | null,
): LevelImage | null {
  if (!levelId) return null;
  let best: LevelImage | null = null;
  for (const image of images) {
    if (image.levelId === levelId && (!best || isNewer(image, best))) best = image;
  }
  return best;
}

/** Last saved, then the greater id. A plan with no time counts as the oldest. */
function isNewer(a: LevelImage, b: LevelImage): boolean {
  const at = savedAt(a);
  const bt = savedAt(b);
  return at !== bt ? at > bt : a.id > b.id;
}

function savedAt(image: LevelImage): number {
  const t = image.updatedAt ? Date.parse(image.updatedAt) : NaN;
  return Number.isNaN(t) ? -Infinity : t;
}

/** Null until someone has measured a known dimension on the image. */
export function imageCalibration(image: LevelImage | null): Calibration | null {
  if (!image || image.metresPerPixel == null) return null;
  return {
    metresPerPixel: image.metresPerPixel,
    offsetX: image.offsetX,
    offsetY: image.offsetY,
  };
}

/**
 * How to draw the image: at its saved scale, or — until it has one — at a
 * provisional metre per pixel from its saved offset, so it can be seen, and
 * measured on, before anyone has said how big it is. Never saved.
 */
export function displayCalibration(image: LevelImage | null): Calibration | null {
  if (!image) return null;
  return imageCalibration(image) ?? { metresPerPixel: 1, offsetX: image.offsetX, offsetY: image.offsetY };
}

/**
 * The image's extent in world metres. Image y grows downward while world y is
 * north, so the image hangs below its offset.
 */
function extent(image: LevelImage, cal: Calibration): BBox {
  const widthM = image.widthPx * cal.metresPerPixel;
  const heightM = image.heightPx * cal.metresPerPixel;
  return { minX: cal.offsetX, minY: cal.offsetY - heightM, maxX: cal.offsetX + widthM, maxY: cal.offsetY };
}

/** The image's extent at its saved scale; null until it has one. */
export function underlayBBox(image: LevelImage | null): BBox | null {
  const cal = imageCalibration(image);
  return image && cal ? extent(image, cal) : null;
}

/** The image's extent as drawn, for framing the canvas. */
export function displayBBox(image: LevelImage | null): BBox | null {
  const cal = displayCalibration(image);
  return image && cal ? extent(image, cal) : null;
}
