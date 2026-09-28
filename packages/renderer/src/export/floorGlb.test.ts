import { WebIO, type Material } from "@gltf-transform/core";
import { LevelSchema, parseModel, PlacementSchema, RoomSchema, type MapModel } from "@oth/model";
import { describe, expect, it } from "vitest";
import { CATEGORY_TINT } from "../categoryTint";
import { CONTEXT_ORIGIN_NOTE } from "../contextExport";
import { SLAB_HEIGHT_M } from "../geometry";
import { roomColor, wallColor } from "../theme";
import { BALUSTRADE_COLOUR, BALUSTRADE_HEIGHT_M, BALUSTRADE_OPACITY, BALUSTRADE_THICKNESS_M } from "../voids";
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

describe("buildFloorGlb — Walls", () => {
  it("builds the preview's walls: one mesh per room, and one per pair of rooms that share a wall", async () => {
    const walls = group(await exported(floorModel, ["oth-L1"]), "L1", "Walls");
    expect(names(walls).sort()).toEqual(["L1-cafe", "L1-cafe / Starbucks", "Starbucks"]);
    expect(child(walls, "L1-cafe / Starbucks").getExtras()).toEqual({ rooms: ["L1-cafe", "L1-shop"] });
  });

  it("stands every wall at full height: its room's, or the taller of the two", async () => {
    const walls = group(await exported(floorModel, ["oth-L1"]), "L1", "Walls");
    expect(bounds(child(walls, "Starbucks")).minY).toBeCloseTo(0);
    expect(bounds(child(walls, "Starbucks")).maxY).toBeCloseTo(3.5);
    expect(bounds(child(walls, "L1-cafe / Starbucks")).maxY).toBeCloseTo(4);
  });

  it("cuts the door where the pathway goes in: the shop's front stops at 1 m and starts again at 3 m", async () => {
    const shop = child(group(await exported(floorModel, ["oth-L1"]), "L1", "Walls"), "Starbucks");
    // The front runs along y = 0, which is z = 0, and the wall is 0.15 m thick.
    const front = worldVertices(shop).filter(([, , z]) => Math.abs(z) < 0.1).map(([x]) => x);
    expect(front.some(x => Math.abs(x - 1) < 1e-3)).toBe(true);
    expect(front.some(x => Math.abs(x - 3) < 1e-3)).toBe(true);
    expect(front.filter(x => x > 1.001 && x < 2.999)).toEqual([]);
  });

  it("raises a floor's walls with it when the floors are stacked", async () => {
    const upstairs = bounds(child(group(await exported(floorModel, ["oth-L1", "oth-L2"]), "L2", "Walls"), "Upstairs"));
    expect(upstairs.minY).toBeCloseTo(6);
    expect(upstairs.maxY).toBeCloseTo(9);
  });

  it("paints the walls as the preview does, seen from both sides", async () => {
    const wall = materialOf(child(group(await exported(floorModel, ["oth-L1"]), "L1", "Walls"), "Starbucks"));
    expect(wall.getName()).toBe("wall");
    expectColour(wall, wallColor("room"));
    expect(wall.getDoubleSided()).toBe(true);
  });

  it("builds a whole floor's worth, 400 shops, into one modest file with one material per paint", async () => {
    const rooms = [];
    for (let i = 0; i < 20; i++) {
      for (let j = 0; j < 20; j++) {
        rooms.push({ id: `r-${i}-${j}`, levelId: "oth-L1", kind: "room", footprint: sq(i * 5, j * 5, i * 5 + 5, j * 5 + 5), heightM: 3.5, nameEn: `Shop ${i}-${j}` });
      }
    }
    const grid = parseModel({ building: floorModel.building, levels: [floorModel.levels[0]!], rooms });
    const bytes = await buildFloorGlb(grid, ["oth-L1"], noModels);
    const doc = await readGlb(bytes);
    expect(names(group(doc, "L1", "Floors"))).toHaveLength(400);
    expect(doc.getRoot().listMaterials().map(m => m.getName()).sort()).toEqual(["room", "wall"]);
    expect(bytes.byteLength).toBeLessThan(3_000_000);
  });
});

describe("buildFloorGlb — Voids", () => {
  it("rails the atrium with a balustrade named after it, 1.1 m high around its edge", async () => {
    const voids = group(await exported(floorModel, ["oth-L1"]), "L1", "Voids");
    expect(names(voids)).toEqual(["Atrium"]);
    const half = BALUSTRADE_THICKNESS_M / 2;
    const rail = bounds(child(voids, "Atrium"));
    expect(rail.minX).toBeCloseTo(14 - half);
    expect(rail.maxX).toBeCloseTo(18 + half);
    expect(rail.minZ).toBeCloseTo(4 - half);
    expect(rail.maxZ).toBeCloseTo(8 + half);
    expect(rail.minY).toBeCloseTo(0);
    expect(rail.maxY).toBeCloseTo(BALUSTRADE_HEIGHT_M);
  });

  it("paints it as see-through glass", async () => {
    const glass = materialOf(child(group(await exported(floorModel, ["oth-L1"]), "L1", "Voids"), "Atrium"));
    expect(glass.getAlphaMode()).toBe("BLEND");
    expect(glass.getAlpha()).toBeCloseTo(BALUSTRADE_OPACITY);
    expectColour(glass, BALUSTRADE_COLOUR);
  });

  it("rails nothing on a floor with no void", async () => {
    expect(names(group(await exported(floorModel, ["oth-L2"]), "L2", "Voids"))).toEqual([]);
  });
});
