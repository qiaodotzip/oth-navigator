import { RoomSchema } from "@oth/model";
import { describe, expect, it } from "vitest";
import { wallGeometry } from "./walls";

const square = RoomSchema.parse({
  id: "L1-lobby", levelId: "oth-L1", kind: "area",
  footprint: [[0, 0], [10, 0], [10, 10], [0, 10]],
  heightM: 4, walkable: true,
});

const withHole = RoomSchema.parse({
  ...square, id: "L1-atrium", holes: [[[4, 4], [6, 4], [6, 6], [4, 6]]],
});

describe("wallGeometry", () => {
  it("builds two triangles per footprint edge", () => {
    // 4 edges x 2 triangles x 3 vertices
    expect(wallGeometry(square).getAttribute("position").count).toBe(24);
  });

  it("includes hole edges, so an atrium void has a wall too", () => {
    expect(wallGeometry(withHole).getAttribute("position").count).toBe(48);
  });

  it("rises from the floor to the room height", () => {
    const geo = wallGeometry(square);
    geo.computeBoundingBox();
    expect(geo.boundingBox?.min.y).toBeCloseTo(0);
    expect(geo.boundingBox?.max.y).toBeCloseTo(4);
  });

  it("honours an explicit height override", () => {
    const geo = wallGeometry(square, 2.5);
    geo.computeBoundingBox();
    expect(geo.boundingBox?.max.y).toBeCloseTo(2.5);
  });

  it("maps north to -z, matching the coordinate mapping", () => {
    const geo = wallGeometry(square);
    geo.computeBoundingBox();
    expect(geo.boundingBox?.min.z).toBeCloseTo(-10);
    expect(geo.boundingBox?.max.z).toBeCloseTo(0);
  });
});
