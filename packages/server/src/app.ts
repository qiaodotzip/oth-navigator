import { Hono } from "hono";
import { assetRoutes } from "./assets/routes";
import { authRoutes } from "./auth/routes";
import type { User } from "./auth/users";
import { loadConfig } from "./config";
import type { Database } from "./db/client";
import { entityRoutes } from "./entities/routes";
import { lockRoutes } from "./locks/routes";
import { modelRoutes } from "./model/routes";
import { presenceRoutes } from "./presence/routes";
import { PresenceTracker } from "./presence/service";
import { publishRoutes } from "./publish/routes";

export type AppDeps = {
  db: Database;
  presence?: PresenceTracker;
  /** Where assets and published bundles live. Injected so tests stay hermetic. */
  dataDir?: string;
};

export type AppEnv = { Variables: { db: Database; user: User; dataDir: string } };

export function createApp(deps: AppDeps) {
  const app = new Hono<AppEnv>();

  const dataDir = deps.dataDir ?? loadConfig().DATA_DIR;

  app.use("*", async (c, next) => {
    c.set("db", deps.db);
    c.set("dataDir", dataDir);
    await next();
  });

  app.get("/api/health", c => c.json({ ok: true }));

  app.route("/api/auth", authRoutes);
  app.route("/api/entities", entityRoutes);
  app.route("/api/model", modelRoutes);
  app.route("/api/locks", lockRoutes);
  app.route("/api/assets", assetRoutes);
  app.route("/api", publishRoutes);

  // Defaults to a fresh tracker so every createApp({ db }) call site keeps working.
  app.route("/api/presence", presenceRoutes(deps.presence ?? new PresenceTracker()));

  app.notFound(c => c.json({ error: "not found" }, 404));
  app.onError((err, c) => c.json({ error: err.message }, 500));

  return app;
}
