import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createUser, type User } from "../auth/users";
import { auditLog, captures, keyframes, objectKinds, placements, places, portalEndpoints, portals, rooms, sightings } from "../db/schema";
import { listDrafts, replaceDrafts } from "../drafts/service";
import { createEntity, softDeleteEntity, updateEntity } from "../entities/repository";
import { call, mcpFixture, type McpFixture } from "../mcp/testing";
import { ChangeNotFoundError, UndoRefusedError, listClaudeChanges, undoChange } from "./changes";

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
    { id: id("Plaza"), expectedVersion: 0, decision: "set_aside", reason: "Open on the drawing" },
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
  it("lists each accepted draft once, as the room's create, and a set-aside apart, in plain words (contract v3, amended)", async () => {
    const { plaza } = await claudeDecides();
    const changes = await listClaudeChanges(f.db, "oth-L1", EPOCH);
    expect(brief(changes)).toEqual(expect.arrayContaining([
      ["rooms", "Made Starbucks from a draft (the drawing said SHOP 12), 100 m²", "room", "create", false],
      ["drafts", "Set aside Plaza for you: Open on the drawing", "roomDraft", "set-aside", false],
    ]));
    expect(changes).toHaveLength(2);
    const rooms = changes.find(c => c.group === "rooms")!;
    expect(Object.keys(rooms).sort()).toEqual(["action", "at", "auditId", "entityId", "entityType", "group", "summary", "undone"]);
    // A draft made a room is Shown as the room on the map; a draft still waiting is Shown by its own outline.
    expect(rooms.entityId).toBe("L1-starbucks");
    expect(changes.find(c => c.group === "drafts")!.entityId).toBe(plaza);
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
      .toEqual([["labels", "Proposed Gong Cha, seen on frame 1 of L1 walk.mp4", "sighting", "create", false]]);
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

const one = async (group: string, levelId = "oth-L1") => (await listClaudeChanges(f.db, levelId, EPOCH)).find(c => c.group === group)!;

describe("undoChange", () => {
  it("takes back an accepted draft: the room goes, the draft waits again, and the change says undone", async () => {
    const { shop, plaza } = await claudeDecides();
    const change = await one("rooms");
    expect(await undoChange(f.db, change.auditId, amy.id)).toEqual({ summary: "Made Starbucks from a draft (the drawing said SHOP 12), 100 m²" });
    expect((await f.db.select().from(rooms).where(eq(rooms.id, "L1-starbucks")))[0]?.deletedAt).toBeInstanceOf(Date);
    // Plaza was set aside, so it never stopped waiting.
    expect((await listDrafts(f.db, "oth-L1")).map(d => d.id)).toEqual([shop, plaza]);
    expect(await one("rooms")).toMatchObject({ undone: true });
    await expect(undoChange(f.db, change.auditId, amy.id)).rejects.toThrow(/^Already undone by Amy at /);
  });

  it("refuses, with who changed it, when the room changed since, and names the room as it is now", async () => {
    await claudeDecides();
    await updateEntity(f.db, "room", "L1-starbucks", 0, { nameEn: "Starbucks Coffee" }, amy.id);
    expect((await one("rooms")).summary).toBe("Made Starbucks Coffee from a draft (the drawing said SHOP 12), 100 m²");
    await expect(undoChange(f.db, (await one("rooms")).auditId, amy.id))
      .rejects.toThrow(/^Starbucks Coffee has changed since: Amy changed it at \d\d:\d\d on \d+ \w+\. Change it by hand instead\.$/);
    expect((await f.db.select().from(rooms).where(eq(rooms.id, "L1-starbucks")))[0]?.deletedAt).toBeNull();
  });

  it("leaves Claude's labels to Review", async () => {
    await frameOnL1();
    await call(client, "tag_frame", { frameId: "kf_1", nameEn: "Gong Cha", category: "retail" });
    await expect(undoChange(f.db, (await one("labels")).auditId, amy.id))
      .rejects.toThrow("Claude's labels are proposals: accept or reject them in Review.");
  });

  it("refuses while a later change depends on the room: a place bound to it", async () => {
    await claudeDecides();
    await createEntity(f.db, "place", { id: "pl_sb", nameEn: "Starbucks Coffee", category: "retail", levelId: "oth-L1", roomId: "L1-starbucks" }, amy.id);
    const refused = undoChange(f.db, (await one("rooms")).auditId, amy.id);
    await expect(refused).rejects.toBeInstanceOf(UndoRefusedError);
    await expect(refused).rejects.toThrow("Starbucks has the place Starbucks Coffee bound to it now. Unbind Starbucks Coffee first.");
    expect((await f.db.select().from(rooms).where(eq(rooms.id, "L1-starbucks")))[0]?.deletedAt).toBeNull();
  });

  it("takes back a stop in one go, and refuses once its escalator stops on another floor too", async () => {
    await createEntity(f.db, "room", { id: "L1-esc", levelId: "oth-L1", kind: "room", footprint: sq(4, 2, 6, 12), heightM: 6, nameEn: "Escalator - 07" }, amy.id);
    await call(client, "make_stop", { floor: "L1", room: "L1-esc", expectedVersion: 0, kind: "escalator" });
    await createEntity(f.db, "room", { id: "L2-esc", levelId: "oth-L2", kind: "room", footprint: sq(4, 2, 6, 12), heightM: 4, nameEn: "Escalator - 07" }, amy.id);
    await call(client, "make_stop", { floor: "L2", room: "L2-esc", expectedVersion: 0, kind: "escalator" });
    await expect(undoChange(f.db, (await one("stops")).auditId, amy.id)).rejects.toThrow("It now also stops on L2. Undo that stop first.");

    await undoChange(f.db, (await one("stops", "oth-L2")).auditId, amy.id);
    await undoChange(f.db, (await one("stops")).auditId, amy.id);
    expect((await f.db.select().from(portalEndpoints)).every(e => e.deletedAt !== null)).toBe(true);
    expect((await f.db.select().from(portals)).every(p => p.deletedAt !== null)).toBe(true);
    expect((await f.db.select().from(rooms).where(eq(rooms.id, "L1-esc")))[0]).toMatchObject({ kind: "room", walkable: false });
  });

  it("takes a set-aside back: the draft, still waiting, is no longer set aside, and the change says undone", async () => {
    const { plaza } = await claudeDecides();
    expect((await listDrafts(f.db, "oth-L1")).find(d => d.id === plaza)?.setAside).toBeDefined();
    await undoChange(f.db, (await one("drafts")).auditId, amy.id);
    const back = (await listDrafts(f.db, "oth-L1")).find(d => d.id === plaza);
    expect(back).toMatchObject({ id: plaza, version: 0 });
    expect(back?.setAside).toBeUndefined();
    expect(await f.db.select().from(auditLog).where(eq(auditLog.action, "unset-aside"))).toHaveLength(1);
    expect(await one("drafts")).toMatchObject({ undone: true });
  });

  it("leaves a set-aside a person has since decided in Build: the draft changed", async () => {
    const { plaza } = await claudeDecides();
    await softDeleteEntity(f.db, "roomDraft", plaza, 0, amy.id);
    await expect(undoChange(f.db, (await one("drafts")).auditId, amy.id))
      .rejects.toThrow(/^The draft Plaza has changed since: Amy changed it at /);
  });

  it("brings a rejected draft back, unless Find rooms has run again since", async () => {
    const [kiosk] = await replaceDrafts(f.db, "oth-L1", SOURCE, [{ nameEn: "Kiosk", kind: "room", footprint: sq(0, 0, 4, 4), labelPoint: [2, 2], areaM2: 16 }], amy.id);
    await call(client, "decide_drafts", { floor: "L1", items: [{ id: String(kiosk!.id), expectedVersion: 0, decision: "reject" }] });
    const rejected = (await listClaudeChanges(f.db, "oth-L1", EPOCH)).find(c => c.summary === "Rejected the draft Kiosk")!;
    expect([rejected.entityType, rejected.entityId]).toEqual(["roomDraft", String(kiosk!.id)]);
    await replaceDrafts(f.db, "oth-L1", SOURCE, [{ nameEn: "Cafe", kind: "room", footprint: sq(0, 0, 4, 4), labelPoint: [2, 2], areaM2: 16 }], amy.id);
    await expect(undoChange(f.db, rejected.auditId, amy.id)).rejects.toThrow(
      "Find rooms has run again since, so this draft is from an older search. Change the map by hand instead.",
    );
  });

  it("unbinds a place and puts the room's photo check back", async () => {
    await createEntity(f.db, "room", { id: "L1-shop", levelId: "oth-L1", kind: "room", footprint: sq(0, 20, 10, 30), heightM: 4, nameEn: "Shop 12" }, amy.id);
    await frameOnL1();
    await createEntity(f.db, "place", { id: "pl_sb", nameEn: "Starbucks", category: "retail" }, amy.id);
    await createEntity(f.db, "sighting", { id: "sg_1", placeId: "pl_sb", keyframeId: "kf_1" }, amy.id);
    await call(client, "bind_place", { placeId: "pl_sb", placeVersion: 0, roomId: "L1-shop", roomVersion: 0 });
    await undoChange(f.db, (await one("places")).auditId, amy.id);
    expect((await f.db.select().from(places).where(eq(places.id, "pl_sb")))[0]).toMatchObject({ roomId: null, levelId: null });
    expect((await f.db.select().from(rooms).where(eq(rooms.id, "L1-shop")))[0]?.verification).toMatchObject({ status: "unverified" });
  });

  it("takes back a placed object", async () => {
    await corridorWithBins();
    await call(client, "create", { type: "placement", data: {
      id: "L1-wastebin-1", levelId: "oth-L1", objectKindId: "bin", position: [10, 5.65, 0], sightingIds: ["sg_1"],
    } });
    await undoChange(f.db, (await one("objects")).auditId, amy.id);
    expect((await f.db.select().from(placements))[0]?.deletedAt).toBeInstanceOf(Date);
  });

  it("lists a frame Claude binned by its footage, and Undo unbins it with its tags", async () => {
    await frameOnL1();
    await createEntity(f.db, "place", { id: "pl_sb", nameEn: "Starbucks", category: "retail", levelId: "oth-L1" }, amy.id);
    await createEntity(f.db, "sighting", { id: "sg_1", placeId: "pl_sb", keyframeId: "kf_1" }, amy.id);
    await call(client, "delete", { type: "keyframe", id: "kf_1", expectedVersion: 0 });
    const binned = await one("frames");
    expect([binned.summary, binned.entityType, binned.action]).toEqual(["Binned frame 1 of L1 walk.mp4", "keyframe", "delete"]);
    expect(await listClaudeChanges(f.db, "oth-L2", EPOCH)).toEqual([]);
    await undoChange(f.db, binned.auditId, amy.id);
    expect((await f.db.select().from(keyframes).where(eq(keyframes.id, "kf_1")))[0]?.deletedAt).toBeNull();
    expect((await f.db.select().from(sightings).where(eq(sightings.id, "sg_1")))[0]?.deletedAt).toBeNull();
    expect(await one("frames")).toMatchObject({ undone: true });
  });

  it("lists a kind Claude made under objects, and deletes it on Undo only once nothing uses it", async () => {
    await frameOnL1();
    await call(client, "tag_frame", {
      frameId: "kf_1", nameEn: "wastebin", category: "facility", object: true, box: { x: 0.1, y: 0.1, w: 0.1, h: 0.2 }, size: { w: 0.4, d: 0.4, h: 0.9 },
    });
    const kind = await one("objects");
    expect([kind.summary, kind.entityType, kind.action]).toEqual(["Made the kind wastebin, 0.4 × 0.4 × 0.9 m", "objectKind", "create"]);
    await expect(undoChange(f.db, kind.auditId, amy.id)).rejects.toThrow("The kind wastebin is still used by the place wastebin. Remove that first.");

    // Made with no frame, a kind belongs to no floor more than another: every floor's list shows it.
    await call(client, "create", { type: "objectKind", data: { id: "ok_planter", nameEn: "planter", size: { w: 1, d: 1, h: 1 } } });
    const planter = (await listClaudeChanges(f.db, "oth-L2", EPOCH)).find(c => c.entityId === "ok_planter")!;
    expect(planter).toMatchObject({ group: "objects", summary: "Made the kind planter, 1 × 1 × 1 m" });
    await undoChange(f.db, planter.auditId, amy.id);
    expect((await f.db.select().from(objectKinds).where(eq(objectKinds.id, "ok_planter")))[0]?.deletedAt).toBeInstanceOf(Date);
  });

  it("tells two rooms from drafts with one name apart by where they are", async () => {
    await createEntity(f.db, "room", { id: "L1-a", levelId: "oth-L1", kind: "room", footprint: sq(0, 6, 10, 14), heightM: 6, nameEn: "Unit 1" }, amy.id);
    await createEntity(f.db, "room", { id: "L1-b", levelId: "oth-L1", kind: "room", footprint: sq(40, 6, 50, 14), heightM: 6, nameEn: "Unit 2" }, amy.id);
    await createEntity(f.db, "place", { id: "pl_a", nameEn: "Starbucks", category: "retail", levelId: "oth-L1", roomId: "L1-a" }, amy.id);
    await createEntity(f.db, "place", { id: "pl_b", nameEn: "Gong Cha", category: "retail", levelId: "oth-L1", roomId: "L1-b" }, amy.id);
    const drafts = await replaceDrafts(f.db, "oth-L1", SOURCE, [
      { nameEn: "Corridor", kind: "room", footprint: sq(0, 0, 10, 6), labelPoint: [5, 3], areaM2: 60 },
      { nameEn: "Corridor", kind: "room", footprint: sq(40, 0, 50, 6), labelPoint: [45, 3], areaM2: 60 },
    ], amy.id);
    await call(client, "decide_drafts", { floor: "L1", items: drafts.map(d => ({ id: String(d.id), expectedVersion: 0, decision: "accept" })) });
    expect((await listClaudeChanges(f.db, "oth-L1", EPOCH)).map(c => c.summary).sort()).toEqual([
      "Made Corridor from a draft, 60 m² near Gong Cha",
      "Made Corridor from a draft, 60 m² near Starbucks",
    ]);
  });

  it("names a pathway by its name now, or by its length and where, never by its id", async () => {
    await createEntity(f.db, "room", { id: "L1-a", levelId: "oth-L1", kind: "room", footprint: sq(0, 6, 10, 14), heightM: 6, nameEn: "Unit 1" }, amy.id);
    await createEntity(f.db, "place", { id: "pl_a", nameEn: "Starbucks", category: "retail", levelId: "oth-L1", roomId: "L1-a" }, amy.id);
    for (const id of ["L1-p1", "L1-p2"]) {
      await call(client, "create", { type: "pathway", data: { id, levelId: "oth-L1", polyline: [[0, 4], [20, 4]], widthM: 2 } });
    }
    const drawn = async (id: string) => (await listClaudeChanges(f.db, "oth-L1", EPOCH)).find(c => c.entityId === id)!;
    expect((await drawn("L1-p1")).summary).toBe("Drew a pathway, 20 m, near Starbucks");
    await updateEntity(f.db, "pathway", "L1-p1", 0, { nameEn: "Food Street" }, amy.id);
    await updateEntity(f.db, "pathway", "L1-p2", 0, { widthM: 3 }, amy.id);
    expect((await drawn("L1-p1")).summary).toBe("Drew Food Street, 20 m, near Starbucks");
    await expect(undoChange(f.db, (await drawn("L1-p1")).auditId, amy.id)).rejects.toThrow(/^The pathway Food Street has changed since: Amy changed it at /);
    await expect(undoChange(f.db, (await drawn("L1-p2")).auditId, amy.id)).rejects.toThrow(/^The 20 m pathway near Starbucks has changed since: Amy changed it at /);
  });

  it("knows no change by an id that isn't one of Claude's", async () => {
    await createEntity(f.db, "room", { id: "L1-x", levelId: "oth-L1", kind: "room", footprint: sq(0, 0, 4, 4), heightM: 4 }, amy.id);
    await expect(undoChange(f.db, "audit_missing", amy.id)).rejects.toBeInstanceOf(ChangeNotFoundError);
    const [mine] = await f.db.select().from(auditLog).where(eq(auditLog.entityId, "L1-x"));
    await expect(undoChange(f.db, mine!.id, amy.id)).rejects.toBeInstanceOf(ChangeNotFoundError);
  });
});
