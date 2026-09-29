import { describe, expect, it } from "vitest";
import { GUESS_APART_M, GUESS_INSET_M, GUESS_MAX_INSET_M, GUESS_SHIFT_M, entranceGuesses } from "./entrances";
import { floor, LEVEL, rect, type TestRoom } from "./testing";

/**
 * A concourse 10 m wide and 40 m long whose west side is the building's
 * outside: shops along its east side, and back of house north and south of it
 * running right across. Its longest outside run is the whole west side: a
 * metre out from it is in no room (contract v4, amended).
 */
const CONCOURSE: TestRoom[] = [
  { id: "L1-west-concourse", footprint: rect(0, 0, 10, 40) },
  { id: "L1-shops", footprint: rect(10, 0, 30, 40), kind: "room", walkable: false },
  { id: "L1-north", footprint: rect(0, 40, 30, 50), kind: "service", walkable: false },
  { id: "L1-south", footprint: rect(0, -10, 30, 0), kind: "service", walkable: false },
];
const place = (id: string, nameEn: string, more: Record<string, unknown> = {}) =>
  ({ id, nameEn, category: "facility", levelId: LEVEL, roomId: "L1-west-concourse", ...more });
const guesses = (places: Record<string, unknown>[], extra: Record<string, unknown> = {}, rooms = CONCOURSE) =>
  entranceGuesses(floor(rooms, { places, ...extra }), LEVEL);

describe("entranceGuesses (contract v4)", () => {
  it(`puts a gate bound to a concourse ${GUESS_INSET_M} m inside it, halfway along the side that is the building's outside`, () => {
    expect(guesses([place("pl-gate-5", "Gate 5")])).toEqual([
      { placeId: "pl-gate-5", name: "Gate 5", roomId: "L1-west-concourse", point: [1, 20] },
    ]);
  });

  it("spreads three gates in one room evenly along its outside run, in the order of their names", () => {
    const got = guesses([place("pl-gate-4", "Gate 4"), place("pl-gate-2", "Gate 2"), place("pl-gate-3", "Gate 3")]);
    expect(got.map(g => [g.name, g.point])).toEqual([["Gate 2", [1, 30]], ["Gate 3", [1, 20]], ["Gate 4", [1, 10]]]);
  });

  it("finds the outside of a concourse traced inside a larger stadium: the west edge they share, not the sides facing into the stadium", () => {
    // Rehearsal 3's L1: the Stadium's rectangle was traced right over the West Concourses, so no stretch of their
    // outlines was clear of another room by 0.5 m. A metre out from the shared west edge is in no room at all.
    const inStadium: TestRoom[] = [
      { id: "L1-stadium", footprint: rect(0, 0, 40, 60) },
      { id: "L1-west-concourse", footprint: rect(0, 10, 10, 50) },
    ];
    const got = guesses([place("pl-gate-2", "Gate 2"), place("pl-gate-3", "Gate 3"), place("pl-gate-4", "Gate 4")], {}, inStadium);
    expect(got.map(g => [g.name, g.point])).toEqual([["Gate 2", [1, 40]], ["Gate 3", [1, 30]], ["Gate 4", [1, 20]]]);
  });

  it("gives no guess for a place the floor has an entrance of that name for already, capitals and spacing aside", () => {
    const got = guesses([place("pl-gate-1", "Gate 1"), place("pl-gate-2", "Gate 2")], {
      entrances: [{ id: "L1-gate-1", levelId: LEVEL, roomId: "L1-west-concourse", point: [0.5, 30], nameEn: "gate  1" }],
    });
    expect(got.map(g => [g.name, g.point])).toEqual([["Gate 2", [1, 20]]]);
  });

  it("gives no guess for a place nobody has confirmed, or one not bound to a room on this floor", () => {
    expect(guesses([
      place("pl-gate-5", "Gate 5", { status: "proposed" }),
      place("pl-gate-6", "Gate 6", { roomId: undefined }),
      place("pl-gate-7", "Gate 7", { roomId: "L2-hall" }),
      place("pl-gate-8", "Gate 8", { deletedAt: "2026-09-28T00:00:00.000Z" }),
    ], {}, [...CONCOURSE, { id: "L2-hall", footprint: rect(0, 0, 10, 40), levelId: "oth-L2" }])).toEqual([]);
  });

  it("reads gate, entrance, exit and way in as a way in, whatever their case, and nothing else", () => {
    const names = ["Main Entrance", "exit B", "WAY IN from the MRT", "Gateway Cafe", "Starbucks", "Wayfinding sign"];
    expect(guesses(names.map((n, i) => place(`pl-${i}`, n))).map(g => g.name).sort())
      .toEqual(["Main Entrance", "WAY IN from the MRT", "exit B"]);
  });

  it("reads the words outside any parentheses only, plurals and a number run on too (contract v4, amended)", () => {
    const names = ["Stairs to library (Gate 6 Concourse)", "staircase (gate 1 concourse)", "Gates 5 & 6", "Gate1", "North exits"];
    expect(guesses(names.map((n, i) => place(`pl-${i}`, n))).map(g => g.name).sort()).toEqual(["Gate1", "Gates 5 & 6", "North exits"]);
  });

  it("finds the same outside whichever way the room's outline runs", () => {
    const clockwise: TestRoom[] = [{ id: "L1-west-concourse", footprint: [[0, 0], [0, 40], [10, 40], [10, 0]] }, ...CONCOURSE.slice(1)];
    expect(guesses([place("pl-gate-5", "Gate 5")], {}, clockwise).map(g => g.point)).toEqual([[1, 20]]);
  });

  it("gives no guess for a place whose room has no outside run: a metre out from every side of it is in another room", () => {
    const inner = { id: "L1-kiosk-court", footprint: rect(14, 14, 20, 20) };
    expect(guesses([place("pl-gate-9", "Gate 9", { roomId: "L1-kiosk-court" })], {}, [...CONCOURSE, inner])).toEqual([]);
  });
});

describe("entranceGuesses (contract v5)", () => {
  it(`moves a guess further in, a nav cell at a time up to ${GUESS_MAX_INSET_M} m, until routing can start there (entrance.offFloor)`, () => {
    // An area traced inside the concourse walls off the floor along its edge, 1 m in from the building's outside.
    const walled = [...CONCOURSE, { id: "L1-seating", footprint: rect(1, 10, 5, 30) }];
    expect(guesses([place("pl-gate-5", "Gate 5")], {}, walled).map(g => g.point)).toEqual([[1.25, 20]]);
  });

  it(`moves a spot on a corner along its run, up to ${GUESS_SHIFT_M} m, when going further in only runs along the other edge`, () => {
    // A corridor standing alone is outside all round; halfway round its outline is its north-east corner (30, 4).
    const alone: TestRoom[] = [{ id: "L1-west-concourse", footprint: rect(0, 0, 30, 4) }];
    expect(guesses([place("pl-gate-4", "Gate 4")], {}, alone).map(g => g.point)).toEqual([[29.5, 3]]);
  });

  it(`gives no guess where nothing up to ${GUESS_MAX_INSET_M} m in is floor routing can start on`, () => {
    const holed = [{ id: "L1-west-concourse", footprint: rect(0, 0, 10, 40), holes: [rect(0.5, 15, 4, 25)] }, ...CONCOURSE.slice(1)];
    expect(guesses([place("pl-gate-5", "Gate 5")], {}, holed)).toEqual([]);
  });

  it(`keeps guesses on one run at least ${GUESS_APART_M} m apart, the rest on the next run, where a run too short for two holds one at its middle`, () => {
    // Rehearsal 4's West Concourse (middle): 5.5 m and 1.9 m of outside run, and Gates 2–4, which sat 1.2–1.4 m apart.
    // Here the concourse's outside is the last 5.5 m of its west side and the first 2 m of its north side; a
    // building stands along the rest of each.
    const twoRuns: TestRoom[] = [
      { id: "L1-west-concourse", footprint: rect(0, 0, 10, 40) },
      { id: "L1-shops", footprint: rect(10, 0, 30, 40), kind: "room", walkable: false },
      { id: "L1-south", footprint: rect(-10, -10, 30, 0), kind: "service", walkable: false },
      { id: "L1-west-block", footprint: rect(-10, 5.5, 0, 50), kind: "service", walkable: false },
      { id: "L1-north-block", footprint: rect(2, 40, 30, 50), kind: "service", walkable: false },
    ];
    const got = guesses([place("pl-gate-4", "Gate 4"), place("pl-gate-2", "Gate 2"), place("pl-gate-3", "Gate 3")], {}, twoRuns);
    // Two on the 5.5 m run, 3 m apart about its middle; the third at the middle of the 2 m run.
    expect(got.map(g => [g.name, g.point])).toEqual([["Gate 2", [1, 4.25]], ["Gate 3", [1, 1.25]], ["Gate 4", [1, 39]]]);
  });

  it(`keeps a moved guess ${GUESS_APART_M} m in a straight line from the others on its run, going further in if it must`, () => {
    // Rehearsal 4's L1: moved along a run that bends, Gates 2 and 3 came to stand 2.63 m apart. Here a hole in the
    // floor moves Gate 3 back towards Gate 2: 1 m in it would be 2.5 m from it, so it stands 2.75 m in, 3.05 m off.
    const holed: TestRoom[] = [
      { id: "L1-west-concourse", footprint: rect(0, 0, 10, 40), holes: [rect(0.5, 0.1, 4, 1.4)] },
      { id: "L1-shops", footprint: rect(10, 0, 30, 40), kind: "room", walkable: false },
      { id: "L1-south", footprint: rect(-10, -10, 30, 0), kind: "service", walkable: false },
      { id: "L1-west-block", footprint: rect(-10, 5.5, 0, 50), kind: "service", walkable: false },
      { id: "L1-north-block", footprint: rect(2, 40, 30, 50), kind: "service", walkable: false },
    ];
    const got = guesses([place("pl-gate-2", "Gate 2"), place("pl-gate-3", "Gate 3"), place("pl-gate-4", "Gate 4")], {}, holed);
    expect(got.map(g => [g.name, g.point])).toEqual([["Gate 2", [1, 4.25]], ["Gate 3", [2.75, 1.75]], ["Gate 4", [1, 39]]]);
    const [two, three] = got;
    expect(Math.hypot(two!.point[0] - three!.point[0], two!.point[1] - three!.point[1])).toBeGreaterThanOrEqual(GUESS_APART_M);
  });

  it(`spreads guesses on a long run evenly, as far apart as its length allows`, () => {
    // Before the amendment: three on the concourse's 40 m west side stand 10 m apart, not 3.
    const got = guesses([place("pl-gate-2", "Gate 2"), place("pl-gate-3", "Gate 3"), place("pl-gate-4", "Gate 4")]);
    expect(got.map(g => g.point)).toEqual([[1, 30], [1, 20], [1, 10]]);
  });
});
