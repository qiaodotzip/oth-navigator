import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createUser, type User } from "../../auth/users";
import { auditLog, captures, keyframes, levels, places, portalEndpoints, rooms, sightings } from "../../db/schema";
import { createEntity, softDeleteEntity, updateEntity } from "../../entities/repository";
import { acquireLock, releaseLock } from "../../locks/service";
import { rejectPlace } from "../../survey/review";
import { call, mcpFixture, type McpFixture } from "../testing";

const ROOM = { id: "L1-shop-12", levelId: "oth-L1", kind: "room", footprint: [[0, 0], [4, 0], [4, 4], [0, 4]], heightM: 4, nameEn: "Shop 12" };
const STATUS = "A place's or a tag's status changes only through review_place, which keeps its tags in step.";
const AMY_EDITING = "Not saved: Amy is editing room L1-shop-12 now. Leave it, and try again once they have moved on.";
let f: McpFixture;
let client: Client;
let amy: User;

beforeEach(async () => {
  f = await mcpFixture();
  amy = await createUser(f.db, { email: "amy@example.com", password: "unused", displayName: "Amy" });
  await createEntity(f.db, "room", ROOM, f.wei.id);
  client = await f.connect();
});

afterEach(() => {
  vi.restoreAllMocks();
});

const room = async (id = ROOM.id) => (await f.db.select().from(rooms).where(eq(rooms.id, id)))[0];
const place = async (id = "pl_1") => (await f.db.select().from(places).where(eq(places.id, id)))[0];
const tag = async (id = "sg_1") => (await f.db.select().from(sightings).where(eq(sightings.id, id)))[0];

/** Frame kf_1 of capture cap_1, with Amy's tag sg_1 on it naming her place pl_1. */
async function taggedFrame(): Promise<void> {
  await f.db.insert(captures).values({ id: "cap_1", kind: "video", filename: "L1 walk.mp4", levelId: "oth-L1" });
  await f.db.insert(keyframes).values({
    id: "kf_1", captureId: "cap_1", timeMs: 1000, imageId: "kf_1", storagePath: "assets/aa/x.jpg", checksum: "x", widthPx: 640, heightPx: 480, sizeBytes: 1,
  });
  await createEntity(f.db, "place", { id: "pl_1", nameEn: "A", category: "retail" }, amy.id);
  await createEntity(f.db, "sighting", { id: "sg_1", placeId: "pl_1", keyframeId: "kf_1" }, amy.id);
}

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

  it("points to restore when the id taken is a deleted one's", async () => {
    await softDeleteEntity(f.db, "room", ROOM.id, 0, amy.id);
    expect((await call(client, "create", { type: "room", data: ROOM })).text)
      .toBe("There is already a room L1-shop-12, but it is deleted. restore brings it back, or choose another id.");
  });

  it("says an id someone adds while it runs is taken, and writes nothing over theirs", async () => {
    // Amy's room lands between create's look for the id and its own write.
    const insert = f.db.insert.bind(f.db);
    let raced = false;
    vi.spyOn(f.db, "insert").mockImplementation(((table: Parameters<typeof insert>[0]) => {
      if (table !== rooms || raced) return insert(table);
      raced = true;
      return {
        values: async (values: never) => {
          await createEntity(f.db, "room", { ...ROOM, id: "L1-shop-13", nameEn: "Amy's" }, amy.id);
          return insert(table).values(values);
        },
      };
    }) as never);
    const { text, isError } = await call(client, "create", { type: "room", data: { ...ROOM, id: "L1-shop-13", nameEn: "Wei's" } });
    expect(isError).toBe(true);
    expect(text).toBe("Not saved: room L1-shop-13 already exists, added while this ran. Read it with get, then choose another id or update that one.");
    expect((await room("L1-shop-13"))?.nameEn).toBe("Amy's");
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
    await call(client, "create", { type: "sighting", data: { id: "sg_new", placeId: "pl_new", keyframeId: "kf_1", status: "confirmed", proposedBy: "Amy" } });
    expect(await tag("sg_new")).toMatchObject({ status: "proposed", proposedBy: "Claude Code (Wei)" });
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
      .toBe(STATUS);
  });

  it("won't change who proposed a place or tag, nor a tag's status", async () => {
    await createEntity(f.db, "place", { id: "pl_1", nameEn: "A", category: "retail", status: "proposed", proposedBy: "Amy" }, amy.id);
    await createEntity(f.db, "sighting", { id: "sg_1", placeId: "pl_1", keyframeId: "kf_1", status: "proposed", proposedBy: "Amy" }, amy.id);
    expect((await call(client, "update", { type: "place", id: "pl_1", expectedVersion: 0, data: { proposedBy: "Wei" } })).text).toBe(STATUS);
    expect((await call(client, "update", { type: "sighting", id: "sg_1", expectedVersion: 0, data: { status: "confirmed" } })).text).toBe(STATUS);
    expect(await place()).toMatchObject({ proposedBy: "Amy", version: 0 });
    expect(await tag()).toMatchObject({ status: "proposed", version: 0 });
  });

  it("won't edit what someone has open, even its own person in a browser tab", async () => {
    await acquireLock(f.db, "room", ROOM.id, amy.id, 300);
    expect((await call(client, "update", { type: "room", id: ROOM.id, expectedVersion: 0, data: { nameEn: "X" } })).text)
      .toBe(AMY_EDITING);
    await releaseLock(f.db, "room", ROOM.id, amy.id);
    await acquireLock(f.db, "room", ROOM.id, f.wei.id, 300);
    expect((await call(client, "update", { type: "room", id: ROOM.id, expectedVersion: 0, data: { nameEn: "X" } })).text)
      .toMatch(/^Not saved: Wei is editing room L1-shop-12 now/);
  });

  it("keeps a lift or stair stop's outline and which way its flight climbs, rather than saying Saved and dropping them", async () => {
    const outline = [[4, 0], [6, 0], [6, 10], [4, 10]];
    await call(client, "create", { type: "portal", data: { id: "esc-1", kind: "escalator" } });
    expect((await call(client, "create", { type: "portalEndpoint", data: {
      id: "esc-1-1", portalId: "esc-1", levelId: "oth-L1", roomId: ROOM.id, point: [5, 5], footprint: outline,
    } })).text).toBe("Created portalEndpoint esc-1-1, at version 0.");
    const stop = async () => (await f.db.select().from(portalEndpoints).where(eq(portalEndpoints.id, "esc-1-1")))[0];
    expect(await stop()).toMatchObject({ footprint: outline, flipped: false });

    const wider = [[3, 0], [7, 0], [7, 10], [3, 10]];
    expect((await call(client, "update", { type: "portalEndpoint", id: "esc-1-1", expectedVersion: 0, data: { footprint: wider, flipped: true } })).text)
      .toBe("Saved portalEndpoint esc-1-1: it is now at version 1.");
    expect(await stop()).toMatchObject({ footprint: wider, flipped: true });
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

  it("won't delete or restore what someone has open", async () => {
    await acquireLock(f.db, "room", ROOM.id, amy.id, 300);
    expect((await call(client, "delete", { type: "room", id: ROOM.id, expectedVersion: 0 })).text).toBe(AMY_EDITING);
    expect((await room())?.deletedAt).toBeNull();
    await releaseLock(f.db, "room", ROOM.id, amy.id);
    await call(client, "delete", { type: "room", id: ROOM.id, expectedVersion: 0 });
    await acquireLock(f.db, "room", ROOM.id, amy.id, 300);
    expect((await call(client, "restore", { type: "room", id: ROOM.id, expectedVersion: 1 })).text).toBe(AMY_EDITING);
    expect((await room())?.deletedAt).toBeInstanceOf(Date);
  });

  it("bins a frame with its tags, and restores them together, at the version read", async () => {
    await taggedFrame();
    expect((await call(client, "delete", { type: "keyframe", id: "kf_1", expectedVersion: 3 })).text).toMatch(/^Not saved: keyframe kf_1 is at version 0 and you sent 3\./);
    expect((await call(client, "delete", { type: "keyframe", id: "kf_1", expectedVersion: 0 })).text)
      .toBe('Binned frame kf_1 with 1 tag. To undo: restore with type "keyframe", id "kf_1" and expectedVersion 1.');
    expect((await tag())?.deletedAt).toBeInstanceOf(Date);
    expect((await call(client, "restore", { type: "keyframe", id: "kf_1", expectedVersion: 1 })).text).toBe("Restored frame kf_1 with 1 tag, at version 2.");
    expect((await tag())?.deletedAt).toBeNull();
  });

  it("keeps where a frame's file is kept out of a conflict, as get does", async () => {
    await taggedFrame();
    const binning = (await call(client, "delete", { type: "keyframe", id: "kf_1", expectedVersion: 3 })).text;
    await call(client, "delete", { type: "keyframe", id: "kf_1", expectedVersion: 0 });
    const restoring = (await call(client, "restore", { type: "keyframe", id: "kf_1", expectedVersion: 0 })).text;
    expect(binning).toMatch(/^Not saved: keyframe kf_1 is at version 0 and you sent 3\./);
    expect(restoring).toMatch(/^Not saved: keyframe kf_1 is at version 1 and you sent 0\./);
    for (const text of [binning, restoring]) {
      expect(text).toContain('"widthPx":640');
      expect(text).not.toMatch(/storagePath|checksum|assets\/aa/);
    }
  });

  it("won't delete a tag binned with its frame again, so the frame's restore still brings it back", async () => {
    await taggedFrame();
    await call(client, "delete", { type: "keyframe", id: "kf_1", expectedVersion: 0 });
    const binned = await tag();
    expect((await call(client, "delete", { type: "sighting", id: "sg_1", expectedVersion: 1 })).text)
      .toBe("sighting sg_1 is already deleted; restore brings it back.");
    expect(await tag()).toMatchObject({ version: 1, deletedAt: binned?.deletedAt });
    expect((await call(client, "restore", { type: "keyframe", id: "kf_1", expectedVersion: 1 })).text).toBe("Restored frame kf_1 with 1 tag, at version 2.");
    expect((await tag())?.deletedAt).toBeNull();
  });

  it("says when there is no such frame, or it is binned already, or it isn't binned", async () => {
    await taggedFrame();
    expect((await call(client, "delete", { type: "keyframe", id: "kf_nope", expectedVersion: 0 })).text).toBe("There is no frame kf_nope.");
    expect((await call(client, "restore", { type: "keyframe", id: "kf_nope", expectedVersion: 0 })).text).toBe("There is no frame kf_nope.");
    expect((await call(client, "restore", { type: "keyframe", id: "kf_1", expectedVersion: 0 })).text).toBe("Frame kf_1 isn't binned.");
    await call(client, "delete", { type: "keyframe", id: "kf_1", expectedVersion: 0 });
    expect((await call(client, "delete", { type: "keyframe", id: "kf_1", expectedVersion: 1 })).text)
      .toBe("Frame kf_1 is already binned; restore brings it back.");
  });

  it("restores a rejected place with the tags rejected with it", async () => {
    await taggedFrame();
    await rejectPlace(f.db, "pl_1", 0, amy.id);
    expect((await tag())?.deletedAt).toBeInstanceOf(Date);
    expect((await call(client, "restore", { type: "place", id: "pl_1", expectedVersion: 1 })).text)
      .toBe("Restored place pl_1 with 1 tag, at version 2.");
    expect((await place())?.deletedAt).toBeNull();
    expect((await tag())?.deletedAt).toBeNull();
  });

  it("leaves captures and places to their own ways", async () => {
    expect((await call(client, "delete", { type: "capture", id: "cap_1", expectedVersion: 0 })).text)
      .toBe("A capture goes with all its frames and can't be restored, so only a person removes one, in the app.");
    expect((await call(client, "delete", { type: "place", id: "pl_1", expectedVersion: 0 })).text)
      .toBe("Remove a place with review_place reject, which takes its tags with it and can be restored.");
  });
});
