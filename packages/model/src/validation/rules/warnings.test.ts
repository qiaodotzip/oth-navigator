import { describe, expect, it } from "vitest";
import { parseModel } from "../../schema/model";
import { validateModel } from "../validate";
import { warningRules } from "./warnings";

const building = { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 };
const level = {
  id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1,
  nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6,
};
const room = {
  id: "L1-room-a", levelId: "oth-L1", kind: "room",
  footprint: [[0, 0], [10, 0], [10, 10], [0, 10]],
  heightM: 3.5, walkable: true, nameEn: "Room A", nameZh: "A室",
};

function report(extra: Record<string, unknown>) {
  return validateModel(parseModel({ building, levels: [level], rooms: [room], ...extra }), warningRules);
}

describe("warning rules", () => {
  it("produces no name warning for a named room", () => {
    expect(report({}).issues.map(i => i.code)).not.toContain("room.name.missing");
  });

  it("never blocks publish — every issue is a warning", () => {
    const r = report({ rooms: [{ ...room, nameEn: "", nameZh: "" }] });
    expect(r.errorCount).toBe(0);
    expect(r.ok).toBe(true);
  });

  it("warns about an unnamed room", () => {
    expect(report({ rooms: [{ ...room, nameEn: "", nameZh: "" }] }).issues.map(i => i.code))
      .toContain("room.name.missing");
  });

  it("warns about an unverified tenant", () => {
    expect(report({
      tenants: [{
        id: "t1", levelId: "oth-L1", roomId: "L1-room-a", nameEn: "Shop", nameZh: "商店",
        category: "retail", sourceUrl: "https://example.com/",
      }],
    }).issues.map(i => i.code)).toContain("tenant.unverified");
  });

  it("does not warn about a verified tenant", () => {
    expect(report({
      tenants: [{
        id: "t1", levelId: "oth-L1", roomId: "L1-room-a", nameEn: "Shop", nameZh: "商店",
        category: "retail", sourceUrl: "https://example.com/",
        verification: { status: "onsite", evidence: ["photo:1"] },
      }],
    }).issues.map(i => i.code)).not.toContain("tenant.unverified");
  });

  it("warns when a level has no portal serving it", () => {
    expect(report({}).issues.map(i => i.code)).toContain("level.portals.none");
  });

  it("warns when a placement escapes its anchor room", () => {
    expect(report({
      assets: [{
        id: "a1", filename: "x.glb", storagePath: "assets/x.glb", checksum: "x",
        sizeBytes: 1000, triangleCount: 100,
        bbox: { minX: -1, minY: -1, minZ: 0, maxX: 1, maxY: 1, maxZ: 2 },
      }],
      placements: [{ id: "pl1", levelId: "oth-L1", assetId: "a1", roomId: "L1-room-a", position: [50, 50, 0] }],
    }).issues.map(i => i.code)).toContain("placement.outsideAnchorRoom");
  });
});

describe("details", () => {
  const detail = {
    id: "L1-seats", levelId: "oth-L1", kind: "detail",
    footprint: [[0, 0], [4, 0], [4, 2], [0, 2]],
    heightM: 1.2, walkable: false,
  };

  const codes = (extra: Record<string, unknown>) =>
    validateModel(parseModel({ building, levels: [level], ...extra }), warningRules)
      .issues.map(i => i.code);

  it("needs no name, since 'seating block 3' is not a place you go", () => {
    expect(codes({ rooms: [detail] })).not.toContain("room.name.missing");
  });

  it("still warns about an unnamed room, which is a place you go", () => {
    expect(codes({ rooms: [{ ...detail, id: "L1-shop", kind: "room" }] }))
      .toContain("room.name.missing");
  });

  const asset = {
    id: "asset_1", filename: "v.glb", storagePath: "a", checksum: "c",
    sizeBytes: 10, triangleCount: 5,
    bbox: { minX: 0, minY: 0, minZ: 0, maxX: 1, maxY: 1, maxZ: 1 },
  };

  it("warns that a detail has nothing modelled on it yet", () => {
    expect(codes({ rooms: [detail] })).toContain("detail.undressed");
  });

  it("says nothing once a placement anchors to it", () => {
    expect(codes({
      rooms: [detail],
      assets: [asset],
      placements: [{
        id: "pl_1", levelId: "oth-L1", assetId: "asset_1",
        roomId: "L1-seats", position: [2, 1, 0],
      }],
    })).not.toContain("detail.undressed");
  });

  it("is not fooled by a placement anchored to some other space", () => {
    expect(codes({
      rooms: [detail, { ...detail, id: "L1-other" }],
      assets: [asset],
      placements: [{
        id: "pl_1", levelId: "oth-L1", assetId: "asset_1",
        roomId: "L1-other", position: [2, 1, 0],
      }],
    })).toContain("detail.undressed");
  });

  it("still warns when only an object stands on it, since a wastebin is not the detail's model", () => {
    expect(codes({
      rooms: [detail],
      objectKinds: [{ id: "ok_bin", nameEn: "wastebin", size: { w: 0.5, d: 0.5, h: 1 } }],
      placements: [{
        id: "L1-bin-1", levelId: "oth-L1", objectKindId: "ok_bin",
        roomId: "L1-seats", position: [2, 1, 0],
      }],
    })).toContain("detail.undressed");
  });

  it("never blocks a publish, since drawing extents first is a way to work", () => {
    const r = validateModel(parseModel({ building, levels: [level], rooms: [detail] }), warningRules);
    expect(r.errorCount).toBe(0);
  });

  it("says nothing about an undressed room, which needs no model", () => {
    expect(codes({ rooms: [{ ...detail, id: "L1-shop", kind: "room" }] }))
      .not.toContain("detail.undressed");
  });
});
