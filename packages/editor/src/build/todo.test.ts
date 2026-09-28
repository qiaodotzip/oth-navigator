import { parseModel, type ValidationIssue, type ValidationReport } from "@oth/model";
import { describe, expect, it } from "vitest";
import type { LevelImage } from "../api/client";
import { stepTodos } from "./todo";

const square: [number, number][] = [[0, 0], [10, 0], [10, 10], [0, 10]];

const model = parseModel({
  building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
  levels: [
    { id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6 },
    { id: "oth-L2", buildingId: "oth", code: "L2", ordinal: 2, nameEn: "L2", nameZh: "二楼", elevationM: 6, heightM: 4 },
  ],
  rooms: [
    { id: "L1-a", levelId: "oth-L1", kind: "room", footprint: square, heightM: 3 },
    { id: "L2-a", levelId: "oth-L2", kind: "room", footprint: square, heightM: 3 },
  ],
  portals: [{ id: "lift-a", kind: "lift" }, { id: "lift-orphan", kind: "lift" }],
  portalEndpoints: [{ id: "ep-1", portalId: "lift-a", levelId: "oth-L1", roomId: "L1-a", point: [5, 5] }],
  captures: [{ id: "cap_1", kind: "video", filename: "l1.mp4", levelId: "oth-L1" }],
  keyframes: [{ id: "kf_1", captureId: "cap_1", imageId: "kf_1", widthPx: 640, heightPx: 480 }],
  places: [
    // No floor of its own, but filmed on L1's footage.
    { id: "pl_seen", nameEn: "Festive Mall", category: "retail" },
    { id: "pl_l2", nameEn: "Gym", category: "sports", levelId: "oth-L2" },
    { id: "pl_prop", nameEn: "iTea", category: "retail", levelId: "oth-L1", status: "proposed" },
    { id: "pl_walk", nameEn: "Covered link", category: "facility", levelId: "oth-L1", pathwayKindId: "pk-1" },
    { id: "pl_bound", nameEn: "Library", category: "community", levelId: "oth-L1", roomId: "L1-a" },
    // No floor, and never filmed on footage that has one.
    { id: "pl_lost", nameEn: "Somewhere", category: "retail" },
  ],
  sightings: [{ id: "s1", placeId: "pl_seen", keyframeId: "kf_1" }],
});

function issue(
  code: string,
  entityType: ValidationIssue["entityType"],
  entityId: string,
  levelId?: string,
  severity: ValidationIssue["severity"] = "warning",
): ValidationIssue {
  return { severity, code, message: `${code} on ${entityId}`, entityType, entityId, ...(levelId ? { levelId } : {}) };
}

function report(...issues: ValidationIssue[]): ValidationReport {
  const errorCount = issues.filter(i => i.severity === "error").length;
  return { issues, errorCount, warningCount: issues.length - errorCount, ok: errorCount === 0 };
}

const scaled: LevelImage = {
  id: "img_1", levelId: "oth-L1", filename: "L1.jpg", widthPx: 3000, heightPx: 2121,
  sizeBytes: 1, metresPerPixel: 0.21, offsetX: 0, offsetY: 0, opacity: 0.6, version: 1,
};

const on = (levelId: string, r: ValidationReport | null, images: LevelImage[] = [scaled]) =>
  stepTodos(model, r, images, levelId);
const codes = (items: { code: string }[]) => items.map(i => i.code);

describe("stepTodos — the floorplan", () => {
  it("asks for a plan on a floor with none", () => {
    expect(on("oth-L1", null, []).floorplan).toMatchObject([{ code: "floorplan.missing", target: { kind: "none" } }]);
  });

  it("asks for the scale once there is a plan, by the plan's name", () => {
    const todo = on("oth-L1", null, [{ ...scaled, metresPerPixel: null }]).floorplan;
    expect(codes(todo)).toEqual(["floorplan.scale"]);
    expect(todo[0]!.message).toContain("L1.jpg");
  });

  it("has nothing to ask once the plan is scaled", () => {
    expect(on("oth-L1", null).floorplan).toEqual([]);
  });

  it("asks each floor about its own plan", () => {
    expect(codes(on("oth-L2", null).floorplan)).toEqual(["floorplan.missing"]);
  });
});

describe("stepTodos — which step an issue belongs to", () => {
  it.each([
    ["room.name.missing", "rooms"],
    ["room.footprint.selfIntersecting", "rooms"],
    ["room.hole.selfIntersecting", "rooms"],
    ["room.noAccess", "pathways"],
    ["pathway.disconnected", "pathways"],
    ["area.unreachable", "pathways"],
    ["entrance.offFloor", "entrances"],
    ["portalEndpoint.point.outsideRoom", "entrances"],
    ["level.portals.none", "entrances"],
    ["room.unsurveyed", "bind"],
    ["detail.undressed", "dressing"],
    ["placement.outsideAnchorRoom", "dressing"],
  ] as const)("files %s under %s", (code, step) => {
    expect(codes(on("oth-L1", report(issue(code, "room", "L1-a", "oth-L1")))[step])).toEqual([code]);
  });

  it("leaves out what no build step fixes", () => {
    const todos = on("oth-L1", report(issue("tenant.unverified", "tenant", "t1", "oth-L1")));
    expect(Object.values(todos).flat()).toEqual([]);
  });

  it("keeps to this floor", () => {
    expect(on("oth-L1", report(issue("room.name.missing", "room", "L2-a", "oth-L2"))).rooms).toEqual([]);
  });

  it("shows a building-wide problem on every floor, since any floor can fix it", () => {
    const r = report(issue("building.entrances.none", "building", "oth", undefined, "error"));
    expect(codes(on("oth-L1", r).entrances)).toEqual(["building.entrances.none"]);
    expect(codes(on("oth-L2", r).entrances)).toEqual(["building.entrances.none"]);
  });

  it("puts errors before warnings, since errors are what stop Publish", () => {
    const r = report(
      issue("room.noAccess", "room", "L1-a", "oth-L1"),
      issue("area.unreachable", "room", "L1-a", "oth-L1", "error"),
    );
    expect(codes(on("oth-L1", r).pathways)).toEqual(["area.unreachable", "room.noAccess"]);
  });
});

describe("stepTodos — binding places", () => {
  const unbound = (id: string) => issue("place.unbound", "place", id);

  it("files an unbound place under the floor it was filmed on, not under every floor", () => {
    const r = report(unbound("pl_seen"));
    expect(codes(on("oth-L1", r).bind)).toEqual(["place.unbound"]);
    expect(on("oth-L2", r).bind).toEqual([]);
  });

  it("uses a place's own floor when it has one", () => {
    expect(codes(on("oth-L2", report(unbound("pl_l2"))).bind)).toEqual(["place.unbound"]);
  });

  it("leaves out proposals, walkways and places no floor claims", () => {
    const r = report(unbound("pl_prop"), unbound("pl_walk"), unbound("pl_lost"));
    expect(on("oth-L1", r).bind).toEqual([]);
    expect(on("oth-L2", r).bind).toEqual([]);
  });

  it("asks which room an unbound place is in", () => {
    expect(on("oth-L1", report(unbound("pl_seen"))).bind[0]!.target).toEqual({ kind: "place", placeId: "pl_seen" });
  });

  it("selects the room of a bound place whose neighbours disagree", () => {
    const [item] = on("oth-L1", report(issue("place.adjacencyBroken", "place", "pl_bound"))).bind;
    expect(item!.target).toEqual({ kind: "select", selection: { type: "room", id: "L1-a" } });
  });
});

describe("stepTodos — lifts and stairs", () => {
  const tooFew = (id: string) => issue("portal.endpoints.insufficient", "portal", id, undefined, "error");

  it("lists a lift with one stop on that stop's floor, and selects the stop", () => {
    const r = report(tooFew("lift-a"));
    expect(on("oth-L1", r).entrances[0]!.target)
      .toEqual({ kind: "select", selection: { type: "portalEndpoint", id: "ep-1" } });
    expect(on("oth-L2", r).entrances).toEqual([]);
  });

  it("lists a lift with no stops at all on every floor, for deleting", () => {
    const r = report(tooFew("lift-orphan"));
    for (const levelId of ["oth-L1", "oth-L2"]) {
      expect(on(levelId, r).entrances[0]!.target).toEqual({ kind: "orphan-portal", portalId: "lift-orphan", version: 0 });
    }
  });
});

describe("stepTodos — what choosing an item does", () => {
  it("selects the thing an issue names", () => {
    expect(on("oth-L1", report(issue("room.name.missing", "room", "L1-a", "oth-L1"))).rooms[0]!.target)
      .toEqual({ kind: "select", selection: { type: "room", id: "L1-a" } });
  });

  it("selects nothing for an issue about the whole floor", () => {
    expect(on("oth-L1", report(issue("level.portals.none", "level", "oth-L1", "oth-L1"))).entrances[0]!.target)
      .toEqual({ kind: "none" });
  });

  it("gives each item its own key, even two issues about one place", () => {
    const r = report(issue("place.adjacencyBroken", "place", "pl_bound"), issue("place.adjacencyBroken", "place", "pl_bound"));
    const keys = on("oth-L1", r).bind.map(i => i.key);
    expect(new Set(keys).size).toBe(2);
  });
});
