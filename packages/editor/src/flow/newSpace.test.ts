import { PathwaySchema, RoomSchema, type Ring } from "@oth/model";
import { describe, expect, it } from "vitest";
import { newPathway, newSpace } from "./newSpace";

const ring: Ring = [[0, 0], [10, 0], [10, 10], [0, 10]];

describe("what the drawing tools commit", () => {
  it("makes the area tool produce walkable open floor", () => {
    expect(newSpace("area", "oth-L1", ring)).toMatchObject({ kind: "area", walkable: true });
  });

  it("makes the room tool produce a destination you do not route through", () => {
    expect(newSpace("room", "oth-L1", ring)).toMatchObject({ kind: "room", walkable: false });
  });

  it("makes the detail tool produce furniture, low and not walkable", () => {
    expect(newSpace("detail", "oth-L1", ring)).toMatchObject({
      kind: "detail", walkable: false, heightM: 1.2,
    });
  });

  it("gives a pathway the default width, so nobody is asked for one", () => {
    expect(newPathway("oth-L1", [[0, 0], [10, 0]]).widthM).toBe(2.4);
  });

  it("produces payloads the model accepts as they are", () => {
    // A tool committing something the schema rejects would otherwise surface as
    // a 422 in someone's face mid-drawing.
    for (const kind of ["area", "room", "detail"] as const) {
      expect(() => RoomSchema.parse(newSpace(kind, "oth-L1", ring))).not.toThrow();
    }
    expect(() => PathwaySchema.parse(newPathway("oth-L1", [[0, 0], [10, 0]]))).not.toThrow();
  });

  it("keeps ids apart across kinds and across draws", () => {
    expect(newSpace("room", "oth-L1", ring, 1).id).not.toBe(newSpace("room", "oth-L1", ring, 2).id);
    expect(newSpace("area", "oth-L1", ring, 1).id).not.toBe(newSpace("room", "oth-L1", ring, 1).id);
  });
});
