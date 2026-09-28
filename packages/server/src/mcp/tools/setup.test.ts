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

  it("says the floor above has a space over the stop, without sending Claude there", async () => {
    await createEntity(f.db, "room", { ...ESC, id: "L2-esc", levelId: "oth-L2", heightM: 4 }, amy.id);
    const { text } = await call(client, "make_stop", { floor: "L1", room: "L1-esc", expectedVersion: 0, kind: "escalator" });
    expect(text).toMatch(/L2 has a space traced over this spot too\. Its stop is made when L2 is set up; stay on L1\.$/);
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
      drafts: { name: string; open: boolean; onMapAs: string | null; overlaps: { roomId: string; name: string; share: number }[]; likeAStop: boolean }[];
    };
    expect(listing.counts).toEqual({ waiting: 4, setAside: 0, accepted: 0, rejected: 0 });
    // share: how much of the draft lies over that room. The escalator's draft runs 38 m; the room it covers, 10 m of it.
    expect(listing.drafts.map(d => [d.name, d.open, d.onMapAs, d.overlaps, d.likeAStop])).toEqual([
      ["Hall", false, null, [], false],
      ["Kiosk", false, "L1-kiosk", [{ roomId: "L1-kiosk", name: "Kiosk", share: 1 }], false],
      ["Escalator - 07", false, null, [{ roomId: "L1-esc", name: "Escalator - 07", share: 0.26 }], true],
      ["Plaza", true, null, [], false],
    ]);
  });

  it("pages through them, and never counts a draft a new search retired as rejected", async () => {
    await replaceDrafts(f.db, "oth-L1", SOURCE, [drafted("Old", sq(0, 0, 5, 5), 25)], amy.id);
    await replaceDrafts(f.db, "oth-L1", SOURCE, [drafted("A", sq(0, 0, 5, 5), 25), drafted("B", sq(10, 0, 14, 4), 16)], amy.id);
    const listing = JSON.parse((await call(client, "list_drafts", { floor: "L1", limit: 1, offset: 1 })).text) as {
      counts: unknown; total: number; offset: number; drafts: { name: string }[];
    };
    expect(listing).toMatchObject({ counts: { waiting: 2, setAside: 0, accepted: 0, rejected: 0 }, total: 2, offset: 1 });
    expect(listing.drafts.map(d => d.name)).toEqual(["B"]);
  });

  it("leaves out the drafts set aside for a person, and counts them apart", async () => {
    const drafts = await replaceDrafts(f.db, "oth-L1", SOURCE, [drafted("Plaza", undefined, 0), drafted("Hall", sq(0, 50, 30, 80), 900)], amy.id);
    const plaza = String(drafts.find(d => d.nameEn === "Plaza")!.id);
    await call(client, "decide_drafts", { floor: "L1", items: [{ id: plaza, expectedVersion: 0, decision: "set_aside", reason: "Open on the drawing" }] });
    const listing = JSON.parse((await call(client, "list_drafts", { floor: "L1" })).text) as { counts: unknown; total: number; drafts: { name: string }[] };
    expect(listing).toMatchObject({ counts: { waiting: 1, setAside: 1, accepted: 0, rejected: 0 }, total: 1 });
    expect(listing.drafts.map(d => d.name)).toEqual(["Hall"]);
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
      { id: id("Plaza"), expectedVersion: 0, decision: "set_aside", reason: "Open on the drawing" },
      { id: id("Escalator - 08"), expectedVersion: 0, decision: "accept" },
    ] });
    expect(isError).toBe(false);
    expect(text).toBe(
      "Accepted 2 drafts as rooms: Starbucks (L1-starbucks), Escalator - 08 (L1-escalator-08). Rejected 1. " +
      "Set aside 1 for a person, who sees your reason in Build: Plaza.\n" +
      "Named like a lift, escalator or stairs, so make_stop may be next: Escalator - 08 (L1-escalator-08, version 0).\n" +
      "Each is on the setup's check step, with Undo.",
    );
    const trail = await f.db.select().from(auditLog).where(eq(auditLog.via, f.tokenId));
    expect(trail.some(r => r.entityType === "room" && r.action === "create" && r.entityId === "L1-starbucks")).toBe(true);
    // The reject and the set-aside are on the token's trail too.
    expect(trail.filter(r => r.entityType === "roomDraft" && r.action === "delete" && !(r.after as { acceptedRoomId?: string }).acceptedRoomId)
      .map(r => r.entityId)).toEqual([id("Sliver")]);
    expect(trail.filter(r => r.action === "set-aside").map(r => [r.entityId, (r.after as { reason: string }).reason]))
      .toEqual([[id("Plaza"), "Open on the drawing"]]);
  });

  it("skips an id no draft has, says which, and decides the rest", async () => {
    const id = await four();
    const { text, isError } = await call(client, "decide_drafts", { floor: "L1", items: [
      { id: id("Sliver"), expectedVersion: 0, decision: "reject" },
      { id: "rd_typo", expectedVersion: 0, decision: "reject" },
    ] });
    expect(isError).toBe(false);
    expect(text).toBe("Rejected 1.\nSkipped 1 id no draft has: rd_typo. Copy ids exactly as list_drafts gives them.\nEach is on the setup's check step, with Undo.");
    expect(await call(client, "decide_drafts", { floor: "L1", items: [{ id: "rd_typo", expectedVersion: 0, decision: "reject" }] }))
      .toMatchObject({ isError: true, text: "Decided nothing: no draft has the id rd_typo. list_drafts gives L1's." });
  });

  it("needs a reason to set a draft aside, and takes one with set_aside only", async () => {
    const id = await four();
    expect(await call(client, "decide_drafts", { floor: "L1", items: [{ id: id("Plaza"), expectedVersion: 0, decision: "set_aside" }] }))
      .toMatchObject({ isError: true, text: `Setting aside draft ${id("Plaza")} needs a reason: one line on why a person should decide it.` });
    expect(await call(client, "decide_drafts", { floor: "L1", items: [{ id: id("Sliver"), expectedVersion: 0, decision: "reject", reason: "Junk" }] }))
      .toMatchObject({ isError: true, text: `reason goes with set_aside only: draft ${id("Sliver")} is a reject.` });
    expect(await listDrafts(f.db, "oth-L1")).toHaveLength(4);
  });

  it("decides nothing when the drafts are on two floors", async () => {
    const id = await four();
    const [kiosk] = await replaceDrafts(f.db, "oth-L2", SOURCE, [drafted("Kiosk", sq(0, 0, 4, 4), 16)], amy.id);
    expect((await call(client, "decide_drafts", { floor: "L1", items: [
      { id: id("Sliver"), expectedVersion: 0, decision: "reject" },
      { id: String(kiosk!.id), expectedVersion: 0, decision: "reject" },
    ] })).isError).toBe(true);
    expect(await listDrafts(f.db, "oth-L1")).toHaveLength(4);
    expect(await listDrafts(f.db, "oth-L2")).toHaveLength(1);
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
    expect(status.counts).toMatchObject({ rooms: { waiting: 0, setAside: 0, accepted: 0, rejected: 0, stops: 0 } });
  });

  it("says what is still left, without refusing", async () => {
    await createEntity(f.db, "place", { id: "pl_cafe", nameEn: "Cafe", category: "retail", levelId: "oth-L1" }, amy.id);
    expect((await call(client, "finish_step", { floor: "L1", step: "things", note: "Stopped early" })).text)
      .toBe("Marked step 6, Places and objects, done on L1, with your note. Still left: 1 place not bound to a room.");
  });

  it("won't finish the rooms while drafts nobody has decided still wait, and says the set-asides are a person's", async () => {
    const drafts = await replaceDrafts(f.db, "oth-L1", SOURCE, [drafted("Kiosk", sq(0, 20, 4, 24), 16), drafted("Plaza", undefined, 0)], amy.id);
    const idOf = (name: string) => String(drafts.find(d => d.nameEn === name)!.id);
    expect(await call(client, "finish_step", { floor: "L1", step: "rooms", note: "Done" })).toMatchObject({
      isError: true,
      text: "Not marked: 2 drafts on L1 still wait for a decision. Decide them with decide_drafts, setting aside with a reason any a person should decide, then finish.",
    });
    await call(client, "decide_drafts", { floor: "L1", items: [
      { id: idOf("Kiosk"), expectedVersion: 0, decision: "accept" },
      { id: idOf("Plaza"), expectedVersion: 0, decision: "set_aside", reason: "Open on the drawing" },
    ] });
    expect((await call(client, "finish_step", { floor: "L1", step: "rooms", note: "Accepted 1, set aside 1" })).text)
      .toBe("Marked step 5, Rooms from the PDF, done on L1, with your note. 1 draft is set aside for a person.");
  });

  it("leaves a person's step to a person, and needs a floor that exists", async () => {
    for (const [step, words] of [
      ["floorplan", "Step 4, Floorplan"], ["review", "Step 3, Review Claude's labels"],
      ["check", "Step 8, Check Claude's work"], ["finish", "Step 9, Finish"],
    ] as const) {
      expect(await call(client, "finish_step", { floor: "L1", step, note: "Done" }), step).toMatchObject({
        isError: true, text: `${words}, is a person's: they mark it in the app.`,
      });
    }
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
