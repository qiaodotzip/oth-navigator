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
 * The image's extent in world metres. Image y grows downward while world y is
 * north, so the image hangs below its offset.
 */
export function underlayBBox(image: LevelImage | null): BBox | null {
  const cal = imageCalibration(image);
  if (!image || !cal) return null;
  const widthM = image.widthPx * cal.metresPerPixel;
  const heightM = image.heightPx * cal.metresPerPixel;
  return {
    minX: cal.offsetX,
    minY: cal.offsetY - heightM,
    maxX: cal.offsetX + widthM,
    maxY: cal.offsetY,
  };
}
