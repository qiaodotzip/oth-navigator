import { describe, expect, it } from "vitest";
import { lineUpOf, type LineDraft, type LineRoom } from "./lineUp";

const square = (x: number, y: number, s: number): [number, number][] => [[x, y], [x + s, y], [x + s, y + s], [x, y + s]];
/** A w × h rectangle with its south-west corner at (x, y). */
const rect = (x: number, y: number, w: number, h: number): [number, number][] => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];

/**
 * Rehearsal 2's L1: Replace plan put the drawing about 11.5 m east and 4.6 m
 * south of the 228 rooms traced by hand, the same for every room. Each room
 * here is a 6 m square; its namesake draft's label sits that far off it.
 */
const NAMES = ["Fire Command Centre", "Community Dance Studio 1", "2 (Wet) Team Changing", "Team Changing 3 (Dry)", "Hand Wash Area", "Cleaner's Room"];
const roomsOf = (names: readonly string[]) => names.map((nameEn, i) => ({ nameEn, footprint: square(i * 20, 0, 6), holes: [] }));
const draftsOff = (names: readonly string[], [ox, oy]: [number, number]) =>
  names.map((nameEn, i) => ({ nameEn, labelPoint: [i * 20 + 3 + ox, 3 + oy] as [number, number] }));

/**
 * Rehearsal 3 fired on 5 name pairs, the bare minimum. A row of identical
 * shops, 6 by 8 m side by side (a pitch of 6 m), the rooms named as the survey
 * knows them and the drafts as the drawing prints them: no name pairs at all.
 * `from` starts the row that many shops along.
 */
type Shape = { size?: [number, number]; step?: number; from?: number };
const row = (n: number, { size: [w, h] = [6, 8], step = 6, from = 0 }: Shape = {}) =>
  Array.from({ length: n }, (_, i) => ({ nameEn: `Unit ${i + from + 1}`, footprint: rect((i + from) * step, 0, w, h), holes: [] }));
const drawn = (n: number, [ox, oy]: [number, number], { size: [w, h] = [6, 8], step = 6, from = 0 }: Shape = {}) => Array.from({ length: n }, (_, i) => ({
  nameEn: `SHOP ${String(i + from + 1).padStart(2, "0")}`,
  footprint: rect((i + from) * step + ox, oy, w, h),
  labelPoint: [(i + from) * step + w / 2 + ox, h / 2 + oy] as [number, number],
}));

describe("lineUpOf (contract v3): does the drawing line up with the rooms already on the floor?", () => {
  it("says how far the drawing sits off the rooms (label minus centre) when 5 or more pairs agree on a shift of over a metre", () => {
    const rooms = [...roomsOf(NAMES), { nameEn: "Kitchen", footprint: square(200, 0, 6), holes: [] }];
    const drafts = [
      ...draftsOff(NAMES, [11.5, -4.6]),
      // Capitals and spacing aside, the names are the same: a pair, but one that lines up, so not one of the six.
      { nameEn: "  kitchen ", labelPoint: [203, 3] as [number, number] },
    ];
    // The editor says this as "about 11.5 m east and 4.6 m south of the rooms" (LineUpWarning).
    expect(lineUpOf(drafts, rooms).lineUp).toEqual({ dx: 11.5, dy: -4.6, pairs: 6 });
  });

  it("pairs a draft only with a name exactly one room on the floor has", () => {
    const shops = [{ nameEn: "Shop", footprint: square(300, 0, 6), holes: [] }, { nameEn: "shop", footprint: square(320, 0, 6), holes: [] }];
    const drafts = [...draftsOff(NAMES.slice(0, 4), [11.5, -4.6]), { nameEn: "Shop", labelPoint: [303 + 11.5, 3 - 4.6] as [number, number] }];
    expect(lineUpOf(drafts, [...roomsOf(NAMES.slice(0, 4)), ...shops]).lineUp).toBeUndefined();
  });

  it("gives no lineUp when the pairs line up, or disagree by more than half a metre", () => {
    expect(lineUpOf(draftsOff(NAMES, [0.4, -0.3]), roomsOf(NAMES)).lineUp).toBeUndefined();
    const scattered = NAMES.map((nameEn, i) => ({ nameEn, labelPoint: [i * 20 + 3 + 5 + i, 3] as [number, number] }));
    expect(lineUpOf(scattered, roomsOf(NAMES)).lineUp).toBeUndefined();
  });
});

describe("lineUpOf by shape too (contract v4)", () => {
  it("finds a row of identical shops drawn 11.5 m east and 4.6 m south of their rooms, with no name to go by", () => {
    // Every draft is the same shape as every shop within 40 m, so each votes several shifts; the true one gets all 8.
    expect(lineUpOf(drawn(8, [11.5, -4.6]), row(8))).toEqual({ lineUp: { dx: 11.5, dy: -4.6, pairs: 8 } });
  });

  it("says the same row drawn where the rooms are lines up: linedUp, and no lineUp", () => {
    expect(lineUpOf(drawn(8, [0, 0]), row(8))).toEqual({ linedUp: { pairs: 8 } });
    expect(lineUpOf(drawn(8, [0.4, -0.3]), row(8))).toEqual({ linedUp: { pairs: 8 } });
  });

  it("gives neither on a floor with too few shapes or names to tell", () => {
    expect(lineUpOf(drawn(4, [11.5, -4.6]), row(4))).toEqual({});
    expect(lineUpOf(drawn(4, [0, 0]), row(4))).toEqual({});
    expect(lineUpOf(draftsOff(NAMES.slice(0, 4), [0, 0]), roomsOf(NAMES.slice(0, 4)))).toEqual({});
    // Columns: identical, but under 4 m², so they never pair by shape.
    expect(lineUpOf(drawn(8, [11.5, -4.6], { size: [1.5, 1.5] }), row(8, { size: [1.5, 1.5] }))).toEqual({});
  });

  it("counts a draft once, though its name and its shape both pair it", () => {
    const rooms = row(4).map((r, i) => ({ ...r, nameEn: NAMES[i]! }));
    const drafts = drawn(4, [11.5, -4.6]).map((d, i) => ({ ...d, nameEn: NAMES[i]! }));
    expect(lineUpOf(drafts, rooms)).toEqual({});
  });

  it("pairs by shape only a room of the same size, within 40 m: area within 3%, width and height within 0.3 m", () => {
    // 6.2 × 7.8: 48.36 m² against 48 (0.75%), 0.2 m wider and 0.2 m shorter.
    expect(lineUpOf(drawn(8, [11.5, -4.6], { size: [6.2, 7.8] }), row(8)).lineUp?.pairs).toBe(8);
    // 6.4 × 7.5: 48 m², but 0.4 m wider.
    expect(lineUpOf(drawn(8, [11.5, -4.6], { size: [6.4, 7.5] }), row(8))).toEqual({});
    // 6 × 8.25: 0.25 m taller, but 3.1% larger.
    expect(lineUpOf(drawn(8, [11.5, -4.6], { size: [6, 8.25] }), row(8))).toEqual({});
    // Shops 50 m apart, so each draft has one shop of its shape near: 39 m off it pairs, 41 m off it doesn't.
    expect(lineUpOf(drawn(8, [0, 39], { step: 50 }), row(8, { step: 50 }))).toEqual({ lineUp: { dx: 0, dy: 39, pairs: 8 } });
    expect(lineUpOf(drawn(8, [0, 41], { step: 50 }), row(8, { step: 50 }))).toEqual({});
  });
});

/** A seeded shuffle, so a failing order can be found again. */
function shuffled<T>(items: readonly T[], seed: number): T[] {
  const out = [...items];
  let s = seed;
  const next = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

describe("lineUpOf picks the true shift, not a grid's echo (contract v4, amended)", () => {
  it("says an aligned row lines up, though its echoes 6 and 12 m off pair as many drafts", () => {
    // 10 drafts over 8 shops, drawn where they are: shifts 0, 6 and 12 m each pair 8. The first seed used to win,
    // and with the drafts in this order that was 12 m: lineUp { dx: 12, dy: 0, pairs: 8 } on an aligned floor.
    expect(lineUpOf(drawn(10, [0, 0]).reverse(), row(8))).toEqual({ linedUp: { pairs: 8 } });
  });

  it("says a row lines up when its echoes outnumber the truth: 6 pairs at 0 m against 8 at 12, 18 and 24 m", () => {
    // Shops 1–8 and drafts 3–12 of one row, drawn where they are: only drafts 3–8 have their own shop.
    expect(lineUpOf(drawn(10, [0, 0], { from: 2 }), row(8))).toEqual({ linedUp: { pairs: 6 } });
  });

  it("gives the same answer whatever order the drafts and rooms come in", () => {
    const cases: [LineDraft[], LineRoom[]][] = [
      [drawn(8, [11.5, -4.6]), row(8)],
      [drawn(10, [0, 0]), row(8)],
      [drawn(10, [0, 0], { from: 2 }), row(8)],
      [drawn(12, [6, 0]), row(12)],
      [[...drawn(8, [11.5, -4.6]), ...draftsOff(NAMES, [11.5, -4.6])], [...row(8), ...roomsOf(NAMES)]],
    ];
    for (const [drafts, rooms] of cases) {
      const answer = lineUpOf(drafts, rooms);
      for (let seed = 1; seed <= 12; seed++) {
        expect(lineUpOf(shuffled(drafts, seed), shuffled(rooms, seed * 7))).toEqual(answer);
      }
    }
  });

  it("does a floor of 992 identical units, about 90,000 pairs, well under a second", () => {
    const grid = (ox: number, oy: number, name: string) => Array.from({ length: 32 * 31 }, (_, k) => {
      const [i, j] = [k % 32, Math.floor(k / 32)];
      return { nameEn: `${name} ${k}`, footprint: rect(i * 6 + ox, j * 8 + oy, 6, 8), labelPoint: [i * 6 + 3 + ox, j * 8 + 4 + oy] as [number, number], holes: [] };
    });
    for (const [[ox, oy], answer] of [
      [[0, 0], { linedUp: { pairs: 992 } }],
      [[11.5, -4.6], { lineUp: { dx: 11.5, dy: -4.6, pairs: 992 } }],
    ] as const) {
      const started = performance.now();
      expect(lineUpOf(grid(ox, oy, "SHOP"), grid(0, 0, "Unit"))).toEqual(answer);
      expect(performance.now() - started).toBeLessThan(1000);
    }
  });
});
