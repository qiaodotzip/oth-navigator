import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Database } from "../db/client";
import { auditLog, buildings, levels, places, portalEndpoints, rooms } from "../db/schema";
import { assembleModel } from "../model/assemble";
import { createTestDb } from "../testing/harness";
import {
  VersionConflictError, createEntity, listEntities, softDeleteEntity, updateEntity,
} from "./repository";

let db: Database;

const roomData = {
  id: "L1-lobby", levelId: "oth-L1", kind: "area",
  footprint: [[0, 0], [10, 0], [10, 10], [0, 10]],
  heightM: 6, walkable: true, nameEn: "Lobby", nameZh: "大堂",
};

beforeEach(async () => {
  db = await createTestDb();
  await db.insert(buildings).values({ id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94, rotationDeg: 0 });
  await db.insert(levels).values({
    id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1,
    nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6,
  });
});

describe("createEntity", () => {
  it("creates a room at version 0", async () => {
    const room = await createEntity(db, "room", roomData, "user_1");
    expect(room.version).toBe(0);
    expect(room.nameEn).toBe("Lobby");
  });

  it("rejects data that fails the model schema", async () => {
    await expect(createEntity(db, "room", { ...roomData, footprint: [[0, 0]] }, "user_1")).rejects.toThrow();
  });

  it("writes an audit row", async () => {
    await createEntity(db, "room", roomData, "user_1");
    const rows = await db.select().from(auditLog);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.action).toBe("create");
    expect(rows[0]?.actorId).toBe("user_1");
  });
});

describe("updateEntity", () => {
  it("bumps the version and applies the patch", async () => {
    await createEntity(db, "room", roomData, "user_1");
    const updated = await updateEntity(db, "room", "L1-lobby", 0, { nameEn: "Main Lobby" }, "user_2");
    expect(updated.version).toBe(1);
    expect(updated.nameEn).toBe("Main Lobby");
  });

  it("throws VersionConflictError on a stale expected version", async () => {
    await createEntity(db, "room", roomData, "user_1");
    await updateEntity(db, "room", "L1-lobby", 0, { nameEn: "First" }, "user_1");
    await expect(updateEntity(db, "room", "L1-lobby", 0, { nameEn: "Second" }, "user_2"))
      .rejects.toBeInstanceOf(VersionConflictError);
  });

  it("does not apply the losing write — last-writer-wins is exactly what we are preventing", async () => {
    await createEntity(db, "room", roomData, "user_1");
    await updateEntity(db, "room", "L1-lobby", 0, { nameEn: "First" }, "user_1");
    await updateEntity(db, "room", "L1-lobby", 0, { nameEn: "Second" }, "user_2").catch(() => {});
    const [row] = await db.select().from(rooms).where(eq(rooms.id, "L1-lobby"));
    expect(row?.nameEn).toBe("First");
  });

  it("carries the current state on the conflict so the editor can show a diff", async () => {
    await createEntity(db, "room", roomData, "user_1");
    await updateEntity(db, "room", "L1-lobby", 0, { nameEn: "First" }, "user_1");
    await expect(updateEntity(db, "room", "L1-lobby", 0, {}, "user_2"))
      .rejects.toMatchObject({ current: expect.objectContaining({ nameEn: "First", version: 1 }) });
  });

  it("records before and after in the audit row", async () => {
    await createEntity(db, "room", roomData, "user_1");
    await updateEntity(db, "room", "L1-lobby", 0, { nameEn: "Renamed" }, "user_2");
    const rows = await db.select().from(auditLog).where(eq(auditLog.action, "update"));
    expect((rows[0]?.before as Record<string, unknown>).nameEn).toBe("Lobby");
    expect((rows[0]?.after as Record<string, unknown>).nameEn).toBe("Renamed");
  });

  it("rejects a patch that would make the entity invalid", async () => {
    await createEntity(db, "room", roomData, "user_1");
    await expect(updateEntity(db, "room", "L1-lobby", 0, { footprint: [[0, 0]] }, "user_1")).rejects.toThrow();
  });
});

describe("softDeleteEntity", () => {
  it("clears an optional field when the patch says null", async () => {
    // Unbinding is a real edit: a place wrongly bound to a room has to be able
    // to stop being bound to it.
    await db.insert(places).values({ id: "pl_1", nameEn: "NTUC", category: "retail", roomId: "r1" });
    const after = await updateEntity(db, "place", "pl_1", 0, { roomId: null } as never, null);
    expect(after.roomId).toBeNull();
  });

  it("refuses to clear a field the model requires", async () => {
    await db.insert(places).values({ id: "pl_1", nameEn: "NTUC", category: "retail" });
    await expect(
      updateEntity(db, "place", "pl_1", 0, { nameEn: null } as never, null),
    ).rejects.toThrow();
  });

  it("sets deletedAt rather than removing the row", async () => {
    await createEntity(db, "room", roomData, "user_1");
    await softDeleteEntity(db, "room", "L1-lobby", 0, "user_1");
    const [row] = await db.select().from(rooms).where(eq(rooms.id, "L1-lobby"));
    expect(row).toBeDefined();
    expect(row?.deletedAt).not.toBeNull();
  });

  it("hides soft-deleted rows from listEntities", async () => {
    await createEntity(db, "room", roomData, "user_1");
    await softDeleteEntity(db, "room", "L1-lobby", 0, "user_1");
    expect(await listEntities(db, "room")).toHaveLength(0);
  });

  it("respects optimistic locking", async () => {
    await createEntity(db, "room", roomData, "user_1");
    await expect(softDeleteEntity(db, "room", "L1-lobby", 7, "user_1"))
      .rejects.toBeInstanceOf(VersionConflictError);
  });
});

describe("a lift or stair stop's outline", () => {
  const stop = {
    id: "esc-1-1", portalId: "esc-1", levelId: "oth-L1", roomId: "L1-lobby", point: [5, 5],
    footprint: [[4, 0], [6, 0], [6, 10], [4, 10]],
  };

  it("keeps the outline and which way the flight climbs", async () => {
    await createEntity(db, "portal", { id: "esc-1", kind: "escalator" }, "user_1");
    const created = await createEntity(db, "portalEndpoint", stop, "user_1");
    expect(created.footprint).toEqual(stop.footprint);
    expect(created.flipped).toBe(false);
    const flipped = await updateEntity(db, "portalEndpoint", "esc-1-1", 0, { flipped: true }, "user_1");
    expect(flipped.flipped).toBe(true);
  });

  it("clears an outline, and the model reads the stop back without one", async () => {
    await createEntity(db, "portal", { id: "esc-1", kind: "escalator" }, "user_1");
    await createEntity(db, "portalEndpoint", stop, "user_1");
    const cleared = await updateEntity(db, "portalEndpoint", "esc-1-1", 0, { footprint: null }, "user_1");
    expect(cleared.footprint).toBeNull();
    const model = await assembleModel(db);
    expect(model.portalEndpoints[0]?.footprint).toBeUndefined();
    expect(model.portalEndpoints[0]?.flipped).toBe(false);
  });

  it("refuses to clear which way the flight climbs, which always has a value, and writes nothing", async () => {
    await createEntity(db, "portal", { id: "esc-1", kind: "escalator" }, "user_1");
    await createEntity(db, "portalEndpoint", stop, "user_1");
    await updateEntity(db, "portalEndpoint", "esc-1-1", 0, { flipped: true }, "user_1");
    await expect(updateEntity(db, "portalEndpoint", "esc-1-1", 1, { flipped: null }, "user_1"))
      .rejects.toMatchObject({ issues: [expect.objectContaining({ path: ["flipped"], message: expect.stringMatching(/can't be cleared/) })] });
    const [row] = await db.select().from(portalEndpoints).where(eq(portalEndpoints.id, "esc-1-1"));
    expect(row).toMatchObject({ flipped: true, version: 1 });
  });
});
