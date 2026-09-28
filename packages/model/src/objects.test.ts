import { describe, expect, it } from "vitest";
import { facingRotation, objectFront, placementModelAsset } from "./objects";
import { parseModel } from "./schema/model";

const model = parseModel({
  building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
  objectKinds: [
    { id: "ok_bin", nameEn: "wastebin", size: { w: 0.5, d: 0.5, h: 1 }, assetId: "asset_bin" },
    { id: "ok_cooler", nameEn: "water cooler", size: { w: 0.4, d: 0.4, h: 1.2 } },
    { id: "ok_bench", nameEn: "old bench", size: { w: 2, d: 0.6, h: 0.5 }, assetId: "asset_bench", deletedAt: "2026-09-28T00:00:00.000Z" },
  ],
});

describe("placementModelAsset", () => {
  it("shows the placement's own model first", () => {
    expect(placementModelAsset(model, { assetId: "asset_own", objectKindId: "ok_bin" })).toBe("asset_own");
  });

  it("shows its kind's model otherwise", () => {
    expect(placementModelAsset(model, { objectKindId: "ok_bin" })).toBe("asset_bin");
  });

  it("has none while the kind has no model, so the object is drawn as a box", () => {
    expect(placementModelAsset(model, { objectKindId: "ok_cooler" })).toBeUndefined();
  });

  it("takes nothing from a deleted kind", () => {
    expect(placementModelAsset(model, { objectKindId: "ok_bench" })).toBeUndefined();
  });

  it("has none for a placement with neither", () => {
    expect(placementModelAsset(model, {})).toBeUndefined();
  });
});

describe("objectFront", () => {
  const faces = (deg: number) => objectFront(deg).map(v => Math.round(v * 1e9) / 1e9 + 0);

  it("faces south at rotation 0, which is glTF's front, +Z", () => {
    expect(faces(0)).toEqual([0, -1]);
  });

  it("turns anticlockwise seen from above, as the 3D preview turns a model", () => {
    expect(faces(90)).toEqual([1, 0]);
    expect(faces(180)).toEqual([0, 1]);
    expect(faces(270)).toEqual([-1, 0]);
  });
});

describe("facingRotation", () => {
  it("gives back the rotation whose front faces a direction", () => {
    for (const deg of [0, 30, 90, 135, 180, 225, 300]) expect(facingRotation(objectFront(deg))).toBeCloseTo(deg, 9);
  });

  it("answers in [0, 360)", () => {
    expect(facingRotation([-1, 0])).toBeCloseTo(270, 9);
    expect(facingRotation(objectFront(-90))).toBeCloseTo(270, 9);
  });

  it("faces south for a direction of no length, rather than NaN", () => {
    expect(facingRotation([0, 0])).toBe(0);
  });
});
