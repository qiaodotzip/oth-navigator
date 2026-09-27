import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Database } from "../db/client";
import { verifyPassword } from "../auth/password";
import { createSession, resolveSession } from "../auth/sessions";
import { findUserByEmail } from "../auth/users";
import { users } from "../db/schema";
import { createTestDb } from "../testing/harness";
import { inviteUser, resetPassword } from "./invite";

describe("inviteUser", () => {
  it("creates a user with a generated passphrase it returns exactly once", async () => {
    const db = await createTestDb();
    const { user, password } = await inviteUser(db, "wei@example.com", "Wei");
    expect(user.email).toBe("wei@example.com");
    expect(password.length).toBeGreaterThanOrEqual(16);
    const row = await findUserByEmail(db, "wei@example.com");
    expect(await verifyPassword(password, row!.passwordHash)).toBe(true);
  });

  it("refuses to invite an email that already exists", async () => {
    const db = await createTestDb();
    await inviteUser(db, "wei@example.com", "Wei");
    await expect(inviteUser(db, "wei@example.com", "Wei Again")).rejects.toThrow(/already/i);
  });

  it("generates a different password each time", async () => {
    const db = await createTestDb();
    const a = await inviteUser(db, "a@example.com", "A");
    const b = await inviteUser(db, "b@example.com", "B");
    expect(a.password).not.toBe(b.password);
  });
});

describe("resetPassword", () => {
  let db: Database;
  beforeEach(async () => { db = await createTestDb(); });

  it("issues a password that works, when the old one is lost", async () => {
    await inviteUser(db, "wei@example.com", "Wei");
    const { password } = await resetPassword(db, "wei@example.com");
    const user = await findUserByEmail(db, "wei@example.com");
    expect(await verifyPassword(password, user!.passwordHash)).toBe(true);
  });

  it("retires the old password, so a leaked one stops working", async () => {
    const first = await inviteUser(db, "wei@example.com", "Wei");
    await resetPassword(db, "wei@example.com");
    const user = await findUserByEmail(db, "wei@example.com");
    expect(await verifyPassword(first.password, user!.passwordHash)).toBe(false);
  });

  it("keeps the same account, rather than making a second one", async () => {
    const first = await inviteUser(db, "wei@example.com", "Wei");
    const again = await resetPassword(db, "wei@example.com");
    expect(again.user.id).toBe(first.user.id);
    expect(again.user.displayName).toBe("Wei");
  });

  it("refuses an address nobody has been invited to", async () => {
    await expect(resetPassword(db, "nobody@example.com")).rejects.toThrow(/no user/);
  });

  it("is case-insensitive about the address, like the login is", async () => {
    await inviteUser(db, "wei@example.com", "Wei");
    await expect(resetPassword(db, "WEI@example.com")).resolves.toBeTruthy();
  });

  // I3: a reset is the only lever the app offers to cut off an account, so it
  // must actually end sessions the account already has open.
  it("ends every session the account had open", async () => {
    const { user } = await inviteUser(db, "wei@example.com", "Wei");
    const session = await createSession(db, user.id, 24);
    await resetPassword(db, "wei@example.com");
    expect(await resolveSession(db, session.id)).toBeNull();
  });

  it("keeps the one session named by keepToken, and ends the rest", async () => {
    const { user } = await inviteUser(db, "wei@example.com", "Wei");
    const kept = await createSession(db, user.id, 24);
    const other = await createSession(db, user.id, 24);
    await resetPassword(db, "wei@example.com", { keepToken: kept.id });
    expect(await resolveSession(db, kept.id)).not.toBeNull();
    expect(await resolveSession(db, other.id)).toBeNull();
  });
});

describe("one-time passwords", () => {
  it("asks an invited person to set their own password", async () => {
    const db = await createTestDb();
    const { user } = await inviteUser(db, "new@example.com", "New Person");
    const [row] = await db.select().from(users).where(eq(users.id, user.id));
    expect(row!.mustChangePassword).toBe(true);
  });

  it("asks again after a reset", async () => {
    const db = await createTestDb();
    const { user } = await inviteUser(db, "again@example.com", "Again");
    await db.update(users).set({ mustChangePassword: false }).where(eq(users.id, user.id));
    await resetPassword(db, "again@example.com");
    const [row] = await db.select().from(users).where(eq(users.id, user.id));
    expect(row!.mustChangePassword).toBe(true);
  });
});
