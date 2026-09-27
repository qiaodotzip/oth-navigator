import { eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { z } from "zod";
import type { AppEnv } from "../app";
import { loadConfig } from "../config";
import { users } from "../db/schema";
import { requireUser } from "./middleware";
import { SESSION_COOKIE, createSession, revokeSession } from "./sessions";

export const authRoutes = new Hono<AppEnv>();

/**
 * Who you can sign in as. Public, and deliberately so: the sign-in screen
 * needs this before anyone is signed in, and there is nothing left to
 * enumerate — the whole list is the point of a dropdown to pick yourself from.
 */
authRoutes.get("/people", async c => {
  const rows = await c.get("db")
    .select({ id: users.id, displayName: users.displayName })
    .from(users)
    .where(isNull(users.disabledAt));
  const people = [...rows].sort((a, b) =>
    a.displayName.localeCompare(b.displayName, undefined, { sensitivity: "base" }),
  );
  return c.json({ people });
});

const LoginSchema = z.object({ userId: z.string().min(1) });

authRoutes.post("/login", async c => {
  const config = loadConfig();
  const parsed = LoginSchema.safeParse(await c.req.json().catch(() => null));
  const db = c.get("db");
  const row = parsed.success
    ? (await db.select().from(users).where(eq(users.id, parsed.data.userId)))[0]
    : undefined;
  // The people list is public, so there is nothing left to enumerate here: a
  // made-up id, a malformed body and a disabled account all get the same 401.
  if (!row || row.disabledAt) return c.json({ error: "Pick your name from the list." }, 401);

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
