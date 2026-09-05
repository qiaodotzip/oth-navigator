import { NodeIO } from "@gltf-transform/core";
import { LevelSchema, RoomSchema } from "@oth/model";
import { describe, expect, it } from "vitest";
import { buildContextGlb } from "./contextExport";

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
