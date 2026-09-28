import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createUser, type User } from "../../auth/users";
import { auditLog, captures, floorSetup, keyframes, placements, portalEndpoints, portals, rooms } from "../../db/schema";
import { listDrafts, replaceDrafts } from "../../drafts/service";
import { createEntity, updateEntity } from "../../entities/repository";
import { acquireLock } from "../../locks/service";
import { call, mcpFixture, type McpFixture } from "../testing";

const sq = (x0: number, y0: number, x1: number, y1: number): [number, number][] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const ESC = { id: "L1-esc", levelId: "oth-L1", kind: "room", footprint: sq(4, 2, 6, 12), heightM: 6, nameEn: "Escalator - 07" };
let f: McpFixture;
let client: Client;
let amy: User;

beforeEach(async () => {
  f = await mcpFixture();
  amy = await createUser(f.db, { email: "amy@example.com", password: "unused", displayName: "Amy" });
  await createEntity(f.db, "room", ESC, amy.id);
  client = await f.connect();
});

describe("make_stop", () => {
  it("makes a traced space an escalator stop through the token, and says what comes next", async () => {
    const { text, isError } = await call(client, "make_stop", { floor: "L1", room: "L1-esc", expectedVersion: 0, kind: "escalator" });
    expect(isError).toBe(false);
    expect(text).toMatch(
      /^Made Escalator - 07 an escalator stop \(oth-L1-portal-\d+, on portal-\d+\), with the space's outline, and opened the space so routes reach it\. L2 has no space traced over this spot yet/,
    );
    const [portal] = await f.db.select().from(portals);
    expect(await f.db.select().from(portalEndpoints)).toMatchObject([{ portalId: portal!.id, roomId: "L1-esc", footprint: ESC.footprint }]);
    expect((await f.db.select().from(rooms).where(eq(rooms.id, "L1-esc")))[0]).toMatchObject({ kind: "area", walkable: true, updatedBy: f.wei.id });
    const trail = await f.db.select().from(auditLog).where(eq(auditLog.via, f.tokenId));
    expect(trail.map(r => `${r.entityType} ${r.action}`).sort()).toEqual(["portal create", "portalEndpoint create", "room update"]);
  });

  it("says whose change it met when the space changed since it was read, and writes nothing", async () => {
    await updateEntity(f.db, "room", "L1-esc", 0, { nameEn: "Escalator 7" }, amy.id);
    const { text, isError } = await call(client, "make_stop", { floor: "L1", room: "L1-esc", expectedVersion: 0, kind: "escalator" });
    expect(isError).toBe(true);
    expect(text).toMatch(/^Not saved: room L1-esc is at version 1 and you sent 0\. Amy changed it at /);
    expect(await f.db.select().from(portals)).toEqual([]);
  });

  it("touches only the floor it is given", async () => {
    expect(await call(client, "make_stop", { floor: "L2", room: "L1-esc", expectedVersion: 0, kind: "lift" })).toMatchObject({
      isError: true, text: "Room L1-esc is on another floor, so it is not made a stop from here.",
    });
  });

  it("leaves a space someone has open alone", async () => {
    await acquireLock(f.db, "room", "L1-esc", amy.id, 300);
    expect((await call(client, "make_stop", { floor: "L1", room: "L1-esc", expectedVersion: 0, kind: "lift" })).text)
      .toBe("Not saved: Amy is editing room L1-esc now. Leave it, and try again once they have moved on.");
  });
});

const SOURCE = { checksum: "a".repeat(64), page: 1 };
const drafted = (nameEn: string, footprint: [number, number][] | undefined, areaM2: number) =>
  ({ nameEn, kind: "room", ...(footprint ? { footprint } : {}), labelPoint: [1, 1], areaM2 });

describe("list_drafts", () => {
  it("gives the floor's drafts waiting, largest first, with the room each copies or lies over", async () => {
    await createEntity(f.db, "room", { id: "L1-kiosk", levelId: "oth-L1", kind: "room", footprint: sq(50, 50, 60, 60), heightM: 4, nameEn: "Kiosk" }, amy.id);
    await replaceDrafts(f.db, "oth-L1", SOURCE, [
      drafted("Escalator - 07", sq(4, 2, 6, 40), 76), drafted("Hall", sq(0, 50, 30, 80), 900),
      drafted("Kiosk", sq(50, 50, 60, 60), 100), drafted("Plaza", undefined, 0),
    ], amy.id);
    const { text, isError } = await call(client, "list_drafts", { floor: "L1" });
    expect(isError).toBe(false);
    const listing = JSON.parse(text) as {
      counts: unknown; total: number;
      drafts: { name: string; open: boolean; onMapAs: string | null; overlaps: boolean; likeAStop: boolean }[];
    };
    expect(listing.counts).toEqual({ waiting: 4, accepted: 0, rejectedOrSetAside: 0 });
    expect(listing.drafts.map(d => [d.name, d.open, d.onMapAs, d.overlaps, d.likeAStop])).toEqual([
      ["Hall", false, null, false, false],
      ["Kiosk", false, "L1-kiosk", true, false],
      ["Escalator - 07", false, null, true, true],
      ["Plaza", true, null, false, false],
    ]);
  });

  it("pages through them, and never counts a draft a new search retired as rejected", async () => {
    await replaceDrafts(f.db, "oth-L1", SOURCE, [drafted("Old", sq(0, 0, 5, 5), 25)], amy.id);
    await replaceDrafts(f.db, "oth-L1", SOURCE, [drafted("A", sq(0, 0, 5, 5), 25), drafted("B", sq(10, 0, 14, 4), 16)], amy.id);
    const listing = JSON.parse((await call(client, "list_drafts", { floor: "L1", limit: 1, offset: 1 })).text) as {
      counts: unknown; total: number; offset: number; drafts: { name: string }[];
    };
    expect(listing).toMatchObject({ counts: { waiting: 2, accepted: 0, rejectedOrSetAside: 0 }, total: 2, offset: 1 });
    expect(listing.drafts.map(d => d.name)).toEqual(["B"]);
  });
});

describe("decide_drafts", () => {
  const four = async () => {
    const drafts = await replaceDrafts(f.db, "oth-L1", SOURCE, [
      drafted("SHOP 12", sq(0, 20, 10, 30), 100), drafted("Sliver", sq(20, 20, 21, 30), 10),
      drafted("Plaza", undefined, 0), drafted("Escalator - 08", sq(40, 0, 42, 10), 20),
    ], amy.id);
    return (name: string) => String(drafts.find(d => d.nameEn === name)!.id);
  };

  it("accepts, rejects and sets aside through the token, and points to make_stop for a stop's space", async () => {
    const id = await four();
    const { text, isError } = await call(client, "decide_drafts", { floor: "L1", items: [
      { id: id("SHOP 12"), expectedVersion: 0, decision: "accept", nameEn: "Starbucks" },
      { id: id("Sliver"), expectedVersion: 0, decision: "reject" },
      { id: id("Plaza"), expectedVersion: 0, decision: "set_aside" },
      { id: id("Escalator - 08"), expectedVersion: 0, decision: "accept" },
    ] });
    expect(isError).toBe(false);
    expect(text).toBe(
      "Accepted 2 drafts as rooms: Starbucks (L1-starbucks), Escalator - 08 (L1-escalator-08). Rejected 1. " +
      "Set aside 1 for a person: Plaza.\n" +
      "Named like a lift, escalator or stairs, so make_stop may be next: Escalator - 08 (L1-escalator-08, version 0).\n" +
      "Each is on the setup's check step, with Undo.",
    );
    const trail = await f.db.select().from(auditLog).where(eq(auditLog.via, f.tokenId));
    expect(trail.some(r => r.entityType === "room" && r.action === "create" && r.entityId === "L1-starbucks")).toBe(true);
    expect(trail.filter(r => r.action === "set-aside").map(r => r.entityId)).toEqual([id("Plaza")]);
  });

  it("decides all or none, and names the draft that stopped it", async () => {
    const id = await four();
    const { text, isError } = await call(client, "decide_drafts", { floor: "L1", items: [
      { id: id("SHOP 12"), expectedVersion: 0, decision: "accept" },
      { id: id("Sliver"), expectedVersion: 4, decision: "reject" },
    ] });
    expect(isError).toBe(true);
    expect(text).toMatch(new RegExp(`^Not saved: roomDraft ${id("Sliver")} is at version 0 and you sent 4\\.`));
    // Only the fixture's own ESC room: nothing new from the refused accept.
    expect((await f.db.select().from(rooms)).map(r => r.id)).toEqual(["L1-esc"]);
    expect(await listDrafts(f.db, "oth-L1")).toHaveLength(4);
  });

  it("touches only the floor it is given", async () => {
    const [kiosk] = await replaceDrafts(f.db, "oth-L2", SOURCE, [drafted("Kiosk", sq(0, 0, 4, 4), 16)], amy.id);
    expect(await call(client, "decide_drafts", { floor: "L1", items: [{ id: String(kiosk!.id), expectedVersion: 0, decision: "accept" }] }))
      .toMatchObject({ isError: true, text: `Draft ${String(kiosk!.id)} is not on L1. decide_drafts decides one floor's drafts at a time.` });
    expect(await listDrafts(f.db, "oth-L2")).toHaveLength(1);
  });

  it("takes a name or a kind with an accept only", async () => {
    const id = await four();
    expect(await call(client, "decide_drafts", { floor: "L1", items: [{ id: id("Sliver"), expectedVersion: 0, decision: "reject", nameEn: "Gap" }] }))
      .toMatchObject({ isError: true, text: `nameEn and kind go with accept only: draft ${id("Sliver")} is a reject.` });
  });
});

describe("step_status and finish_step", () => {
  it("marks Claude's step done with its note, through the token, and step_status shows it", async () => {
    const { text, isError } = await call(client, "finish_step", { floor: "L1", step: "rooms", note: "Accepted 3, rejected 1" });
    expect({ text, isError }).toEqual({ text: "Marked step 5, Rooms from the PDF, done on L1, with your note.", isError: false });
    const [row] = await f.db.select().from(floorSetup);
    expect(row).toMatchObject({ levelId: "oth-L1", step: 5, status: "done", note: "Accepted 3, rejected 1", finishedBy: f.wei.id, finishedVia: f.tokenId });
    const [trail] = await f.db.select().from(auditLog).where(eq(auditLog.entityType, "floorSetup"));
    expect(trail).toMatchObject({ entityId: "oth-L1/rooms", via: f.tokenId });

    const status = JSON.parse((await call(client, "step_status", { floor: "L1" })).text) as {
      floor: string; steps: { n: number; step: string; status: string; by?: string }[]; counts: unknown;
    };
    expect(status.floor).toBe("L1");
    expect(status.steps[0]).toMatchObject({ n: 1, step: "footage", who: "you", status: "open" });
    expect(status.steps[4]).toMatchObject({ n: 5, step: "rooms", who: "claude", status: "done", note: "Accepted 3, rejected 1", by: "Wei via Claude Code" });
    expect(status.counts).toMatchObject({ rooms: { waiting: 0, accepted: 0, rejectedOrSetAside: 0, stops: 0 } });
  });

  it("says what is still left, without refusing", async () => {
    await replaceDrafts(f.db, "oth-L1", SOURCE, [drafted("Kiosk", sq(0, 20, 4, 24), 16)], amy.id);
    expect((await call(client, "finish_step", { floor: "L1", step: "rooms", note: "Stopped early" })).text)
      .toBe("Marked step 5, Rooms from the PDF, done on L1, with your note. Still left: 1 draft waiting.");
  });

  it("leaves a person's step to a person, and needs a floor that exists", async () => {
    expect(await call(client, "finish_step", { floor: "L1", step: "floorplan", note: "Done" })).toMatchObject({
      isError: true, text: "Step 4, Floorplan, is a person's: they mark it in the app.",
    });
    expect(await call(client, "finish_step", { floor: "L9", step: "rooms", note: "Done" })).toMatchObject({
      isError: true, text: "There is no floor L9. list_floors gives every floor.",
    });
    expect(await f.db.select().from(floorSetup)).toEqual([]);
  });
});

describe("suggest_object_spots", () => {
  it("gives each object with the placement to create, ready for create, and reads nothing it writes", async () => {
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
    await createEntity(f.db, "sighting", { id: "sg_a", placeId: "pl_a", keyframeId: "kf_0" }, amy.id);
    await createEntity(f.db, "sighting", { id: "sg_b", placeId: "pl_b", keyframeId: "kf_1" }, amy.id);
    await createEntity(f.db, "sighting", { id: "sg_bin", placeId: "pl_bin", keyframeId: "kf_0" }, amy.id);

    const { text, isError } = await call(client, "suggest_object_spots", { floor: "L1" });
    expect(isError).toBe(false);
    expect(JSON.parse(text)).toEqual({
      floor: "L1",
      spots: [{
        kind: "wastebin", confidence: "high",
        anchors: [{ id: "L1-a", name: "Starbucks" }, { id: "L1-b", name: "Gong Cha" }],
        frames: ["kf_0"],
        placement: {
          id: "L1-wastebin-1", levelId: "oth-L1", objectKindId: "bin", roomId: "L1-corridor",
          position: [10, 5.65, 0], rotationDeg: 0, sightingIds: ["sg_bin"],
        },
      }],
      unplaced: [],
      alreadyPlaced: 0,
    });
    expect(await f.db.select().from(placements)).toEqual([]);
  });
});
