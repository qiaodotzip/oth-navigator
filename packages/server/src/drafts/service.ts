import { randomUUID } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { RoomDraftInputSchema, type DraftSource, type RoomKind } from "@oth/model";
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

/** A floor's drafts still waiting for review, largest first, as the script ordered them. */
export async function listDrafts(db: Database, levelId: string): Promise<Row[]> {
  const rows = await db.select().from(roomDrafts).where(and(
    eq(roomDrafts.levelId, levelId), isNull(roomDrafts.deletedAt), isNull(roomDrafts.acceptedRoomId),
  ));
  return rows.map(r => toModelRow(r as unknown as Row)).sort((a, b) => Number(b.areaM2) - Number(a.areaM2));
}

/**
 * A new search's drafts in place of the floor's old ones, in one transaction.
 * Accepted drafts are rooms now and are not touched. The old live ones are
 * retired together, at one moment, like every batch removal here.
 */
export async function replaceDrafts(
  db: Database, levelId: string, source: DraftSource, inputs: readonly unknown[], actor: string,
): Promise<Row[]> {
  return db.transaction(async t => {
    const tx = t as unknown as Database;
    await liveLevel(tx, levelId);
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

async function acceptInOne(db: Database, items: readonly AcceptItem[], actor: string): Promise<Accepted[]> {
  return db.transaction(async t => {
    const tx = t as unknown as Database;
    const taken = new Set((await tx.select({ id: rooms.id }).from(rooms)).map(r => r.id));
    const out: Accepted[] = [];
    for (const item of items) {
      const [draft] = await tx.select().from(roomDrafts).where(eq(roomDrafts.id, item.id));
      if (!draft) throw new NotFoundError();
      if (draft.acceptedRoomId) throw new DraftRefusedError(`${draft.nameEn} is on the map already.`);
      if (draft.deletedAt) {
        throw new DraftRefusedError(`${draft.nameEn} is no longer waiting for review: it was rejected, or the drawing was searched again.`);
      }
      // The draft's version is the check that matters, so it comes before anything is written.
      if (draft.version !== item.expectedVersion) throw new VersionConflictError(toModelRow(draft as unknown as Row));
      if (!draft.footprint) {
        throw new DraftRefusedError(`${draft.nameEn} is left open on the drawing, so it has no shape to add. Draw it by hand.`);
      }
      const level = await liveLevel(tx, draft.levelId);
      const nameEn = item.nameEn?.trim() || draft.nameEn;
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
};
export type DraftTally = { waiting: number; accepted: number; rejectedOrSetAside: number };

/*
 * How a search is told apart. One search is one transaction (replaceDrafts),
 * and audit_log.at defaults to Postgres's now(), which is the same for the
 * whole of a transaction. So the drafts a search made share their create
 * rows' at, and a draft it retired has its delete row at that same moment.
 * Both are compared in SQL, to the microsecond; a JavaScript Date keeps only
 * the millisecond.
 */
const SEARCH_MOMENTS = (levelId: string) => sql`(
  select a.at from audit_log a join room_drafts s on s.id = a.entity_id
  where a.entity_type = 'roomDraft' and a.action = 'create' and s.level_id = ${levelId}
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
  return rows.map(r => ({ ...r, deletedAt: r.deletedAt ? r.deletedAt.toISOString() : null, retired: Boolean(r.retired) }));
}

/** The drafts of the floor's latest Find rooms alone: those whose create row has the newest search moment. */
export async function latestSearch(db: Database, levelId: string): Promise<DraftRow[]> {
  const rows = await db.select({
    id: roomDrafts.id, nameEn: roomDrafts.nameEn, acceptedRoomId: roomDrafts.acceptedRoomId, deletedAt: roomDrafts.deletedAt,
  })
    .from(roomDrafts)
    .innerJoin(auditLog, and(eq(auditLog.entityType, "roomDraft"), eq(auditLog.action, "create"), eq(auditLog.entityId, roomDrafts.id)))
    .where(and(
      eq(roomDrafts.levelId, levelId),
      sql`${auditLog.at} = (
        select max(a.at) from audit_log a join room_drafts d on d.id = a.entity_id
        where a.entity_type = 'roomDraft' and a.action = 'create' and d.level_id = ${levelId}
      )`,
    ));
  // Nothing has searched after the latest search, so none of its drafts is retired.
  return rows.map(r => ({ ...r, deletedAt: r.deletedAt ? r.deletedAt.toISOString() : null, retired: false }));
}

/** Waiting, accepted, and rejected or set aside. A draft a search retired is none of those, and isn't counted. */
export function tallyDrafts(rows: readonly DraftRow[]): DraftTally {
  return {
    waiting: rows.filter(r => r.deletedAt === null).length,
    accepted: rows.filter(r => r.acceptedRoomId !== null).length,
    rejectedOrSetAside: rows.filter(r => r.deletedAt !== null && r.acceptedRoomId === null && !r.retired).length,
  };
}

/** The audit action that marks a draft set aside for a person, beside its delete (spec §8's check step reads it). */
export const SET_ASIDE = "set-aside";

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
};
export type Decided = { accepted: (Accepted & { nameEn: string })[]; rejected: string[]; setAside: string[] };

/**
 * Claude's decide_drafts (spec §7.2): one floor's accepts, rejects and
 * set-asides, all or none. Accepts go through acceptDrafts, as the Accept
 * button's do, so their Undo is the same. A reject and a set-aside are both
 * the soft delete Build's Reject and Done make; a set-aside also leaves a
 * SET_ASIDE row in the audit log, so the check step can say a person should
 * decide it. Every draft is checked to be on this floor before anything is
 * written: a tool touches only the floor it is given.
 */
export async function decideDrafts(db: Database, levelId: string, items: readonly DraftDecision[], actor: string): Promise<Decided> {
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.id)) throw new DraftRefusedError(`Draft ${item.id} is in the list twice. Decide each draft once.`);
    seen.add(item.id);
  }
  return db.transaction(async t => {
    const tx = t as unknown as Database;
    const level = await liveLevel(tx, levelId);
    const drafts = new Map<string, typeof roomDrafts.$inferSelect>();
    for (const item of items) {
      const [draft] = await tx.select().from(roomDrafts).where(eq(roomDrafts.id, item.id));
      if (!draft) throw new DraftRefusedError(`There is no draft ${item.id}. list_drafts gives ${level.code}'s.`);
      if (draft.levelId !== levelId) {
        throw new DraftRefusedError(`Draft ${item.id} is not on ${level.code}. decide_drafts decides one floor's drafts at a time.`);
      }
      drafts.set(draft.id, draft);
    }

    const accepts = items.filter(i => i.decision === "accept");
    // A savepoint inside this transaction: its refusal takes the rejects back too.
    const made = accepts.length === 0 ? [] : await acceptDrafts(tx, accepts.map(({ id, expectedVersion, nameEn, kind }) => ({
      id, expectedVersion, ...(nameEn ? { nameEn } : {}), ...(kind ? { kind } : {}),
    })), actor);
    const nameOf = new Map(accepts.map(a => [a.id, a.nameEn?.trim() || drafts.get(a.id)!.nameEn]));

    const at = new Date();
    const rejected: string[] = [];
    const setAside: string[] = [];
    for (const item of items) {
      if (item.decision === "accept") continue;
      const draft = drafts.get(item.id)!;
      if (draft.acceptedRoomId) throw new DraftRefusedError(`${draft.nameEn} is on the map already.`);
      if (draft.deletedAt) {
        throw new DraftRefusedError(`${draft.nameEn} is no longer waiting for review: it was rejected, or the drawing was searched again.`);
      }
      if (draft.version !== item.expectedVersion) throw new VersionConflictError(toModelRow(draft as unknown as Row));
      await softDeleteEntity(tx, "roomDraft", draft.id, draft.version, actor, at);
      if (item.decision === "set_aside") {
        await recordAudit(tx, "roomDraft", draft.id, SET_ASIDE, actor, null, { id: draft.id, levelId, nameEn: draft.nameEn });
        setAside.push(draft.nameEn);
      } else {
        rejected.push(draft.nameEn);
      }
    }
    return { accepted: made.map(a => ({ ...a, nameEn: nameOf.get(a.draftId)! })), rejected, setAside };
  });
}
