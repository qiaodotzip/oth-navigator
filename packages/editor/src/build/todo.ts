import {
  live, type MapModel, type Portal, type PortalEndpoint, type ValidationIssue, type ValidationReport,
} from "@oth/model";
import type { LevelImage } from "../api/client";
import { BUILD_STEPS, buildStepForCode, floorUnits, type BuildStepId } from "../flow/buildSteps";
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

/** A step's to-do list, counted: errors stop Publish, warnings do not. */
export type TodoCounts = { errors: number; warnings: number };

/** One list's numbers. Every item is counted once, so the two always add up to what the list shows. */
export function countTodos(items: readonly TodoItem[]): TodoCounts {
  const errors = items.filter(t => t.severity === "error").length;
  return { errors, warnings: items.length - errors };
}

/** Each step's numbers, for the stepper: read off its to-do list, never from anywhere else. */
export function stepCounts(todos: StepTodos): Record<BuildStepId, TodoCounts> {
  return Object.fromEntries(BUILD_STEPS.map(({ id }) => [id, countTodos(todos[id])])) as Record<BuildStepId, TodoCounts>;
}

/**
 * A lift or stair's stops, which is where what is wrong with it is fixed. The
 * validator files it under no floor, but a new lift has one stop until you
 * add the next on another floor, so its to-do is on that stop's floor, and
 * Publish files it there too. With no stops it is on no floor at all.
 */
export function portalStops(model: MapModel, portalId: string): PortalEndpoint[] {
  return live(model.portalEndpoints).filter(e => e.portalId === portalId);
}

const PORTAL_NOUN: Record<Portal["kind"], string> = { lift: "lift", escalator: "escalator", stair: "stair", ramp: "ramp" };

/**
 * An issue's words, for the to-do and for Publish alike. The validator names a
 * lift that connects nothing by its id, which means nothing on screen, so that
 * one is said again by name — as the Layers drawer calls it — with what to do.
 */
export function issueMessage(model: MapModel, issue: ValidationIssue): string {
  if (issue.code !== "portal.endpoints.insufficient") return issue.message;
  const portal = live(model.portals).find(p => p.id === issue.entityId);
  if (!portal) return issue.message;
  const noun = PORTAL_NOUN[portal.kind];
  const it = portal.nameEn ? `${noun[0]!.toUpperCase()}${noun.slice(1)} "${portal.nameEn}"` : `An unnamed ${noun}`;
  const stops = portalStops(model, portal.id);
  if (stops.length === 0) {
    return `${it} has no stops, so it connects nothing. Delete it from the Entrances & lifts to-do list.`;
  }
  const floor = model.levels.find(l => l.id === stops[0]!.levelId)?.code;
  // Two stops or more means the report is older than the map: its own words will do until it catches up.
  if (stops.length > 1 || !floor) return issue.message;
  return `${it} stops only on ${floor}, so it connects nothing. Add its stop on another floor.`;
}

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
  /** Drafts from the floor's drawing still to review (Part B), counted by the caller: they are not in the map. */
  draftsToReview = 0,
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
  if (draftsToReview > 0) {
    todos.rooms.push({
      key: "rooms.drafts", step: "rooms", severity: "warning", code: "rooms.drafts",
      message: `${draftsToReview} ${draftsToReview === 1 ? "draft" : "drafts"} to review.`, target: NONE,
    });
  }

  const roomLevel = new Map(live(model.rooms).map(r => [r.id, r.levelId]));
  const places = new Map(live(model.places).map(p => [p.id, p]));
  const portals = new Map(live(model.portals).map(p => [p.id, p]));
  const waiting = floorUnits(model, levelId).waiting;
  const waitingIds = new Set(waiting.map(p => p.id));
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
      step, severity: issue.severity, code: issue.code, message: issueMessage(model, issue), target,
    });
  }

  // A place whose room was deleted still names it, so the validator, which
  // asks only that a room be named, says nothing. It is waiting all the same,
  // and without a line here nothing would lead back to it.
  const listed = new Set(todos.bind.flatMap(t => (t.target.kind === "place" ? [t.target.placeId] : [])));
  for (const place of waiting) {
    if (!place.roomId || listed.has(place.id)) continue;
    todos.bind.push({
      key: `place.unbound:${place.id}`, step: "bind", severity: "warning", code: "place.unbound",
      message: `Surveyed place "${place.nameEn}" was bound to a room that has since been deleted. Bind it to a room again.`,
      target: { kind: "place", placeId: place.id },
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
      // Waiting for a room on this floor (`floorUnits`): choosing it asks which room it is.
      if (waitingIds.has(place.id)) return { kind: "place", placeId: place.id };
      // Otherwise it is not this floor's to bind: a proposal, a walkway,
      // another floor's place, or one bound since this report was made.
      if (issue.code === "place.unbound" || !place.roomId) return null;
      // A bound place's item selects its room, so it is listed where that room
      // is. Places bound before binding set a floor have no level of their own,
      // and the footage they were filmed on can be another floor's.
      return roomLevel.get(place.roomId) === levelId
        ? { kind: "select", selection: { type: "room", id: place.roomId } }
        : null;
    }
    if (issue.entityType === "portal") {
      const itsStops = portalStops(model, issue.entityId);
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
