import { distancePointToSegment, live, pointInPolygon, type MapModel, type Ring, type Vec2 } from "@oth/model";
import { and, desc, eq, gte, inArray, isNotNull, isNull, lte, or } from "drizzle-orm";
import type { Database } from "../db/client";
import { auditLog, doorways, entrances, placements, places, portalEndpoints, roomDrafts, tenants, users } from "../db/schema";
import { latestSearch, unacceptDrafts } from "../drafts/service";
import { entityRegistry, type EntityType } from "../entities/registry";
import {
  NotDeletedError, NotFoundError, VersionConflictError, recordAudit, restoreEntity, softDeleteEntity, updateEntity,
} from "../entities/repository";
import { singaporeTime } from "../mcp/results";
import { assembleModel } from "../model/assemble";
import { confidenceFor } from "../objects/spots";
import {
  TYPE_WORDS, foldChanges, summarise, type AuditRow, type ChangeGroup, type Folded, type Names, type Touch, type UndoStep,
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

export function namesFrom(model: MapModel): Names {
  const rooms = live(model.rooms);
  const byId = new Map(rooms.map(r => [r.id, r]));
  const places = new Map(live(model.places).map(p => [p.id, p.nameEn]));
  // A shop is known by its surveyed place's name ("Starbucks") before the drawing's ("SHOP 12").
  const bound = new Map(live(model.places).filter(p => p.roomId && !p.objectKindId).map(p => [p.roomId!, p.nameEn]));
  const kinds = new Map(live(model.objectKinds).map(k => [k.id, k.nameEn]));
  const portals = new Map(live(model.portals).map(p => [p.id, p.kind]));
  return {
    room: id => byId.get(id)?.nameEn.trim() || id,
    place: id => places.get(id) ?? id,
    objectKind: id => kinds.get(id) ?? "an object",
    portalKind: id => portals.get(id) ?? null,
    near: (levelId, at) => {
      let best: { name: string; d: number } | null = null;
      for (const r of rooms) {
        if (r.levelId !== levelId || r.walkable || r.kind === "void" || r.kind === "detail") continue;
        const name = bound.get(r.id) ?? r.nameEn.trim();
        if (!name) continue;
        const d = pointInPolygon(at, r.footprint, r.holes) ? 0 : ringDistance(at, r.footprint);
        if (d <= NEAR_M && (!best || d < best.d)) best = { name, d };
      }
      if (best) return best.name;
      return rooms.find(r => r.levelId === levelId && r.walkable && pointInPolygon(at, r.footprint, r.holes))?.nameEn.trim() || null;
    },
  };
}

/** A touched entity as a reason names it: "Starbucks", "The draft", "The stop oth-L1-portal-5". */
export function labelsFrom(model: MapModel, names: Names): (t: Touch) => string {
  const places = new Map(live(model.places).map(p => [p.id, p.nameEn]));
  return t => {
    if (t.type === "room") return names.room(t.id);
    if (t.type === "place") return places.get(t.id) ?? t.id;
    if (t.type === "roomDraft") return "The draft";
    return `The ${TYPE_WORDS[t.type] ?? t.type} ${t.id}`;
  };
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

async function currentVersions(db: Database, touches: readonly Touch[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const byType = new Map<EntityType, string[]>();
  for (const t of touches) {
    const ids = byType.get(t.type);
    if (ids) ids.push(t.id);
    else byType.set(t.type, [t.id]);
  }
  for (const [type, ids] of byType) {
    const { table } = entityRegistry[type];
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

/** The floor each frame was filmed on, for a label, whose floor is its frame's. */
function frameFloors(model: MapModel): Map<string, string | undefined> {
  const captureFloor = new Map(live(model.captures).map(c => [c.id, c.levelId]));
  return new Map(live(model.keyframes).map(k => [k.id, captureFloor.get(k.captureId)]));
}

/** A label is on its frame's floor; a portal, which is on no floor, on the floors it stops on. */
function onFloor(c: Folded, model: MapModel, levelId: string, frameFloor: ReadonlyMap<string, string | undefined>): boolean {
  if (c.levelId !== null) return c.levelId === levelId;
  if (c.facts.kind === "label") return frameFloor.get(c.facts.frameId) === levelId;
  return c.entityType === "portal" && live(model.portalEndpoints).some(e => e.portalId === c.entityId && e.levelId === levelId);
}

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
  const frameFloor = frameFloors(model);
  // The limit is applied here, right after the floor filter — as early as it
  // can be, since folding and the floor test both need the full window's
  // rows — so nothing past it pays for names, undo marks or confidence.
  const changes = foldChanges(rows).filter(c => onFloor(c, model, levelId, frameFloor)).slice(0, limit ?? Infinity);
  const names = namesFrom(model);
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

const listed = (things: readonly string[]) =>
  things.length <= 3 ? things.join(", ") : `${things.slice(0, 3).join(", ")} and ${things.length - 3} more`;

/**
 * A room Undo would take off the map must have nothing of anyone's on it now,
 * and a lift or stair must stop nowhere else (spec §8: "refuses, with a
 * reason, when a later change depends on the entity").
 */
async function refuseDependents(tx: Database, type: EntityType, id: string, label: string): Promise<void> {
  if (type === "portal") {
    const stops = await tx.select({ id: portalEndpoints.id }).from(portalEndpoints)
      .where(and(eq(portalEndpoints.portalId, id), isNull(portalEndpoints.deletedAt)));
    if (stops.length > 0) {
      throw new UndoRefusedError(`It now also stops on another floor (${listed(stops.map(s => s.id))}). Undo ${stops.length === 1 ? "that stop" : "those stops"} first.`);
    }
    return;
  }
  if (type !== "room") return;
  const found = [
    ...(await tx.select({ name: places.nameEn }).from(places).where(and(eq(places.roomId, id), isNull(places.deletedAt)))).map(p => `the place ${p.name}`),
    ...(await tx.select({ id: doorways.id }).from(doorways)
      .where(and(or(eq(doorways.roomA, id), eq(doorways.roomB, id)), isNull(doorways.deletedAt)))).map(d => `doorway ${d.id}`),
    ...(await tx.select({ id: entrances.id }).from(entrances).where(and(eq(entrances.roomId, id), isNull(entrances.deletedAt)))).map(e => `entrance ${e.id}`),
    ...(await tx.select({ id: portalEndpoints.id }).from(portalEndpoints)
      .where(and(eq(portalEndpoints.roomId, id), isNull(portalEndpoints.deletedAt)))).map(s => `the stop ${s.id}`),
    ...(await tx.select({ id: tenants.id }).from(tenants).where(and(eq(tenants.roomId, id), isNull(tenants.deletedAt)))).map(t => `tenant ${t.id}`),
    ...(await tx.select({ id: placements.id }).from(placements).where(and(eq(placements.roomId, id), isNull(placements.deletedAt)))).map(p => `placement ${p.id}`),
  ];
  if (found.length > 0) {
    throw new UndoRefusedError(`${label} has ${listed(found)} on it now. Undo or remove ${found.length === 1 ? "that" : "those"} first.`);
  }
}

/** A draft from before the floor's latest Find rooms would come back beside the new search's. */
async function refuseOldDraft(tx: Database, draftId: string): Promise<void> {
  const [draft] = await tx.select({ levelId: roomDrafts.levelId }).from(roomDrafts).where(eq(roomDrafts.id, draftId));
  if (!draft || !(await latestSearch(tx, draft.levelId)).some(d => d.id === draftId)) {
    throw new UndoRefusedError("Find rooms has run again since, so this draft is from an older search. Change the map by hand instead.");
  }
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
  const names = namesFrom(model);
  const label = labelsFrom(model, names);
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
    throw err;
  }
  return { summary };
}
