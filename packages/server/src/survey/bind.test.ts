import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Database } from "../db/client";
import { buildings, captures, keyframes, levels, places, rooms } from "../db/schema";
import { VersionConflictError, createEntity, softDeleteEntity } from "../entities/repository";
import { createTestDb } from "../testing/harness";
import { BindRefusal, bindPlace } from "./bind";

const square = [[0, 0], [4, 0], [4, 4], [0, 4]];
const NOW = new Date("2026-09-28T06:00:00.000Z");
let db: Database;

beforeEach(async () => {
  db = await createTestDb();
  // bindPlace reads the assembled model, as the editor does, and that needs its building.
  await db.insert(buildings).values({ id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94, rotationDeg: 0 });
  await createEntity(db, "room", { id: "L1-shop-12", levelId: "oth-L1", kind: "room", footprint: square, heightM: 4 }, "u_sc");
  await createEntity(db, "room", { id: "L1-shop-13", levelId: "oth-L1", kind: "room", footprint: square, heightM: 4 }, "u_sc");
  await createEntity(db, "place", { id: "pl_sb", nameEn: "Starbucks", category: "retail" }, "u_sc");
  await createEntity(db, "sighting", { id: "sg_1", placeId: "pl_sb", keyframeId: "kf_1" }, "u_sc");
  await createEntity(db, "sighting", { id: "sg_2", placeId: "pl_sb", keyframeId: "kf_2", status: "proposed" }, "u_sc");
});

const bind = (over: Partial<Parameters<typeof bindPlace>[1]> = {}) =>
  bindPlace(db, { placeId: "pl_sb", placeVersion: 0, roomId: "L1-shop-12", roomVersion: 0, ...over }, "u_wei", NOW);

/** A frame of footage filmed on a floor, so a place tagged in it is on that floor. */
async function filmedOn(frameId: string, levelId: string): Promise<void> {
  await db.insert(captures).values({ id: `cap_${frameId}`, kind: "video", filename: `${levelId} walk.mp4`, levelId });
  await db.insert(keyframes).values({
    id: frameId, captureId: `cap_${frameId}`, timeMs: 1000, imageId: frameId, storagePath: "assets/aa/x.jpg", checksum: "x",
    widthPx: 640, heightPx: 480, sizeBytes: 1,
  });
}

describe("bindPlace", () => {
  it("files the place in the room, on its floor, and marks the room seen in its confirmed photos", async () => {
    expect(await bind()).toEqual({ verified: true, evidence: ["kf_1"], levelId: "oth-L1" });
    const [place] = await db.select().from(places).where(eq(places.id, "pl_sb"));
    expect(place).toMatchObject({ roomId: "L1-shop-12", levelId: "oth-L1", updatedBy: "u_wei" });
    const [room] = await db.select().from(rooms).where(eq(rooms.id, "L1-shop-12"));
    expect(room?.verification).toEqual({ status: "photo", evidence: ["kf_1"], verifiedAt: NOW.toISOString() });
  });

  it("binds without vouching for the room when no photo is confirmed", async () => {
    await createEntity(db, "place", { id: "pl_x", nameEn: "X", category: "retail" }, "u_sc");
    expect(await bind({ placeId: "pl_x" })).toEqual({ verified: false, evidence: [], levelId: "oth-L1" });
    const [room] = await db.select().from(rooms).where(eq(rooms.id, "L1-shop-12"));
    expect(room?.verification).toMatchObject({ status: "unverified" });
  });

  it("refuses a proposal, a walkway, a place bound elsewhere and a room already bound", async () => {
    await createEntity(db, "place", { id: "pl_p", nameEn: "P", category: "retail", status: "proposed" }, "u_sc");
    await createEntity(db, "place", { id: "pl_w", nameEn: "W", category: "facility", pathwayKindId: "pk_1" }, "u_sc");
    await createEntity(db, "place", { id: "pl_b", nameEn: "B", category: "retail", roomId: "L1-shop-13" }, "u_sc");
    await expect(bind({ placeId: "pl_p" })).rejects.toThrow("P is still a proposal. Accept it with review_place first.");
    await expect(bind({ placeId: "pl_w" })).rejects.toThrow("W is a walkway, which is built as a path, not bound to a room.");
    await expect(bind({ placeId: "pl_b" })).rejects.toThrow("B is bound to room L1-shop-13. Unbind it first: update the place with roomId null.");
    await expect(bind({ roomId: "L1-shop-13" })).rejects.toThrow("Room L1-shop-13 is already bound to B.");
    await expect(bind({ placeId: "pl_nope" })).rejects.toBeInstanceOf(BindRefusal);
  });

  it("refuses a kind of object, which is placed on the map, not bound", async () => {
    await createEntity(db, "place", { id: "pl_bin", nameEn: "wastebin", category: "facility", objectKindId: "ok_bin" }, "u_sc");
    await expect(bind({ placeId: "pl_bin" }))
      .rejects.toThrow("wastebin is an object, which is placed on the map, not bound to a room.");
  });

  it("rolls the place back too when the room has moved on", async () => {
    await expect(bind({ roomVersion: 5 })).rejects.toBeInstanceOf(VersionConflictError);
    const [place] = await db.select().from(places).where(eq(places.id, "pl_sb"));
    expect(place?.roomId).toBeNull();
    expect(place?.version).toBe(0);
  });

  // The editor's rule (floorUnits in editor/src/flow/buildSteps.ts): a place
  // is bound only while its room is on the map, so one whose room was
  // deleted is waiting for a room again, and a deleted room binds nothing.
  it("binds a place whose room was deleted, which is waiting for one again", async () => {
    await createEntity(db, "room", { id: "L1-shop-9", levelId: "oth-L1", kind: "room", footprint: square, heightM: 4 }, "u_sc");
    await createEntity(db, "place", { id: "pl_old", nameEn: "Old", category: "retail", roomId: "L1-shop-9" }, "u_sc");
    await softDeleteEntity(db, "room", "L1-shop-9", 0, "u_sc");
    expect(await bind({ placeId: "pl_old" })).toEqual({ verified: false, evidence: [], levelId: "oth-L1" });
    const [place] = await db.select().from(places).where(eq(places.id, "pl_old"));
    expect(place?.roomId).toBe("L1-shop-12");
  });

  it("refuses a deleted room, and says what to do instead", async () => {
    await softDeleteEntity(db, "room", "L1-shop-13", 0, "u_sc");
    await expect(bind({ roomId: "L1-shop-13" })).rejects.toThrow(
      "Room L1-shop-13 is deleted. Bind Starbucks to a room on the map, or restore this one first.",
    );
    await expect(bind({ roomId: "L1-shop-99" })).rejects.toThrow("There is no room L1-shop-99.");
  });

  it("refuses a room on another floor than the place's own, or the one it was filmed on, and writes nothing", async () => {
    await createEntity(db, "room", { id: "L2-shop-1", levelId: "oth-L2", kind: "room", footprint: square, heightM: 4 }, "u_sc");
    await createEntity(db, "place", { id: "pl_l1", nameEn: "Tea", category: "retail", levelId: "oth-L1" }, "u_sc");
    await expect(bind({ placeId: "pl_l1", roomId: "L2-shop-1" })).rejects.toThrow(
      "Tea is on floor oth-L1, and room L2-shop-1 is on floor oth-L2. Bind it to a room on oth-L1. " +
      "If its floor is wrong, update the place with levelId oth-L2 first.",
    );
    // Starbucks has no floor of its own; its tag in kf_2 was filmed on L2.
    await filmedOn("kf_2", "oth-L2");
    await expect(bind()).rejects.toThrow(
      "Starbucks was filmed on floor oth-L2, and room L1-shop-12 is on floor oth-L1. Bind it to a room on oth-L2. " +
      "If its floor is wrong, update the place with levelId oth-L1 first.",
    );
    const [tea] = await db.select().from(places).where(eq(places.id, "pl_l1"));
    expect(tea).toMatchObject({ roomId: null, version: 0 });
    const [room] = await db.select().from(rooms).where(eq(rooms.id, "L1-shop-12"));
    expect(room?.version).toBe(0);
    expect(await bind({ roomId: "L2-shop-1" })).toMatchObject({ levelId: "oth-L2" });
  });

  it("reads a place filmed on two floors as on the one it was seen on most, a tie going to the lower", async () => {
    await db.insert(levels).values([
      { id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "Level 1", nameZh: "一楼", elevationM: 0, heightM: 6 },
      { id: "oth-L2", buildingId: "oth", code: "L2", ordinal: 2, nameEn: "Level 2", nameZh: "二楼", elevationM: 6, heightM: 4 },
    ]);
    await createEntity(db, "room", { id: "L2-shop-1", levelId: "oth-L2", kind: "room", footprint: square, heightM: 4 }, "u_sc");
    await filmedOn("kf_2", "oth-L2");
    await filmedOn("kf_1", "oth-L1");
    // One frame on each: the lower floor wins, so L2's room is refused.
    await expect(bind({ roomId: "L2-shop-1" })).rejects.toThrow("Starbucks was filmed on floor oth-L1");
    await filmedOn("kf_3", "oth-L2");
    await createEntity(db, "sighting", { id: "sg_3", placeId: "pl_sb", keyframeId: "kf_3" }, "u_sc");
    expect(await bind({ roomId: "L2-shop-1" })).toMatchObject({ levelId: "oth-L2" });
  });
});
