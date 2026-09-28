import { describe, expect, it } from "vitest";
import {
  Flooder, and, clean, cleanPad, countSet, cropLike, dilate, dropCollinear, erode, firstSet,
  loops, nearest, rdp, regionWindow, type Grid,
} from "./raster";

/** A grid from rows of "#" (set) and "." (clear). */
function grid(rows: string[]): Grid {
  const width = rows[0]!.length;
  const data = new Uint8Array(width * rows.length);
  rows.forEach((row, y) => [...row].forEach((ch, x) => { data[y * width + x] = ch === "#" ? 1 : 0; }));
  return { data, width, height: rows.length };
}
const show = (g: Grid) =>
  Array.from({ length: g.height }, (_, y) => Array.from(g.data.subarray(y * g.width, (y + 1) * g.width), v => (v ? "#" : ".")).join(""));

/** The script's shift_or, one line for one line: each set pixel spreads r along its row and its column. */
function shiftOr(a: Grid, r: number): Grid {
  const out = a.data.slice();
  const { width: W, height: H } = a;
  for (let d = 1; d <= r; d++) {
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (!a.data[y * W + x]) continue;
        if (y + d < H) out[(y + d) * W + x] = 1;
        if (y - d >= 0) out[(y - d) * W + x] = 1;
        if (x + d < W) out[y * W + x + d] = 1;
        if (x - d >= 0) out[y * W + x - d] = 1;
      }
    }
  }
  return { data: out, width: W, height: H };
}

function random(width: number, height: number, seed: number, density = 0.1): Grid {
  let s = seed;
  const next = () => ((s = (s * 1103515245 + 12345) >>> 0) / 2 ** 32);
  return { data: Uint8Array.from({ length: width * height }, () => (next() < density ? 1 : 0)), width, height };
}

describe("dilate and erode", () => {
  it("spread along rows and columns, a cross and not a square, exactly as the script's shift_or", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const g = random(37, 23, seed);
      for (const r of [1, 3, 6]) {
        expect(dilate(g, r).data).toEqual(shiftOr(g, r).data);
        const inverted = { ...g, data: g.data.map(v => 1 - v) };
        expect(erode(g, r).data).toEqual(shiftOr(inverted, r).data.map(v => 1 - v));
      }
    }
  });

  it("dilate by a cross: a lone pixel becomes a plus", () => {
    expect(show(dilate(grid([".....", ".....", "..#..", ".....", "....."]), 2))).toEqual([
      "..#..", "..#..", "#####", "..#..", "..#..",
    ]);
  });

  it("erodes nothing at the grid's edge: outside counts as set, as in the script", () => {
    expect(countSet(erode(grid(["###", "###", "###"]), 1))).toBe(9);
  });
});

describe("Flooder", () => {
  it("floods four ways, never through a corner, as PIL's floodfill does", () => {
    const g = grid(["##..", "##..", "..##", "..##"]);
    const region = new Flooder(4, 4).fill(g.data, [0, 0])!;
    expect(region.pixels.length).toBe(4);
    expect([region.minX, region.minY, region.maxX, region.maxY]).toEqual([0, 0, 1, 1]);
  });

  it("gives up once the flood passes its limit: bigger than any room", () => {
    expect(new Flooder(4, 4).fill(new Uint8Array(16).fill(1), [0, 0], 10)).toBeNull();
  });

  it("floods again and again on one grid without clearing it", () => {
    const g = grid(["#.#", "#.#"]);
    const flooder = new Flooder(3, 2);
    expect(flooder.fill(g.data, [0, 0])!.pixels.length).toBe(2);
    expect(flooder.fill(g.data, [2, 0])!.pixels.length).toBe(2);
    expect(flooder.fill(g.data, [0, 1])!.pixels.length).toBe(2);
  });
});

describe("nearest", () => {
  it("is the seed itself when it is set, else the nearest set pixel in the first square that has one", () => {
    const g = grid([".....", ".....", ".....", "....#", "....."]);
    expect(nearest(g, 4, 3)).toEqual([4, 3]);
    expect(nearest(g, 2, 2)).toEqual([4, 3]);
    expect(nearest(g, 0, 0, 3)).toBeNull();
  });
});

describe("regionWindow and cropLike", () => {
  it("cuts a region out with room round it, and the same part of another grid", () => {
    const whole = grid(["......", ".##...", ".##...", "......"]);
    const region = new Flooder(6, 4).fill(whole.data, [1, 1])!;
    const win = regionWindow(region, whole, 1);
    expect([win.x0, win.y0, win.width, win.height]).toEqual([0, 0, 4, 4]);
    expect(show(win)).toEqual(["....", ".##.", ".##.", "...."]);
    expect(show(cropLike(grid(["#.....", "......", "......", ".....#"]), win))).toEqual(["#...", "....", "....", "...."]);
    expect(firstSet(win)).toBe(5);
    expect(countSet(and(win, cropLike(whole, win)))).toBe(4);
  });
});

describe("loops", () => {
  it("walks the cracks between pixels, so a corner lands on the wall line itself", () => {
    const [ring, ...rest] = loops(grid(["...", ".#.", "..."]));
    expect(rest).toEqual([]);
    expect(new Set(ring!.map(p => p.join(",")))).toEqual(new Set(["1,1", "2,1", "2,2", "1,2"]));
  });

  it("gives a room with a column in it an outer ring and a hole", () => {
    const rings = loops(grid(["#####", "#####", "##.##", "#####", "#####"])).sort((a, b) => b.length - a.length);
    expect(rings).toHaveLength(2);
    const xs = rings[0]!.map(p => p[0]);
    expect([Math.min(...xs), Math.max(...xs)]).toEqual([0, 5]);
    expect(new Set(rings[1]!.map(p => p.join(",")))).toEqual(new Set(["2,2", "3,2", "3,3", "2,3"]));
  });
});

describe("dropCollinear and rdp", () => {
  it("drops the corners of a straight run", () => {
    expect(dropCollinear([[0, 0], [1, 0], [2, 0], [2, 1], [2, 2], [0, 2]])).toEqual([[0, 0], [2, 0], [2, 2], [0, 2]]);
  });

  it("simplifies a closed ring without collapsing it to two points", () => {
    const stairs: [number, number][] = [[0, 0], [10, 0], [10, 1], [11, 1], [11, 10], [0, 10]];
    const simple = rdp([...stairs, stairs[0]!], 1.5).slice(0, -1);
    expect(simple).toEqual([[0, 0], [10, 0], [11, 10], [0, 10]]);
  });
});

describe("clean", () => {
  it("cuts a spur back, closes a pinhole, and cuts a room's corners, as the script's cross does", () => {
    // A 2 × 2 m room at 0.05 m per pixel, a 0.5 m spur off its west wall, and a one-pixel hole in the middle.
    const rows = Array.from({ length: 60 }, (_, y) =>
      Array.from({ length: 60 }, (_, x) => {
        const room = x >= 10 && x < 50 && y >= 10 && y < 50;
        const spur = y === 30 && x < 10;
        const pinhole = x === 30 && y === 30;
        return (room && !pinhole) || spur ? "#" : ".";
      }).join(""));
    const cleaned = clean(grid(rows), 0.05);
    const at = (x: number, y: number) => cleaned.data[y * 60 + x];
    // Along its own row the cross cannot see how thin a spur is, so the 5 px next to the wall stay;
    // the 0.4 m simplify takes them when the room is traced.
    expect(at(2, 30)).toBe(0);
    expect(at(7, 30)).toBe(1);
    expect(at(30, 30)).toBe(1);
    expect(at(10, 20)).toBe(1);
    // Opening by a cross takes a 5 px square off each corner; the 0.4 m simplify then smooths it, as on L1.
    expect(at(10, 10)).toBe(0);
    expect(cleanPad(0.05)).toBe(9);
  });
});
