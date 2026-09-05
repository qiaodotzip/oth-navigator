import { parseModel, type ValidationIssue, type ValidationReport } from "@oth/model";
import { describe, expect, it } from "vitest";
import type { LevelImage } from "../api/client";
import { levelChecklist, stepForCode } from "./checklist";

const image: LevelImage = {
  id: "img_1",
  levelId: "oth-L1",
  filename: "L1.png",
  widthPx: 100,
  heightPx: 100,
  sizeBytes: 10,
  metresPerPixel: null,
  offsetX: 0,
  offsetY: 0,
  opacity: 0.6,
  version: 0,
};

const room = {
  id: "L1-a",
  levelId: "oth-L1",
  kind: "room",
  footprint: [[0, 0], [10, 0], [10, 10], [0, 10]],
  heightM: 3,
  walkable: true,
};

function model(extra: Record<string, unknown> = {}) {
  return parseModel({
    building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
    levels: [
      { id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6 },
    ],
    ...extra,
  });
}

const emptyReport: ValidationReport = { issues: [], errorCount: 0, warningCount: 0, ok: true };

function report(issues: ValidationIssue[]): ValidationReport {
  const errorCount = issues.filter(i => i.severity === "error").length;
  return { issues, errorCount, warningCount: issues.length - errorCount, ok: errorCount === 0 };
}

function steps(input: Parameters<typeof levelChecklist>[0]) {
  return Object.fromEntries(levelChecklist(input).map(s => [s.id, s]));
}

describe("levelChecklist", () => {
  it("returns the six steps in order", () => {
    const ids = levelChecklist({ model: model(), levelId: "oth-L1", image: null, report: emptyReport })
      .map(s => s.id);
    expect(ids).toEqual(["floorplan", "scale", "rooms", "connect", "entrances", "portals"]);
  });

  it("marks the floorplan done once an image exists", () => {
    const s = steps({ model: model(), levelId: "oth-L1", image, report: emptyReport });
    expect(s.floorplan?.status).toBe("done");
    expect(s.floorplan?.detail).toBe("L1.png");
  });

  it("keeps the scale to do until the image is measured", () => {
    expect(steps({ model: model(), levelId: "oth-L1", image, report: emptyReport }).scale?.status)
      .toBe("todo");
  });

  it("marks the scale done once measured, showing it", () => {
    const scaled = { ...image, metresPerPixel: 0.0712 };
    const s = steps({ model: model(), levelId: "oth-L1", image: scaled, report: emptyReport });
    expect(s.scale?.status).toBe("done");
    expect(s.scale?.detail).toContain("0.071");
  });

  it("counts rooms on this level only", () => {
    const m = model({
      levels: [
        { id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6 },
        { id: "oth-L2", buildingId: "oth", code: "L2", ordinal: 2, nameEn: "L2", nameZh: "二楼", elevationM: 6, heightM: 4 },
      ],
      rooms: [room, { ...room, id: "L2-a", levelId: "oth-L2" }],
    });
    expect(steps({ model: m, levelId: "oth-L1", image: null, report: emptyReport }).rooms?.detail)
      .toBe("1 room");
  });

  it("is not done connecting while a room is unreachable", () => {
    const r = report([{
      severity: "error", code: "room.unreachable", message: "cut off",
      entityType: "room", entityId: "L1-a", levelId: "oth-L1",
    }]);
    const s = steps({ model: model({ rooms: [room] }), levelId: "oth-L1", image: null, report: r });
    expect(s.connect?.status).toBe("todo");
    expect(s.connect?.detail).toContain("1 room");
  });

  it("counts a single room as connected, since there is nothing to connect it to", () => {
    const s = steps({ model: model({ rooms: [room] }), levelId: "oth-L1", image: null, report: emptyReport });
    expect(s.connect?.status).toBe("done");
  });

  it("treats entrances as building-wide, not per level", () => {
    const m = model({
      rooms: [room],
      entrances: [{ id: "e1", levelId: "oth-L1", roomId: "L1-a", point: [5, 5] }],
    });
    expect(steps({ model: m, levelId: "oth-L1", image: null, report: emptyReport }).entrances?.status)
      .toBe("done");
  });

  it("marks portals done when an endpoint serves this level", () => {
    const m = model({
      rooms: [room],
      portals: [{ id: "p1", kind: "lift", nameEn: "Lift", nameZh: "电梯" }],
      portalEndpoints: [
        { id: "p1-a", portalId: "p1", levelId: "oth-L1", roomId: "L1-a", point: [5, 5] },
        { id: "p1-b", portalId: "p1", levelId: "oth-L1", roomId: "L1-a", point: [6, 6] },
      ],
    });
    expect(steps({ model: m, levelId: "oth-L1", image: null, report: emptyReport }).portals?.status)
      .toBe("done");
  });

  it("files each issue under the step that owns it", () => {
    const r = report([
      { severity: "warning", code: "level.portals.none", message: "no lift", entityType: "level", entityId: "oth-L1", levelId: "oth-L1" },
      { severity: "error", code: "room.footprint.selfIntersecting", message: "bowtie", entityType: "room", entityId: "L1-a", levelId: "oth-L1" },
    ]);
    const s = steps({ model: model({ rooms: [room] }), levelId: "oth-L1", image: null, report: r });
    expect(s.portals?.issues.map(i => i.code)).toEqual(["level.portals.none"]);
    expect(s.rooms?.issues.map(i => i.code)).toEqual(["room.footprint.selfIntersecting"]);
  });

  it("ignores issues belonging to another level", () => {
    const r = report([{
      severity: "warning", code: "level.portals.none", message: "no lift",
      entityType: "level", entityId: "oth-L2", levelId: "oth-L2",
    }]);
    expect(steps({ model: model(), levelId: "oth-L1", image: null, report: r }).portals?.issues)
      .toEqual([]);
  });

  it("keeps building-wide issues, which carry no level", () => {
    const r = report([{
      severity: "error", code: "building.entrances.none", message: "no entrance",
      entityType: "building", entityId: "oth",
    }]);
    expect(steps({ model: model(), levelId: "oth-L1", image: null, report: r }).entrances?.issues)
      .toHaveLength(1);
  });

  it("survives a model that has not loaded yet", () => {
    expect(levelChecklist({ model: null, levelId: null, image: null, report: null })).toHaveLength(6);
  });
});

describe("stepForCode", () => {
  it("routes room geometry codes to the tracing step", () => {
    expect(stepForCode("room.footprint.degenerateArea")).toBe("rooms");
  });

  it("routes reachability to connecting", () => {
    expect(stepForCode("room.unreachable")).toBe("connect");
  });

  it("returns null for a code no step owns", () => {
    expect(stepForCode("placement.asset.missing")).toBeNull();
  });
});

describe("connect status with nothing traced", () => {
  it("is not done when the level has no rooms at all", () => {
    // Showing "done" before anything exists reads as though it were handled.
    expect(steps({ model: model(), levelId: "oth-L1", image: null, report: emptyReport }).connect?.status)
      .toBe("todo");
  });
});
