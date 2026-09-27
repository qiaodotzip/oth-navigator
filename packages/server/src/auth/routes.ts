import { randomUUID } from "node:crypto";
import { and, eq, ne } from "drizzle-orm";
import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { z } from "zod";
import type { AppEnv } from "../app";
import { loadConfig } from "../config";
import type { Database } from "../db/client";
import { auditLog, sessions, users } from "../db/schema";
import { requireUser } from "./middleware";
import { hashPassword, verifyPassword } from "./password";
import { SESSION_COOKIE, createSession, revokeSession } from "./sessions";
import { findUserByEmail } from "./users";

/** Never the password or its hash — just that a change happened, and who did it. */
async function recordPasswordChange(db: Database, userId: string) {
  await db.insert(auditLog).values({
    id: `audit_${randomUUID()}`,
    entityType: "user",
    entityId: userId,
    action: "change-password",
    actorId: userId,
  });
}

const LoginSchema = z.object({ email: z.string().min(1), password: z.string().min(1) });

export const authRoutes = new Hono<AppEnv>();

authRoutes.post("/login", async c => {
  const config = loadConfig();
  const parsed = LoginSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "invalid credentials" }, 401);

  const db = c.get("db");
  const row = await findUserByEmail(db, parsed.data.email);
  // Identical response for unknown email and wrong password: no account enumeration.
  const ok = row && !row.disabledAt && (await verifyPassword(parsed.data.password, row.passwordHash));
  if (!row || !ok) return c.json({ error: "invalid credentials" }, 401);

  const session = await createSession(db, row.id, config.SESSION_TTL_HOURS);
  setCookie(c, SESSION_COOKIE, session.id, {
    httpOnly: true,
    sameSite: "Lax",
    secure: config.NODE_ENV === "production",
    path: "/",
    expires: session.expiresAt,
  });
  return c.json({
    user: {
      id: row.id,
      email: row.email,
      displayName: row.displayName,
      mustChangePassword: row.mustChangePassword,
    },
  });
});

authRoutes.post("/logout", async c => {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) await revokeSession(c.get("db"), token);
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.body(null, 204);
});

authRoutes.get("/me", requireUser, c => c.json({ user: c.get("user") }));

const PasswordBody = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(10).max(200),
});

/**
 * Changing your own password, which also ends the one-time-password prompt.
 * A wrong current password is 422, not 401: it must not read as a lost session.
 *
 * Also ends every other session the account has open — the point of changing
 * a password is that the old one stops working, which must be true for a
 * teammate who left a session open on another machine too. The cookie this
 * request came in on is kept, so changing your password does not sign you
 * out of the tab you changed it from.
 */
authRoutes.post("/password", requireUser, async c => {
  const body = PasswordBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) {
    const missingCurrent = body.error.issues.some(i => i.path[0] === "currentPassword");
    return c.json(
      { error: missingCurrent ? "Enter your current password." : "A new password needs at least 10 characters." },
      400,
    );
  }
  const db = c.get("db");
  const me = c.get("user");
  const row = await findUserByEmail(db, me.email);
  if (!row || !(await verifyPassword(body.data.currentPassword, row.passwordHash))) {
    return c.json({ error: "Your current password is not right." }, 422);
  }
  await db.update(users)
    .set({ passwordHash: await hashPassword(body.data.newPassword), mustChangePassword: false })
    .where(eq(users.id, me.id));

  const token = getCookie(c, SESSION_COOKIE);
  await db.delete(sessions).where(
    token ? and(eq(sessions.userId, me.id), ne(sessions.id, token)) : eq(sessions.userId, me.id),
  );
  await recordPasswordChange(db, me.id);

  return c.body(null, 204);
});
