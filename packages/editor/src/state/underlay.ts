import type { BBox } from "@oth/model";
import type { LevelImage } from "../api/client";
import type { Calibration } from "../plan/calibration";

export function imageForLevel(
  images: readonly LevelImage[], levelId: string | null,
): LevelImage | null {
  if (!levelId) return null;
  return images.find(i => i.levelId === levelId) ?? null;
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
