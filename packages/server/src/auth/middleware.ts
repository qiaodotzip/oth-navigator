import { getCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../app";
import { SESSION_COOKIE, resolveSession } from "./sessions";

/** Every route except health and login sits behind this. */
export const requireUser = createMiddleware<AppEnv>(async (c, next) => {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) return c.json({ error: "unauthenticated" }, 401);
  const user = await resolveSession(c.get("db"), token);
  if (!user) return c.json({ error: "unauthenticated" }, 401);
  c.set("user", user);
  await next();
});
