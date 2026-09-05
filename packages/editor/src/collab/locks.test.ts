import { describe, expect, it } from "vitest";
import { lockFor } from "./locks";

const held = [
  { entityType: "room", entityId: "L1-a", lockedBy: "user_wei", lockedByName: "Wei" },
  { entityType: "room", entityId: "L1-b", lockedBy: "user_me", lockedByName: "Me" },
];

describe("lockFor", () => {
  it("finds who is holding the selected entity", () => {
    expect(lockFor(held, { type: "room", id: "L1-a" }, "user_me")?.lockedByName).toBe("Wei");
  });

  it("says nothing about a lock I hold myself", () => {
    // A badge on every row you touch is noise, not information.
    expect(lockFor(held, { type: "room", id: "L1-b" }, "user_me")).toBeNull();
  });

  it("says nothing when the entity is not held", () => {
    expect(lockFor(held, { type: "room", id: "L1-c" }, "user_me")).toBeNull();
  });

  it("says nothing when nothing is selected", () => {
    expect(lockFor(held, null, "user_me")).toBeNull();
  });

  it("matches on type as well as id, since ids are only unique per type", () => {
    expect(lockFor(held, { type: "placement", id: "L1-a" }, "user_me")).toBeNull();
  });

  it("shows a lock to a signed-out client rather than hiding it", () => {
    // Nobody is "me", so nothing is mine to hide.
    expect(lockFor(held, { type: "room", id: "L1-b" }, null)?.lockedByName).toBe("Me");
  });
});
