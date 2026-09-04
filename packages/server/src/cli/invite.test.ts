import { describe, expect, it } from "vitest";
import { verifyPassword } from "../auth/password";
import { findUserByEmail } from "../auth/users";
import { createTestDb } from "../testing/harness";
import { inviteUser } from "./invite";

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
