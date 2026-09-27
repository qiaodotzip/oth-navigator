import { parseModel } from "@oth/model";
import { describe, expect, it } from "vitest";
import { removalsFor } from "./removeLayer";

const model = parseModel({
  building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
  levels: [
    { id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6 },
    { id: "oth-L2", buildingId: "oth", code: "L2", ordinal: 2, nameEn: "L2", nameZh: "二楼", elevationM: 6, heightM: 4 },
  ],
  rooms: [{
    id: "L1-a", levelId: "oth-L1", kind: "area",
    footprint: [[0, 0], [10, 0], [10, 10], [0, 10]], heightM: 5, walkable: true,
  }],
  portals: [{ id: "lift-a", kind: "lift" }, { id: "lift-b", kind: "lift" }],
  portalEndpoints: [
    { id: "a-1", portalId: "lift-a", levelId: "oth-L1", roomId: "L1-a", point: [5, 5] },
    { id: "a-2", portalId: "lift-a", levelId: "oth-L2", roomId: "L1-a", point: [5, 5] },
    { id: "b-1", portalId: "lift-b", levelId: "oth-L1", roomId: "L1-a", point: [8, 8] },
  ],
});

const item = (type: "area" | "portalEndpoint", id: string) =>
  ({ type, id, label: id, version: 0, renamable: false });

describe("removalsFor", () => {
  it("removes an area as the room it is", () => {
    expect(removalsFor(model, item("area", "L1-a"))).toEqual([{ type: "room", id: "L1-a", version: 0 }]);
  });

  it("removes one stop of a lift that stops elsewhere too, and keeps the lift", () => {
    expect(removalsFor(model, item("portalEndpoint", "a-1"))).toEqual([
      { type: "portalEndpoint", id: "a-1", version: 0 },
    ]);
  });

  it("removes the lift with its last stop, rather than leave a lift that goes nowhere", () => {
    expect(removalsFor(model, item("portalEndpoint", "b-1"))).toEqual([
      { type: "portalEndpoint", id: "b-1", version: 0 },
      { type: "portal", id: "lift-b", version: 0 },
    ]);
  });
});
