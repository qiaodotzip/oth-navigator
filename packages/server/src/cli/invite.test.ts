import { beforeEach, describe, expect, it } from "vitest";
import type { Database } from "../db/client";
import { verifyPassword } from "../auth/password";
import { findUserByEmail } from "../auth/users";
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
});
