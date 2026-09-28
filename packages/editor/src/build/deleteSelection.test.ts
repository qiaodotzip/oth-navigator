import { parseModel } from "@oth/model";
import { describe, expect, it } from "vitest";
import { selectionRemovals } from "./deleteSelection";

const model = parseModel({
  building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
  levels: [
    { id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6 },
    { id: "oth-L2", buildingId: "oth", code: "L2", ordinal: 2, nameEn: "L2", nameZh: "二楼", elevationM: 6, heightM: 4 },
  ],
  rooms: [
    { id: "L1-lobby", levelId: "oth-L1", kind: "area", footprint: [[0, 0], [10, 0], [10, 10], [0, 10]], heightM: 6, walkable: true, nameEn: "Town Square" },
    { id: "L1-b", levelId: "oth-L1", kind: "room", footprint: [[20, 0], [30, 0], [30, 10]], heightM: 3 },
  ],
  portals: [{ id: "lift-a", kind: "lift", nameEn: "Lift A" }],
  portalEndpoints: [{ id: "ep-1", portalId: "lift-a", levelId: "oth-L1", roomId: "L1-lobby", point: [5, 5] }],
});

describe("selectionRemovals", () => {
  it("removes an area as the room it is, and calls it by its name", () => {
    expect(selectionRemovals(model, "oth-L1", { type: "room", id: "L1-lobby" })).toEqual({
      removals: [{ type: "room", id: "L1-lobby", version: 0 }],
      label: "Town Square",
    });
  });

  it("calls an unnamed room by its id", () => {
    expect(selectionRemovals(model, "oth-L1", { type: "room", id: "L1-b" })?.label).toBe("L1-b");
  });

  it("takes a lift away with its last stop, as the layers list does", () => {
    expect(selectionRemovals(model, "oth-L1", { type: "portalEndpoint", id: "ep-1" })).toEqual({
      removals: [
        { type: "portalEndpoint", id: "ep-1", version: 0 },
        { type: "portal", id: "lift-a", version: 0 },
      ],
      label: "Lift A",
    });
  });

  it("has nothing to delete when nothing is selected, or the selection is on another floor", () => {
    expect(selectionRemovals(model, "oth-L1", null)).toBeNull();
    expect(selectionRemovals(model, "oth-L2", { type: "room", id: "L1-lobby" })).toBeNull();
  });
});
