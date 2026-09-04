import { describe, expect, it } from "vitest";
import {
  CalibrationError, calibrationFromMeasurement, imagePointToWorld, worldToImagePoint,
} from "./calibration";

describe("calibrationFromMeasurement", () => {
  it("derives metres per pixel from a horizontal measurement", () => {
    // 200 px drawn along something known to be 20 m.
    expect(calibrationFromMeasurement([0, 0], [200, 0], 20).metresPerPixel).toBeCloseTo(0.1);
  });

  it("uses the diagonal length, not just one axis", () => {
    // A 3-4-5 triangle: 300 px across and 400 down is a 500 px line.
    expect(calibrationFromMeasurement([0, 0], [300, 400], 50).metresPerPixel).toBeCloseTo(0.1);
  });

  it("rejects a zero-length measurement, which would divide by zero", () => {
    expect(() => calibrationFromMeasurement([10, 10], [10, 10], 20)).toThrow(CalibrationError);
  });

  it("rejects a non-positive real distance", () => {
    expect(() => calibrationFromMeasurement([0, 0], [100, 0], 0)).toThrow(CalibrationError);
  });

  it("rejects a negative real distance", () => {
    expect(() => calibrationFromMeasurement([0, 0], [100, 0], -5)).toThrow(CalibrationError);
  });
});

describe("imagePointToWorld", () => {
  const cal = { metresPerPixel: 0.1, offsetX: 0, offsetY: 0 };

  it("scales pixels to metres", () => {
    expect(imagePointToWorld(cal, [200, 0])).toEqual([20, 0]);
  });

  it("flips y, because image y grows downward and world y is north", () => {
    expect(imagePointToWorld(cal, [0, 200])).toEqual([0, -20]);
  });

  it("applies the offset so the image can be placed anywhere on the building datum", () => {
    expect(imagePointToWorld({ ...cal, offsetX: 5, offsetY: 3 }, [0, 0])).toEqual([5, 3]);
  });

  it("round-trips with worldToImagePoint", () => {
    const c = { metresPerPixel: 0.07, offsetX: 12, offsetY: -4 };
    const [ix, iy] = worldToImagePoint(c, [42.5, 17.25]);
    const [wx, wy] = imagePointToWorld(c, [ix, iy]);
    expect(wx).toBeCloseTo(42.5);
    expect(wy).toBeCloseTo(17.25);
  });
});
