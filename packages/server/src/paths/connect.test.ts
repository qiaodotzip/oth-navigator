import type { Vec2 } from "@oth/model";
import { describe, expect, it } from "vitest";
import { connect, linkTargets, REASONS, type Target } from "./connect";
import { walkableRaster } from "./raster";
import { doorway, floor, LEVEL, rect } from "./testing";

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
