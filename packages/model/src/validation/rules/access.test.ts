import { describe, expect, it } from "vitest";
import { parseModel } from "../../schema/model";
import { validateModel } from "../validate";
import { accessRules } from "./access";

const building = { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 };
const level = {
  id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1,
  nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6,
};

/** A shop unit fronting y = 0. */
const shop = {
  id: "L1-shop", levelId: "oth-L1", kind: "room",
  footprint: [[10, 0], [20, 0], [20, 8], [10, 8]],
  heightM: 3, walkable: false, nameEn: "Shop", nameZh: "商店",
};

function codes(extra: Record<string, unknown>) {
  return validateModel(parseModel({ building, levels: [level], ...extra }), accessRules)
    .issues.map(i => i.code);
}

describe("room access", () => {
  it("warns when no pathway comes near a destination room", () => {
    expect(codes({ rooms: [shop] })).toContain("room.noAccess");
  });

  it("is satisfied by a pathway running along the shop front", () => {
    const path = { id: "p", levelId: "oth-L1", polyline: [[0, -1], [30, -1]] };
    expect(codes({ rooms: [shop], pathways: [path] })).not.toContain("room.noAccess");
  });

  it("is satisfied by a pathway that enters the room", () => {
    const path = { id: "p", levelId: "oth-L1", polyline: [[15, 2], [15, 6]] };
    expect(codes({ rooms: [shop], pathways: [path] })).not.toContain("room.noAccess");
  });

  it("is not satisfied by a pathway further than the access radius", () => {
    const path = { id: "p", levelId: "oth-L1", polyline: [[0, -20], [30, -20]] };
    expect(codes({ rooms: [shop], pathways: [path] })).toContain("room.noAccess");
  });

  it("warns rather than errors, so a rough floorplan can still publish", () => {
    const report = validateModel(
      parseModel({ building, levels: [level], rooms: [shop] }),
      accessRules,
    );
    expect(report.errorCount).toBe(0);
    expect(report.ok).toBe(true);
  });

  it("ignores a pathway on another level", () => {
    const path = { id: "p", levelId: "oth-L9", polyline: [[0, -1], [30, -1]] };
    expect(codes({ rooms: [shop], pathways: [path] })).toContain("room.noAccess");
  });

  it("says nothing about an area, which is judged by reachability instead", () => {
    const area = { ...shop, id: "L1-area", kind: "area", walkable: true };
    expect(codes({ rooms: [area] })).not.toContain("room.noAccess");
  });

  it("says nothing about a void", () => {
    expect(codes({ rooms: [{ ...shop, id: "L1-void", kind: "void" }] })).not.toContain("room.noAccess");
  });

  it("names the room, so the message is actionable", () => {
    const report = validateModel(
      parseModel({ building, levels: [level], rooms: [shop] }),
      accessRules,
    );
    expect(report.issues[0]?.message).toContain("Shop");
  });
});

describe("pathway connectivity", () => {
  const area = {
    id: "L1-plaza", levelId: "oth-L1", kind: "area",
    footprint: [[0, 0], [20, 0], [20, 20], [0, 20]],
    heightM: 6, walkable: true, nameEn: "Plaza", nameZh: "广场",
  };
  const entrance = { id: "e1", levelId: "oth-L1", roomId: "L1-plaza", point: [10, 10] };

  it("errors on a pathway nothing can reach", () => {
    const stranded = { id: "p", levelId: "oth-L1", polyline: [[200, 200], [210, 200]] };
    expect(codes({ rooms: [area], entrances: [entrance], pathways: [stranded] }))
      .toContain("pathway.disconnected");
  });

  it("accepts a pathway joined to a reachable area", () => {
    const joined = { id: "p", levelId: "oth-L1", polyline: [[10, 10], [10, 30]] };
    expect(codes({ rooms: [area], entrances: [entrance], pathways: [joined] }))
      .not.toContain("pathway.disconnected");
  });

  it("says nothing when the model has no entrance yet", () => {
    // Everything is unreachable before an entrance exists; that is the
    // entrance step's problem, not every pathway's.
    const p = { id: "p", levelId: "oth-L1", polyline: [[0, 0], [10, 0]] };
    expect(codes({ rooms: [area], pathways: [p] })).not.toContain("pathway.disconnected");
  });

  it("blocks publish, unlike a room access warning", () => {
    const stranded = { id: "p", levelId: "oth-L1", polyline: [[200, 200], [210, 200]] };
    const report = validateModel(
      parseModel({ building, levels: [level], rooms: [area], entrances: [entrance], pathways: [stranded] }),
      accessRules,
    );
    expect(report.ok).toBe(false);
  });
});
