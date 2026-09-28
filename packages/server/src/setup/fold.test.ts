import { describe, expect, it } from "vitest";
import { foldChanges, patchBack, type AuditRow } from "./fold";

const AT = new Date("2026-09-28T06:00:00.000Z");
const row = (over: Partial<AuditRow>): AuditRow => ({
  id: "audit_1", entityType: "room", entityId: "L1-x", action: "update", actorId: "u_wei",
  at: AT, before: null, after: null, via: "tok_1", ...over,
});

describe("patchBack", () => {
  it("is what puts an update back: each field it changed, as it was, and null for one it added", () => {
    expect(patchBack(
      { id: "r", version: 3, nameEn: "SHOP 12", kind: "room", walkable: false },
      { id: "r", version: 4, nameEn: "Starbucks", kind: "room", walkable: false, notes: "new" },
    )).toEqual({ nameEn: "SHOP 12", notes: null });
  });
});

describe("foldChanges", () => {
  it("folds a draft's accept into one change, the room's own create, and a person's edits not at all", () => {
    const folded = foldChanges([
      row({ id: "a1", entityType: "room", entityId: "L1-starbucks", action: "create", after: { id: "L1-starbucks", version: 0, levelId: "oth-L1", nameEn: "Starbucks", kind: "room" } }),
      row({ id: "a2", entityType: "roomDraft", entityId: "rd_1", action: "update", before: { nameEn: "SHOP 12", version: 0 }, after: { nameEn: "Starbucks", acceptedRoomId: "L1-starbucks", version: 1 } }),
      row({ id: "a3", entityType: "roomDraft", entityId: "rd_1", action: "delete", after: { nameEn: "Starbucks", acceptedRoomId: "L1-starbucks", version: 2, levelId: "oth-L1" } }),
      row({ id: "a4", entityType: "room", entityId: "L1-y", action: "update", via: null, before: { nameEn: "A" }, after: { nameEn: "B" } }),
    ]);
    expect(folded).toHaveLength(1);
    expect(folded[0]).toMatchObject({
      id: "a1", group: "rooms", levelId: "oth-L1", entityType: "room", entityId: "L1-starbucks", action: "create",
      auditIds: ["a1", "a2", "a3"],
      touches: [{ type: "room", id: "L1-starbucks", version: 0 }, { type: "roomDraft", id: "rd_1", version: 2 }],
      undo: [{ do: "unaccept", draftId: "rd_1", draftVersion: 2, roomId: "L1-starbucks", roomVersion: 0 }],
    });
  });

  it("folds a tag and the place it made into one label, which it doesn't undo", () => {
    const folded = foldChanges([
      row({ id: "b1", entityType: "place", entityId: "pl_1", action: "create", after: { id: "pl_1", nameEn: "Gong Cha", levelId: "oth-L1", version: 0 } }),
      row({ id: "b2", entityType: "sighting", entityId: "sg_1", action: "create", after: { id: "sg_1", placeId: "pl_1", keyframeId: "kf_1", version: 0 } }),
    ]);
    expect(folded).toMatchObject([{ id: "b2", group: "labels", entityType: "sighting", auditIds: ["b2", "b1"], undo: null }]);
  });

  it("leaves out a find-rooms marker row: a person's Find rooms, entity level, via null", () => {
    const folded = foldChanges([
      row({ id: "c1", entityType: "level", entityId: "oth-L1", action: "find-rooms", actorId: "u_wei", via: null, before: null, after: null }),
    ]);
    expect(folded).toEqual([]);
  });
});
