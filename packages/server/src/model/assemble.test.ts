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
