import { describe, expect, it } from "vitest";
import { GUESS_INSET_M, entranceGuesses } from "./entrances";
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
      { placeId: "pl-gate-5", name: "Gate 5", roomId: "L1-west-concourse", point: [0.5, 20] },
    ]);
  });

  it("spreads three gates in one room evenly along its outside run, in the order of their names", () => {
    const got = guesses([place("pl-gate-4", "Gate 4"), place("pl-gate-2", "Gate 2"), place("pl-gate-3", "Gate 3")]);
    expect(got.map(g => [g.name, g.point])).toEqual([["Gate 2", [0.5, 30]], ["Gate 3", [0.5, 20]], ["Gate 4", [0.5, 10]]]);
  });

  it("finds the outside of a concourse traced inside a larger stadium: the west edge they share, not the sides facing into the stadium", () => {
    // Rehearsal 3's L1: the Stadium's rectangle was traced right over the West Concourses, so no stretch of their
    // outlines was clear of another room by 0.5 m. A metre out from the shared west edge is in no room at all.
    const inStadium: TestRoom[] = [
      { id: "L1-stadium", footprint: rect(0, 0, 40, 60) },
      { id: "L1-west-concourse", footprint: rect(0, 10, 10, 50) },
    ];
    const got = guesses([place("pl-gate-2", "Gate 2"), place("pl-gate-3", "Gate 3"), place("pl-gate-4", "Gate 4")], {}, inStadium);
    expect(got.map(g => [g.name, g.point])).toEqual([["Gate 2", [0.5, 40]], ["Gate 3", [0.5, 30]], ["Gate 4", [0.5, 20]]]);
  });

  it("gives no guess for a place the floor has an entrance of that name for already, capitals and spacing aside", () => {
    const got = guesses([place("pl-gate-1", "Gate 1"), place("pl-gate-2", "Gate 2")], {
      entrances: [{ id: "L1-gate-1", levelId: LEVEL, roomId: "L1-west-concourse", point: [0.5, 30], nameEn: "gate  1" }],
    });
    expect(got.map(g => [g.name, g.point])).toEqual([["Gate 2", [0.5, 20]]]);
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

  it("gives no guess for a place whose room has no outside run: a metre out from every side of it is in another room", () => {
    const inner = { id: "L1-kiosk-court", footprint: rect(14, 14, 20, 20) };
    expect(guesses([place("pl-gate-9", "Gate 9", { roomId: "L1-kiosk-court" })], {}, [...CONCOURSE, inner])).toEqual([]);
  });
});
