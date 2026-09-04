import { describe, expect, it } from "vitest";
import { RoomSchema } from "./structure";

const room = {
  id: "L2-room-library",
  levelId: "oth-L2",
  kind: "room" as const,
  footprint: [[0, 0], [10, 0], [10, 8], [0, 8]],
  heightM: 3.5,
  walkable: true,
  nameEn: "Public Library",
  nameZh: "公共图书馆",
};

describe("RoomSchema", () => {
  it("accepts a room", () => {
    expect(RoomSchema.parse(room).id).toBe("L2-room-library");
  });

  it("defaults holes to empty and verification to unverified", () => {
    const parsed = RoomSchema.parse(room);
    expect(parsed.holes).toEqual([]);
    expect(parsed.verification.status).toBe("unverified");
  });

  it("accepts an atrium with a hole — the hackathon model could not express one", () => {
    const atrium = RoomSchema.parse({
      ...room,
      id: "L2-atrium-central",
      kind: "atrium",
      holes: [[[3, 3], [6, 3], [6, 5], [3, 5]]],
    });
    expect(atrium.holes).toHaveLength(1);
    expect(atrium.holes[0]).toHaveLength(4);
  });

  it("rejects an unknown kind", () => {
    expect(() => RoomSchema.parse({ ...room, kind: "shop" })).toThrow();
  });

  it("rejects a footprint with two points", () => {
    expect(() => RoomSchema.parse({ ...room, footprint: [[0, 0], [1, 1]] })).toThrow();
  });

  it("defaults walkable to false so nothing becomes routable by accident", () => {
    const { walkable: _omitted, ...rest } = room;
    expect(RoomSchema.parse(rest).walkable).toBe(false);
  });
});
