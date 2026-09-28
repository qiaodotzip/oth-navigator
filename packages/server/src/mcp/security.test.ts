import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../app";
import { storeAsset } from "../assets/storage";
import { createUser } from "../auth/users";
import { apiTokens, auditLog, buildings, captures, keyframes, levels, publishedVersions, roomDrafts, rooms, users } from "../db/schema";
import { listDrafts, replaceDrafts } from "../drafts/service";
import { createEntity, updateEntity } from "../entities/repository";
import { GATE_COOKIE, gateToken } from "../gate/gate";
import { json } from "../testing/harness";
import { hashToken, mintToken } from "../tokens/service";
import { BadTokens, LIMITS, READ_TOOLS, TokenLimits } from "./limits";
import { GATE_KEY, LIST, TEAM_CODE, call, mcpFixture, type McpFixture } from "./testing";
import { DRAFTS } from "./tools/edit";

const here = dirname(fileURLToPath(import.meta.url));
const DAY = 24 * 3600_000;
const ROOM = { id: "L1-shop-12", levelId: "oth-L1", kind: "room", footprint: [[10, 40], [20, 40], [20, 30], [10, 30]], heightM: 4, nameEn: "Shop 12" };
const bearer = (secret: string) => ({ authorization: `Bearer ${secret}` });
const printedBy = (spy: { mock: { calls: unknown[][] } }) =>
  spy.mock.calls.flat().map(a => (a instanceof Error ? `${a.message}\n${a.stack ?? ""}` : String(a))).join("\n");

async function signIn(f: McpFixture, userId: string): Promise<string> {
  const res = await f.app.request("/api/auth/login", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId }),
  });
  return res.headers.get("set-cookie") ?? "";
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

// Owner: gate/gate.ts claudeCodeCall, mcp/route.ts.
describe("§6.5 the gate exception applies to exactly /mcp", () => {
  it("meets the gate on every near miss: /mcp/, /MCP, /mcp/../api/model, encoded paths, /api/mcp", async () => {
    const f = await mcpFixture({ gated: true });
    for (const path of ["/mcp/", "/MCP", "/mcp/../api/model", "/%6Dcp", "/mcp%2F", "/%2Fmcp", "/%2fmcp", "/api/mcp", "//mcp", "/mcp;x", "/mcp/."]) {
      const res = await f.raw(LIST, {}, path);
      expect(res.status, path).toBe(401);
      expect(await res.text(), path).not.toContain("jsonrpc");
    }
  });

  it("opens POST /mcp, and GET /mcp only for its 405, to a bearer with no Origin", async () => {
    const f = await mcpFixture({ gated: true });
    expect((await f.raw(LIST)).status).toBe(200);
    expect((await f.app.request("/mcp", { method: "GET", headers: bearer(f.secret) })).status).toBe(405);
    for (const method of ["PUT", "DELETE", "PATCH"]) {
      expect((await f.app.request("/mcp", { method, headers: bearer(f.secret) })).status, method).toBe(401);
    }
  });

  it("refuses /mcp to a request carrying only the gate cookie", async () => {
    const f = await mcpFixture({ gated: true });
    const res = await f.raw(LIST, { authorization: undefined, cookie: `${GATE_COOKIE}=${gateToken(GATE_KEY, TEAM_CODE)}` });
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toMatch(/^Bearer/);
  });
});

// Owner: tokens/redact.ts, app.ts onError, mcp/results.ts runTool, tokens/service.ts, tokens/routes.ts.
describe("§6.5 token secrecy", () => {
  it("is never logged: a 500 that quotes the Authorization header logs it redacted", async () => {
    vi.stubEnv("RAILWAY_ENVIRONMENT_NAME", "production");
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const f = await mcpFixture();
    const app = createApp({ db: f.db, dataDir: f.dataDir, teamCode: null });
    app.post("/api/echo-auth", c => { throw new Error(`upstream refused ${c.req.header("authorization")}`); });
    expect((await app.request("/api/echo-auth", { method: "POST", headers: bearer(f.secret) })).status).toBe(500);
    expect(printedBy(logged)).toContain("[redacted]");
    expect(printedBy(logged)).not.toContain(f.secret);
  });

  it("is never logged when a tool fails", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const f = await mcpFixture();
    await f.db.delete(buildings);
    expect((await call(await f.connect(), "list_floors")).isError).toBe(true);
    expect(logged).toHaveBeenCalled();
    expect(printedBy(logged)).not.toContain(f.secret);
  });

  it("has no request logger that could print a header", async () => {
    const root = join(here, "..");
    const files = (await readdir(root, { recursive: true }))
      .filter(file => file.endsWith(".ts") && !file.endsWith(".test.ts"));
    for (const file of files) {
      expect((await readFile(join(root, file), "utf8")).includes("hono/logger"), file).toBe(false);
    }
  });

  it("never appears in audit rows, and the tokens table keeps only its hash", async () => {
    const f = await mcpFixture();
    const client = await f.connect();
    await call(client, "create", { type: "room", data: ROOM });
    await call(client, "update", { type: "room", id: ROOM.id, expectedVersion: 0, data: { nameEn: "Starbucks" } });
    const trail = JSON.stringify(await f.db.select().from(auditLog));
    expect(trail).not.toContain(f.secret);
    expect(trail).not.toContain(hashToken(f.secret));
    const table = JSON.stringify(await f.db.select().from(apiTokens));
    expect(table).not.toContain(f.secret);
    expect((await f.db.select().from(apiTokens).where(eq(apiTokens.id, f.tokenId)))[0]?.tokenHash).toBe(hashToken(f.secret));
  });

  it("is shown exactly once: in the answer that makes it, and never in a list", async () => {
    const f = await mcpFixture();
    const cookie = await signIn(f, f.wei.id);
    const made = await json<{ secret: string }>(await f.app.request("/api/tokens", {
      method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify({ name: "Once" }),
    }));
    expect(made.secret).toMatch(/^oth_pat_/);
    const listed = await (await f.app.request("/api/tokens", { headers: { cookie } })).text();
    expect(listed).not.toContain(made.secret);
    expect(listed).not.toContain(hashToken(made.secret));
  });
});

// Owner: tokens/service.ts resolveToken, tokens/policy.ts.
describe("§6.5 token lifecycle", () => {
  it("needs the oth_pat_ prefix", async () => {
    const f = await mcpFixture();
    const res = await f.raw(LIST, bearer(f.secret.replace("oth_pat_", "oth_xxx_")));
    expect(res.status).toBe(401);
  });

  it("ends after 90 days", async () => {
    const f = await mcpFixture();
    const young = await mintToken(f.db, f.wei, { name: "young", mayPublish: false }, new Date(Date.now() - 89 * DAY));
    const old = await mintToken(f.db, f.wei, { name: "old", mayPublish: false }, new Date(Date.now() - 91 * DAY));
    expect((await f.raw(LIST, bearer(young.secret))).status).toBe(200);
    expect((await f.raw(LIST, bearer(old.secret))).status).toBe(401);
  });

  it("ends on revocation, by anyone, from the very next call", async () => {
    const f = await mcpFixture();
    const amy = await createUser(f.db, { email: "amy@example.com", password: "unused", displayName: "Amy" });
    const client = await f.connect();
    expect((await call(client, "list_floors")).isError).toBe(false);
    const cookie = await signIn(f, amy.id);
    expect((await f.app.request(`/api/tokens/${f.tokenId}`, { method: "DELETE", headers: { cookie } })).status).toBe(204);
    await expect(client.callTool({ name: "list_floors", arguments: {} })).rejects.toMatchObject({ code: 401 });
  });

  it("ends when its person is disabled", async () => {
    const f = await mcpFixture();
    await f.db.update(users).set({ disabledAt: new Date() }).where(eq(users.id, f.wei.id));
    expect((await f.raw(LIST)).status).toBe(401);
  });

  it("outlives a change of team code", async () => {
    const f = await mcpFixture({ gated: true });
    const renamed = createApp({ db: f.db, dataDir: f.dataDir, teamCode: "a different team code", gateKey: GATE_KEY });
    const res = await renamed.request("/mcp", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...bearer(f.secret) },
      body: JSON.stringify(LIST),
    });
    expect(res.status).toBe(200);
  });
});

// Owner: gate/gate.ts, tokens/routes.ts (requireUser), mcp/tools/edit.ts.
describe("§6.5 token scope", () => {
  it("reaches /mcp and nothing else, gate or no gate", async () => {
    const routes: [string, string][] = [
      ["GET", "/api/model"], ["GET", "/api/model/validate"], ["POST", "/api/entities/room"],
      ["PATCH", "/api/entities/level/oth-L1"], ["GET", "/api/tokens"], ["POST", "/api/tokens"],
      ["POST", "/api/users/invite"], ["POST", "/api/publish"], ["GET", "/api/auth/me"], ["GET", "/api/keyframes"],
      ["POST", "/api/places/pl_1/accept"], ["GET", "/api/locks"],
    ];
    for (const gated of [true, false]) {
      const f = await mcpFixture({ gated });
      for (const [method, path] of routes) {
        const res = await f.app.request(path, {
          method, headers: { "content-type": "application/json", ...bearer(f.secret) },
          body: method === "GET" ? undefined : "{}",
        });
        expect(res.status, `${gated ? "gated" : "open"} ${method} ${path}`).toBe(401);
      }
      if (gated) {
        for (const page of ["/", "/floors/L1/build", "/team"]) {
          expect((await f.app.request(page, { headers: bearer(f.secret) })).status, page).toBe(401);
        }
      }
    }
  });

  it("can't make tokens, add teammates or change floor owners", async () => {
    const f = await mcpFixture();
    const client = await f.connect();
    const names = (await client.listTools()).tools.map(t => t.name);
    expect(names.filter(n => /token|invite|user|owner|team/i.test(n))).toEqual([]);
    const amy = await createUser(f.db, { email: "amy@example.com", password: "unused", displayName: "Amy" });
    expect((await call(client, "update", { type: "level", id: "oth-L1", expectedVersion: 0, data: { ownerIds: [amy.id] } })).isError).toBe(true);
    expect((await call(client, "create", { type: "level", data: {
      id: "oth-L3", buildingId: "oth", code: "L3", ordinal: 3, nameEn: "Level 3", nameZh: "三楼", elevationM: 10, heightM: 4, ownerIds: [amy.id],
    } })).isError).toBe(true);
    expect((await f.db.select().from(levels).where(eq(levels.id, "oth-L1")))[0]?.ownerIds).toEqual([f.wei.id]);
    expect(await f.db.select().from(levels).where(eq(levels.id, "oth-L3"))).toEqual([]);
  });
});

// Owner: mcp/route.ts, the tools' zod shapes, entities/registry.ts via the repository.
describe("§6.5 input", () => {
  it("refuses any request with an Origin header, gate or no gate, cookie or not", async () => {
    const open = await mcpFixture();
    expect((await open.raw(LIST, { origin: "https://example.com" })).status).toBe(403);
    const gated = await mcpFixture({ gated: true });
    expect((await gated.raw(LIST, { origin: "https://example.com" })).status).toBe(401);
    const cookie = `${GATE_COOKIE}=${gateToken(GATE_KEY, TEAM_CODE)}`;
    expect((await gated.raw(LIST, { origin: "https://example.com", cookie })).status).toBe(403);
  });

  it("enforces the body limit", async () => {
    const f = await mcpFixture();
    expect((await f.raw({ ...LIST, params: { pad: "x".repeat(LIMITS.bodyBytes) } })).status).toBe(413);
  });

  it("checks every tool input with zod, then with the model's schema", async () => {
    const f = await mcpFixture();
    const client = await f.connect();
    const shape = await call(client, "get", { type: "spaceship", id: "x" });
    expect(shape.isError).toBe(true);
    expect(shape.text).toMatch(/Input validation error/);
    const model = await call(client, "create", { type: "room", data: { ...ROOM, footprint: [[0, 0], [1, 1]] } });
    expect(model.isError).toBe(true);
    expect(model.text).toMatch(/^Not saved: footprint/);
    expect(await f.db.select().from(rooms)).toEqual([]);
  });
});

// Owner: mcp/tools/edit.ts, mcp/tools/publish.ts, tokens/policy.ts, mcp/limits.ts, entities/via.ts.
describe("§6.5 prompt injection: the mitigations hold", () => {
  it("never hard-deletes: a delete leaves the row, marked deleted", async () => {
    const f = await mcpFixture();
    await createEntity(f.db, "room", ROOM, f.wei.id);
    await call(await f.connect(), "delete", { type: "room", id: ROOM.id, expectedVersion: 0 });
    expect((await f.db.select().from(rooms).where(eq(rooms.id, ROOM.id)))[0]?.deletedAt).toBeInstanceOf(Date);
  });

  it("keeps publishing off by default", async () => {
    const f = await mcpFixture();
    const cookie = await signIn(f, f.wei.id);
    const made = await json<{ token: { mayPublish: boolean }; secret: string }>(await f.app.request("/api/tokens", {
      method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify({ name: "Default" }),
    }));
    expect(made.token.mayPublish).toBe(false);
    const client = await f.connect(made.secret);
    const refused = await client.callTool({ name: "publish", arguments: {} }).then(r => r.isError === true, () => true);
    expect(refused).toBe(true);
    expect(await f.db.select().from(publishedVersions)).toEqual([]);
  });

  it("marks delete and publish destructive, reads read-only, and no other write either", async () => {
    const f = await mcpFixture();
    const { tools } = await (await f.connect()).listTools();
    for (const tool of tools) {
      const hints = tool.annotations ?? {};
      expect(hints.readOnlyHint === true, tool.name).toBe(READ_TOOLS.has(tool.name));
      if (READ_TOOLS.has(tool.name)) continue;
      expect(hints.destructiveHint, tool.name).toBe(tool.name === "delete" || tool.name === "publish");
    }
  });

  it("rate-limits a token's writes, with Retry-After, and writes nothing past the limit", async () => {
    const f = await mcpFixture({ deps: { mcp: { limits: new TokenLimits({ ...LIMITS, writesPerMinute: 2 }) } } });
    const create = (id: string) => f.raw({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "create", arguments: { type: "room", data: { ...ROOM, id } } } });
    expect((await create("r-1")).status).toBe(200);
    expect((await create("r-2")).status).toBe(200);
    const third = await create("r-3");
    expect(third.status).toBe(429);
    expect(Number(third.headers.get("retry-after"))).toBeGreaterThan(0);
    expect((await f.db.select().from(rooms)).map(r => r.id).sort()).toEqual(["r-1", "r-2"]);
  });

  it("leaves a via trail: Wei via Claude Code, and Wei alone for Wei's own edits", async () => {
    const f = await mcpFixture();
    await call(await f.connect(), "create", { type: "room", data: ROOM });
    await updateEntity(f.db, "room", ROOM.id, 0, { nameEn: "Starbucks" }, f.wei.id);
    const trail = await f.db.select().from(auditLog).where(eq(auditLog.entityId, ROOM.id));
    expect(trail.map(r => [r.action, r.actorId, r.via]).sort()).toEqual([
      ["create", f.wei.id, f.tokenId],
      ["update", f.wei.id, null],
    ]);
  });
});

// Owner: mcp/tools/edit.ts (Ruling 14), mcp/tools/setup.ts. Claude may decide a
// draft (decide_drafts, spec §7.2), but its shape and PDF checksum only ever
// come from Find rooms in a person's browser.
describe("§6.5 prompt injection: a draft's shape comes only from Find rooms", () => {
  const SOURCE = { checksum: "a".repeat(64), page: 1 };
  const SHOP = { nameEn: "Shop 12", kind: "room", footprint: ROOM.footprint, labelPoint: [15, 35], areaM2: 100 };
  const waitingDraft = async (f: McpFixture) => String((await replaceDrafts(f.db, "oth-L1", SOURCE, [SHOP], f.wei.id))[0]!.id);

  it("refuses to create one, whose made-up shape and checksum a person's accept would stamp on a room", async () => {
    const f = await mcpFixture();
    const made = await call(await f.connect(), "create", {
      type: "roomDraft", data: { ...SHOP, id: "rd-claude", levelId: "oth-L1", source: SOURCE },
    });
    expect(made.isError).toBe(true);
    expect(made.text).toBe(DRAFTS);
    expect(await f.db.select().from(roomDrafts)).toEqual([]);
  });

  it("refuses to change one, its name or its shape", async () => {
    const f = await mcpFixture();
    const id = await waitingDraft(f);
    const client = await f.connect();
    for (const data of [{ nameEn: "Starbucks" }, { footprint: [[0, 0], [50, 0], [50, 50], [0, 50]] }]) {
      const changed = await call(client, "update", { type: "roomDraft", id, expectedVersion: 0, data });
      expect(changed.isError, JSON.stringify(data)).toBe(true);
      expect(changed.text).toBe(DRAFTS);
    }
    expect((await listDrafts(f.db, "oth-L1")).map(d => [d.nameEn, d.version])).toEqual([["Shop 12", 0]]);
  });

  it("lets no tool write acceptedRoomId, so a reject and a person's undo can't take a room off the map", async () => {
    const f = await mcpFixture();
    await createEntity(f.db, "room", ROOM, f.wei.id);
    const id = await waitingDraft(f);
    const client = await f.connect();
    const { tools } = await client.listTools();
    expect(tools.filter(t => JSON.stringify(t.inputSchema).includes("acceptedRoomId")).map(t => t.name)).toEqual([]);
    const marked = await call(client, "update", { type: "roomDraft", id, expectedVersion: 0, data: { acceptedRoomId: ROOM.id } });
    expect(marked.text).toBe(DRAFTS);
    const made = await call(client, "create", {
      type: "roomDraft", data: { ...SHOP, id: "rd-claude", levelId: "oth-L1", source: SOURCE, acceptedRoomId: ROOM.id },
    });
    expect(made.text).toBe(DRAFTS);

    // Claude may reject a draft, softly, and restore it.
    expect((await call(client, "delete", { type: "roomDraft", id, expectedVersion: 0 })).isError).toBe(false);
    // Rejected but never accepted, it has no room for the accept's undo to take away.
    const cookie = await signIn(f, f.wei.id);
    const undo = await f.app.request(`/api/room-drafts/${id}/unaccept`, {
      method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify({ expectedVersion: 1, roomVersion: 0 }),
    });
    expect(undo.status).toBe(422);
    expect((await f.db.select().from(rooms).where(eq(rooms.id, ROOM.id)))[0]?.deletedAt).toBeNull();
    expect((await call(client, "restore", { type: "roomDraft", id, expectedVersion: 1 })).isError).toBe(false);
    expect((await listDrafts(f.db, "oth-L1")).map(d => d.id)).toEqual([id]);
    expect((await f.db.select().from(roomDrafts).where(eq(roomDrafts.id, id)))[0]?.acceptedRoomId).toBeNull();
  });
});

// Owner: mcp/limits.ts, mcp/route.ts.
describe("§6.5 per-token limits", () => {
  it("keeps one token's limit off another's", async () => {
    const f = await mcpFixture({ deps: { mcp: { limits: new TokenLimits({ ...LIMITS, readsPerMinute: 1 }) } } });
    const amy = await createUser(f.db, { email: "amy@example.com", password: "unused", displayName: "Amy" });
    const theirs = await mintToken(f.db, amy, { name: "Amy's", mayPublish: false });
    expect((await f.raw(LIST)).status).toBe(200);
    expect((await f.raw(LIST)).status).toBe(429);
    expect((await f.raw(LIST, bearer(theirs.secret))).status).toBe(200);
  });

  it("holds a second publish inside ten minutes before any tool runs", async () => {
    const limits = new TokenLimits();
    const f = await mcpFixture({ mayPublish: true, deps: { mcp: { limits } } });
    limits.claimPublish(f.tokenId, Date.now());
    const res = await f.raw({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "publish", arguments: {} } });
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(500);
  });

  it("turns a fifth request away while four are in flight", async () => {
    const limits = new TokenLimits();
    const f = await mcpFixture({ deps: { mcp: { limits } } });
    for (let i = 0; i < LIMITS.inFlight; i++) limits.enter(f.tokenId);
    expect((await f.raw(LIST)).status).toBe(429);
  });
});

// Owner: mcp/tools/read.ts (view_frame's FRAME_WIDTH).
describe("§6.5 what leaves the server", () => {
  it("sends a frame no wider than 1600 px", async () => {
    const f = await mcpFixture();
    await f.db.insert(captures).values({ id: "cap_1", kind: "video", filename: "walk.mp4", levelId: "oth-L1" });
    const frame = await sharp({ create: { width: 3840, height: 200, channels: 3, background: "#777777" } }).jpeg().toBuffer();
    const stored = await storeAsset(f.dataDir, new Uint8Array(frame), "jpg");
    await f.db.insert(keyframes).values({
      id: "kf_1", captureId: "cap_1", timeMs: 0, imageId: "kf_1", storagePath: stored.storagePath, checksum: stored.checksum,
      widthPx: 3840, heightPx: 200, sizeBytes: frame.length,
    });
    const { result } = await call(await f.connect(), "view_frame", { frameId: "kf_1" });
    const image = result.content[0] as { type: "image"; data: string };
    expect((await sharp(Buffer.from(image.data, "base64")).metadata()).width).toBe(1600);
  });
});

// Owner: gate/gate.ts claudeCodeCall, mcp/route.ts, tokens/routes.ts. The
// plan's Ruling 1: three security-sensitive choices, each tested here.
describe("Ruling 1: the plan's three open points", () => {
  it("(a) answers GET /mcp with 405 past the gate, without reading the token, and opens nothing", async () => {
    const f = await mcpFixture({ gated: true });
    const res = await f.app.request("/mcp", { method: "GET", headers: bearer(`oth_pat_${"x".repeat(43)}`) });
    expect(res.status).toBe(405);
    expect(await res.text()).not.toContain("jsonrpc");
  });

  it("(b) keeps a token already in use working through a flood of made-up ones", async () => {
    const f = await mcpFixture({ deps: { mcp: { badTokens: new BadTokens({ max: 2, windowMs: 60_000 }) } } });
    const client = await f.connect();
    for (const fill of ["a", "b"]) expect((await f.raw(LIST, bearer(`oth_pat_${fill.repeat(43)}`))).status).toBe(401);
    expect((await f.raw(LIST, bearer(`oth_pat_${"c".repeat(43)}`))).status).toBe(429);
    expect((await call(client, "list_floors")).isError).toBe(false);
  });

  it("(c) tells a person, once, at their next sign-in, of a token made in their name", async () => {
    const f = await mcpFixture();
    const cookie = await signIn(f, f.wei.id);
    const notices = async () =>
      (await json<{ notices: { name: string }[] }>(await f.app.request("/api/tokens/notices", { method: "POST", headers: { cookie } }))).notices;
    expect((await notices()).map(n => n.name)).toEqual(["Wei's laptop"]);
    expect(await notices()).toEqual([]);
  });
});

// Spec §9: "the SDK's own client against the app, in process".
describe("MCP end to end", () => {
  it("initialises, lists the tools, meets a conflict, and is refused a publish without the scope", async () => {
    const f = await mcpFixture({ gated: true });
    const client = await f.connect();
    expect(client.getServerVersion()?.name).toBe("oth-map");
    const names = (await client.listTools()).tools.map(t => t.name);
    expect(names).toEqual(expect.arrayContaining([
      "list_floors", "get_floor", "get", "check_floor", "list_frames", "view_frame", "view_plan",
      "tag_frame", "review_place", "bind_place", "create", "update", "delete", "restore",
    ]));
    await createEntity(f.db, "room", ROOM, f.wei.id);
    await updateEntity(f.db, "room", ROOM.id, 0, { nameEn: "Starbucks" }, f.wei.id);
    const conflict = await call(client, "update", { type: "room", id: ROOM.id, expectedVersion: 0, data: { nameEn: "X" } });
    expect(conflict.isError).toBe(true);
    expect(conflict.text).toMatch(/^Not saved: room L1-shop-12 is at version 1 and you sent 0\. Wei changed it at /);
    const refused = await client.callTool({ name: "publish", arguments: {} }).then(r => r.isError === true, () => true);
    expect(refused).toBe(true);
    expect(await f.db.select().from(publishedVersions)).toEqual([]);
  });
});
