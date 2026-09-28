import { bboxOfRing, labelPoint, ringArea, type Ring, type Vec2 } from "@oth/model";

/**
 * Contract v3's line-up check: the drawing a search read sits off the rooms
 * already on the floor. dx and dy, in metres, are how far it sits from them,
 * as the editor says it ("about 11.5 m east and 4.6 m south of the rooms").
 * pairs is how many drafts agree on it. Rehearsal 2's L1 plan sat
 * (+11.5, −4.6) off its rooms, and map_rooms made about 160 rooms twice.
 */
export type LineUp = { dx: number; dy: number; pairs: number };
/** Contract v4: the drawing does line up with the rooms, and this many pairs say so. */
export type LinedUp = { pairs: number };
/** What the line-up check says: at most one of the two, and neither on a floor with too little to tell by. */
export type LineCheck = { lineUp?: LineUp; linedUp?: LinedUp };
/** At least this many pairs must agree, */
export const LINE_UP_PAIRS = 5;
/** each within this of the others, */
export const LINE_UP_AGREE_M = 0.5;
/** on a shift longer than this for lineUp, or this long or less for linedUp. */
export const LINE_UP_SHIFT_M = 1;
/**
 * Contract v4: a draft pairs by shape with a room at least SHAPE_MIN_M2 (not a
 * column), whose centre is within SHAPE_NEAR_M of its own, whose area agrees
 * within SHAPE_AREA_SHARE, and whose bbox's width and height each agree within
 * SHAPE_SIZE_M.
 */
export const SHAPE_MIN_M2 = 4;
export const SHAPE_NEAR_M = 40;
export const SHAPE_AREA_SHARE = 0.03;
export const SHAPE_SIZE_M = 0.3;

/** Names compared the way people mean them (editor/src/survey/suggest.ts normalName): case, inner spacing and the ends ignored. */
function normalName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export type LineDraft = { nameEn: string; labelPoint: Vec2; footprint?: Ring; holes?: readonly Ring[] };
export type LineRoom = { nameEn: string; footprint: Ring; holes: readonly Ring[] };
/** A draft (by its index) and a room it may be, and how far the draft sits off that room. */
type Pair = { draft: number; shift: Vec2 };
/** Pairs agreeing on a shift, a draft counted once, and their mean shift and its length. */
type Group = { pairs: number; dx: number; dy: number; length: number };

/** An outline's size: its area less its holes', its bbox's width and height, and the bbox's centre. */
function sizeOf(footprint: Ring, holes: readonly Ring[]) {
  const box = bboxOfRing(footprint);
  return {
    area: Math.abs(ringArea(footprint)) - holes.reduce((sum, h) => sum + Math.abs(ringArea(h)), 0),
    w: box.maxX - box.minX, h: box.maxY - box.minY, centre: [(box.minX + box.maxX) / 2, (box.minY + box.maxY) / 2] as Vec2,
  };
}

/**
 * Every pair a draft makes with a room. By name (contract v3): exactly one
 * room on the floor has its name, capitals and spacing aside, and the shift
 * is the draft's label less the room's centre, where get_floor puts its name.
 * By shape (contract v4): a room its size near it, and the shift is between
 * their bboxes' centres, which a drawing moved whole moves by exactly its
 * shift. A row of identical shops gives each draft a pair with every shop
 * near it, so a grid echoes the true shift at every multiple of its pitch.
 */
function pairsOf(drafts: readonly LineDraft[], rooms: readonly LineRoom[]): Pair[] {
  const named = new Map<string, LineRoom[]>();
  for (const r of rooms) {
    const name = normalName(r.nameEn);
    if (!name) continue;
    const same = named.get(name);
    if (same) same.push(r);
    else named.set(name, [r]);
  }
  const centres = new Map<LineRoom, Vec2>();
  const shapes = rooms.map(r => sizeOf(r.footprint, r.holes)).filter(s => s.area >= SHAPE_MIN_M2);
  const pairs: Pair[] = [];
  drafts.forEach((d, i) => {
    const same = named.get(normalName(d.nameEn));
    if (same?.length === 1) {
      const room = same[0]!;
      const centre = centres.get(room) ?? labelPoint(room.footprint, room.holes, 0.5).point;
      centres.set(room, centre);
      pairs.push({ draft: i, shift: [d.labelPoint[0] - centre[0], d.labelPoint[1] - centre[1]] });
    }
    if (!d.footprint) return;
    const own = sizeOf(d.footprint, d.holes ?? []);
    for (const s of shapes) {
      const shift: Vec2 = [own.centre[0] - s.centre[0], own.centre[1] - s.centre[1]];
      if (Math.hypot(shift[0], shift[1]) > SHAPE_NEAR_M) continue;
      if (Math.abs(own.area - s.area) > SHAPE_AREA_SHARE * s.area) continue;
      if (Math.abs(own.w - s.w) > SHAPE_SIZE_M || Math.abs(own.h - s.h) > SHAPE_SIZE_M) continue;
      pairs.push({ draft: i, shift });
    }
  });
  return pairs;
}

/** Whether pair p sorts before q: by shift, x then y, so a tie never depends on the order drafts came in. */
const before = (p: Pair, q: Pair) => p.shift[0] < q.shift[0] || (p.shift[0] === q.shift[0] && p.shift[1] < q.shift[1]);

/**
 * The groups the pairs vote into. Shifts are bucketed by LINE_UP_AGREE_M, and
 * each bucket with pairs in it seeds one group at its pairs' mean shift: the
 * pairs within LINE_UP_AGREE_M of that seed, which lie in the bucket or the
 * eight round it, a draft counted once (its pair nearest the seed). Seeding
 * per bucket rather than per pair keeps a floor of a thousand identical
 * units, a hundred thousand pairs, to a few hundred seeds.
 */
function groupsOf(pairs: readonly Pair[]): Group[] {
  const cell = (v: number) => Math.floor(v / LINE_UP_AGREE_M);
  const key = (col: number, row: number) => `${col},${row}`;
  const buckets = new Map<string, { col: number; row: number; pairs: Pair[] }>();
  for (const p of pairs) {
    const [col, row] = [cell(p.shift[0]), cell(p.shift[1])];
    const bucket = buckets.get(key(col, row));
    if (bucket) bucket.pairs.push(p);
    else buckets.set(key(col, row), { col, row, pairs: [p] });
  }
  const groups: Group[] = [];
  for (const { col, row, pairs: own } of buckets.values()) {
    const seed: Vec2 = [own.reduce((s, p) => s + p.shift[0], 0) / own.length, own.reduce((s, p) => s + p.shift[1], 0) / own.length];
    const nearest = new Map<number, { pair: Pair; d: number }>();
    for (let dc = -1; dc <= 1; dc++) {
      for (let dr = -1; dr <= 1; dr++) {
        for (const p of buckets.get(key(col + dc, row + dr))?.pairs ?? []) {
          const d = Math.hypot(p.shift[0] - seed[0], p.shift[1] - seed[1]);
          if (d > LINE_UP_AGREE_M) continue;
          const had = nearest.get(p.draft);
          if (!had || d < had.d || (d === had.d && before(p, had.pair))) nearest.set(p.draft, { pair: p, d });
        }
      }
    }
    const members = [...nearest.values()].map(n => n.pair);
    const dx = members.reduce((s, p) => s + p.shift[0], 0) / members.length;
    const dy = members.reduce((s, p) => s + p.shift[1], 0) / members.length;
    groups.push({ pairs: members.length, dx, dy, length: Math.hypot(dx, dy) });
  }
  return groups;
}

/** Groups in the order they win: the most pairs, then the smallest shift, then by dx and dy. */
const winning = (a: Group, b: Group) => b.pairs - a.pairs || a.length - b.length || a.dx - b.dx || a.dy - b.dy;

/**
 * Whether waiting drafts line up with the rooms already on the floor
 * (contracts v3 and v4, amended). Each draft pairs with the rooms it may be,
 * by name and by shape (pairsOf), and the pairs vote on a shift (groupsOf).
 * - A group with a mean shift of LINE_UP_SHIFT_M or less, at least
 *   LINE_UP_PAIRS pairs and at least half as many as the largest group, is a
 *   drawing that lines up: linedUp. A larger group further off is a grid's
 *   echo of it, not a shift.
 * - Otherwise the largest group decides, when it has at least LINE_UP_PAIRS:
 *   of several as large, the one with the smallest shift. Its mean shift is
 *   where the drawing sits off the rooms: lineUp.
 * - A floor with too few named or shaped rooms to tell gives neither.
 * The answer never depends on the order drafts or rooms come in.
 */
export function lineUpOf(drafts: readonly LineDraft[], rooms: readonly LineRoom[]): LineCheck {
  const groups = groupsOf(pairsOf(drafts, rooms)).sort(winning);
  const most = groups[0]?.pairs ?? 0;
  if (most < LINE_UP_PAIRS) return {};
  const aligned = groups.find(g => g.length <= LINE_UP_SHIFT_M && g.pairs >= LINE_UP_PAIRS && g.pairs * 2 >= most);
  if (aligned) return { linedUp: { pairs: aligned.pairs } };
  const top = groups[0]!;
  return { lineUp: { dx: round1(top.dx), dy: round1(top.dy), pairs: top.pairs } };
}
