import type { Vec2 } from "@oth/model";
import { describe, expect, it } from "vitest";
import { BRIDGE_MAX_M, BRIDGE_MAX_RUN_M, bridgeAcross, type Gap } from "./bridge";
import type { PlanInk } from "./ink";
import { floor, rect, type TestRoom } from "./testing";

const open = (a: Vec2, b: Vec2) => {
  const runM = Math.hypot(b[0] - a[0], b[1] - a[1]);
  return { open: true, openM: runM, runM, why: "" };
};
const shut = (a: Vec2, b: Vec2) => ({ open: false, openM: 0, runM: Math.hypot(b[0] - a[0], b[1] - a[1]), why: "a wall" });

/** A probe that says the drawing shows open floor and nothing across it, and remembers what it was asked. */
function sayOpen(): PlanInk & { asked: Array<[Vec2, Vec2]>; whole: Array<[Vec2, Vec2]> } {
  const asked: Array<[Vec2, Vec2]> = [];
  const whole: Array<[Vec2, Vec2]> = [];
  return {
    asked,
    whole,
    run: (a, b) => {
      asked.push([a, b]);
      return open(a, b);
    },
    crossed: (a, b) => {
      whole.push([a, b]);
      return open(a, b);
    },
  };
}
const sayShut: PlanInk = { run: shut, crossed: open };
/** The drawing shows open floor where no room covers it, but something crosses the run elsewhere. */
const sayCrossed: PlanInk = { run: open, crossed: shut };

/** A hall with a pathway along it, and an annex standing off its east end with untraced ground between. */
const roomsOf = (extra: TestRoom[] = [], annex = rect(70, 0, 80, 20)) =>
  floor([{ id: "L1-hall", footprint: rect(0, 0, 60, 20) }, { id: "L1-annex", footprint: annex, nameEn: "Annex" }, ...extra]).rooms;
const gap = (to: Vec2 = [70.5, 2]): Gap => ({ from: [59, 2], to, roomIds: ["L1-annex"] });

describe("bridgeAcross (contract v6)", () => {
  it("bridges a gap the drawing shows as open floor, and names the room it reaches", () => {
    const bridge = bridgeAcross(gap(), roomsOf(), sayOpen());
    expect(bridge).toEqual({
      from: [59, 2], to: [70.5, 2], toRoomId: "L1-annex", toName: "Annex",
      lengthM: 11.5, openM: 10, roomIds: ["L1-annex"],
    });
  });

  it("asks the drawing only about the space no live room covers", () => {
    const ink = sayOpen();
    bridgeAcross(gap(), roomsOf(), ink);
    // The hall's 1 m and the annex's 0.5 m are floor on the map already; the 10 m between them is not.
    expect(ink.asked).toHaveLength(1);
    const asked = ink.asked[0]!;
    expect(asked.map(p => Math.round(p[0]))).toEqual([60, 70]);
  });

  it("lays nothing where the drawing does not show open floor", () => {
    expect(bridgeAcross(gap(), roomsOf(), sayShut)).toBeNull();
  });

  it("lays nothing where something crosses the run on floor the map already has: a partition in an opened block", () => {
    const ink = sayOpen();
    expect(bridgeAcross(gap(), roomsOf(), sayCrossed)).toBeNull();
    // The whole run is asked that question, not only the unlabelled stretch of it.
    bridgeAcross(gap(), roomsOf(), ink);
    expect(ink.whole).toEqual([[[59, 2], [70.5, 2]]]);
  });

  it(`lays nothing across more than ${BRIDGE_MAX_M} m of unlabelled space`, () => {
    const far = bridgeAcross({ from: [59, 2], to: [75.5, 2], roomIds: ["L1-annex"] }, roomsOf([], rect(75, 0, 85, 20)), sayOpen());
    expect(far).toBeNull();
  });

  it(`lays nothing longer than ${BRIDGE_MAX_RUN_M} m end to end, however little of it is unlabelled`, () => {
    // The real case: a line 48.4 m long over floor the map already has, bridging 2.2 m of untraced
    // ground at its far end. The drawing showed it open, and it is still too much line to hand a person.
    const hall = { id: "L1-hall", footprint: rect(0, 0, 60, 20) };
    const annex = { id: "L1-annex", footprint: rect(62, 0, 80, 20), nameEn: "Annex" };
    const rooms = floor([hall, annex]).rooms;
    const near = bridgeAcross({ from: [45, 2], to: [63, 2], roomIds: ["L1-annex"] }, rooms, sayOpen());
    expect(near).toMatchObject({ lengthM: 18, openM: 2 });
    const long = bridgeAcross({ from: [40, 2], to: [63, 2], roomIds: ["L1-annex"] }, rooms, sayOpen());
    expect(long).toBeNull();
  });

  it("never crosses a live room of kind room: the crosses rule, unchanged", () => {
    const shop: TestRoom = { id: "L1-shop", footprint: rect(62, 0, 68, 20), kind: "room", walkable: false };
    expect(bridgeAcross(gap(), roomsOf([shop]), sayOpen())).toBeNull();
  });

  it("clips a room rather than crossing it: under 2 m inside is not crossing", () => {
    const narrow: TestRoom = { id: "L1-shop", footprint: rect(62, 0, 63.5, 20), kind: "room", walkable: false };
    const bridge = bridgeAcross(gap(), roomsOf([narrow]), sayOpen());
    // 1.5 m of the run lies in the shop, which is under the 2 m the crosses rule allows, and
    // that 1.5 m is not unlabelled space, so the drawing is asked about the 8.5 m either side.
    expect(bridge?.openM).toBe(8.5);
  });

  it("never crosses a void or a service space either, though no rule names those", () => {
    const shaft: TestRoom = { id: "L1-lightwell", footprint: rect(62, 0, 68, 20), kind: "void", walkable: false };
    expect(bridgeAcross(gap(), roomsOf([shaft]), sayOpen())).toBeNull();
  });

  it("lays nothing where no space needs bridging: a bridge crosses what no room covers", () => {
    const joined = roomsOf([{ id: "L1-link", footprint: rect(59, 0, 71, 20) }]);
    expect(bridgeAcross(gap(), joined, sayOpen())).toBeNull();
  });
});
