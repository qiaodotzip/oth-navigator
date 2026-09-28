import { Hono } from "hono";
import { assetRoutes } from "./assets/routes";
import { authRoutes } from "./auth/routes";
import type { User } from "./auth/users";
import { loadConfig } from "./config";
import type { Database } from "./db/client";
import { entityRoutes } from "./entities/routes";
import { teamGate } from "./gate/gate";
import { levelImageRoutes } from "./images/routes";
import { lockRoutes } from "./locks/routes";
import { modelRoutes } from "./model/routes";
import { presenceRoutes } from "./presence/routes";
import { placeReviewRoutes } from "./survey/review";
import { captureRoutes, keyframeRoutes } from "./survey/routes";
import { PresenceTracker } from "./presence/service";
import { publishRoutes } from "./publish/routes";
import { staticRoutes } from "./static";
import { userRoutes } from "./users/routes";

export type AppDeps = {
  db: Database;
  presence?: PresenceTracker;
  /** Where assets and published bundles live. Injected so tests stay hermetic. */
  dataDir?: string;
  /** Built editor to serve. Defaults to packages/editor/dist. */
  editorDist?: string;
  /**
   * The shared team code (spec §13). Null: no gate, as in local development.
   * Left out, it is TEAM_CODE from the environment.
   */
  teamCode?: string | null;
};

export type AppEnv = { Variables: { db: Database; user: User; dataDir: string } };

export function createApp(deps: AppDeps) {
  const app = new Hono<AppEnv>();

  const config = loadConfig();
  const dataDir = deps.dataDir ?? config.DATA_DIR;
  const teamCode = deps.teamCode !== undefined ? deps.teamCode : (config.TEAM_CODE ?? null);

  app.use("*", async (c, next) => {
    c.set("db", deps.db);
    c.set("dataDir", dataDir);
    await next();
  });

  // Before every route: with a team code set, a browser that has not typed it
  // gets the team-code page, and its API calls a 401. The guard itself lets
  // the health check and the form's answer through.
  if (teamCode) {
    const gate = teamGate(teamCode, { secure: config.NODE_ENV === "production" });
    app.use("*", gate.guard);
    app.route("/api/gate", gate.routes);
  }

  app.get("/api/health", c => c.json({ ok: true }));

  app.route("/api/auth", authRoutes);
  app.route("/api/users", userRoutes);
  app.route("/api/entities", entityRoutes);
  app.route("/api/model", modelRoutes);
  app.route("/api/locks", lockRoutes);
  app.route("/api/keyframes", keyframeRoutes);
  app.route("/api/captures", captureRoutes);
  app.route("/api/places", placeReviewRoutes);
  app.route("/api/assets", assetRoutes);
  app.route("/api/level-images", levelImageRoutes);
  app.route("/api", publishRoutes);

  // Defaults to a fresh tracker so every createApp({ db }) call site keeps working.
  app.route("/api/presence", presenceRoutes(deps.presence ?? new PresenceTracker()));

  // Registered last so every /api route wins first.
  app.route("/", staticRoutes(deps.editorDist));

  app.notFound(c => c.json({ error: "not found" }, 404));
  app.onError((err, c) => c.json({ error: err.message }, 500));

  return app;
}
