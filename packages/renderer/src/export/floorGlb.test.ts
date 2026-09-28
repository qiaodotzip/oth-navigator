import type { Node as GltfNode } from "@gltf-transform/core";
import { WebIO, type Material } from "@gltf-transform/core";
import { AssetSchema, LevelSchema, ObjectKindSchema, parseModel, PlacementSchema, RoomSchema, type MapModel } from "@oth/model";
import { describe, expect, it, vi } from "vitest";
import { CATEGORY_TINT } from "../categoryTint";
import { CONTEXT_ORIGIN_NOTE } from "../contextExport";
import { SLAB_HEIGHT_M } from "../geometry";
import { objectBoxGeometry } from "../objectBox";
import { DEFAULT_PATHWAY_COLOUR, STRIP_HEIGHT_M, STRIP_OPACITY } from "../pathwayStrips";
import { PORTAL_COLOUR, SHAFT_OPACITY } from "../portals";
import { roomColor, wallColor } from "../theme";
import { BALUSTRADE_COLOUR, BALUSTRADE_HEIGHT_M, BALUSTRADE_OPACITY, BALUSTRADE_THICKNESS_M } from "../voids";
import { FLOOR_GROUPS, STACKED_NOTE, buildFloorGlb, type MissingModel } from "./floorGlb";
import {
  bounds, child, DELETED, floorModel, floorNodes, group, linear, materialOf, names, noModels, readGlb, sq, triangleGlb, worldVertices,
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

  it("yields to the browser between floors (M1), so a tab gets to paint while building several", async () => {
    const timeout = vi.spyOn(globalThis, "setTimeout");
    await exported(floorModel, ["oth-L1", "oth-L2"]);
    expect(timeout).toHaveBeenCalledWith(expect.any(Function), 0);
    timeout.mockRestore();
  });

  it("never yields for just one floor", async () => {
    const timeout = vi.spyOn(globalThis, "setTimeout");
    await exported(floorModel, ["oth-L1"]);
    expect(timeout).not.toHaveBeenCalled();
    timeout.mockRestore();
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

  it("also sets the note on the scene, not just the document root, so Blender imports it as a custom property (M6)", async () => {
    const bytes = await buildFloorGlb(floorModel, ["oth-L1"], noModels);
    const { json } = await new WebIO().binaryToJSON(bytes);
    expect(json.scenes?.[0]?.extras).toMatchObject({ othExport: { note: CONTEXT_ORIGIN_NOTE, floors: ["L1"] } });
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
    expect(names(walls).sort()).toEqual(["L1-cafe / Starbucks walls", "L1-cafe walls", "Starbucks walls"]);
    expect(child(walls, "L1-cafe / Starbucks walls").getExtras()).toEqual({ rooms: ["L1-cafe", "L1-shop"] });
  });

  it("names a wall after its room with \" walls\" (M4), so it never collides with the room's floor node", async () => {
    const walls = group(await exported(floorModel, ["oth-L1"]), "L1", "Walls");
    const floors = group(await exported(floorModel, ["oth-L1"]), "L1", "Floors");
    expect(names(floors)).toContain("Starbucks");
    expect(names(walls)).not.toContain("Starbucks");
    expect(names(walls)).toContain("Starbucks walls");
  });

  it("stands every wall at full height: its room's, or the taller of the two", async () => {
    const walls = group(await exported(floorModel, ["oth-L1"]), "L1", "Walls");
    expect(bounds(child(walls, "Starbucks walls")).minY).toBeCloseTo(0);
    expect(bounds(child(walls, "Starbucks walls")).maxY).toBeCloseTo(3.5);
    expect(bounds(child(walls, "L1-cafe / Starbucks walls")).maxY).toBeCloseTo(4);
  });

  it("cuts the door where the pathway goes in: the shop's front stops at 1 m and starts again at 3 m", async () => {
    const shop = child(group(await exported(floorModel, ["oth-L1"]), "L1", "Walls"), "Starbucks walls");
    // The front runs along y = 0, which is z = 0, and the wall is 0.15 m thick.
    const front = worldVertices(shop).filter(([, , z]) => Math.abs(z) < 0.1).map(([x]) => x);
    expect(front.some(x => Math.abs(x - 1) < 1e-3)).toBe(true);
    expect(front.some(x => Math.abs(x - 3) < 1e-3)).toBe(true);
    expect(front.filter(x => x > 1.001 && x < 2.999)).toEqual([]);
  });

  it("raises a floor's walls with it when the floors are stacked", async () => {
    const upstairs = bounds(child(group(await exported(floorModel, ["oth-L1", "oth-L2"]), "L2", "Walls"), "Upstairs walls"));
    expect(upstairs.minY).toBeCloseTo(6);
    expect(upstairs.maxY).toBeCloseTo(9);
  });

  it("paints the walls as the preview does, seen from both sides", async () => {
    const wall = materialOf(child(group(await exported(floorModel, ["oth-L1"]), "L1", "Walls"), "Starbucks walls"));
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

describe("buildFloorGlb — Stops", () => {
  it("builds the lift's shaft on every floor it stops at, and the escalator's flight on the floor it climbs from", async () => {
    const doc = await exported(floorModel, ["oth-L1", "oth-L2"]);
    expect(names(group(doc, "L1", "Stops")).sort()).toEqual(["Escalator 1", "Lift A"]);
    expect(names(group(doc, "L2", "Stops"))).toEqual(["Lift A"]);
    expect(child(group(doc, "L1", "Stops"), "Escalator 1").getExtras()).toEqual({ othId: "esc-1", kind: "escalator" });
  });

  it("raises a shaft to the next floor, and the top floor's to its own height", async () => {
    const doc = await exported(floorModel, ["oth-L1", "oth-L2"]);
    const low = bounds(child(group(doc, "L1", "Stops"), "Lift A"));
    expect(low.minY).toBeCloseTo(0);
    expect(low.maxY).toBeCloseTo(6);
    // Half the shaft's 0.12 m glass stands outside its outline.
    expect(low.minX).toBeCloseTo(29 - 0.06);
    const top = bounds(child(group(doc, "L2", "Stops"), "Lift A"));
    expect(top.minY).toBeCloseTo(6);
    expect(top.maxY).toBeCloseTo(11);
  });

  it("climbs the escalator to the floor above, its top step level with that floor, inside its outline", async () => {
    const flight = bounds(child(group(await exported(floorModel, ["oth-L1"]), "L1", "Stops"), "Escalator 1"));
    expect(flight.maxY).toBeCloseTo(6 + SLAB_HEIGHT_M);
    expect(flight.minX).toBeGreaterThanOrEqual(21 - 1e-6);
    expect(flight.maxX).toBeLessThanOrEqual(23 + 1e-6);
  });

  it("paints the shaft see-through and the flight in the preview's colours", async () => {
    const stops = group(await exported(floorModel, ["oth-L1"]), "L1", "Stops");
    const shaft = materialOf(child(stops, "Lift A"));
    expect(shaft.getAlphaMode()).toBe("BLEND");
    expect(shaft.getAlpha()).toBeCloseTo(SHAFT_OPACITY);
    expectColour(shaft, PORTAL_COLOUR.shaft);
    const escalator = materialOf(child(stops, "Escalator 1"));
    expect(escalator.getName()).toBe("escalator");
    expectColour(escalator, PORTAL_COLOUR.escalator);
  });

  it("builds nothing for a deleted escalator", async () => {
    const gone: MapModel = { ...floorModel, portals: floorModel.portals.map(p => (p.id === "esc-1" ? { ...p, deletedAt: DELETED } : p)) };
    expect(names(group(await exported(gone, ["oth-L1"]), "L1", "Stops"))).toEqual(["Lift A"]);
  });
});

describe("buildFloorGlb — Pathways", () => {
  it("lays each live pathway as a strip, named after it or by its id", async () => {
    const pathways = group(await exported(floorModel, ["oth-L1"]), "L1", "Pathways");
    expect(names(pathways)).toEqual(["Way in", "L1-east"]);
    expect(child(pathways, "Way in").getExtras()).toEqual({ othId: "L1-in", widthM: 2 });
  });

  it("lays a strip as wide as its pathway, just above the slabs", async () => {
    const strip = bounds(child(group(await exported(floorModel, ["oth-L1"]), "L1", "Pathways"), "Way in"));
    expect(strip.minX).toBeCloseTo(1);
    expect(strip.maxX).toBeCloseTo(3);
    expect(strip.minZ).toBeCloseTo(-2);
    expect(strip.maxZ).toBeCloseTo(5);
    expect(strip.minY).toBeCloseTo(STRIP_HEIGHT_M);
    expect(strip.maxY).toBeCloseTo(STRIP_HEIGHT_M);
  });

  it("paints a strip in its kind's colour, and one with no kind in the plan's blue", async () => {
    const pathways = group(await exported(floorModel, ["oth-L1"]), "L1", "Pathways");
    const concourse = materialOf(child(pathways, "Way in"));
    expect(concourse.getName()).toBe("Concourse");
    expectColour(concourse, "#f97316");
    expect(concourse.getAlpha()).toBeCloseTo(STRIP_OPACITY);
    const plain = materialOf(child(pathways, "L1-east"));
    expect(plain.getName()).toBe("pathway");
    expectColour(plain, DEFAULT_PATHWAY_COLOUR);
  });
});

describe("buildFloorGlb — Objects", () => {
  const bin = ObjectKindSchema.parse({ id: "ok-bin", nameEn: "wastebin", size: { w: 0.6, d: 0.4, h: 1 } });
  const cooler = ObjectKindSchema.parse({ id: "ok-cooler", nameEn: "water cooler", size: { w: 0.5, d: 0.5, h: 1.4 }, assetId: "asset-cooler" });
  const place = (id: string, extra: Record<string, unknown>) =>
    PlacementSchema.parse({ id, levelId: "oth-L1", position: [5, -5, 0], ...extra });
  const withObjects: MapModel = {
    ...floorModel,
    objectKinds: [bin, cooler],
    assets: [AssetSchema.parse({
      id: "asset-vend", filename: "vending machine.glb", storagePath: "assets/vend.glb", checksum: "c",
      sizeBytes: 100, triangleCount: 1, bbox: { minX: 0, minY: 0, minZ: 0, maxX: 2, maxY: 1, maxZ: 0 },
    })],
    placements: [
      place("pm-bin-1", { objectKindId: "ok-bin", position: [5, -5, 0] }),
      place("pm-bin-2", { objectKindId: "ok-bin", position: [8, -5, 0] }),
      place("pm-cooler", { objectKindId: "ok-cooler", position: [10, -3, 0], rotationDeg: 90 }),
      place("pm-cooler-2", { objectKindId: "ok-cooler", position: [11, -3, 0] }),
      place("pm-own", { objectKindId: "ok-bin", assetId: "asset-fancy", position: [12, -3, 0] }),
      place("pm-vend", { assetId: "asset-vend", position: [15, -2, 0] }),
      place("pm-broken", { assetId: "asset-missing", position: [16, -2, 0] }),
      place("pm-gone", { objectKindId: "ok-bin", deletedAt: DELETED }),
      place("pm-up", { objectKindId: "ok-bin", levelId: "oth-L2" }),
    ],
  };

  async function exportWith(model: MapModel, levelIds: string[], broken: string[] = ["asset-missing"]) {
    const asked: string[] = [];
    const glb = await triangleGlb();
    const bytes = await buildFloorGlb(model, levelIds, async assetId => {
      asked.push(assetId);
      return broken.includes(assetId) ? null : glb;
    });
    return { doc: await readGlb(bytes), asked };
  }
  const byId = (objects: GltfNode, id: string) => {
    const found = objects.listChildren().find(n => n.getExtras().othId === id);
    if (!found) throw new Error(`No object ${id}`);
    return found;
  };
  const boxBounds = () => {
    const box = objectBoxGeometry(bin.size);
    box.computeBoundingBox();
    return box.boundingBox!;
  };

  it("places one node per live object on the floor, named after its kind, its model's file, or its id", async () => {
    const { doc } = await exportWith(withObjects, ["oth-L1"]);
    expect(names(group(doc, "L1", "Objects")))
      .toEqual(["wastebin", "wastebin", "water cooler", "water cooler", "wastebin", "vending machine", "pm-broken"]);
    expect(byId(group(doc, "L1", "Objects"), "pm-cooler").getExtras())
      .toEqual({ othId: "pm-cooler", objectKindId: "ok-cooler", assetId: "asset-cooler" });
  });

  it("leaves an absent objectKindId or assetId out of an object's extras (M5), rather than writing null", async () => {
    const { doc } = await exportWith(withObjects, ["oth-L1"]);
    const objects = group(doc, "L1", "Objects");
    // pm-bin-1 has a kind but no model asset of its own.
    expect(byId(objects, "pm-bin-1").getExtras()).toEqual({ othId: "pm-bin-1", objectKindId: "ok-bin" });
    // pm-vend has a model asset but no kind.
    expect(byId(objects, "pm-vend").getExtras()).toEqual({ othId: "pm-vend", assetId: "asset-vend" });
  });

  it("builds a kind with no model as a box of its size, standing where the object is", async () => {
    const { doc } = await exportWith(withObjects, ["oth-L1"]);
    const got = bounds(byId(group(doc, "L1", "Objects"), "pm-bin-1"));
    const want = boxBounds();
    // The object stands at plan (5, -5), which is x = 5, z = 5.
    expect(got.minX).toBeCloseTo(5 + want.min.x);
    expect(got.maxX).toBeCloseTo(5 + want.max.x);
    expect(got.minY).toBeCloseTo(want.min.y);
    expect(got.maxY).toBeCloseTo(want.max.y);
    expect(got.minZ).toBeCloseTo(5 + want.min.z);
    expect(got.maxZ).toBeCloseTo(5 + want.max.z);
  });

  it("shares one box between the objects of one kind", async () => {
    const { doc } = await exportWith(withObjects, ["oth-L1"]);
    const objects = group(doc, "L1", "Objects");
    const box = (id: string) => byId(objects, id).listChildren()[0]!.getMesh();
    expect(box("pm-bin-2")).toBe(box("pm-bin-1"));
    expect(doc.getRoot().listMeshes().filter(m => m.getName() === "wastebin box")).toHaveLength(1);
  });

  it("builds a kind with a model from its model, turned as the object is turned", async () => {
    const { doc } = await exportWith(withObjects, ["oth-L1"]);
    const turned = bounds(byId(group(doc, "L1", "Objects"), "pm-cooler"));
    // The triangle runs 2 m along x and 1 m up. At plan (10, -3), turned 90°, it runs from z = 3 toward -z.
    expect(turned.minX).toBeCloseTo(10);
    expect(turned.maxX).toBeCloseTo(10);
    expect(turned.minZ).toBeCloseTo(1);
    expect(turned.maxZ).toBeCloseTo(3);
    expect(turned.maxY).toBeCloseTo(1);
  });

  it("uses an object's own model over its kind's box", async () => {
    const { doc } = await exportWith(withObjects, ["oth-L1"]);
    expect(names(byId(group(doc, "L1", "Objects"), "pm-own"))).toEqual(["body"]);
  });

  it("fetches and copies each model once, however many objects use it", async () => {
    const { doc, asked } = await exportWith(withObjects, ["oth-L1", "oth-L2"]);
    expect([...asked].sort()).toEqual(["asset-cooler", "asset-fancy", "asset-missing", "asset-vend"]);
    // Two coolers, one fancy bin and one vending machine: three models, not four.
    expect(doc.getRoot().listMeshes().filter(m => m.getName() === "bin")).toHaveLength(3);
  });

  it("fetches every distinct asset on a floor in parallel (M3), not one at a time", async () => {
    const asked: string[] = [];
    const releases: Array<() => void> = [];
    const bytes = buildFloorGlb(withObjects, ["oth-L1"], assetId => {
      asked.push(assetId);
      return new Promise(resolve => releases.push(() => resolve(null)));
    });
    // Let the pre-fetch's queued microtasks run, without letting any fetch resolve.
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect([...asked].sort()).toEqual(["asset-cooler", "asset-fancy", "asset-missing", "asset-vend"]);
    releases.forEach(release => release());
    await bytes;
  });

  it("leaves an object whose model won't come empty, and lists it in the file", async () => {
    const { doc } = await exportWith(withObjects, ["oth-L1"]);
    expect(byId(group(doc, "L1", "Objects"), "pm-broken").listChildren()).toEqual([]);
    expect(doc.getRoot().getExtras()).toMatchObject({
      othExport: { missingModels: [{ placementId: "pm-broken", assetId: "asset-missing" }] },
    });
  });

  it("reports each missing model through the optional callback, as it happens (M2)", async () => {
    const reported: MissingModel[] = [];
    await buildFloorGlb(
      withObjects, ["oth-L1"],
      async assetId => (assetId === "asset-missing" ? null : await triangleGlb()),
      m => reported.push(m),
    );
    expect(reported).toEqual([{ placementId: "pm-broken", assetId: "asset-missing" }]);
  });

  it("counts a model that arrived but couldn't be read the same as one that never arrived (M2)", async () => {
    const reported: MissingModel[] = [];
    const garbage = new Uint8Array([1, 2, 3, 4]);
    await buildFloorGlb(
      withObjects, ["oth-L1"],
      async assetId => (assetId === "asset-missing" ? garbage : await triangleGlb()),
      m => reported.push(m),
    );
    expect(reported).toEqual([{ placementId: "pm-broken", assetId: "asset-missing" }]);
  });

  it("falls back to the kind's box when the kind's model won't come", async () => {
    const { doc } = await exportWith(withObjects, ["oth-L1"], ["asset-cooler"]);
    expect(names(byId(group(doc, "L1", "Objects"), "pm-cooler"))).toEqual(["water cooler box"]);
  });

  it("still writes the file when fetching models fails outright", async () => {
    const bytes = await buildFloorGlb(withObjects, ["oth-L1"], async () => {
      throw new Error("offline");
    });
    expect(names(group(await readGlb(bytes), "L1", "Objects"))).toHaveLength(7);
  });

  it("stacks a floor's objects with it", async () => {
    const { doc } = await exportWith(withObjects, ["oth-L1", "oth-L2"]);
    expect(bounds(byId(group(doc, "L2", "Objects"), "pm-up")).minY).toBeCloseTo(6 + boxBounds().min.y);
  });
});
