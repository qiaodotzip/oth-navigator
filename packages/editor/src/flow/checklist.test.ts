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
  it("returns the seven steps in order", () => {
    const ids = levelChecklist({ model: model(), levelId: "oth-L1", image: null, report: emptyReport })
      .map(s => s.id);
    expect(ids).toEqual([
      "floorplan", "scale", "rooms", "connect", "entrances", "portals", "dressing",
    ]);
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

  it("is not done connecting while an area is unreachable", () => {
    const r = report([{
      severity: "error", code: "area.unreachable", message: "cut off",
      entityType: "room", entityId: "L1-a", levelId: "oth-L1",
    }]);
    const s = steps({ model: model({ rooms: [room] }), levelId: "oth-L1", image: null, report: r });
    expect(s.connect?.status).toBe("todo");
    expect(s.connect?.detail).toContain("1 space");
  });

  it("counts a single space as connected, since there is nothing to connect it to", () => {
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
    expect(levelChecklist({ model: null, levelId: null, image: null, report: null })).toHaveLength(7);
  });
});

describe("stepForCode", () => {
  it("routes room geometry codes to the tracing step", () => {
    expect(stepForCode("room.footprint.degenerateArea")).toBe("rooms");
  });

  it("routes reachability to connecting", () => {
    expect(stepForCode("area.unreachable")).toBe("connect");
  });

  it("returns null for a code no step owns", () => {
    // Tenants are not part of the guided sequence, so nothing claims them.
    expect(stepForCode("tenant.unverified")).toBeNull();
  });

  it("files a placement problem under dressing, where it is fixed", () => {
    expect(stepForCode("placement.outsideAnchorRoom")).toBe("dressing");
    expect(stepForCode("detail.undressed")).toBe("dressing");
  });
});

describe("connect status with nothing traced", () => {
  it("is not done when the level has no rooms at all", () => {
    // Showing "done" before anything exists reads as though it were handled.
    expect(steps({ model: model(), levelId: "oth-L1", image: null, report: emptyReport }).connect?.status)
      .toBe("todo");
  });
});

describe("the pathways step", () => {
  const area = { ...room, id: "L1-area", kind: "area" };
  const path = { id: "L1-p", levelId: "oth-L1", polyline: [[0, 0], [10, 0]] };

  it("counts pathways rather than doorways", () => {
    const m = model({ rooms: [area], pathways: [path] });
    expect(steps({ model: m, levelId: "oth-L1", image: null, report: emptyReport }).connect?.detail)
      .toBe("1 pathway");
  });

  it("is not done until a pathway exists", () => {
    const m = model({ rooms: [area, { ...area, id: "L1-b" }] });
    expect(steps({ model: m, levelId: "oth-L1", image: null, report: emptyReport }).connect?.status)
      .toBe("todo");
  });

  it("is done once a pathway exists and nothing is unreachable", () => {
    const m = model({ rooms: [area, { ...area, id: "L1-b" }], pathways: [path] });
    expect(steps({ model: m, levelId: "oth-L1", image: null, report: emptyReport }).connect?.status)
      .toBe("done");
  });

  it("counts pathways on this level only", () => {
    const m = model({
      levels: [
        { id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6 },
        { id: "oth-L2", buildingId: "oth", code: "L2", ordinal: 2, nameEn: "L2", nameZh: "二楼", elevationM: 6, heightM: 4 },
      ],
      rooms: [area],
      pathways: [path, { ...path, id: "L2-p", levelId: "oth-L2" }],
    });
    expect(steps({ model: m, levelId: "oth-L1", image: null, report: emptyReport }).connect?.detail)
      .toBe("1 pathway");
  });

  it("uses the pathway tool", () => {
    const m = model({ rooms: [area] });
    expect(steps({ model: m, levelId: "oth-L1", image: null, report: emptyReport }).connect?.tools)
      .toEqual(["draw-pathway"]);
  });

  it("owns the pathway and area validation codes", () => {
    expect(stepForCode("pathway.disconnected")).toBe("connect");
    expect(stepForCode("area.unreachable")).toBe("connect");
  });

  it("files a room access warning under pathways, since a pathway is the fix", () => {
    expect(stepForCode("room.noAccess")).toBe("connect");
  });
});

describe("the tools a step offers", () => {
  it("offers both drawing tools for areas and rooms, which are one pass", () => {
    const s = steps({ model: model(), levelId: "oth-L1", image: null, report: emptyReport });
    expect(s.rooms?.tools).toEqual(["draw-area", "draw-room"]);
  });

  it("offers none for the floorplan, which is done in a panel", () => {
    const s = steps({ model: model(), levelId: "oth-L1", image: null, report: emptyReport });
    expect(s.floorplan?.tools).toEqual([]);
  });
});

describe("the dressing step", () => {
  const detail = { ...room, id: "L1-vend", kind: "detail", walkable: false };
  const asset = {
    id: "asset_1", filename: "v.glb", storagePath: "a", checksum: "c",
    sizeBytes: 10, triangleCount: 5,
    bbox: { minX: 0, minY: 0, minZ: 0, maxX: 1, maxY: 1, maxZ: 1 },
  };

  it("counts the details and how many are still undressed", () => {
    const m = model({ rooms: [detail, { ...detail, id: "L1-b" }] });
    expect(steps({ model: m, levelId: "oth-L1", image: null, report: emptyReport }).dressing?.detail)
      .toBe("2 details, 2 undressed");
  });

  it("stops counting one as undressed when a model is placed on it", () => {
    const m = model({
      rooms: [detail],
      assets: [asset],
      placements: [{ id: "pl_1", levelId: "oth-L1", assetId: "asset_1", roomId: "L1-vend", position: [0, 0, 0] }],
    });
    expect(steps({ model: m, levelId: "oth-L1", image: null, report: emptyReport }).dressing?.detail)
      .toBe("1 detail, 0 undressed");
  });

  it("says so plainly when there are no details at all", () => {
    expect(steps({ model: model(), levelId: "oth-L1", image: null, report: emptyReport }).dressing?.detail)
      .toBe("none yet");
  });

  it("offers the detail tool, since details are dressing", () => {
    expect(steps({ model: model(), levelId: "oth-L1", image: null, report: emptyReport }).dressing?.tools)
      .toEqual(["draw-detail"]);
  });
});

describe("survey codes", () => {
  it("files an unbound place under tracing, where a room would be drawn for it", () => {
    expect(stepForCode("place.unbound")).toBe("rooms");
  });

  it("files an unsurveyed room under tracing too", () => {
    expect(stepForCode("room.unsurveyed")).toBe("rooms");
  });

  it("files a broken adjacency under tracing, since the footprint is the suspect", () => {
    expect(stepForCode("place.adjacencyBroken")).toBe("rooms");
  });
});
