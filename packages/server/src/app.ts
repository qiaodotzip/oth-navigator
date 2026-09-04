import { Hono } from "hono";
import { authRoutes } from "./auth/routes";
import type { User } from "./auth/users";
import type { Database } from "./db/client";
import { entityRoutes } from "./entities/routes";
import { lockRoutes } from "./locks/routes";
import { modelRoutes } from "./model/routes";
import { presenceRoutes } from "./presence/routes";
import { PresenceTracker } from "./presence/service";

export type AppDeps = { db: Database; presence?: PresenceTracker };

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
  app.route("/api/locks", lockRoutes);

  // Defaults to a fresh tracker so every createApp({ db }) call site keeps working.
  app.route("/api/presence", presenceRoutes(deps.presence ?? new PresenceTracker()));

  app.notFound(c => c.json({ error: "not found" }, 404));
  app.onError((err, c) => c.json({ error: err.message }, 500));

  return app;
}
