import { describe, expect, it } from "vitest";
import { parseModel } from "../../schema/model";
import { validateModel } from "../validate";
import { referenceRules } from "./references";

const base = {
  building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
  levels: [{
    id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1,
    nameEn: "Level 1", nameZh: "一楼", elevationM: 0, heightM: 6,
  }],
  rooms: [
    {
      id: "L1-room-a", levelId: "oth-L1", kind: "room",
      footprint: [[0, 0], [10, 0], [10, 10], [0, 10]], heightM: 3.5, walkable: true,
    },
    {
      id: "L1-room-b", levelId: "oth-L1", kind: "room",
      footprint: [[10, 0], [20, 0], [20, 10], [10, 10]], heightM: 3.5, walkable: true,
    },
  ],
};

function codes(extra: Record<string, unknown>) {
  return validateModel(parseModel({ ...base, ...extra }), referenceRules).issues.map(i => i.code);
}

const doorway = {
  id: "L1-door-ab", levelId: "oth-L1", roomA: "L1-room-a", roomB: "L1-room-b",
  segment: [[10, 4], [10, 6]], widthM: 2,
};

describe("reference rules", () => {
  it("accepts a well-formed doorway", () => {
    expect(codes({ doorways: [doorway] })).toEqual([]);
  });

  it("rejects a doorway referencing a missing room", () => {
    expect(codes({ doorways: [{ ...doorway, roomB: "L1-room-z" }] })).toContain("doorway.room.missing");
  });

  it("rejects a doorway whose rooms are on a different level", () => {
    expect(codes({ doorways: [{ ...doorway, levelId: "oth-L9" }] })).toContain("doorway.levelId.missing");
  });

  it("rejects a doorway joining a room to itself", () => {
    expect(codes({ doorways: [{ ...doorway, roomB: "L1-room-a" }] })).toContain("doorway.room.selfJoin");
  });

  it("accepts an entrance inside its room", () => {
    expect(codes({ entrances: [{ id: "e1", levelId: "oth-L1", roomId: "L1-room-a", point: [5, 5] }] })).toEqual([]);
  });

  it("rejects an entrance whose point falls outside its room", () => {
    expect(codes({ entrances: [{ id: "e1", levelId: "oth-L1", roomId: "L1-room-a", point: [50, 50] }] }))
      .toContain("entrance.point.outsideRoom");
  });

  it("rejects a portal endpoint outside its room", () => {
    expect(codes({
      portals: [{ id: "p1", kind: "lift", nameEn: "Lift", nameZh: "电梯" }],
      portalEndpoints: [
        { id: "p1-L1", portalId: "p1", levelId: "oth-L1", roomId: "L1-room-a", point: [99, 99] },
        { id: "p1-L1b", portalId: "p1", levelId: "oth-L1", roomId: "L1-room-b", point: [15, 5] },
      ],
    })).toContain("portalEndpoint.point.outsideRoom");
  });

  it("rejects a portal endpoint referencing a missing portal", () => {
    expect(codes({
      portalEndpoints: [{ id: "x", portalId: "nope", levelId: "oth-L1", roomId: "L1-room-a", point: [5, 5] }],
    })).toContain("portalEndpoint.portal.missing");
  });

  it("rejects a portal with only one endpoint — it connects nothing", () => {
    expect(codes({
      portals: [{ id: "p1", kind: "lift", nameEn: "Lift", nameZh: "电梯" }],
      portalEndpoints: [{ id: "p1-L1", portalId: "p1", levelId: "oth-L1", roomId: "L1-room-a", point: [5, 5] }],
    })).toContain("portal.endpoints.insufficient");
  });

  it("rejects a tenant referencing a missing room", () => {
    expect(codes({
      tenants: [{
        id: "t1", levelId: "oth-L1", roomId: "L1-room-z", nameEn: "Shop", nameZh: "商店",
        category: "retail", sourceUrl: "https://example.com/",
      }],
    })).toContain("tenant.room.missing");
  });

  it("rejects a placement referencing a missing asset", () => {
    expect(codes({
      placements: [{ id: "pl1", levelId: "oth-L1", assetId: "missing-asset", position: [1, 1, 0] }],
    })).toContain("placement.asset.missing");
  });

  const kind = { id: "ok_bin", nameEn: "wastebin", size: { w: 0.5, d: 0.5, h: 1 } };
  const object = { id: "L1-bin-1", levelId: "oth-L1", objectKindId: "ok_bin", position: [1, 1, 0] };

  it("accepts an object with a kind and no model of its own", () => {
    expect(codes({ objectKinds: [kind], placements: [object] })).toEqual([]);
  });

  it("rejects a placement with neither a model nor a kind: there is nothing to show", () => {
    expect(codes({ placements: [{ id: "pl1", levelId: "oth-L1", position: [1, 1, 0] }] }))
      .toContain("placement.assetOrKind.missing");
  });

  it("rejects an object whose kind does not exist, or was deleted", () => {
    expect(codes({ placements: [object] })).toContain("placement.objectKind.missing");
    expect(codes({ objectKinds: [{ ...kind, deletedAt: "2026-09-28T00:00:00.000Z" }], placements: [object] }))
      .toContain("placement.objectKind.missing");
  });

  it("rejects a kind whose model does not exist", () => {
    expect(codes({ objectKinds: [{ ...kind, assetId: "missing-asset" }] })).toContain("objectKind.asset.missing");
  });
});
