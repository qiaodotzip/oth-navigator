import { randomBytes } from "node:crypto";
import { Hono } from "hono";
import { assetRoutes } from "./assets/routes";
import { authRoutes } from "./auth/routes";
import type { User } from "./auth/users";
import { isDeployed, loadConfig } from "./config";
import type { Database } from "./db/client";
import { levelDraftRoutes, roomDraftRoutes } from "./drafts/routes";
import { entityRoutes } from "./entities/routes";
import { teamGate } from "./gate/gate";
import { levelImageRoutes } from "./images/routes";
import { lockRoutes } from "./locks/routes";
import { BadTokens, TokenLimits } from "./mcp/limits";
import { mcpRoutes, type McpDeps } from "./mcp/route";
import { modelRoutes } from "./model/routes";
import { presenceRoutes } from "./presence/routes";
import { setupRoutes } from "./setup/routes";
import { placeReviewRoutes } from "./survey/review";
import { captureRoutes, keyframeRoutes } from "./survey/routes";
import { PresenceTracker } from "./presence/service";
import { publishRoutes } from "./publish/routes";
import { staticRoutes } from "./static";
import { LiveTokens } from "./tokens/live";
import { redactError } from "./tokens/redact";
import { tokenRoutes } from "./tokens/routes";
import type { TokenInfo } from "./tokens/service";
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
  /**
   * The gate cookie's key, kept in DATA_DIR (gate/gate.ts loadGateKey). Left
   * out, a key for this process alone, which is never allowed when deployed.
   */
  gateKey?: Buffer;
  /**
   * Whether a 500's body carries the error's message. Off in production,
   * where a raw message can carry a query, a file path or a connection string.
   */
  exposeErrors?: boolean;
  /** Claude Code's endpoint's counters. Injected by tests for small limits or their own window. */
  mcp?: Partial<Pick<McpDeps, "limits" | "badTokens" | "now">>;
};

/**
 * `token` is set only on /mcp, for a call that came through a Claude Code
 * token. `liveTokens` is the app's one holder of the live tokens' hashes,
 * shared by /mcp and the Team page's routes.
 */
export type AppEnv = {
  Variables: { db: Database; user: User; dataDir: string; token: TokenInfo; liveTokens: LiveTokens };
};

export function createApp(deps: AppDeps) {
  const app = new Hono<AppEnv>();

  const config = loadConfig();
  const dataDir = deps.dataDir ?? config.DATA_DIR;
  const teamCode = deps.teamCode !== undefined ? deps.teamCode : (config.TEAM_CODE ?? null);
  // Railway's own variables count as deployed too, so a NODE_ENV overridden
  // there cannot put a raw error in a response or drop the cookie's Secure.
  const deployed = isDeployed(config);
  const exposeErrors = deps.exposeErrors ?? !deployed;
  const liveTokens = new LiveTokens(deps.db);

  app.use("*", async (c, next) => {
    c.set("db", deps.db);
    c.set("dataDir", dataDir);
    c.set("liveTokens", liveTokens);
    await next();
  });

  // Before every route: with a team code set, a browser that has not typed it
  // gets the team-code page, and its API calls a 401. The guard itself lets
  // the health check and the form's answer through.
  if (teamCode) {
    // A key made up here would last only until the next restart, signing
    // everyone out and hiding a missing volume, so deployed it must be kept.
    if (!deps.gateKey && deployed) {
      throw new Error("The team gate needs its key from DATA_DIR when deployed; index.ts loads it.");
    }
    const gate = teamGate(teamCode, { key: deps.gateKey ?? randomBytes(32), secure: deployed });
    app.use("*", gate.guard);
    app.route("/api/gate", gate.routes);
  }

  app.get("/api/health", c => c.json({ ok: true }));

  app.route("/api/auth", authRoutes);
  app.route("/api/users", userRoutes);
  app.route("/api/tokens", tokenRoutes);
  app.route("/api/entities", entityRoutes);
  app.route("/api/model", modelRoutes);
  app.route("/api/locks", lockRoutes);
  app.route("/api/keyframes", keyframeRoutes);
  app.route("/api/captures", captureRoutes);
  app.route("/api/places", placeReviewRoutes);
  app.route("/api/assets", assetRoutes);
  app.route("/api/level-images", levelImageRoutes);
  app.route("/api/levels", levelDraftRoutes);
  app.route("/api/room-drafts", roomDraftRoutes);
  // Plan 6C: a floor's guided setup, and the check step's list of Claude's changes.
  app.route("/api/levels", setupRoutes);
  app.route("/api", publishRoutes);

  // One tracker for the app and for Claude Code, so "Wei (Claude)" shows where people look.
  const presence = deps.presence ?? new PresenceTracker();
  app.route("/api/presence", presenceRoutes(presence));

  // Claude Code's endpoint (spec §6). Before the editor's files, which would
  // answer GET /mcp with the app's page.
  app.route("/", mcpRoutes({
    limits: deps.mcp?.limits ?? new TokenLimits(),
    badTokens: deps.mcp?.badTokens ?? new BadTokens(),
    liveTokens,
    presence,
    now: deps.mcp?.now,
  }));

  // Registered last so every /api route wins first.
  app.route("/", staticRoutes(deps.editorDist));

  app.notFound(c => c.json({ error: "not found" }, 404));
  app.onError((err, c) => {
    // The whole error goes to the log, which Railway keeps, with the request
    // it came from; tests stay quiet, but never a deployed app, whatever
    // NODE_ENV says there.
    if (deployed || config.NODE_ENV !== "test") console.error(`${c.req.method} ${c.req.path}`, redactError(err));
    return c.json({
      error: exposeErrors ? err.message : "Something went wrong on the server. Try again in a moment.",
    }, 500);
  });

  return app;
}
