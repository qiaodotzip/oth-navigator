import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createUser, type User } from "../auth/users";
import type { Database } from "../db/client";
import type { Row } from "../db/rows";
import { auditLog, buildings, levels, rooms } from "../db/schema";
import { VersionConflictError, restoreEntity, softDeleteEntity } from "../entities/repository";
import { createTestDb } from "../testing/harness";
import {
  DraftRefusedError, SET_ASIDE, UNSET_ASIDE, acceptDrafts, decideDrafts, floorDrafts, latestSearch, listDrafts, replaceDrafts,
  lineUpOf, tallyDrafts, unsetAside,
} from "./service";

const square = (x: number, y: number, s: number): [number, number][] => [[x, y], [x + s, y], [x + s, y + s], [x, y + s]];
const SOURCE = { checksum: "a".repeat(64), page: 1 };
let db: Database;
let wei: User;

beforeEach(async () => {
  db = await createTestDb();
  wei = await createUser(db, { email: "wei@example.com", password: "unused", displayName: "Wei" });
  await db.insert(buildings).values({ id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94, rotationDeg: 0 });
  await db.insert(levels).values([
    { id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "Level 1", nameZh: "一楼", elevationM: 0, heightM: 6 },
    { id: "oth-L2", buildingId: "oth", code: "L2", ordinal: 2, nameEn: "Level 2", nameZh: "二楼", elevationM: 6, heightM: 4 },
  ]);
});

const search = (names: string[], levelId = "oth-L1") => replaceDrafts(db, levelId, SOURCE, names.map((nameEn, i) => ({
  nameEn, kind: "room", footprint: square(i * 20, 0, 10), labelPoint: [i * 20 + 5, 5], areaM2: 100,
})), wei.id);
const idOf = (drafts: Row[], name: string) => String(drafts.find(d => d.nameEn === name)!.id);

describe("floorDrafts and latestSearch", () => {
  /** Shop accepted from the first search; Store left waiting until the second search retires it. */
  async function twoSearches() {
    const first = await search(["Shop", "Store"]);
    await decideDrafts(db, "oth-L1", [{ id: idOf(first, "Shop"), expectedVersion: 0, decision: "accept" }], wei.id);
    const second = await search(["Cafe", "Kiosk", "Plaza"]);
    await decideDrafts(db, "oth-L1", [
      { id: idOf(second, "Cafe"), expectedVersion: 0, decision: "accept" },
      { id: idOf(second, "Plaza"), expectedVersion: 0, decision: "set_aside", reason: "Open on the drawing" },
    ], wei.id);
  }

  it("counts every search's drafts, decided or not, but not one a later search retired", async () => {
    await twoSearches();
    const rows = await floorDrafts(db, "oth-L1");
    expect(rows.filter(r => r.retired).map(r => r.nameEn)).toEqual(["Store"]);
    expect(tallyDrafts(rows)).toEqual({ waiting: 1, setAside: 1, accepted: 2, rejected: 0 });
  });

  it("knows the floor's last Find rooms apart from the ones before it", async () => {
    await twoSearches();
    expect((await latestSearch(db, "oth-L1")).map(r => r.nameEn).sort()).toEqual(["Cafe", "Kiosk", "Plaza"]);
  });

  it("finds nothing on a floor nobody has searched", async () => {
    expect(await floorDrafts(db, "oth-L2")).toEqual([]);
    expect(await latestSearch(db, "oth-L2")).toEqual([]);
  });

  it("counts a floor's drafts retired, not rejected, when a later Find rooms finds nothing there", async () => {
    await search(["Shop", "Store"]);
    await search([]); // an empty search still retires the floor's old drafts, with no create row of its own
    const rows = await floorDrafts(db, "oth-L1");
    expect(rows.every(r => r.retired)).toBe(true);
    expect(tallyDrafts(rows)).toEqual({ waiting: 0, setAside: 0, accepted: 0, rejected: 0 });
    // The empty search is the floor's latest, so it correctly gives none of the search before it.
    expect(await latestSearch(db, "oth-L1")).toEqual([]);
  });
});

describe("decideDrafts", () => {
  it("accepts, rejects and sets aside a floor's drafts in one go; a set-aside keeps waiting, marked with its reason", async () => {
    const drafts = await search(["Hall", "Sliver", "Plaza"]);
    expect(await decideDrafts(db, "oth-L1", [
      { id: idOf(drafts, "Hall"), expectedVersion: 0, decision: "accept", nameEn: "Town Square", kind: "area" },
      { id: idOf(drafts, "Sliver"), expectedVersion: 0, decision: "reject" },
      { id: idOf(drafts, "Plaza"), expectedVersion: 0, decision: "set_aside", reason: "  Open on the drawing:\n  trace it by hand  " },
    ], wei.id)).toEqual({
      accepted: [{ draftId: idOf(drafts, "Hall"), draftVersion: 2, roomId: "L1-town-square", roomVersion: 0, nameEn: "Town Square" }],
      rejected: ["Sliver"],
      setAside: ["Plaza"],
      unknown: [],
    });
    expect(await db.select().from(rooms)).toMatchObject([{ id: "L1-town-square", kind: "area", walkable: true }]);
    const marks = await db.select().from(auditLog).where(eq(auditLog.action, SET_ASIDE));
    expect(marks.map(m => [m.entityId, (m.after as { reason: string }).reason])).toEqual([
      [idOf(drafts, "Plaza"), "Open on the drawing: trace it by hand"],
    ]);
    // Still waiting, at the version it had, and listed with who set it aside, why and when.
    const [plaza] = await listDrafts(db, "oth-L1");
    expect(plaza).toMatchObject({ nameEn: "Plaza", version: 0, setAside: { by: wei.id, reason: "Open on the drawing: trace it by hand" } });
    expect(Date.parse(String((plaza!.setAside as { at: string }).at))).not.toBeNaN();
    expect(tallyDrafts(await floorDrafts(db, "oth-L1"))).toEqual({ waiting: 0, setAside: 1, accepted: 1, rejected: 1 });
  });

  it("skips an id no draft has, and says which, deciding the rest", async () => {
    const drafts = await search(["Hall", "Sliver"]);
    const decided = await decideDrafts(db, "oth-L1", [
      { id: idOf(drafts, "Sliver"), expectedVersion: 0, decision: "reject" },
      { id: "rd_ea918f60-343a-4101-ab37-ba7e94b3cb5", expectedVersion: 0, decision: "accept" },
    ], wei.id);
    expect(decided).toMatchObject({ rejected: ["Sliver"], unknown: ["rd_ea918f60-343a-4101-ab37-ba7e94b3cb5"] });
    expect((await listDrafts(db, "oth-L1")).map(d => d.nameEn)).toEqual(["Hall"]);
  });

  it("writes nothing when one draft changed since, or is on another floor", async () => {
    const drafts = await search(["Hall", "Sliver"]);
    const [kiosk] = await search(["Kiosk"], "oth-L2");
    await expect(decideDrafts(db, "oth-L1", [
      { id: idOf(drafts, "Hall"), expectedVersion: 0, decision: "accept" },
      { id: idOf(drafts, "Sliver"), expectedVersion: 3, decision: "reject" },
    ], wei.id)).rejects.toBeInstanceOf(VersionConflictError);
    await expect(decideDrafts(db, "oth-L1", [
      { id: idOf(drafts, "Hall"), expectedVersion: 0, decision: "accept" },
      { id: String(kiosk!.id), expectedVersion: 0, decision: "reject" },
    ], wei.id)).rejects.toThrow(`Draft ${String(kiosk!.id)} is not on L1. decide_drafts decides one floor's drafts at a time.`);
    expect(await db.select().from(rooms)).toEqual([]);
    expect((await latestSearch(db, "oth-L1")).every(d => d.deletedAt === null)).toBe(true);
  });

  it("names a refused draft by its id, and refuses one listed twice", async () => {
    const id = idOf(await search(["Sliver"]), "Sliver");
    await decideDrafts(db, "oth-L1", [{ id, expectedVersion: 0, decision: "reject" }], wei.id);
    await expect(decideDrafts(db, "oth-L1", [{ id, expectedVersion: 1, decision: "set_aside", reason: "Unclear" }], wei.id))
      .rejects.toThrow(`Draft ${id} (Sliver) is no longer waiting for review: it was rejected, or the drawing was searched again.`);
    await expect(decideDrafts(db, "oth-L1", [
      { id, expectedVersion: 1, decision: "reject" }, { id, expectedVersion: 1, decision: "reject" },
    ], wei.id)).rejects.toBeInstanceOf(DraftRefusedError);
    // An open draft has no shape to accept, and the refusal says what to do instead.
    const [open] = await replaceDrafts(db, "oth-L1", SOURCE, [{ nameEn: "Plaza", kind: "area", labelPoint: [1, 1], areaM2: 0 }], wei.id);
    await expect(decideDrafts(db, "oth-L1", [{ id: String(open!.id), expectedVersion: 0, decision: "accept" }], wei.id))
      .rejects.toThrow(`Draft ${String(open!.id)} (Plaza) is left open on the drawing, so it has no shape to add. Set it aside for a person instead.`);
  });

  it("needs a reason to set a draft aside, and sets it aside once", async () => {
    const id = idOf(await search(["Plaza"]), "Plaza");
    await expect(decideDrafts(db, "oth-L1", [{ id, expectedVersion: 0, decision: "set_aside", reason: "   " }], wei.id))
      .rejects.toThrow(`Setting aside draft ${id} needs a reason: one line on why a person should decide it.`);
    await decideDrafts(db, "oth-L1", [{ id, expectedVersion: 0, decision: "set_aside", reason: "Open" }], wei.id);
    await expect(decideDrafts(db, "oth-L1", [{ id, expectedVersion: 0, decision: "set_aside", reason: "Again" }], wei.id))
      .rejects.toThrow(`Draft ${id} (Plaza) is set aside already.`);
  });

  it("rolls back an earlier reject or set-aside when a later item in the same call fails", async () => {
    const drafts = await search(["Hall", "Sliver", "Plaza"]);
    await expect(decideDrafts(db, "oth-L1", [
      { id: idOf(drafts, "Hall"), expectedVersion: 0, decision: "reject" },
      { id: idOf(drafts, "Plaza"), expectedVersion: 0, decision: "set_aside", reason: "Open" },
      { id: idOf(drafts, "Sliver"), expectedVersion: 4, decision: "reject" },
    ], wei.id)).rejects.toBeInstanceOf(VersionConflictError);
    // Hall and Plaza are still waiting: their earlier reject and set-aside were rolled back too.
    const rows = await floorDrafts(db, "oth-L1");
    expect(rows.every(r => r.deletedAt === null && r.setAside === null)).toBe(true);
    expect(await db.select().from(auditLog).where(eq(auditLog.action, SET_ASIDE))).toEqual([]);
    expect(await db.select().from(auditLog).where(and(eq(auditLog.entityType, "roomDraft"), eq(auditLog.action, "delete")))).toEqual([]);
  });
});

describe("a draft set aside", () => {
  const setAside = async () => {
    const drafts = await search(["Plaza", "Hall"]);
    await decideDrafts(db, "oth-L1", [{ id: idOf(drafts, "Plaza"), expectedVersion: 0, decision: "set_aside", reason: "Open" }], wei.id);
    return idOf(drafts, "Plaza");
  };
  const marked = async () => (await listDrafts(db, "oth-L1")).filter(d => d.setAside).map(d => d.nameEn);

  it("stops being set aside when a person rejects it in Build, even once they bring it back", async () => {
    const id = await setAside();
    await softDeleteEntity(db, "roomDraft", id, 0, wei.id);
    expect(tallyDrafts(await floorDrafts(db, "oth-L1"))).toMatchObject({ waiting: 1, setAside: 0, rejected: 1 });
    await restoreEntity(db, "roomDraft", id, 1, wei.id);
    expect(await marked()).toEqual([]);
    expect(tallyDrafts(await floorDrafts(db, "oth-L1"))).toMatchObject({ waiting: 2, setAside: 0 });
  });

  it("stops being set aside when a person accepts it in Build", async () => {
    const id = await setAside();
    await acceptDrafts(db, [{ id, expectedVersion: 0 }], wei.id);
    expect(tallyDrafts(await floorDrafts(db, "oth-L1"))).toMatchObject({ waiting: 1, setAside: 0, accepted: 1 });
  });

  it("is taken back by unsetAside, which marks it unset-aside, once", async () => {
    const id = await setAside();
    await unsetAside(db, id, 0, wei.id);
    expect(await marked()).toEqual([]);
    expect((await db.select().from(auditLog).where(eq(auditLog.action, UNSET_ASIDE))).map(r => r.entityId)).toEqual([id]);
    await expect(unsetAside(db, id, 0, wei.id)).rejects.toThrow("Plaza isn't set aside now, so there is nothing to take back.");
    await expect(unsetAside(db, id, 3, wei.id)).rejects.toBeInstanceOf(VersionConflictError);
  });
});

describe("lineUpOf (contract v3): does the drawing line up with the rooms already on the floor?", () => {
  /**
   * Rehearsal 2's L1: Replace plan put the drawing about 11.5 m east and 4.6 m
   * south of the 228 rooms traced by hand, the same for every room. Each room
   * here is a 6 m square; its namesake draft's label sits that far off it.
   */
  const NAMES = ["Fire Command Centre", "Community Dance Studio 1", "2 (Wet) Team Changing", "Team Changing 3 (Dry)", "Hand Wash Area", "Cleaner's Room"];
  const roomsOf = (names: readonly string[]) => names.map((nameEn, i) => ({ nameEn, footprint: square(i * 20, 0, 6), holes: [] }));
  const draftsOff = (names: readonly string[], [ox, oy]: [number, number]) =>
    names.map((nameEn, i) => ({ nameEn, labelPoint: [i * 20 + 3 + ox, 3 + oy] as [number, number] }));

  it("gives the shift from the drafts' labels to their rooms' centres when 5 or more pairs agree on one of over a metre", () => {
    const rooms = [...roomsOf(NAMES), { nameEn: "Kitchen", footprint: square(200, 0, 6), holes: [] }];
    const drafts = [
      ...draftsOff(NAMES, [11.5, -4.6]),
      // Capitals and spacing aside, the names are the same: a pair, but one that lines up, so not one of the six.
      { nameEn: "  kitchen ", labelPoint: [203, 3] as [number, number] },
    ];
    expect(lineUpOf(drafts, rooms)).toEqual({ dx: -11.5, dy: 4.6, pairs: 6 });
  });

  it("pairs a draft only with a name exactly one room on the floor has", () => {
    const shops = [{ nameEn: "Shop", footprint: square(300, 0, 6), holes: [] }, { nameEn: "shop", footprint: square(320, 0, 6), holes: [] }];
    const drafts = [...draftsOff(NAMES.slice(0, 4), [11.5, -4.6]), { nameEn: "Shop", labelPoint: [303 + 11.5, 3 - 4.6] as [number, number] }];
    expect(lineUpOf(drafts, [...roomsOf(NAMES.slice(0, 4)), ...shops])).toBeNull();
  });

  it("says nothing when the pairs line up, or disagree by more than half a metre", () => {
    expect(lineUpOf(draftsOff(NAMES, [0.4, -0.3]), roomsOf(NAMES))).toBeNull();
    const scattered = NAMES.map((nameEn, i) => ({ nameEn, labelPoint: [i * 20 + 3 + 5 + i, 3] as [number, number] }));
    expect(lineUpOf(scattered, roomsOf(NAMES))).toBeNull();
  });
});
