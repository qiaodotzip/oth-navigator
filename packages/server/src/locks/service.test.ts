import { beforeEach, describe, expect, it } from "vitest";
import { createUser } from "../auth/users";
import type { Database } from "../db/client";
import { createTestDb } from "../testing/harness";
import { acquireLock, activeLocks, releaseLock } from "./service";

let db: Database;
beforeEach(async () => { db = await createTestDb(); });

describe("locks", () => {
  it("grants a lock on a free entity", async () => {
    expect(await acquireLock(db, "room", "L1-lobby", "user_1", 300)).not.toBeNull();
  });

  it("refuses a lock another user holds", async () => {
    await acquireLock(db, "room", "L1-lobby", "user_1", 300);
    expect(await acquireLock(db, "room", "L1-lobby", "user_2", 300)).toBeNull();
  });

  it("lets the holder refresh their own lock", async () => {
    const first = await acquireLock(db, "room", "L1-lobby", "user_1", 300);
    const again = await acquireLock(db, "room", "L1-lobby", "user_1", 300);
    expect(again).not.toBeNull();
    expect(again!.expiresAt.getTime()).toBeGreaterThanOrEqual(first!.expiresAt.getTime());
  });

  it("grants a lock whose previous holder let it expire", async () => {
    await acquireLock(db, "room", "L1-lobby", "user_1", -1);
    expect(await acquireLock(db, "room", "L1-lobby", "user_2", 300)).not.toBeNull();
  });

  it("releases only if you hold it", async () => {
    await acquireLock(db, "room", "L1-lobby", "user_1", 300);
    expect(await releaseLock(db, "room", "L1-lobby", "user_2")).toBe(false);
    expect(await releaseLock(db, "room", "L1-lobby", "user_1")).toBe(true);
  });

  it("omits expired locks from the active list", async () => {
    await acquireLock(db, "room", "a", "user_1", 300);
    await acquireLock(db, "room", "b", "user_1", -1);
    expect((await activeLocks(db)).map(l => l.entityId)).toEqual(["a"]);
  });

  it("keeps locks on different entities independent", async () => {
    await acquireLock(db, "room", "a", "user_1", 300);
    expect(await acquireLock(db, "room", "b", "user_2", 300)).not.toBeNull();
  });
});

describe("who holds a lock", () => {
  it("names the holder, since a user id tells a teammate nothing", async () => {
    const user = await createUser(db, {
      email: "wei@example.com", password: "passphrase", displayName: "Wei",
    });
    await acquireLock(db, "room", "L1-a", user.id, 300);
    expect((await activeLocks(db))[0]?.lockedByName).toBe("Wei");
  });

  it("falls back to the id when the holder no longer exists", async () => {
    await acquireLock(db, "room", "L1-b", "user_gone", 300);
    expect((await activeLocks(db))[0]?.lockedByName).toBe("user_gone");
  });
});
