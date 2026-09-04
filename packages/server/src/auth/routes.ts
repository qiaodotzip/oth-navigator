import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { z } from "zod";
import type { AppEnv } from "../app";
import { loadConfig } from "../config";
import { requireUser } from "./middleware";
import { verifyPassword } from "./password";
import { SESSION_COOKIE, createSession, revokeSession } from "./sessions";
import { findUserByEmail } from "./users";

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
  return c.json({ user: { id: row.id, email: row.email, displayName: row.displayName } });
});

authRoutes.post("/logout", async c => {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) await revokeSession(c.get("db"), token);
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.body(null, 204);
});

authRoutes.get("/me", requireUser, c => c.json({ user: c.get("user") }));
