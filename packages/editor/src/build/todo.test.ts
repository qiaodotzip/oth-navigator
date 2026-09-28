import { parseModel, type ValidationIssue, type ValidationReport } from "@oth/model";
import { describe, expect, it } from "vitest";
import type { LevelImage } from "../api/client";
import { buildStepsDone } from "../flow/floorProgress";
import { EMPTY_TODOS, stepCounts, stepTodos } from "./todo";

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
    // Bound before binding set a floor: filmed on L1's footage, but its room is on L2.
    { id: "pl_moved", nameEn: "Clinic", category: "healthcare", roomId: "L2-a" },
  ],
  sightings: [
    { id: "s1", placeId: "pl_seen", keyframeId: "kf_1" },
    { id: "s2", placeId: "pl_moved", keyframeId: "kf_1" },
  ],
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
const codes = (items: readonly { code: string }[]) => items.map(i => i.code);

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
    ["detail.undressed", "dressing"],
    ["placement.outsideAnchorRoom", "dressing"],
  ] as const)("files %s under %s", (code, step) => {
    expect(codes(on("oth-L1", report(issue(code, "room", "L1-a", "oth-L1")))[step])).toEqual([code]);
  });

  it("leaves out what no build step fixes", () => {
    const todos = on("oth-L1", report(issue("tenant.unverified", "tenant", "t1", "oth-L1")));
    expect(Object.values(todos).flat()).toEqual([]);
  });

  it("leaves out a room nobody has filmed: a place it could be is listed as a place, and the rest is Survey's", () => {
    const todos = on("oth-L1", report(issue("room.unsurveyed", "room", "L1-a", "oth-L1")));
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

  it("files a bound place under its room's floor, where choosing it selects that room", () => {
    const r = report(issue("place.adjacencyBroken", "place", "pl_moved"));
    expect(on("oth-L2", r).bind[0]!.target).toEqual({ kind: "select", selection: { type: "room", id: "L2-a" } });
    expect(on("oth-L1", r).bind).toEqual([]);
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

describe("EMPTY_TODOS", () => {
  it("cannot be filled by accident, since every floor still loading shares it", () => {
    expect(Object.isFrozen(EMPTY_TODOS)).toBe(true);
    for (const items of Object.values(EMPTY_TODOS)) {
      expect(items).toEqual([]);
      expect(Object.isFrozen(items)).toBe(true);
    }
  });
});

/**
 * A floor shaped like the real L1 on the walk that found the stepper lying:
 * twelve columns too small to publish, 168 rooms no pathway reaches, eleven
 * surveyed places waiting for a room, and 166 rooms nobody has filmed.
 */
describe("the stepper's ticks and counts, on a floor shaped like L1", () => {
  const range = (n: number) => Array.from({ length: n }, (_, i) => i + 1);
  const column = (n: number) => `L1-west-column-${String(n).padStart(2, "0")}`;
  const l1 = parseModel({
    building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
    levels: [{ id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6 }],
    rooms: [
      { id: "L1-hall", levelId: "oth-L1", kind: "area", footprint: square, heightM: 5, walkable: true, nameEn: "Hall" },
      { id: "L1-shop", levelId: "oth-L1", kind: "room", footprint: square, heightM: 3, nameEn: "Shop" },
    ],
    pathways: [{ id: "L1-p", levelId: "oth-L1", polyline: [[0, 5], [10, 5]] }],
    places: range(11).map(n => ({ id: `pl_${n}`, nameEn: `Place ${n}`, category: "retail", levelId: "oth-L1" })),
  });
  const l1Report = report(
    ...range(12).map(n => ({
      ...issue("room.footprint.degenerateArea", "room", column(n), "oth-L1", "error"),
      message: `Room "${column(n)}" has an area below 0.5 m².`,
    })),
    ...range(2).map(n => issue("room.name.missing", "room", `L1-unnamed-${n}`, "oth-L1")),
    ...range(168).map(n => issue("room.noAccess", "room", `L1-room-${n}`, "oth-L1")),
    ...range(11).map(n => issue("place.unbound", "place", `pl_${n}`)),
    ...range(166).map(n => issue("room.unsurveyed", "room", `L1-room-${n}`, "oth-L1")),
  );
  const todos = stepTodos(l1, l1Report, [scaled], "oth-L1");
  const done = buildStepsDone(l1, l1Report, [scaled], "oth-L1", todos);
  const counts = stepCounts(todos);

  it("does not tick a step with an error on it, since an error stops Publish", () => {
    expect(done.rooms).toBe(false);
    expect(counts.rooms).toEqual({ errors: 12, warnings: 2 });
  });

  it("ticks the same step once its errors are gone", () => {
    const fixed = report(...l1Report.issues.filter(i => i.severity !== "error"));
    expect(buildStepsDone(l1, fixed, [scaled], "oth-L1").rooms).toBe(true);
  });

  it("ticks a step with only warnings, and still counts them", () => {
    expect(done.pathways).toBe(true);
    expect(counts.pathways).toEqual({ errors: 0, warnings: 168 });
  });

  it("counts on Bind places only the places waiting for a room", () => {
    expect(codes(todos.bind)).toEqual(range(11).map(() => "place.unbound"));
    expect(counts.bind).toEqual({ errors: 0, warnings: 11 });
    expect(done.bind).toBe(false);
  });

  it("counts on every step exactly what its to-do list shows", () => {
    for (const step of Object.keys(todos) as (keyof typeof todos)[]) {
      expect(counts[step].errors).toBe(todos[step].filter(i => i.severity === "error").length);
      expect(counts[step].errors + counts[step].warnings).toBe(todos[step].length);
    }
  });
});
