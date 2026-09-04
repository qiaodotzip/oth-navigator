import { describe, expect, it } from "vitest";
import { parseModel } from "../../schema/model";
import { validateModel } from "../validate";
import { structureRules } from "./structure";

const building = { id: "oth", name: "Our Tampines Hub", anchorLat: 1.3531, anchorLng: 103.9447 };
const level = {
  id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1,
  nameEn: "Level 1", nameZh: "一楼", elevationM: 0, heightM: 6,
};

const goodRoom = {
  id: "L1-room-a", levelId: "oth-L1", kind: "room",
  footprint: [[0, 0], [10, 0], [10, 8], [0, 8]], heightM: 3.5, walkable: true,
};

function codes(rooms: unknown[]) {
  return validateModel(parseModel({ building, levels: [level], rooms }), structureRules)
    .issues.map(i => i.code);
}

describe("structure rules", () => {
  it("accepts a valid room", () => {
    expect(codes([goodRoom])).toEqual([]);
  });

  it("rejects a self-intersecting footprint", () => {
    expect(codes([{ ...goodRoom, footprint: [[0, 0], [2, 2], [2, 0], [0, 2]] }]))
      .toContain("room.footprint.selfIntersecting");
  });

  it("rejects a footprint with near-zero area", () => {
    expect(codes([{ ...goodRoom, footprint: [[0, 0], [0.05, 0], [0.05, 0.05]] }]))
      .toContain("room.footprint.degenerateArea");
  });

  it("rejects a hole that is not simple", () => {
    expect(codes([{ ...goodRoom, holes: [[[1, 1], [3, 3], [3, 1], [1, 3]]] }]))
      .toContain("room.hole.selfIntersecting");
  });

  it("rejects duplicate room ids", () => {
    expect(codes([goodRoom, { ...goodRoom }])).toContain("room.id.duplicate");
  });

  it("rejects a room on a level that does not exist", () => {
    expect(codes([{ ...goodRoom, levelId: "oth-L9" }])).toContain("room.levelId.missing");
  });

  it("ignores soft-deleted rooms", () => {
    expect(codes([{
      ...goodRoom,
      footprint: [[0, 0], [2, 2], [2, 0], [0, 2]],
      deletedAt: "2026-09-01T00:00:00.000Z",
    }])).toEqual([]);
  });

  it("rejects duplicate level codes within a building", () => {
    const m = parseModel({ building, levels: [level, { ...level, id: "oth-L1-dup" }], rooms: [] });
    expect(validateModel(m, structureRules).issues.map(i => i.code)).toContain("level.code.duplicate");
  });
});
