import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../app";
import type { WrongCodes } from "../gate/gate";
import type { PresenceTracker } from "../presence/service";
import { MCP_PATH, bearerSecret } from "../tokens/bearer";
import { hashToken, resolveToken, type TokenRefusal } from "../tokens/service";
import { BAD_TOKEN_LIMIT, callKinds, type TokenLimits } from "./limits";
import { buildMcpServer } from "./server";

export type McpDeps = {
  limits: TokenLimits;
  /** Made-up tokens across the whole server, like wrong team codes. */
  badTokens: WrongCodes;
  presence: PresenceTracker;
  now?: () => number;
};

export const NO_TOKEN =
  "Claude Code needs a token to reach the map. Make one on the Team page, then connect with the command it gives you.";
export const REFUSED: Record<TokenRefusal, string> = {
  malformed: "That token isn't one this map knows. Make a new one on the Team page and connect again.",
  unknown: "That token isn't one this map knows. Make a new one on the Team page and connect again.",
  expired: "That token has expired. Make a new one on the Team page and connect again.",
  revoked: "That token was revoked. Make a new one on the Team page and connect again.",
  disabled: "That token's owner can no longer sign in, so it no longer works.",
};
export const TOO_MANY_BAD_TOKENS = "Too many unknown tokens were tried. Wait 15 minutes, then try again.";
export const FROM_A_BROWSER = "This address is for Claude Code, not for a browser.";
export const TOO_LARGE = "That request is larger than 256 KB. Send less at once.";
export const TOKEN_IN_BODY =
  "That request has a Claude Code token in it. Tokens never go into the map: take it out and send the request again.";
export const POST_ONLY = "Claude Code talks to this address with POST only.";

/** A token anywhere in a body: in a note or a name it would reach the audit trail. */
const TOKEN_IN_TEXT = /oth_pat_[A-Za-z0-9_-]{43}/;

const NO_STORE = { "cache-control": "no-store" };

function unauthorized(c: Context<AppEnv>, message: string, invalid: boolean) {
  return c.json({ error: message }, 401, {
    ...NO_STORE,
    "www-authenticate": invalid ? 'Bearer realm="oth", error="invalid_token"' : 'Bearer realm="oth"',
  });
}

/**
 * Claude Code's endpoint (spec §6.2, §6.3), gate or no gate: the gate only
 * lets bearer calls reach here without its cookie (gate/gate.ts
 * claudeCodeCall), and this checks the token itself. Stateless: a new MCP
 * server and transport per request, JSON responses, and no SSE.
 */
export function mcpRoutes(deps: McpDeps) {
  const routes = new Hono<AppEnv>();
  const now = deps.now ?? Date.now;
  /**
   * Hashes of tokens this server has accepted since it started. While a
   * flood of made-up tokens has the window full they are still checked, as
   * a browser already through the gate is never asked for the code again.
   */
  const accepted = new Set<string>();
  /** The floor each person's Claude was last on, for presence. */
  const lastFloor = new Map<string, string | null>();

  // Browsers always send Origin on a POST, and Claude Code never does:
  // refusing it is the guard against DNS rebinding that the MCP spec asks for.
  const refuseBrowsers = createMiddleware<AppEnv>(async (c, next) => {
    if (c.req.header("origin") !== undefined) return c.json({ error: FROM_A_BROWSER }, 403, NO_STORE);
    await next();
  });

  const authenticate = createMiddleware<AppEnv>(async (c, next) => {
    const secret = bearerSecret(c.req.header("authorization"));
    if (!secret) return unauthorized(c, NO_TOKEN, false);
    const at = now();
    const hash = hashToken(secret);
    if (deps.badTokens.blocked(at) && !accepted.has(hash)) {
      return c.json({ error: TOO_MANY_BAD_TOKENS }, 429, {
        ...NO_STORE, "retry-after": String(BAD_TOKEN_LIMIT.windowMs / 1000),
      });
    }
    const found = await resolveToken(c.get("db"), secret, new Date(at));
    if (!found.ok) {
      // Only a well-formed token nobody made is a guess. A teammate's
      // expired or revoked one is refused as well, but it must never lock
      // the team out.
      if (found.reason === "unknown") deps.badTokens.record(at);
      return unauthorized(c, REFUSED[found.reason], true);
    }
    accepted.add(hash);
    c.set("user", found.user);
    c.set("token", found.token);
    await next();
  });

  const sizeLimit = bodyLimit({
    maxSize: deps.limits.limits.bodyBytes,
    onError: c => c.json({ error: TOO_LARGE }, 413, NO_STORE),
  });

  routes.post(MCP_PATH, refuseBrowsers, authenticate, sizeLimit, async c => {
    const user = c.get("user");
    const token = c.get("token");
    const raw = await c.req.text();
    if (TOKEN_IN_TEXT.test(raw)) return c.json({ error: TOKEN_IN_BODY }, 422, NO_STORE);
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return c.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error: the body is not JSON." } }, 400, NO_STORE);
    }

    const over = deps.limits.admit(token.id, callKinds(body), now());
    if (over) return c.json({ error: over.message }, 429, { ...NO_STORE, "retry-after": String(over.retryAfterS) });
    if (!deps.limits.enter(token.id)) {
      return c.json({
        error: `This token already has ${deps.limits.limits.inFlight} requests running. Wait for one to finish, then send this again.`,
      }, 429, { ...NO_STORE, "retry-after": "1" });
    }
    try {
      const server = buildMcpServer({
        db: c.get("db"),
        dataDir: c.get("dataDir"),
        user,
        token,
        limits: deps.limits,
        now: () => new Date(now()),
        seenOn: levelId => {
          const floor = levelId ?? lastFloor.get(user.id) ?? null;
          lastFloor.set(user.id, floor);
          deps.presence.heartbeat(`claude:${user.id}`, `${user.displayName} (Claude)`, floor);
        },
      });
      const transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      await server.connect(transport);
      try {
        // The body is already read and checked, so the transport is handed it.
        return await transport.handleRequest(c.req.raw, { parsedBody: body });
      } finally {
        await server.close();
      }
    } finally {
      deps.limits.leave(token.id);
    }
  });

  // The client's GET for an event stream, and any other method. This server
  // offers no stream, and the MCP spec's answer for that is 405.
  routes.all(MCP_PATH, c => c.json({ error: POST_ONLY }, 405, { ...NO_STORE, allow: "POST" }));

  return routes;
}
