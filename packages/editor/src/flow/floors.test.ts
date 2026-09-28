import { parseModel } from "@oth/model";
import { describe, expect, it } from "vitest";
import { findLevel, levelBelow, pickTab, sortedLevels, yourFloor } from "./floors";

const lvl = (code: string, ordinal: number, ownerIds: string[] = []) => ({
  id: `oth-${code}`, buildingId: "oth", code, ordinal, nameEn: code, nameZh: code,
  elevationM: ordinal * 5, heightM: 5, ownerIds,
});

const model = parseModel({
  building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
  levels: [lvl("L3", 3, ["u_aisha"]), lvl("L1", 1, ["u_sc"]), lvl("L2", 2, ["u_wei", "u_gone"])],
});

describe("floors", () => {
  it("sorts floors from the bottom up", () => {
    expect(sortedLevels(model).map(l => l.code)).toEqual(["L1", "L2", "L3"]);
  });

  it("finds a floor by code, whatever its case", () => {
    expect(findLevel(model, "l2")?.id).toBe("oth-L2");
    expect(findLevel(model, "L9")).toBeNull();
  });

  it("finds the floor below, and none below the lowest", () => {
    expect(levelBelow(model, "oth-L2")?.code).toBe("L1");
    expect(levelBelow(model, "oth-L1")).toBeNull();
    expect(levelBelow(model, "oth-L9")).toBeNull();
  });

  it("takes your floor to be the lowest you own", () => {
    expect(yourFloor(model, "u_wei", null)?.code).toBe("L2");
  });

  it("falls back to the floor you last worked on, then the lowest", () => {
    expect(yourFloor(model, "u_nobody", "L3")?.code).toBe("L3");
    expect(yourFloor(model, "u_nobody", "L9")?.code).toBe("L1");
    expect(yourFloor(model, null, null)?.code).toBe("L1");
  });

  it("picks the tab you last used, else survey where there is footage, else build", () => {
    expect(pickTab("review", false)).toBe("review");
    expect(pickTab(null, true)).toBe("survey");
    expect(pickTab("junk", false)).toBe("build");
  });
});
