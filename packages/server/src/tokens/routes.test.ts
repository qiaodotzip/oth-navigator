import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { createUser } from "../auth/users";
import type { Database } from "../db/client";
import { apiTokens, auditLog } from "../db/schema";
import { createTestDb, json } from "../testing/harness";
import { hashToken, type TokenListing } from "./service";

let db: Database;
let app: ReturnType<typeof createApp>;
let weiCookie: string;
let amyCookie: string;

async function signIn(userId: string): Promise<string> {
  const res = await app.request("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ userId }),
  });
  return res.headers.get("set-cookie") ?? "";
}

const send = (method: string, path: string, cookie: string, body?: unknown) =>
  app.request(path, {
    method,
    headers: { "content-type": "application/json", cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

type Made = { token: TokenListing; secret: string };

beforeEach(async () => {
  db = await createTestDb();
  app = createApp({ db, dataDir: await mkdtemp(join(tmpdir(), "oth-tokens-")) });
  const wei = await createUser(db, { email: "wei@example.com", password: "unused", displayName: "Wei" });
  const amy = await createUser(db, { email: "amy@example.com", password: "unused", displayName: "Amy" });
  weiCookie = await signIn(wei.id);
  amyCookie = await signIn(amy.id);
});

describe("the tokens routes", () => {
  it("make a token in your name and show it once, never to be read again", async () => {
    const res = await send("POST", "/api/tokens", weiCookie, { name: "Wei's laptop" });
    expect(res.status).toBe(201);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const made = await json<Made>(res);
    expect(made.secret).toMatch(/^oth_pat_[A-Za-z0-9_-]{43}$/);
    expect(made.token).toMatchObject({ name: "Wei's laptop", ownerName: "Wei", mayPublish: false, lastUsedAt: null });

    const listed = await (await send("GET", "/api/tokens", amyCookie)).text();
    expect(JSON.parse(listed)).toEqual({ tokens: [made.token], mayPublishByDefault: false });
    expect(listed).not.toContain(made.secret);
    expect(listed).not.toContain(hashToken(made.secret));
  });

  it("make one that may publish only when asked", async () => {
    const made = await json<Made>(await send("POST", "/api/tokens", weiCookie, { name: "Nightly", mayPublish: true }));
    expect(made.token.mayPublish).toBe(true);
  });

  it("let anyone revoke anyone's token, on the record", async () => {
    const made = await json<Made>(await send("POST", "/api/tokens", weiCookie, { name: "Wei's laptop" }));
    expect((await send("DELETE", `/api/tokens/${made.token.id}`, amyCookie)).status).toBe(204);
    expect((await json<{ tokens: unknown[] }>(await send("GET", "/api/tokens", weiCookie))).tokens).toEqual([]);
    const [row] = await db.select().from(apiTokens);
    expect(row?.revokedAt).toBeInstanceOf(Date);
    const audit = await db.select().from(auditLog);
    expect(audit.map(a => a.action).sort()).toEqual(["create", "revoke"]);
    expect(JSON.stringify(audit)).not.toContain(made.secret);
  });

  it("404 a token that does not exist", async () => {
    expect((await send("DELETE", "/api/tokens/tok_nope", weiCookie)).status).toBe(404);
  });

  it("ask for a name", async () => {
    const res = await send("POST", "/api/tokens", weiCookie, { name: "  " });
    expect(res.status).toBe(400);
    expect((await json<{ error: string }>(res)).error).toBe("Give the token a name, such as the laptop it is for.");
  });

  it("say plainly when you already have five", async () => {
    for (let i = 0; i < 5; i++) await send("POST", "/api/tokens", weiCookie, { name: `t${i}` });
    const res = await send("POST", "/api/tokens", weiCookie, { name: "sixth" });
    expect(res.status).toBe(409);
    expect((await json<{ error: string }>(res)).error).toBe(
      "You already have 5 Claude Code tokens. Revoke one you no longer use, then make this one.",
    );
  });

  it("are for a signed-in person only", async () => {
    expect((await app.request("/api/tokens")).status).toBe(401);
    expect((await app.request("/api/tokens", { method: "POST", body: "{}" })).status).toBe(401);
    expect((await app.request("/api/tokens/tok_1", { method: "DELETE" })).status).toBe(401);
  });

  it("refuse a valid Claude Code token in place of a sign-in, so a token can never make or end one", async () => {
    const made = await json<Made>(await send("POST", "/api/tokens", weiCookie, { name: "Wei's laptop" }));
    const bearer = (method: string, path: string, body?: unknown) =>
      app.request(path, {
        method,
        headers: { "content-type": "application/json", authorization: `Bearer ${made.secret}` },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    expect((await bearer("GET", "/api/tokens")).status).toBe(401);
    expect((await bearer("POST", "/api/tokens", { name: "Another" })).status).toBe(401);
    expect((await bearer("DELETE", `/api/tokens/${made.token.id}`)).status).toBe(401);
    const listed = await json<{ tokens: TokenListing[] }>(await send("GET", "/api/tokens", weiCookie));
    expect(listed.tokens).toEqual([made.token]);
  });

  it("tell the owner once about each token made in their name, and no one else", async () => {
    await send("POST", "/api/tokens", weiCookie, { name: "Wei's laptop" });
    // Amy asks first: were her claim to reach Wei's token, it would come back
    // here, and Wei would then be told nothing.
    expect((await json<{ notices: unknown[] }>(await send("POST", "/api/tokens/notices", amyCookie))).notices).toEqual([]);
    const first = await json<{ notices: { name: string }[] }>(await send("POST", "/api/tokens/notices", weiCookie));
    expect(first.notices.map(n => n.name)).toEqual(["Wei's laptop"]);
    expect((await json<{ notices: unknown[] }>(await send("POST", "/api/tokens/notices", weiCookie))).notices).toEqual([]);
  });

  it("tell only a token's id, name and when it was made", async () => {
    const made = await json<Made>(await send("POST", "/api/tokens", weiCookie, { name: "Wei's laptop" }));
    const raw = await (await send("POST", "/api/tokens/notices", weiCookie)).text();
    expect(JSON.parse(raw)).toEqual({
      notices: [{ id: made.token.id, name: "Wei's laptop", createdAt: made.token.createdAt }],
    });
    expect(raw).not.toContain(hashToken(made.secret));
  });

  it("never tell anyone about a token already revoked", async () => {
    const made = await json<Made>(await send("POST", "/api/tokens", weiCookie, { name: "Wei's laptop" }));
    await send("DELETE", `/api/tokens/${made.token.id}`, amyCookie);
    expect((await json<{ notices: unknown[] }>(await send("POST", "/api/tokens/notices", weiCookie))).notices).toEqual([]);
  });

  it("never tell anyone about a token already expired", async () => {
    await send("POST", "/api/tokens", weiCookie, { name: "Wei's laptop" });
    await db.update(apiTokens).set({ expiresAt: new Date(Date.now() - 1000) });
    expect((await json<{ notices: unknown[] }>(await send("POST", "/api/tokens/notices", weiCookie))).notices).toEqual([]);
  });
});
