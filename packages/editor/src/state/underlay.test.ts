import { describe, expect, it } from "vitest";
import type { LevelImage } from "../api/client";
import { imageCalibration, imageForLevel, underlayBBox } from "./underlay";

const base: LevelImage = {
  id: "img_1", levelId: "oth-L1", filename: "L1.png",
  widthPx: 1000, heightPx: 500, sizeBytes: 10,
  metresPerPixel: null, offsetX: 0, offsetY: 0, opacity: 0.6, version: 0,
};

describe("imageForLevel", () => {
  it("finds the image for a level", () => {
    expect(imageForLevel([base], "oth-L1")?.id).toBe("img_1");
  });

  it("returns null when the level has none", () => {
    expect(imageForLevel([base], "oth-L2")).toBeNull();
  });

  it("returns null when no level is active", () => {
    expect(imageForLevel([base], null)).toBeNull();
  });
});

describe("imageCalibration", () => {
  it("is null until the image has a scale", () => {
    expect(imageCalibration(base)).toBeNull();
  });

  it("becomes a calibration once scaled", () => {
    expect(imageCalibration({ ...base, metresPerPixel: 0.1, offsetX: 5, offsetY: -2 }))
      .toEqual({ metresPerPixel: 0.1, offsetX: 5, offsetY: -2 });
  });
});

describe("underlayBBox", () => {
  it("is null for an uncalibrated image, which has no size in metres yet", () => {
    expect(underlayBBox(base)).toBeNull();
  });

  it("spans the image in world metres, hanging below the offset", () => {
    // 1000 x 500 px at 0.1 m/px is 100 x 50 m; image y grows down, world y is north.
    expect(underlayBBox({ ...base, metresPerPixel: 0.1 }))
      .toEqual({ minX: 0, minY: -50, maxX: 100, maxY: 0 });
  });

  it("applies the offset", () => {
    expect(underlayBBox({ ...base, metresPerPixel: 0.1, offsetX: 10, offsetY: 60 }))
      .toEqual({ minX: 10, minY: 10, maxX: 110, maxY: 60 });
  });
});
