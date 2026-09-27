import { describe, expect, it } from "vitest";
import { BuildingSchema, LevelSchema } from "./building";

const building = {
  id: "oth",
  name: "Our Tampines Hub",
  anchorLat: 1.3531,
  anchorLng: 103.9447,
  rotationDeg: 12.5,
};

describe("BuildingSchema", () => {
  it("accepts a georeferenced building", () => {
    expect(BuildingSchema.parse(building).anchorLat).toBe(1.3531);
  });

  it("rejects an out-of-range latitude", () => {
    expect(() => BuildingSchema.parse({ ...building, anchorLat: 91 })).toThrow();
  });

  it("defaults rotation to zero when the survey angle is unknown", () => {
    const { rotationDeg: _omitted, ...rest } = building;
    expect(BuildingSchema.parse(rest).rotationDeg).toBe(0);
  });
});

describe("LevelSchema", () => {
  const level = {
    id: "oth-L2",
    buildingId: "oth",
    code: "L2",
    ordinal: 2,
    nameEn: "Level 2",
    nameZh: "二楼",
    elevationM: 6.2,
    heightM: 4.5,
  };

  it("accepts a level", () => {
    expect(LevelSchema.parse(level).code).toBe("L2");
  });

  it("accepts a negative ordinal and elevation for a basement", () => {
    const b1 = LevelSchema.parse({
      ...level,
      id: "oth-B1",
      code: "B1",
      ordinal: -1,
      elevationM: -4,
      nameEn: "Basement 1",
      nameZh: "地下一层",
    });
    expect(b1.ordinal).toBe(-1);
    expect(b1.elevationM).toBe(-4);
  });

  it("rejects a non-positive floor-to-floor height", () => {
    expect(() => LevelSchema.parse({ ...level, heightM: 0 })).toThrow();
  });
});

describe("level owners", () => {
  const level = {
    id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1,
    nameEn: "Level 1", nameZh: "一楼", elevationM: 0, heightM: 6,
  };

  it("has no owners until someone is assigned", () => {
    expect(LevelSchema.parse(level).ownerIds).toEqual([]);
  });

  it("keeps the owners it is given", () => {
    expect(LevelSchema.parse({ ...level, ownerIds: ["user_a", "user_b"] }).ownerIds).toEqual(["user_a", "user_b"]);
  });
});
