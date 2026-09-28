import { NodeIO } from "@gltf-transform/core";
import { LevelSchema, ObjectKindSchema, PlacementSchema, RoomSchema } from "@oth/model";
import { describe, expect, it } from "vitest";
import { buildObjectKindGlb, objectKindExportName } from "./objectExport";

const level = LevelSchema.parse({
  id: "oth-L2", buildingId: "oth", code: "L2", ordinal: 2, nameEn: "Level 2", nameZh: "二楼", elevationM: 6, heightM: 4.5,
});
const bin = ObjectKindSchema.parse({ id: "ok_bin", nameEn: "wastebin", size: { w: 0.6, d: 0.4, h: 0.9 } });
const room = (id: string, footprint: [number, number][], levelId = "oth-L2") =>
  RoomSchema.parse({ id, levelId, kind: "room", footprint, heightM: 3.5 });

/** The world-space bounds of the nodes whose names start with `prefix`, read back out of the file. */
async function bounds(bytes: Uint8Array, prefix: string) {
  const doc = await new NodeIO().readBinary(bytes);
  const box = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity };
  for (const node of doc.getRoot().listNodes()) {
    if (!node.getName().startsWith(prefix)) continue;
    const [tx, ty, tz] = node.getTranslation();
    for (const prim of node.getMesh()?.listPrimitives() ?? []) {
      const pos = prim.getAttribute("POSITION")!;
      for (let i = 0; i < pos.getCount(); i++) {
        const [x, y, z] = pos.getElement(i, [0, 0, 0]) as [number, number, number];
        box.minX = Math.min(box.minX, x + tx);
        box.maxX = Math.max(box.maxX, x + tx);
        box.minY = Math.min(box.minY, y + ty);
        box.maxY = Math.max(box.maxY, y + ty);
        box.minZ = Math.min(box.minZ, z + tz);
        box.maxZ = Math.max(box.maxZ, z + tz);
      }
    }
  }
  return box;
}

const names = async (bytes: Uint8Array) =>
  (await new NodeIO().readBinary(bytes)).getRoot().listNodes().map(n => n.getName());

describe("buildObjectKindGlb", () => {
  it("is a box of the kind's size, with its base centre at the origin, in metres, Y up", async () => {
    const box = await bounds(await buildObjectKindGlb(bin, null, [], level), "ok_bin-");
    expect(box.minX).toBeCloseTo(-0.3, 5);
    expect(box.maxX).toBeCloseTo(0.3, 5);
    expect(box.minY).toBeCloseTo(0, 5);
    expect(box.maxY).toBeCloseTo(0.9, 5);
    expect(box.minZ).toBeCloseTo(-0.2, 5);
    expect(box.maxZ).toBeCloseTo(0.2, 5);
  });

  it("sends the box alone when none of its kind is on the map yet", async () => {
    expect(await names(await buildObjectKindGlb(bin, null, [room("L2-near", [[0, 0], [4, 0], [4, 4], [0, 4]])], level)))
      .toEqual(["ok_bin-floor", "ok_bin-walls"]);
  });

  it("brings the surroundings within 5 m of one of its objects, and leaves the rest", async () => {
    const at = PlacementSchema.parse({ id: "L2-bin-1", levelId: "oth-L2", objectKindId: "ok_bin", position: [143, 88, 0] });
    const rooms = [
      room("L2-near", [[130, 80], [150, 80], [150, 86], [130, 86]]),
      room("L2-seven", [[150.5, 87], [152, 87], [152, 89], [150.5, 89]]),
      room("L2-far", [[400, 400], [420, 400], [420, 420], [400, 420]]),
      room("L3-above", [[130, 80], [150, 80], [150, 86], [130, 86]], "oth-L3"),
    ];
    const got = await names(await buildObjectKindGlb(bin, at, rooms, level));
    expect(got).toContain("L2-near-floor");
    for (const out of ["L2-seven-floor", "L2-far-floor", "L3-above-floor"]) expect(got).not.toContain(out);
    // Centred on the object: the box is still about the origin.
    const box = await bounds(await buildObjectKindGlb(bin, at, rooms, level), "ok_bin-");
    expect(box.minX).toBeCloseTo(-0.3, 5);
    expect(box.maxX).toBeCloseTo(0.3, 5);
  });

  it("turns the surroundings with the object, so what it faces is in front of it, at +Z", async () => {
    // Facing east (90°), with a wall a metre east of it. Front is +Z in the file.
    const at = PlacementSchema.parse({
      id: "L2-bin-1", levelId: "oth-L2", objectKindId: "ok_bin", position: [10, 10, 0], rotationDeg: 90,
    });
    const wall = room("L2-east", [[11, 8], [12, 8], [12, 12], [11, 12]]);
    const box = await bounds(await buildObjectKindGlb(bin, at, [wall], level), "L2-east-");
    expect(box.minZ).toBeCloseTo(1, 5);
    expect(box.maxZ).toBeCloseTo(2, 5);
    expect(box.minX).toBeCloseTo(-2, 5);
    expect(box.maxX).toBeCloseTo(2, 5);
  });

  it("says in the file where the origin is, so it explains itself later", async () => {
    const doc = await new NodeIO().readBinary(await buildObjectKindGlb(bin, null, [], level));
    expect(doc.getRoot().getAsset().copyright).toContain("base centre");
    expect(doc.getRoot().getAsset().copyright).toContain("+Z");
  });
});

describe("objectKindExportName", () => {
  it("names the file after the kind: oth-object-<kind>.glb", () => {
    expect(objectKindExportName({ id: "ok_1", nameEn: "Water cooler" })).toBe("oth-object-water-cooler.glb");
  });

  it("falls back to the kind's id when its name leaves nothing to use", () => {
    expect(objectKindExportName({ id: "ok_1", nameEn: "饮水机" })).toBe("oth-object-ok_1.glb");
  });
});
