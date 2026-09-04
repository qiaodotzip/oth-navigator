import { Hono } from "hono";
import { authRoutes } from "./auth/routes";
import type { User } from "./auth/users";
import type { Database } from "./db/client";
import { entityRoutes } from "./entities/routes";
import { modelRoutes } from "./model/routes";

export type AppDeps = { db: Database };

export type AppEnv = { Variables: { db: Database; user: User } };

export function createApp(deps: AppDeps) {
  const app = new Hono<AppEnv>();

  app.use("*", async (c, next) => {
    c.set("db", deps.db);
    await next();
  });

  app.get("/api/health", c => c.json({ ok: true }));

  app.route("/api/auth", authRoutes);
  app.route("/api/entities", entityRoutes);
  app.route("/api/model", modelRoutes);

  app.notFound(c => c.json({ error: "not found" }, 404));
  app.onError((err, c) => c.json({ error: err.message }, 500));

  return app;
}
