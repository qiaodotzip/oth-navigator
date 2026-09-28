import { ObjectKindSchema, PlacementSchema } from "@oth/model";
import { describe, expect, it } from "vitest";
import { objectBoxGeometry, placementLook } from "./objectBox";

const size = { w: 0.6, d: 0.4, h: 0.9 };
const bin = ObjectKindSchema.parse({ id: "ok_bin", nameEn: "wastebin", size });
const modelled = ObjectKindSchema.parse({ id: "ok_cooler", nameEn: "water cooler", size, assetId: "asset_cooler" });
const gone = ObjectKindSchema.parse({ id: "ok_gone", nameEn: "old bench", size, deletedAt: "2026-09-28T00:00:00.000Z" });
const at = (extra: Record<string, unknown>) =>
  PlacementSchema.parse({ id: "L1-x", levelId: "oth-L1", position: [3, 4, 0], ...extra });

describe("objectBoxGeometry", () => {
  it("is the kind's size, standing on the origin at its base centre", () => {
    const geometry = objectBoxGeometry(size);
    geometry.computeBoundingBox();
    const { min, max } = geometry.boundingBox!;
    const expected: [number, number][] = [
      [min.x, -0.3], [min.y, 0], [min.z, -0.2],
      [max.x, 0.3], [max.y, 0.9], [max.z, 0.2],
    ];
    for (const [got, want] of expected) expect(got).toBeCloseTo(want, 6);
  });
});

describe("placementLook", () => {
  it("shows a placement's own model", () => {
    expect(placementLook(at({ assetId: "asset_own" }), [bin])).toEqual({ as: "model", assetId: "asset_own", box: null });
  });

  it("shows an object's kind's model, with its box to fall back on", () => {
    expect(placementLook(at({ objectKindId: "ok_cooler" }), [modelled])).toEqual({
      as: "model", assetId: "asset_cooler", box: { size, name: "water cooler" },
    });
  });

  it("draws a box of the kind's size while the kind has no model", () => {
    expect(placementLook(at({ objectKindId: "ok_bin" }), [bin])).toEqual({ as: "box", size, name: "wastebin" });
  });

  it("draws nothing for an object whose kind is gone and which has no model of its own", () => {
    expect(placementLook(at({ objectKindId: "ok_gone" }), [gone])).toEqual({ as: "nothing" });
  });
});
