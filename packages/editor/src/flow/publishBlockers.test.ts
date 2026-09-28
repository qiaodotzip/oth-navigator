import { parseModel, type ValidationReport } from "@oth/model";
import { describe, expect, it } from "vitest";
import { publishBlockers } from "./publishBlockers";

const model = parseModel({
  building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
  levels: [
    { id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "Level 1", nameZh: "一楼", elevationM: 0, heightM: 6 },
    { id: "oth-L2", buildingId: "oth", code: "L2", ordinal: 2, nameEn: "Level 2", nameZh: "二楼", elevationM: 6, heightM: 4 },
  ],
});

const report: ValidationReport = {
  ok: false,
  errorCount: 3,
  warningCount: 1,
  issues: [
    { severity: "error", code: "area.unreachable", message: "Area \"Hall\" cannot be reached.", entityType: "room", entityId: "L2-hall", levelId: "oth-L2" },
    { severity: "error", code: "entrance.offFloor", message: "Entrance \"Gate 1\" stands on a wall.", entityType: "entrance", entityId: "e1", levelId: "oth-L1" },
    { severity: "error", code: "building.entrances.none", message: "No entrance.", entityType: "building", entityId: "oth" },
    { severity: "warning", code: "room.name.missing", message: "Unnamed.", entityType: "room", entityId: "r", levelId: "oth-L1" },
  ],
};

describe("publishBlockers", () => {
  it("lists errors only, the whole building first, then floors bottom up", () => {
    const groups = publishBlockers(model, report);
    expect(groups.map(g => g.label)).toEqual(["Whole building", "L1 · Level 1", "L2 · Level 2"]);
    expect(groups.flatMap(g => g.items)).toHaveLength(3);
  });

  it("links each floor's blocker to the build step that fixes it", () => {
    const l1 = publishBlockers(model, report).find(g => g.key === "oth-L1")!;
    expect(l1.items[0]).toEqual({
      message: "Entrance \"Gate 1\" stands on a wall.",
      link: "/floors/L1/build?step=entrances",
      stepLabel: "Entrances & lifts",
    });
  });

  describe("a lift that connects nothing", () => {
    const lifts = parseModel({
      building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
      levels: [
        { id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "Level 1", nameZh: "一楼", elevationM: 0, heightM: 6 },
        { id: "oth-L2", buildingId: "oth", code: "L2", ordinal: 2, nameEn: "Level 2", nameZh: "二楼", elevationM: 6, heightM: 4 },
      ],
      rooms: [{ id: "L2-hall", levelId: "oth-L2", kind: "area", footprint: [[0, 0], [10, 0], [10, 10], [0, 10]], heightM: 4 }],
      portals: [{ id: "portal-1727", kind: "lift", nameEn: "Lift B" }, { id: "portal-orphan", kind: "lift" }],
      portalEndpoints: [{ id: "ep-1", portalId: "portal-1727", levelId: "oth-L2", roomId: "L2-hall", point: [5, 5] }],
    });
    // The validator files both under no floor, and names each by its id.
    const tooFew = (id: string) => ({
      severity: "error" as const, code: "portal.endpoints.insufficient",
      message: `Portal "${id}" has fewer than two endpoints, so it connects nothing.`,
      entityType: "portal" as const, entityId: id,
    });
    const groups = publishBlockers(lifts, { ok: false, errorCount: 2, warningCount: 0, issues: [tooFew("portal-1727"), tooFew("portal-orphan")] });

    it("files a lift with one stop under that stop's floor, linked to the step that adds its next one", () => {
      expect(groups.find(g => g.key === "oth-L2")!.items).toEqual([{
        message: 'Lift "Lift B" stops only on L2, so it connects nothing. Add its stop on another floor.',
        link: "/floors/L2/build?step=entrances",
        stepLabel: "Entrances & lifts",
      }]);
    });

    it("leaves a lift with no stops under the whole building, since it is on no floor, but names it too", () => {
      expect(groups.find(g => g.key === "building")!.items).toEqual([{
        message: "An unnamed lift has no stops, so it connects nothing. Delete it from the Entrances & lifts to-do list.",
        link: null,
        stepLabel: null,
      }]);
    });
  });

  it("is empty with no report or a clean one", () => {
    expect(publishBlockers(model, null)).toEqual([]);
    expect(publishBlockers(model, { ok: true, errorCount: 0, warningCount: 0, issues: [] })).toEqual([]);
  });
});
