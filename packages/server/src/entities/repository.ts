import { randomUUID } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { Database } from "../db/client";
import type { Row } from "../db/rows";
import { stripAuditFields, toModelRow } from "../db/rows";
import { auditLog } from "../db/schema";
import { entityRegistry, type EntityType } from "./registry";

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

async function audit(
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
  await audit(db, type, id, "create", actorId, null, row);
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

  // Re-validate the merged result: a patch cannot produce a shape the model rejects.
  const merged = schema.parse({ ...toModelRow(before), ...patch, id }) as Row;

  const updated = (await db
    .update(table)
    .set({
      ...stripAuditFields(merged),
      version: sql`${table.version} + 1`,
      updatedBy: actorId,
      updatedAt: new Date(),
    } as never)
    .where(and(eq(table.id, id), eq(table.version, expectedVersion)))
    .returning()) as Row[];

  const after = updated[0];
  if (!after) throw new VersionConflictError(toModelRow(before));

  await audit(db, type, id, "update", actorId, before, after);
  return after;
}

export async function softDeleteEntity(
  db: Database, type: EntityType, id: string, expectedVersion: number, actorId: string | null,
): Promise<Row> {
  const { table } = entityRegistry[type];

  const before = await findRow(db, type, id);
  if (!before) throw new NotFoundError();

  const updated = (await db
    .update(table)
    .set({
      deletedAt: new Date(),
      version: sql`${table.version} + 1`,
      updatedBy: actorId,
      updatedAt: new Date(),
    } as never)
    .where(and(eq(table.id, id), eq(table.version, expectedVersion)))
    .returning()) as Row[];

  const after = updated[0];
  if (!after) throw new VersionConflictError(toModelRow(before));

  await audit(db, type, id, "delete", actorId, before, after);
  return after;
}
