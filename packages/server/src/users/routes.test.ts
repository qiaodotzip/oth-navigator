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
let wei: { id: string };

const post = (path: string, body: unknown, headers: Record<string, string> = { cookie }) =>
  app.request(path, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

async function login(userId: string) {
  return app.request("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ userId }),
  });
}

beforeEach(async () => {
  db = await createTestDb();
  app = createApp({ db });
  wei = await createUser(db, { email: "wei@example.com", password: "passphrase-1", displayName: "Wei" });
  cookie = (await login(wei.id)).headers.get("set-cookie") ?? "";
});

describe("the team", () => {
  it("lists everyone on it by name, without email or a password hash", async () => {
    const body = await json<{ users: Record<string, unknown>[] }>(await app.request("/api/users", { headers: { cookie } }));
    expect(body.users).toEqual([{ id: wei.id, displayName: "Wei" }]);
  });

  it("leaves out a disabled account", async () => {
    const ghost = await createUser(db, { email: "ghost@example.com", password: "x".repeat(12), displayName: "Ghost" });
    await db.update(users).set({ disabledAt: new Date() }).where(eq(users.id, ghost.id));
    const body = await json<{ users: { displayName: string }[] }>(await app.request("/api/users", { headers: { cookie } }));
    expect(body.users.map(u => u.displayName)).toEqual(["Wei"]);
  });

  it("requires a signed-in teammate", async () => {
    expect((await app.request("/api/users")).status).toBe(401);
  });
});

describe("adding a teammate", () => {
  it("creates the account by name alone, ready to sign in by picking it", async () => {
    const res = await post("/api/users/invite", { displayName: "Aisha" });
    expect(res.status).toBe(201);
    const body = await json<{ user: { id: string; displayName: string } }>(res);
    expect(body.user.displayName).toBe("Aisha");
    expect(Object.keys(body.user).sort()).toEqual(["displayName", "id"]);

    const signIn = await login(body.user.id);
    expect(signIn.status).toBe(200);
  });

  it("refuses a name already on the team, case-insensitively", async () => {
    const res = await post("/api/users/invite", { displayName: "wei" });
    expect(res.status).toBe(409);
    expect(await json<{ error: string }>(res)).toEqual({ error: "Someone called wei is already on the team." });
  });

  it("refuses a body that is not an invite", async () => {
    expect((await post("/api/users/invite", { displayName: "" })).status).toBe(400);
  });

  it("refuses a name over 80 characters", async () => {
    expect((await post("/api/users/invite", { displayName: "x".repeat(81) })).status).toBe(400);
  });

  it("records who added whom", async () => {
    await post("/api/users/invite", { displayName: "Aisha" });
    const rows = await db.select().from(auditLog).where(eq(auditLog.action, "invite"));
    expect(rows).toHaveLength(1);
  });

  it("a disabled name can be reused: it no longer collides", async () => {
    const ghost = await createUser(db, { email: "ghost@example.com", password: "x".repeat(12), displayName: "Ghost" });
    await db.update(users).set({ disabledAt: new Date() }).where(eq(users.id, ghost.id));
    expect((await post("/api/users/invite", { displayName: "Ghost" })).status).toBe(201);
  });
});

describe("no password routes remain", () => {
  it("404s the removed change-password route", async () => {
    expect((await post("/api/auth/password", { currentPassword: "a", newPassword: "b" })).status).toBe(404);
  });

  it("404s the removed reset-password route", async () => {
    expect((await post(`/api/users/${wei.id}/reset-password`, {})).status).toBe(404);
  });
});

describe("the last publish", () => {
  it("is null before anything has been published", async () => {
    const body = await json<{ latest: unknown }>(await app.request("/api/publish/latest", { headers: { cookie } }));
    expect(body.latest).toBeNull();
  });
});
