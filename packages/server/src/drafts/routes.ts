import { DraftSourceSchema, RoomKindSchema } from "@oth/model";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z, ZodError } from "zod";
import type { AppEnv } from "../app";
import { requireUser } from "../auth/middleware";
import { NotFoundError, VersionConflictError } from "../entities/repository";
import {
  DraftRefusedError, MAX_DRAFTS, RoomIdTakenError, acceptDrafts, floorLineUp, listDrafts, replaceDrafts, unacceptDrafts,
} from "./service";

const Version = z.number().int().nonnegative();
const ReplaceBody = z.object({ source: DraftSourceSchema, drafts: z.array(z.unknown()) });
const AcceptOne = z.object({
  expectedVersion: Version,
  nameEn: z.string().trim().min(1).max(200).optional(),
  kind: RoomKindSchema.optional(),
});
const AcceptMany = z.object({ items: z.array(AcceptOne.extend({ id: z.string().min(1) })).min(1).max(MAX_DRAFTS) });
const UnacceptOne = z.object({ expectedVersion: Version, roomVersion: Version });
const UnacceptMany = z.object({ items: z.array(UnacceptOne.extend({ id: z.string().min(1) })).min(1).max(MAX_DRAFTS) });

/**
 * The answer for a failure the request caused. Anything else is rethrown, so
 * onError answers 500 and the client offers Retry.
 */
function failure(err: unknown) {
  if (err instanceof VersionConflictError) {
    return { body: { error: "version conflict", current: err.current }, status: 409 as const };
  }
  if (err instanceof RoomIdTakenError) return { body: { error: err.message, current: null }, status: 409 as const };
  if (err instanceof NotFoundError) return { body: { error: "not found" }, status: 404 as const };
  if (err instanceof DraftRefusedError) return { body: { error: err.message }, status: 422 as const };
  if (err instanceof ZodError) return { body: { error: "invalid draft", detail: String(err) }, status: 422 as const };
  throw err;
}

/** Mounted at /api/levels. */
export const levelDraftRoutes = new Hono<AppEnv>();
levelDraftRoutes.use("*", requireUser);

/**
 * The floor's waiting drafts, and lineUp when the drawing doesn't line up with
 * the rooms already on the floor (contract v3), or linedUp when it does (v4).
 */
levelDraftRoutes.get("/:id/drafts", async c => {
  const db = c.get("db");
  const levelId = c.req.param("id");
  const drafts = await listDrafts(db, levelId);
  const { lineUp, linedUp } = await floorLineUp(db, levelId, drafts);
  return c.json({ drafts, ...(lineUp ? { lineUp } : {}), ...(linedUp ? { linedUp } : {}) });
});

levelDraftRoutes.put(
  "/:id/drafts",
  bodyLimit({ maxSize: 2 * 1024 * 1024, onError: c => c.json({ error: "Too much to save at once: the drafts are over 2 MB." }, 413) }),
  async c => {
    const body = ReplaceBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "expected { source, drafts }" }, 400);
    if (body.data.drafts.length > MAX_DRAFTS) {
      return c.json({ error: `At most ${MAX_DRAFTS.toLocaleString("en")} drafts at once.` }, 422);
    }
    try {
      const drafts = await replaceDrafts(c.get("db"), c.req.param("id"), body.data.source, body.data.drafts, c.get("user").id);
      return c.json({ drafts });
    } catch (err) {
      const { body: out, status } = failure(err);
      return c.json(out, status);
    }
  },
);

/** Mounted at /api/room-drafts. Reject and its undo are the generic entity delete and restore. */
export const roomDraftRoutes = new Hono<AppEnv>();
roomDraftRoutes.use("*", requireUser);

roomDraftRoutes.post("/accept", async c => {
  const body = AcceptMany.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: "expected { items: [{ id, expectedVersion }] }" }, 400);
  try {
    return c.json({ accepted: await acceptDrafts(c.get("db"), body.data.items, c.get("user").id) });
  } catch (err) {
    const { body: out, status } = failure(err);
    return c.json(out, status);
  }
});

roomDraftRoutes.post("/unaccept", async c => {
  const body = UnacceptMany.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: "expected { items: [{ id, expectedVersion, roomVersion }] }" }, 400);
  try {
    return c.json({ drafts: await unacceptDrafts(c.get("db"), body.data.items, c.get("user").id) });
  } catch (err) {
    const { body: out, status } = failure(err);
    return c.json(out, status);
  }
});

roomDraftRoutes.post("/:id/accept", async c => {
  const body = AcceptOne.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: "expected { expectedVersion }" }, 400);
  try {
    const [accepted] = await acceptDrafts(c.get("db"), [{ id: c.req.param("id"), ...body.data }], c.get("user").id);
    return c.json({ accepted });
  } catch (err) {
    const { body: out, status } = failure(err);
    return c.json(out, status);
  }
});

roomDraftRoutes.post("/:id/unaccept", async c => {
  const body = UnacceptOne.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: "expected { expectedVersion, roomVersion }" }, 400);
  try {
    return c.json({ drafts: await unacceptDrafts(c.get("db"), [{ id: c.req.param("id"), ...body.data }], c.get("user").id) });
  } catch (err) {
    const { body: out, status } = failure(err);
    return c.json(out, status);
  }
});
