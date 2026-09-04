import { describe, expect, it } from "vitest";
import { parseModel } from "../schema/model";
import { reachabilityRules } from "../validation/rules/reachability";
import { validateModel } from "../validation/validate";
import { buildingReachability, reachableAt } from "./reachability";

const building = { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 };

const levels = [
  { id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6 },
  { id: "oth-L2", buildingId: "oth", code: "L2", ordinal: 2, nameEn: "L2", nameZh: "二楼", elevationM: 6, heightM: 4.5 },
];

const l1Lobby = {
  id: "L1-lobby", levelId: "oth-L1", kind: "atrium",
  footprint: [[0, 0], [10, 0], [10, 10], [0, 10]], heightM: 6, walkable: true,
};
const l1Back = {
  id: "L1-back", levelId: "oth-L1", kind: "room",
  footprint: [[10, 0], [20, 0], [20, 10], [10, 10]], heightM: 6, walkable: true,
};
const l2Hall = {
  id: "L2-hall", levelId: "oth-L2", kind: "corridor",
  footprint: [[0, 0], [10, 0], [10, 10], [0, 10]], heightM: 4.5, walkable: true,
};

const entrance = { id: "e-main", levelId: "oth-L1", roomId: "L1-lobby", point: [5, 5], isPrimary: true };
const doorAB = {
  id: "d-ab", levelId: "oth-L1", roomA: "L1-lobby", roomB: "L1-back",
  segment: [[10, 4], [10, 6]], widthM: 2,
};
const lift = { id: "p-lift", kind: "lift", nameEn: "Lift", nameZh: "电梯" };
const liftEnds = [
  { id: "p-lift-L1", portalId: "p-lift", levelId: "oth-L1", roomId: "L1-lobby", point: [2, 2] },
  { id: "p-lift-L2", portalId: "p-lift", levelId: "oth-L2", roomId: "L2-hall", point: [2, 2] },
];

function model(extra: Record<string, unknown>) {
  return parseModel({ building, levels, entrances: [entrance], ...extra });
}

describe("buildingReachability", () => {
  it("reaches the entrance room", () => {
    const r = buildingReachability(model({ rooms: [l1Lobby] })).get("oth-L1");
    expect(r && reachableAt(r.grid, r.mask, [5, 5])).toBe(true);
  });

  it("reaches an adjoining room through a doorway", () => {
    const r = buildingReachability(model({ rooms: [l1Lobby, l1Back], doorways: [doorAB] })).get("oth-L1");
    expect(r && reachableAt(r.grid, r.mask, [15, 5])).toBe(true);
  });

  it("does not reach an adjoining room with no doorway", () => {
    const r = buildingReachability(model({ rooms: [l1Lobby, l1Back] })).get("oth-L1");
    expect(r && reachableAt(r.grid, r.mask, [15, 5])).toBe(false);
  });

  it("reaches an upper level through a lift portal", () => {
    const m = model({ rooms: [l1Lobby, l2Hall], portals: [lift], portalEndpoints: liftEnds });
    const r = buildingReachability(m).get("oth-L2");
    expect(r && reachableAt(r.grid, r.mask, [5, 5])).toBe(true);
  });

  it("does not reach an upper level with no portal", () => {
    const r = buildingReachability(model({ rooms: [l1Lobby, l2Hall] })).get("oth-L2");
    expect(r && reachableAt(r.grid, r.mask, [5, 5])).toBe(false);
  });
});

describe("reachability rule", () => {
  function codes(extra: Record<string, unknown>) {
    return validateModel(model(extra), reachabilityRules).issues.map(i => i.code);
  }

  it("passes when everything is reachable", () => {
    expect(codes({ rooms: [l1Lobby, l1Back], doorways: [doorAB] })).toEqual([]);
  });

  it("flags a walkable room cut off from every entrance", () => {
    expect(codes({ rooms: [l1Lobby, l1Back] })).toContain("room.unreachable");
  });

  it("flags a modelled upper level with no portal serving it", () => {
    expect(codes({ rooms: [l1Lobby, l2Hall] })).toContain("room.unreachable");
  });

  it("does not flag non-walkable rooms", () => {
    expect(codes({ rooms: [l1Lobby, { ...l1Back, walkable: false }] })).toEqual([]);
  });

  it("errors when the model has no entrance at all", () => {
    const m = parseModel({ building, levels, rooms: [l1Lobby] });
    expect(validateModel(m, reachabilityRules).issues.map(i => i.code)).toContain("building.entrances.none");
  });
});
