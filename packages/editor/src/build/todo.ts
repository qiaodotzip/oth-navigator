import { live, placeLevels, type MapModel, type ValidationIssue, type ValidationReport } from "@oth/model";
import type { LevelImage } from "../api/client";
import { BUILD_STEPS, buildStepForCode, type BuildStepId } from "../flow/floorProgress";
import type { Selection } from "../state/store";
import { imageForLevel } from "../state/underlay";
import { SELECTABLE_TYPES, type Selectable } from "./selection";

/** What choosing a to-do does. */
export type TodoTarget =
  | { kind: "select"; selection: NonNullable<Selection> }
  /** A surveyed place has no shape of its own: choosing it asks which room it is. */
  | { kind: "place"; placeId: string }
  /** A lift or stair with no stops is on no floor and cannot be clicked — only deleted. */
  | { kind: "orphan-portal"; portalId: string; version: number }
  | { kind: "none" };

export type TodoItem = {
  key: string;
  step: BuildStepId;
  severity: "error" | "warning";
  code: string;
  message: string;
  target: TodoTarget;
};

export type StepTodos = Readonly<Record<BuildStepId, readonly TodoItem[]>>;

const NOTHING: readonly TodoItem[] = Object.freeze([]);

/** Before a floor loads. Frozen, because every caller shares this one value. */
export const EMPTY_TODOS: StepTodos = Object.freeze({
  floorplan: NOTHING, rooms: NOTHING, pathways: NOTHING, entrances: NOTHING, bind: NOTHING, dressing: NOTHING,
});

const NONE: TodoTarget = { kind: "none" };

/**
 * What is left to do on each step of one floor — spec §11's "to-do from"
 * column. Built from the validation report, so a to-do and the Publish
 * blocker it answers always agree about which step fixes it.
 */
export function stepTodos(
  model: MapModel,
  report: ValidationReport | null,
  levelImages: readonly LevelImage[],
  levelId: string,
): StepTodos {
  const todos: Record<BuildStepId, TodoItem[]> = { floorplan: [], rooms: [], pathways: [], entrances: [], bind: [], dressing: [] };

  // The first two things a floor needs are not validation issues at all.
  const image = imageForLevel(levelImages, levelId);
  if (!image) {
    todos.floorplan.push({
      key: "floorplan.missing", step: "floorplan", severity: "warning", code: "floorplan.missing",
      message: "Add this floor's plan.", target: NONE,
    });
  } else if (image.metresPerPixel == null) {
    todos.floorplan.push({
      key: "floorplan.scale", step: "floorplan", severity: "warning", code: "floorplan.scale",
      message: `Set the scale of ${image.filename}.`, target: NONE,
    });
  }

  const floors = placeLevels(model);
  const roomLevel = new Map(live(model.rooms).map(r => [r.id, r.levelId]));
  const places = new Map(live(model.places).map(p => [p.id, p]));
  const portals = new Map(live(model.portals).map(p => [p.id, p]));
  const stops = live(model.portalEndpoints);
  const seen = new Map<string, number>();

  for (const issue of report?.issues ?? []) {
    const step = buildStepForCode(issue.code);
    // No build step fixes it. If it is an error, Publish still lists it, with no step to link to.
    if (!step) continue;
    const target = targetOnThisFloor(issue);
    if (!target) continue;
    // Two issues can name the same thing (a place disagreeing with two neighbours).
    const base = `${issue.code}:${issue.entityId}`;
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    todos[step].push({
      key: n === 0 ? base : `${base}#${n}`,
      step, severity: issue.severity, code: issue.code, message: issue.message, target,
    });
  }

  // Errors first: they are what stop Publish. Otherwise the report's own
  // order, which keeps like with like.
  for (const { id } of BUILD_STEPS) {
    todos[id] = [...todos[id].filter(t => t.severity === "error"), ...todos[id].filter(t => t.severity !== "error")];
  }
  return todos;

  /** Where on this floor an issue points, or null when it is not this floor's. */
  function targetOnThisFloor(issue: ValidationIssue): TodoTarget | null {
    if (issue.entityType === "place") {
      const place = places.get(issue.entityId);
      if (!place) return null;
      // A bound place's item selects its room, so it is listed where that room
      // is. Places bound before binding set a floor have no level of their own,
      // and the footage they were filmed on can be another floor's.
      const floor = place.roomId ? roomLevel.get(place.roomId) : floors.get(place.id);
      if (floor !== levelId) return null;
      // Binding is for confirmed units: a proposal is still Review's to decide,
      // and a walkway is built as a path, not bound to a room.
      if (issue.code === "place.unbound" && (place.status !== "confirmed" || place.pathwayKindId)) return null;
      return place.roomId
        ? { kind: "select", selection: { type: "room", id: place.roomId } }
        : { kind: "place", placeId: place.id };
    }
    if (issue.entityType === "portal") {
      const itsStops = stops.filter(e => e.portalId === issue.entityId);
      if (itsStops.length === 0) {
        // On no floor, so on every floor's list: the one place it can be deleted from.
        const portal = portals.get(issue.entityId);
        return portal ? { kind: "orphan-portal", portalId: portal.id, version: portal.version } : null;
      }
      const here = itsStops.find(e => e.levelId === levelId);
      return here ? { kind: "select", selection: { type: "portalEndpoint", id: here.id } } : null;
    }
    // No level means building-wide — no entrance anywhere — and any floor can fix that.
    if (issue.levelId !== undefined && issue.levelId !== levelId) return null;
    return SELECTABLE_TYPES.has(issue.entityType)
      ? { kind: "select", selection: { type: issue.entityType as Selectable, id: issue.entityId } }
      : NONE;
  }
}
