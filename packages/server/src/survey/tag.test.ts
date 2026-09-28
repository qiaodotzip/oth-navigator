import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Database } from "../db/client";
import { captures, keyframes, objectKinds, places, sightings } from "../db/schema";
import { createEntity } from "../entities/repository";
import { createTestDb } from "../testing/harness";
import { TagRefusal, tagFrame } from "./tag";

const CLAIM = { status: "proposed" as const, proposedBy: "Claude Code (Wei)" };
let db: Database;

beforeEach(async () => {
  db = await createTestDb();
  await db.insert(captures).values({ id: "cap_1", kind: "video", filename: "L1 walk.mp4", levelId: "oth-L1" });
  await db.insert(keyframes).values({
    id: "kf_1", captureId: "cap_1", timeMs: 1000, imageId: "kf_1", storagePath: "assets/aa/x.jpg", checksum: "x",
    widthPx: 640, heightPx: 480, sizeBytes: 1,
  });
});

describe("tagFrame", () => {
  it("makes a new place on the frame's floor and the tag that ties it to the frame, both as the claim says", async () => {
    const tagged = await tagFrame(db, { frameId: "kf_1", nameEn: "Gong Cha", category: "retail", box: { x: 0.1, y: 0.2, w: 0.3, h: 0.1 } }, "u_wei", CLAIM);
    expect(tagged).toMatchObject({ newPlace: true, levelId: "oth-L1", placeStatus: "proposed" });
    const [place] = await db.select().from(places).where(eq(places.id, tagged.placeId));
    expect(place).toMatchObject({ nameEn: "Gong Cha", levelId: "oth-L1", status: "proposed", proposedBy: "Claude Code (Wei)", updatedBy: "u_wei" });
    const [tag] = await db.select().from(sightings).where(eq(sightings.id, tagged.sightingId));
    expect(tag).toMatchObject({ placeId: tagged.placeId, keyframeId: "kf_1", status: "proposed", box: { x: 0.1, y: 0.2, w: 0.3, h: 0.1 } });
  });

  it("tags a place already surveyed, once", async () => {
    await createEntity(db, "place", { id: "pl_sb", nameEn: "Starbucks", category: "retail", levelId: "oth-L1" }, "u_sc");
    const tagged = await tagFrame(db, { frameId: "kf_1", placeId: "pl_sb" }, "u_wei", CLAIM);
    expect(tagged).toMatchObject({ placeId: "pl_sb", newPlace: false, placeStatus: "confirmed" });
    await expect(tagFrame(db, { frameId: "kf_1", placeId: "pl_sb" }, "u_wei", CLAIM)).rejects.toThrow(
      `Frame kf_1 already has a tag for Starbucks (${tagged.sightingId}).`,
    );
  });

  it("refuses a frame or place that is not there, or a new place with no name or category, and writes nothing", async () => {
    await expect(tagFrame(db, { frameId: "kf_nope", nameEn: "A", category: "retail" }, "u_wei", CLAIM)).rejects.toBeInstanceOf(TagRefusal);
    await expect(tagFrame(db, { frameId: "kf_1", placeId: "pl_nope" }, "u_wei", CLAIM)).rejects.toThrow("There is no place pl_nope.");
    await expect(tagFrame(db, { frameId: "kf_1", nameEn: "A" }, "u_wei", CLAIM)).rejects.toThrow(
      "Give either placeId, for a place already surveyed, or nameEn and category for a new one.",
    );
    expect(await db.select().from(places)).toEqual([]);
    expect(await db.select().from(sightings)).toEqual([]);
  });

  it("refuses a frame whose footage was deleted, naming the footage, and writes nothing", async () => {
    await db.insert(captures).values({ id: "cap_2", kind: "video", filename: "L2 walk.mp4", levelId: "oth-L2", deletedAt: new Date() });
    await db.insert(keyframes).values({
      id: "kf_2", captureId: "cap_2", timeMs: 1000, imageId: "kf_2", storagePath: "assets/aa/y.jpg", checksum: "y",
      widthPx: 640, heightPx: 480, sizeBytes: 1,
    });
    const tagging = tagFrame(db, { frameId: "kf_2", nameEn: "Gong Cha", category: "retail" }, "u_wei", CLAIM);
    await expect(tagging).rejects.toBeInstanceOf(TagRefusal);
    await expect(tagging).rejects.toThrow(
      "Frame kf_2 is from the footage L2 walk.mp4, which was deleted. Tag a frame from footage still in Survey.",
    );
    expect(await db.select().from(places)).toEqual([]);
    expect(await db.select().from(sightings)).toEqual([]);
  });
});

describe("tagFrame and objects", () => {
  beforeEach(async () => {
    await createEntity(db, "objectKind", { id: "ok_bin", nameEn: "wastebin", size: { w: 0.5, d: 0.5, h: 1 } }, "u_sc");
    await createEntity(db, "place", { id: "pl_bin", nameEn: "wastebin", category: "facility", objectKindId: "ok_bin" }, "u_sc");
  });

  it("makes a new kind at the size given, and its place on no floor", async () => {
    const tagged = await tagFrame(db, {
      frameId: "kf_1", nameEn: "Vending machine", category: "facility", object: true, size: { w: 1, d: 0.8, h: 1.9 },
    }, "u_wei", CLAIM);
    expect(tagged).toMatchObject({ newPlace: true, newKind: true, madeObject: false });
    expect((await db.select().from(objectKinds).where(eq(objectKinds.id, tagged.objectKindId!)))[0])
      .toMatchObject({ nameEn: "Vending machine", size: { w: 1, d: 0.8, h: 1.9 } });
    expect((await db.select().from(places).where(eq(places.id, tagged.placeId)))[0])
      .toMatchObject({ objectKindId: tagged.objectKindId, levelId: null, status: "proposed" });
  });

  it("reuses a kind of the same name, and its place, whatever the spelling, at the kind's own size", async () => {
    const tagged = await tagFrame(db, {
      frameId: "kf_1", nameEn: " Wastebin ", category: "facility", object: true, size: { w: 2, d: 2, h: 2 },
    }, "u_wei", CLAIM);
    expect(tagged).toMatchObject({ placeId: "pl_bin", objectKindId: "ok_bin", newPlace: false, newKind: false });
    expect((await db.select().from(objectKinds)).map(k => k.size)).toEqual([{ w: 0.5, d: 0.5, h: 1 }]);
  });

  it("tags two of an object in one frame, each with its own box, and refuses a second with no box", async () => {
    const left = { x: 0.1, y: 0.4, w: 0.1, h: 0.2 };
    const right = { x: 0.7, y: 0.4, w: 0.1, h: 0.2 };
    await tagFrame(db, { frameId: "kf_1", placeId: "pl_bin", object: true, box: left }, "u_wei", CLAIM);
    await tagFrame(db, { frameId: "kf_1", placeId: "pl_bin", object: true, box: right }, "u_wei", CLAIM);
    expect(await db.select().from(sightings).where(eq(sightings.placeId, "pl_bin"))).toHaveLength(2);
    await expect(tagFrame(db, { frameId: "kf_1", placeId: "pl_bin", object: true }, "u_wei", CLAIM))
      .rejects.toThrow(/^Frame kf_1 already has a tag for wastebin \(sg_\w+\)\. Two of an object in one frame are two tags, each with its own box\.$/);
  });

  it("makes a proposal the kind's place, and leaves a confirmed place to a person", async () => {
    await createEntity(db, "place", { id: "pl_cooler", nameEn: "water cooler", category: "facility", status: "proposed" }, "u_sc");
    const tagged = await tagFrame(db, { frameId: "kf_1", placeId: "pl_cooler", object: true }, "u_wei", CLAIM);
    expect(tagged).toMatchObject({ placeId: "pl_cooler", newKind: true, madeObject: true });
    expect((await db.select().from(places).where(eq(places.id, "pl_cooler")))[0]?.objectKindId).toBe(tagged.objectKindId);
    expect((await db.select().from(objectKinds).where(eq(objectKinds.id, tagged.objectKindId!)))[0]?.size).toEqual({ w: 0.5, d: 0.5, h: 1 });

    await createEntity(db, "place", { id: "pl_rb", nameEn: "recycling bin", category: "facility", levelId: "oth-L1" }, "u_sc");
    await expect(tagFrame(db, { frameId: "kf_1", placeId: "pl_rb", object: true }, "u_wei", CLAIM)).rejects.toThrow(
      "recycling bin is a confirmed place, not an object yet. A person makes it one with This is an object in Places: " +
      "tag it with its placeId as a place, and name it in your report.",
    );
  });

  it("takes a size with an object only", async () => {
    await expect(tagFrame(db, { frameId: "kf_1", nameEn: "Kiosk", category: "retail", size: { w: 1, d: 1, h: 1 } }, "u_wei", CLAIM))
      .rejects.toThrow("size goes with object only: it is a new kind's size.");
  });
});
