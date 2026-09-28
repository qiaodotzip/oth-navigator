import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { RoomDraftInputSchema, labelPoint, type DraftSource, type Ring, type RoomKind, type Vec2 } from "@oth/model";
import type { Database } from "../db/client";
import { toModelRow, type Row } from "../db/rows";
import { auditLog, levels, roomDrafts, rooms } from "../db/schema";
import {
  NotFoundError, VersionConflictError, createEntity, recordAudit, restoreEntity, softDeleteEntity, updateEntity,
} from "../entities/repository";

/** At most this many drafts in one search (spec §5.3). */
export const MAX_DRAFTS = 1000;

/** A request the drafts cannot take, in words the reviewer can act on. Answered 422. */
export class DraftRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DraftRefusedError";
  }
}

/**
 * Two accepts at once each saw a new room's id free, and the other took it
 * first. Nothing of this one was written, so accepting again is safe: it
 * numbers past the room that won. Answered 409.
 */
export class RoomIdTakenError extends Error {
  constructor() {
    super("Someone added a room with the same name just now. Accept again, and yours is numbered after theirs.");
    this.name = "RoomIdTakenError";
  }
}

/** Postgres's unique_violation, from pg and PGlite alike. A room's one unique key is its id. */
function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: unknown } | null)?.code === "23505";
}

/**
 * The floor drafts are for. A deleted one is refused like a missing one:
 * rooms added to it would be hidden with it, and found by no one.
 */
async function liveLevel(tx: Database, levelId: string) {
  const [level] = await tx.select().from(levels).where(eq(levels.id, levelId));
  if (!level) throw new DraftRefusedError(`There is no floor ${levelId}.`);
  if (level.deletedAt) throw new DraftRefusedError(`Floor ${level.code} was deleted. Restore it first.`);
  return level;
}

export type AcceptItem = { id: string; expectedVersion: number; nameEn?: string; kind?: RoomKind };
export type UnacceptItem = { id: string; expectedVersion: number; roomVersion: number };
export type Accepted = { draftId: string; draftVersion: number; roomId: string; roomVersion: number };

/**
 * A room's id from its name, as plan:l1 made L1's: the floor's code, the name
 * as a slug of at most 48 characters, then -2, -3… until it is free. `taken`
 * holds every room id, deleted ones too (an id is a primary key), and this
 * adds the one it gives.
 */
export function roomIdFor(code: string, name: string, taken: Set<string>): string {
  const prefix = code.replace(/[^A-Za-z0-9_-]/g, "") || "room";
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48).replace(/-+$/, "") || "space";
  const base = `${prefix}-${slug}`;
  let id = base;
  for (let i = 2; taken.has(id); i++) id = `${base}-${i}`;
  taken.add(id);
  return id;
}

/**
 * The audit actions that mark a draft set aside for a person (decide_drafts)
 * and take the mark back (Undo in the setup's check step). A set-aside draft
 * stays waiting: only the mark says a person should decide it.
 */
export const SET_ASIDE = "set-aside";
export const UNSET_ASIDE = "unset-aside";

/** Who set a draft aside (a user id), why, and when (ISO). */
export type SetAside = { by: string; reason: string; at: string };

/**
 * The drafts on a floor set aside now, by id. A draft is set aside while its
 * latest set-aside or unset-aside mark is a set-aside, and nobody has decided
 * it since: an accept or a reject soft-deletes it, so a delete after the mark
 * ends it, even when that reject is later undone. The caller checks the draft
 * still waits.
 */
async function setAsideMarks(db: Database, levelId: string): Promise<Map<string, SetAside>> {
  const rows = await db.select({
    id: auditLog.entityId, action: auditLog.action, actorId: auditLog.actorId, after: auditLog.after, at: auditLog.at,
  })
    .from(auditLog)
    .innerJoin(roomDrafts, eq(roomDrafts.id, auditLog.entityId))
    .where(and(
      eq(auditLog.entityType, "roomDraft"), eq(roomDrafts.levelId, levelId),
      inArray(auditLog.action, [SET_ASIDE, UNSET_ASIDE, "delete"]),
    ))
    .orderBy(asc(auditLog.at));
  const marks = new Map<string, SetAside | null>();
  for (const r of rows) {
    const reason = (r.after as { reason?: unknown } | null)?.reason;
    marks.set(r.id, r.action === SET_ASIDE
      ? { by: r.actorId ?? "", reason: typeof reason === "string" ? reason : "", at: r.at.toISOString() }
      : null);
  }
  const out = new Map<string, SetAside>();
  for (const [id, mark] of marks) if (mark) out.set(id, mark);
  return out;
}

/**
 * A floor's drafts still waiting for review, largest first, as the script
 * ordered them, then by id: a tiebreaker, so a page stays stable when two
 * drafts share an area and decide_drafts has just taken others off the list.
 * One Claude set aside for a person carries `setAside`.
 */
export async function listDrafts(db: Database, levelId: string): Promise<Row[]> {
  const rows = await db.select().from(roomDrafts).where(and(
    eq(roomDrafts.levelId, levelId), isNull(roomDrafts.deletedAt), isNull(roomDrafts.acceptedRoomId),
  ));
  const marks = await setAsideMarks(db, levelId);
  return rows.map(r => {
    const row = toModelRow(r as unknown as Row);
    const mark = marks.get(r.id);
    return mark ? { ...row, setAside: mark } : row;
  }).sort((a, b) => Number(b.areaM2) - Number(a.areaM2) || String(a.id).localeCompare(String(b.id)));
}

/**
 * Contract v3's line-up check: the drawing a search read sits off the rooms
 * already on the floor. dx and dy, in metres, are how far it sits from them:
 * a draft's label less the centre of the room it is named for, as the editor
 * says it ("about 11.5 m east and 4.6 m south of the rooms"). pairs is how
 * many drafts agree on it. Rehearsal 2's L1 plan sat (+11.5, −4.6) off its
 * rooms, and map_rooms made about 160 rooms twice.
 */
export type LineUp = { dx: number; dy: number; pairs: number };
/** At least this many pairs must agree, */
export const LINE_UP_PAIRS = 5;
/** each within this of the others, */
export const LINE_UP_AGREE_M = 0.5;
/** on a shift longer than this. */
export const LINE_UP_SHIFT_M = 1;

/** Names compared the way people mean them (editor/src/survey/suggest.ts normalName): case, inner spacing and the ends ignored. */
function normalName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Whether waiting drafts sit off the rooms already on the floor (contract
 * v3). A draft is paired with a room when exactly one room on the floor has
 * its name, capitals and spacing aside, and each pair gives the offset
 * between the draft's label and the room's centre (where get_floor puts its
 * name); the answer is the label's side of it, where the drawing sits.
 * The largest group of shifts within LINE_UP_AGREE_M of one of them decides:
 * at least LINE_UP_PAIRS of them, on a mean shift over LINE_UP_SHIFT_M, is a
 * drawing that doesn't line up. A floor that does line up, or has too few
 * named rooms to tell, gives null.
 */
export function lineUpOf(
  drafts: readonly { nameEn: string; labelPoint: Vec2 }[],
  rooms: readonly { nameEn: string; footprint: Ring; holes: readonly Ring[] }[],
): LineUp | null {
  const named = new Map<string, (typeof rooms)[number][]>();
  for (const r of rooms) {
    const name = normalName(r.nameEn);
    if (name) named.set(name, [...(named.get(name) ?? []), r]);
  }
  const centres = new Map<(typeof rooms)[number], Vec2>();
  const shifts: Vec2[] = [];
  for (const d of drafts) {
    const same = named.get(normalName(d.nameEn));
    if (same?.length !== 1) continue;
    const room = same[0]!;
    const centre = centres.get(room) ?? labelPoint(room.footprint, room.holes, 0.5).point;
    centres.set(room, centre);
    shifts.push([d.labelPoint[0] - centre[0], d.labelPoint[1] - centre[1]]);
  }
  let agreeing: Vec2[] = [];
  for (const s of shifts) {
    const near = shifts.filter(t => Math.hypot(t[0] - s[0], t[1] - s[1]) <= LINE_UP_AGREE_M);
    if (near.length > agreeing.length) agreeing = near;
  }
  if (agreeing.length < LINE_UP_PAIRS) return null;
  const dx = agreeing.reduce((sum, s) => sum + s[0], 0) / agreeing.length;
  const dy = agreeing.reduce((sum, s) => sum + s[1], 0) / agreeing.length;
  if (Math.hypot(dx, dy) <= LINE_UP_SHIFT_M) return null;
  return { dx: round1(dx), dy: round1(dy), pairs: agreeing.length };
}

/**
 * lineUpOf for GET /api/levels/:id/drafts: these waiting drafts (as
 * listDrafts gives them, set-aside ones included) against the floor's live
 * rooms.
 */
export async function floorLineUp(db: Database, levelId: string, waiting: readonly Row[]): Promise<LineUp | null> {
  if (waiting.length < LINE_UP_PAIRS) return null;
  const here = await db.select({ nameEn: rooms.nameEn, footprint: rooms.footprint, holes: rooms.holes }).from(rooms)
    .where(and(eq(rooms.levelId, levelId), isNull(rooms.deletedAt)));
  return lineUpOf(
    waiting.map(d => ({ nameEn: String(d.nameEn), labelPoint: d.labelPoint as Vec2 })),
    here.map(r => ({ nameEn: r.nameEn, footprint: r.footprint as Ring, holes: (r.holes ?? []) as Ring[] })),
  );
}

/**
 * The audit action a search leaves on its floor's level, one per search, even
 * an empty one (spec §5.3's Find rooms that finds nothing still retires the
 * floor's old drafts). floorDrafts and latestSearch need a moment for every
 * search, and an empty search creates no roomDraft row to read one from.
 */
const FIND_ROOMS = "find-rooms";

/**
 * A new search's drafts in place of the floor's old ones, in one transaction.
 * Accepted drafts are rooms now and are not touched. The old live ones are
 * retired together, at one moment, like every batch removal here. The marker
 * row is written even when `inputs` is empty, so this search's moment can
 * still be found.
 */
export async function replaceDrafts(
  db: Database, levelId: string, source: DraftSource, inputs: readonly unknown[], actor: string,
): Promise<Row[]> {
  return db.transaction(async t => {
    const tx = t as unknown as Database;
    await liveLevel(tx, levelId);
    await recordAudit(tx, "level", levelId, FIND_ROOMS, actor, null, null);
    const at = new Date();
    const live = await tx.select().from(roomDrafts)
      .where(and(eq(roomDrafts.levelId, levelId), isNull(roomDrafts.deletedAt)));
    for (const d of live) await softDeleteEntity(tx, "roomDraft", d.id, d.version, actor, at);
    const out: Row[] = [];
    for (const input of inputs) {
      const draft = { ...RoomDraftInputSchema.parse(input), id: `rd_${randomUUID()}`, levelId, source };
      out.push(toModelRow(await createEntity(tx, "roomDraft", draft, actor)));
    }
    return out;
  });
}

/**
 * Drafts made rooms, all or none (spec §5.2 step 7). Each room gets its id
 * from its name and its height from its floor. It is walkable if it is an
 * area, and its verification is `cad`, with the PDF's checksum as evidence.
 * Each draft is retired pointing at the room it became, so the undo can find
 * both.
 */
export async function acceptDrafts(db: Database, items: readonly AcceptItem[], actor: string): Promise<Accepted[]> {
  try {
    return await acceptInOne(db, items, actor);
  } catch (err) {
    // `taken` is read as the transaction starts, so a teammate's accept that
    // commits the same new id before this one's insert meets the primary key.
    if (isUniqueViolation(err)) throw new RoomIdTakenError();
    throw err;
  }
}

/**
 * A draft is fit for a decision: not already a room, not already rejected,
 * and at the version the caller expects. Shared by acceptInOne and
 * decideDrafts, so every decision refuses the same way, in the same words.
 * `who` names the draft: its name for a person in Build, its id and name for
 * Claude, who decides a hundred at once.
 */
function waitingDraft(draft: typeof roomDrafts.$inferSelect, expectedVersion: number, who = draft.nameEn): void {
  if (draft.acceptedRoomId) throw new DraftRefusedError(`${who} is on the map already.`);
  if (draft.deletedAt) {
    throw new DraftRefusedError(`${who} is no longer waiting for review: it was rejected, or the drawing was searched again.`);
  }
  // The draft's version is the check that matters, so it comes before anything is written.
  if (draft.version !== expectedVersion) throw new VersionConflictError(toModelRow(draft as unknown as Row));
}

/** The room's name: what the caller gives, trimmed, or the draft's own when they give none. */
function nameFor(given: string | undefined, draftNameEn: string): string {
  return given?.trim() || draftNameEn;
}

async function acceptInOne(db: Database, items: readonly AcceptItem[], actor: string): Promise<Accepted[]> {
  return db.transaction(async t => {
    const tx = t as unknown as Database;
    const taken = new Set((await tx.select({ id: rooms.id }).from(rooms)).map(r => r.id));
    const out: Accepted[] = [];
    for (const item of items) {
      const [draft] = await tx.select().from(roomDrafts).where(eq(roomDrafts.id, item.id));
      if (!draft) throw new NotFoundError();
      waitingDraft(draft, item.expectedVersion);
      if (!draft.footprint) {
        throw new DraftRefusedError(`${draft.nameEn} is left open on the drawing, so it has no shape to add. Draw it by hand.`);
      }
      const level = await liveLevel(tx, draft.levelId);
      const nameEn = nameFor(item.nameEn, draft.nameEn);
      const kind = item.kind ?? (draft.kind as RoomKind);
      const roomId = roomIdFor(level.code, nameEn, taken);
      const room = await createEntity(tx, "room", {
        id: roomId, levelId: draft.levelId, kind,
        footprint: draft.footprint, holes: draft.holes,
        // As tall as its storey, like every room plan:l1 made; a column stands floor to ceiling.
        heightM: level.heightM,
        // An area is floor you cross; a room is somewhere you arrive.
        walkable: kind === "area",
        nameEn, nameZh: "",
        verification: { status: "cad", evidence: [`pdf:${draft.source.checksum}`] },
      }, actor);
      const renamed = await updateEntity(tx, "roomDraft", draft.id, draft.version, { acceptedRoomId: roomId, nameEn, kind }, actor);
      const retired = await softDeleteEntity(tx, "roomDraft", draft.id, Number(renamed.version), actor);
      out.push({ draftId: draft.id, draftVersion: Number(retired.version), roomId, roomVersion: Number(room.version) });
    }
    return out;
  });
}

/**
 * The undo of an accept, as `/reopen` is for places: the room comes off the
 * map and the draft goes back to waiting, all or none. A room someone has
 * changed since is refused (409) rather than deleted with their change in it.
 */
export async function unacceptDrafts(db: Database, items: readonly UnacceptItem[], actor: string): Promise<number> {
  return db.transaction(async t => {
    const tx = t as unknown as Database;
    for (const item of items) {
      const [draft] = await tx.select().from(roomDrafts).where(eq(roomDrafts.id, item.id));
      if (!draft) throw new NotFoundError();
      if (!draft.acceptedRoomId || !draft.deletedAt) {
        throw new DraftRefusedError(`${draft.nameEn} isn't on the map, so there is nothing to take back.`);
      }
      if (draft.version !== item.expectedVersion) throw new VersionConflictError(toModelRow(draft as unknown as Row));
      const [room] = await tx.select().from(rooms).where(eq(rooms.id, draft.acceptedRoomId));
      if (room && !room.deletedAt) await softDeleteEntity(tx, "room", room.id, item.roomVersion, actor);
      const back = await restoreEntity(tx, "roomDraft", draft.id, item.expectedVersion, actor);
      await updateEntity(tx, "roomDraft", draft.id, Number(back.version), { acceptedRoomId: null }, actor);
    }
    return items.length;
  });
}

/** One draft of a floor, as the setup counts and list_drafts read it. */
export type DraftRow = {
  id: string;
  nameEn: string;
  acceptedRoomId: string | null;
  deletedAt: string | null;
  /** A later Find rooms retired it while it waited: neither accepted nor rejected. */
  retired: boolean;
  /** Set while it waits for a person, as Claude set it aside; null otherwise. */
  setAside: SetAside | null;
};
/** A draft of the floor's latest search, as the Undo guard reads it. */
export type SearchDraft = Pick<DraftRow, "id" | "nameEn" | "acceptedRoomId" | "deletedAt">;
/** Contract v2: waiting counts only the drafts nobody has set aside. */
export type DraftTally = { waiting: number; setAside: number; accepted: number; rejected: number };

/*
 * How a search is told apart. One search is one transaction (replaceDrafts),
 * and audit_log.at defaults to Postgres's now(), which is the same for the
 * whole of a transaction. So the drafts a search made share their create
 * rows' at, and a draft it retired has its delete row at that same moment.
 * Both are compared in SQL, to the microsecond; a JavaScript Date keeps only
 * the millisecond.
 *
 * A search's own moment is the union of its drafts' create rows and its
 * FIND_ROOMS marker: an empty search creates no drafts, so without the
 * marker its moment could not be found at all, and the drafts it retired
 * would come back neither the previous search's nor its own — just wrong.
 */
const SEARCH_MOMENTS = (levelId: string) => sql`(
  select a.at from audit_log a join room_drafts s on s.id = a.entity_id
  where a.entity_type = 'roomDraft' and a.action = 'create' and s.level_id = ${levelId}
  union
  select f.at from audit_log f
  where f.entity_type = 'level' and f.action = ${FIND_ROOMS} and f.entity_id = ${levelId}
)`;

/** Every search's drafts on the floor, decided or not (Plan 6E counts them all), each saying whether a later search retired it. */
export async function floorDrafts(db: Database, levelId: string): Promise<DraftRow[]> {
  const rows = await db.select({
    id: roomDrafts.id, nameEn: roomDrafts.nameEn, acceptedRoomId: roomDrafts.acceptedRoomId, deletedAt: roomDrafts.deletedAt,
    // room_drafts.id is written bare, correlating to the outer query: interpolating the
    // column here would render as the unqualified "id", which inside this subquery's own
    // scope resolves to audit_log's own id column instead, and the exists never matches.
    retired: sql<boolean>`exists (
      select 1 from audit_log del
      where del.entity_type = 'roomDraft' and del.action = 'delete' and del.entity_id = room_drafts.id
        and del.at in ${SEARCH_MOMENTS(levelId)}
    )`,
  }).from(roomDrafts).where(eq(roomDrafts.levelId, levelId));
  const marks = await setAsideMarks(db, levelId);
  return rows.map(r => ({
    ...r,
    deletedAt: r.deletedAt ? r.deletedAt.toISOString() : null,
    retired: Boolean(r.retired),
    setAside: r.deletedAt === null && r.acceptedRoomId === null ? marks.get(r.id) ?? null : null,
  }));
}

/**
 * The drafts of the floor's latest Find rooms alone: those whose create row
 * has the newest search moment (over every search, empty ones included, so
 * an empty latest search correctly gives none of the search before it).
 */
export async function latestSearch(db: Database, levelId: string): Promise<SearchDraft[]> {
  const rows = await db.select({
    id: roomDrafts.id, nameEn: roomDrafts.nameEn, acceptedRoomId: roomDrafts.acceptedRoomId, deletedAt: roomDrafts.deletedAt,
  })
    .from(roomDrafts)
    .innerJoin(auditLog, and(eq(auditLog.entityType, "roomDraft"), eq(auditLog.action, "create"), eq(auditLog.entityId, roomDrafts.id)))
    .where(and(
      eq(roomDrafts.levelId, levelId),
      sql`${auditLog.at} = (select max(m.at) from ${SEARCH_MOMENTS(levelId)} as m)`,
    ));
  return rows.map(r => ({ ...r, deletedAt: r.deletedAt ? r.deletedAt.toISOString() : null }));
}

/**
 * Waiting (for anyone), set aside (waiting for a person), accepted and
 * rejected. A draft a search retired is none of those, and isn't counted.
 */
export function tallyDrafts(rows: readonly DraftRow[]): DraftTally {
  return {
    waiting: rows.filter(r => r.deletedAt === null && r.setAside === null).length,
    setAside: rows.filter(r => r.deletedAt === null && r.setAside !== null).length,
    accepted: rows.filter(r => r.acceptedRoomId !== null).length,
    rejected: rows.filter(r => r.deletedAt !== null && r.acceptedRoomId === null && !r.retired).length,
  };
}

/** decide_drafts's most per call (spec §7.2). */
export const MAX_DECISIONS = 100;

export type DraftDecision = {
  id: string;
  expectedVersion: number;
  decision: "accept" | "reject" | "set_aside";
  /** accept only. */
  nameEn?: string;
  /** accept only. */
  kind?: RoomKind;
  /** set_aside only, and needed there: why a person should decide it, in one line. */
  reason?: string;
};
export type Decided = {
  accepted: (Accepted & { nameEn: string })[];
  rejected: string[];
  setAside: string[];
  /** Ids no draft has: skipped, so one mistyped id doesn't cost the rest. */
  unknown: string[];
};

/** One line, as the Build list and the check step show it beside the draft. */
function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, 200);
}

/**
 * Claude's decide_drafts (spec §7.2, contract v2): one floor's accepts,
 * rejects and set-asides. An id no draft has is skipped and reported; every
 * other refusal leaves the whole call unwritten. Accepts go through
 * acceptDrafts, as the Accept button's do, so their Undo is the same. A
 * reject is the soft delete Build's Reject makes. A set-aside writes nothing
 * to the draft, which keeps waiting: a SET_ASIDE row with the reason marks
 * it for a person, in Build and in the check step. Every draft is checked,
 * named by its id, before anything is written: a tool touches only the floor
 * it is given.
 */
export async function decideDrafts(db: Database, levelId: string, items: readonly DraftDecision[], actor: string): Promise<Decided> {
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.id)) throw new DraftRefusedError(`Draft ${item.id} is in the list twice. Decide each draft once.`);
    seen.add(item.id);
    if (item.decision === "set_aside" && !oneLine(item.reason ?? "")) {
      throw new DraftRefusedError(`Setting aside draft ${item.id} needs a reason: one line on why a person should decide it.`);
    }
  }
  return db.transaction(async t => {
    const tx = t as unknown as Database;
    const level = await liveLevel(tx, levelId);
    const marks = await setAsideMarks(tx, levelId);
    const drafts = new Map<string, typeof roomDrafts.$inferSelect>();
    const unknown: string[] = [];
    for (const item of items) {
      const [draft] = await tx.select().from(roomDrafts).where(eq(roomDrafts.id, item.id));
      if (!draft) {
        unknown.push(item.id);
        continue;
      }
      if (draft.levelId !== levelId) {
        throw new DraftRefusedError(`Draft ${item.id} is not on ${level.code}. decide_drafts decides one floor's drafts at a time.`);
      }
      const who = `Draft ${draft.id} (${draft.nameEn})`;
      waitingDraft(draft, item.expectedVersion, who);
      if (item.decision === "accept" && !draft.footprint) {
        throw new DraftRefusedError(`${who} is left open on the drawing, so it has no shape to add. Set it aside for a person instead.`);
      }
      if (item.decision === "set_aside" && marks.has(draft.id)) throw new DraftRefusedError(`${who} is set aside already.`);
      drafts.set(draft.id, draft);
    }
    const known = items.filter(i => drafts.has(i.id));

    const accepts = known.filter(i => i.decision === "accept");
    // A savepoint inside this transaction: its refusal takes the rejects back too.
    const made = accepts.length === 0 ? [] : await acceptDrafts(tx, accepts.map(({ id, expectedVersion, nameEn, kind }) => ({
      id, expectedVersion, ...(nameEn ? { nameEn } : {}), ...(kind ? { kind } : {}),
    })), actor);
    const nameOf = new Map(accepts.map(a => [a.id, nameFor(a.nameEn, drafts.get(a.id)!.nameEn)]));

    const at = new Date();
    const rejected: string[] = [];
    const setAside: string[] = [];
    for (const item of known) {
      const draft = drafts.get(item.id)!;
      if (item.decision === "reject") {
        await softDeleteEntity(tx, "roomDraft", draft.id, draft.version, actor, at);
        rejected.push(draft.nameEn);
      } else if (item.decision === "set_aside") {
        await recordAudit(tx, "roomDraft", draft.id, SET_ASIDE, actor, null, {
          id: draft.id, levelId, nameEn: draft.nameEn, version: draft.version, areaM2: draft.areaM2, reason: oneLine(item.reason ?? ""),
        });
        setAside.push(draft.nameEn);
      }
    }
    return { accepted: made.map(a => ({ ...a, nameEn: nameOf.get(a.draftId)! })), rejected, setAside, unknown };
  });
}

/**
 * The Undo of a set-aside (the setup's check step): the draft stays where it
 * is, waiting, and an UNSET_ASIDE row takes the mark back. Refused unless the
 * draft is at the version the set-aside left, still waiting, and still set
 * aside.
 */
export async function unsetAside(db: Database, draftId: string, expectedVersion: number, actor: string): Promise<void> {
  await db.transaction(async t => {
    const tx = t as unknown as Database;
    const [draft] = await tx.select().from(roomDrafts).where(eq(roomDrafts.id, draftId));
    if (!draft) throw new NotFoundError();
    waitingDraft(draft, expectedVersion);
    if (!(await setAsideMarks(tx, draft.levelId)).has(draft.id)) {
      throw new DraftRefusedError(`${draft.nameEn} isn't set aside now, so there is nothing to take back.`);
    }
    await recordAudit(tx, "roomDraft", draft.id, UNSET_ASIDE, actor, null, {
      id: draft.id, levelId: draft.levelId, nameEn: draft.nameEn, version: draft.version,
    });
  });
}
