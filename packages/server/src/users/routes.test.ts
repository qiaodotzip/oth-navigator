import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { createUser } from "../auth/users";
import type { Database } from "../db/client";
import { auditLog, users } from "../db/schema";
import { createTestDb, json } from "../testing/harness";

let db: Database;
let app: ReturnType<typeof createApp>;
let cookie: string;

const post = (path: string, body: unknown, headers: Record<string, string> = { cookie }) =>
  app.request(path, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

async function login(email: string, password: string) {
  return app.request("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
}

beforeEach(async () => {
  db = await createTestDb();
  app = createApp({ db });
  await createUser(db, { email: "wei@example.com", password: "passphrase-1", displayName: "Wei" });
  cookie = (await login("wei@example.com", "passphrase-1")).headers.get("set-cookie") ?? "";
});

describe("the team", () => {
  it("lists everyone on it, without anyone's password hash", async () => {
    const body = await json<{ users: Record<string, unknown>[] }>(await app.request("/api/users", { headers: { cookie } }));
    expect(body.users).toEqual([{ id: expect.any(String), email: "wei@example.com", displayName: "Wei" }]);
  });

  it("leaves out a disabled account", async () => {
    const ghost = await createUser(db, { email: "ghost@example.com", password: "x".repeat(12), displayName: "Ghost" });
    await db.update(users).set({ disabledAt: new Date() }).where(eq(users.id, ghost.id));
    const body = await json<{ users: { email: string }[] }>(await app.request("/api/users", { headers: { cookie } }));
    expect(body.users.map(u => u.email)).toEqual(["wei@example.com"]);
  });

  it("requires a signed-in teammate", async () => {
    expect((await app.request("/api/users")).status).toBe(401);
  });
});

describe("inviting", () => {
  it("creates the account and hands back its one-time password, once", async () => {
    const res = await post("/api/users/invite", { email: "Aisha@Example.com", displayName: "Aisha" });
    expect(res.status).toBe(201);
    const body = await json<{ user: { email: string }; password: string }>(res);
    expect(body.user.email).toBe("aisha@example.com");
    const signIn = await login("aisha@example.com", body.password);
    expect(signIn.status).toBe(200);
    expect((await json<{ user: { mustChangePassword: boolean } }>(signIn)).user.mustChangePassword).toBe(true);
  });

  it("refuses an email already on the team", async () => {
    expect((await post("/api/users/invite", { email: "wei@example.com", displayName: "Wei again" })).status).toBe(409);
  });

  it("refuses a body that is not an invite", async () => {
    expect((await post("/api/users/invite", { email: "not-an-email", displayName: "" })).status).toBe(400);
  });

  it("records who invited whom", async () => {
    await post("/api/users/invite", { email: "aisha@example.com", displayName: "Aisha" });
    const rows = await db.select().from(auditLog).where(eq(auditLog.action, "invite"));
    expect(rows).toHaveLength(1);
  });
});

describe("resetting a password", () => {
  it("issues a new one-time password and retires the old one", async () => {
    const invited = await json<{ user: { id: string }; password: string }>(
      await post("/api/users/invite", { email: "aisha@example.com", displayName: "Aisha" }),
    );
    const res = await post(`/api/users/${invited.user.id}/reset-password`, {});
    expect(res.status).toBe(200);
    const fresh = await json<{ password: string }>(res);
    expect(fresh.password).not.toBe(invited.password);
    expect((await login("aisha@example.com", invited.password)).status).toBe(401);
    expect((await login("aisha@example.com", fresh.password)).status).toBe(200);
  });

  it("is written to the audit log", async () => {
    const me = await json<{ user: { id: string } }>(await app.request("/api/auth/me", { headers: { cookie } }));
    await post(`/api/users/${me.user.id}/reset-password`, {});
    const rows = await db.select().from(auditLog).where(eq(auditLog.action, "reset-password"));
    expect(rows).toHaveLength(1);
  });

  it("404s someone who is not on the team", async () => {
    expect((await post("/api/users/user_nope/reset-password", {})).status).toBe(404);
  });
});

describe("the last publish", () => {
  it("is null before anything has been published", async () => {
    const body = await json<{ latest: unknown }>(await app.request("/api/publish/latest", { headers: { cookie } }));
    expect(body.latest).toBeNull();
  });
});
