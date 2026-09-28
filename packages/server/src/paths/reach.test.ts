import { parseModel, type Room, type RoomKind } from "@oth/model";
import { describe, expect, it } from "vitest";
import { CROSS_M, REACH_M, crossesOf, lengthInside, reachesOf } from "./reach";
import { rect, type Pt } from "./testing";

/** Rooms on L1 as the model parses them: a shop (kind room, not walkable) unless said otherwise. */
function rooms(...specs: { id: string; footprint: Pt[]; holes?: Pt[][]; kind?: RoomKind }[]): Room[] {
  return parseModel({
    building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
    levels: [{ id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "Level 1", nameZh: "一楼", elevationM: 0, heightM: 6 }],
    rooms: specs.map(s => ({ levelId: "oth-L1", kind: "room", heightM: 4, holes: [], ...s })),
  }).rooms;
}

/** A line along a corridor's middle, y 2, from x 0 to x 20. */
const LINE: Pt[] = [[0, 2], [20, 2]];

describe("reachesOf (contract v4)", () => {
  // The line's east end, (20, 2), pokes into the shop; its west end stops 0.8 m short of the kiosk.
  const shop = { id: "L1-shop", footprint: rect(18, 0, 24, 4) };
  const kiosk = { id: "L1-kiosk", footprint: rect(-5.8, 0, -0.8, 4) };
  // 1.5 m past the east end, and 3 m off the west one: too far.
  const past = { id: "L1-past", footprint: rect(21.5, 0, 25, 4) };
  const aside = { id: "L1-aside", footprint: rect(-5, 5, 5, 9) };

  it(`lists a room an "end" end pokes into, and one it stops ${REACH_M} m short of or less, by id`, () => {
    expect(reachesOf(LINE, ["end", "end"], rooms(shop, kiosk, aside))).toEqual(["L1-kiosk", "L1-shop"]);
    expect(reachesOf(LINE, ["end", "end"], rooms(past, aside))).toEqual([]);
  });

  it("looks only at the line's \"end\" ends: none for a fork or a loop", () => {
    expect(reachesOf(LINE, ["fork", "end"], rooms(shop, kiosk))).toEqual(["L1-shop"]);
    expect(reachesOf(LINE, ["fork", "fork"], rooms(shop, kiosk))).toEqual([]);
    expect(reachesOf([[0, 2], [20, 2], [20, 3], [0, 2]], ["loop", "loop"], rooms(shop, kiosk))).toEqual([]);
  });

  it("counts a room of any kind the end runs into: an open area too", () => {
    expect(reachesOf(LINE, ["fork", "end"], rooms({ id: "L1-hall", footprint: rect(19, -2, 30, 6), kind: "area" }))).toEqual(["L1-hall"]);
  });
});

describe("reachesOf leaves out the rooms a line runs within (contract v4, amended)", () => {
  it("gives a stub inside a concourse nothing: the concourse holds its midpoint", () => {
    const concourse = { id: "L1-concourse", footprint: rect(-10, -10, 20, 20), kind: "area" as const };
    expect(reachesOf([[0, 2], [3, 2]], ["fork", "end"], rooms(concourse))).toEqual([]);
  });

  it("gives a dead end from a corridor into a shop the shop, not the corridor it runs along", () => {
    // The end (20, 2) is in the shop and 1 m from the corridor; the midpoint (10, 2) is in the corridor.
    const corridor = { id: "L1-corridor", footprint: rect(-5, 0, 19, 4), kind: "area" as const };
    const shop = { id: "L1-shop", footprint: rect(19, 0, 25, 4) };
    expect(reachesOf(LINE, ["fork", "end"], rooms(corridor, shop))).toEqual(["L1-shop"]);
  });

  it("finds the midpoint half the line's length along, not at its middle vertex", () => {
    // 2 m east, then 18 m north: half of 20 m is (2, 8), in the lobby; the first bend, (2, 0), is not.
    const lobby = { id: "L1-lobby", footprint: rect(0, 5, 4, 30), kind: "area" as const };
    expect(reachesOf([[0, 0], [2, 0], [2, 18]], ["fork", "end"], rooms(lobby))).toEqual([]);
  });
});

describe("crossesOf (contract v4)", () => {
  it(`lists a shop the line runs more than ${CROSS_M} m inside: 3 m in crosses it, 1.5 m doesn't`, () => {
    expect(crossesOf(LINE, rooms({ id: "L1-deep", footprint: rect(17, 0, 25, 4) }))).toEqual(["L1-deep"]);
    expect(crossesOf(LINE, rooms({ id: "L1-edge", footprint: rect(18.5, 0, 25, 4) }))).toEqual([]);
  });

  it("measures along the line, in and out again, through a shop's middle", () => {
    expect(crossesOf(LINE, rooms({ id: "L1-mid", footprint: rect(8, -1, 11, 5) }))).toEqual(["L1-mid"]);
    // Round a shop's corner: 0.8 m in along one stretch and 0.8 m along the next, 1.6 m in all.
    expect(crossesOf([[0, 2], [9, 2], [9, 20]], rooms({ id: "L1-corner", footprint: rect(8.2, 1, 12, 2.8) }))).toEqual([]);
  });

  it("counts rooms of kind room only: not an open area, back of house or a column", () => {
    const through = (kind: RoomKind) => crossesOf(LINE, rooms({ id: `L1-${kind}`, footprint: rect(5, 0, 15, 4), kind }));
    expect([through("room"), through("area"), through("service"), through("detail"), through("void")])
      .toEqual([["L1-room"], [], [], [], []]);
  });
});

describe("lengthInside", () => {
  it("measures how much of a line lies inside an outline, less its holes", () => {
    expect(lengthInside(LINE, rect(5, 0, 15, 4), [])).toBeCloseTo(10);
    expect(lengthInside(LINE, rect(5, 0, 15, 4), [rect(7, 1, 14, 3)])).toBeCloseTo(3);
    expect(lengthInside([[0, 0], [10, 10]], rect(2, 2, 4, 4), [])).toBeCloseTo(2 * Math.SQRT2);
    expect(lengthInside(LINE, rect(30, 0, 40, 4), [])).toBe(0);
  });
});
