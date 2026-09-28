import { parseModel } from "@oth/model";
import { describe, expect, it } from "vitest";
import { MARKER_STYLE, levelMarkers } from "./markers";

const DELETED = "2026-09-28T00:00:00.000Z";
const model = parseModel({
  building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
  levels: [
    { id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6 },
    { id: "oth-L2", buildingId: "oth", code: "L2", ordinal: 2, nameEn: "L2", nameZh: "二楼", elevationM: 6, heightM: 5 },
  ],
  entrances: [
    { id: "en-1", levelId: "oth-L1", roomId: "L1-hall", point: [1, 1] },
    { id: "en-gone", levelId: "oth-L1", roomId: "L1-hall", point: [2, 2], deletedAt: DELETED },
  ],
  portals: [
    { id: "lift-a", kind: "lift" },
    { id: "esc-1", kind: "escalator" },
    { id: "lift-gone", kind: "lift", deletedAt: DELETED },
  ],
  portalEndpoints: [
    { id: "lift-a-1", portalId: "lift-a", levelId: "oth-L1", roomId: "L1-hall", point: [5, 5] },
    { id: "lift-a-2", portalId: "lift-a", levelId: "oth-L2", roomId: "L2-hall", point: [5, 5] },
    { id: "esc-1-1", portalId: "esc-1", levelId: "oth-L1", roomId: "L1-hall", point: [8, 2] },
    { id: "orphan", portalId: "lift-gone", levelId: "oth-L1", roomId: "L1-hall", point: [9, 9] },
  ],
});

describe("levelMarkers", () => {
  it("marks each entrance and each lift or stair stop on the floor, by kind", () => {
    expect(levelMarkers(model, "oth-L1").map(m => `${m.id}:${m.kind}`).sort())
      .toEqual(["en-1:entrance", "esc-1-1:escalator", "lift-a-1:lift"]);
  });

  it("gives entrances, lifts and flights different shapes, so colour is never the only difference", () => {
    expect(MARKER_STYLE.entrance.shape).not.toBe(MARKER_STYLE.lift.shape);
    expect(MARKER_STYLE.lift.shape).not.toBe(MARKER_STYLE.escalator.shape);
    expect(MARKER_STYLE.escalator.shape).not.toBe(MARKER_STYLE.stair.shape);
  });
});
