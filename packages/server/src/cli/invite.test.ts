import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { verifyPassword } from "../auth/password";
import { findUserByEmail } from "../auth/users";
import type { Database } from "../db/client";
import { users } from "../db/schema";
import { createTestDb } from "../testing/harness";
import { DuplicateNameError, inviteUser } from "./invite";

let db: Database;
beforeEach(async () => { db = await createTestDb(); });

describe("inviteUser", () => {
  it("adds a person by name, with a password hash nobody will ever check", async () => {
    const { user } = await inviteUser(db, "Wei");
    expect(user.displayName).toBe("Wei");
    const [row] = await db.select().from(users).where(eq(users.id, user.id));
    // Not empty, and not guessable, but never verified by any route: the
    // column is NOT NULL and nothing else about it matters any more.
    expect(row!.passwordHash).toMatch(/^scrypt\$/);
    expect(await verifyPassword("", row!.passwordHash)).toBe(false);
  });

  it("hides a generated email behind the name, so the email column stays satisfied", async () => {
    const { user } = await inviteUser(db, "Wei");
    const [row] = await db.select().from(users).where(eq(users.id, user.id));
    expect(row!.email).toBe("wei@team.oth.local");
  });

  it("numbers a colliding name's hidden email rather than failing", async () => {
    const a = await inviteUser(db, "Wei");
    await db.update(users).set({ disabledAt: new Date() }).where(eq(users.id, a.user.id));
    // A disabled account keeps its row (and its email), so a second "Wei"
    // — allowed because the first is no longer active — still needs a free one.
    const { user } = await inviteUser(db, "Wei");
    const [row] = await db.select().from(users).where(eq(users.id, user.id));
    expect(row!.email).toBe("wei-2@team.oth.local");
  });

  it("refuses a name that collides, case-insensitively, with an active teammate", async () => {
    await inviteUser(db, "Wei");
    await expect(inviteUser(db, "wei")).rejects.toBeInstanceOf(DuplicateNameError);
    await expect(inviteUser(db, "WEI")).rejects.toThrow(/already on the team/);
  });

  it("does not collide with a disabled account's name", async () => {
    const { user } = await inviteUser(db, "Ghost");
    await db.update(users).set({ disabledAt: new Date() }).where(eq(users.id, user.id));
    await expect(inviteUser(db, "Ghost")).resolves.toBeTruthy();
  });

  it("trims the name before storing and checking it", async () => {
    const { user } = await inviteUser(db, "  Aisha  ");
    expect(user.displayName).toBe("Aisha");
    await expect(inviteUser(db, "aisha")).rejects.toBeInstanceOf(DuplicateNameError);
  });

  it("records who added whom", async () => {
    const inviter = await inviteUser(db, "Wei");
    const { user } = await inviteUser(db, "Aisha", inviter.user.id);
    const [row] = await db.select().from(users).where(eq(users.id, user.id));
    expect(row!.invitedBy).toBe(inviter.user.id);
  });

  it("leaves mustChangePassword at its default: nothing ever sets it", async () => {
    const { user } = await inviteUser(db, "Wei");
    const [row] = await db.select().from(users).where(eq(users.id, user.id));
    expect(row!.mustChangePassword).toBe(false);
  });
});

describe("DuplicateNameError", () => {
  it("names the person in its message", () => {
    expect(new DuplicateNameError("Wei").message).toBe("Someone called Wei is already on the team.");
  });
});

// A quick sanity check that findUserByEmail (shared with the route layer for
// generating a free hidden email) still finds what inviteUser created.
describe("findUserByEmail", () => {
  it("finds the hidden email inviteUser generated", async () => {
    await inviteUser(db, "Wei");
    expect(await findUserByEmail(db, "wei@team.oth.local")).not.toBeNull();
  });
});
