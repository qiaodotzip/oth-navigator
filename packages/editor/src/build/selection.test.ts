import { parseModel } from "@oth/model";
import { describe, expect, it } from "vitest";
import { parseSelectParam, selectParam } from "./selection";

const square: [number, number][] = [[0, 0], [10, 0], [10, 10], [0, 10]];

const model = parseModel({
  building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
  levels: [
    { id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6 },
    { id: "oth-L2", buildingId: "oth", code: "L2", ordinal: 2, nameEn: "L2", nameZh: "二楼", elevationM: 6, heightM: 4 },
  ],
  rooms: [
    { id: "L1-a", levelId: "oth-L1", kind: "room", footprint: square, heightM: 3 },
    { id: "L2-a", levelId: "oth-L2", kind: "room", footprint: square, heightM: 3 },
    { id: "L1-gone", levelId: "oth-L1", kind: "room", footprint: square, heightM: 3, deletedAt: "2026-09-27T10:00:00.000Z" },
  ],
  pathways: [{ id: "L1-p", levelId: "oth-L1", polyline: [[0, 0], [20, 0]] }],
  entrances: [{ id: "en-1", levelId: "oth-L1", roomId: "L1-a", point: [1, 1] }],
  portals: [{ id: "lift-a", kind: "lift" }],
  portalEndpoints: [{ id: "ep-1", portalId: "lift-a", levelId: "oth-L1", roomId: "L1-a", point: [5, 5] }],
});

describe("selectParam", () => {
  it("writes a selection as type:id", () => {
    expect(selectParam({ type: "room", id: "L1-a" })).toBe("room:L1-a");
  });

  it("is empty when nothing is selected", () => {
    expect(selectParam(null)).toBe("");
  });
});

describe("parseSelectParam", () => {
  it.each([["room", "L1-a"], ["pathway", "L1-p"], ["entrance", "en-1"], ["portalEndpoint", "ep-1"]] as const)(
    "round-trips a %s on this floor",
    (type, id) => {
      expect(parseSelectParam(selectParam({ type, id }), model, "oth-L1")).toEqual({ type, id });
    },
  );

  it("selects nothing for something on another floor", () => {
    expect(parseSelectParam("room:L2-a", model, "oth-L1")).toBeNull();
  });

  it("selects nothing for something since deleted", () => {
    expect(parseSelectParam("room:L1-gone", model, "oth-L1")).toBeNull();
  });

  it("selects nothing for something that never existed", () => {
    expect(parseSelectParam("room:nowhere", model, "oth-L1")).toBeNull();
  });

  it("refuses a malformed value rather than guessing at it", () => {
    for (const bad of ["room", ":L1-a", "room:", "banana:L1-a", "L1-a", ""]) {
      expect(parseSelectParam(bad, model, "oth-L1")).toBeNull();
    }
  });

  it("selects nothing before the map has loaded", () => {
    expect(parseSelectParam("room:L1-a", null, "oth-L1")).toBeNull();
    expect(parseSelectParam("room:L1-a", model, null)).toBeNull();
  });
});
