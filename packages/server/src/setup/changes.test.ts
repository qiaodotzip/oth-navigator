import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { beforeEach, describe, expect, it } from "vitest";
import { createUser, type User } from "../auth/users";
import { captures, keyframes } from "../db/schema";
import { replaceDrafts } from "../drafts/service";
import { createEntity, updateEntity } from "../entities/repository";
import { call, mcpFixture, type McpFixture } from "../mcp/testing";
import { listClaudeChanges } from "./changes";

const sq = (x0: number, y0: number, x1: number, y1: number): [number, number][] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const SOURCE = { checksum: "a".repeat(64), page: 1 };
/** What the wizard sends for "every change there is". */
const EPOCH = new Date(0);
let f: McpFixture;
let client: Client;
let amy: User;

beforeEach(async () => {
  f = await mcpFixture();
  amy = await createUser(f.db, { email: "amy@example.com", password: "unused", displayName: "Amy" });
  client = await f.connect();
});

/** Claude accepts the drawing's SHOP 12 as Starbucks, and sets Plaza aside. */
async function claudeDecides(): Promise<{ shop: string; plaza: string }> {
  const drafts = await replaceDrafts(f.db, "oth-L1", SOURCE, [
    { nameEn: "SHOP 12", kind: "room", footprint: sq(0, 20, 10, 30), labelPoint: [5, 25], areaM2: 100 },
    { nameEn: "Plaza", kind: "area", labelPoint: [50, 50], areaM2: 0 },
  ], amy.id);
  const id = (name: string) => String(drafts.find(d => d.nameEn === name)!.id);
  await call(client, "decide_drafts", { floor: "L1", items: [
    { id: id("SHOP 12"), expectedVersion: 0, decision: "accept", nameEn: "Starbucks" },
    { id: id("Plaza"), expectedVersion: 0, decision: "set_aside" },
  ] });
  return { shop: id("SHOP 12"), plaza: id("Plaza") };
}

/** One frame, kf_1, filmed on L1. */
async function frameOnL1(): Promise<void> {
  await f.db.insert(captures).values({ id: "cap_1", kind: "video", filename: "L1 walk.mp4", levelId: "oth-L1" });
  await f.db.insert(keyframes).values({
    id: "kf_1", captureId: "cap_1", timeMs: 0, imageId: "kf_1", storagePath: "assets/aa/x.jpg", checksum: "x", widthPx: 640, heightPx: 480, sizeBytes: 1,
  });
}

/** A bound Starbucks and Gong Cha either side of a corridor, filmed in two frames, and a wastebin kind. */
async function corridorWithBins(): Promise<void> {
  await createEntity(f.db, "room", { id: "L1-corridor", levelId: "oth-L1", kind: "area", footprint: sq(0, 0, 60, 6), heightM: 6, walkable: true }, amy.id);
  await createEntity(f.db, "room", { id: "L1-a", levelId: "oth-L1", kind: "room", footprint: sq(0, 6, 10, 14), heightM: 6, nameEn: "Unit 1" }, amy.id);
  await createEntity(f.db, "room", { id: "L1-b", levelId: "oth-L1", kind: "room", footprint: sq(10, 6, 20, 14), heightM: 6, nameEn: "Unit 2" }, amy.id);
  await f.db.insert(captures).values({ id: "cap_1", kind: "video", filename: "L1 walk.mp4", levelId: "oth-L1" });
  await f.db.insert(keyframes).values([0, 1].map(i => ({
    id: `kf_${i}`, captureId: "cap_1", timeMs: i * 1000, imageId: `kf_${i}`, storagePath: "assets/aa/x.jpg", checksum: "x", widthPx: 640, heightPx: 480, sizeBytes: 1,
  })));
  await createEntity(f.db, "place", { id: "pl_a", nameEn: "Starbucks", category: "retail", levelId: "oth-L1", roomId: "L1-a" }, amy.id);
  await createEntity(f.db, "place", { id: "pl_b", nameEn: "Gong Cha", category: "retail", levelId: "oth-L1", roomId: "L1-b" }, amy.id);
  await createEntity(f.db, "objectKind", { id: "bin", nameEn: "wastebin", size: { w: 0.5, d: 0.5, h: 1 } }, amy.id);
  await createEntity(f.db, "place", { id: "pl_bin", nameEn: "wastebin", category: "facility", objectKindId: "bin" }, amy.id);
  for (const [id, place, frame] of [["sg_a", "pl_a", "kf_0"], ["sg_b", "pl_b", "kf_1"], ["sg_1", "pl_bin", "kf_0"], ["sg_2", "pl_bin", "kf_1"]] as const) {
    await createEntity(f.db, "sighting", { id, placeId: place, keyframeId: frame }, amy.id);
  }
}

const brief = (changes: Awaited<ReturnType<typeof listClaudeChanges>>) =>
  changes.map(c => [c.group, c.summary, c.entityType, c.action, c.undone]);

describe("listClaudeChanges", () => {
  it("lists each accepted draft once, as the room's create, and a set-aside apart, in plain words", async () => {
    await claudeDecides();
    const changes = await listClaudeChanges(f.db, "oth-L1", EPOCH);
    expect(brief(changes)).toEqual(expect.arrayContaining([
      ["rooms", "Made Starbucks from a draft (the drawing said SHOP 12)", "room", "create", false],
      ["drafts", "Set aside the draft Plaza for a person to decide", "roomDraft", "delete", false],
    ]));
    expect(changes).toHaveLength(2);
    const rooms = changes.find(c => c.group === "rooms")!;
    expect(Object.keys(rooms).sort()).toEqual(["action", "at", "auditId", "entityId", "entityType", "group", "summary", "undone"]);
    expect(rooms.entityId).toBe("L1-starbucks");
  });

  it("folds a stop's three writes into one row", async () => {
    await createEntity(f.db, "room", { id: "L1-esc", levelId: "oth-L1", kind: "room", footprint: sq(4, 2, 6, 12), heightM: 6, nameEn: "Escalator - 07" }, amy.id);
    await call(client, "make_stop", { floor: "L1", room: "L1-esc", expectedVersion: 0, kind: "escalator" });
    expect(brief(await listClaudeChanges(f.db, "oth-L1", EPOCH)))
      .toEqual([["stops", "Made Escalator - 07 an escalator stop", "portalEndpoint", "create", false]]);
  });

  it("lists a bind with the room it went to and its photos", async () => {
    await createEntity(f.db, "room", { id: "L1-shop", levelId: "oth-L1", kind: "room", footprint: sq(0, 20, 10, 30), heightM: 4, nameEn: "Shop 12" }, amy.id);
    await frameOnL1();
    await createEntity(f.db, "place", { id: "pl_sb", nameEn: "Starbucks", category: "retail", levelId: "oth-L1" }, amy.id);
    await createEntity(f.db, "sighting", { id: "sg_1", placeId: "pl_sb", keyframeId: "kf_1" }, amy.id);
    await call(client, "bind_place", { placeId: "pl_sb", placeVersion: 0, roomId: "L1-shop", roomVersion: 0 });
    expect(brief(await listClaudeChanges(f.db, "oth-L1", EPOCH)))
      .toEqual([["places", "Bound Starbucks to Shop 12, seen in 1 photo", "place", "update", false]]);
  });

  it("places an object by the nearest named place, with how sure it was", async () => {
    await corridorWithBins();
    // 0.35 m from Starbucks's unit and 2 m from Gong Cha's, so "by" has one answer.
    await call(client, "create", { type: "placement", data: {
      id: "L1-wastebin-1", levelId: "oth-L1", objectKindId: "bin", position: [8, 5.65, 0], sightingIds: ["sg_1", "sg_2"],
    } });
    expect(await listClaudeChanges(f.db, "oth-L1", EPOCH)).toMatchObject([{
      group: "objects", summary: "Placed wastebin by Starbucks, from 2 frames", confidence: "high",
      entityType: "placement", entityId: "L1-wastebin-1", action: "create",
    }]);
  });

  it("gives an object low confidence when its frame has fewer than two anchors", async () => {
    // No bound place on the whole floor, so no frame ever gets a second anchor.
    await createEntity(f.db, "room", { id: "L1-corridor", levelId: "oth-L1", kind: "area", footprint: sq(0, 0, 60, 6), heightM: 6, walkable: true }, amy.id);
    await f.db.insert(captures).values({ id: "cap_1", kind: "video", filename: "L1 walk.mp4", levelId: "oth-L1" });
    await f.db.insert(keyframes).values({
      id: "kf_0", captureId: "cap_1", timeMs: 0, imageId: "kf_0", storagePath: "assets/aa/x.jpg", checksum: "x", widthPx: 640, heightPx: 480, sizeBytes: 1,
    });
    await createEntity(f.db, "objectKind", { id: "bin", nameEn: "wastebin", size: { w: 0.5, d: 0.5, h: 1 } }, amy.id);
    await createEntity(f.db, "place", { id: "pl_bin", nameEn: "wastebin", category: "facility", objectKindId: "bin" }, amy.id);
    await createEntity(f.db, "sighting", { id: "sg_1", placeId: "pl_bin", keyframeId: "kf_0" }, amy.id);
    await call(client, "create", { type: "placement", data: {
      id: "L1-wastebin-1", levelId: "oth-L1", objectKindId: "bin", position: [5, 5.65, 0], sightingIds: ["sg_1"],
    } });
    expect(await listClaudeChanges(f.db, "oth-L1", EPOCH)).toMatchObject([{ group: "objects", confidence: "low" }]);
  });

  it("folds make_stop's second call — just finishing the room's opening — into stops", async () => {
    // A stop placed by hand already: outlined, but the space still has walls.
    await createEntity(f.db, "room", { id: "L1-esc", levelId: "oth-L1", kind: "service", footprint: sq(4, 2, 6, 12), heightM: 6, walkable: false, nameEn: "Escalator - 07" }, amy.id);
    await createEntity(f.db, "portal", { id: "portal-1", kind: "escalator" }, amy.id);
    await createEntity(f.db, "portalEndpoint", {
      id: "L1-portal-1", portalId: "portal-1", levelId: "oth-L1", roomId: "L1-esc", point: [5, 7], footprint: sq(4, 2, 6, 12),
    }, amy.id);
    await call(client, "make_stop", { floor: "L1", room: "L1-esc", expectedVersion: 0, kind: "escalator" });
    expect(brief(await listClaudeChanges(f.db, "oth-L1", EPOCH)))
      .toEqual([["stops", "Finished opening Escalator - 07 as a stop", "room", "update", false]]);
  });

  it("lists Claude's survey labels on the floor of their frame", async () => {
    await frameOnL1();
    await call(client, "tag_frame", { frameId: "kf_1", nameEn: "Gong Cha", category: "retail" });
    expect(brief(await listClaudeChanges(f.db, "oth-L1", EPOCH)))
      .toEqual([["labels", "Proposed Gong Cha, seen on frame kf_1", "sighting", "create", false]]);
    expect(await listClaudeChanges(f.db, "oth-L2", EPOCH)).toEqual([]);
  });

  it("leaves out a person's edits, other floors, and what came before since, and keeps to the limit", async () => {
    await claudeDecides();
    await createEntity(f.db, "room", { id: "L2-hall", levelId: "oth-L2", kind: "area", footprint: sq(0, 0, 9, 9), heightM: 4, nameEn: "Hall" }, amy.id);
    await call(client, "update", { type: "room", id: "L2-hall", expectedVersion: 0, data: { nameEn: "Town Hall" } });
    await updateEntity(f.db, "room", "L1-starbucks", 0, { heightM: 5 }, amy.id);
    expect(await listClaudeChanges(f.db, "oth-L1", new Date(Date.now() + 60_000))).toEqual([]);
    expect((await listClaudeChanges(f.db, "oth-L1", EPOCH)).map(c => c.group).sort()).toEqual(["drafts", "rooms"]);
    expect(await listClaudeChanges(f.db, "oth-L1", EPOCH, 1)).toHaveLength(1);
    expect((await listClaudeChanges(f.db, "oth-L2", EPOCH)).map(c => [c.group, c.summary])).toEqual([["names", "Renamed Hall to Town Hall"]]);
  });

  it("never lists a find-rooms marker row: a person's Find rooms, via null, is not Claude's", async () => {
    // Find rooms is a person's action (drafts/routes.ts), and writes a
    // level/find-rooms marker row even for an empty search — with no via, so
    // it must never surface as a change or count toward a group.
    await replaceDrafts(f.db, "oth-L1", SOURCE, [], amy.id);
    expect(await listClaudeChanges(f.db, "oth-L1", EPOCH)).toEqual([]);

    // And it must not leak into a real Claude change's grouping either.
    await claudeDecides();
    const changes = await listClaudeChanges(f.db, "oth-L1", EPOCH);
    expect(changes.some(c => c.entityType === "level")).toBe(false);
    expect(changes.map(c => c.group).sort()).toEqual(["drafts", "rooms"]);
  });
});
