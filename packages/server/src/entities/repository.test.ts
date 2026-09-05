import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Database } from "../db/client";
import { auditLog, buildings, levels, rooms } from "../db/schema";
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
