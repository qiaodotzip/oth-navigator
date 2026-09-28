import { distancePointToSegment, live, pointInPolygon, type MapModel, type Ring, type Vec2 } from "@oth/model";
import { and, desc, eq, gte, inArray, isNotNull, isNull, lte, or } from "drizzle-orm";
import type { Database } from "../db/client";
import {
  auditLog, captures, doorways, entrances, keyframes, levels, placements, places, portalEndpoints, roomDrafts, tenants, users,
} from "../db/schema";
import { DraftRefusedError, latestSearch, unacceptDrafts, unsetAside } from "../drafts/service";
import { entityRegistry } from "../entities/registry";
import {
  NotDeletedError, NotFoundError, VersionConflictError, recordAudit, restoreEntity, softDeleteEntity, updateEntity,
} from "../entities/repository";
import { count, singaporeTime } from "../mcp/results";
import { assembleModel } from "../model/assemble";
import { confidenceFor } from "../objects/spots";
import { restoreFrame } from "../survey/frames";
import {
  TYPE_WORDS, foldChanges, frameOf, midpoint, polylineLength, summarise,
  type AuditRow, type ChangeGroup, type Folded, type Names, type Touch, type TouchType, type UndoStep,
} from "./fold";

/** Undo's marker rows go in the audit log under this type, keyed on the change's id (undoChange writes them). */
export const CHANGE_ENTITY = "change";

/** One of Claude's changes, as the check step lists it: Plan 6E's ClaudeChange, field for field. */
export type ClaudeChange = {
  auditId: string;
  at: string;
  group: ChangeGroup;
  summary: string;
  entityType: string;
  entityId: string;
  action: string;
  /** Objects only: worked out again from the placement's sightingIds, since it isn't stored. */
  confidence?: "high" | "low";
  undone: boolean;
};

/** How far off a named room an object is still "by" it. */
const NEAR_M = 10;

function ringDistance(p: Vec2, ring: Ring): number {
  let d = Infinity;
  for (let i = 0; i < ring.length; i++) d = Math.min(d, distancePointToSegment(p, ring[i]!, ring[(i + 1) % ring.length]!));
  return d;
}

/** A survey frame as the check list names it, binned or not. */
export type FrameInfo = { levelId: string | null; name: string };

/**
 * The frames these changes are on, binned ones too (the model holds only the
 * live): each one's floor, its footage's, and its name as a person finds it
 * in Survey, "frame 12 of L1 walk.mp4". Frames are numbered in filming
 * order, binned ones counted, so a number never moves when one is binned.
 */
export async function frameInfo(db: Database, ids: readonly string[]): Promise<Map<string, FrameInfo>> {
  const wanted = [...new Set(ids)];
  if (wanted.length === 0) return new Map();
  const frames = await db.select({ id: keyframes.id, captureId: keyframes.captureId }).from(keyframes).where(inArray(keyframes.id, wanted));
  const captureIds = [...new Set(frames.map(f => f.captureId))];
  if (captureIds.length === 0) return new Map();
  const footage = new Map((await db.select({ id: captures.id, filename: captures.filename, levelId: captures.levelId })
    .from(captures).where(inArray(captures.id, captureIds))).map(c => [c.id, c]));
  const all = await db.select({ id: keyframes.id, captureId: keyframes.captureId, timeMs: keyframes.timeMs })
    .from(keyframes).where(inArray(keyframes.captureId, captureIds));
  all.sort((a, b) => (a.timeMs ?? 0) - (b.timeMs ?? 0) || a.id.localeCompare(b.id));
  const number = new Map<string, number>();
  const seen = new Map<string, number>();
  for (const k of all) {
    const n = (seen.get(k.captureId) ?? 0) + 1;
    seen.set(k.captureId, n);
    number.set(k.id, n);
  }
  return new Map(frames.map(f => {
    const capture = footage.get(f.captureId);
    return [f.id, { levelId: capture?.levelId ?? null, name: `frame ${number.get(f.id)} of ${capture?.filename ?? "its footage"}` }];
  }));
}

export function namesFrom(model: MapModel, frames: ReadonlyMap<string, FrameInfo> = new Map()): Names {
  const rooms = live(model.rooms);
  const byId = new Map(rooms.map(r => [r.id, r]));
  const places = new Map(live(model.places).map(p => [p.id, p.nameEn]));
  // A shop is known by its surveyed place's name ("Starbucks") before the drawing's ("SHOP 12").
  const bound = new Map(live(model.places).filter(p => p.roomId && !p.objectKindId).map(p => [p.roomId!, p.nameEn]));
  const kinds = new Map(live(model.objectKinds).map(k => [k.id, k.nameEn]));
  const portals = new Map(live(model.portals).map(p => [p.id, p.kind]));
  const now: Record<string, ReadonlyMap<string, string>> = {
    room: new Map(rooms.map(r => [r.id, r.nameEn.trim()])),
    place: places,
    pathway: new Map(live(model.pathways).map(p => [p.id, p.nameEn.trim()])),
    entrance: new Map(live(model.entrances).map(e => [e.id, e.nameEn.trim()])),
    objectKind: kinds,
  };
  return {
    room: id => byId.get(id)?.nameEn.trim() || id,
    current: (type, id) => now[type]?.get(id) ?? null,
    place: id => places.get(id) ?? id,
    objectKind: id => kinds.get(id) ?? "an object",
    portalKind: id => portals.get(id) ?? null,
    near: (levelId, at, except) => {
      let best: { name: string; d: number } | null = null;
      for (const r of rooms) {
        if (r.levelId !== levelId || r.id === except || r.walkable || r.kind === "void" || r.kind === "detail") continue;
        const name = bound.get(r.id) ?? r.nameEn.trim();
        if (!name) continue;
        const d = pointInPolygon(at, r.footprint, r.holes) ? 0 : ringDistance(at, r.footprint);
        if (d <= NEAR_M && (!best || d < best.d)) best = { name, d };
      }
      if (best) return best.name;
      return rooms.find(r => r.levelId === levelId && r.id !== except && r.walkable && pointInPolygon(at, r.footprint, r.holes))?.nameEn.trim() || null;
    },
    frame: id => frames.get(id)?.name ?? "a frame",
  };
}

const KIND_WORDS: Record<string, string> = { lift: "lift", escalator: "escalator", stair: "stair", ramp: "ramp" };
const capitalised = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * A touched entity as a reason names it, by what people call it now: "Starbucks",
 * "The draft Plaza", "The pathway Food Street", "The 184 m pathway near
 * Starbucks", "Frame 12 of L1 walk.mp4". Never by an id a person can't see.
 */
export function labelsFrom(model: MapModel, names: Names, drafts: ReadonlyMap<string, string> = new Map()): (t: Touch) => string {
  const pathways = new Map(live(model.pathways).map(p => [p.id, p]));
  const entranceById = new Map(live(model.entrances).map(e => [e.id, e]));
  const stops = new Map(live(model.portalEndpoints).map(e => [e.id, e]));
  const portalById = new Map(live(model.portals).map(p => [p.id, p]));
  const objects = new Map(live(model.placements).map(p => [p.id, p]));
  return t => {
    switch (t.type) {
      case "room":
        return names.room(t.id);
      case "place":
        return names.current("place", t.id) || "The place";
      case "roomDraft": {
        const name = drafts.get(t.id);
        return name ? `The draft ${name}` : "The draft";
      }
      case "keyframe":
        return capitalised(names.frame(t.id));
      case "pathway": {
        const p = pathways.get(t.id);
        if (!p) return "The pathway";
        if (p.nameEn.trim()) return `The pathway ${p.nameEn.trim()}`;
        const mid = midpoint(p.polyline);
        const near = mid ? names.near(p.levelId, mid) : null;
        return `The ${Math.round(polylineLength(p.polyline))} m pathway${near ? ` near ${near}` : ""}`;
      }
      case "entrance": {
        const e = entranceById.get(t.id);
        if (!e) return "The entrance";
        return e.nameEn.trim() ? `The entrance ${e.nameEn.trim()}` : `The entrance in ${names.room(e.roomId)}`;
      }
      case "portalEndpoint": {
        const e = stops.get(t.id);
        return e ? `The stop in ${names.room(e.roomId)}` : "The stop";
      }
      case "portal": {
        const p = portalById.get(t.id);
        const what = p ? KIND_WORDS[p.kind] ?? "lift or stair" : "lift or stair";
        return p?.nameEn.trim() ? `The ${what} ${p.nameEn.trim()}` : `The ${what}`;
      }
      case "objectKind": {
        const name = names.current("objectKind", t.id);
        return name ? `The kind ${name}` : "The kind of object";
      }
      case "placement": {
        const p = objects.get(t.id);
        if (!p) return "The object";
        const near = names.near(p.levelId, [p.position[0], p.position[1]]);
        return `The ${p.objectKindId ? names.objectKind(p.objectKindId) : "object"}${near ? ` by ${near}` : ""}`;
      }
      default:
        return `The ${TYPE_WORDS[t.type] ?? t.type} ${t.id}`;
    }
  };
}

/** The names of the drafts these changes touched: drafts aren't in the model. */
async function draftNames(db: Database, touches: readonly Touch[]): Promise<Map<string, string>> {
  const ids = [...new Set(touches.filter(t => t.type === "roomDraft").map(t => t.id))];
  if (ids.length === 0) return new Map();
  return new Map((await db.select({ id: roomDrafts.id, nameEn: roomDrafts.nameEn }).from(roomDrafts).where(inArray(roomDrafts.id, ids)))
    .map(d => [d.id, d.nameEn]));
}

export async function userNames(db: Database): Promise<Map<string, string>> {
  return new Map((await db.select({ id: users.id, name: users.displayName }).from(users)).map(u => [u.id, u.name]));
}

/** Undo's marker rows for these changes, by change id. */
export async function undoneMarks(db: Database, ids: readonly string[]): Promise<Map<string, AuditRow>> {
  if (ids.length === 0) return new Map();
  const marks = await db.select().from(auditLog).where(and(
    eq(auditLog.entityType, CHANGE_ENTITY), eq(auditLog.action, "undo"), inArray(auditLog.entityId, [...ids]),
  ));
  return new Map(marks.map(m => [m.entityId, m]));
}

/** A touched entity's table: the registry's, or the survey's frames for a binned frame. */
function tableFor(type: TouchType) {
  return type === "keyframe" ? keyframes : entityRegistry[type].table;
}

async function currentVersions(db: Database, touches: readonly Touch[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const byType = new Map<TouchType, string[]>();
  for (const t of touches) {
    const ids = byType.get(t.type);
    if (ids) ids.push(t.id);
    else byType.set(t.type, [t.id]);
  }
  for (const [type, ids] of byType) {
    const table = tableFor(type);
    const rows = (await db.select({ id: table.id, version: table.version }).from(table).where(inArray(table.id, ids))) as { id: string; version: number }[];
    for (const r of rows) out.set(`${type}:${r.id}`, r.version);
  }
  return out;
}

export type Status = { state: "live" | "undone" | "changed"; reason: string | null };

/**
 * For Undo: live while every entity a change wrote is at the version it left
 * it; undone once Undo's marker is written; changed otherwise, with who
 * changed it and when, from that entity's latest audit row.
 */
export async function statuses(
  db: Database, changes: readonly Folded[], label: (t: Touch) => string, people: ReadonlyMap<string, string>,
): Promise<Map<string, Status>> {
  const out = new Map<string, Status>();
  const undone = await undoneMarks(db, changes.map(c => c.id));
  const current = await currentVersions(db, changes.flatMap(c => c.touches));
  for (const c of changes) {
    const mark = undone.get(c.id);
    if (mark) {
      out.set(c.id, { state: "undone", reason: `Already undone by ${people.get(mark.actorId ?? "") ?? "someone"} at ${singaporeTime(mark.at.toISOString())}.` });
      continue;
    }
    const moved = c.touches.find(t => current.get(`${t.type}:${t.id}`) !== t.version);
    if (!moved) {
      out.set(c.id, { state: "live", reason: null });
      continue;
    }
    const [last] = await db.select().from(auditLog)
      .where(and(eq(auditLog.entityType, moved.type), eq(auditLog.entityId, moved.id)))
      .orderBy(desc(auditLog.at)).limit(1);
    const who = last ? people.get(last.actorId ?? "") ?? "Someone" : "Someone";
    const how = last?.via ? `${who}'s Claude` : who;
    out.set(c.id, {
      state: "changed",
      reason: last
        ? `${label(moved)} has changed since: ${how} changed it at ${singaporeTime(last.at.toISOString())}. Change it by hand instead.`
        : `${label(moved)} has changed since. Change it by hand instead.`,
    });
  }
  return out;
}

/**
 * A change with a floor of its own is on that floor. A label or a binned
 * frame is on its frame's; a kind of object on the floor of the frame it was
 * made for, and on every floor when it was made for none, since a kind is
 * the same on all of them. A portal, which is on no floor, is on the floors
 * it stops on.
 */
function onFloor(c: Folded, model: MapModel, levelId: string, frames: ReadonlyMap<string, FrameInfo>): boolean {
  if (c.levelId !== null) return c.levelId === levelId;
  const frameId = frameOf(c.facts);
  if (frameId) return frames.get(frameId)?.levelId === levelId;
  if (c.facts.kind === "kindMade") return true;
  return c.entityType === "portal" && live(model.portalEndpoints).some(e => e.portalId === c.entityId && e.levelId === levelId);
}

const framesOf = (changes: readonly Folded[]) => changes.map(c => frameOf(c.facts)).filter((id): id is string => id !== null);

/**
 * The check step's list (spec §8): every change on this floor made through a
 * Claude Code token since `since`, folded one row per thing, newest first,
 * and at most `limit` of them.
 */
export async function listClaudeChanges(db: Database, levelId: string, since: Date, limit?: number): Promise<ClaudeChange[]> {
  const rows = await db.select().from(auditLog)
    .where(and(isNotNull(auditLog.via), gte(auditLog.at, since)))
    .orderBy(desc(auditLog.at));
  const model = await assembleModel(db);
  const folded = foldChanges(rows);
  const frames = await frameInfo(db, framesOf(folded));
  // The limit is applied here, right after the floor filter — as early as it
  // can be, since folding and the floor test both need the full window's
  // rows — so nothing past it pays for names, undo marks or confidence.
  const changes = folded.filter(c => onFloor(c, model, levelId, frames)).slice(0, limit ?? Infinity);
  const names = namesFrom(model, frames);
  const undone = await undoneMarks(db, changes.map(c => c.id));
  // confidenceFor walks every frame on the floor; skip it unless the limited
  // list actually has an object row to ask it about.
  const confidence = changes.some(c => c.facts.kind === "object") ? confidenceFor(model, levelId) : null;
  return changes.map(c => ({
    auditId: c.id,
    at: c.at.toISOString(),
    group: c.group,
    summary: summarise(c, names),
    entityType: c.entityType,
    entityId: c.entityId,
    action: c.action,
    ...(c.facts.kind === "object" ? { confidence: confidence!(c.facts.sightingIds) } : {}),
    undone: undone.has(c.id),
  }));
}

export class ChangeNotFoundError extends Error {
  constructor() {
    super("There is no change of Claude's with that id.");
    this.name = "ChangeNotFoundError";
  }
}

/** Undo refused; the message is the reason, in the check step's words. Answered 409. */
export class UndoRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UndoRefusedError";
  }
}

/** "A", "A and B", "A, B and C", "A, B, C and 2 more". */
function andList(things: readonly string[]): string {
  if (things.length <= 1) return things.join("");
  if (things.length > 3) return `${things.slice(0, 3).join(", ")} and ${things.length - 3} more`;
  return `${things.slice(0, -1).join(", ")} and ${things[things.length - 1]}`;
}

const thatOrThose = (n: number) => (n === 1 ? "that" : "those");

/**
 * What Undo would take away must have nothing of anyone's depending on it now
 * (spec §8: "refuses, with a reason, when a later change depends on the
 * entity"): a room nothing bound or placed in it, a lift or stair stopping
 * nowhere else, and a kind of object with no place or object of that kind.
 * A person's binding has no Undo, so its reason says to unbind it.
 */
async function refuseDependents(tx: Database, type: TouchType, id: string, label: string): Promise<void> {
  if (type === "portal") {
    const stops = await tx.select({ levelId: portalEndpoints.levelId }).from(portalEndpoints)
      .where(and(eq(portalEndpoints.portalId, id), isNull(portalEndpoints.deletedAt)));
    if (stops.length === 0) return;
    const codes = new Map((await tx.select({ id: levels.id, code: levels.code }).from(levels)).map(l => [l.id, l.code]));
    const floors = [...new Set(stops.map(s => codes.get(s.levelId) ?? s.levelId))];
    throw new UndoRefusedError(`It now also stops on ${andList(floors)}. Undo ${stops.length === 1 ? "that stop" : "those stops"} first.`);
  }
  if (type === "objectKind") {
    const kindPlaces = (await tx.select({ name: places.nameEn }).from(places).where(and(eq(places.objectKindId, id), isNull(places.deletedAt))))
      .map(p => `the place ${p.name}`);
    const placed = (await tx.select({ id: placements.id }).from(placements).where(and(eq(placements.objectKindId, id), isNull(placements.deletedAt)))).length;
    const uses = [...kindPlaces, ...(placed > 0 ? [`${count(placed, "object")} on the map`] : [])];
    if (uses.length > 0) {
      throw new UndoRefusedError(`${label} is still used by ${andList(uses)}. Remove ${thatOrThose(kindPlaces.length + placed)} first.`);
    }
    return;
  }
  if (type !== "room") return;
  const bound = (await tx.select({ name: places.nameEn }).from(places).where(and(eq(places.roomId, id), isNull(places.deletedAt)))).map(p => p.name);
  const doors = (await tx.select({ id: doorways.id }).from(doorways)
    .where(and(or(eq(doorways.roomA, id), eq(doorways.roomB, id)), isNull(doorways.deletedAt)))).length;
  const ways = (await tx.select({ name: entrances.nameEn }).from(entrances).where(and(eq(entrances.roomId, id), isNull(entrances.deletedAt))))
    .map(e => (e.name.trim() ? `the entrance ${e.name.trim()}` : "an entrance"));
  const stops = (await tx.select({ id: portalEndpoints.id }).from(portalEndpoints)
    .where(and(eq(portalEndpoints.roomId, id), isNull(portalEndpoints.deletedAt)))).length;
  const tenancies = (await tx.select({ id: tenants.id }).from(tenants).where(and(eq(tenants.roomId, id), isNull(tenants.deletedAt)))).length;
  const objects = (await tx.select({ id: placements.id }).from(placements).where(and(eq(placements.roomId, id), isNull(placements.deletedAt)))).length;
  const others = [
    ...(doors > 0 ? [count(doors, "doorway")] : []),
    ...ways,
    ...(stops > 0 ? [stops === 1 ? "a lift or stair stop" : `${stops} lift or stair stops`] : []),
    ...(tenancies > 0 ? [count(tenancies, "tenant")] : []),
    ...(objects > 0 ? [count(objects, "object")] : []),
  ];
  if (bound.length === 0 && others.length === 0) return;
  const boundTo = bound.length === 1 ? `the place ${bound[0]}` : `the places ${andList(bound)}`;
  const remove = `remove ${thatOrThose(doors + ways.length + stops + tenancies + objects)}`;
  if (others.length === 0) throw new UndoRefusedError(`${label} has ${boundTo} bound to it now. Unbind ${andList(bound)} first.`);
  if (bound.length === 0) throw new UndoRefusedError(`${label} has ${andList(others)} on it now. ${capitalised(remove)} first.`);
  throw new UndoRefusedError(`${label} has ${boundTo} bound to it, and ${andList(others)} on it now. Unbind ${andList(bound)} and ${remove} first.`);
}

/** A draft from before the floor's latest Find rooms would come back beside the new search's. */
async function refuseOldDraft(tx: Database, draftId: string): Promise<void> {
  const [draft] = await tx.select({ levelId: roomDrafts.levelId }).from(roomDrafts).where(eq(roomDrafts.id, draftId));
  if (!draft || !(await latestSearch(tx, draft.levelId)).some(d => d.id === draftId)) {
    throw new UndoRefusedError("Find rooms has run again since, so this draft is from an older search. Change the map by hand instead.");
  }
}

/** A frame comes back with the tags binned with it, unless its footage has gone since. */
async function unbin(tx: Database, frameId: string, version: number, actor: string): Promise<void> {
  const [frame] = await tx.select({ captureId: keyframes.captureId }).from(keyframes).where(eq(keyframes.id, frameId));
  const [footage] = frame
    ? await tx.select({ filename: captures.filename, deletedAt: captures.deletedAt }).from(captures).where(eq(captures.id, frame.captureId))
    : [];
  if (footage?.deletedAt) throw new UndoRefusedError(`The footage ${footage.filename} was deleted since, so its frames can't come back.`);
  const back = await restoreFrame(tx, frameId, actor, version);
  if (back === "missing" || back === "not-deleted") throw new UndoRefusedError("That frame isn't binned now, so there is nothing to take back.");
}

async function apply(tx: Database, step: UndoStep, actor: string, label: (t: Touch) => string): Promise<void> {
  switch (step.do) {
    case "delete":
      await refuseDependents(tx, step.type, step.id, label(step));
      await softDeleteEntity(tx, step.type, step.id, step.version, actor);
      return;
    case "restore":
      if (step.type === "roomDraft") await refuseOldDraft(tx, step.id);
      await restoreEntity(tx, step.type, step.id, step.version, actor);
      return;
    case "patch":
      await updateEntity(tx, step.type, step.id, step.version, step.patch, actor);
      return;
    case "unaccept":
      await refuseDependents(tx, "room", step.roomId, label({ type: "room", id: step.roomId, version: step.roomVersion }));
      await refuseOldDraft(tx, step.draftId);
      await unacceptDrafts(tx, [{ id: step.draftId, expectedVersion: step.draftVersion, roomVersion: step.roomVersion }], actor);
      return;
    case "unsetAside":
      await unsetAside(tx, step.draftId, step.version, actor);
      return;
    case "unbin":
      await unbin(tx, step.frameId, step.version, actor);
      return;
  }
}

/**
 * Takes back one of Claude's changes (spec §8), as a person, all or none.
 * Refused while anything it wrote has changed since, or something depends
 * on it. Leaves an undo row keyed on the change, so the list says it was.
 */
export async function undoChange(db: Database, auditId: string, actorId: string): Promise<{ summary: string }> {
  const [key] = await db.select().from(auditLog).where(eq(auditLog.id, auditId));
  if (!key || !key.via) throw new ChangeNotFoundError();
  // Its call's rows share its moment. JavaScript keeps it to the millisecond and
  // Postgres to the microsecond, so they are read a millisecond either side.
  const siblings = await db.select().from(auditLog).where(and(
    eq(auditLog.via, key.via),
    gte(auditLog.at, new Date(key.at.getTime() - 1)),
    lte(auditLog.at, new Date(key.at.getTime() + 1)),
  ));
  const change = foldChanges(siblings).find(c => c.id === auditId);
  if (!change) throw new ChangeNotFoundError();
  const steps = change.undo;
  // A label is a proposal, and Review is where proposals are decided, with their tags.
  if (steps === null) throw new UndoRefusedError("Claude's labels are proposals: accept or reject them in Review.");

  const model = await assembleModel(db);
  const names = namesFrom(model, await frameInfo(db, framesOf([change])));
  const label = labelsFrom(model, names, await draftNames(db, change.touches));
  const summary = summarise(change, names);
  const status = (await statuses(db, [change], label, await userNames(db))).get(change.id)!;
  if (status.state !== "live") throw new UndoRefusedError(status.reason ?? "This change can't be undone now.");

  try {
    await db.transaction(async t => {
      const tx = t as unknown as Database;
      for (const step of steps) await apply(tx, step, actorId, label);
      await recordAudit(tx, CHANGE_ENTITY, auditId, "undo", actorId, null, { auditIds: change.auditIds, summary });
    });
  } catch (err) {
    // The checks above passed, so these mean someone wrote in the moment between.
    if (err instanceof VersionConflictError || err instanceof NotFoundError || err instanceof NotDeletedError) {
      throw new UndoRefusedError("Someone changed this while Undo ran. Look again, then try once more.");
    }
    // The drafts' own refusals, in words a person reads (Task 9's review M1): answered 409, not 500.
    if (err instanceof DraftRefusedError) throw new UndoRefusedError(err.message);
    throw err;
  }
  return { summary };
}
