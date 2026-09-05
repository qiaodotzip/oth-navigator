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
});
