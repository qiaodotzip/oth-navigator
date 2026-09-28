import { parseModel } from "@oth/model";
import { describe, expect, it } from "vitest";
import { newPlacement } from "./placeModel";

const model = parseModel({
  building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
  levels: [{ id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6 }],
  rooms: [
    { id: "L1-hall", levelId: "oth-L1", kind: "area", footprint: [[0, 0], [40, 0], [40, 20], [0, 20]], heightM: 5, walkable: true },
    { id: "L1-bench", levelId: "oth-L1", kind: "detail", footprint: [[8, 8], [12, 8], [12, 12], [8, 12]], heightM: 1.2 },
  ],
});

describe("newPlacement", () => {
  it("anchors a model on a detail at the detail's middle, where its export was centred", () => {
    expect(newPlacement(model, "oth-L1", { type: "room", id: "L1-bench" }, "asset_1", 7)).toEqual({
      ok: true,
      data: { id: "oth-L1-place-7", levelId: "oth-L1", assetId: "asset_1", roomId: "L1-bench", position: [10, 10, 0] },
    });
  });

  it("anchors a level context model at the origin, since it was exported in building coordinates", () => {
    const placed = newPlacement(model, "oth-L1", { type: "room", id: "L1-hall" }, "asset_1", 7);
    expect(placed.ok && placed.data.position).toEqual([0, 0, 0]);
  });

  it("asks for a room or detail when nothing is selected, or something else is", () => {
    expect(newPlacement(model, "oth-L1", null, "asset_1")).toEqual({ ok: false, reason: "Select a room or detail first." });
    expect(newPlacement(model, "oth-L1", { type: "pathway", id: "p" }, "asset_1").ok).toBe(false);
  });
});
