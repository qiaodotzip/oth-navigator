import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp, type AppDeps } from "../app";
import { buildings, users } from "../db/schema";
import { GATE_COOKIE, gateToken } from "../gate/gate";
import { PresenceTracker } from "../presence/service";
import { json } from "../testing/harness";
import { MCP_PATH } from "../tokens/bearer";
import { mintToken, revokeToken } from "../tokens/service";
import { BadTokens, LIMITS, TokenLimits } from "./limits";
import { SERVER_FAILED } from "./results";
import {
  CANT_CHECK_NOW, FROM_A_BROWSER, NO_TOKEN, POST_ONLY, REFUSED, TOKEN_IN_BODY, TOO_LARGE, TOO_MANY_BAD_TOKENS,
} from "./route";
import { GATE_KEY, LIST, TEAM_CODE, call, mcpFixture, type McpFixture } from "./testing";

const DAY = 24 * 3600_000;
const made = (fill: string) => `oth_pat_${fill.repeat(43)}`;
/** The nth made-up token, each one different. */
const guess = (n: number) => `oth_pat_${String(n).padStart(43, "x")}`;
const error = async (res: Response) => (await json<{ error: string }>(res)).error;

/**
 * Another server on the fixture's database, as after a deploy: it has
 * accepted no token yet. It counts the reads its calls make of the database,
 * and can make them fail.
 */
function redeploy(f: McpFixture, mcp: AppDeps["mcp"] = {}) {
  let reads = 0;
  let failing = false;
  const db = new Proxy(f.db, {
    get(target, key) {
      const value = Reflect.get(target, key) as unknown;
      if (typeof value !== "function") return value;
      return (...args: unknown[]) => {
        if (key === "select") {
          reads++;
          if (failing) throw new Error("Connection terminated unexpectedly");
        }
        return Reflect.apply(value, target, args) as unknown;
      };
    },
  });
  const app = createApp({ db, dataDir: f.dataDir, teamCode: null, mcp });
  return {
    app,
    reads: () => reads,
    failReads: (on: boolean) => {
      failing = on;
    },
    post: (secret: string) => app.request(MCP_PATH, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream", authorization: `Bearer ${secret}` },
      body: JSON.stringify(LIST),
    }),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("connecting Claude Code", () => {
  it("connects with a token, lists the tools, and reads the floors as its person", async () => {
    const f = await mcpFixture();
    const client = await f.connect();
    expect((await client.listTools()).tools.map(t => t.name)).toContain("list_floors");
    expect(client.getInstructions()).toContain("as Wei");
    const { text, isError } = await call(client, "list_floors");
    expect(isError).toBe(false);
    const floors = JSON.parse(text) as { code: string; owners: string[] }[];
    expect(floors.map(fl => fl.code)).toEqual(["L1", "L2"]);
    expect(floors[0]?.owners).toEqual(["Wei"]);
  });

  it("connects through the team gate with the token alone", async () => {
    const f = await mcpFixture({ gated: true });
    const client = await f.connect();
    expect((await call(client, "list_floors")).isError).toBe(false);
  });

  it("answers the client's event-stream request with 405, past the gate too", async () => {
    const f = await mcpFixture({ gated: true });
    const res = await f.app.request("/mcp", {
      method: "GET", headers: { authorization: `Bearer ${f.secret}`, accept: "text/event-stream" },
    });
    expect(res.status).toBe(405);
    expect(res.headers.get("allow")).toBe("POST");
    expect(await error(res)).toBe(POST_ONLY);
  });

  it("shows the person's Claude in presence while calls arrive", async () => {
    const presence = new PresenceTracker();
    const f = await mcpFixture({ deps: { presence } });
    await call(await f.connect(), "list_floors");
    expect(presence.list()).toContainEqual(expect.objectContaining({
      userId: `claude:${f.wei.id}`, displayName: "Wei (Claude)", levelId: null,
    }));
  });
});

describe("refusing a token", () => {
  it("asks for one, with WWW-Authenticate: Bearer", async () => {
    const f = await mcpFixture();
    const res = await f.raw(LIST, { authorization: undefined });
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toMatch(/^Bearer/);
    expect(await error(res)).toBe(NO_TOKEN);
  });

  it("refuses a token that is malformed, has no prefix, or that nobody made", async () => {
    const f = await mcpFixture();
    for (const [bad, reason] of [["oth_pat_short", "malformed"], ["A".repeat(51), "malformed"], [made("A"), "unknown"]] as const) {
      const res = await f.raw(LIST, { authorization: `Bearer ${bad}` });
      expect(res.status, bad).toBe(401);
      expect(res.headers.get("www-authenticate"), bad).toMatch(/^Bearer/);
      expect(await error(res), bad).toBe(REFUSED[reason]);
    }
  });

  it("refuses an expired token, a revoked one from its next call, and a disabled person's", async () => {
    const f = await mcpFixture();
    const old = await mintToken(f.db, f.wei, { name: "old", mayPublish: false }, new Date(Date.now() - 91 * DAY));
    expect(await error(await f.raw(LIST, { authorization: `Bearer ${old.secret}` }))).toBe(REFUSED.expired);

    const client = await f.connect();
    expect((await call(client, "list_floors")).isError).toBe(false);
    await revokeToken(f.db, f.tokenId, f.wei.id);
    await expect(client.callTool({ name: "list_floors", arguments: {} })).rejects.toMatchObject({ code: 401 });

    const fresh = await mintToken(f.db, f.wei, { name: "new", mayPublish: false });
    await f.db.update(users).set({ disabledAt: new Date() }).where(eq(users.id, f.wei.id));
    expect(await error(await f.raw(LIST, { authorization: `Bearer ${fresh.secret}` }))).toBe(REFUSED.disabled);
  });

  it("turns away a flood of made-up tokens unchecked, while a token already in use still works", async () => {
    const f = await mcpFixture({ deps: { mcp: { badTokens: new BadTokens({ max: 3, windowMs: 60_000 }) } } });
    const client = await f.connect();
    for (const fill of ["a", "b", "c"]) expect((await f.raw(LIST, { authorization: `Bearer ${made(fill)}` })).status).toBe(401);
    const flooded = await f.raw(LIST, { authorization: `Bearer ${made("d")}` });
    expect(flooded.status).toBe(429);
    expect(flooded.headers.get("retry-after")).toBe("900");
    expect(await error(flooded)).toBe(TOO_MANY_BAD_TOKENS);
    expect((await call(client, "list_floors")).isError).toBe(false);
  });

  it("never counts a teammate's expired token as a guess", async () => {
    const f = await mcpFixture({ deps: { mcp: { badTokens: new BadTokens({ max: 1, windowMs: 60_000 }) } } });
    const old = await mintToken(f.db, f.wei, { name: "old", mayPublish: false }, new Date(Date.now() - 91 * DAY));
    for (let i = 0; i < 3; i++) expect((await f.raw(LIST, { authorization: `Bearer ${old.secret}` })).status).toBe(401);
    const other = await mintToken(f.db, f.wei, { name: "other", mayPublish: false });
    expect((await f.raw(LIST, { authorization: `Bearer ${other.secret}` })).status).toBe(200);
  });

  it("counts lookups still running, so a burst of made-up tokens sent at once reaches the database only up to the limit", async () => {
    const f = await mcpFixture();
    const booted = redeploy(f, { badTokens: new BadTokens({ max: 3, windowMs: 60_000 }) });
    const answers = await Promise.all(Array.from({ length: 40 }, (_, i) => booted.post(guess(i))));
    const statuses = answers.map(res => res.status);
    expect(statuses.filter(s => s === 401)).toHaveLength(3);
    expect(statuses.filter(s => s === 429)).toHaveLength(37);
    // Three lookups, and at most one read of the live tokens for all the rest.
    expect(booted.reads()).toBeLessThanOrEqual(4);
  });

  it("after a deploy and a flood of made-up tokens, still takes a token made before it started", async () => {
    const f = await mcpFixture();
    const booted = redeploy(f);
    for (let i = 0; i < 20; i++) expect((await booted.post(guess(i))).status, `guess ${i}`).toBe(401);
    expect((await booted.post(guess(20))).status).toBe(429);
    expect((await booted.post(f.secret)).status).toBe(200);
    // The live tokens are read at most once a minute, however many more guesses come.
    const reads = booted.reads();
    for (let i = 21; i < 31; i++) expect((await booted.post(guess(i))).status).toBe(429);
    expect(booted.reads()).toBe(reads);
  });

  it("during a flood, takes a token made elsewhere once it next reads the live tokens, a minute later", async () => {
    const f = await mcpFixture();
    let clock = Date.now();
    const booted = redeploy(f, { badTokens: new BadTokens({ max: 1, windowMs: 3600_000 }), now: () => clock });
    expect((await booted.post(guess(0))).status).toBe(401);
    expect((await booted.post(f.secret)).status).toBe(200);
    const fresh = await mintToken(f.db, f.wei, { name: "fresh", mayPublish: false });
    expect((await booted.post(fresh.secret)).status).toBe(429);
    clock += 60_000;
    expect((await booted.post(fresh.secret)).status).toBe(200);
  });

  it("during a flood, takes a token made on the Team page at once", async () => {
    const f = await mcpFixture();
    const booted = redeploy(f, { badTokens: new BadTokens({ max: 1, windowMs: 3600_000 }) });
    expect((await booted.post(guess(0))).status).toBe(401);
    // Wei's token goes through, and the live tokens are read to let it.
    expect((await booted.post(f.secret)).status).toBe(200);
    const login = await booted.app.request("/api/auth/login", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId: f.wei.id }),
    });
    const cookie = login.headers.get("set-cookie") ?? "";
    const made = await booted.app.request("/api/tokens", {
      method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify({ name: "Wei's desktop" }),
    });
    expect(made.status).toBe(201);
    const { secret } = await json<{ secret: string }>(made);
    expect((await booted.post(secret)).status).toBe(200);
  });

  it("answers 429, not 500, while it can't read the live tokens, and reads again a few seconds on", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const f = await mcpFixture();
    let clock = Date.now();
    const booted = redeploy(f, { badTokens: new BadTokens({ max: 1, windowMs: 3600_000 }), now: () => clock });
    expect((await booted.post(guess(0))).status).toBe(401);
    booted.failReads(true);
    const failed = await booted.post(f.secret);
    expect(failed.status).toBe(429);
    expect(failed.headers.get("retry-after")).toBe("5");
    expect(await error(failed)).toBe(CANT_CHECK_NOW);
    booted.failReads(false);
    const reads = booted.reads();
    clock += 4_000;
    expect((await booted.post(f.secret)).status).toBe(429);
    expect(booted.reads()).toBe(reads);
    clock += 1_000;
    expect((await booted.post(f.secret)).status).toBe(200);
  });

  it("refuses a token that no longer works from memory, after looking it up once", async () => {
    const f = await mcpFixture();
    const old = await mintToken(f.db, f.wei, { name: "old", mayPublish: false }, new Date(Date.now() - 91 * DAY));
    const booted = redeploy(f);
    expect(await error(await booted.post(old.secret))).toBe(REFUSED.expired);
    let reads = booted.reads();
    expect(await error(await booted.post(old.secret))).toBe(REFUSED.expired);
    expect(booted.reads()).toBe(reads);

    expect((await booted.post(f.secret)).status).toBe(200);
    await revokeToken(f.db, f.tokenId, f.wei.id);
    expect(await error(await booted.post(f.secret))).toBe(REFUSED.revoked);
    reads = booted.reads();
    expect(await error(await booted.post(f.secret))).toBe(REFUSED.revoked);
    expect(booted.reads()).toBe(reads);
  });
});

describe("what a call may carry", () => {
  it("refuses any request with an Origin header", async () => {
    const f = await mcpFixture();
    const res = await f.raw(LIST, { origin: "https://evil.example" });
    expect(res.status).toBe(403);
    expect(await error(res)).toBe(FROM_A_BROWSER);
  });

  it("refuses a body over 256 KB", async () => {
    const f = await mcpFixture();
    const res = await f.raw({ ...LIST, params: { pad: "x".repeat(LIMITS.bodyBytes) } });
    expect(res.status).toBe(413);
    expect(await error(res)).toBe(TOO_LARGE);
  });

  it("refuses a body with a token in it", async () => {
    const f = await mcpFixture();
    const res = await f.raw({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "list_floors", arguments: { note: f.secret } } });
    expect(res.status).toBe(422);
    expect(await error(res)).toBe(TOKEN_IN_BODY);
  });

  it("refuses a token in a body however its JSON escapes it", async () => {
    const f = await mcpFixture();
    const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "list_floors", arguments: { note: f.secret } } })
      .replace("oth_pat_", "\\u006fth\\u005fpat_");
    expect(body).not.toContain(f.secret);
    const res = await f.raw(body);
    expect(res.status).toBe(422);
    expect(await error(res)).toBe(TOKEN_IN_BODY);
  });

  it("tells every cache to keep no answer", async () => {
    const f = await mcpFixture();
    const answers = [
      await f.raw(LIST),
      await f.raw(LIST, { authorization: undefined }),
      await f.raw(LIST, { origin: "https://evil.example" }),
      await f.app.request(MCP_PATH, { method: "GET", headers: { authorization: `Bearer ${f.secret}` } }),
      await f.raw({ ...LIST, params: { pad: "x".repeat(LIMITS.bodyBytes) } }),
    ];
    expect(answers.map(res => res.status)).toEqual([200, 401, 403, 405, 413]);
    for (const res of answers) expect(res.headers.get("cache-control"), String(res.status)).toBe("no-store");
  });

  it("slows a token down past its reads a minute, with Retry-After", async () => {
    const f = await mcpFixture({ deps: { mcp: { limits: new TokenLimits({ ...LIMITS, readsPerMinute: 2 }) } } });
    expect((await f.raw(LIST)).status).toBe(200);
    expect((await f.raw(LIST)).status).toBe(200);
    const third = await f.raw(LIST);
    expect(third.status).toBe(429);
    expect(Number(third.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(await error(third)).toMatch(/^Slow down: this token has read the map 2 times in the last minute\./);
  });

  it("turns a token away while four of its requests are running", async () => {
    const limits = new TokenLimits();
    const f = await mcpFixture({ deps: { mcp: { limits } } });
    for (let i = 0; i < 4; i++) limits.enter(f.tokenId);
    const busy = await f.raw(LIST);
    expect(busy.status).toBe(429);
    expect(busy.headers.get("retry-after")).toBe("1");
    limits.leave(f.tokenId);
    expect((await f.raw(LIST)).status).toBe(200);
  });
});

describe("the gate's one exception", () => {
  it("lets a token reach /mcp and nothing else", async () => {
    const f = await mcpFixture({ gated: true });
    const api = await f.app.request("/api/model", { headers: { authorization: `Bearer ${f.secret}` } });
    expect(api.status).toBe(401);
    expect(await json(api)).toMatchObject({ gate: true });
    const page = await f.app.request("/floors/L1", { headers: { authorization: `Bearer ${f.secret}` } });
    expect(page.status).toBe(401);
    expect(await page.text()).toContain("Team code");
  });

  it("refuses /mcp to a browser holding only the gate cookie", async () => {
    const f = await mcpFixture({ gated: true });
    const res = await f.raw(LIST, { authorization: undefined, cookie: `${GATE_COOKIE}=${gateToken(GATE_KEY, TEAM_CODE)}` });
    expect(res.status).toBe(401);
    expect(await error(res)).toBe(NO_TOKEN);
  });

  it("applies to exactly /mcp, on the parsed pathname", async () => {
    const f = await mcpFixture({ gated: true });
    for (const path of ["/mcp/", "/MCP", "/mcp/../api/model", "/%6Dcp", "/mcp%2F", "/%2Fmcp", "/api/mcp", "//mcp"]) {
      const res = await f.raw(LIST, {}, path);
      expect(res.status, path).toBe(401);
      expect(await res.text(), path).not.toContain("jsonrpc");
    }
  });
});

describe("a call that fails on the server", () => {
  it("says only that something went wrong, and logs it without the token", async () => {
    const f = await mcpFixture();
    await f.db.delete(buildings);
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const { text, isError } = await call(await f.connect(), "list_floors");
    expect(isError).toBe(true);
    expect(text).toBe(SERVER_FAILED);
    expect(logged).toHaveBeenCalled();
    const printed = logged.mock.calls.flat().map(a => (a instanceof Error ? `${a.message} ${a.stack}` : String(a))).join(" ");
    expect(printed).not.toContain(f.secret);
  });
});
