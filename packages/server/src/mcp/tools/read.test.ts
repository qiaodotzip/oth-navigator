import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { beforeEach, describe, expect, it } from "vitest";
import { storeAsset } from "../../assets/storage";
import { keyframes, levelImages } from "../../db/schema";
import { createEntity, softDeleteEntity } from "../../entities/repository";
import { PresenceTracker } from "../../presence/service";
import { call, mcpFixture, type McpFixture } from "../testing";

let f: McpFixture;
let client: Client;
let presence: PresenceTracker;

type Image = { type: "image"; data: string; mimeType: string };
type Text = { type: "text"; text: string };

beforeEach(async () => {
  presence = new PresenceTracker();
  f = await mcpFixture({ deps: { presence } });
  const by = f.wei.id;
  await createEntity(f.db, "room", { id: "L1-shop-12", levelId: "oth-L1", kind: "room", footprint: [[10, 40], [20, 40], [20, 30], [10, 30]], heightM: 4, nameEn: "Shop 12" }, by);
  await createEntity(f.db, "room", { id: "L2-hall", levelId: "oth-L2", kind: "area", footprint: [[0, 0], [5, 0], [5, 5], [0, 5]], heightM: 4, walkable: true, nameEn: "Hall" }, by);
  await createEntity(f.db, "place", { id: "pl_sb", nameEn: "Starbucks", category: "retail", levelId: "oth-L1", roomId: "L1-shop-12" }, by);
  await createEntity(f.db, "place", { id: "pl_gc", nameEn: "Gong Cha", category: "retail", levelId: "oth-L1", status: "proposed", proposedBy: "claude-code" }, by);
  await createEntity(f.db, "capture", { id: "cap_1", kind: "video", filename: "L1 walk.mp4", levelId: "oth-L1" }, by);
  const frame = await sharp({ create: { width: 2000, height: 1000, channels: 3, background: "#888888" } }).jpeg().toBuffer();
  const stored = await storeAsset(f.dataDir, new Uint8Array(frame), "jpg");
  for (const [id, timeMs] of [["kf_1", 1000], ["kf_2", 2000], ["kf_3", 3000]] as const) {
    await f.db.insert(keyframes).values({
      id, captureId: "cap_1", timeMs, imageId: id, storagePath: stored.storagePath, checksum: stored.checksum,
      widthPx: 2000, heightPx: 1000, sizeBytes: frame.length,
    });
  }
  await createEntity(f.db, "sighting", { id: "sg_1", placeId: "pl_sb", keyframeId: "kf_1", box: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 } }, by);
  await createEntity(f.db, "sighting", { id: "sg_2", placeId: "pl_gc", keyframeId: "kf_2", status: "proposed" }, by);
  client = await f.connect();
});

describe("get_floor", () => {
  it("lists a floor's rooms with their places, and the places surveyed on it", async () => {
    const { text, isError } = await call(client, "get_floor", { floor: "L1" });
    expect(isError).toBe(false);
    const outline = JSON.parse(text);
    expect(outline.rooms).toEqual([{ id: "L1-shop-12", name: "Shop 12", kind: "room", version: 0, walkable: false, verification: "unverified", place: { id: "pl_sb", name: "Starbucks" } }]);
    expect(outline.places.map((p: { id: string }) => p.id)).toEqual(["pl_sb", "pl_gc"]);
    expect(presence.list()).toContainEqual(expect.objectContaining({ displayName: "Wei (Claude)", levelId: "oth-L1" }));
  });

  it("says which floors exist when asked for one that does not", async () => {
    expect(await call(client, "get_floor", { floor: "L9" })).toMatchObject({
      isError: true, text: "There is no floor L9. list_floors gives every floor.",
    });
  });
});

describe("get", () => {
  it("gives one thing in full, deleted or not", async () => {
    const room = JSON.parse((await call(client, "get", { type: "room", id: "L1-shop-12" })).text);
    expect(room).toMatchObject({ id: "L1-shop-12", footprint: [[10, 40], [20, 40], [20, 30], [10, 30]], version: 0 });
    await softDeleteEntity(f.db, "room", "L2-hall", 0, f.wei.id);
    const gone = JSON.parse((await call(client, "get", { type: "room", id: "L2-hall" })).text);
    expect(gone.deletedAt).toEqual(expect.any(String));
  });

  it("gives a frame without where its file is kept", async () => {
    const frame = JSON.parse((await call(client, "get", { type: "keyframe", id: "kf_1" })).text);
    expect(frame).toMatchObject({ id: "kf_1", captureId: "cap_1" });
    expect(frame.storagePath).toBeUndefined();
    expect(frame.checksum).toBeUndefined();
  });

  it("refuses something that does not exist", async () => {
    expect(await call(client, "get", { type: "room", id: "nope" })).toMatchObject({ isError: true, text: "There is no room nope." });
  });
});

describe("check_floor", () => {
  it("gives one floor's issues and none of another's", async () => {
    await createEntity(f.db, "doorway", { id: "d1", levelId: "oth-L1", roomA: "L1-shop-12", roomB: "L1-shop-12", segment: [[10, 35], [10, 36]], widthM: 1 }, f.wei.id);
    await createEntity(f.db, "doorway", { id: "d2", levelId: "oth-L2", roomA: "L2-hall", roomB: "L2-hall", segment: [[0, 1], [0, 2]], widthM: 1 }, f.wei.id);
    const report = JSON.parse((await call(client, "check_floor", { floor: "L1" })).text);
    expect(report.errors).toBeGreaterThan(0);
    expect(report.issues).toContainEqual(expect.objectContaining({ code: "doorway.room.selfJoin", entityId: "d1" }));
    expect(report.issues.some((i: { entityId: string }) => i.entityId === "d2")).toBe(false);
  });
});

describe("list_frames", () => {
  it("lists a floor's untagged frames by default, and the others when asked", async () => {
    const ids = async (args: Record<string, unknown>) =>
      JSON.parse((await call(client, "list_frames", { floor: "L1", ...args })).text).frames.map((fr: { id: string }) => fr.id);
    expect(await ids({})).toEqual(["kf_3"]);
    expect(await ids({ show: "proposed" })).toEqual(["kf_2"]);
    expect(await ids({ show: "tagged" })).toEqual(["kf_1"]);
    expect(await ids({ show: "all", limit: 2 })).toEqual(["kf_1", "kf_2"]);
  });
});

describe("view_frame", () => {
  it("shows a frame at 1600 px, with what is tagged on it", async () => {
    const { result, isError } = await call(client, "view_frame", { frameId: "kf_1" });
    expect(isError).toBe(false);
    const [image, text] = result.content as [Image, Text];
    expect(image.mimeType).toBe("image/jpeg");
    expect((await sharp(Buffer.from(image.data, "base64")).metadata()).width).toBe(1600);
    expect(JSON.parse(text.text).tags).toEqual([
      { sightingId: "sg_1", placeId: "pl_sb", name: "Starbucks", category: "retail", status: "confirmed", box: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 } },
    ]);
  });

  it("refuses a frame that is not there", async () => {
    expect(await call(client, "view_frame", { frameId: "kf_nope" })).toMatchObject({
      isError: true, text: "There is no frame kf_nope. list_frames gives a floor's frames.",
    });
  });
});

describe("view_plan", () => {
  beforeEach(async () => {
    const plan = await sharp({ create: { width: 1000, height: 500, channels: 3, background: "#ffffff" } }).png().toBuffer();
    const stored = await storeAsset(f.dataDir, new Uint8Array(plan), "png");
    await f.db.insert(levelImages).values({
      id: "li_1", levelId: "oth-L1", filename: "L1.png", storagePath: stored.storagePath, checksum: stored.checksum,
      widthPx: 1000, heightPx: 500, sizeBytes: plan.length, metresPerPixel: 0.1, offsetX: 0, offsetY: 50,
    });
  });

  it("shows the plan round a room, with the rooms in view and their boxes", async () => {
    const { result, isError } = await call(client, "view_plan", { floor: "L1", around: "L1-shop-12" });
    expect(isError).toBe(false);
    const [image, legend] = result.content as [Image, Text];
    const meta = await sharp(Buffer.from(image.data, "base64")).metadata();
    expect([image.mimeType, meta.width, meta.height]).toEqual(["image/jpeg", 300, 300]);
    expect(JSON.parse(legend.text).rooms).toEqual([{ id: "L1-shop-12", name: "Shop 12", kind: "room", box: [100, 100, 100, 100] }]);
  });

  it("shows the plan the editor shows when a floor has two: the last saved", async () => {
    const plan = await sharp({ create: { width: 500, height: 250, channels: 3, background: "#ffffff" } }).png().toBuffer();
    const stored = await storeAsset(f.dataDir, new Uint8Array(plan), "png");
    await f.db.insert(levelImages).values({
      id: "li_0", levelId: "oth-L1", filename: "L1 old.png", storagePath: stored.storagePath, checksum: stored.checksum,
      widthPx: 500, heightPx: 250, sizeBytes: plan.length, metresPerPixel: 0.2, offsetX: 0, offsetY: 50,
      updatedAt: new Date("2026-01-01T00:00:00Z"),
    });
    const scale = async () => JSON.parse((await call(client, "view_plan", { floor: "L1" })).text).metresPerPixel;
    expect(await scale()).toBe(0.1);
    await f.db.update(levelImages).set({ updatedAt: new Date(Date.now() + 60_000) }).where(eq(levelImages.id, "li_0"));
    expect(await scale()).toBe(0.2);
  });

  it("says so when a floor has no plan, or its plan has no scale", async () => {
    expect(await call(client, "view_plan", { floor: "L2" })).toMatchObject({ isError: true, text: "L2 has no floorplan yet." });
    await f.db.update(levelImages).set({ metresPerPixel: null }).where(eq(levelImages.id, "li_1"));
    expect((await call(client, "view_plan", { floor: "L1" })).text).toMatch(/^L1's floorplan has no scale yet/);
  });
});
