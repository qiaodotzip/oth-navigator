import { describe, expect, it } from "vitest";
import { roomColor } from "./theme";

describe("roomColor", () => {
  it("gives every room kind a colour", () => {
    for (const kind of ["room", "area", "service", "void"] as const) {
      expect(roomColor(kind)).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("distinguishes an area from a room, since one is crossed and one is entered", () => {
    expect(roomColor("area")).not.toBe(roomColor("room"));
  });

  it("dims a room that is not on the active level", () => {
    expect(roomColor("room", { ghosted: true })).not.toBe(roomColor("room"));
  });

  it("highlights a selected room", () => {
    expect(roomColor("room", { selected: true })).not.toBe(roomColor("room"));
  });
});
