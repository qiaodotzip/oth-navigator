import { parseModel, TenantCategorySchema } from "@oth/model";
import { describe, expect, it } from "vitest";
import { CATEGORY_TINT, roomTints } from "./categoryTint";
import { roomColor } from "./theme";

const sq = (x0: number, y0: number, x1: number, y1: number) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const model = parseModel({
  building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
  levels: [{ id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6 }],
  rooms: ["L1-shop", "L1-clinic", "L1-empty", "L1-twice"].map((id, i) => ({
    id, levelId: "oth-L1", kind: "room", footprint: sq(i * 10, 0, i * 10 + 8, 8), heightM: 3.5,
  })),
  places: [
    { id: "pl-sbux", nameEn: "Starbucks", category: "retail", roomId: "L1-shop" },
    { id: "pl-clinic", nameEn: "Polyclinic", category: "healthcare", roomId: "L1-clinic", deletedAt: "2026-09-28T00:00:00.000Z" },
    { id: "pl-b", nameEn: "Badminton", category: "sports", roomId: "L1-twice" },
    { id: "pl-a", nameEn: "Arts club", category: "community", roomId: "L1-twice" },
  ],
});

describe("roomTints", () => {
  const tints = roomTints(model, "oth-L1");

  it("tints a room by the category of the place bound to it", () => {
    expect(tints.get("L1-shop")).toBe(CATEGORY_TINT.retail);
  });

  it("leaves a room with no place, or only a deleted one, untinted", () => {
    expect(tints.has("L1-empty")).toBe(false);
    expect(tints.has("L1-clinic")).toBe(false);
  });

  it("picks the same place every time when two are bound to one room", () => {
    expect(tints.get("L1-twice")).toBe(CATEGORY_TINT.community);
  });
});

describe("CATEGORY_TINT", () => {
  it("gives every category its own colour, none of them the plain room colour", () => {
    const colours = TenantCategorySchema.options.map(c => CATEGORY_TINT[c]);
    expect(new Set(colours).size).toBe(colours.length);
    expect(colours).not.toContain(roomColor("room"));
  });
});
