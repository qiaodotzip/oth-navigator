import { bboxOfRing, parseModel, type OrientedRect } from "@oth/model";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_SHAFT_M, RISER_M, flightSteps, nextStopAbove, portalParts, risesTowardPositive, shaftBlocks,
} from "./portals";

const DELETED = "2026-09-28T00:00:00.000Z";
const sq = (x0: number, y0: number, x1: number, y1: number) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const level = (n: number, elevationM: number, heightM: number) => ({
  id: `oth-L${n}`, buildingId: "oth", code: `L${n}`, ordinal: n, nameEn: `L${n}`, nameZh: `${n}楼`, elevationM, heightM,
});
const building = { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 };
const halls = [1, 2, 3].map(n => ({
  id: `L${n}-hall`, levelId: `oth-L${n}`, kind: "area", footprint: sq(0, 0, 40, 20), heightM: 5, walkable: true,
}));
const stop = (id: string, portalId: string, n: number, point: [number, number], extra: Record<string, unknown> = {}) =>
  ({ id, portalId, levelId: `oth-L${n}`, roomId: `L${n}-hall`, point, ...extra });

const model = parseModel({
  building,
  levels: [level(1, 0, 6), level(2, 6, 5), level(3, 11, 5)],
  rooms: halls,
  portals: [
    { id: "lift-a", kind: "lift" },
    { id: "esc-1", kind: "escalator" },
    { id: "stair-1", kind: "stair" },
    { id: "esc-bare", kind: "escalator" },
    { id: "esc-cut", kind: "escalator" },
  ],
  portalEndpoints: [
    stop("lift-a-1", "lift-a", 1, [30, 10]),
    stop("lift-a-2", "lift-a", 2, [30, 10], { footprint: sq(29, 9, 32, 11) }),
    stop("esc-1-1", "esc-1", 1, [5, 2], { footprint: sq(4, 0, 6, 10) }),
    stop("esc-1-2", "esc-1", 2, [5, 9]),
    stop("stair-1-1", "stair-1", 1, [15, 4], { footprint: sq(14, 0, 16, 8) }),
    stop("stair-1-2", "stair-1", 2, [15, 4]),
    stop("stair-1-3", "stair-1", 3, [15, 4], { footprint: sq(14, 0, 16, 8) }),
    stop("esc-bare-1", "esc-bare", 1, [25, 5]),
    stop("esc-bare-2", "esc-bare", 2, [25, 5]),
    stop("esc-cut-1", "esc-cut", 1, [35, 5], { footprint: sq(34, 0, 36, 10) }),
    stop("esc-cut-2", "esc-cut", 2, [35, 5], { deletedAt: DELETED }),
  ],
});
const upright: OrientedRect = { centre: [0, 5], axis: [0, 1], halfLength: 5, halfWidth: 0.6 };
const middle = (s: { a: readonly number[]; b: readonly number[] }) => (s.a[1]! + s.b[1]!) / 2;

describe("flightSteps", () => {
  it("climbs the whole rise in risers of about 17 cm", () => {
    const steps = flightSteps(upright, 6, true);
    expect(steps).toHaveLength(Math.ceil(6 / RISER_M));
    expect(steps.at(-1)!.topM).toBeCloseTo(6);
    expect(steps[0]!.topM).toBeCloseTo(6 / steps.length);
  });

  it("rises toward the end it is asked to", () => {
    const up = flightSteps(upright, 6, true);
    expect(middle(up.at(-1)!)).toBeGreaterThan(middle(up[0]!));
    const down = flightSteps(upright, 6, false);
    expect(middle(down.at(-1)!)).toBeLessThan(middle(down[0]!));
  });

  it("keeps every step inside the outline", () => {
    for (const s of flightSteps(upright, 6, true)) {
      for (const p of [s.a, s.b]) {
        expect(Math.abs(p[0])).toBeLessThanOrEqual(0.6 + 1e-9);
        expect(p[1]).toBeGreaterThanOrEqual(0);
        expect(p[1]).toBeLessThanOrEqual(10);
      }
    }
  });
});

describe("risesTowardPositive", () => {
  it("rises toward the end nearer the upper stop", () => {
    expect(risesTowardPositive(upright, [0, 12], false)).toBe(true);
    expect(risesTowardPositive(upright, [0, -3], false)).toBe(false);
  });

  it("rises toward the axis's end when the upper stop sits in the middle", () => {
    expect(risesTowardPositive(upright, [0, 5], false)).toBe(true);
  });

  it("turns round when flipped", () => {
    expect(risesTowardPositive(upright, [0, 12], true)).toBe(false);
  });
});

describe("portalParts", () => {
  it("stands a lift's shaft at every stop, a storey tall, as a 2.4 m square without an outline", () => {
    const [l1] = portalParts(model, "oth-L1").shafts;
    expect(l1!.heightM).toBe(6);
    const b = bboxOfRing(l1!.ring);
    expect(b.maxX - b.minX).toBeCloseTo(DEFAULT_SHAFT_M);
    expect((b.minX + b.maxX) / 2).toBeCloseTo(30);
    const [l2] = portalParts(model, "oth-L2").shafts;
    expect(l2!.heightM).toBe(5);
    expect(l2!.ring).toEqual(sq(29, 9, 32, 11));
  });

  it("walls a shaft on every side", () => {
    const [shaft] = portalParts(model, "oth-L1").shafts;
    const blocks = shaftBlocks(shaft!);
    expect(blocks).toHaveLength(4);
    expect(blocks.every(b => b.baseM === 0 && b.topM === 6)).toBe(true);
  });

  it("builds an escalator's flight on its lower floor, climbing to the next, toward the upper stop", () => {
    const flight = portalParts(model, "oth-L1").flights.find(f => f.portalId === "esc-1")!;
    expect(flight.kind).toBe("escalator");
    expect(flight.steps.at(-1)!.topM).toBeCloseTo(6);
    expect(middle(flight.steps.at(-1)!)).toBeGreaterThan(5);
    expect(portalParts(model, "oth-L2").flights.some(f => f.portalId === "esc-1")).toBe(false);
  });

  it("takes a flight's outline from the upper stop when the lower has none", () => {
    const flight = portalParts(model, "oth-L2").flights.find(f => f.portalId === "stair-1")!;
    expect(flight.steps.at(-1)!.topM).toBeCloseTo(5);
  });

  it("builds no flight for an escalator with no outline at either stop", () => {
    expect(portalParts(model, "oth-L1").flights.some(f => f.portalId === "esc-bare")).toBe(false);
  });

  it("builds no flight to a deleted stop", () => {
    expect(portalParts(model, "oth-L1").flights.some(f => f.portalId === "esc-cut")).toBe(false);
  });

  it("builds no flight between floors at the same elevation, and does not fail", () => {
    const flat = parseModel({
      building,
      levels: [level(1, 0, 6), level(2, 0, 5)],
      rooms: halls.slice(0, 2),
      portals: [{ id: "esc-1", kind: "escalator" }],
      portalEndpoints: [
        stop("esc-1-1", "esc-1", 1, [5, 2], { footprint: sq(4, 0, 6, 10) }),
        stop("esc-1-2", "esc-1", 2, [5, 9]),
      ],
    });
    expect(portalParts(flat, "oth-L1").flights).toEqual([]);
  });
});

describe("nextStopAbove", () => {
  it("finds the next stop up, and none above the top", () => {
    const stops = model.portalEndpoints;
    expect(nextStopAbove(model, stops.find(s => s.id === "stair-1-1")!)?.id).toBe("stair-1-2");
    expect(nextStopAbove(model, stops.find(s => s.id === "stair-1-3")!)).toBeNull();
  });
});
