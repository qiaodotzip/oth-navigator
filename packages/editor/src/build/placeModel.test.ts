import { parseModel } from "@oth/model";
import { describe, expect, it } from "vitest";
import { newObjectPlacement, newPlacement } from "./placeModel";

const model = parseModel({
  building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
  levels: [
    { id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6 },
    { id: "oth-L2", buildingId: "oth", code: "L2", ordinal: 2, nameEn: "L2", nameZh: "二楼", elevationM: 6, heightM: 4 },
  ],
  rooms: [
    { id: "L1-hall", levelId: "oth-L1", kind: "area", footprint: [[0, 0], [40, 0], [40, 20], [0, 20]], heightM: 5, walkable: true },
    { id: "L1-bench", levelId: "oth-L1", kind: "detail", footprint: [[8, 8], [12, 8], [12, 12], [8, 12]], heightM: 1.2 },
    { id: "L1-gone", levelId: "oth-L1", kind: "detail", footprint: [[20, 8], [22, 8], [22, 10], [20, 10]], heightM: 1, deletedAt: "2026-09-01T00:00:00.000Z" },
    { id: "L2-kiosk", levelId: "oth-L2", kind: "detail", footprint: [[0, 0], [2, 0], [2, 2], [0, 2]], heightM: 2 },
  ],
  objectKinds: [
    { id: "ok_bin", nameEn: "wastebin", size: { w: 0.5, d: 0.5, h: 1 } },
    { id: "ok_gone", nameEn: "old bin", size: { w: 0.5, d: 0.5, h: 1 }, deletedAt: "2026-09-01T00:00:00.000Z" },
  ],
});

describe("newPlacement", () => {
  it("anchors a model on a detail at the detail's middle, where its export was centred", () => {
    expect(newPlacement(model, { type: "room", id: "L1-bench" }, "asset_1", 7)).toEqual({
      ok: true,
      data: { id: "oth-L1-place-7", levelId: "oth-L1", assetId: "asset_1", roomId: "L1-bench", position: [10, 10, 0] },
    });
  });

  it("anchors a level context model at the origin, since it was exported in building coordinates", () => {
    const placed = newPlacement(model, { type: "room", id: "L1-hall" }, "asset_1", 7);
    expect(placed.ok && placed.data.position).toEqual([0, 0, 0]);
  });

  it("files the model on its room's floor", () => {
    const placed = newPlacement(model, { type: "room", id: "L2-kiosk" }, "asset_1", 7);
    expect(placed.ok && placed.data).toMatchObject({ id: "oth-L2-place-7", levelId: "oth-L2" });
  });

  it("asks for a room or detail when nothing is selected, or something else is", () => {
    expect(newPlacement(model, null, "asset_1")).toEqual({ ok: false, reason: "Select a room or detail first." });
    expect(newPlacement(model, { type: "pathway", id: "p" }, "asset_1").ok).toBe(false);
  });

  it("asks the same before a floor has loaded", () => {
    expect(newPlacement(null, { type: "room", id: "L1-bench" }, "asset_1")).toEqual({
      ok: false,
      reason: "Select a room or detail first.",
    });
  });

  it("refuses a room that has been deleted, rather than anchoring a model to nothing", () => {
    expect(newPlacement(model, { type: "room", id: "L1-gone" }, "asset_1")).toEqual({
      ok: false,
      reason: "Select a room or detail first.",
    });
  });
});

describe("newObjectPlacement", () => {
  it("anchors an object at the selected room's centroid, of any room kind", () => {
    expect(newObjectPlacement(model, { type: "room", id: "L1-hall" }, "ok_bin", 7)).toEqual({
      ok: true,
      data: {
        id: "oth-L1-object-7",
        levelId: "oth-L1",
        objectKindId: "ok_bin",
        roomId: "L1-hall",
        position: [20, 10, 0],
        rotationDeg: 0,
        scale: 1,
        sightingIds: [],
      },
    });
  });

  it("asks for a room or area first when nothing is selected, or something else is", () => {
    expect(newObjectPlacement(model, null, "ok_bin")).toEqual({ ok: false, reason: "Select a room or area first." });
    expect(newObjectPlacement(model, { type: "pathway", id: "p" }, "ok_bin").ok).toBe(false);
  });

  it("asks the same before a floor has loaded", () => {
    expect(newObjectPlacement(null, { type: "room", id: "L1-hall" }, "ok_bin")).toEqual({
      ok: false,
      reason: "Select a room or area first.",
    });
  });

  it("refuses a room that has been deleted", () => {
    expect(newObjectPlacement(model, { type: "room", id: "L1-gone" }, "ok_bin")).toEqual({
      ok: false,
      reason: "Select a room or area first.",
    });
  });

  it("refuses a kind that has been deleted, rather than anchoring an object to nothing", () => {
    expect(newObjectPlacement(model, { type: "room", id: "L1-hall" }, "ok_gone")).toEqual({
      ok: false,
      reason: "That kind of object is gone.",
    });
  });

  it("refuses a kind that never existed", () => {
    expect(newObjectPlacement(model, { type: "room", id: "L1-hall" }, "ok_nope")).toEqual({
      ok: false,
      reason: "That kind of object is gone.",
    });
  });
});
