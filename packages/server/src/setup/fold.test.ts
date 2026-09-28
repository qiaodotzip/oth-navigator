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

  it("still leaves out a find-rooms marker row even if it somehow carried a via: level isn't a map type", () => {
    const folded = foldChanges([
      row({ id: "fr1", entityType: "level", entityId: "oth-L1", action: "find-rooms", via: "tok_1", before: null, after: null }),
    ]);
    expect(folded).toEqual([]);
  });

  it("keeps two tokens' calls apart even when they land in the same instant", () => {
    const folded = foldChanges([
      row({ id: "t1", entityType: "pathway", entityId: "pw_1", action: "create", via: "tok_1", after: { id: "pw_1", nameEn: "Corridor A", polyline: [[0, 0], [10, 0]] } }),
      row({ id: "t2", entityType: "pathway", entityId: "pw_2", action: "create", via: "tok_2", after: { id: "pw_2", nameEn: "Corridor B", polyline: [[0, 0], [5, 0]] } }),
    ]);
    expect(folded).toHaveLength(2);
    expect(new Set(folded.map(f => f.via))).toEqual(new Set(["tok_1", "tok_2"]));
    expect(folded.map(f => f.entityId).sort()).toEqual(["pw_1", "pw_2"]);
  });

  it("folds a batch of 3 accepted drafts into 3 rows, each its own unaccept", () => {
    const rows: AuditRow[] = [];
    for (const [i, roomId, draftId] of [[0, "L1-a", "rd_a"], [1, "L1-b", "rd_b"], [2, "L1-c", "rd_c"]] as const) {
      rows.push(row({ id: `r${i}a`, entityType: "room", entityId: roomId, action: "create", after: { id: roomId, version: 0, levelId: "oth-L1", nameEn: `Room ${i}`, kind: "room" } }));
      rows.push(row({ id: `r${i}b`, entityType: "roomDraft", entityId: draftId, action: "update", before: { nameEn: `Draft ${i}`, version: 0 }, after: { nameEn: `Room ${i}`, acceptedRoomId: roomId, version: 1 } }));
      rows.push(row({ id: `r${i}c`, entityType: "roomDraft", entityId: draftId, action: "delete", after: { nameEn: `Room ${i}`, acceptedRoomId: roomId, version: 2, levelId: "oth-L1" } }));
    }
    const folded = foldChanges(rows);
    expect(folded).toHaveLength(3);
    expect(folded.every(f => f.group === "rooms")).toBe(true);
    expect(folded.map(f => f.undo)).toEqual([
      [{ do: "unaccept", draftId: "rd_a", draftVersion: 2, roomId: "L1-a", roomVersion: 0 }],
      [{ do: "unaccept", draftId: "rd_b", draftVersion: 2, roomId: "L1-b", roomVersion: 0 }],
      [{ do: "unaccept", draftId: "rd_c", draftVersion: 2, roomId: "L1-c", roomVersion: 0 }],
    ]);
  });

  it("says Rejected for a plain draft delete, apart from Set aside", () => {
    const folded = foldChanges([
      row({ id: "rj1", entityType: "roomDraft", entityId: "rd_2", action: "delete", after: { nameEn: "Old Shop", version: 1, levelId: "oth-L1" } }),
    ]);
    expect(folded).toMatchObject([{ group: "drafts", facts: { kind: "draftOff", name: "Old Shop", setAside: false } }]);
  });

  it("gives pathways, entrances and other their own rows", () => {
    const folded = foldChanges([
      row({ id: "e1", entityType: "pathway", entityId: "pw_1", action: "create", after: { id: "pw_1", nameEn: "Main Corridor", polyline: [[0, 0], [3, 4]] } }),
      row({ id: "e2", entityType: "entrance", entityId: "en_1", action: "create", after: { id: "en_1", nameEn: "Gate 4", roomId: "L1-lobby" } }),
      row({ id: "e3", entityType: "doorway", entityId: "dw_1", action: "create", after: { id: "dw_1", nameEn: "Door 1" } }),
    ]);
    const byId = new Map(folded.map(f => [f.entityId, f]));
    expect(byId.get("pw_1")).toMatchObject({ group: "pathways", facts: { kind: "pathway", name: "Main Corridor", lengthM: 5 } });
    expect(byId.get("en_1")).toMatchObject({ group: "entrances", facts: { kind: "entrance", name: "Gate 4", roomId: "L1-lobby" } });
    expect(byId.get("dw_1")).toMatchObject({ group: "other", facts: { kind: "generic", action: "create", type: "doorway", name: "Door 1" } });
  });

  it("undoes a stop's writes in reverse: the room, then the stop, then the lift's kind, then the lift itself", () => {
    const folded = foldChanges([
      row({ id: "s1", entityType: "portal", entityId: "portal-1", action: "create", after: { id: "portal-1", version: 0, kind: "escalator" } }),
      row({ id: "s2", entityType: "portal", entityId: "portal-1", action: "update", before: { kind: "lift" }, after: { id: "portal-1", version: 1, kind: "escalator" } }),
      row({
        id: "s3", entityType: "portalEndpoint", entityId: "L1-portal-1", action: "create",
        after: { id: "L1-portal-1", version: 0, levelId: "oth-L1", portalId: "portal-1", roomId: "L1-esc", footprint: [[0, 0], [1, 0], [1, 1], [0, 1]] },
      }),
      row({
        id: "s4", entityType: "room", entityId: "L1-esc", action: "update",
        before: { nameEn: "Escalator - 07", kind: "service", walkable: false },
        after: { id: "L1-esc", version: 1, nameEn: "Escalator - 07", kind: "area", walkable: true },
      }),
    ]);
    expect(folded).toHaveLength(1);
    expect(folded[0]?.undo).toEqual([
      { do: "patch", type: "room", id: "L1-esc", version: 1, patch: { kind: "service", walkable: false } },
      { do: "delete", type: "portalEndpoint", id: "L1-portal-1", version: 0 },
      { do: "patch", type: "portal", id: "portal-1", version: 1, patch: { kind: "lift" } },
      { do: "delete", type: "portal", id: "portal-1", version: 0 },
    ]);
  });

  it("folds make_stop's 'finish opening it' into stops, not names", () => {
    const folded = foldChanges([
      row({
        id: "o1", entityType: "room", entityId: "L1-esc", action: "update",
        before: { nameEn: "Escalator - 07", kind: "service", walkable: false },
        after: { id: "L1-esc", version: 1, nameEn: "Escalator - 07", kind: "area", walkable: true },
      }),
    ]);
    expect(folded).toMatchObject([{
      group: "stops", entityType: "room", entityId: "L1-esc",
      facts: { kind: "stopOpened", roomId: "L1-esc", roomName: "Escalator - 07" },
    }]);
  });

  it("binds a place with two patches: the room seen, then the place bound", () => {
    const folded = foldChanges([
      row({
        id: "bnd1", entityType: "place", entityId: "pl_x", action: "update",
        before: { nameEn: "Guardian", roomId: null, levelId: "oth-L1" },
        after: { id: "pl_x", version: 1, nameEn: "Guardian", levelId: "oth-L1", roomId: "L1-shop" },
      }),
      row({
        id: "bnd2", entityType: "room", entityId: "L1-shop", action: "update",
        before: { nameEn: "Shop 9", verification: { status: "unverified", evidence: [] } },
        after: { id: "L1-shop", version: 1, nameEn: "Shop 9", verification: { status: "confirmed", evidence: ["sg_1"] } },
      }),
    ]);
    expect(folded).toHaveLength(1);
    expect(folded[0]).toMatchObject({ group: "places", entityType: "place", entityId: "pl_x" });
    expect(folded[0]?.undo).toEqual([
      { do: "patch", type: "room", id: "L1-shop", version: 1, patch: { verification: { status: "unverified", evidence: [] } } },
      { do: "patch", type: "place", id: "pl_x", version: 1, patch: { roomId: null } },
    ]);
  });

  it("undoes a generic create with a delete, an update with a patch, and a delete with a restore", () => {
    const created = foldChanges([row({ id: "g1", entityType: "doorway", entityId: "dw_9", action: "create", after: { id: "dw_9", version: 0, nameEn: "Door 9" } })]);
    expect(created[0]?.undo).toEqual([{ do: "delete", type: "doorway", id: "dw_9", version: 0 }]);

    const updated = foldChanges([row({
      id: "g2", entityType: "doorway", entityId: "dw_9", action: "update",
      before: { nameEn: "Door 9", widthM: 1 }, after: { id: "dw_9", version: 1, nameEn: "Door 9", widthM: 1.2 },
    })]);
    expect(updated[0]?.undo).toEqual([{ do: "patch", type: "doorway", id: "dw_9", version: 1, patch: { widthM: 1 } }]);

    const deleted = foldChanges([row({ id: "g3", entityType: "doorway", entityId: "dw_9", action: "delete", after: { id: "dw_9", version: 2, nameEn: "Door 9" } })]);
    expect(deleted[0]?.undo).toEqual([{ do: "restore", type: "doorway", id: "dw_9", version: 2 }]);
  });

  it("matches a label's kind by the place's own objectKindId, not any create in the call", () => {
    const folded = foldChanges([
      row({ id: "l1", entityType: "sighting", entityId: "sg_9", action: "create", after: { id: "sg_9", placeId: "pl_9", keyframeId: "kf_9", version: 0 } }),
      row({ id: "l2", entityType: "place", entityId: "pl_9", action: "create", after: { id: "pl_9", nameEn: "Wastebin", objectKindId: "ok_real", version: 0 } }),
      // An unrelated kind, made earlier in the same call: the old code's bare
      // rows.find(objectKind create) would grab this one first.
      row({ id: "l4", entityType: "objectKind", entityId: "ok_other", action: "create", after: { id: "ok_other", nameEn: "planter", version: 0 } }),
      row({ id: "l3", entityType: "objectKind", entityId: "ok_real", action: "create", after: { id: "ok_real", nameEn: "wastebin", version: 0 } }),
    ]);
    expect(folded).toHaveLength(1);
    expect(folded[0]).toMatchObject({ group: "labels", facts: { kind: "label", object: true } });
    expect(folded[0]?.auditIds.slice().sort()).toEqual(["l1", "l2", "l3"]);
  });

  it("breaks a sort tie by entity id, then action, never by the (random) audit id", () => {
    const byEntity = foldChanges([
      row({ id: "a1", entityType: "pathway", entityId: "pw_a", action: "create", after: { id: "pw_a", nameEn: "A", polyline: [[0, 0], [1, 0]] } }),
      row({ id: "z9", entityType: "pathway", entityId: "pw_b", action: "create", after: { id: "pw_b", nameEn: "B", polyline: [[0, 0], [1, 0]] } }),
    ]);
    // "z9" sorts before "a1" by audit id; "pw_a" sorts before "pw_b" by entity id.
    expect(byEntity.map(f => f.entityId)).toEqual(["pw_a", "pw_b"]);

    const byAction = foldChanges([
      row({ id: "x2", entityType: "doorway", entityId: "dw_1", action: "delete", after: { id: "dw_1", nameEn: "Door" } }),
      row({ id: "x1", entityType: "doorway", entityId: "dw_1", action: "create", after: { id: "dw_1", nameEn: "Door" } }),
    ]);
    expect(byAction.map(f => f.action)).toEqual(["create", "delete"]);
  });
});
