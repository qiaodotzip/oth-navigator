import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../app";
import { requireUser } from "../auth/middleware";
import { listClaudeChanges } from "./changes";
import { SETUP_STATUSES, UnknownFloorError, getSetup, requireLevel, setStep } from "./service";
import { isSetupStep } from "./steps";

const StepBody = z.object({ status: z.enum(SETUP_STATUSES), note: z.string().max(500).optional() });

/**
 * `new Date("1")` parses to a real (bogus) date rather than an invalid one —
 * legacy, non-ISO fallback parsing — so `since` must look like an ISO
 * date-time up front, not just survive `new Date(...)`.
 */
const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T/;

/**
 * Mounted at /api/levels, beside the drafts' routes. Each route takes
 * requireUser itself: a token reaches /mcp and nothing else, so only a
 * signed-in person reads or marks a setup here.
 */
export const setupRoutes = new Hono<AppEnv>();

setupRoutes.get("/:id/setup", requireUser, async c => {
  try {
    return c.json(await getSetup(c.get("db"), c.req.param("id")));
  } catch (err) {
    if (err instanceof UnknownFloorError) return c.json({ error: err.message }, 404);
    throw err;
  }
});

setupRoutes.put("/:id/setup/:step", requireUser, async c => {
  const step = c.req.param("step");
  if (!isSetupStep(step)) return c.json({ error: "There is no such setup step." }, 400);
  const body = StepBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: "expected { status: open, done or skipped, note? }" }, 400);
  const db = c.get("db");
  try {
    await setStep(db, c.req.param("id"), step, body.data, c.get("user").id, null);
    return c.json(await getSetup(db, c.req.param("id")));
  } catch (err) {
    if (err instanceof UnknownFloorError) return c.json({ error: err.message }, 404);
    throw err;
  }
});

setupRoutes.get("/:id/claude-changes", requireUser, async c => {
  const db = c.get("db");
  const levelId = c.req.param("id");
  // Plan 6E always sends since: the epoch for every change, or when step 2 began.
  const rawSince = c.req.query("since");
  const since = rawSince !== undefined && ISO_DATETIME.test(rawSince) ? new Date(rawSince) : null;
  if (!since || Number.isNaN(since.getTime())) {
    return c.json({ error: "since is a date and time, such as 1970-01-01T00:00:00.000Z for every change." }, 400);
  }
  const rawLimit = c.req.query("limit");
  const limit = rawLimit === undefined ? undefined : Number(rawLimit);
  if (limit !== undefined && !(Number.isInteger(limit) && limit >= 1 && limit <= 1000)) {
    return c.json({ error: "limit is a whole number from 1 to 1000." }, 400);
  }
  try {
    await requireLevel(db, levelId);
    return c.json({ changes: await listClaudeChanges(db, levelId, since, limit) });
  } catch (err) {
    if (err instanceof UnknownFloorError) return c.json({ error: err.message }, 404);
    throw err;
  }
});
