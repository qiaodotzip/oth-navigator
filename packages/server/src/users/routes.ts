import { randomUUID } from "node:crypto";
import { isNull } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../app";
import { requireUser } from "../auth/middleware";
import { DuplicateNameError, inviteUser } from "../cli/invite";
import type { Database } from "../db/client";
import { auditLog, users } from "../db/schema";

const InviteBody = z.object({ displayName: z.string().trim().min(1).max(80) });

async function record(db: Database, actorId: string, userId: string, action: string) {
  await db.insert(auditLog).values({
    id: `audit_${randomUUID()}`,
    entityType: "user",
    entityId: userId,
    action,
    actorId,
  });
}

/**
 * The team, managed from the app rather than from a terminal.
 *
 * A flat team, as the map-model spec decided: anyone signed in may add a
 * teammate by name. There is nothing to hand them afterwards — the name they
 * were added under is the name they'll pick from the sign-in list — and
 * every addition is in the audit log.
 */
export const userRoutes = new Hono<AppEnv>();
userRoutes.use("*", requireUser);

userRoutes.get("/", async c => {
  const rows = await c.get("db").select().from(users).where(isNull(users.disabledAt));
  return c.json({ users: rows.map(u => ({ id: u.id, displayName: u.displayName })) });
});

userRoutes.post("/invite", async c => {
  const body = InviteBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: "expected { displayName }" }, 400);
  const db = c.get("db");
  const actor = c.get("user").id;
  try {
    const { user } = await inviteUser(db, body.data.displayName, actor);
    await record(db, actor, user.id, "invite");
    return c.json({ user: { id: user.id, displayName: user.displayName } }, 201);
  } catch (err) {
    if (err instanceof DuplicateNameError) return c.json({ error: err.message }, 409);
    throw err;
  }
});
