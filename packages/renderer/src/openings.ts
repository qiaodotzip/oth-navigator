import {
  distancePointToSegment, pointInPolygon, segmentsProperlyIntersect, type Doorway, type Pathway, type Room, type Vec2,
} from "@oth/model";
import { subtractIntervals, type Interval } from "./intervals";
import type { WallPiece } from "./wallPlan";

/** Spec §7: an opening is as wide as the pathway through it, and at most 3 m. */
export const MAX_PATH_OPENING_M = 3;
/** A pathway drawn up to a wall that stops this short of it still goes through. */
export const PATH_REACH_M = 0.5;
/** A doorway this far off a wall's face still lies on it: traced lines wander. */
const DOORWAY_SLACK_M = 0.3;
/**
 * How near a pathway must pass for a closed room to get a front door onto it.
 * The same 3 m as the `room.noAccess` check (ROOM_ACCESS_M in the model's
 * access rule), so a room the validator calls reachable is never a closed box.
 */
export const SHOPFRONT_REACH_M = 3;
/**
 * How far out in front of a closed room's own wall a walkable area may lie for
 * the room to get its front door there, when no pathway comes within 3 m (Plan
 * 5D Ruling 9). A shop set back behind a strip of floor nobody traced still
 * opens onto the concourse beyond it.
 */
export const AREA_REACH_M = 6;
/** An area's edge up to 45° off the wall's line still faces it (Ruling 9). */
const FACING_ANGLE_SIN = Math.sin(Math.PI / 4);
/**
 * An area's edge this far behind the wall's line still faces it: traced
 * outlines overlap by that much. It is the 0.5 m within which two rooms'
 * edges are one wall.
 */
const BEHIND_SLACK_M = 0.5;
/** A narrower front door is a slot, so less wall than this facing an area gets no door (Ruling 9). */
export const MIN_DOOR_M = 0.9;
/** How far either side of a wall to test which side the room is on. */
const PROBE_M = 0.01;
/** How far outside a wall to look for an area it stands inside, or that overlaps the room (Ruling 11). */
const PROBE_OUT_M = 0.1;
/**
 * A room's consecutive own pieces turning less than this at their joint are
 * one frontage (Ruling 11). 25° (Ruling 12) takes in a traced round kiosk,
 * whose 16 sides turn 22.5° at each corner, and leaves out a chamfered
 * corner's 45°.
 */
const FRONTAGE_ANGLE_SIN = Math.sin((25 * Math.PI) / 180);
/** Doors whose gaps differ by no more than this are equally near (Ruling 11). */
const EQUALLY_NEAR_M = 0.1;
/** A shorter stand of wall between two openings is dropped. */
const MIN_RUN_M = 0.05;

/** Rounding room for the box tests, which must never turn away a pair the exact test would take. */
const BOX_SLACK_M = 1e-6;

type Frame = {
  a: Vec2; len: number; ux: number; uy: number;
  minX: number; maxX: number; minY: number; maxY: number;
};

function frameOf(piece: WallPiece): Frame | null {
  const dx = piece.b[0] - piece.a[0];
  const dy = piece.b[1] - piece.a[1];
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return null;
  return {
    a: piece.a, len, ux: dx / len, uy: dy / len,
    minX: Math.min(piece.a[0], piece.b[0]), maxX: Math.max(piece.a[0], piece.b[0]),
    minY: Math.min(piece.a[1], piece.b[1]), maxY: Math.max(piece.a[1], piece.b[1]),
  };
}

const along = (f: Frame, p: Vec2) => (p[0] - f.a[0]) * f.ux + (p[1] - f.a[1]) * f.uy;
const across = (f: Frame, p: Vec2) => Math.abs((p[0] - f.a[0]) * f.uy - (p[1] - f.a[1]) * f.ux);
const pointAt = (f: Frame, t: number): Vec2 => [f.a[0] + f.ux * t, f.a[1] + f.uy * t];

/**
 * Whether the box around these points comes within `margin` of the piece's box.
 *
 * A floor is thousands of wall pieces and hundreds of pathway stretches, and
 * nearly every pair is metres apart. A line whose box is further than the
 * margin from a piece's box can neither cross the piece nor pass within reach
 * of it, so this cheap test rules most pairs out before the exact one.
 */
function nearBox(f: Frame, points: readonly Vec2[], margin: number): boolean {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of points) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  const m = margin + BOX_SLACK_M;
  return maxX >= f.minX - m && minX <= f.maxX + m && maxY >= f.minY - m && minY <= f.maxY + m;
}

/** A pathway's stretches, with its two ends pushed out by PATH_REACH_M. */
function reachingSegments(polyline: readonly Vec2[]): Array<[Vec2, Vec2]> {
  const segments: Array<[Vec2, Vec2]> = [];
  for (let i = 0; i + 1 < polyline.length; i++) {
    let p = polyline[i]!;
    let q = polyline[i + 1]!;
    const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (len < 1e-9) continue;
    const ux = (q[0] - p[0]) / len;
    const uy = (q[1] - p[1]) / len;
    if (i === 0) p = [p[0] - ux * PATH_REACH_M, p[1] - uy * PATH_REACH_M];
    if (i + 2 === polyline.length) q = [q[0] + ux * PATH_REACH_M, q[1] + uy * PATH_REACH_M];
    segments.push([p, q]);
  }
  return segments;
}

/** Metres along the piece where p→q crosses its centre line, or null. Parallel never crosses. */
function crossingAt(f: Frame, p: Vec2, q: Vec2): number | null {
  const rx = q[0] - p[0];
  const ry = q[1] - p[1];
  const sx = f.ux * f.len;
  const sy = f.uy * f.len;
  const denom = rx * sy - ry * sx;
  if (Math.abs(denom) < 1e-9 * Math.hypot(rx, ry) * f.len) return null;
  const wx = f.a[0] - p[0];
  const wy = f.a[1] - p[1];
  const t = (wx * sy - wy * sx) / denom;
  const u = (wx * ry - wy * rx) / denom;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return u * f.len;
}

export function pathwayOpenings(piece: WallPiece, pathways: readonly Pathway[]): Interval[] {
  const f = frameOf(piece);
  if (!f) return [];
  const openings: Interval[] = [];
  for (const pathway of pathways) {
    // The reach pushes only the ends out, so it widens the whole line's box by that much at most.
    if (!nearBox(f, pathway.polyline, PATH_REACH_M)) continue;
    const half = Math.min(pathway.widthM, MAX_PATH_OPENING_M) / 2;
    for (const [p, q] of reachingSegments(pathway.polyline)) {
      if (!nearBox(f, [p, q], 0)) continue;
      const at = crossingAt(f, p, q);
      if (at !== null) openings.push([at - half, at + half]);
    }
  }
  return openings;
}

export function doorwayOpenings(piece: WallPiece, doorways: readonly Doorway[]): Interval[] {
  const f = frameOf(piece);
  if (!f) return [];
  const near = piece.thicknessM / 2 + DOORWAY_SLACK_M;
  const openings: Interval[] = [];
  for (const doorway of doorways) {
    const [d0, d1] = doorway.segment;
    if (across(f, d0) > near || across(f, d1) > near) continue;
    let from = Math.min(along(f, d0), along(f, d1));
    let to = Math.max(along(f, d0), along(f, d1));
    if (to < 0 || from > f.len) continue;
    if (to - from < doorway.widthM) {
      const middle = (from + to) / 2;
      from = middle - doorway.widthM / 2;
      to = middle + doorway.widthM / 2;
    }
    openings.push([from, to]);
  }
  return openings;
}

/**
 * The point of the piece nearest a pathway stretch, and how near.
 *
 * Two segments that do not cross are nearest at an end of one of them, so
 * four candidates are enough. Where several are equally near, as along a
 * parallel pathway, the door goes in the middle of them.
 */
function nearestOnPiece(f: Frame, p: Vec2, q: Vec2): { t: number; distance: number } {
  const clamp = (t: number) => Math.max(0, Math.min(f.len, t));
  const ts = [0, f.len, clamp(along(f, p)), clamp(along(f, q))];
  const ds = ts.map(t => distancePointToSegment(pointAt(f, t), p, q));
  const distance = Math.min(...ds);
  const ties = ts.filter((_, i) => ds[i]! - distance < 1e-6);
  return { t: ties.reduce((sum, t) => sum + t, 0) / ties.length, distance };
}

/**
 * A room's own pieces that run on from one another, end to start, turning
 * less than 25° at each joint (Rulings 11 and 12). A front traced as several
 * short edges, or a round kiosk's sides, is one frontage, and a door may span
 * its joints. `from` is where each piece starts, in metres along the frontage.
 */
type Frontage = { parts: Array<{ index: number; f: Frame; from: number }>; len: number };

function frontage(walls: ReadonlyArray<{ index: number; f: Frame }>): Frontage {
  let len = 0;
  const parts = walls.map(({ index, f }) => {
    const part = { index, f, from: len };
    len += f.len;
    return part;
  });
  return { parts, len };
}

const samePoint = (p: Vec2, q: Vec2) => Math.abs(p[0] - q[0]) < 1e-6 && Math.abs(p[1] - q[1]) < 1e-6;
/** To the micrometre, so floating-point noise never reorders two choices. */
const um = (x: number) => Math.round(x * 1e6);
/** West first, then south: an order that never depends on the order pieces arrive in. */
const westThenSouth = (p: Vec2, q: Vec2) => um(p[0]) - um(q[0]) || um(p[1]) - um(q[1]);

/** The room's own pieces, as frontages. */
function frontagesOf(pieces: readonly WallPiece[], own: readonly number[]): Frontage[] {
  const walls = own.flatMap(index => {
    const f = frameOf(pieces[index]!);
    return f ? [{ index, f, end: pieces[index]!.b }] : [];
  });
  const next = new Map<number, number>();
  const followed = new Set<number>();
  walls.forEach((w, i) => {
    const j = walls.findIndex((v, k) => k !== i && !followed.has(k) && samePoint(w.end, v.f.a) &&
      w.f.ux * v.f.ux + w.f.uy * v.f.uy > 0 && Math.abs(w.f.ux * v.f.uy - w.f.uy * v.f.ux) <= FRONTAGE_ANGLE_SIN);
    if (j >= 0) {
      next.set(i, j);
      followed.add(j);
    }
  });

  const seen = new Set<number>();
  const chain = (start: number) => {
    const parts: Array<{ index: number; f: Frame }> = [];
    for (let i: number | undefined = start; i !== undefined && !seen.has(i); i = next.get(i)) {
      seen.add(i);
      parts.push(walls[i]!);
    }
    return frontage(parts);
  };
  const all = walls.map((_, i) => i);
  const frontages = all.filter(i => !followed.has(i)).map(chain);
  // Whatever is left runs round in a loop, as a finely traced round room does.
  // Each loop starts at its west-then-southmost piece, so its one seam is fixed.
  const loops = all.filter(i => !seen.has(i)).sort((i, j) => westThenSouth(walls[i]!.f.a, walls[j]!.f.a));
  for (const i of loops) if (!seen.has(i)) frontages.push(chain(i));
  return frontages;
}

function frontagePoint(fr: Frontage, s: number): Vec2 {
  let part = fr.parts[0]!;
  for (const p of fr.parts) if (p.from <= s) part = p;
  return pointAt(part.f, s - part.from);
}

/** Cuts [s0, s1] of the frontage out of every piece it spans. */
function cutAcross(cuts: Interval[][], fr: Frontage, [s0, s1]: Interval): void {
  for (const { index, f, from } of fr.parts) {
    const t0 = Math.max(0, s0 - from);
    const t1 = Math.min(f.len, s1 - from);
    if (t1 > t0) cuts[index]!.push([t0, t1]);
  }
}

/**
 * Where a front door could go: the stretch of a frontage it cuts, how near
 * what it opens onto, the length it is chosen by, and its centre. The length
 * is the door's own for a pathway, and the facing stretch's for an area.
 */
type Option = { fr: Frontage; interval: Interval; near: number; span: number; centre: Vec2 };

/**
 * Options in the order they are tried (Ruling 11). Nearest first, counting
 * any within 0.1 m of the nearest as equally near. Among those, the longest,
 * then west first and then south by the door's centre, so the same plan always
 * gives the same door, whatever order its pieces come in.
 */
function inTurn<T extends Option>(options: readonly T[]): T[] {
  let rest = [...options];
  const order: T[] = [];
  while (rest.length > 0) {
    const nearest = Math.min(...rest.map(o => o.near));
    const level = rest.filter(o => o.near <= nearest + EQUALLY_NEAR_M);
    level.sort((p, q) => um(q.span) - um(p.span) || westThenSouth(p.centre, q.centre));
    order.push(...level);
    rest = rest.filter(o => o.near > nearest + EQUALLY_NEAR_M);
  }
  return order;
}

/** Every front door a pathway passing within reach offers on the frontage. */
function pathwayOptions(fr: Frontage, pathways: readonly Pathway[]): Option[] {
  const options: Option[] = [];
  for (const pathway of pathways) {
    const width = Math.min(pathway.widthM, MAX_PATH_OPENING_M, fr.len);
    for (const { f, from } of fr.parts) {
      if (!nearBox(f, pathway.polyline, SHOPFRONT_REACH_M)) continue;
      for (let i = 0; i + 1 < pathway.polyline.length; i++) {
        const p = pathway.polyline[i]!;
        const q = pathway.polyline[i + 1]!;
        if (!nearBox(f, [p, q], SHOPFRONT_REACH_M)) continue;
        const near = nearestOnPiece(f, p, q);
        if (near.distance > SHOPFRONT_REACH_M) continue;
        // Slid back inside the frontage rather than cut short at its end, then
        // ranked by where the door actually is: a side wall's corner can be as
        // near as the front, but a door slid along it is not.
        const middle = Math.max(width / 2, Math.min(fr.len - width / 2, from + near.t));
        const centre = frontagePoint(fr, middle);
        options.push({
          fr, interval: [middle - width / 2, middle + width / 2],
          near: distancePointToSegment(centre, p, q), span: width, centre,
        });
      }
    }
  }
  return options;
}

/** Where a closed room's front door goes on this piece, if a pathway passes within reach. */
export function shopfrontOpening(
  piece: WallPiece, pathways: readonly Pathway[],
): { interval: Interval; distance: number } | null {
  const f = frameOf(piece);
  if (!f) return null;
  const [first] = inTurn(pathwayOptions(frontage([{ index: 0, f }]), pathways));
  return first ? { interval: first.interval, distance: first.near } : null;
}

/**
 * Floor people cross, as the model marks it: an `area`, which is open and never
 * walled, that is also part of the walkable surface. A room marked walkable is
 * still walled, so it is somewhere you arrive, not somewhere you pass through.
 */
export function isWalkableArea(room: Room): boolean {
  return room.kind === "area" && room.walkable;
}

type AreaEdge = { a: Vec2; b: Vec2; ux: number; uy: number; minX: number; maxX: number; minY: number; maxY: number };
/** A walkable area, with its edges, holes included (a kiosk can stand in an area's hole), and its box. */
type AreaShape = { room: Room; edges: AreaEdge[]; minX: number; maxX: number; minY: number; maxY: number };

function areaShapes(rooms: readonly Room[]): AreaShape[] {
  return rooms.filter(isWalkableArea).map(room => {
    const edges: AreaEdge[] = [];
    for (const ring of [room.footprint, ...room.holes]) {
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i]!;
        const b = ring[(i + 1) % ring.length]!;
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (len < 1e-9) continue;
        edges.push({
          a, b, ux: (b[0] - a[0]) / len, uy: (b[1] - a[1]) / len,
          minX: Math.min(a[0], b[0]), maxX: Math.max(a[0], b[0]),
          minY: Math.min(a[1], b[1]), maxY: Math.max(a[1], b[1]),
        });
      }
    }
    return {
      room, edges,
      minX: Math.min(...edges.map(e => e.minX)), maxX: Math.max(...edges.map(e => e.maxX)),
      minY: Math.min(...edges.map(e => e.minY)), maxY: Math.max(...edges.map(e => e.maxY)),
    };
  });
}

/**
 * The unit normal pointing out of the room, for a wall on the room's outline.
 * Taken from the footprint, since a traced ring may wind either way. Null when
 * the footprint puts both sides, or neither, inside.
 */
function outwardOf(f: Frame, room: Room): Vec2 | null {
  const [mx, my] = pointAt(f, f.len / 2);
  const inLeft = pointInPolygon([mx - f.uy * PROBE_M, my + f.ux * PROBE_M], room.footprint, room.holes);
  const inRight = pointInPolygon([mx + f.uy * PROBE_M, my - f.ux * PROBE_M], room.footprint, room.holes);
  if (inLeft === inRight) return null;
  return inLeft ? [f.uy, -f.ux] : [-f.uy, f.ux];
}

/** The part of the edge's [lo, hi] where a value going from v0 to v1 along it stays within [min, max]. */
function narrowed(lo: number, hi: number, v0: number, v1: number, min: number, max: number): [number, number] {
  const dv = v1 - v0;
  if (Math.abs(dv) < 1e-12) return v0 >= min && v0 <= max ? [lo, hi] : [1, 0];
  const s0 = (min - v0) / dv;
  const s1 = (max - v0) / dv;
  return [Math.max(lo, Math.min(s0, s1)), Math.min(hi, Math.max(s0, s1))];
}

/**
 * A stretch of wall with an area in front of it: how far out the area is, and
 * the parts of its outline the stretch faces, which a door's sight line aims at.
 */
type Facing = { interval: Interval; gap: number; faces: Array<[Vec2, Vec2]> };

/**
 * The stretches of the piece that an area's edge lies in front of, on the
 * outward side. An edge counts over the part of the wall it lies in front of,
 * within 45° of the wall's line and within AREA_REACH_M, and that clipped part
 * is what the stretch faces. The gap is measured straight out from the wall.
 */
function edgeFacings(f: Frame, out: Vec2, shapes: readonly AreaShape[]): Facing[] {
  const m = AREA_REACH_M + BOX_SLACK_M;
  const outFrom = (p: Vec2) => (p[0] - f.a[0]) * out[0] + (p[1] - f.a[1]) * out[1];
  const found: Facing[] = [];
  for (const shape of shapes) {
    if (shape.maxX < f.minX - m || shape.minX > f.maxX + m || shape.maxY < f.minY - m || shape.minY > f.maxY + m) continue;
    for (const e of shape.edges) {
      if (e.maxX < f.minX - m || e.minX > f.maxX + m || e.maxY < f.minY - m || e.minY > f.maxY + m) continue;
      if (Math.abs(f.ux * e.uy - f.uy * e.ux) > FACING_ANGLE_SIN) continue;
      // Along the wall and out from it both change evenly along the edge, so
      // each bound is one cut of the edge's own 0..1.
      const ta = along(f, e.a), tb = along(f, e.b);
      const ha = outFrom(e.a), hb = outFrom(e.b);
      let [lo, hi] = narrowed(0, 1, ta, tb, 0, f.len);
      [lo, hi] = narrowed(lo, hi, ha, hb, -BEHIND_SLACK_M, AREA_REACH_M);
      if (hi <= lo) continue;
      const on = (s: number): Vec2 => [e.a[0] + (e.b[0] - e.a[0]) * s, e.a[1] + (e.b[1] - e.a[1]) * s];
      const t0 = ta + (tb - ta) * lo, t1 = ta + (tb - ta) * hi;
      const h0 = ha + (hb - ha) * lo, h1 = ha + (hb - ha) * hi;
      found.push({ interval: [Math.min(t0, t1), Math.max(t0, t1)], gap: Math.max(0, Math.min(h0, h1)), faces: [[on(lo), on(hi)]] });
    }
  }
  return found;
}

/**
 * The stretches of the piece that stand inside an area, or against one that
 * overlaps the room (Ruling 11). A room traced inside a concourse with no
 * hole round it has no area edge in front of its walls at all. The line
 * PROBE_OUT_M outside the wall is cut where it crosses each area's outline,
 * and every part whose middle lies inside the area counts at gap 0, facing
 * that part of the line.
 */
function insideFacings(f: Frame, out: Vec2, shapes: readonly AreaShape[]): Facing[] {
  const dx = out[0] * PROBE_OUT_M, dy = out[1] * PROBE_OUT_M;
  const probe: Frame = {
    ...f, a: [f.a[0] + dx, f.a[1] + dy],
    minX: f.minX + dx, maxX: f.maxX + dx, minY: f.minY + dy, maxY: f.maxY + dy,
  };
  const m = BOX_SLACK_M;
  const found: Facing[] = [];
  for (const shape of shapes) {
    if (shape.maxX < probe.minX - m || shape.minX > probe.maxX + m || shape.maxY < probe.minY - m || shape.minY > probe.maxY + m) continue;
    const ts = [0, f.len];
    for (const e of shape.edges) {
      if (e.maxX < probe.minX - m || e.minX > probe.maxX + m || e.maxY < probe.minY - m || e.minY > probe.maxY + m) continue;
      const t = crossingAt(probe, e.a, e.b);
      if (t !== null) ts.push(t);
    }
    ts.sort((p, q) => p - q);
    for (let i = 0; i + 1 < ts.length; i++) {
      const t0 = ts[i]!, t1 = ts[i + 1]!;
      if (t1 - t0 < 1e-9) continue;
      if (!pointInPolygon(pointAt(probe, (t0 + t1) / 2), shape.room.footprint, shape.room.holes)) continue;
      found.push({ interval: [t0, t1], gap: 0, faces: [[pointAt(probe, t0), pointAt(probe, t1)]] });
    }
  }
  return found;
}

/** Overlapping or touching stretches as one, keeping the smaller gap and everything either faces. */
function joined(found: readonly Facing[]): Facing[] {
  const sorted = [...found].sort((p, q) => p.interval[0] - q.interval[0]);
  const out: Array<{ interval: [number, number]; gap: number; faces: Array<[Vec2, Vec2]> }> = [];
  for (const { interval: [from, to], gap, faces } of sorted) {
    const last = out[out.length - 1];
    if (last && from <= last.interval[1] + BOX_SLACK_M) {
      last.interval[1] = Math.max(last.interval[1], to);
      last.gap = Math.min(last.gap, gap);
      last.faces.push(...faces);
    } else out.push({ interval: [from, to], gap, faces: [...faces] });
  }
  return out;
}

/**
 * The stretches of a room's own wall that a walkable area among `rooms`
 * faces, joined, as the door fallback sees them on a single piece. The wall's
 * room must be among `rooms`, since its footprint says which side is outside.
 */
export function areaFacing(piece: WallPiece, rooms: readonly Room[]): Interval[] {
  const f = frameOf(piece);
  const room = piece.rooms.length === 1 ? rooms.find(r => r.id === piece.rooms[0]) : undefined;
  const out = f && room ? outwardOf(f, room) : null;
  if (!f || !out) return [];
  const shapes = areaShapes(rooms);
  return joined([...edgeFacings(f, out, shapes), ...insideFacings(f, out, shapes)]).map(s => s.interval);
}

/** The point of the segment nearest p. */
function nearestOnSegment(p: Vec2, a: Vec2, b: Vec2): Vec2 {
  const vx = b[0] - a[0];
  const vy = b[1] - a[1];
  const lenSq = vx * vx + vy * vy;
  const t = lenSq > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / lenSq)) : 0;
  return [a[0] + t * vx, a[1] + t * vy];
}

/** The nearest point to p on any of these segments. */
function nearestOn(p: Vec2, segments: ReadonlyArray<[Vec2, Vec2]>): Vec2 | null {
  let best: Vec2 | null = null;
  let bestD = Infinity;
  for (const [a, b] of segments) {
    const q = nearestOnSegment(p, a, b);
    const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (d < bestD) { best = q; bestD = d; }
  }
  return best;
}

/** Whether the straight line from p to q crosses a wall of any room but this one (Ruling 10). */
function crossesAnotherRoom(p: Vec2, q: Vec2, pieces: readonly WallPiece[], roomId: string): boolean {
  const minX = Math.min(p[0], q[0]) - BOX_SLACK_M, maxX = Math.max(p[0], q[0]) + BOX_SLACK_M;
  const minY = Math.min(p[1], q[1]) - BOX_SLACK_M, maxY = Math.max(p[1], q[1]) + BOX_SLACK_M;
  for (const w of pieces) {
    if (Math.max(w.a[0], w.b[0]) < minX || Math.min(w.a[0], w.b[0]) > maxX) continue;
    if (Math.max(w.a[1], w.b[1]) < minY || Math.min(w.a[1], w.b[1]) > maxY) continue;
    if (w.rooms.every(id => id === roomId)) continue;
    if (segmentsProperlyIntersect(p, q, w.a, w.b)) return true;
  }
  return false;
}

type AreaOption = Option & { faces: Array<[Vec2, Vec2]> };

/**
 * Every front door the frontage could open onto a walkable area: one per
 * stretch of at least MIN_DOOR_M that an area faces, as wide as a pathway's
 * opening at most, centred on the stretch.
 */
function areaOptions(fr: Frontage, room: Room, shapes: readonly AreaShape[]): AreaOption[] {
  const found: Facing[] = [];
  for (const { f, from } of fr.parts) {
    const out = outwardOf(f, room);
    if (!out) continue;
    for (const s of [...edgeFacings(f, out, shapes), ...insideFacings(f, out, shapes)]) {
      found.push({ ...s, interval: [s.interval[0] + from, s.interval[1] + from] });
    }
  }
  return joined(found).flatMap(({ interval: [from, to], gap, faces }): AreaOption[] => {
    const span = to - from;
    if (span + 1e-9 < MIN_DOOR_M) return [];
    const middle = (from + to) / 2;
    const half = Math.min(span, MAX_PATH_OPENING_M) / 2;
    return [{ fr, interval: [middle - half, middle + half], near: gap, span, centre: frontagePoint(fr, middle), faces }];
  });
}

/**
 * A front door onto the floor the room faces, for a room no pathway comes
 * near, tried in turn: the nearest area first. A door whose straight line
 * from its centre to the nearest point of what it faces would cross another
 * room's wall would open onto that room's back, so the next is tried instead
 * (Ruling 10).
 */
function areaDoor(
  frontages: readonly Frontage[], room: Room | undefined, shapes: readonly AreaShape[], pieces: readonly WallPiece[],
): Option | null {
  if (!room) return null;
  for (const option of inTurn(frontages.flatMap(fr => areaOptions(fr, room, shapes)))) {
    const target = nearestOn(option.centre, option.faces);
    if (target && crossesAnotherRoom(option.centre, target, pieces, room.id)) continue;
    return option;
  }
  return null;
}

/**
 * The walls that stand, once every opening is cut out of them.
 *
 * Pathways and doorways open the walls they cross. A walled room that
 * nothing opens gets one front door, on a wall of its own and never one it
 * shares, because a shop front never opens into the shop next door. The door
 * faces the nearest pathway within 3 m. With none in reach, it opens onto the
 * nearest walkable area out in front of its own wall, up to 6 m away, or one
 * its wall stands inside, through at least 0.9 m of wall. A room with neither
 * stays closed. A door may span the joints of a front traced as several
 * pieces running on, or round a kiosk's sides.
 *
 * `rooms` is every live room on this level, walled rooms and areas. The
 * walkable areas among them are what a closed room can open onto; areas are
 * never walled, so their outlines come in here rather than as pieces. A
 * walled room's own footprint says which side of its wall is outside, so a
 * room missing from `rooms` gets no door onto an area.
 */
export function wallRuns(
  pieces: readonly WallPiece[], pathways: readonly Pathway[], doorways: readonly Doorway[],
  rooms: readonly Room[],
): WallPiece[] {
  const cuts: Interval[][] = pieces.map(p => [...pathwayOpenings(p, pathways), ...doorwayOpenings(p, doorways)]);

  const opened = new Set<string>();
  const ownPieces = new Map<string, number[]>();
  pieces.forEach((p, i) => {
    if (cuts[i]!.length > 0) for (const id of p.rooms) opened.add(id);
    if (p.rooms.length === 1) {
      const id = p.rooms[0]!;
      const own = ownPieces.get(id);
      if (own) own.push(i);
      else ownPieces.set(id, [i]);
    }
  });

  const shapes = areaShapes(rooms);
  const byId = new Map(rooms.map(r => [r.id, r]));
  for (const [roomId, own] of ownPieces) {
    if (opened.has(roomId)) continue;
    const frontages = frontagesOf(pieces, own);
    const door = inTurn(frontages.flatMap(fr => pathwayOptions(fr, pathways)))[0]
      ?? areaDoor(frontages, byId.get(roomId), shapes, pieces);
    if (door) cutAcross(cuts, door.fr, door.interval);
  }

  const runs: WallPiece[] = [];
  pieces.forEach((p, i) => {
    const f = frameOf(p);
    if (!f) return;
    for (const [t0, t1] of subtractIntervals(f.len, cuts[i]!, MIN_RUN_M)) {
      runs.push({ a: pointAt(f, t0), b: pointAt(f, t1), thicknessM: p.thicknessM, rooms: p.rooms });
    }
  });
  return runs;
}
