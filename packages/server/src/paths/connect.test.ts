import { distancePointToSegment, type Vec2 } from "@oth/model";
import { describe, expect, it } from "vitest";
import {
  CONNECT_MAX_M, CONNECTOR_SIMPLIFY_M, CONTAINER_SHARE, CannotConnect, ISLAND_JOIN_M, clearLine, connect, connectRooms, linkTargets,
  REASONS, simplifyOnFloor, type Connector, type Target,
} from "./connect";
import { walkableAt, walkableRaster, type Raster } from "./raster";
import { simplify } from "./simplify";
import { doorway, floor, LEVEL, rect, type TestRoom } from "./testing";

const corridor = walkableRaster(floor([{ footprint: rect(0, 0, 20, 4) }]), LEVEL);
/** The corridor's centre line, as the skeleton would give it. */
const middle: Vec2[] = [[2, 2], [18, 2]];
const entrance = (id: string, point: Vec2): Target => ({ type: "entrance", id, point });

describe("linkTargets", () => {
  it("takes each doorway's midpoint, each stop's footprint centre or point, and each entrance, on this floor", () => {
    const model = floor([], {
      doorways: [
        doorway("door-b", [[9, 4], [11, 4]]),
        doorway("door-a", [[0, 1], [0, 3]]),
        { ...doorway("door-gone", [[5, 4], [6, 4]]), deletedAt: "2026-09-28T10:00:00.000Z" },
        { ...doorway("door-up", [[5, 4], [6, 4]]), levelId: "oth-L2" },
      ],
      portals: [{ id: "lift-1", kind: "lift" }],
      portalEndpoints: [
        { id: "stop-shaft", portalId: "lift-1", levelId: LEVEL, roomId: "room-a", point: [0, 0], footprint: rect(16, 1, 18, 3) },
        { id: "stop-point", portalId: "lift-1", levelId: LEVEL, roomId: "room-a", point: [5, 5] },
      ],
      entrances: [{ id: "gate-4", levelId: LEVEL, roomId: "room-a", point: [1, 2] }],
    });
    expect(linkTargets(model, LEVEL)).toEqual([
      { type: "doorway", id: "door-a", point: [0, 2] },
      { type: "doorway", id: "door-b", point: [10, 4] },
      { type: "stop", id: "stop-point", point: [5, 5] },
      { type: "stop", id: "stop-shaft", point: [17, 2] },
      { type: "entrance", id: "gate-4", point: [1, 2] },
    ]);
  });
});

describe("connect", () => {
  it("joins a doorway on the corridor's wall straight across to the line", () => {
    const { links, unconnected } = connect(corridor, [middle], [{ type: "doorway", id: "door-1", point: [10, 4] }]);
    expect(links).toEqual([{ from: { type: "doorway", id: "door-1" }, segment: [[10, 4], [10, 2]] }]);
    expect(unconnected).toEqual([]);
  });

  it("reaches across the drawing's wall to a doorway just off the surface", () => {
    const { links } = connect(corridor, [middle], [{ type: "doorway", id: "door-1", point: [10, 4.4] }]);
    expect(links).toEqual([{ from: { type: "doorway", id: "door-1" }, segment: [[10, 4.4], [10, 2]] }]);
  });

  it("lists a doorway off the walkable surface as unconnected", () => {
    const { links, unconnected } = connect(corridor, [middle], [{ type: "doorway", id: "door-9", point: [50, 50] }]);
    expect(links).toEqual([]);
    expect(unconnected).toEqual([{ type: "doorway", id: "door-9", reason: REASONS.offSurface }]);
  });

  it("takes the nearest point it can reach in a straight line, not the nearest point", () => {
    // Two corridors with a 1 m wall between them, joined at the east end.
    const u = walkableRaster(floor([{ footprint: rect(0, 0, 20, 4) }, { footprint: rect(0, 5, 20, 9) }, { footprint: rect(20, 0, 24, 9) }]), LEVEL);
    const south: Vec2[] = [[2, 1], [22, 1]];
    const north: Vec2[] = [[2, 5.5], [22, 5.5]];
    const { links } = connect(u, [south, north], [entrance("gate-1", [10, 3.9])]);
    expect(links).toEqual([{ from: { type: "entrance", id: "gate-1" }, segment: [[10, 3.9], [10, 1]] }]);
  });

  it("lists what no straight line can reach without leaving the surface", () => {
    const apart = walkableRaster(floor([{ footprint: rect(0, 0, 20, 4) }, { footprint: rect(30, 0, 34, 4) }]), LEVEL);
    const { unconnected } = connect(apart, [middle], [entrance("gate-2", [32, 2])]);
    expect(unconnected).toEqual([{ type: "entrance", id: "gate-2", reason: REASONS.blocked }]);
  });

  it("tries only the nearest 200 points on the lines, nearest first", () => {
    // Three corridors side by side, 1 m apart. The two beyond the wall have 270 points within 35 m of
    // the gate; the one line the gate can reach starts 35 m along its own corridor.
    const three = walkableRaster(floor([
      { footprint: rect(0, 0, 100, 4) }, { footprint: rect(0, 5, 100, 9) }, { footprint: rect(0, 10, 100, 14) },
    ]), LEVEL);
    const beyond: Vec2[][] = [[[2, 7], [98, 7]], [[2, 12], [98, 12]]];
    const reachable: Vec2[] = [[75, 2], [98, 2]];
    expect(connect(three, [reachable], [entrance("gate-5", [40, 3.9])]).links).toHaveLength(1);
    expect(connect(three, [...beyond, reachable], [entrance("gate-5", [40, 3.9])])).toEqual({
      links: [], unconnected: [{ type: "entrance", id: "gate-5", reason: REASONS.blocked }],
    });
  });

  it("joins nothing to a line more than 50 m away", () => {
    const long = walkableRaster(floor([{ footprint: rect(0, 0, 100, 4) }]), LEVEL);
    const { unconnected } = connect(long, [[[80, 2], [98, 2]]], [entrance("gate-3", [10, 2])]);
    expect(unconnected).toEqual([{ type: "entrance", id: "gate-3", reason: REASONS.noLine }]);
  });

  it("says a floor with no walkable area has nothing to join", () => {
    const empty = walkableRaster(floor([]), LEVEL);
    const { unconnected } = connect(empty, [], [entrance("gate-4", [1, 1])]);
    expect(unconnected).toEqual([{ type: "entrance", id: "gate-4", reason: REASONS.noSurface }]);
  });
});

/**
 * Contract v5's connect_rooms, on a hall 60 × 20 m: its gate at the west end,
 * and one pathway, 2 m in along its south side, that routing reaches from it.
 */
const HALL: TestRoom = { id: "L1-hall", footprint: rect(0, 0, 60, 20) };
const GATE = { id: "L1-gate", levelId: LEVEL, roomId: "L1-hall", point: [1, 2], nameEn: "Gate" };
const MAIN = { id: "L1-main", levelId: LEVEL, polyline: [[1, 2], [59, 2]] as Vec2[], widthM: 2 };
const shop = (id: string, x0: number, y0: number, x1: number, y1: number): TestRoom =>
  ({ id, footprint: rect(x0, y0, x1, y1), kind: "room", walkable: false });
const withGate = (rooms: TestRoom[], pathways: Record<string, unknown>[] = [], hall: TestRoom = HALL) =>
  floor([hall, ...rooms], { entrances: [GATE], pathways: [MAIN, ...pathways] });
/** How far a point is from a rectangle [x0, y0, x1, y1], 0 inside it. */
const fromBox = (p: Vec2, [x0, y0, x1, y1]: number[]) =>
  Math.hypot(Math.max(x0! - p[0], 0, p[0] - x1!), Math.max(y0! - p[1], 0, p[1] - y1!));
const fromLine = (p: Vec2, line: readonly Vec2[]) =>
  Math.min(...line.slice(1).map((b, k) => distancePointToSegment(p, line[k]!, b)));
const byRoom = (made: Connector[], id: string) => made.find(c => c.roomIds[0] === id)!;
const onFloor = (line: readonly Vec2[], r: Raster) => line.slice(1).every((b, k) => clearLine(r, line[k]!, b, 0));

describe("simplifyOnFloor (contract v5 amendment 4)", () => {
  /**
   * Real L1's Commercial & F&B (Central): one 0.25 m row of floor between the
   * restaurant fronts, with the cell a connector may end on one row above its
   * east end. 40 cells is the 9.75 m segment the measurement found off the floor.
   */
  const strip = (): Raster => {
    const cells = new Uint8Array(40 * 3);
    for (let col = 0; col < 40; col++) cells[40 + col] = 1;
    cells[2 * 40 + 39] = 1;
    return { originX: 0, originY: 0, cols: 40, rows: 3, cellM: 0.25, cells };
  };
  /** The run the search walks: every cell of the strip, then the goal cell above its end. */
  const raw: Vec2[] = [...Array(40).keys()].map((col): Vec2 => [0.125 + col * 0.25, 0.375]).concat([[9.875, 0.625]]);

  it("keeps back the corner the plain simplify cuts, since the chord over it leaves the floor", () => {
    const r = strip();
    // Douglas–Peucker drops the corner: it lies 0.25 m off the chord, under the 0.3 m tolerance.
    const plain = simplify(raw, CONNECTOR_SIMPLIFY_M);
    expect(plain).toEqual([[0.125, 0.375], [9.875, 0.625]]);
    expect(onFloor(plain, r)).toBe(false);

    const kept = simplifyOnFloor(raw, r, CONNECTOR_SIMPLIFY_M);
    expect(kept).toEqual([[0.125, 0.375], [9.875, 0.375], [9.875, 0.625]]);
    expect(onFloor(kept, r)).toBe(true);
  });

  it("drops what it can: a straight run comes back as its two ends", () => {
    const r = strip();
    expect(simplifyOnFloor(raw.slice(0, 40), r, CONNECTOR_SIMPLIFY_M)).toEqual([[0.125, 0.375], [9.875, 0.375]]);
  });
});

describe("connectRooms (contract v5)", () => {
  it("runs a connector from the pathway to within 1 m of each shop no pathway passes, one per shop", () => {
    const boxes: Record<string, number[]> = { "L1-shop-a": [5, 12, 11, 18], "L1-shop-b": [25, 12, 31, 18], "L1-shop-c": [45, 12, 51, 18] };
    const model = withGate(Object.entries(boxes).map(([id, b]) => shop(id, b[0]!, b[1]!, b[2]!, b[3]!)));
    const { connectors, islands, left } = connectRooms(model, LEVEL);
    expect(connectors.map(c => c.roomIds).sort()).toEqual([["L1-shop-a"], ["L1-shop-b"], ["L1-shop-c"]]);
    const surface = walkableRaster(model, LEVEL);
    for (const [id, box] of Object.entries(boxes)) {
      const c = byRoom(connectors, id);
      expect(fromBox(c.polyline.at(-1)!, box), id).toBeLessThanOrEqual(1);
      expect(fromLine(c.polyline[0]!, MAIN.polyline), id).toBeLessThan(0.01);
      expect(c.polyline.slice(1).every(p => walkableAt(surface, p)), id).toBe(true);
      // Amendment 4: the segments between the points stay on the floor too, not only the points.
      expect(onFloor(c.polyline, surface), id).toBe(true);
      expect(c.lengthM, id).toBeCloseTo(9.1, 0);
      expect(c.widthM, id).toBeGreaterThanOrEqual(1);
      expect(c.widthM, id).toBeLessThanOrEqual(3);
    }
    expect(islands).toEqual([]);
    expect(left).toBe(0);
  });

  it("skips a shop the connector before it already passes within 3 m of, and names it on that connector", () => {
    // Shop A is nearer, so its connector comes first and ends below it, within 3 m of shop B's corner.
    const { connectors } = connectRooms(withGate([shop("L1-shop-a", 10, 10, 11, 16), shop("L1-shop-b", 11.5, 11, 13, 16)]), LEVEL);
    expect(connectors.map(c => c.roomIds)).toEqual([["L1-shop-a", "L1-shop-b"]]);
  });

  it("connects the nearest room first, whatever the model's order", () => {
    const { connectors } = connectRooms(withGate([
      shop("L1-far", 5, 14, 11, 18), shop("L1-near", 25, 8, 31, 14), shop("L1-mid", 45, 11, 51, 17),
    ]), LEVEL);
    expect(connectors.map(c => c.roomIds[0])).toEqual(["L1-near", "L1-mid", "L1-far"]);
  });

  it(`runs a connector on from the one before when that is nearer, so a room over ${CONNECT_MAX_M} m from the pathway is reached in steps`, () => {
    const tall: TestRoom = { id: "L1-hall", footprint: rect(0, 0, 60, 80) };
    const { connectors, islands } = connectRooms(withGate([shop("L1-first", 20, 30, 24, 34), shop("L1-beyond", 30, 64, 34, 68)], [], tall), LEVEL);
    expect(connectors.map(c => c.roomIds)).toEqual([["L1-first"], ["L1-beyond"]]);
    expect(fromLine(connectors[1]!.polyline[0]!, connectors[0]!.polyline)).toBeLessThan(0.2);
    expect(connectors[1]!.lengthM).toBeLessThanOrEqual(CONNECT_MAX_M);
    expect(islands).toEqual([]);
  });

  it("makes at most the number asked, and says how many are left", () => {
    const model = withGate([shop("L1-shop-a", 5, 12, 11, 18), shop("L1-shop-b", 25, 12, 31, 18), shop("L1-shop-c", 45, 12, 51, 18)]);
    const { connectors, left } = connectRooms(model, LEVEL, 2);
    expect(connectors).toHaveLength(2);
    expect(left).toBe(1);
  });

  it("puts an area 60 m from the network on an island, not a connector, with the straight gap to its floor", () => {
    const { connectors, islands } = connectRooms(withGate([{ id: "L1-far-hall", footprint: rect(0, 62, 20, 70) }]), LEVEL);
    expect(connectors).toEqual([]);
    expect(islands).toHaveLength(1);
    const [island] = islands;
    expect(island!.roomIds).toEqual(["L1-far-hall"]);
    expect(island!.gapM).toBeCloseTo(60.1, 1);
    expect(fromLine(island!.from, MAIN.polyline)).toBeLessThan(0.01);
    expect(fromBox(island!.to, [0, 62, 20, 70])).toBe(0);
  });

  it("gives an island across a wall its straight gap from the network: about 3 m, from the pathway's end over a 2 m wall", () => {
    const { connectors, islands } = connectRooms(withGate([{ id: "L1-east-hall", footprint: rect(62, 0, 70, 20) }]), LEVEL);
    expect(connectors).toEqual([]);
    expect(islands).toHaveLength(1);
    expect(islands[0]!.roomIds).toEqual(["L1-east-hall"]);
    expect(islands[0]!.gapM).toBeCloseTo(3.1, 1);
    expect(islands[0]!.from).toEqual([59, 2]);
    expect(islands[0]!.to[0]).toBeCloseTo(62.13, 1);
  });

  it("groups the rooms on one island, and runs nothing from a pathway no route reaches", () => {
    const island: TestRoom[] = [{ id: "L1-far-hall", footprint: rect(0, 62, 20, 80) }, shop("L1-far-shop", 5, 72, 9, 76)];
    const stranded = { id: "L1-stranded", levelId: LEVEL, polyline: [[2, 64], [18, 64]], widthM: 2 };
    const { connectors, islands } = connectRooms(withGate(island, [stranded]), LEVEL);
    expect(connectors).toEqual([]);
    expect(islands.map(i => i.roomIds)).toEqual([["L1-far-hall", "L1-far-shop"]]);
    expect(fromLine(islands[0]!.from, MAIN.polyline)).toBeLessThan(0.01);
  });

  it(`makes shops standing where no floor is traced one island when they are within ${ISLAND_JOIN_M} m of each other`, () => {
    // Rehearsal 4's L1: most rooms left stand beyond the traced floor; one island per shop came to 86.
    const block = [shop("L1-row-1", 10, 30, 16, 36), shop("L1-row-2", 16, 30, 22, 36), shop("L1-row-3", 23.5, 30, 29, 36)];
    const { connectors, islands } = connectRooms(withGate([...block, shop("L1-apart", 40, 33, 46, 39)]), LEVEL);
    expect(connectors).toEqual([]);
    // Nearest first: the row 28 m off, the shop apart 31 m.
    expect(islands.map(i => i.roomIds)).toEqual([["L1-row-1", "L1-row-2", "L1-row-3"], ["L1-apart"]]);
    expect(islands[0]!.gapM).toBeCloseTo(28, 0);
    expect(islands[0]!.to[1]).toBe(30);
  });

  describe("inside (contract v5 amendment)", () => {
    // Rehearsal 4's L1: Commercial & F&B (North) is a room of kind room traced closed round the shops in it. An old
    // pathway inside it, which nothing reaches, serves the block itself (it passes within 3 m), not the shops.
    const block: TestRoom = { id: "L1-block", nameEn: "Commercial block", footprint: rect(10, 30, 40, 50), kind: "room", walkable: false };
    const shops = [shop("L1-in-1", 12, 38, 18, 46), shop("L1-in-2", 20, 38, 26, 46), shop("L1-in-3", 28, 38, 34, 46)];
    const old = { id: "L1-old", levelId: LEVEL, polyline: [[11, 31], [39, 31]], widthM: 2 };

    it(`names the closed room an island lies inside: three shops in a block, each ${CONTAINER_SHARE * 100}% or more inside it`, () => {
      const { islands } = connectRooms(withGate([block, ...shops], [old]), LEVEL);
      expect(islands).toHaveLength(1);
      expect(islands[0]).toMatchObject({ roomIds: ["L1-in-1", "L1-in-2", "L1-in-3"], inside: { roomId: "L1-block", name: "Commercial block" } });
    });

    it("names the smaller of two containers, one inside the other", () => {
      const outer: TestRoom = { id: "L1-outer", nameEn: "Outer", footprint: rect(5, 28, 50, 55), kind: "room", walkable: false };
      const { islands } = connectRooms(withGate([outer, block, ...shops], [old]), LEVEL);
      expect(islands.map(i => i.inside?.roomId)).toEqual(["L1-block"]);
    });

    it("gives no inside to an island on open floor, or to a lone shop, which is no container of itself", () => {
      const { islands } = connectRooms(withGate([{ id: "L1-far-hall", footprint: rect(0, 62, 20, 80) }, shop("L1-alone", 45, 30, 51, 36)]), LEVEL);
      expect(islands.map(i => i.roomIds)).toEqual([["L1-alone"], ["L1-far-hall"]]);
      for (const island of islands) expect(island).not.toHaveProperty("inside");
    });

    it("joins no room inside a container with one outside it, however near: L1's Commercial & F&B (North) sits by the hawker centre", () => {
      const lastInside = shop("L1-in-4", 35, 38, 39.5, 46);
      const justOutside = shop("L1-next", 40.5, 38, 45, 46);
      const { islands } = connectRooms(withGate([block, ...shops, lastInside, justOutside], [old]), LEVEL);
      expect(islands.map(i => [i.roomIds, i.inside?.roomId])).toEqual([
        [["L1-in-1", "L1-in-2", "L1-in-3", "L1-in-4"], "L1-block"],
        [["L1-next"], undefined],
      ]);
    });

    it("keeps a shop inside a container off the island of the floor outside it, though the shop's 1 m reaches that floor", () => {
      // L1: rooms on Commercial & F&B (North)'s edge reach floor outside it, which put them on the hawker group's island.
      const yard: TestRoom = { id: "L1-yard", footprint: rect(0, 62, 20, 80) };
      const block2: TestRoom = { id: "L1-block2", nameEn: "Block two", footprint: rect(20, 62, 40, 80), kind: "room", walkable: false };
      const old2 = { id: "L1-old2", levelId: LEVEL, polyline: [[21, 63], [39, 63]], widthM: 2 };
      const { islands } = connectRooms(withGate([yard, block2, shop("L1-in-a", 20.5, 68, 26, 74), shop("L1-in-b", 28, 68, 34, 74)], [old2]), LEVEL);
      expect(islands.map(i => [i.roomIds, i.inside?.roomId])).toEqual([
        [["L1-in-a", "L1-in-b"], "L1-block2"],
        [["L1-yard"], undefined],
      ]);
    });

    it(`counts a shop straddling the container's wall, under ${CONTAINER_SHARE * 100}% inside it, as outside: an island of its own, inside nothing`, () => {
      const straddling = shop("L1-straddle", 36, 38, 46, 46);
      const { islands } = connectRooms(withGate([block, ...shops, straddling], [old]), LEVEL);
      expect(islands.map(i => [i.roomIds, i.inside?.roomId])).toEqual([
        [["L1-in-1", "L1-in-2", "L1-in-3"], "L1-block"],
        [["L1-straddle"], undefined],
      ]);
    });
  });

  it("leaves a fallback-goal room to the islands rather than naming it on a connector that never reaches it (contract v5 amendment 4)", () => {
    // An area with no walkable cell inside it: four smaller voids tiled over it, so the raster blocks all of it
    // (the smaller room wins). Its goals fall back to the 1 m band outside its outline, where a run cannot
    // enter it — and area.unreachable asks for a run that does.
    const area: TestRoom = { id: "L1-void-area", footprint: rect(30, 10, 34, 14) };
    const tiles: TestRoom[] = [[30, 10], [32, 10], [30, 12], [32, 12]].map(([x, y], k) =>
      ({ id: `L1-tile-${k}`, footprint: rect(x!, y!, x! + 2, y! + 2), kind: "void", walkable: false }));
    const { connectors, islands } = connectRooms(withGate([area, ...tiles]), LEVEL);
    expect(connectors).toEqual([]);
    expect(islands.map(i => i.roomIds)).toEqual([["L1-void-area"]]);
  });

  it("measures an island that has walkable floor to that floor, though a shop on it with no floor beside it is nearer", () => {
    // The shop is 28 m off and 1.5 m from the far hall: one island. A bridge to its floor lets connect_rooms reach the rest.
    const { islands } = connectRooms(withGate([{ id: "L1-far-hall", footprint: rect(0, 62, 20, 80) }, shop("L1-between", 5, 30, 9, 60.5)]), LEVEL);
    expect(islands.map(i => i.roomIds)).toEqual([["L1-between", "L1-far-hall"]]);
    expect(islands[0]!.gapM).toBeCloseTo(60.1, 1);
    expect(fromBox(islands[0]!.to, [0, 62, 20, 80])).toBe(0);
  });

  it("reaches only the rooms check_floor lists: a shop a pathway passes within 3 m of, or one on another floor, is left alone", () => {
    const served = shop("L1-served", 25, 4.5, 31, 10);
    const upstairs: TestRoom = { ...shop("L2-shop", 25, 12, 31, 18), levelId: "oth-L2" };
    expect(connectRooms(withGate([served, upstairs]), LEVEL)).toEqual({ connectors: [], islands: [], left: 0 });
  });

  it("refuses a floor with rooms to reach but no pathway an entrance or a stop reaches", () => {
    const model = floor([HALL, shop("L1-shop-a", 5, 12, 11, 18)], { pathways: [MAIN] });
    expect(() => connectRooms(model, LEVEL)).toThrow(CannotConnect);
  });
});
