import { and, eq, gt } from "drizzle-orm";
import type { Database } from "../db/client";
import { entityLocks, users } from "../db/schema";

export type Lock = {
  entityType: string;
  entityId: string;
  lockedBy: string;
  lockedAt: Date;
  expiresAt: Date;
};

/**
 * A lock as someone else sees it.
 *
 * Only the listing carries the holder's name: whoever just acquired one is the
 * holder and already knows who they are, while a teammate shown a raw user id
 * learns nothing at all.
 */
export type HeldLock = Lock & { lockedByName: string };

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

export async function activeLocks(db: Database): Promise<HeldLock[]> {
  const rows = await db
    .select({ lock: entityLocks, displayName: users.displayName })
    .from(entityLocks)
    // A left join, so a lock held by a since-removed user still lists rather
    // than vanishing and leaving the entity looking free.
    .leftJoin(users, eq(entityLocks.lockedBy, users.id))
    .where(gt(entityLocks.expiresAt, new Date()));

  return rows.map(r => ({ ...r.lock, lockedByName: r.displayName ?? r.lock.lockedBy }));
}
