import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createUser, type User } from "../../auth/users";
import { auditLog, captures, keyframes, places, rooms, sightings } from "../../db/schema";
import { createEntity, softDeleteEntity, updateEntity } from "../../entities/repository";
import { acquireLock } from "../../locks/service";
import { call, mcpFixture, type McpFixture } from "../testing";

let f: McpFixture;
let client: Client;
let amy: User;

beforeEach(async () => {
  f = await mcpFixture();
  amy = await createUser(f.db, { email: "amy@example.com", password: "unused", displayName: "Amy" });
  await f.db.insert(captures).values({ id: "cap_1", kind: "video", filename: "L1 walk.mp4", levelId: "oth-L1" });
  for (const id of ["kf_1", "kf_2"]) {
    await f.db.insert(keyframes).values({
      id, captureId: "cap_1", timeMs: 1000, imageId: id, storagePath: "assets/aa/x.jpg", checksum: "x",
      widthPx: 640, heightPx: 480, sizeBytes: 1,
    });
  }
  await createEntity(f.db, "place", { id: "pl_gc", nameEn: "Gong Ch", category: "retail", levelId: "oth-L1", status: "proposed", proposedBy: "claude-code" }, amy.id);
  await createEntity(f.db, "sighting", { id: "sg_1", placeId: "pl_gc", keyframeId: "kf_1", status: "proposed" }, amy.id);
  await createEntity(f.db, "room", { id: "L1-shop-12", levelId: "oth-L1", kind: "room", footprint: [[0, 0], [4, 0], [4, 4], [0, 4]], heightM: 4 }, amy.id);
  client = await f.connect();
});

describe("tag_frame", () => {
  it("proposes a new place from a frame, in Claude's name, through the token", async () => {
    const { text, isError } = await call(client, "tag_frame", { frameId: "kf_2", nameEn: "Starbucks", category: "retail" });
    expect(isError).toBe(false);
    const tagged = JSON.parse(text) as { placeId: string; sightingId: string; status: string };
    expect(tagged.status).toBe("proposed");
    const [place] = await f.db.select().from(places).where(eq(places.id, tagged.placeId));
    expect(place).toMatchObject({ status: "proposed", proposedBy: "Claude Code (Wei)", updatedBy: f.wei.id, levelId: "oth-L1" });
    const trail = await f.db.select().from(auditLog).where(eq(auditLog.entityId, tagged.sightingId));
    expect(trail[0]).toMatchObject({ action: "create", actorId: f.wei.id, via: f.tokenId });
  });

  it("says what confirms a tag on a place already confirmed, which Review does not list", async () => {
    await createEntity(f.db, "place", { id: "pl_sb", nameEn: "Starbucks", category: "retail", levelId: "oth-L1" }, amy.id);
    const { text, isError } = await call(client, "tag_frame", { frameId: "kf_2", placeId: "pl_sb" });
    expect(isError).toBe(false);
    const [answer, note] = text.split("\n");
    expect(JSON.parse(answer!)).toMatchObject({ placeId: "pl_sb", placeStatus: "confirmed", status: "proposed" });
    expect(note).toBe(
      "pl_sb is already confirmed, and Review lists only proposed places, so this tag is not shown there. " +
      "It stays a proposal until review_place with decision accept runs on pl_sb, which confirms its proposed tags. " +
      "Wei can ask you to do that.",
    );
    expect(note).not.toContain("accepts it in Review");
  });

  it("says why a tag can't be made", async () => {
    expect(await call(client, "tag_frame", { frameId: "kf_1", placeId: "pl_gc" })).toMatchObject({
      isError: true, text: "Frame kf_1 already has a tag for Gong Ch (sg_1).",
    });
  });
});

describe("review_place", () => {
  it("accepts a proposal with its tags, corrected, and says how to undo it; reopen undoes it", async () => {
    const accepted = await call(client, "review_place", { placeId: "pl_gc", decision: "accept", expectedVersion: 0, nameEn: "Gong Cha" });
    expect(accepted).toMatchObject({
      isError: false,
      text: 'Accepted Gong Cha and 1 tag. It is now at version 1. To undo: review_place with decision reopen, expectedVersion 1, ' +
        'nameEn "Gong Ch", category "retail", levelId "oth-L1" and sightingIds ["sg_1"].',
    });
    expect((await f.db.select().from(sightings).where(eq(sightings.id, "sg_1")))[0]?.status).toBe("confirmed");
    const reopened = await call(client, "review_place", {
      placeId: "pl_gc", decision: "reopen", expectedVersion: 1, nameEn: "Gong Ch", category: "retail", levelId: "oth-L1", sightingIds: ["sg_1"],
    });
    expect(reopened.text).toBe("Reopened Gong Ch: it waits in Review again, with 1 tag back to proposed.");
    expect((await f.db.select().from(places).where(eq(places.id, "pl_gc")))[0]).toMatchObject({ status: "proposed", nameEn: "Gong Ch" });
    expect((await f.db.select().from(sightings).where(eq(sightings.id, "sg_1")))[0]?.status).toBe("proposed");
  });

  it("files a place with no floor as it accepts it, and the undo takes the floor away again", async () => {
    await createEntity(f.db, "place", { id: "pl_nf", nameEn: "Kiosk", category: "retail", status: "proposed" }, amy.id);
    const accepted = await call(client, "review_place", { placeId: "pl_nf", decision: "accept", expectedVersion: 0, levelId: "oth-L1" });
    expect(accepted.text).toContain('nameEn "Kiosk", category "retail", levelId null and sightingIds []');
    expect((await f.db.select().from(places).where(eq(places.id, "pl_nf")))[0]?.levelId).toBe("oth-L1");
    const reopened = await call(client, "review_place", {
      placeId: "pl_nf", decision: "reopen", expectedVersion: 1, nameEn: "Kiosk", category: "retail", levelId: null, sightingIds: [],
    });
    expect(reopened.isError).toBe(false);
    expect((await f.db.select().from(places).where(eq(places.id, "pl_nf")))[0]).toMatchObject({ status: "proposed", levelId: null });
  });

  it("marks an accept's writes as coming through the token", async () => {
    await call(client, "review_place", { placeId: "pl_gc", decision: "accept", expectedVersion: 0 });
    for (const id of ["pl_gc", "sg_1"]) {
      const trail = await f.db.select().from(auditLog).where(eq(auditLog.entityId, id));
      expect(trail.find(row => row.action === "update")).toMatchObject({ actorId: f.wei.id, via: f.tokenId });
    }
  });

  it("rejects a proposal with its tags, and says how to restore it", async () => {
    expect((await call(client, "review_place", { placeId: "pl_gc", decision: "reject", expectedVersion: 0 })).text).toBe(
      'Rejected Gong Ch and 1 tag. To undo: restore with type "place", id "pl_gc" and expectedVersion 1.',
    );
  });

  it("merges a proposal into a place already on the map", async () => {
    await createEntity(f.db, "place", { id: "pl_real", nameEn: "Gong Cha", category: "retail", levelId: "oth-L1" }, amy.id);
    expect((await call(client, "review_place", { placeId: "pl_gc", decision: "merge", expectedVersion: 0, into: "pl_real" })).text)
      .toBe("Merged Gong Ch into pl_real: 1 tag moved there, confirmed.");
    expect(await call(client, "review_place", { placeId: "pl_real", decision: "merge", expectedVersion: 0 })).toMatchObject({
      isError: true, text: "merge needs into: the place this one is the same as.",
    });
    expect(await call(client, "review_place", { placeId: "pl_real", decision: "merge", expectedVersion: 0, into: "pl_gone" })).toMatchObject({
      isError: true, text: "There is no place pl_gone to merge into.",
    });
  });

  it("writes nothing on a conflict, and says whose change it met", async () => {
    await updateEntity(f.db, "place", "pl_gc", 0, { notes: "checked" }, amy.id);
    const { text, isError } = await call(client, "review_place", { placeId: "pl_gc", decision: "accept", expectedVersion: 0 });
    expect(isError).toBe(true);
    expect(text).toMatch(/^Not saved: place pl_gc is at version 1 and you sent 0\. Amy changed it at \d\d:\d\d on \d{1,2} [A-Z][a-z]{2}\. Its current value is \{.*\}\. Read it again and decide\.$/);
    expect((await f.db.select().from(places).where(eq(places.id, "pl_gc")))[0]?.status).toBe("proposed");
  });

  it("leaves a place alone while someone has it open", async () => {
    await acquireLock(f.db, "place", "pl_gc", amy.id, 300);
    expect((await call(client, "review_place", { placeId: "pl_gc", decision: "accept", expectedVersion: 0 })).text)
      .toBe("Not saved: Amy is editing place pl_gc now. Leave it, and try again once they have moved on.");
  });
});

describe("bind_place", () => {
  beforeEach(async () => {
    await createEntity(f.db, "place", { id: "pl_sb", nameEn: "Starbucks", category: "retail" }, amy.id);
    await createEntity(f.db, "sighting", { id: "sg_sb", placeId: "pl_sb", keyframeId: "kf_2" }, amy.id);
  });

  it("binds a confirmed place to a room and marks the room seen in a photo", async () => {
    expect((await call(client, "bind_place", { placeId: "pl_sb", placeVersion: 0, roomId: "L1-shop-12", roomVersion: 0 })).text)
      .toBe("Bound pl_sb to room L1-shop-12, and marked the room seen in 1 photo.");
    expect((await f.db.select().from(rooms).where(eq(rooms.id, "L1-shop-12")))[0]?.verification).toMatchObject({ status: "photo", evidence: ["kf_2"] });
  });

  it("names the room when it is the room that moved on, and binds nothing", async () => {
    await updateEntity(f.db, "room", "L1-shop-12", 0, { nameEn: "Shop 12" }, amy.id);
    const { text, isError } = await call(client, "bind_place", { placeId: "pl_sb", placeVersion: 0, roomId: "L1-shop-12", roomVersion: 0 });
    expect(isError).toBe(true);
    expect(text).toMatch(/^Not saved: room L1-shop-12 is at version 1 and you sent 0\. Amy changed it/);
    expect((await f.db.select().from(places).where(eq(places.id, "pl_sb")))[0]?.roomId).toBeNull();
  });

  it("says why a bind can't be made", async () => {
    expect((await call(client, "bind_place", { placeId: "pl_gc", placeVersion: 0, roomId: "L1-shop-12", roomVersion: 0 })).text)
      .toBe("Gong Ch is still a proposal. Accept it with review_place first.");
  });

  it("refuses a deleted room, and a room on another floor, as Bind places does", async () => {
    await softDeleteEntity(f.db, "room", "L1-shop-12", 0, amy.id);
    expect(await call(client, "bind_place", { placeId: "pl_sb", placeVersion: 0, roomId: "L1-shop-12", roomVersion: 1 })).toMatchObject({
      isError: true, text: "Room L1-shop-12 is deleted. Bind Starbucks to a room on the map, or restore this one first.",
    });
    await createEntity(f.db, "room", { id: "L2-shop-1", levelId: "oth-L2", kind: "room", footprint: [[0, 0], [4, 0], [4, 4], [0, 4]], heightM: 4 }, amy.id);
    expect(await call(client, "bind_place", { placeId: "pl_sb", placeVersion: 0, roomId: "L2-shop-1", roomVersion: 0 })).toMatchObject({
      isError: true,
      text: "Starbucks was filmed on floor oth-L1, and room L2-shop-1 is on floor oth-L2. Bind it to a room on oth-L1. " +
        "If its floor is wrong, update the place with levelId oth-L2 first.",
    });
  });
});
