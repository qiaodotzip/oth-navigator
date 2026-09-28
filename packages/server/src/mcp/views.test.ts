import { parseModel, type ValidationReport } from "@oth/model";
import { describe, expect, it } from "vitest";
import { findLevel, floorIssues, floorOutline, frameList, frameTags, summariseFloors } from "./views";

const square = [[0, 0], [4, 0], [4, 4], [0, 4]];

const model = parseModel({
  building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
  levels: [
    { id: "oth-L2", buildingId: "oth", code: "L2", ordinal: 2, nameEn: "Level 2", nameZh: "二楼", elevationM: 6, heightM: 4, ownerIds: ["u_gone"] },
    { id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "Level 1", nameZh: "一楼", elevationM: 0, heightM: 6, ownerIds: ["u_wei"] },
  ],
  rooms: [
    { id: "r1", levelId: "oth-L1", kind: "room", footprint: square, heightM: 4 },
    { id: "r2", levelId: "oth-L1", kind: "room", footprint: square, heightM: 4 },
    { id: "r3", levelId: "oth-L2", kind: "area", footprint: square, heightM: 4 },
  ],
  places: [
    { id: "pl_a", nameEn: "A", category: "retail", levelId: "oth-L1", roomId: "r1" },
    { id: "pl_b", nameEn: "B", category: "retail", levelId: "oth-L1", status: "proposed" },
    { id: "pl_c", nameEn: "C", category: "retail", levelId: "oth-L1" },
    { id: "pl_d", nameEn: "D", category: "retail", levelId: "oth-L2", roomId: "gone" },
  ],
});

describe("summariseFloors", () => {
  it("gives each floor lowest first, its owners by name, and how far its map has come", () => {
    expect(summariseFloors(model, new Map([["u_wei", "Wei"]]))).toEqual([
      { id: "oth-L1", code: "L1", name: "Level 1", version: 0, owners: ["Wei"], rooms: 2, places: { confirmed: 2, proposed: 1 }, bound: 1 },
      { id: "oth-L2", code: "L2", name: "Level 2", version: 0, owners: ["u_gone"], rooms: 1, places: { confirmed: 1, proposed: 0 }, bound: 0 },
    ]);
  });
});

const survey = parseModel({
  building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
  levels: [
    { id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "Level 1", nameZh: "一楼", elevationM: 0, heightM: 6, ownerIds: ["u_wei"] },
    { id: "oth-L2", buildingId: "oth", code: "L2", ordinal: 2, nameEn: "Level 2", nameZh: "二楼", elevationM: 6, heightM: 4 },
  ],
  rooms: [
    { id: "L1-shop-12", levelId: "oth-L1", kind: "room", footprint: square, heightM: 4, nameEn: "Shop 12" },
    { id: "L2-hall", levelId: "oth-L2", kind: "area", footprint: square, heightM: 4, nameEn: "Hall" },
  ],
  pathways: [{ id: "pw_1", levelId: "oth-L1", polyline: [[0, 0], [5, 0]], nameEn: "Mall street" }],
  entrances: [{ id: "e_1", levelId: "oth-L1", roomId: "L1-shop-12", point: [1, 1], nameEn: "Main" }],
  portals: [{ id: "lift_a", kind: "lift", nameEn: "Lift A" }],
  portalEndpoints: [{ id: "lift_a-L1", portalId: "lift_a", levelId: "oth-L1", roomId: "L1-shop-12", point: [2, 2] }],
  captures: [
    { id: "cap_1", kind: "video", filename: "L1 walk.mp4", levelId: "oth-L1" },
    { id: "cap_2", kind: "video", filename: "L2 walk.mp4", levelId: "oth-L2" },
  ],
  keyframes: [
    { id: "kf_2", captureId: "cap_1", timeMs: 2000, imageId: "kf_2", widthPx: 640, heightPx: 480 },
    { id: "kf_1", captureId: "cap_1", timeMs: 1000, imageId: "kf_1", widthPx: 640, heightPx: 480 },
    { id: "kf_3", captureId: "cap_1", timeMs: 3000, imageId: "kf_3", widthPx: 640, heightPx: 480 },
    { id: "kf_9", captureId: "cap_2", timeMs: 1000, imageId: "kf_9", widthPx: 640, heightPx: 480 },
  ],
  places: [
    { id: "pl_sb", nameEn: "Starbucks", category: "retail", levelId: "oth-L1", roomId: "L1-shop-12" },
    { id: "pl_gc", nameEn: "Gong Cha", category: "retail", levelId: "oth-L1", status: "proposed" },
  ],
  sightings: [
    { id: "sg_1", placeId: "pl_sb", keyframeId: "kf_1", box: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 } },
    { id: "sg_2", placeId: "pl_gc", keyframeId: "kf_2", status: "proposed" },
  ],
});

describe("findLevel", () => {
  it("finds a floor by its code, in any case, or by its id", () => {
    expect(findLevel(survey, "l1")?.id).toBe("oth-L1");
    expect(findLevel(survey, "oth-L2")?.code).toBe("L2");
    expect(findLevel(survey, "L9")).toBeNull();
  });
});

describe("floorOutline", () => {
  it("lists one floor's things as ids, names, kinds and versions, with the place bound to each room", () => {
    const outline = floorOutline(survey, findLevel(survey, "L1")!, new Map([["u_wei", "Wei"]]));
    expect(outline).toEqual({
      floor: { id: "oth-L1", code: "L1", name: "Level 1", version: 0, owners: ["Wei"] },
      rooms: [{ id: "L1-shop-12", name: "Shop 12", kind: "room", version: 0, walkable: false, verification: "unverified", place: { id: "pl_sb", name: "Starbucks" } }],
      pathways: [{ id: "pw_1", name: "Mall street", kindId: null, version: 0 }],
      entrances: [{ id: "e_1", name: "Main", roomId: "L1-shop-12", version: 0 }],
      lifts: [{ id: "lift_a-L1", portalId: "lift_a", kind: "lift", name: "Lift A", roomId: "L1-shop-12", version: 0 }],
      places: [
        { id: "pl_sb", name: "Starbucks", category: "retail", status: "confirmed", roomId: "L1-shop-12", version: 0 },
        { id: "pl_gc", name: "Gong Cha", category: "retail", status: "proposed", roomId: null, version: 0 },
      ],
    });
  });
});

describe("floorIssues", () => {
  it("keeps one floor's issues, errors first, and says how many more there are", () => {
    const issue = (severity: "error" | "warning", entityId: string, levelId?: string) =>
      ({ severity, code: `x.${entityId}`, message: entityId, entityType: "room" as const, entityId, levelId });
    const report: ValidationReport = {
      issues: [issue("error", "a", "oth-L1"), issue("error", "b", "oth-L2"), issue("warning", "c", "oth-L1"), issue("warning", "d", "oth-L1")],
      errorCount: 2, warningCount: 2, ok: false,
    };
    expect(floorIssues(report, "oth-L1", 2)).toEqual({
      errors: 1,
      warnings: 2,
      issues: [
        { severity: "error", code: "x.a", message: "a", entityType: "room", entityId: "a" },
        { severity: "warning", code: "x.c", message: "c", entityType: "room", entityId: "c" },
      ],
      more: 1,
    });
  });
});

describe("frameList", () => {
  it("gives a floor's frames in filming order, filtered by what is tagged on them", () => {
    const ids = (show: "untagged" | "proposed" | "tagged" | "all") => frameList(survey, "oth-L1", show, 40, 0).frames.map(f => f.id);
    expect(ids("untagged")).toEqual(["kf_3"]);
    expect(ids("proposed")).toEqual(["kf_2"]);
    expect(ids("tagged")).toEqual(["kf_1"]);
    expect(ids("all")).toEqual(["kf_1", "kf_2", "kf_3"]);
    expect(frameList(survey, "oth-L1", "all", 1, 1)).toEqual({
      total: 3, offset: 1, frames: [{ id: "kf_2", captureId: "cap_1", timeMs: 2000, tags: 1, proposed: 1 }],
    });
  });
});

describe("frameTags", () => {
  it("says what is tagged on a frame, with each tag's place, status and box", () => {
    expect(frameTags(survey, "kf_1")).toEqual([
      { sightingId: "sg_1", placeId: "pl_sb", name: "Starbucks", category: "retail", status: "confirmed", box: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 } },
    ]);
    expect(frameTags(survey, "kf_3")).toEqual([]);
  });
});
