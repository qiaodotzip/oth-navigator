import { and, eq, gt } from "drizzle-orm";
import type { Database } from "../db/client";
import { entityLocks } from "../db/schema";

export type Lock = {
  entityType: string;
  entityId: string;
  lockedBy: string;
  lockedAt: Date;
  expiresAt: Date;
};

/**
 * Advisory only. Optimistic locking on `version` is the real correctness
 * guarantee; this just stops two people starting the same edit, which is what
 * actually happens in practice.
 */
export async function acquireLock(
  db: Database, entityType: string, entityId: string, userId: string, ttlSeconds: number,
): Promise<Lock | null> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);
  const where = and(eq(entityLocks.entityType, entityType), eq(entityLocks.entityId, entityId));

  const existing = (await db.select().from(entityLocks).where(where))[0];

  if (existing && existing.expiresAt.getTime() > now.getTime() && existing.lockedBy !== userId) {
    return null;
  }

  if (existing) {
    const [row] = await db.update(entityLocks)
      .set({ lockedBy: userId, lockedAt: now, expiresAt })
      .where(where)
      .returning();
    return row ?? null;
  }

  const [row] = await db.insert(entityLocks)
    .values({ entityType, entityId, lockedBy: userId, lockedAt: now, expiresAt })
    .returning();
  return row ?? null;
}

export async function releaseLock(
  db: Database, entityType: string, entityId: string, userId: string,
): Promise<boolean> {
  const rows = await db.delete(entityLocks)
    .where(and(
      eq(entityLocks.entityType, entityType),
      eq(entityLocks.entityId, entityId),
      eq(entityLocks.lockedBy, userId),
    ))
    .returning();
  return rows.length > 0;
}

export async function activeLocks(db: Database): Promise<Lock[]> {
  return db.select().from(entityLocks).where(gt(entityLocks.expiresAt, new Date()));
}
