import { describe, expect, it } from "vitest";
import { getCatalog } from "./serviceCatalog";

describe("getCatalog", () => {
  it("returns the full catalog with no filter", () => {
    const all = getCatalog();
    expect(all.length).toBeGreaterThanOrEqual(12);
  });

  it("filters by a single category", () => {
    const gov = getCatalog({ category: ["government"] });
    expect(gov.length).toBeGreaterThan(0);
    expect(gov.every(s => s.category === "government")).toBe(true);
  });

  it("ORs multiple categories", () => {
    const set = getCatalog({ category: ["healthcare", "community"] });
    expect(set.every(s => s.category === "healthcare" || s.category === "community")).toBe(true);
    expect(set.some(s => s.category === "healthcare")).toBe(true);
    expect(set.some(s => s.category === "community")).toBe(true);
  });

  it("ANDs floor with category (floor applies to routable services)", () => {
    const govL1 = getCatalog({ category: ["government"], floor: "L1" });
    expect(govL1.every(s => s.category === "government" && s.floorId === "L1")).toBe(true);
  });

  it("returns empty for an unknown category", () => {
    // @ts-expect-error testing runtime tolerance of an unknown value
    expect(getCatalog({ category: ["nope"] })).toEqual([]);
  });
});
