import { PathwayKindSchema, PathwaySchema, RoomSchema } from "@oth/model";
import type * as THREE from "three";
import { describe, expect, it } from "vitest";
import { SLAB_HEIGHT_M, roomGeometry } from "./geometry";
import { floorColour, railBlock, roomFloorGeometry, wallBlock } from "./levelParts";
import { DEFAULT_PATHWAY_COLOUR, STRIP_HEIGHT_M, STRIP_OPACITY, pathwayColour } from "./pathwayStrips";
import { PORTAL_COLOUR, SHAFT_OPACITY, flightColour } from "./portals";
import { LOW_WALL_M } from "./structure";
import { roomColor } from "./theme";
import { BALUSTRADE_COLOUR, BALUSTRADE_HEIGHT_M, BALUSTRADE_OPACITY } from "./voids";
import type { WallPiece } from "./wallPlan";

const sq = (x0: number, y0: number, x1: number, y1: number): Array<[number, number]> =>
  [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const hall = RoomSchema.parse({ id: "L1-hall", levelId: "oth-L1", kind: "area", footprint: sq(0, 0, 20, 10), heightM: 6, walkable: true });
const bench = RoomSchema.parse({ id: "L1-bench", levelId: "oth-L1", kind: "detail", footprint: sq(1, 1, 3, 2), heightM: 0.9 });
const round = (n: number) => Math.round(n * 1000) / 1000 + 0;

function top(geometry: THREE.BufferGeometry): number {
  geometry.computeBoundingBox();
  return geometry.boundingBox!.max.y;
}

describe("roomFloorGeometry", () => {
  it("builds a room's floor as a slab", () => {
    expect(top(roomFloorGeometry(hall))).toBeCloseTo(SLAB_HEIGHT_M);
  });

  it("builds a detail as a solid block as tall as it is", () => {
    expect(top(roomFloorGeometry(bench))).toBeCloseTo(0.9);
  });

  it("cuts the level's voids out of the slab", () => {
    const position = roomFloorGeometry(hall, [sq(4, 4, 8, 8)]).getAttribute("position");
    const corners = new Set<string>();
    for (let i = 0; i < position.count; i++) corners.add(`${round(position.getX(i))},${round(position.getZ(i))}`);
    // North is -Z, so the hole's corner (4, 4) is at z = -4.
    expect(corners).toContain("4,-4");
    expect(corners).toContain("8,-8");
  });

  it("is the room's own slab when there is nothing to cut", () => {
    expect(roomFloorGeometry(hall).getAttribute("position").count).toBe(roomGeometry(hall).getAttribute("position").count);
  });
});

describe("floorColour", () => {
  it("paints a bound room in its place's tint", () => {
    expect(floorColour("room", { tint: "#f2d59b" })).toBe("#f2d59b");
  });

  it("paints an unbound room in its kind's colour", () => {
    expect(floorColour("area")).toBe(roomColor("area"));
  });

  it("lets the selection and the ghosted floor below win over the tint, as the preview did", () => {
    expect(floorColour("room", { tint: "#f2d59b", selected: true })).toBe(roomColor("room", { selected: true }));
    expect(floorColour("room", { tint: "#f2d59b", ghosted: true })).toBe(roomColor("room", { ghosted: true }));
  });
});

describe("wallBlock and railBlock", () => {
  const heights = new Map([["L1-shop", 3.5], ["L1-cafe", 4]]);
  const piece: WallPiece = { a: [0, 0], b: [4, 0], thicknessM: 0.2, rooms: ["L1-shop", "L1-cafe"] };

  it("stands a wall 1.2 m high on the floor, on its own line", () => {
    expect(wallBlock(piece, heights, false)).toEqual({ a: [0, 0], b: [4, 0], thicknessM: 0.2, baseM: 0, topM: LOW_WALL_M });
  });

  it("stands it as tall as the taller room at full height", () => {
    expect(wallBlock(piece, heights, true).topM).toBe(4);
  });

  it("stands a balustrade 1.1 m high", () => {
    expect(railBlock({ a: [0, 0], b: [1, 0], thicknessM: 0.08, rooms: ["L1-atrium"] }))
      .toEqual({ a: [0, 0], b: [1, 0], thicknessM: 0.08, baseM: 0, topM: BALUSTRADE_HEIGHT_M });
  });
});

describe("the preview's paint, now shared with the export", () => {
  it("keeps the colours and opacities the components had", () => {
    expect(PORTAL_COLOUR).toEqual({ shaft: "#7c93b5", escalator: "#8d99a6", stair: "#b9ae96" });
    expect(SHAFT_OPACITY).toBe(0.45);
    expect(BALUSTRADE_COLOUR).toBe("#9fb3c8");
    expect(BALUSTRADE_OPACITY).toBe(0.6);
    expect(STRIP_OPACITY).toBe(0.7);
    expect(STRIP_HEIGHT_M).toBeCloseTo(SLAB_HEIGHT_M + 0.02);
  });

  it("paints escalators grey, and stairs and ramps as stone", () => {
    expect(flightColour("escalator")).toBe(PORTAL_COLOUR.escalator);
    expect(flightColour("stair")).toBe(PORTAL_COLOUR.stair);
    expect(flightColour("ramp")).toBe(PORTAL_COLOUR.stair);
  });

  it("paints a pathway in its kind's colour, or the plan's blue when it has none", () => {
    const kinds = [PathwayKindSchema.parse({ id: "pk-concourse", nameEn: "Concourse", colorHex: "#f97316" })];
    const kinded = PathwaySchema.parse({ id: "p1", levelId: "oth-L1", polyline: [[0, 0], [1, 0]], kindId: "pk-concourse" });
    const plain = PathwaySchema.parse({ id: "p2", levelId: "oth-L1", polyline: [[0, 0], [1, 0]] });
    expect(pathwayColour(kinded, kinds)).toBe("#f97316");
    expect(pathwayColour(plain, kinds)).toBe(DEFAULT_PATHWAY_COLOUR);
  });
});
