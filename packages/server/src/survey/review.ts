import { and, eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../app";
import { requireUser } from "../auth/middleware";
import type { Database } from "../db/client";
import { sightings } from "../db/schema";
import {
  NotFoundError, VersionConflictError, softDeleteEntity, updateEntity,
} from "../entities/repository";

const AcceptBody = z.object({
  expectedVersion: z.number().int().nonnegative(),
  nameEn: z.string().trim().min(1),
  category: z.string(),
});
const RejectBody = z.object({ expectedVersion: z.number().int().nonnegative() });

/**
 * Accept or reject what a labelling agent proposed, place and sightings as one.
 *
 * The review queue used to do this as one request per sighting, each followed
 * by a full reload of the model — a dozen round trips for a place seen in
 * eleven frames, with 185 places waiting. It is also one claim, so it commits
 * or fails as one: a stale version leaves every row as it was.
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
  return { body: { error: "invalid", detail: String(err) }, status: 422 as const };
}

placeReviewRoutes.post("/:id/accept", async c => {
  const body = AcceptBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: "expected { expectedVersion, nameEn, category }" }, 400);
  const actor = c.get("user").id;
  const id = c.req.param("id");
  try {
    const count = await c.get("db").transaction(async t => {
      const tx = t as unknown as Database;
      await updateEntity(tx, "place", id, body.data.expectedVersion, {
        status: "confirmed", nameEn: body.data.nameEn, category: body.data.category,
      }, actor);
      const seen = await sightingsOf(tx, id);
      for (const s of seen) {
        await updateEntity(tx, "sighting", s.id, s.version, { status: "confirmed" }, actor);
      }
      return seen.length;
    });
    return c.json({ sightings: count });
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
      // Soft, like every removal: a wrong reject is recoverable from the audit log.
      await softDeleteEntity(tx, "place", id, body.data.expectedVersion, actor);
      const seen = await sightingsOf(tx, id);
      for (const s of seen) await softDeleteEntity(tx, "sighting", s.id, s.version, actor);
      return seen.length;
    });
    return c.json({ sightings: count });
  } catch (err) {
    const { body: out, status } = failure(err);
    return c.json(out, status);
  }
});
