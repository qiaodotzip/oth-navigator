import { and, eq, isNull, sql } from "drizzle-orm";
import type { Database } from "../db/client";
import type { Row } from "../db/rows";
import { toModelRow } from "../db/rows";
import { keyframes, sightings } from "../db/schema";
import { VersionConflictError, recordAudit, restoreEntity, softDeleteEntity } from "../entities/repository";

export type Binned = { sightings: number } | "missing" | "already";
export type Restored = { sightings: number } | "missing" | "not-deleted";

/**
 * Retires a frame and everything said about it. Lifted from the route so
 * that Claude Code's delete does exactly what Survey's bin does.
 *
 * A soft delete, like every other removal here, so a frame binned by
 * mistake is recoverable. The sightings go with it: a label pointing at a
 * frame nobody can see is worse than no label, because it still counts
 * toward a place.
 *
 * One transaction and one moment for the lot, each row one version on and
 * in the audit log. The shared moment is how Undo finds exactly these
 * sightings again, so a frame already binned is left alone: a second stamp
 * would strand the tags binned with the first. With `expectedVersion`, a
 * frame changed since is refused with its current state.
 */
export async function binFrame(db: Database, id: string, actorId: string, expectedVersion?: number): Promise<Binned> {
  return db.transaction(async t => {
    const tx = t as unknown as Database;
    const [before] = await tx.select().from(keyframes).where(eq(keyframes.id, id));
    if (!before) return "missing";
    if (before.deletedAt) return "already";
    if (expectedVersion !== undefined && before.version !== expectedVersion) {
      throw new VersionConflictError(toModelRow(before as Row));
    }

    const at = new Date();
    const tagged = await tx.select().from(sightings)
      .where(and(eq(sightings.keyframeId, id), isNull(sightings.deletedAt)));
    for (const s of tagged) await softDeleteEntity(tx, "sighting", s.id, s.version, actorId, at);

    const [after] = await tx.update(keyframes)
      .set({ deletedAt: at, version: sql`${keyframes.version} + 1`, updatedBy: actorId, updatedAt: at })
      .where(and(eq(keyframes.id, id), eq(keyframes.version, before.version)))
      .returning();
    if (!after) throw new VersionConflictError(toModelRow(before as Row));
    await recordAudit(tx, "keyframe", id, "delete", actorId, before as Row, after as Row);
    return { sightings: tagged.length };
  });
}

/**
 * Undoes binning a frame. The frame and its sightings were retired at one
 * moment, so that moment is how the right sightings come back: a tag
 * removed by hand earlier has an older one, and stays removed. On the
 * record and in one transaction, like the bin.
 */
export async function restoreFrame(db: Database, id: string, actorId: string, expectedVersion?: number): Promise<Restored> {
  return db.transaction(async t => {
    const tx = t as unknown as Database;
    const [before] = await tx.select().from(keyframes).where(eq(keyframes.id, id));
    if (!before) return "missing";
    if (!before.deletedAt) return "not-deleted";
    if (expectedVersion !== undefined && before.version !== expectedVersion) {
      throw new VersionConflictError(toModelRow(before as Row));
    }

    const binned = await tx.select().from(sightings)
      .where(and(eq(sightings.keyframeId, id), eq(sightings.deletedAt, before.deletedAt)));
    for (const s of binned) await restoreEntity(tx, "sighting", s.id, s.version, actorId);

    const [after] = await tx.update(keyframes)
      .set({ deletedAt: null, version: sql`${keyframes.version} + 1`, updatedBy: actorId, updatedAt: new Date() })
      .where(and(eq(keyframes.id, id), eq(keyframes.version, before.version)))
      .returning();
    if (!after) throw new VersionConflictError(toModelRow(before as Row));
    await recordAudit(tx, "keyframe", id, "restore", actorId, before as Row, after as Row);
    return { sightings: binned.length };
  });
}
