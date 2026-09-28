import { describe, expect, it } from "vitest";
import { REASONS } from "./connect";
import { MAX_WIDTH_M, MIN_WIDTH_M, suggestPaths } from "./suggest";
import { doorway, floor, LEVEL, rect, type Pt, type TestRoom } from "./testing";

const suggest = (rooms: TestRoom[], extra: Record<string, unknown> = {}) => suggestPaths(floor(rooms, extra), LEVEL);

describe("suggestPaths on the spec's shapes (§11)", () => {
  it("gives a straight corridor one straight line down its middle, as wide as the corridor", () => {
    const { lines } = suggest([{ footprint: rect(0, 0, 20, 4) }]);
    expect(lines).toHaveLength(1);
    const [line] = lines;
    expect(line!.polyline).toHaveLength(2);
    for (const [, y] of line!.polyline) expect(Math.abs(y - 2)).toBeLessThan(0.2);
    const xs = line!.polyline.map(p => p[0]).sort((a, b) => a - b);
    expect(xs[0]!).toBeLessThan(3);
    expect(xs[1]!).toBeGreaterThan(17);
    expect(line!.widthM).toBeGreaterThanOrEqual(3.7);
    expect(line!.widthM).toBeLessThanOrEqual(4.1);
  });

  it("gives an L one line with one bend", () => {
    const { lines } = suggest([{ footprint: [[0, 0], [20, 0], [20, 20], [16, 20], [16, 4], [0, 4]] }]);
    expect(lines).toHaveLength(1);
    expect(lines[0]!.polyline).toHaveLength(3);
  });

  it("gives the same L drawn as two rooms 0.3 m apart the same one line", () => {
    const { lines } = suggest([{ footprint: rect(0, 0, 20, 4) }, { footprint: rect(16, 4.3, 20, 20) }]);
    expect(lines).toHaveLength(1);
    expect(lines[0]!.polyline).toHaveLength(3);
  });

  it("gives a concourse with a hole a loop round the hole", () => {
    const { lines } = suggest([{ footprint: rect(0, 0, 30, 20), holes: [rect(10, 7, 20, 13)] }]);
    expect(lines).toHaveLength(1);
    const loop = lines[0]!.polyline;
    expect(loop[0]).toEqual(loop.at(-1));
    expect(loop.length).toBeGreaterThanOrEqual(5);
  });

  it("goes round a shop standing in a hall, not through it", () => {
    const { lines } = suggest([{ footprint: rect(0, 0, 30, 20) }, { footprint: rect(10, 7, 20, 13), kind: "room", walkable: false }]);
    expect(lines).toHaveLength(1);
    const loop = lines[0]!.polyline;
    expect(loop[0]).toEqual(loop.at(-1));
  });

  it("prunes a dead-end spur shorter than 2 m, and keeps a side corridor", () => {
    const alcove = (depth: number): Pt[] => [[0, 0], [24, 0], [24, 4], [13, 4], [13, 4 + depth], [11, 4 + depth], [11, 4], [0, 4]];
    expect(suggest([{ footprint: alcove(1) }]).lines).toHaveLength(1);
    expect(suggest([{ footprint: alcove(5) }]).lines).toHaveLength(3);
  });

  it("gives a diagonal corridor one line", () => {
    const h = 1.5 / Math.SQRT2;
    const { lines } = suggest([{ footprint: [[-h, h], [h, -h], [20 + h, 20 - h], [20 - h, 20 + h]] }]);
    expect(lines).toHaveLength(1);
    expect(lines[0]!.polyline).toHaveLength(2);
  });

  it("joins a doorway on the wall, and lists a doorway off the surface as unconnected", () => {
    const { links, unconnected } = suggest([{ footprint: rect(0, 0, 20, 4) }], {
      doorways: [doorway("door-shop", [[9, 4], [11, 4]]), doorway("door-far", [[50, 50], [52, 50]])],
    });
    expect(links).toHaveLength(1);
    expect(links[0]!.from).toEqual({ type: "doorway", id: "door-shop" });
    expect(links[0]!.segment[0]).toEqual([10, 4]);
    expect(links[0]!.segment[1][0]).toBeCloseTo(10, 1);
    expect(Math.abs(links[0]!.segment[1][1] - 2)).toBeLessThan(0.2);
    expect(unconnected).toEqual([{ type: "doorway", id: "door-far", reason: REASONS.offSurface }]);
  });
});

describe("suggestPaths", () => {
  it("clamps widths to 1.2–6 m", () => {
    expect(suggest([{ footprint: rect(0, 0, 20, 1) }]).lines.map(l => l.widthM)).toEqual([MIN_WIDTH_M]);
    expect(suggest([{ footprint: rect(0, 0, 40, 20) }]).lines.map(l => l.widthM)).toEqual([MAX_WIDTH_M]);
  });

  it("gives a floor with no walkable area no lines, and says why nothing is joined", () => {
    const s = suggest([{ footprint: rect(0, 0, 20, 4), walkable: false }], { doorways: [doorway("door-1", [[9, 4], [11, 4]])] });
    expect(s).toEqual({ lines: [], links: [], unconnected: [{ type: "doorway", id: "door-1", reason: REASONS.noSurface }] });
  });

  it("puts the longest line first and rounds to the centimetre", () => {
    const { lines } = suggest([{ footprint: [[0, 0], [24, 0], [24, 4], [13, 4], [13, 9], [11, 9], [11, 4], [0, 4]] }]);
    const lengths = lines.map(l => Math.hypot(l.polyline[1]![0] - l.polyline[0]![0], l.polyline[1]![1] - l.polyline[0]![1]));
    expect(lengths).toEqual([...lengths].sort((a, b) => b - a));
    for (const p of lines.flatMap(l => l.polyline)) {
      expect(Math.round(p[0] * 100) / 100).toBe(p[0]);
      expect(Math.round(p[1] * 100) / 100).toBe(p[1]);
    }
  });

  it("does a floor the size of L1 with 36 courtyards in well under 2 s", () => {
    const holes: Pt[][] = [];
    for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) holes.push(rect(10 + i * 32, 10 + j * 35, 30 + i * 32, 30 + j * 35));
    const started = performance.now();
    const { lines } = suggest([{ footprint: rect(0, 0, 200, 220), holes }]);
    expect(performance.now() - started).toBeLessThan(2000);
    expect(lines.length).toBeGreaterThan(36);
  });
});
