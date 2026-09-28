import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createUser, type User } from "../auth/users";
import type { Database } from "../db/client";
import { auditLog, buildings, levels, portalEndpoints, portals, rooms } from "../db/schema";
import { VersionConflictError, createEntity, softDeleteEntity, updateEntity } from "../entities/repository";
import { createTestDb } from "../testing/harness";
import { StopRefusal, makeStop } from "./makeStop";

const sq = (x0: number, y0: number, x1: number, y1: number): [number, number][] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const ESC = { id: "L1-esc", levelId: "oth-L1", kind: "room", footprint: sq(4, 2, 6, 12), heightM: 6, nameEn: "Escalator - 07" };
let db: Database;
let wei: User;

beforeEach(async () => {
  db = await createTestDb();
  wei = await createUser(db, { email: "wei@example.com", password: "unused", displayName: "Wei" });
  await db.insert(buildings).values({ id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94, rotationDeg: 0 });
  await db.insert(levels).values([
    { id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "Level 1", nameZh: "一楼", elevationM: 0, heightM: 6 },
    { id: "oth-L2", buildingId: "oth", code: "L2", ordinal: 2, nameEn: "Level 2", nameZh: "二楼", elevationM: 6, heightM: 5 },
  ]);
  await createEntity(db, "room", ESC, wei.id);
});

const room = async (id: string) => (await db.select().from(rooms).where(eq(rooms.id, id)))[0]!;
const input = (over: Partial<Parameters<typeof makeStop>[1]> = {}) =>
  ({ levelId: "oth-L1", roomId: "L1-esc", expectedVersion: 0, kind: "escalator" as const, ...over });

describe("makeStop", () => {
  it("makes a traced space a new escalator stop with its outline, and opens the space, as MakeStop does", async () => {
    await createEntity(db, "room", { ...ESC, id: "L2-esc", levelId: "oth-L2", heightM: 5 }, wei.id);
    expect(await makeStop(db, input(), wei.id, 1000)).toEqual({
      outcome: "made", roomName: "Escalator - 07", portalId: "portal-1000", endpointId: "oth-L1-portal-1000",
      above: { code: "L2", landing: true },
    });
    expect(await db.select().from(portals)).toMatchObject([{ id: "portal-1000", kind: "escalator", stepFree: false }]);
    expect(await db.select().from(portalEndpoints)).toMatchObject([
      { id: "oth-L1-portal-1000", portalId: "portal-1000", levelId: "oth-L1", roomId: "L1-esc", footprint: ESC.footprint },
    ]);
    expect(await room("L1-esc")).toMatchObject({ kind: "area", walkable: true, version: 1 });
  });

  it("joins the escalator already stopping at this spot on the floor below", async () => {
    await makeStop(db, input(), wei.id, 1000);
    await createEntity(db, "room", { ...ESC, id: "L2-esc", levelId: "oth-L2", heightM: 5 }, wei.id);
    expect(await makeStop(db, input({ levelId: "oth-L2", roomId: "L2-esc" }), wei.id, 2000)).toEqual({
      outcome: "joined", roomName: "Escalator - 07", portalId: "portal-1000", endpointId: "oth-L2-portal-2000", above: null,
    });
    expect(await db.select().from(portals)).toHaveLength(1);
  });

  it("takes every write back when the space changed since it was read", async () => {
    await updateEntity(db, "room", "L1-esc", 0, { nameEn: "Escalator 7" }, wei.id);
    await expect(makeStop(db, input(), wei.id, 1000)).rejects.toBeInstanceOf(VersionConflictError);
    expect(await db.select().from(portals)).toEqual([]);
    expect(await db.select().from(portalEndpoints)).toEqual([]);
    expect(await db.select().from(auditLog).where(eq(auditLog.entityType, "portal"))).toEqual([]);
    expect(await room("L1-esc")).toMatchObject({ kind: "room", version: 1 });
  });

  it("finishes opening a space whose stop is saved but which still has walls, and then refuses it", async () => {
    await createEntity(db, "portal", { id: "esc-7", kind: "escalator" }, wei.id);
    await createEntity(db, "portalEndpoint", {
      id: "esc-7-1", portalId: "esc-7", levelId: "oth-L1", roomId: "L1-esc", point: [5, 7], footprint: ESC.footprint,
    }, wei.id);
    expect(await makeStop(db, input(), wei.id, 1000)).toMatchObject({ outcome: "opened", portalId: "esc-7", endpointId: "esc-7-1" });
    expect(await room("L1-esc")).toMatchObject({ kind: "area", walkable: true });
    await expect(makeStop(db, input({ expectedVersion: 1 }), wei.id, 2000))
      .rejects.toThrow("Escalator - 07 is already a lift or stair stop.");
  });

  it("refuses a space on another floor than the one given, and furniture", async () => {
    await expect(makeStop(db, input({ levelId: "oth-L2" }), wei.id)).rejects.toBeInstanceOf(StopRefusal);
    await createEntity(db, "room", { id: "L1-col", levelId: "oth-L1", kind: "detail", footprint: sq(40, 0, 41, 1), heightM: 6 }, wei.id);
    await expect(makeStop(db, input({ roomId: "L1-col", kind: "lift" }), wei.id))
      .rejects.toThrow("Only a room, area or service space can be a lift or stair stop.");
  });

  it("numbers its ids past ones already taken, deleted ones included", async () => {
    await createEntity(db, "portal", { id: "portal-1000", kind: "lift" }, wei.id);
    await softDeleteEntity(db, "portal", "portal-1000", 0, wei.id);
    const made = await makeStop(db, input(), wei.id, 1000);
    expect([made.portalId, made.endpointId]).toEqual(["portal-1001", "oth-L1-portal-1001"]);
  });
});
