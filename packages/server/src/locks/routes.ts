import { Hono } from "hono";
import type { AppEnv } from "../app";
import { requireUser } from "../auth/middleware";
import { loadConfig } from "../config";
import { acquireLock, activeLocks, releaseLock } from "./service";

export const lockRoutes = new Hono<AppEnv>();

lockRoutes.use("*", requireUser);

lockRoutes.get("/", async c => c.json({ locks: await activeLocks(c.get("db")) }));

lockRoutes.post("/:type/:id", async c => {
  const lock = await acquireLock(
    c.get("db"), c.req.param("type"), c.req.param("id"),
    c.get("user").id, loadConfig().LOCK_TTL_SECONDS,
  );
  // 423 Locked: someone else is editing this right now.
  if (!lock) return c.json({ error: "locked by another user" }, 423);
  return c.json({ lock });
});

lockRoutes.delete("/:type/:id", async c => {
  await releaseLock(c.get("db"), c.req.param("type"), c.req.param("id"), c.get("user").id);
  return c.body(null, 204);
});
