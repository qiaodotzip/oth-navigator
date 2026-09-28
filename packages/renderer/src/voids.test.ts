import { RoomSchema, type Room } from "@oth/model";
import { describe, expect, it } from "vitest";
import { BALUSTRADE_THICKNESS_M, balustradeRuns, voidHoles } from "./voids";

function space(id: string, kind: Room["kind"], footprint: Array<[number, number]>, extra: Record<string, unknown> = {}): Room {
  return RoomSchema.parse({ id, levelId: "oth-L1", kind, heightM: 5, footprint, ...extra });
}
const square = (x0: number, y0: number, x1: number, y1: number): Array<[number, number]> =>
  [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];

const hall = space("L1-hall", "area", square(0, 0, 40, 20));
const atrium = space("L1-atrium", "void", square(10, 5, 20, 15));

describe("voidHoles", () => {
  it("cuts a void out of the floor it stands in", () => {
    expect(voidHoles([hall, atrium]).get("L1-hall")).toEqual([atrium.footprint]);
  });

  it("cuts every floor that holds it, a shop inside the hall included", () => {
    const shop = space("L1-shop", "room", square(5, 2, 25, 18));
    const holes = voidHoles([hall, shop, atrium]);
    expect(holes.get("L1-hall")).toHaveLength(1);
    expect(holes.get("L1-shop")).toHaveLength(1);
  });

  it("leaves a floor whole when the void reaches past its edge", () => {
    const overhang = space("L1-v", "void", square(35, 5, 45, 15));
    expect(voidHoles([hall, overhang]).size).toBe(0);
  });

  it("leaves an L-shaped floor whole when the void spans its notch", () => {
    const ell = space("L1-ell", "area", [[0, 0], [20, 0], [20, 10], [10, 10], [10, 20], [0, 20]]);
    // Every corner is on the floor, but one edge crosses the notch.
    const across = space("L1-v", "void", [[2, 2], [18, 8], [8, 18]]);
    expect(voidHoles([ell, across]).size).toBe(0);
  });

  it("leaves a floor whole when the void overlaps a hole already in it", () => {
    const pierced = space("L1-hall", "area", square(0, 0, 40, 20), { holes: [square(12, 8, 18, 12)] });
    expect(voidHoles([pierced, atrium]).size).toBe(0);
  });

  // Ray casting counts a corner on a left or bottom edge as inside and one on
  // a right or top edge as outside, so every side is checked.
  it.each([
    ["left", square(0, 5, 10, 15)],
    ["bottom", square(10, 0, 20, 10)],
    ["right", square(30, 5, 40, 15)],
    ["top", square(10, 10, 20, 20)],
  ])("leaves a floor whole when the void is flush with its %s edge", (_side, footprint) => {
    expect(voidHoles([hall, space("L1-v", "void", footprint)]).size).toBe(0);
  });

  it("leaves a floor whole when the void's corner sits on a hole's edge", () => {
    const pierced = space("L1-hall", "area", square(0, 0, 40, 20), { holes: [[[6, 1], [14, 1], [6, 9]]] });
    expect(voidHoles([pierced, atrium]).size).toBe(0);
  });

  it("leaves a floor whole when a hole's corner sits on the void's edge", () => {
    const pierced = space("L1-hall", "area", square(0, 0, 40, 20), { holes: [square(12, 15, 18, 18)] });
    expect(voidHoles([pierced, atrium]).size).toBe(0);
  });

  it("cuts nothing from furniture: a detail is not a floor", () => {
    const plinth = space("L1-plinth", "detail", square(0, 0, 40, 20));
    expect(voidHoles([plinth, atrium]).size).toBe(0);
  });

  it("cuts only floors on its own level", () => {
    const upstairs = space("L2-hall", "area", square(0, 0, 40, 20), { levelId: "oth-L2" });
    expect(voidHoles([upstairs, atrium]).size).toBe(0);
  });
});

describe("balustradeRuns", () => {
  it("rails every edge of a void, and nothing else", () => {
    const rails = balustradeRuns([hall, atrium]);
    expect(rails).toHaveLength(4);
    expect(rails.every(r => r.thicknessM === BALUSTRADE_THICKNESS_M && r.rooms.join() === "L1-atrium")).toBe(true);
  });
});
