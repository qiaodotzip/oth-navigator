import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../app";
import { requireUser } from "../auth/middleware";
import { SETUP_STATUSES, UnknownFloorError, getSetup, setStep } from "./service";
import { isSetupStep } from "./steps";

const StepBody = z.object({ status: z.enum(SETUP_STATUSES), note: z.string().max(500).optional() });

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
