import { WebIO, type Material } from "@gltf-transform/core";
import { LevelSchema, PlacementSchema, RoomSchema, type MapModel } from "@oth/model";
import { describe, expect, it } from "vitest";
import { CATEGORY_TINT } from "../categoryTint";
import { CONTEXT_ORIGIN_NOTE } from "../contextExport";
import { SLAB_HEIGHT_M } from "../geometry";
import { roomColor } from "../theme";
import { FLOOR_GROUPS, STACKED_NOTE, buildFloorGlb } from "./floorGlb";
import {
  bounds, child, floorModel, floorNodes, group, linear, materialOf, names, noModels, readGlb, sq, worldVertices,
} from "./testing";

const exported = async (model: MapModel, levelIds: string[]) => readGlb(await buildFloorGlb(model, levelIds, noModels));
const round = (n: number) => Math.round(n * 1000) / 1000 + 0;

function expectColour(material: Material, hex: string) {
  const [r, g, b] = material.getBaseColorFactor();
  const want = linear(hex);
  expect(r).toBeCloseTo(want[0], 5);
  expect(g).toBeCloseTo(want[1], 5);
  expect(b).toBeCloseTo(want[2], 5);
}

describe("buildFloorGlb — the file", () => {
  it("holds one node per floor asked for, each with the spec's six parts in order", async () => {
    const doc = await exported(floorModel, ["oth-L1"]);
    expect(floorNodes(doc).map(n => n.getName())).toEqual(["L1"]);
    expect(names(floorNodes(doc)[0]!)).toEqual(["Floors", "Walls", "Voids", "Stops", "Objects", "Pathways"]);
    expect([...FLOOR_GROUPS]).toEqual(names(floorNodes(doc)[0]!));
  });

  it("stacks every floor at its elevation, lowest first, whatever order they were asked in", async () => {
    const doc = await exported(floorModel, ["oth-L2", "oth-L1"]);
    expect(floorNodes(doc).map(n => n.getName())).toEqual(["L1", "L2"]);
    expect(floorNodes(doc).map(n => n.getTranslation())).toEqual([[0, 0, 0], [0, 6, 0]]);
    expect(bounds(child(group(doc, "L2", "Floors"), "Upstairs")).minY).toBeCloseTo(6);
  });

  it("puts a floor on its own at floor level, as the context export did, and records its elevation", async () => {
    const [floor] = floorNodes(await exported(floorModel, ["oth-L2"]));
    expect(floor!.getTranslation()).toEqual([0, 0, 0]);
    expect(floor!.getExtras()).toEqual({ othId: "oth-L2", elevationM: 6 });
  });

  it("skips a deleted floor or an id it doesn't know, and writes a readable file for no floors at all", async () => {
    expect(floorNodes(await exported(floorModel, ["oth-L9", "oth-nowhere"]))).toEqual([]);
    expect(floorNodes(await exported(floorModel, []))).toEqual([]);
  });

  it("gives a floor with nothing drawn yet its six empty parts", async () => {
    const bare = LevelSchema.parse({ id: "oth-L3", buildingId: "oth", code: "L3", ordinal: 3, nameEn: "Level 3", nameZh: "三楼", elevationM: 11, heightM: 5 });
    const [floor] = floorNodes(await exported({ ...floorModel, levels: [...floorModel.levels, bare] }, ["oth-L3"]));
    expect(names(floor!)).toEqual([...FLOOR_GROUPS]);
    expect(floor!.listChildren().every(g => g.listChildren().length === 0)).toBe(true);
  });

  it("writes the context export's origin note into the generator and the copyright", async () => {
    const one = await buildFloorGlb(floorModel, ["oth-L1"], noModels);
    const { json } = await new WebIO().binaryToJSON(one);
    expect(json.asset.generator).toBe(`OTH map editor. ${CONTEXT_ORIGIN_NOTE}`);
    expect(json.asset.copyright).toBe(CONTEXT_ORIGIN_NOTE);

    const all = await buildFloorGlb(floorModel, ["oth-L1", "oth-L2"], noModels);
    expect((await new WebIO().binaryToJSON(all)).json.asset.generator).toBe(`OTH map editor. ${CONTEXT_ORIGIN_NOTE} ${STACKED_NOTE}`);
    expect((await readGlb(all)).getRoot().getExtras()).toMatchObject({ othExport: { floors: ["L1", "L2"] } });
  });
});

describe("buildFloorGlb — Floors", () => {
  it("builds one mesh per room the preview draws, named after it, and none for a void or a deleted room", async () => {
    const floors = group(await exported(floorModel, ["oth-L1"]), "L1", "Floors");
    expect(names(floors)).toEqual(["Hall", "Starbucks", "L1-cafe", "Bench"]);
    expect(child(floors, "L1-cafe").getExtras()).toEqual({ othId: "L1-cafe", kind: "room" });
  });

  it("lays a floor in real metres, Y up, with north toward -Z", async () => {
    const hall = bounds(child(group(await exported(floorModel, ["oth-L1"]), "L1", "Floors"), "Hall"));
    expect(hall.minX).toBeCloseTo(0);
    expect(hall.maxX).toBeCloseTo(20);
    expect(hall.minZ).toBeCloseTo(0);
    expect(hall.maxZ).toBeCloseTo(10);
    expect(hall.minY).toBeCloseTo(0);
    expect(hall.maxY).toBeCloseTo(SLAB_HEIGHT_M);
  });

  it("cuts the atrium out of the hall's slab", async () => {
    const hall = child(group(await exported(floorModel, ["oth-L1"]), "L1", "Floors"), "Hall");
    const corners = new Set(worldVertices(hall).map(([x, , z]) => `${round(x)},${round(z)}`));
    expect(corners).toContain("14,8");
    expect(corners).toContain("18,4");
  });

  it("builds a detail as a solid block as tall as it is, as the preview does", async () => {
    expect(bounds(child(group(await exported(floorModel, ["oth-L1"]), "L1", "Floors"), "Bench")).maxY).toBeCloseTo(0.9);
  });

  it("tints a bound room by its place's category, and shares one material per paint across floors", async () => {
    const doc = await exported(floorModel, ["oth-L1", "oth-L2"]);
    const starbucks = materialOf(child(group(doc, "L1", "Floors"), "Starbucks"));
    expect(starbucks.getName()).toBe("retail");
    expectColour(starbucks, CATEGORY_TINT.retail);
    const cafe = materialOf(child(group(doc, "L1", "Floors"), "L1-cafe"));
    expect(cafe.getName()).toBe("room");
    expectColour(cafe, roomColor("room"));
    expect(materialOf(child(group(doc, "L2", "Floors"), "Upstairs"))).toBe(cafe);
  });

  it("leaves out a detail's block once a model is placed on it, as the preview does", async () => {
    const dressed: MapModel = {
      ...floorModel,
      placements: [PlacementSchema.parse({ id: "pm-bench", levelId: "oth-L1", assetId: "asset-bench", roomId: "L1-bench", position: [2, -8.5, 0] })],
    };
    expect(names(group(await exported(dressed, ["oth-L1"]), "L1", "Floors"))).not.toContain("Bench");
  });

  it("names a room with no name by its id, and keeps both of two rooms with one name, each with its id", async () => {
    const toilets = ["L1-wc1", "L1-wc2"].map((id, i) =>
      RoomSchema.parse({ id, levelId: "oth-L1", kind: "room", footprint: sq(30 + i * 3, 10, 32 + i * 3, 12), heightM: 3, nameEn: "Toilet" }));
    const blank = RoomSchema.parse({ id: "L1-blank", levelId: "oth-L1", kind: "room", footprint: sq(40, 10, 42, 12), heightM: 3, nameEn: "   " });
    const floors = group(await exported({ ...floorModel, rooms: [...floorModel.rooms, ...toilets, blank] }, ["oth-L1"]), "L1", "Floors");
    expect(floors.listChildren().filter(n => n.getName() === "Toilet").map(n => n.getExtras().othId)).toEqual(["L1-wc1", "L1-wc2"]);
    expect(names(floors)).toContain("L1-blank");
  });
});
