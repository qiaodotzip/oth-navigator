import { NodeIO } from "@gltf-transform/core";
import { LevelSchema, RoomSchema } from "@oth/model";
import { describe, expect, it } from "vitest";
import { buildContextGlb, buildDetailGlb, detailContextRooms } from "./contextExport";

const level = LevelSchema.parse({
  id: "oth-L2", buildingId: "oth", code: "L2", ordinal: 2,
  nameEn: "Level 2", nameZh: "二楼", elevationM: 6, heightM: 4.5,
});

const lobby = RoomSchema.parse({
  id: "L2-lobby", levelId: "oth-L2", kind: "area",
  footprint: [[0, 0], [10, 0], [10, 10], [0, 10]],
  heightM: 4.5, walkable: true, nameEn: "Lobby", nameZh: "大堂",
});

const shop = RoomSchema.parse({
  id: "L2-shop", levelId: "oth-L2", kind: "room",
  footprint: [[10, 0], [20, 0], [20, 10], [10, 10]],
  heightM: 4.5, walkable: true, nameEn: "Shop", nameZh: "商店",
});

const read = (bytes: Uint8Array) => new NodeIO().readBinary(bytes);

describe("buildContextGlb", () => {
  it("produces a readable glTF 2.0 binary", async () => {
    const doc = await read(await buildContextGlb([lobby], level));
    expect(doc.getRoot().listScenes()).toHaveLength(1);
  });

  it("emits a floor and a wall mesh per room", async () => {
    const doc = await read(await buildContextGlb([lobby, shop], level));
    expect(doc.getRoot().listMeshes()).toHaveLength(4);
  });

  it("names nodes after room ids so a modeller can orient", async () => {
    const doc = await read(await buildContextGlb([lobby, shop], level));
    const names = doc.getRoot().listNodes().map(n => n.getName());
    expect(names).toContain("L2-lobby-floor");
    expect(names).toContain("L2-lobby-walls");
    expect(names).toContain("L2-shop-floor");
  });

  it("places geometry at the building origin, not the level elevation", async () => {
    // The modeller works in the level's own frame; elevation is the app's business.
    const doc = await read(await buildContextGlb([lobby], level));
    const node = doc.getRoot().listNodes().find(n => n.getName() === "L2-lobby-floor");
    expect(node?.getTranslation()).toEqual([0, 0, 0]);
  });

  it("keeps real metres, so the modeller can measure against it", async () => {
    const doc = await read(await buildContextGlb([lobby], level));
    const mesh = doc.getRoot().listMeshes().find(m => m.getName() === "L2-lobby-floor");
    const position = mesh?.listPrimitives()[0]?.getAttribute("POSITION");
    expect(position?.getMax([0, 0, 0])[0]).toBeCloseTo(10, 2);
  });

  it("records the origin convention in the file, so it travels with the export", async () => {
    const doc = await read(await buildContextGlb([lobby], level));
    expect(doc.getRoot().getAsset().copyright).toMatch(/metres/i);
  });

  it("records which level the context came from", async () => {
    const doc = await read(await buildContextGlb([lobby], level));
    expect((doc.getRoot().getExtras() as { othContext?: { level?: string } }).othContext?.level).toBe("L2");
  });

  it("returns bytes for an empty selection rather than throwing", async () => {
    expect((await buildContextGlb([], level)).byteLength).toBeGreaterThan(0);
  });
});

/** World-space bounds read straight back out of a written .glb. */
async function bboxOfGlb(bytes: Uint8Array) {
  const doc = await read(bytes);
  const box = {
    minX: Infinity, maxX: -Infinity,
    minY: Infinity, maxY: -Infinity,
    minZ: Infinity, maxZ: -Infinity,
  };
  for (const node of doc.getRoot().listNodes()) {
    const [tx, ty, tz] = node.getTranslation();
    for (const prim of node.getMesh()?.listPrimitives() ?? []) {
      const pos = prim.getAttribute("POSITION")!;
      for (let i = 0; i < pos.getCount(); i++) {
        const v = pos.getElement(i, [0, 0, 0]) as number[];
        box.minX = Math.min(box.minX, v[0]! + tx);
        box.maxX = Math.max(box.maxX, v[0]! + tx);
        box.minY = Math.min(box.minY, v[1]! + ty);
        box.maxY = Math.max(box.maxY, v[1]! + ty);
        box.minZ = Math.min(box.minZ, v[2]! + tz);
        box.maxZ = Math.max(box.maxZ, v[2]! + tz);
      }
    }
  }
  return box;
}

const vend = RoomSchema.parse({
  id: "L2-vend", levelId: "oth-L2", kind: "detail",
  footprint: [[141, 87], [145, 87], [145, 89], [141, 89]],
  heightM: 1.9, walkable: false,
});

const nearWall = RoomSchema.parse({
  id: "L2-near", levelId: "oth-L2", kind: "room",
  footprint: [[130, 80], [150, 80], [150, 86], [130, 86]],
  heightM: 3.5, walkable: false,
});

const farShop = RoomSchema.parse({
  id: "L2-far", levelId: "oth-L2", kind: "room",
  footprint: [[400, 400], [420, 400], [420, 420], [400, 420]],
  heightM: 3.5, walkable: false,
});

describe("buildDetailGlb", () => {
  it("reports the offset it used, which is the detail's centroid", async () => {
    const { offset } = await buildDetailGlb(vend, [], level);
    expect(offset[0]).toBeCloseTo(143, 6);
    expect(offset[1]).toBeCloseTo(88, 6);
  });

  it("puts the detail's centroid at the origin", async () => {
    const box = await bboxOfGlb((await buildDetailGlb(vend, [], level)).bytes);
    // The block is 4 m x 2 m about its centre, so it straddles the origin.
    expect(box.minX).toBeCloseTo(-2, 3);
    expect(box.maxX).toBeCloseTo(2, 3);
    expect(box.minZ).toBeCloseTo(-1, 3);
    expect(box.maxZ).toBeCloseTo(1, 3);
  });

  it("moves the context by the same offset, so it still surrounds the detail", async () => {
    const box = await bboxOfGlb((await buildDetailGlb(vend, [nearWall], level)).bytes);
    // The neighbour spans y = 80..86, south of the detail's edge at y = 87.
    // North is -Z in three coordinates, so "south of" is a larger Z.
    expect(box.maxZ).toBeCloseTo(88 - 80, 3);
    expect(box.minX).toBeCloseTo(130 - 143, 3);
  });

  it("puts the detail back exactly where it was drawn when placed at the offset", async () => {
    // The round trip that makes the whole thing work.
    const { bytes, offset } = await buildDetailGlb(vend, [], level);
    const box = await bboxOfGlb(bytes);
    expect(box.minX + offset[0]).toBeCloseTo(141, 3);
    expect(box.maxX + offset[0]).toBeCloseTo(145, 3);
    // Z is negated north, so the model-space y is recovered by negating back.
    expect(offset[1] - box.maxZ).toBeCloseTo(87, 3);
    expect(offset[1] - box.minZ).toBeCloseTo(89, 3);
  });

  it("says in the file where the origin is, so it explains itself later", async () => {
    const doc = await read((await buildDetailGlb(vend, [], level)).bytes);
    const extras = doc.getRoot().getExtras() as { othDetail?: { offset: number[]; detailId: string } };
    expect(extras.othDetail?.offset).toEqual([143, 88]);
    expect(extras.othDetail?.detailId).toBe("L2-vend");
    expect(doc.getRoot().getAsset().copyright).toContain("centroid");
  });

  it("sits on the floor, not at the level's elevation", async () => {
    // The modeller works at z = 0; the level's height is applied when placed.
    const box = await bboxOfGlb((await buildDetailGlb(vend, [], level)).bytes);
    expect(box.minY).toBeCloseTo(0, 3);
  });
});

describe("detailContextRooms", () => {
  const all = [vend, nearWall, farShop];

  it("takes neighbours within the margin and leaves the rest", () => {
    const near = detailContextRooms(vend, all).map(r => r.id);
    expect(near).toContain("L2-near");
    expect(near).not.toContain("L2-far");
  });

  it("never includes the detail itself", () => {
    expect(detailContextRooms(vend, all).map(r => r.id)).not.toContain("L2-vend");
  });

  it("takes only rooms on the detail's own level", () => {
    const upstairs = RoomSchema.parse({ ...nearWall, id: "L3-near", levelId: "oth-L3" });
    expect(detailContextRooms(vend, [...all, upstairs]).map(r => r.id)).not.toContain("L3-near");
  });

  it("counts a long wall as near even though most of it is far away", () => {
    const wall = RoomSchema.parse({
      id: "L2-wall", levelId: "oth-L2", kind: "room",
      footprint: [[0, 85], [300, 85], [300, 86], [0, 86]],
      heightM: 3.5, walkable: false,
    });
    expect(detailContextRooms(vend, [vend, wall]).map(r => r.id)).toContain("L2-wall");
  });
});
