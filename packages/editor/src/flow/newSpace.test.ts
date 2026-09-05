import { PathwaySchema, RoomSchema, type Ring } from "@oth/model";
import { describe, expect, it } from "vitest";
import { newArea, newPathway, newRoom } from "./newSpace";

const ring: Ring = [[0, 0], [10, 0], [10, 10], [0, 10]];

describe("what the drawing tools commit", () => {
  it("makes the area tool produce walkable open floor", () => {
    const area = newArea("oth-L1", ring);
    expect(area.kind).toBe("area");
    expect(area.walkable).toBe(true);
  });

  it("makes the room tool produce a destination you do not route through", () => {
    const room = newRoom("oth-L1", ring);
    expect(room.kind).toBe("room");
    expect(room.walkable).toBe(false);
  });

  it("gives a pathway the default width, so nobody is asked for one", () => {
    expect(newPathway("oth-L1", [[0, 0], [10, 0]]).widthM).toBe(2.4);
  });

  it("produces payloads the model accepts as they are", () => {
    // If a tool ever committed something the schema rejects, the failure would
    // otherwise surface as a 422 in someone's face mid-drawing.
    expect(() => RoomSchema.parse(newArea("oth-L1", ring))).not.toThrow();
    expect(() => RoomSchema.parse(newRoom("oth-L1", ring))).not.toThrow();
    expect(() => PathwaySchema.parse(newPathway("oth-L1", [[0, 0], [10, 0]]))).not.toThrow();
  });

  it("keeps ids apart when two spaces are drawn on the same level", () => {
    expect(newRoom("oth-L1", ring, 1).id).not.toBe(newRoom("oth-L1", ring, 2).id);
    expect(newArea("oth-L1", ring, 1).id).not.toBe(newRoom("oth-L1", ring, 1).id);
  });
});
