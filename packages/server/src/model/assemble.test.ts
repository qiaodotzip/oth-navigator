import { validateModel } from "@oth/model";
import { beforeEach, describe, expect, it } from "vitest";
import type { Database } from "../db/client";
import { buildings, levels } from "../db/schema";
import { createEntity, softDeleteEntity } from "../entities/repository";
import { createTestDb } from "../testing/harness";
import { assembleModel } from "./assemble";

let db: Database;

const lobby = {
  id: "L1-lobby", levelId: "oth-L1", kind: "area",
  footprint: [[0, 0], [10, 0], [10, 10], [0, 10]],
  heightM: 6, walkable: true, nameEn: "Lobby", nameZh: "大堂",
};

beforeEach(async () => {
  db = await createTestDb();
  await db.insert(buildings).values({ id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94, rotationDeg: 0 });
  await db.insert(levels).values({
    id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1,
    nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6,
  });
});

describe("assembleModel", () => {
  it("produces a model that parses against the model schema", async () => {
    await createEntity(db, "room", lobby, "user_1");
    const model = await assembleModel(db);
    expect(model.building.id).toBe("oth");
    expect(model.rooms).toHaveLength(1);
    expect(model.rooms[0]?.footprint).toEqual([[0, 0], [10, 0], [10, 10], [0, 10]]);
  });

  it("omits soft-deleted entities", async () => {
    await createEntity(db, "room", lobby, "user_1");
    await softDeleteEntity(db, "room", "L1-lobby", 0, "user_1");
    expect((await assembleModel(db)).rooms).toHaveLength(0);
  });

  it("throws a clear error when no building row exists yet", async () => {
    const empty = await createTestDb();
    await expect(assembleModel(empty)).rejects.toThrow(/building/i);
  });

  it("feeds the model package's validator", async () => {
    await createEntity(db, "room", lobby, "user_1");
    // Walkable room, no entrance → the reachability rule must fire.
    const report = validateModel(await assembleModel(db));
    expect(report.issues.map(i => i.code)).toContain("building.entrances.none");
  });

  it("passes validation once an entrance exists", async () => {
    await createEntity(db, "room", lobby, "user_1");
    await createEntity(db, "entrance", { id: "e-main", levelId: "oth-L1", roomId: "L1-lobby", point: [5, 5] }, "user_1");
    expect(validateModel(await assembleModel(db)).ok).toBe(true);
  });
});

describe("pathways", () => {
  const path = { id: "L1-path", levelId: "oth-L1", polyline: [[0, 0], [10, 0]] };

  it("assembles pathways for the model", async () => {
    await createEntity(db, "room", lobby, "user_1");
    await createEntity(db, "pathway", path, "user_1");
    const model = await assembleModel(db);
    expect(model.pathways).toHaveLength(1);
    expect(model.pathways[0]?.widthM).toBe(2.4);
  });

  it("omits a soft-deleted pathway", async () => {
    await createEntity(db, "pathway", path, "user_1");
    await softDeleteEntity(db, "pathway", "L1-path", 0, "user_1");
    expect((await assembleModel(db)).pathways).toHaveLength(0);
  });
});

describe("the survey layer", () => {
  it("assembles places and sightings for validation", async () => {
    await createEntity(db, "place", { id: "pl_1", nameEn: "NTUC", category: "retail" }, "user_1");
    const model = await assembleModel(db);
    expect(model.places).toHaveLength(1);
    expect(model.places[0]?.nameEn).toBe("NTUC");
  });

  it("omits a soft-deleted place", async () => {
    await createEntity(db, "place", { id: "pl_1", nameEn: "NTUC", category: "retail" }, "user_1");
    await softDeleteEntity(db, "place", "pl_1", 0, "user_1");
    expect((await assembleModel(db)).places).toHaveLength(0);
  });

  it("drops the storage bookkeeping a keyframe row carries", async () => {
    // storagePath and checksum are the server's business, not the model's.
    const model = await assembleModel(db);
    expect(model.keyframes).toEqual([]);
  });
});

describe("objects", () => {
  const bin = { id: "ok_bin", nameEn: "wastebin", size: { w: 0.5, d: 0.5, h: 1 } };

  it("assembles kinds of object, and an object with no model of its own", async () => {
    await createEntity(db, "objectKind", bin, "user_1");
    await createEntity(db, "placement", {
      id: "L1-bin-1", levelId: "oth-L1", objectKindId: "ok_bin", position: [2, 3, 0], sightingIds: ["sg_1", "sg_2"],
    }, "user_1");
    const model = await assembleModel(db);
    expect(model.objectKinds).toEqual([expect.objectContaining({ id: "ok_bin", size: { w: 0.5, d: 0.5, h: 1 } })]);
    expect(model.placements[0]).toMatchObject({ objectKindId: "ok_bin", sightingIds: ["sg_1", "sg_2"] });
    expect(model.placements[0]?.assetId).toBeUndefined();
  });

  it("omits a deleted kind", async () => {
    await createEntity(db, "objectKind", bin, "user_1");
    await softDeleteEntity(db, "objectKind", "ok_bin", 0, "user_1");
    expect((await assembleModel(db)).objectKinds).toEqual([]);
  });
});
