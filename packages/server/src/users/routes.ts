import { randomUUID } from "node:crypto";
import { eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../app";
import { requireUser } from "../auth/middleware";
import { findUserByEmail } from "../auth/users";
import { inviteUser, resetPassword } from "../cli/invite";
import type { Database } from "../db/client";
import { auditLog, users } from "../db/schema";

const InviteBody = z.object({
  email: z.string().trim().email(),
  displayName: z.string().trim().min(1).max(80),
});

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
 * A flat team, as the map-model spec decided: anyone signed in may invite a
 * teammate or issue a fresh password. A one-time password is in the response
 * and nowhere else — it is never stored in the clear — and every invite and
 * reset is in the audit log.
 */
export const userRoutes = new Hono<AppEnv>();
userRoutes.use("*", requireUser);

userRoutes.get("/", async c => {
  const rows = await c.get("db").select().from(users).where(isNull(users.disabledAt));
  return c.json({ users: rows.map(u => ({ id: u.id, email: u.email, displayName: u.displayName })) });
});

userRoutes.post("/invite", async c => {
  const body = InviteBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: "expected { email, displayName }" }, 400);
  const db = c.get("db");
  if (await findUserByEmail(db, body.data.email)) {
    return c.json({ error: "someone with that email is already on the team" }, 409);
  }
  const actor = c.get("user").id;
  const { user, password } = await inviteUser(db, body.data.email, body.data.displayName, actor);
  await record(db, actor, user.id, "invite");
  return c.json({ user: { id: user.id, email: user.email, displayName: user.displayName }, password }, 201);
});

userRoutes.post("/:id/reset-password", async c => {
  const db = c.get("db");
  const [row] = await db.select().from(users).where(eq(users.id, c.req.param("id")));
  if (!row || row.disabledAt) return c.json({ error: "not found" }, 404);
  const { user, password } = await resetPassword(db, row.email);
  await record(db, c.get("user").id, user.id, "reset-password");
  return c.json({ user: { id: user.id, email: user.email, displayName: user.displayName }, password });
});
