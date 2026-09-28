import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createUser, type User } from "../auth/users";
import type { Database } from "../db/client";
import type { Row } from "../db/rows";
import { auditLog, buildings, levels, rooms } from "../db/schema";
import { VersionConflictError } from "../entities/repository";
import { createTestDb } from "../testing/harness";
import { DraftRefusedError, SET_ASIDE, decideDrafts, floorDrafts, latestSearch, replaceDrafts, tallyDrafts } from "./service";

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
      { id: idOf(second, "Plaza"), expectedVersion: 0, decision: "set_aside" },
    ], wei.id);
  }

  it("counts every search's drafts, decided or not, but not one a later search retired", async () => {
    await twoSearches();
    const rows = await floorDrafts(db, "oth-L1");
    expect(rows.filter(r => r.retired).map(r => r.nameEn)).toEqual(["Store"]);
    expect(tallyDrafts(rows)).toEqual({ waiting: 1, accepted: 2, rejectedOrSetAside: 1 });
  });

  it("knows the floor's last Find rooms apart from the ones before it", async () => {
    await twoSearches();
    expect((await latestSearch(db, "oth-L1")).map(r => r.nameEn).sort()).toEqual(["Cafe", "Kiosk", "Plaza"]);
  });

  it("finds nothing on a floor nobody has searched", async () => {
    expect(await floorDrafts(db, "oth-L2")).toEqual([]);
    expect(await latestSearch(db, "oth-L2")).toEqual([]);
  });
});

describe("decideDrafts", () => {
  it("accepts, rejects and sets aside a floor's drafts in one go, and marks the set-asides", async () => {
    const drafts = await search(["Hall", "Sliver", "Plaza"]);
    expect(await decideDrafts(db, "oth-L1", [
      { id: idOf(drafts, "Hall"), expectedVersion: 0, decision: "accept", nameEn: "Town Square", kind: "area" },
      { id: idOf(drafts, "Sliver"), expectedVersion: 0, decision: "reject" },
      { id: idOf(drafts, "Plaza"), expectedVersion: 0, decision: "set_aside" },
    ], wei.id)).toEqual({
      accepted: [{ draftId: idOf(drafts, "Hall"), draftVersion: 2, roomId: "L1-town-square", roomVersion: 0, nameEn: "Town Square" }],
      rejected: ["Sliver"],
      setAside: ["Plaza"],
    });
    expect(await db.select().from(rooms)).toMatchObject([{ id: "L1-town-square", kind: "area", walkable: true }]);
    const marks = await db.select().from(auditLog).where(eq(auditLog.action, SET_ASIDE));
    expect(marks.map(m => m.entityId)).toEqual([idOf(drafts, "Plaza")]);
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

  it("says a draft already decided is no longer waiting, and refuses one listed twice", async () => {
    const id = idOf(await search(["Sliver"]), "Sliver");
    await decideDrafts(db, "oth-L1", [{ id, expectedVersion: 0, decision: "reject" }], wei.id);
    await expect(decideDrafts(db, "oth-L1", [{ id, expectedVersion: 1, decision: "set_aside" }], wei.id))
      .rejects.toThrow("Sliver is no longer waiting for review: it was rejected, or the drawing was searched again.");
    await expect(decideDrafts(db, "oth-L1", [
      { id, expectedVersion: 1, decision: "reject" }, { id, expectedVersion: 1, decision: "reject" },
    ], wei.id)).rejects.toBeInstanceOf(DraftRefusedError);
  });
});
