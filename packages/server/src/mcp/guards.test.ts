import { describe, expect, it } from "vitest";
import { createUser } from "../auth/users";
import { acquireLock } from "../locks/service";
import { createTestDb } from "../testing/harness";
import { refuseIfLocked } from "./guards";
import { Refusal } from "./results";

describe("refuseIfLocked", () => {
  it("refuses a write to something a person has open, whoever they are", async () => {
    const db = await createTestDb();
    const amy = await createUser(db, { email: "amy@example.com", password: "unused", displayName: "Amy" });
    await acquireLock(db, "room", "L1-shop-12", amy.id, 300);
    const refused = refuseIfLocked(db, [{ type: "place", id: "pl_1" }, { type: "room", id: "L1-shop-12" }]);
    await expect(refused).rejects.toBeInstanceOf(Refusal);
    await expect(refused).rejects.toThrow(
      "Not saved: Amy is editing room L1-shop-12 now. Leave it, and try again once they have moved on.",
    );
  });

  it("lets a write through when nothing it touches is open, or a lock has run out", async () => {
    const db = await createTestDb();
    const amy = await createUser(db, { email: "amy@example.com", password: "unused", displayName: "Amy" });
    await acquireLock(db, "room", "L1-shop-12", amy.id, 0);
    await expect(refuseIfLocked(db, [{ type: "room", id: "L1-shop-12" }])).resolves.toBeUndefined();
    await expect(refuseIfLocked(db, [])).resolves.toBeUndefined();
  });
});
