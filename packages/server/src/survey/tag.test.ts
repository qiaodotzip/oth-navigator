import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Database } from "../db/client";
import { captures, keyframes, places, sightings } from "../db/schema";
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
    expect(tagged).toMatchObject({ newPlace: true, levelId: "oth-L1" });
    const [place] = await db.select().from(places).where(eq(places.id, tagged.placeId));
    expect(place).toMatchObject({ nameEn: "Gong Cha", levelId: "oth-L1", status: "proposed", proposedBy: "Claude Code (Wei)", updatedBy: "u_wei" });
    const [tag] = await db.select().from(sightings).where(eq(sightings.id, tagged.sightingId));
    expect(tag).toMatchObject({ placeId: tagged.placeId, keyframeId: "kf_1", status: "proposed", box: { x: 0.1, y: 0.2, w: 0.3, h: 0.1 } });
  });

  it("tags a place already surveyed, once", async () => {
    await createEntity(db, "place", { id: "pl_sb", nameEn: "Starbucks", category: "retail", levelId: "oth-L1" }, "u_sc");
    const tagged = await tagFrame(db, { frameId: "kf_1", placeId: "pl_sb" }, "u_wei", CLAIM);
    expect(tagged).toMatchObject({ placeId: "pl_sb", newPlace: false });
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
});
