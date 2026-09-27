import { and, eq, inArray, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../app";
import { requireUser } from "../auth/middleware";
import type { Database } from "../db/client";
import type { Row } from "../db/rows";
import { places, sightings } from "../db/schema";
import {
  NotDeletedError, NotFoundError, VersionConflictError,
  restoreEntity, softDeleteEntity, updateEntity,
} from "../entities/repository";

const Version = z.number().int().nonnegative();

const AcceptBody = z.object({
  expectedVersion: Version,
  nameEn: z.string().trim().min(1),
  category: z.string(),
  /** Files a place that has no floor of its own under the floor it was reviewed on. */
  levelId: z.string().min(1).optional(),
});
const RejectBody = z.object({ expectedVersion: Version });
const ReopenBody = z.object({
  expectedVersion: Version,
  nameEn: z.string().trim().min(1),
  category: z.string(),
  levelId: z.string().min(1).nullable(),
  sightingIds: z.array(z.string().min(1)),
});

/**
 * Accept or reject what a labelling agent proposed, place and sightings as one.
 *
 * The review queue used to do this as one request per sighting, each followed
 * by a full reload of the model — a dozen round trips for a place seen in
 * eleven frames, with 185 places waiting. It is also one claim, so it commits
 * or fails as one: a stale version leaves every row as it was.
 *
 * Every decision here has an exact undo (spec §10): reject is undone by the
 * generic restore, which brings back the tags that share the place's
 * deletion moment; accept by `reopen`; merge by `unmerge`.
 */
export const placeReviewRoutes = new Hono<AppEnv>();
placeReviewRoutes.use("*", requireUser);

async function sightingsOf(db: Database, placeId: string) {
  return db.select().from(sightings)
    .where(and(eq(sightings.placeId, placeId), isNull(sightings.deletedAt)));
}

function failure(err: unknown) {
  if (err instanceof VersionConflictError) {
    return { body: { error: "version conflict", current: err.current }, status: 409 as const };
  }
  if (err instanceof NotFoundError) return { body: { error: "not found" }, status: 404 as const };
  if (err instanceof NotDeletedError) return { body: { error: "not deleted" }, status: 422 as const };
  return { body: { error: "invalid", detail: String(err) }, status: 422 as const };
}

placeReviewRoutes.post("/:id/accept", async c => {
  const body = AcceptBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: "expected { expectedVersion, nameEn, category }" }, 400);
  const actor = c.get("user").id;
  const id = c.req.param("id");
  const { expectedVersion, nameEn, category, levelId } = body.data;
  try {
    const confirmed = await c.get("db").transaction(async t => {
      const tx = t as unknown as Database;
      await updateEntity(tx, "place", id, expectedVersion, {
        status: "confirmed", nameEn, category, ...(levelId ? { levelId } : {}),
      }, actor);
      // Only what was still a claim. A tag someone typed is theirs already,
      // and Undo has to know exactly which tags this accept changed.
      const claims = (await sightingsOf(tx, id)).filter(s => s.status === "proposed");
      for (const s of claims) {
        await updateEntity(tx, "sighting", s.id, s.version, { status: "confirmed" }, actor);
      }
      return claims.map(s => s.id);
    });
    return c.json({ sightings: confirmed.length, confirmed });
  } catch (err) {
    const { body: out, status } = failure(err);
    return c.json(out, status);
  }
});

placeReviewRoutes.post("/:id/reject", async c => {
  const body = RejectBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: "expected { expectedVersion }" }, 400);
  const actor = c.get("user").id;
  const id = c.req.param("id");
  try {
    const count = await c.get("db").transaction(async t => {
      const tx = t as unknown as Database;
      // Soft, like every removal, and one moment for the place and its tags:
      // that moment is how the restore that undoes this finds them again.
      const at = new Date();
      await softDeleteEntity(tx, "place", id, body.data.expectedVersion, actor, at);
      const seen = await sightingsOf(tx, id);
      for (const s of seen) await softDeleteEntity(tx, "sighting", s.id, s.version, actor, at);
      return seen.length;
    });
    return c.json({ sightings: count });
  } catch (err) {
    const { body: out, status } = failure(err);
    return c.json(out, status);
  }
});

/**
 * Undoes an accept: the place goes back in the queue with the name, category
 * and floor it had, and the tags that accept confirmed go back to being
 * claims. Tags confirmed any other way are left alone, which is why the
 * caller names them.
 */
placeReviewRoutes.post("/:id/reopen", async c => {
  const body = ReopenBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) {
    return c.json({ error: "expected { expectedVersion, nameEn, category, levelId, sightingIds }" }, 400);
  }
  const actor = c.get("user").id;
  const id = c.req.param("id");
  const { expectedVersion, nameEn, category, levelId, sightingIds } = body.data;
  try {
    const count = await c.get("db").transaction(async t => {
      const tx = t as unknown as Database;
      // A null levelId clears it, which is how a place that had no floor gets none back.
      await updateEntity(tx, "place", id, expectedVersion, { status: "proposed", nameEn, category, levelId }, actor);
      if (sightingIds.length === 0) return 0;
      const named = await tx.select().from(sightings).where(and(
        eq(sightings.placeId, id), isNull(sightings.deletedAt), inArray(sightings.id, sightingIds),
      ));
      for (const s of named) {
        if (s.status === "confirmed") {
          await updateEntity(tx, "sighting", s.id, s.version, { status: "proposed" }, actor);
        }
      }
      return named.length;
    });
    return c.json({ sightings: count });
  } catch (err) {
    const { body: out, status } = failure(err);
    return c.json(out, status);
  }
});

/**
 * Brings back a rejected place with the tags rejected with it.
 *
 * Reject stamps the place and its tags with one moment, so that moment is how
 * the right tags come back: one removed by hand before has an older stamp and
 * stays removed. One transaction, like the reject. Used by the generic
 * restore route, so an Undo needs no special case on the client.
 */
export async function restorePlace(
  db: Database, id: string, expectedVersion: number, actorId: string,
): Promise<{ entity: Row; sightings: number }> {
  return db.transaction(async t => {
    const tx = t as unknown as Database;
    const [row] = await tx.select().from(places).where(eq(places.id, id));
    if (!row) throw new NotFoundError();
    // Refuses anything not deleted, or touched since, before a tag is touched.
    const entity = await restoreEntity(tx, "place", id, expectedVersion, actorId);
    const binned = await tx.select().from(sightings)
      .where(and(eq(sightings.placeId, id), eq(sightings.deletedAt, row.deletedAt!)));
    for (const s of binned) await restoreEntity(tx, "sighting", s.id, s.version, actorId);
    return { entity, sightings: binned.length };
  });
}
