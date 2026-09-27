import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app";
import type { Database } from "../db/client";
import { users } from "../db/schema";
import { createTestDb, json } from "../testing/harness";
import { createUser } from "./users";

let db: Database;
let app: ReturnType<typeof createApp>;
let wei: { id: string; email: string; displayName: string };

beforeEach(async () => {
  db = await createTestDb();
  app = createApp({ db });
  wei = await createUser(db, {
    email: "wei@example.com",
    password: "a-good-passphrase",
    displayName: "Wei",
  });
});

function login(userId: string) {
  return app.request("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ userId }),
  });
}

describe("who you can sign in as", () => {
  it("is public, and needs no session", async () => {
    const res = await app.request("/api/auth/people");
    expect(res.status).toBe(200);
    const body = await json<{ people: { id: string; displayName: string }[] }>(res);
    expect(body.people).toEqual([{ id: wei.id, displayName: "Wei" }]);
  });

  it("sorts by name, case-insensitively", async () => {
    await createUser(db, { email: "b@example.com", password: "x".repeat(12), displayName: "bea" });
    await createUser(db, { email: "a@example.com", password: "x".repeat(12), displayName: "Aisha" });
    const body = await json<{ people: { displayName: string }[] }>(await app.request("/api/auth/people"));
    expect(body.people.map(p => p.displayName)).toEqual(["Aisha", "bea", "Wei"]);
  });

  it("never includes email or anything else", async () => {
    const text = JSON.stringify(await json(await app.request("/api/auth/people")));
    expect(text).not.toContain("example.com");
  });

  it("leaves out a disabled account", async () => {
    await db.update(users).set({ disabledAt: new Date() }).where(eq(users.id, wei.id));
    const body = await json<{ people: unknown[] }>(await app.request("/api/auth/people"));
    expect(body.people).toEqual([]);
  });
});

describe("auth routes", () => {
  it("signs in by id and sets an httpOnly cookie", async () => {
    const res = await login(wei.id);
    expect(res.status).toBe(200);
    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    const body = await json<{ user: { displayName: string } }>(res);
    expect(body.user.displayName).toBe("Wei");
  });

  it("rejects an id nobody has, so picking a name from the list is the only way in", async () => {
    const res = await login("user_nope");
    expect(res.status).toBe(401);
    expect(await json<{ error: string }>(res)).toEqual({ error: "Pick your name from the list." });
  });

  it("rejects a malformed body the same way", async () => {
    const res = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(401);
  });

  it("returns the current user for a valid session", async () => {
    const cookie = (await login(wei.id)).headers.get("set-cookie") ?? "";
    const me = await app.request("/api/auth/me", { headers: { cookie } });
    expect(me.status).toBe(200);
    const body = (await me.json()) as { user: { displayName: string } };
    expect(body.user.displayName).toBe("Wei");
  });

  it("never returns the password hash", async () => {
    const res = await login(wei.id);
    expect(JSON.stringify(await res.json())).not.toContain("scrypt$");
  });

  it("never returns mustChangePassword: there is no password to change", async () => {
    const res = await login(wei.id);
    expect(JSON.stringify(await res.json())).not.toContain("mustChangePassword");
  });

  it("401s /api/auth/me without a session", async () => {
    expect((await app.request("/api/auth/me")).status).toBe(401);
  });

  it("invalidates the session on logout", async () => {
    const cookie = (await login(wei.id)).headers.get("set-cookie") ?? "";
    await app.request("/api/auth/logout", { method: "POST", headers: { cookie } });
    expect((await app.request("/api/auth/me", { headers: { cookie } })).status).toBe(401);
  });

  it("rejects a session whose user has since been disabled", async () => {
    const cookie = (await login(wei.id)).headers.get("set-cookie") ?? "";
    await db.update(users).set({ disabledAt: new Date() }).where(eq(users.id, wei.id));
    expect((await app.request("/api/auth/me", { headers: { cookie } })).status).toBe(401);
  });

  it("refuses to sign in as a disabled account too", async () => {
    await db.update(users).set({ disabledAt: new Date() }).where(eq(users.id, wei.id));
    expect((await login(wei.id)).status).toBe(401);
  });
});
