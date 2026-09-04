import { RoomSchema } from "@oth/model";
import { describe, expect, it } from "vitest";
import { polylinesToRooms } from "./toRooms";

const square = {
  layer: "A-WALL", closed: true,
  points: [[0, 0], [10, 0], [10, 8], [0, 8]] as [number, number][],
};
const other = {
  layer: "FURNITURE", closed: true,
  points: [[0, 0], [1, 0], [1, 1]] as [number, number][],
};

describe("polylinesToRooms", () => {
  it("produces payloads the model schema accepts", () => {
    const [room] = polylinesToRooms([square], { levelId: "oth-L1" });
    expect(() => RoomSchema.parse(room)).not.toThrow();
  });

  it("scales drawing units to metres — CAD is usually in millimetres", () => {
    const [room] = polylinesToRooms([square], { levelId: "oth-L1", unitsToMetres: 0.001 });
    expect(room?.footprint[1]).toEqual([0.01, 0]);
  });

  it("defaults to a 1:1 unit scale", () => {
    const [room] = polylinesToRooms([square], { levelId: "oth-L1" });
    expect(room?.footprint[1]).toEqual([10, 0]);
  });

  it("filters to the chosen layers, so furniture does not become rooms", () => {
    expect(polylinesToRooms([square, other], { levelId: "oth-L1", layers: ["A-WALL"] })).toHaveLength(1);
  });

  it("skips open polylines, which are not room outlines", () => {
    expect(polylinesToRooms([{ ...square, closed: false }], { levelId: "oth-L1" })).toEqual([]);
  });

  it("generates unique ids scoped to the level", () => {
    const rooms = polylinesToRooms([square, { ...square }], { levelId: "oth-L1" });
    expect(rooms[0]?.id).not.toBe(rooms[1]?.id);
    expect(rooms[0]?.id.startsWith("oth-L1-")).toBe(true);
  });

  it("marks imported rooms as CAD-verified, which is their actual provenance", () => {
    expect(polylinesToRooms([square], { levelId: "oth-L1" })[0]?.verification.status).toBe("cad");
  });

  it("does not mark them walkable, because that is a routing decision a human makes", () => {
    expect(polylinesToRooms([square], { levelId: "oth-L1" })[0]?.walkable).toBe(false);
  });
});
