import { parseModel } from "@oth/model";
import { describe, expect, it } from "vitest";
import { summariseFloors } from "./views";

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
