import { RoomSchema } from "@oth/model";
import { describe, expect, it } from "vitest";
import { roomGeometry, roomShape } from "./geometry";

const square = RoomSchema.parse({
  id: "L1-lobby", levelId: "oth-L1", kind: "atrium",
  footprint: [[0, 0], [10, 0], [10, 10], [0, 10]],
  heightM: 6, walkable: true,
});

const withHole = RoomSchema.parse({
  ...square,
  id: "L1-atrium",
  holes: [[[4, 4], [6, 4], [6, 6], [4, 6]]],
});

describe("roomShape", () => {
  it("produces a closed shape with one point per footprint vertex", () => {
    expect(roomShape(square).getPoints(1)).toHaveLength(5);
  });

  it("adds a hole path for each hole", () => {
    expect(roomShape(withHole).holes).toHaveLength(1);
  });

  it("produces no holes for a room without any", () => {
    expect(roomShape(square).holes).toHaveLength(0);
  });
});

describe("roomGeometry", () => {
  it("produces a non-empty position attribute", () => {
    expect(roomGeometry(square).getAttribute("position").count).toBeGreaterThan(0);
  });

  it("spans the footprint in x", () => {
    const geo = roomGeometry(square);
    geo.computeBoundingBox();
    expect(geo.boundingBox?.min.x).toBeCloseTo(0);
    expect(geo.boundingBox?.max.x).toBeCloseTo(10);
  });

  it("maps north to -z, matching the coordinate mapping", () => {
    const geo = roomGeometry(square);
    geo.computeBoundingBox();
    expect(geo.boundingBox?.min.z).toBeCloseTo(-10);
    expect(geo.boundingBox?.max.z).toBeCloseTo(0);
  });

  it("extrudes upward by the slab height", () => {
    const geo = roomGeometry(square, { slabHeightM: 0.5 });
    geo.computeBoundingBox();
    expect(geo.boundingBox?.min.y).toBeCloseTo(0);
    expect(geo.boundingBox?.max.y).toBeCloseTo(0.5);
  });

  it("removes the hole's area from the mesh", () => {
    const solid = roomGeometry(square).getAttribute("position").count;
    const holed = roomGeometry(withHole).getAttribute("position").count;
    expect(holed).not.toBe(solid);
  });
});
