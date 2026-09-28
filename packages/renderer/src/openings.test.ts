import {
  DoorwaySchema, PathwaySchema, RoomSchema, type Doorway, type Pathway, type Room, type RoomKind,
} from "@oth/model";
import { describe, expect, it } from "vitest";
import type { Interval } from "./intervals";
import {
  MAX_PATH_OPENING_M, areaFacing, doorwayOpenings, isWalkableArea, pathwayOpenings, shopfrontOpening, wallRuns,
} from "./openings";
import type { WallPiece } from "./wallPlan";

let n = 0;
const path = (polyline: Array<[number, number]>, widthM = 2): Pathway =>
  PathwaySchema.parse({ id: `p${n++}`, levelId: "oth-L1", polyline, widthM });
const door = (segment: [[number, number], [number, number]], widthM: number): Doorway =>
  DoorwaySchema.parse({ id: `d${n++}`, levelId: "oth-L1", roomA: "L1-shop", roomB: "L1-hall", segment, widthM });
const sq = (x0: number, y0: number, x1: number, y1: number): Array<[number, number]> =>
  [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
/** A concourse by default: an area people walk across. */
const space = (footprint: Array<[number, number]>, kind: RoomKind = "area", walkable = true): Room =>
  RoomSchema.parse({ id: `a${n++}`, levelId: "oth-L1", kind, footprint, heightM: 6, walkable });
/** A walled room, passed in with the areas as Task 4 will: its footprint says which side of its wall is outside. */
const walled = (id: string, footprint: Array<[number, number]>): Room =>
  RoomSchema.parse({ id, levelId: "oth-L1", kind: "room", footprint, heightM: 6, walkable: false });
/** The shop behind `front` and the `shop()` pieces below. */
const theShop = walled("L1-shop", sq(0, 0, 6, 4));
/** An area whose edge nearest the shop's front runs `degrees` off it, from 0.5 m out at x = 0 across to x = 6. */
const slanted = (degrees: number): Room => {
  const drop = 6 * Math.tan((degrees * Math.PI) / 180);
  return space([[0, -0.5], [6, -0.5 - drop], [6, -12], [0, -12]]);
};
/** A walled room's outline as wall pieces of its own, one per side. */
const wallsOf = (id: string, corners: Array<[number, number]>): WallPiece[] =>
  corners.map((a, k) => ({ a, b: corners[(k + 1) % corners.length]!, thicknessM: 0.15, rooms: [id] }));

/** Rounded, so a crossing computed as 2.9999999999999996 reads as 3. The + 0 turns -0 into 0. */
const r6 = (x: number) => Math.round(x * 1e6) / 1e6 + 0;
const tidy = (xs: Interval[]) => xs.map(([a, b]) => [r6(a), r6(b)]);

/** A shop's 6 m front along y = 0; the shop is to the north. */
const front: WallPiece = { a: [0, 0], b: [6, 0], thicknessM: 0.15, rooms: ["L1-shop"] };

describe("pathwayOpenings", () => {
  it("opens the wall where a pathway crosses it, as wide as the pathway", () => {
    expect(tidy(pathwayOpenings(front, [path([[3, -5], [3, 5]], 2)]))).toEqual([[2, 4]]);
  });

  it("opens at most 3 m, however wide the pathway", () => {
    const [[from, to]] = pathwayOpenings(front, [path([[3, -5], [3, 5]], 8)]) as [Interval];
    expect(to - from).toBeCloseTo(MAX_PATH_OPENING_M);
  });

  it("still opens for a pathway that stops just short of the wall", () => {
    expect(pathwayOpenings(front, [path([[3, -5], [3, -0.3]])])).toHaveLength(1);
  });

  it("does not open for a pathway that stops a metre short", () => {
    expect(pathwayOpenings(front, [path([[3, -5], [3, -1]])])).toEqual([]);
  });

  it("opens nothing for a pathway running along the wall", () => {
    expect(pathwayOpenings(front, [path([[-2, 0], [8, 0]])])).toEqual([]);
  });

  it("finds the crossing on a pathway that meets the wall at an angle", () => {
    const [[from, to]] = pathwayOpenings(front, [path([[0, -3], [6, 3]], 2)]) as [Interval];
    expect((from + to) / 2).toBeCloseTo(3);
  });

  it("opens for a pathway crossing at the wall's very end, where the quick box test is at its edge", () => {
    expect(tidy(pathwayOpenings(front, [path([[6, -5], [6, 5]], 2)]))).toEqual([[5, 7]]);
  });
});

describe("doorwayOpenings", () => {
  it("opens the wall along a doorway that lies on it", () => {
    expect(tidy(doorwayOpenings(front, [door([[1, 0], [2.5, 0]], 1.5)]))).toEqual([[1, 2.5]]);
  });

  it("widens a doorway drawn shorter than its width, about its middle", () => {
    expect(tidy(doorwayOpenings(front, [door([[3, 0.1], [3.5, 0.1]], 2)]))).toEqual([[2.25, 4.25]]);
  });

  it("ignores a doorway a metre off the wall", () => {
    expect(doorwayOpenings(front, [door([[1, 1], [2, 1]], 1)])).toEqual([]);
  });

  it("ignores a doorway on the same line but past the wall's end", () => {
    expect(doorwayOpenings(front, [door([[8, 0], [9, 0]], 1)])).toEqual([]);
  });
});

describe("shopfrontOpening", () => {
  it("faces a pathway passing within 3 m, centred where it runs alongside", () => {
    const opening = shopfrontOpening(front, [path([[-10, -2], [20, -2]], 2)]);
    expect(opening?.distance).toBeCloseTo(2);
    expect(tidy([opening!.interval])).toEqual([[2, 4]]);
  });

  it("slides back inside the wall rather than hang off its end", () => {
    const opening = shopfrontOpening(front, [path([[8, -1], [20, -1]], 2)]);
    expect(tidy([opening!.interval])).toEqual([[4, 6]]);
  });

  it("is no wider than the wall", () => {
    const kiosk: WallPiece = { a: [0, 0], b: [1.5, 0], thicknessM: 0.15, rooms: ["L1-kiosk"] };
    expect(tidy([shopfrontOpening(kiosk, [path([[-10, -1], [10, -1]], 2.4)])!.interval])).toEqual([[0, 1.5]]);
  });

  it("offers nothing for a pathway more than 3 m away", () => {
    expect(shopfrontOpening(front, [path([[-10, -4], [20, -4]], 2)])).toBeNull();
  });
});

describe("isWalkableArea", () => {
  it("takes an area people walk across", () => {
    expect(isWalkableArea(space(sq(0, 0, 10, 10)))).toBe(true);
  });

  it("takes neither a room marked walkable, which is walled, nor an area marked not walkable", () => {
    expect(isWalkableArea(space(sq(0, 0, 10, 10), "room", true))).toBe(false);
    expect(isWalkableArea(space(sq(0, 0, 10, 10), "area", false))).toBe(false);
  });
});

describe("areaFacing", () => {
  it("finds the stretch of a wall that an area's edge runs along", () => {
    expect(tidy(areaFacing(front, [theShop, space(sq(-2, -10, 4, 0))]))).toEqual([[0, 4]]);
  });

  it("counts an area across a gap of up to 0.5 m", () => {
    expect(tidy(areaFacing(front, [theShop, space(sq(-10, -10, 20, -0.4))]))).toEqual([[0, 6]]);
  });

  it("counts an area up to 6 m out in front", () => {
    expect(tidy(areaFacing(front, [theShop, space(sq(-10, -10, 20, -5.5))]))).toEqual([[0, 6]]);
  });

  it("does not count an area more than 6 m off", () => {
    expect(areaFacing(front, [theShop, space(sq(-10, -20, 20, -6.5))])).toEqual([]);
  });

  it("does not look back through the room at an area behind it", () => {
    expect(areaFacing(front, [theShop, space(sq(-10, 5, 20, 10))])).toEqual([]);
  });

  it("joins two areas that meet along the wall into one stretch", () => {
    expect(tidy(areaFacing(front, [theShop, space(sq(-10, -10, 2, 0)), space(sq(2, -10, 20, 0))]))).toEqual([[0, 6]]);
  });

  it("ignores a neighbour that is not a walkable area", () => {
    expect(areaFacing(front, [theShop, space(sq(-10, -10, 20, 0), "room")])).toEqual([]);
  });

  it("finds a wall that stands inside an area, traced without a hole round the room", () => {
    expect(tidy(areaFacing(front, [theShop, space(sq(-10, -10, 20, 20))]))).toEqual([[0, 6]]);
  });

  it("finds nothing for a wall whose room it is not given, since it cannot tell which side is outside", () => {
    expect(areaFacing(front, [space(sq(-10, -10, 20, 0))])).toEqual([]);
  });
});

describe("wallRuns", () => {
  const shop = (): WallPiece[] => [
    { a: [0, 0], b: [6, 0], thicknessM: 0.15, rooms: ["L1-shop"] },
    { a: [6, 0], b: [6, 4], thicknessM: 0.15, rooms: ["L1-shop", "L1-next"] },
    { a: [6, 4], b: [0, 4], thicknessM: 0.15, rooms: ["L1-shop"] },
    { a: [0, 4], b: [0, 0], thicknessM: 0.15, rooms: ["L1-shop"] },
  ];
  const onFront = (runs: WallPiece[]) =>
    runs.filter(r => r.a[1] === 0 && r.b[1] === 0).map(r => [r6(r.a[0]), r6(r.b[0])]);

  it("leaves a gap where a pathway goes in, and walls the rest", () => {
    const runs = wallRuns(shop(), [path([[3, -5], [3, 2]], 2)], [], []);
    expect(onFront(runs)).toEqual([[0, 2], [4, 6]]);
    expect(runs).toHaveLength(5);
  });

  it("gives a shop a front door onto a pathway that passes it without going in", () => {
    const runs = wallRuns(shop(), [path([[-10, -2], [20, -2]], 2)], [], []);
    expect(onFront(runs)).toEqual([[0, 2], [4, 6]]);
  });

  it("never puts the front door on a wall shared with the shop next door", () => {
    // The pathway passes just east of the shared wall, nearer it than the front.
    const runs = wallRuns(shop(), [path([[7, -10], [7, 10]], 2)], [], []);
    const between = runs.filter(r => r.rooms.length === 2);
    expect(between).toHaveLength(1);
    expect(between[0]!.a).toEqual([6, 0]);
    expect(between[0]!.b).toEqual([6, 4]);
    expect(onFront(runs)).toEqual([[0, 4]]);
  });

  it("between pathways equally near, takes the same door whatever order the walls come in", () => {
    // The pathway 1 m east of the shared wall is as near the front's east end as the back's.
    for (const pieces of [shop(), [...shop()].reverse()]) {
      expect(onFront(wallRuns(pieces, [path([[7, -10], [7, 10]], 2)], [], []))).toEqual([[0, 4]]);
    }
  });

  it("adds no front door to a room a pathway already goes into", () => {
    const runs = wallRuns(shop(), [path([[3, -5], [3, 2]], 2), path([[-10, 6], [20, 6]], 2)], [], []);
    // The second pathway passes 2 m behind the shop; the back wall stays whole.
    expect(runs.filter(r => r.a[1] === 4 && r.b[1] === 4)).toHaveLength(1);
  });

  it("leaves a room no pathway comes near closed", () => {
    expect(wallRuns(shop(), [path([[-10, -9], [20, -9]], 2)], [], [])).toHaveLength(4);
  });

  it("opens a wall along a doorway", () => {
    const runs = wallRuns(shop(), [], [door([[1, 0], [2.5, 0]], 1.5)], []);
    expect(onFront(runs)).toEqual([[0, 1], [2.5, 6]]);
  });

  it("drops a wall entirely when its opening is wider than it", () => {
    const stub: WallPiece = { a: [0, 0], b: [1, 0], thicknessM: 0.15, rooms: ["L1-kiosk"] };
    expect(wallRuns([stub], [path([[0.5, -3], [0.5, 3]], 2.4)], [], [])).toEqual([]);
  });

  it("clamps an opening near a wall's end", () => {
    const wall: WallPiece = { a: [0, 0], b: [4, 0], thicknessM: 0.15, rooms: ["L1-kiosk"] };
    const runs = wallRuns([wall], [path([[0.5, -3], [0.5, 3]], 2.4)], [], []);
    expect(runs).toHaveLength(1);
    expect(runs[0]!.a[0]).toBeCloseTo(1.7);
    expect(runs[0]!.b[0]).toBeCloseTo(4);
  });

  describe("with no pathway near, a front door onto the area the room faces", () => {
    const onWest = (runs: WallPiece[]) => runs.filter(r => r.a[0] === 0 && r.b[0] === 0);

    it("opens a shop facing a concourse, 3 m wide and centred on the wall", () => {
      const runs = wallRuns(shop(), [], [], [theShop, space(sq(-10, -10, 20, 0))]);
      expect(onFront(runs)).toEqual([[0, 1.5], [4.5, 6]]);
      expect(runs).toHaveLength(5);
    });

    it("reaches across up to 6 m of floor to an area in front", () => {
      const runs = wallRuns(shop(), [], [], [theShop, space(sq(-10, -10, 20, -5.5))]);
      expect(onFront(runs)).toEqual([[0, 1.5], [4.5, 6]]);
    });

    it("faces an area whose edge runs 40° off the wall", () => {
      const runs = wallRuns(shop(), [], [], [theShop, slanted(40)]);
      expect(onFront(runs)).toEqual([[0, 1.5], [4.5, 6]]);
    });

    it("does not face an area whose edge runs 50° off the wall", () => {
      expect(wallRuns(shop(), [], [], [theShop, slanted(50)])).toEqual(shop());
    });

    it("cuts no door through less than 0.9 m of wall that faces an area", () => {
      // Only 0.8 m of the front has the area in front of it: a slot, not a door.
      expect(wallRuns(shop(), [], [], [theShop, space(sq(-10, -10, 0.8, 0))])).toEqual(shop());
    });

    it("opens onto the nearest area, even along a shorter stretch", () => {
      // An area 1 m off the west wall, and one 4 m off the longer front.
      const runs = wallRuns(shop(), [], [], [theShop, space(sq(-10, 0, -1, 4)), space(sq(-10, -10, 20, -4))]);
      expect(onFront(runs)).toEqual([[0, 6]]);
      expect(onWest(runs).map(r => [r6(r.a[1]), r6(r.b[1])])).toEqual([[4, 3.5], [0.5, 0]]);
    });

    it("between areas equally near, puts it on the longest stretch", () => {
      // 3 m of the west wall faces one area and 5 m of the front faces another.
      const runs = wallRuns(shop(), [], [], [theShop, space(sq(-10, 1, 0, 4)), space(sq(1, -10, 20, 0))]);
      expect(onFront(runs)).toEqual([[0, 2], [5, 6]]);
      expect(onWest(runs)).toHaveLength(1);
    });

    it("makes it no wider than the stretch that faces the area", () => {
      expect(onFront(wallRuns(shop(), [], [], [theShop, space(sq(-10, -10, 2, 0))]))).toEqual([[2, 6]]);
    });

    it("counts areas within 0.1 m of each other as equally near, and takes the longer stretch", () => {
      // 1 m off 4 m of the west wall, and 1.05 m off the 6 m front.
      const runs = wallRuns(shop(), [], [], [theShop, space(sq(-10, 0, -1, 4)), space(sq(-10, -10, 20, -1.05))]);
      expect(onFront(runs)).toEqual([[0, 1.5], [4.5, 6]]);
      expect(onWest(runs)).toHaveLength(1);
    });

    it("breaks a tie by the door's centre, west first then south, whatever order the walls come in", () => {
      // Areas 1 m off the front and 1 m off the back: equally near, and equally long.
      const areas = [theShop, space(sq(-10, -10, 20, -1)), space(sq(-10, 5, 20, 10))];
      for (const pieces of [shop(), [...shop()].reverse()]) {
        const runs = wallRuns(pieces, [], [], areas);
        expect(onFront(runs)).toEqual([[0, 1.5], [4.5, 6]]);
        expect(runs.filter(r => r.a[1] === 4 && r.b[1] === 4)).toHaveLength(1);
      }
    });

    describe("where tracing leaves the wall hard to read", () => {
      it("opens a shop standing inside a concourse traced without a hole round it", () => {
        // Front and back both stand in the concourse and are 6 m long: the more southerly, the front, opens.
        const runs = wallRuns(shop(), [], [], [theShop, space(sq(-10, -10, 20, 20))]);
        expect(onFront(runs)).toEqual([[0, 1.5], [4.5, 6]]);
        expect(runs).toHaveLength(5);
      });

      it("opens a shop that an area overlaps by 2 m", () => {
        const runs = wallRuns(shop(), [], [], [theShop, space(sq(-10, -10, 20, 2))]);
        expect(onFront(runs)).toEqual([[0, 1.5], [4.5, 6]]);
        expect(onWest(runs)).toHaveLength(1);
      });

      it("looks at the part of the area in front of the door, not a lobe beside it behind a service room", () => {
        // The concourse lies 5 m out. A lobe of it comes within 4.5 m of the door's
        // centre, off to the west, with a service room standing in between.
        const concourse = space([[-10, -10], [20, -10], [20, -5], [-1.5, -5], [-1.5, -0.5], [-4, -0.5], [-4, -5], [-10, -5]]);
        const service = sq(-1.3, -2, -0.7, 1);
        const runs = wallRuns([...shop(), ...wallsOf("L1-service", service)], [], [],
          [theShop, walled("L1-service", service), concourse]);
        expect(onFront(runs.filter(r => r.rooms.includes("L1-shop")))).toEqual([[0, 1.5], [4.5, 6]]);
      });

      it("cuts one door across a front traced as 0.75 m segments", () => {
        const segmented: WallPiece[] = [
          ...Array.from({ length: 8 }, (_, k): WallPiece =>
            ({ a: [0.75 * k, 0], b: [0.75 * (k + 1), 0], thicknessM: 0.15, rooms: ["L1-shop"] })),
          ...shop().slice(1),
        ];
        const runs = wallRuns(segmented, [], [], [theShop, space(sq(-10, -10, 20, 0))]);
        expect(onFront(runs)).toEqual([[0, 0.75], [0.75, 1.5], [4.5, 5.25], [5.25, 6]]);
      });

      it("opens one whole side of a round kiosk standing in a concourse", () => {
        // 16 sides, 3 m to each corner, so each side is 1.17 m. Its sides turn
        // 22.5° at each corner, too much to run on as one frontage.
        const corners = Array.from({ length: 16 }, (_, k): [number, number] =>
          [3 * Math.cos((k * Math.PI) / 8), 3 * Math.sin((k * Math.PI) / 8)]);
        const kiosk = wallsOf("L1-kiosk", corners);
        const runs = wallRuns(kiosk, [], [], [walled("L1-kiosk", corners), space(sq(-10, -10, 10, 10))]);
        // All 16 stand in the concourse and are as long as each other: the west-then-southmost opens.
        expect(runs).toHaveLength(15);
        expect(kiosk.filter(p => !runs.some(r => r.a[0] === p.a[0] && r.a[1] === p.a[1]))).toEqual([kiosk[8]]);
      });
    });

    describe("with a neighbour standing between it and the area", () => {
      // A kiosk 4 m by 2 m stands between the shop's front and a concourse 4 m out.
      const kiosk: WallPiece[] = [
        { a: [1, -3], b: [5, -3], thicknessM: 0.15, rooms: ["L1-kiosk"] },
        { a: [5, -3], b: [5, -1], thicknessM: 0.15, rooms: ["L1-kiosk"] },
        { a: [5, -1], b: [1, -1], thicknessM: 0.15, rooms: ["L1-kiosk"] },
        { a: [1, -1], b: [1, -3], thicknessM: 0.15, rooms: ["L1-kiosk"] },
      ];
      const rooms = [theShop, walled("L1-kiosk", sq(1, -3, 5, -1)), space(sq(-10, -10, 20, -4))];
      const ofShop = (runs: WallPiece[]) => runs.filter(r => r.rooms.includes("L1-shop"));

      it("stays closed when the kiosk stands between it and the only area it faces", () => {
        expect(ofShop(wallRuns([...shop(), ...kiosk], [], [], rooms))).toEqual(shop());
      });

      it("opens onto the next-nearest area instead, when nothing stands between", () => {
        // A second area 5 m off the west wall: farther than the concourse, but in clear view.
        const runs = ofShop(wallRuns([...shop(), ...kiosk], [], [], [...rooms, space(sq(-10, 0, -5, 4))]));
        expect(onFront(runs)).toEqual([[0, 6]]);
        expect(onWest(runs).map(r => [r6(r.a[1]), r6(r.b[1])])).toEqual([[4, 3.5], [0.5, 0]]);
      });
    });

    it("never looks back through the room at an area behind it", () => {
      // The back wall, which faces the area, is shared with the room behind.
      const backed = shop().map(p => (p.a[1] === 4 && p.b[1] === 4 ? { ...p, rooms: ["L1-shop", "L1-back"] } : p));
      expect(wallRuns(backed, [], [], [theShop, space(sq(-10, 5, 20, 10))])).toEqual(backed);
    });

    describe("a shop between two shops", () => {
      const row = (): WallPiece[] => [
        { a: [0, 0], b: [6, 0], thicknessM: 0.15, rooms: ["L1-a"] },
        { a: [6, 0], b: [6, 4], thicknessM: 0.15, rooms: ["L1-a", "L1-b"] },
        { a: [6, 4], b: [0, 4], thicknessM: 0.15, rooms: ["L1-a"] },
        { a: [0, 4], b: [0, 0], thicknessM: 0.15, rooms: ["L1-a"] },
        { a: [6, 0], b: [12, 0], thicknessM: 0.15, rooms: ["L1-b"] },
        { a: [12, 0], b: [12, 4], thicknessM: 0.15, rooms: ["L1-b", "L1-c"] },
        { a: [12, 4], b: [6, 4], thicknessM: 0.15, rooms: ["L1-b"] },
        { a: [12, 0], b: [18, 0], thicknessM: 0.15, rooms: ["L1-c"] },
        { a: [18, 0], b: [18, 4], thicknessM: 0.15, rooms: ["L1-c"] },
        { a: [18, 4], b: [12, 4], thicknessM: 0.15, rooms: ["L1-c"] },
      ];
      const of = (runs: WallPiece[], id: string) => runs.filter(r => r.rooms.includes(id));
      const shops = [walled("L1-a", sq(0, 0, 6, 4)), walled("L1-b", sq(6, 0, 12, 4)), walled("L1-c", sq(12, 0, 18, 4))];

      it("opens onto the concourse in front of it, and never into either neighbour", () => {
        const runs = wallRuns(row(), [], [], [...shops, space(sq(-10, -10, 28, 0))]);
        expect(onFront(of(runs, "L1-b"))).toEqual([[6, 7.5], [10.5, 12]]);
        // Both shared walls stand whole: B keeps them, its two-part front and its back.
        expect(runs.filter(r => r.rooms.length === 2)).toHaveLength(2);
        expect(of(runs, "L1-b")).toHaveLength(5);
      });

      it("stays closed when only its neighbours face an area", () => {
        const runs = wallRuns(row(), [], [], [...shops, space(sq(-10, -10, 0, 10)), space(sq(18, -10, 28, 10))]);
        expect(of(runs, "L1-b")).toEqual(row().filter(p => p.rooms.includes("L1-b")));
        // Each neighbour opens its own outer wall instead.
        expect(of(runs, "L1-a")).toHaveLength(5);
        expect(of(runs, "L1-c")).toHaveLength(5);
      });
    });

    it("adds no second door to a shop a pathway already goes into", () => {
      const areas = [theShop, space(sq(-10, -10, 20, 0)), space(sq(-10, 4, 20, 10))];
      const runs = wallRuns(shop(), [path([[3, -5], [3, 2]], 2)], [], areas);
      expect(onFront(runs)).toEqual([[0, 2], [4, 6]]);
      expect(runs.filter(r => r.a[1] === 4 && r.b[1] === 4)).toHaveLength(1);
    });

    it("gives way to a pathway passing within 3 m", () => {
      // The pathway passes 2 m behind the shop; the concourse is in front.
      const runs = wallRuns(shop(), [path([[-10, 6], [20, 6]], 2)], [], [theShop, space(sq(-10, -10, 20, 0))]);
      expect(onFront(runs)).toEqual([[0, 6]]);
      expect(runs.filter(r => r.a[1] === 4 && r.b[1] === 4)).toHaveLength(2);
    });

    it("leaves a room with neither a pathway within 3 m nor an area within 6 m closed", () => {
      const runs = wallRuns(shop(), [path([[-10, -9], [20, -9]], 2)], [], [theShop, space(sq(-10, -20, 20, -6.5))]);
      expect(runs).toHaveLength(4);
    });
  });
});
