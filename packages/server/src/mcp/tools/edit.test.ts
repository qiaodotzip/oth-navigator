import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createUser, type User } from "../../auth/users";
import { auditLog, captures, keyframes, levels, places, rooms, sightings } from "../../db/schema";
import { createEntity, updateEntity } from "../../entities/repository";
import { acquireLock, releaseLock } from "../../locks/service";
import { call, mcpFixture, type McpFixture } from "../testing";

const ROOM = { id: "L1-shop-12", levelId: "oth-L1", kind: "room", footprint: [[0, 0], [4, 0], [4, 4], [0, 4]], heightM: 4, nameEn: "Shop 12" };
let f: McpFixture;
let client: Client;
let amy: User;

beforeEach(async () => {
  f = await mcpFixture();
  amy = await createUser(f.db, { email: "amy@example.com", password: "unused", displayName: "Amy" });
  await createEntity(f.db, "room", ROOM, f.wei.id);
  client = await f.connect();
});

const room = async (id = ROOM.id) => (await f.db.select().from(rooms).where(eq(rooms.id, id)))[0];

describe("create", () => {
  it("adds a room as its person, through its token", async () => {
    const { text, isError } = await call(client, "create", { type: "room", data: { ...ROOM, id: "L1-shop-13", nameEn: "Shop 13" } });
    expect({ text, isError }).toEqual({ text: "Created room L1-shop-13, at version 0.", isError: false });
    expect((await room("L1-shop-13"))?.updatedBy).toBe(f.wei.id);
    const [trail] = await f.db.select().from(auditLog).where(eq(auditLog.entityId, "L1-shop-13"));
    expect(trail).toMatchObject({ action: "create", actorId: f.wei.id, via: f.tokenId });
  });

  it("refuses an id already taken", async () => {
    expect((await call(client, "create", { type: "room", data: ROOM })).text)
      .toBe("There is already a room L1-shop-12. Choose another id, or update that one.");
  });

  it("says what the model's schema refused, and adds nothing", async () => {
    const { text, isError } = await call(client, "create", { type: "room", data: { ...ROOM, id: "r-bad", footprint: [[0, 0], [1, 1]] } });
    expect(isError).toBe(true);
    expect(text).toMatch(/^Not saved: footprint: a ring needs at least three points/);
    expect(await room("r-bad")).toBeUndefined();
  });

  it("makes any place or tag it adds a proposal, in Claude's name", async () => {
    await call(client, "create", { type: "place", data: { id: "pl_new", nameEn: "Gong Cha", category: "retail", status: "confirmed" } });
    expect((await f.db.select().from(places).where(eq(places.id, "pl_new")))[0])
      .toMatchObject({ status: "proposed", proposedBy: "Claude Code (Wei)" });
  });

  it("won't make a floor with owners", async () => {
    const { isError, text } = await call(client, "create", { type: "level", data: {
      id: "oth-L3", buildingId: "oth", code: "L3", ordinal: 3, nameEn: "Level 3", nameZh: "三楼", elevationM: 10, heightM: 4, ownerIds: [amy.id],
    } });
    expect(isError).toBe(true);
    expect(text).toBe("A token can't change who owns a floor. A teammate does that on the Floors page.");
  });
});

describe("update", () => {
  it("saves at the version it read", async () => {
    expect((await call(client, "update", { type: "room", id: ROOM.id, expectedVersion: 0, data: { nameEn: "Starbucks" } })).text)
      .toBe("Saved room L1-shop-12: it is now at version 1.");
    expect((await room())?.nameEn).toBe("Starbucks");
  });

  it("writes nothing on a conflict, and says whose change it met and what the room is now", async () => {
    await updateEntity(f.db, "room", ROOM.id, 0, { nameEn: "Starbucks" }, amy.id);
    const { text, isError } = await call(client, "update", { type: "room", id: ROOM.id, expectedVersion: 0, data: { nameEn: "Shop twelve" } });
    expect(isError).toBe(true);
    expect(text).toMatch(/^Not saved: room L1-shop-12 is at version 1 and you sent 0\. Amy changed it at \d\d:\d\d on \d{1,2} [A-Z][a-z]{2}\. Its current value is \{.*"nameEn":"Starbucks".*\}\. Read it again and decide\.$/);
    expect((await room())?.nameEn).toBe("Starbucks");
  });

  it("won't change a floor's owners, or a place's or tag's status", async () => {
    expect((await call(client, "update", { type: "level", id: "oth-L1", expectedVersion: 0, data: { ownerIds: [amy.id] } })).text)
      .toBe("A token can't change who owns a floor. A teammate does that on the Floors page.");
    expect((await f.db.select().from(levels).where(eq(levels.id, "oth-L1")))[0]?.ownerIds).toEqual([f.wei.id]);
    await createEntity(f.db, "place", { id: "pl_1", nameEn: "A", category: "retail", status: "proposed" }, amy.id);
    expect((await call(client, "update", { type: "place", id: "pl_1", expectedVersion: 0, data: { status: "confirmed" } })).text)
      .toBe("A place's or a tag's status changes only through review_place, which keeps its tags in step.");
  });

  it("won't edit what someone has open, even its own person in a browser tab", async () => {
    await acquireLock(f.db, "room", ROOM.id, amy.id, 300);
    expect((await call(client, "update", { type: "room", id: ROOM.id, expectedVersion: 0, data: { nameEn: "X" } })).text)
      .toBe("Not saved: Amy is editing room L1-shop-12 now. Leave it, and try again once they have moved on.");
    await releaseLock(f.db, "room", ROOM.id, amy.id);
    await acquireLock(f.db, "room", ROOM.id, f.wei.id, 300);
    expect((await call(client, "update", { type: "room", id: ROOM.id, expectedVersion: 0, data: { nameEn: "X" } })).text)
      .toMatch(/^Not saved: Wei is editing room L1-shop-12 now/);
  });

  it("says a deleted or missing thing is not there", async () => {
    expect((await call(client, "update", { type: "room", id: "nope", expectedVersion: 0, data: { nameEn: "X" } })).text)
      .toBe("There is no room nope, or it is deleted. get says which; restore brings back a deleted one.");
  });
});

describe("delete and restore", () => {
  it("delete is soft and says how to restore; restore brings it back", async () => {
    expect((await call(client, "delete", { type: "room", id: ROOM.id, expectedVersion: 0 })).text)
      .toBe('Deleted room L1-shop-12; nothing is gone. To undo: restore with type "room", id "L1-shop-12" and expectedVersion 1.');
    expect((await room())?.deletedAt).toBeInstanceOf(Date);
    expect((await call(client, "restore", { type: "room", id: ROOM.id, expectedVersion: 1 })).text)
      .toBe("Restored room L1-shop-12, at version 2.");
    expect((await room())?.deletedAt).toBeNull();
    expect((await call(client, "restore", { type: "room", id: ROOM.id, expectedVersion: 2 })).text)
      .toBe("room L1-shop-12 isn't deleted, so there is nothing to restore.");
  });

  it("bins a frame with its tags, and restores them together, at the version read", async () => {
    await f.db.insert(captures).values({ id: "cap_1", kind: "video", filename: "L1 walk.mp4", levelId: "oth-L1" });
    await f.db.insert(keyframes).values({
      id: "kf_1", captureId: "cap_1", timeMs: 1000, imageId: "kf_1", storagePath: "assets/aa/x.jpg", checksum: "x", widthPx: 640, heightPx: 480, sizeBytes: 1,
    });
    await createEntity(f.db, "place", { id: "pl_1", nameEn: "A", category: "retail" }, amy.id);
    await createEntity(f.db, "sighting", { id: "sg_1", placeId: "pl_1", keyframeId: "kf_1" }, amy.id);

    expect((await call(client, "delete", { type: "keyframe", id: "kf_1", expectedVersion: 3 })).text).toMatch(/^Not saved: keyframe kf_1 is at version 0 and you sent 3\./);
    expect((await call(client, "delete", { type: "keyframe", id: "kf_1", expectedVersion: 0 })).text)
      .toBe('Binned frame kf_1 with 1 tag. To undo: restore with type "keyframe", id "kf_1" and expectedVersion 1.');
    expect((await f.db.select().from(sightings).where(eq(sightings.id, "sg_1")))[0]?.deletedAt).toBeInstanceOf(Date);
    expect((await call(client, "restore", { type: "keyframe", id: "kf_1", expectedVersion: 1 })).text).toBe("Restored frame kf_1 with 1 tag.");
    expect((await f.db.select().from(sightings).where(eq(sightings.id, "sg_1")))[0]?.deletedAt).toBeNull();
  });

  it("leaves captures and places to their own ways", async () => {
    expect((await call(client, "delete", { type: "capture", id: "cap_1", expectedVersion: 0 })).text)
      .toBe("A capture goes with all its frames and can't be restored, so only a person removes one, in the app.");
    expect((await call(client, "delete", { type: "place", id: "pl_1", expectedVersion: 0 })).text)
      .toBe("Remove a place with review_place reject, which takes its tags with it and can be restored.");
  });
});
