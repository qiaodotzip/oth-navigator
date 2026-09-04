import { describe, expect, it } from "vitest";
import { roomColor } from "./theme";

describe("roomColor", () => {
  it("gives every room kind a colour", () => {
    for (const kind of ["room", "corridor", "atrium", "service", "outdoor", "void"] as const) {
      expect(roomColor(kind)).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("distinguishes corridors from rooms, since that is the distinction users navigate by", () => {
    expect(roomColor("corridor")).not.toBe(roomColor("room"));
  });

  it("dims a room that is not on the active level", () => {
    expect(roomColor("room", { ghosted: true })).not.toBe(roomColor("room"));
  });

  it("highlights a selected room", () => {
    expect(roomColor("room", { selected: true })).not.toBe(roomColor("room"));
  });
});
