import type { Vec2 } from "@oth/model";

export class CalibrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CalibrationError";
  }
}

/**
 * Places a floor-plan image on the building datum.
 *
 * `metresPerPixel` comes from the user drawing a line along something whose real
 * length they know — a corridor width, a grid spacing, a scale bar. Guessing it
 * instead is how the hackathon's geometry ended up wrong at every scale.
 */
export type Calibration = {
  metresPerPixel: number;
  /** World metres of the image's top-left pixel. */
  offsetX: number;
  offsetY: number;
};

export function calibrationFromMeasurement(
  a: Vec2, b: Vec2, realMetres: number,
): { metresPerPixel: number } {
  if (!(realMetres > 0)) {
    throw new CalibrationError("the real distance must be greater than zero");
  }
  const pixels = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (pixels === 0) {
    throw new CalibrationError("draw a line with some length before entering a distance");
  }
  return { metresPerPixel: realMetres / pixels };
}

export function imagePointToWorld(cal: Calibration, [px, py]: Vec2): [number, number] {
  return [cal.offsetX + px * cal.metresPerPixel, cal.offsetY - py * cal.metresPerPixel];
}

export function worldToImagePoint(cal: Calibration, [wx, wy]: Vec2): [number, number] {
  return [(wx - cal.offsetX) / cal.metresPerPixel, (cal.offsetY - wy) / cal.metresPerPixel];
}
