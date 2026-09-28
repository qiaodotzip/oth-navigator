import { PlacementSchema, RoomSchema } from "@oth/model";
import { describe, expect, it } from "vitest";
import { roomsToDraw } from "./LevelGroup";

const shop = RoomSchema.parse({
  id: "L1-shop", levelId: "oth-L1", kind: "room",
  footprint: [[0, 0], [10, 0], [10, 10], [0, 10]], heightM: 3.5, walkable: false,
});
const vend = RoomSchema.parse({
  id: "L1-vend", levelId: "oth-L1", kind: "detail",
  footprint: [[2, 2], [6, 2], [6, 4], [2, 4]], heightM: 1.9, walkable: false,
});
const rooms = [shop, vend];

const on = (roomId: string) =>
  PlacementSchema.parse({
    id: `pl-${roomId}`, levelId: "oth-L1", assetId: "asset_1",
    roomId, position: [4, 3, 0],
  });

describe("roomsToDraw", () => {
  it("draws an undressed detail as its own placeholder block", () => {
    expect(roomsToDraw(rooms, []).map(r => r.id)).toContain("L1-vend");
  });

  it("stops drawing the block once a mesh is placed on it", () => {
    // Otherwise the placeholder sits inside the vending machines.
    expect(roomsToDraw(rooms, [on("L1-vend")]).map(r => r.id)).not.toContain("L1-vend");
  });

  it("keeps drawing a room that has dressing in it", () => {
    // A shop is not replaced by the furniture standing in it.
    expect(roomsToDraw(rooms, [on("L1-shop")]).map(r => r.id)).toContain("L1-shop");
  });

  it("keeps drawing a detail dressed by a placement anchored elsewhere", () => {
    expect(roomsToDraw(rooms, [on("L1-shop")]).map(r => r.id)).toContain("L1-vend");
  });

  it("keeps drawing a detail an object stands on, since a wastebin is not the detail's model", () => {
    const bin = PlacementSchema.parse({
      id: "L1-bin-1", levelId: "oth-L1", objectKindId: "ok_bin", roomId: "L1-vend", position: [4, 3, 0],
    });
    expect(roomsToDraw(rooms, [bin]).map(r => r.id)).toContain("L1-vend");
  });
});
