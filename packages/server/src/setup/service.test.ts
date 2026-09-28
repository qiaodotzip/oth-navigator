import { parseModel } from "@oth/model";
import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createUser, type User } from "../auth/users";
import type { Database } from "../db/client";
import { auditLog, buildings, floorSetup, levels } from "../db/schema";
import type { DraftRow } from "../drafts/service";
import { createTestDb } from "../testing/harness";
import { SETUP_ENTITY, UnknownFloorError, getSetup, setStep, setupCounts } from "./service";

let db: Database;
let wei: User;

beforeEach(async () => {
  db = await createTestDb();
  wei = await createUser(db, { email: "wei@example.com", password: "unused", displayName: "Wei" });
  await db.insert(buildings).values({ id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94, rotationDeg: 0 });
  await db.insert(levels).values([
    { id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "Level 1", nameZh: "一楼", elevationM: 0, heightM: 6 },
    { id: "oth-L2", buildingId: "oth", code: "L2", ordinal: 2, nameEn: "Level 2", nameZh: "二楼", elevationM: 6, heightM: 4 },
  ]);
});

const OPEN = { status: "open", note: "", finishedBy: null, finishedVia: null, finishedAt: null };

describe("getSetup and setStep", () => {
  it("starts a floor with all nine steps open and empty, in order", async () => {
    const { steps } = await getSetup(db, "oth-L1");
    expect(steps.map(s => s.step)).toEqual(["footage", "label", "review", "floorplan", "rooms", "things", "paths", "check", "finish"]);
    expect(steps[0]).toEqual({ step: "footage", ...OPEN });
  });

  it("records a step marked done: its note on one line, who, through which token, and when", async () => {
    const step = await setStep(db, "oth-L1", "rooms", { status: "done", note: "Accepted 180,\n  rejected 20" }, wei.id, "tok_1");
    expect(step).toMatchObject({ step: "rooms", status: "done", note: "Accepted 180, rejected 20", finishedBy: wei.id, finishedVia: "tok_1" });
    expect(step.finishedAt).not.toBeNull();
    const [row] = await db.select().from(floorSetup).where(and(eq(floorSetup.levelId, "oth-L1"), eq(floorSetup.step, 5)));
    expect(row).toMatchObject({ status: "done", finishedVia: "tok_1" });
    const [trail] = await db.select().from(auditLog).where(eq(auditLog.entityType, SETUP_ENTITY));
    expect(trail).toMatchObject({ entityId: "oth-L1/rooms", action: "set", actorId: wei.id });
  });

  it("stamps a done step every time, a repeat included, and clears all three when it is opened again", async () => {
    const first = await setStep(db, "oth-L1", "footage", { status: "done" }, wei.id, null);
    await new Promise(resolve => setTimeout(resolve, 5));
    const again = await setStep(db, "oth-L1", "footage", { status: "done" }, wei.id, "tok_1");
    expect(Date.parse(again.finishedAt!)).toBeGreaterThan(Date.parse(first.finishedAt!));
    expect(again.finishedVia).toBe("tok_1");
    expect(await setStep(db, "oth-L1", "footage", { status: "open" }, wei.id, null)).toEqual({ step: "footage", ...OPEN });
  });

  it("refuses a floor that doesn't exist", async () => {
    await expect(setStep(db, "oth-L9", "label", { status: "done" }, wei.id, null)).rejects.toBeInstanceOf(UnknownFloorError);
    await expect(getSetup(db, "oth-L9")).rejects.toBeInstanceOf(UnknownFloorError);
  });
});

const sq = (x0: number, y0: number, x1: number, y1: number): [number, number][] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const frame = (id: string, captureId: string) => ({ id, captureId, timeMs: 0, imageId: id, widthPx: 640, heightPx: 480 });
const world = (extraRooms: unknown[] = []) => parseModel({
  building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
  levels: [
    { id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "Level 1", nameZh: "一楼", elevationM: 0, heightM: 6 },
    { id: "oth-L2", buildingId: "oth", code: "L2", ordinal: 2, nameEn: "Level 2", nameZh: "二楼", elevationM: 6, heightM: 4 },
  ],
  rooms: [
    { id: "L1-hall", levelId: "oth-L1", kind: "area", footprint: sq(0, 0, 40, 10), heightM: 6, walkable: true, nameEn: "Hall" },
    { id: "L1-shop", levelId: "oth-L1", kind: "room", footprint: sq(0, 10, 10, 20), heightM: 6, nameEn: "Shop" },
    { id: "L1-esc", levelId: "oth-L1", kind: "area", walkable: true, footprint: sq(20, 2, 22, 8), heightM: 6, nameEn: "Escalator - 07" },
    ...extraRooms,
  ],
  portals: [{ id: "esc-7", kind: "escalator" }],
  portalEndpoints: [{ id: "esc-7-1", portalId: "esc-7", levelId: "oth-L1", roomId: "L1-esc", point: [21, 5], footprint: sq(20, 2, 22, 8) }],
  captures: [
    { id: "cap_1", kind: "video", filename: "walk.mp4", levelId: "oth-L1" },
    { id: "cap_2", kind: "video", filename: "up.mp4", levelId: "oth-L2" },
  ],
  keyframes: [frame("kf_1", "cap_1"), frame("kf_2", "cap_1"), frame("kf_3", "cap_1"), frame("kf_9", "cap_2")],
  places: [
    { id: "pl_shop", nameEn: "Shop", category: "retail", levelId: "oth-L1", roomId: "L1-shop" },
    { id: "pl_cafe", nameEn: "Cafe", category: "retail", levelId: "oth-L1" },
    { id: "pl_new", nameEn: "New", category: "retail", status: "proposed" },
    { id: "pl_bin", nameEn: "wastebin", category: "facility", objectKindId: "bin" },
  ],
  sightings: [
    { id: "sg_1", placeId: "pl_shop", keyframeId: "kf_1" },
    { id: "sg_2", placeId: "pl_new", keyframeId: "kf_2", status: "proposed" },
    { id: "sg_3", placeId: "pl_bin", keyframeId: "kf_2" },
  ],
  objectKinds: [{ id: "bin", nameEn: "wastebin", size: { w: 0.5, d: 0.5, h: 1 } }],
  placements: [{ id: "L1-wastebin-1", levelId: "oth-L1", objectKindId: "bin", position: [5, 9, 0], sightingIds: ["sg_3"] }],
  pathways: [{ id: "L1-path", levelId: "oth-L1", polyline: [[0, 8], [40, 8]] }],
  entrances: [{ id: "L1-gate", levelId: "oth-L1", roomId: "L1-hall", point: [1, 5] }],
});
const drafts: DraftRow[] = [
  { id: "rd_1", nameEn: "Shop", acceptedRoomId: "L1-shop", deletedAt: "2026-09-28T06:00:00.000Z", retired: false },
  { id: "rd_2", nameEn: "Store", acceptedRoomId: null, deletedAt: null, retired: false },
  { id: "rd_3", nameEn: "Sliver", acceptedRoomId: null, deletedAt: "2026-09-28T06:00:00.000Z", retired: false },
  { id: "rd_4", nameEn: "Old", acceptedRoomId: null, deletedAt: "2026-09-28T05:00:00.000Z", retired: true },
];

describe("setupCounts", () => {
  it("counts each step's work on this floor alone, in 6E's fields", () => {
    expect(setupCounts(world(), "oth-L1", drafts, 4)).toEqual({
      label: { tagged: 2, binned: 4, left: 1 },
      review: { left: 1 },
      rooms: { waiting: 1, accepted: 1, rejectedOrSetAside: 1, stops: 1 },
      things: { bound: 1, unbound: 1, objects: [{ kindId: "bin", name: "wastebin", count: 1 }] },
      paths: { pathways: 1, entrances: 1, unreachable: 0 },
    });
  });

  it("counts a room nobody can reach", () => {
    const far = { id: "L1-far", levelId: "oth-L1", kind: "room", footprint: sq(60, 60, 70, 70), heightM: 6, nameEn: "Far" };
    expect(setupCounts(world([far]), "oth-L1", []).paths.unreachable).toBe(1);
  });
});
