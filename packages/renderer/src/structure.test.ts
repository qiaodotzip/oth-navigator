import { parseModel } from "@oth/model";
import { describe, expect, it } from "vitest";
import { LOW_WALL_M, levelStructure, wallTop } from "./structure";
import type { WallPiece } from "./wallPlan";

const DELETED = "2026-09-28T00:00:00.000Z";
const base = {
  building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
  levels: [
    { id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6 },
    { id: "oth-L2", buildingId: "oth", code: "L2", ordinal: 2, nameEn: "L2", nameZh: "二楼", elevationM: 6, heightM: 5 },
  ],
};
const sq = (x0: number, y0: number, x1: number, y1: number) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const r6 = (x: number) => Math.round(x * 1e6) / 1e6 + 0;

// A hall along the south; two shops side by side on its north edge; a
// pathway into the west shop; an atrium in the hall; L1's escalator as traced.
const model = parseModel({
  ...base,
  rooms: [
    { id: "L1-hall", levelId: "oth-L1", kind: "area", footprint: sq(0, -10, 20, 0), heightM: 6, walkable: true },
    { id: "L1-shop", levelId: "oth-L1", kind: "room", footprint: sq(0, 0, 6, 4), heightM: 3.5, nameEn: "Starbucks" },
    { id: "L1-cafe", levelId: "oth-L1", kind: "room", footprint: sq(6, 0, 12, 4), heightM: 4 },
    { id: "L1-atrium", levelId: "oth-L1", kind: "void", footprint: sq(14, -8, 18, -4), heightM: 6 },
    { id: "L1-esc", levelId: "oth-L1", kind: "room", footprint: sq(13, 1, 15, 9), heightM: 6, nameEn: "Escalator - 07" },
    { id: "L1-gone", levelId: "oth-L1", kind: "room", footprint: sq(0, 10, 4, 14), heightM: 3, deletedAt: DELETED },
    { id: "L2-shop", levelId: "oth-L2", kind: "room", footprint: sq(0, 0, 6, 4), heightM: 3 },
  ],
  pathways: [
    { id: "L1-in", levelId: "oth-L1", polyline: [[2, -5], [2, 2]], widthM: 2 },
    { id: "L1-old", levelId: "oth-L1", polyline: [[9, -5], [9, 2]], widthM: 2, deletedAt: DELETED },
  ],
});

describe("levelStructure", () => {
  const s = levelStructure(model, "oth-L1");
  const own = (id: string) => s.walls.filter(w => w.rooms.join() === id);
  const southFace = (walls: WallPiece[]) =>
    walls.filter(w => w.a[1] === 0 && w.b[1] === 0).map(w => [r6(w.a[0]), r6(w.b[0])]);

  it("builds one wall between the two shops", () => {
    const between = s.walls.filter(w => w.rooms.length === 2);
    expect(between).toHaveLength(1);
    expect([...between[0]!.rooms].sort()).toEqual(["L1-cafe", "L1-shop"]);
  });

  it("walls rooms, but not the hall people cross", () => {
    expect(s.walls.some(w => w.rooms.includes("L1-hall"))).toBe(false);
  });

  it("opens the shop's front where the pathway goes in", () => {
    expect(southFace(own("L1-shop"))).toEqual([[0, 1], [3, 6]]);
  });

  it("ignores a deleted pathway: the café gets its front door onto the hall instead", () => {
    // Counted, the pathway would cut 8–10 m. Ignored, nothing opens the café,
    // so it gets a 3 m door centred on its wall facing the hall (Rulings 8–10).
    expect(southFace(own("L1-cafe"))).toEqual([[6, 7.5], [10.5, 12]]);
  });

  it("does not wall an escalator the drawing traced as a room", () => {
    expect(s.walls.some(w => w.rooms.includes("L1-esc"))).toBe(false);
  });

  it("still walls a room whose name only begins like one", () => {
    const cafe = parseModel({
      ...base,
      rooms: [{ id: "L1-sc", levelId: "oth-L1", kind: "room", footprint: sq(0, 0, 4, 4), heightM: 3, nameEn: "Stairway Café" }],
    });
    expect(levelStructure(cafe, "oth-L1").walls).toHaveLength(4);
  });

  it("cuts the atrium out of the hall and rails it", () => {
    expect(s.holesByRoom.get("L1-hall")).toHaveLength(1);
    expect(s.balustrades).toHaveLength(4);
  });

  it("builds nothing for a deleted room or another floor's", () => {
    expect(s.walls.some(w => w.rooms.includes("L1-gone") || w.rooms.includes("L2-shop"))).toBe(false);
  });
});

describe("wallTop", () => {
  const heights = new Map([["L1-shop", 3.5], ["L1-cafe", 4], ["L1-kiosk", 1]]);
  const piece = (rooms: string[]): WallPiece => ({ a: [0, 0], b: [1, 0], thicknessM: 0.15, rooms });

  it("stands walls 1.2 m high, so rooms read from above", () => {
    expect(wallTop(piece(["L1-shop"]), heights, false)).toBe(LOW_WALL_M);
  });

  it("never stands a wall taller than its room", () => {
    expect(wallTop(piece(["L1-kiosk"]), heights, false)).toBe(1);
  });

  it("stands a shared wall as tall as the taller room at full height", () => {
    expect(wallTop(piece(["L1-shop", "L1-cafe"]), heights, true)).toBe(4);
  });
});
