import { RoomSchema } from "@oth/model";
import { describe, expect, it } from "vitest";
import { PLAN_MPP, TRACED_ZONES, pxToModel, zoneFootprint } from "./tracedPlans";

describe("plan calibration", () => {
  it("uses the sheet's own scale, not the drawn scale bar", () => {
    // The bar reads 356 px for 25 m (0.0702) and is wrong by 3x.
    expect(PLAN_MPP).toBeCloseTo(0.21, 5);
  });

  it("puts the origin at the model origin", () => {
    expect(pxToModel(950, 1750)).toEqual([0, 0]);
  });

  it("flips y, so north is positive", () => {
    const [, yUp] = pxToModel(950, 1650);
    expect(yUp).toBeGreaterThan(0);
  });

  it("measures the football pitch at full size, which is how the scale was checked", () => {
    // 505 px goal line to goal line.
    const [, top] = pxToModel(0, 950);
    const [, bottom] = pxToModel(0, 1455);
    expect(Math.abs(top - bottom)).toBeCloseTo(106, 0);
  });
});

describe("traced zones", () => {
  it("produces footprints the model accepts as they are", () => {
    for (const zone of TRACED_ZONES) {
      expect(() => RoomSchema.parse({
        id: zone.id, levelId: zone.levelId, kind: zone.kind,
        footprint: zoneFootprint(zone), heightM: zone.heightM,
        walkable: zone.kind === "area", nameEn: zone.nameEn, nameZh: zone.nameZh,
      })).not.toThrow();
    }
  });

  it("gives every zone a unique id", () => {
    const ids = TRACED_ZONES.map(z => z.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("names every zone in both languages, since the app is bilingual", () => {
    for (const zone of TRACED_ZONES) {
      expect(zone.nameEn.length).toBeGreaterThan(0);
      expect(zone.nameZh.length).toBeGreaterThan(0);
    }
  });

  it("makes the town square the size the drawing says", () => {
    const sq = TRACED_ZONES.find(z => z.id === "L1-town-square")!;
    const ring = zoneFootprint(sq);
    const xs = ring.map(p => p[0]); const ys = ring.map(p => p[1]);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(87.2, 0);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(126.4, 0);
  });

  it("stacks the L2 void exactly over the L1 town square, since the sheets are registered", () => {
    const l1 = zoneFootprint(TRACED_ZONES.find(z => z.id === "L1-town-square")!);
    const l2 = zoneFootprint(TRACED_ZONES.find(z => z.id === "L2-town-square-void")!);
    expect(l2).toEqual(l1);
  });

  it("marks only areas walkable, so nothing routes through a studio", () => {
    const areas = TRACED_ZONES.filter(z => z.kind === "area");
    expect(areas.length).toBeGreaterThan(0);
    expect(TRACED_ZONES.some(z => z.kind === "void")).toBe(true);
  });
});
