import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app";
import type { Database } from "../db/client";
import { users } from "../db/schema";
import { createTestDb } from "../testing/harness";
import { createUser } from "./users";

let db: Database;
let app: ReturnType<typeof createApp>;

beforeEach(async () => {
  db = await createTestDb();
  app = createApp({ db });
  await createUser(db, {
    email: "wei@example.com",
    password: "a-good-passphrase",
    displayName: "Wei",
  });
});

function login(email: string, password: string) {
  return app.request("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
}

describe("auth routes", () => {
  it("logs in with correct credentials and sets an httpOnly cookie", async () => {
    const res = await login("wei@example.com", "a-good-passphrase");
    expect(res.status).toBe(200);
    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
  });

  it("rejects a wrong password with 401", async () => {
    expect((await login("wei@example.com", "wrong")).status).toBe(401);
  });

  it("gives the same 401 for an unknown email, so accounts cannot be enumerated", async () => {
    const unknown = await login("nobody@example.com", "a-good-passphrase");
    const wrong = await login("wei@example.com", "wrong");
    expect(unknown.status).toBe(401);
    expect(await unknown.json()).toEqual(await wrong.json());
  });

  it("returns the current user for a valid session", async () => {
    const cookie = (await login("wei@example.com", "a-good-passphrase")).headers.get("set-cookie") ?? "";
    const me = await app.request("/api/auth/me", { headers: { cookie } });
    expect(me.status).toBe(200);
    const body = (await me.json()) as { user: { displayName: string } };
    expect(body.user.displayName).toBe("Wei");
  });

  it("never returns the password hash", async () => {
    const res = await login("wei@example.com", "a-good-passphrase");
    expect(JSON.stringify(await res.json())).not.toContain("scrypt$");
  });

  it("401s /api/auth/me without a session", async () => {
    expect((await app.request("/api/auth/me")).status).toBe(401);
  });

  it("invalidates the session on logout", async () => {
    const cookie = (await login("wei@example.com", "a-good-passphrase")).headers.get("set-cookie") ?? "";
    await app.request("/api/auth/logout", { method: "POST", headers: { cookie } });
    expect((await app.request("/api/auth/me", { headers: { cookie } })).status).toBe(401);
  });

  it("rejects a session whose user has since been disabled", async () => {
    const cookie = (await login("wei@example.com", "a-good-passphrase")).headers.get("set-cookie") ?? "";
    await db.update(users).set({ disabledAt: new Date() }).where(eq(users.email, "wei@example.com"));
    expect((await app.request("/api/auth/me", { headers: { cookie } })).status).toBe(401);
  });

  it("says in the session when the password is a one-time one", async () => {
    const cookie = (await login("wei@example.com", "a-good-passphrase")).headers.get("set-cookie") ?? "";
    const me = await (await app.request("/api/auth/me", { headers: { cookie } })).json() as {
      user: { mustChangePassword: boolean };
    };
    expect(me.user.mustChangePassword).toBe(false);

    await db.update(users).set({ mustChangePassword: true }).where(eq(users.email, "wei@example.com"));
    const again = await (await app.request("/api/auth/me", { headers: { cookie } })).json() as {
      user: { mustChangePassword: boolean };
    };
    expect(again.user.mustChangePassword).toBe(true);
  });

  describe("changing your password", () => {
    async function signedIn() {
      return (await login("wei@example.com", "a-good-passphrase")).headers.get("set-cookie") ?? "";
    }
    const change = (cookie: string, body: unknown) => app.request("/api/auth/password", {
      method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify(body),
    });

    it("sets the new password and clears the one-time flag", async () => {
      const cookie = await signedIn();
      await db.update(users).set({ mustChangePassword: true }).where(eq(users.email, "wei@example.com"));
      const res = await change(cookie, { currentPassword: "a-good-passphrase", newPassword: "another-good-one" });
      expect(res.status).toBe(204);
      expect((await login("wei@example.com", "another-good-one")).status).toBe(200);
      const [row] = await db.select().from(users).where(eq(users.email, "wei@example.com"));
      expect(row!.mustChangePassword).toBe(false);
    });

    it("says the current password is wrong without signing you out", async () => {
      // 422, not 401: a mistyped password must not read as a lost session.
      const cookie = await signedIn();
      const res = await change(cookie, { currentPassword: "nope", newPassword: "another-good-one" });
      expect(res.status).toBe(422);
      expect((await app.request("/api/auth/me", { headers: { cookie } })).status).toBe(200);
    });

    it("refuses a new password under ten characters", async () => {
      const cookie = await signedIn();
      expect((await change(cookie, { currentPassword: "a-good-passphrase", newPassword: "short" })).status).toBe(400);
    });
  });
});
