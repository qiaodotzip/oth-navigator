import { randomUUID } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { Database } from "../db/client";
import type { Row } from "../db/rows";
import { stripAuditFields, toModelRow } from "../db/rows";
import { auditLog } from "../db/schema";
import { entityRegistry, type EntityType } from "./registry";
import { currentVia } from "./via";

export class VersionConflictError extends Error {
  constructor(public readonly current: Row | null) {
    super("version conflict");
    this.name = "VersionConflictError";
  }
}

export class NotFoundError extends Error {
  constructor() {
    super("not found");
    this.name = "NotFoundError";
  }
}

/**
 * One row of the audit log. Exported for the writes that are not generic
 * entities — a keyframe arrives as bytes and has its own routes — so they are
 * on the record like everything else.
 */
export async function recordAudit(
  db: Database, entityType: string, entityId: string, action: string,
  actorId: string | null, before: Row | null, after: Row | null,
): Promise<void> {
  await db.insert(auditLog).values({
    id: `audit_${randomUUID()}`,
    entityType,
    entityId,
    action,
    actorId,
    before: before ? toModelRow(before) : null,
    after: after ? toModelRow(after) : null,
    via: currentVia(),
  });
}

async function findRow(db: Database, type: EntityType, id: string): Promise<Row | null> {
  const { table } = entityRegistry[type];
  const rows = (await db.select().from(table).where(eq(table.id, id))) as Row[];
  return rows[0] ?? null;
}

export async function listEntities(db: Database, type: EntityType): Promise<Row[]> {
  const { table } = entityRegistry[type];
  return (await db.select().from(table).where(isNull(table.deletedAt))) as Row[];
}

/** Validates through the model's schema before touching the database. */
export async function createEntity(
  db: Database, type: EntityType, data: unknown, actorId: string | null,
): Promise<Row> {
  const { table, schema } = entityRegistry[type];
  const parsed = schema.parse(data) as Row;
  const id = String(parsed.id);

  await db.insert(table).values({
    ...stripAuditFields(parsed),
    version: 0,
    updatedBy: actorId,
    updatedAt: new Date(),
  } as never);

  const row = await findRow(db, type, id);
  await recordAudit(db, type, id, "create", actorId, null, row);
  return row as Row;
}

/**
 * `WHERE id = ? AND version = ?` — a miss means someone else wrote first, and
 * the caller gets their state back rather than silently losing the edit.
 */
export async function updateEntity(
  db: Database, type: EntityType, id: string,
  expectedVersion: number, patch: Row, actorId: string | null,
): Promise<Row> {
  const { table, schema } = entityRegistry[type];

  const before = await findRow(db, type, id);
  if (!before || before.deletedAt != null) throw new NotFoundError();

  // An explicit null in a patch means "clear this field". The model spells
  // absence as undefined and would reject the null, and Drizzle ignores an
  // undefined in `set()`, so neither alone can empty a column — hence the two
  // halves: the merge drops the key so the schema can object if it was
  // required, and the write puts the null in.
  const cleared = Object.keys(patch).filter(k => patch[k] === null && k !== "deletedAt");
  const input: Row = { ...toModelRow(before), ...patch, id };
  for (const key of cleared) delete input[key];
  const merged = schema.parse(input) as Row;

  const updated = (await db
    .update(table)
    .set({
      ...stripAuditFields(merged),
      ...Object.fromEntries(cleared.map(key => [key, null])),
      version: sql`${table.version} + 1`,
      updatedBy: actorId,
      updatedAt: new Date(),
    } as never)
    .where(and(eq(table.id, id), eq(table.version, expectedVersion)))
    .returning()) as Row[];

  const after = updated[0];
  if (!after) throw new VersionConflictError(toModelRow(before));

  await recordAudit(db, type, id, "update", actorId, before, after);
  return after;
}

/**
 * `at` lets several rows share one deletion moment, which is how an Undo later
 * finds exactly the rows retired together: a frame and its tags, a rejected
 * place and its tags.
 */
export async function softDeleteEntity(
  db: Database, type: EntityType, id: string, expectedVersion: number, actorId: string | null,
  at: Date = new Date(),
): Promise<Row> {
  const { table } = entityRegistry[type];

  const before = await findRow(db, type, id);
  if (!before) throw new NotFoundError();

  const updated = (await db
    .update(table)
    .set({
      deletedAt: at,
      version: sql`${table.version} + 1`,
      updatedBy: actorId,
      updatedAt: at,
    } as never)
    .where(and(eq(table.id, id), eq(table.version, expectedVersion)))
    .returning()) as Row[];

  const after = updated[0];
  if (!after) throw new VersionConflictError(toModelRow(before));

  await recordAudit(db, type, id, "delete", actorId, before, after);
  return after;
}

export class NotDeletedError extends Error {
  constructor() {
    super("not deleted");
    this.name = "NotDeletedError";
  }
}

/**
 * Brings back a soft-deleted entity — the other half of every Undo.
 *
 * Version-checked like any write: if someone has touched it since the delete,
 * the restore is refused with their state, rather than overwriting what they did.
 */
export async function restoreEntity(
  db: Database, type: EntityType, id: string, expectedVersion: number, actorId: string | null,
): Promise<Row> {
  const { table } = entityRegistry[type];

  const before = await findRow(db, type, id);
  if (!before) throw new NotFoundError();
  if (before.deletedAt == null) throw new NotDeletedError();

  const updated = (await db
    .update(table)
    .set({
      deletedAt: null,
      version: sql`${table.version} + 1`,
      updatedBy: actorId,
      updatedAt: new Date(),
    } as never)
    .where(and(eq(table.id, id), eq(table.version, expectedVersion)))
    .returning()) as Row[];

  const after = updated[0];
  if (!after) throw new VersionConflictError(toModelRow(before));

  await recordAudit(db, type, id, "restore", actorId, before, after);
  return after;
}
