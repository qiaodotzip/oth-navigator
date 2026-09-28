import { distancePointToSegment, pointInPolygon, type Doorway, type Pathway, type Room, type Vec2 } from "@oth/model";
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

/** Where a closed room's front door goes on this piece, if a pathway passes within reach. */
export function shopfrontOpening(
  piece: WallPiece, pathways: readonly Pathway[],
): { interval: Interval; distance: number } | null {
  const f = frameOf(piece);
  if (!f) return null;
  let best: { interval: Interval; distance: number } | null = null;
  for (const pathway of pathways) {
    if (!nearBox(f, pathway.polyline, SHOPFRONT_REACH_M)) continue;
    const width = Math.min(pathway.widthM, MAX_PATH_OPENING_M, f.len);
    for (let i = 0; i + 1 < pathway.polyline.length; i++) {
      const p = pathway.polyline[i]!;
      const q = pathway.polyline[i + 1]!;
      if (!nearBox(f, [p, q], SHOPFRONT_REACH_M)) continue;
      const near = nearestOnPiece(f, p, q);
      if (near.distance > SHOPFRONT_REACH_M) continue;
      // Slid back inside the wall rather than cut short at its end, then
      // ranked by where the door actually is: a side wall's corner can be as
      // near as the front, but a door slid along it is not.
      const middle = Math.max(width / 2, Math.min(f.len - width / 2, near.t));
      const distance = distancePointToSegment(pointAt(f, middle), p, q);
      if (best === null || distance < best.distance) {
        best = { interval: [middle - width / 2, middle + width / 2], distance };
      }
    }
  }
  return best;
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

/** Every edge of the walkable areas among these rooms, holes included: a kiosk can stand in an area's hole. */
function areaEdges(rooms: readonly Room[]): AreaEdge[] {
  const edges: AreaEdge[] = [];
  for (const room of rooms) {
    if (!isWalkableArea(room)) continue;
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
  }
  return edges;
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

/** A stretch of wall with an area in front of it, and how far out the area's nearest edge is. */
type Facing = { interval: Interval; gap: number };

/**
 * The stretches of the piece that a walkable area lies in front of, on the
 * outward side, and how far out. An area's edge counts over the part of the wall
 * it lies in front of, within 45° of the wall's line and within AREA_REACH_M.
 * The gap is measured straight out from the wall. Touching stretches join into
 * one, which keeps the smaller gap, so a traced frontage of many short edges
 * is one long stretch.
 */
function facingStretches(f: Frame, out: Vec2, edges: readonly AreaEdge[]): Facing[] {
  const m = AREA_REACH_M + BOX_SLACK_M;
  const outFrom = (p: Vec2) => (p[0] - f.a[0]) * out[0] + (p[1] - f.a[1]) * out[1];
  const found: Facing[] = [];
  for (const e of edges) {
    if (e.maxX < f.minX - m || e.minX > f.maxX + m || e.maxY < f.minY - m || e.minY > f.maxY + m) continue;
    if (Math.abs(f.ux * e.uy - f.uy * e.ux) > FACING_ANGLE_SIN) continue;
    // Along the wall and out from it both change evenly along the edge, so
    // each bound is one cut of the edge's own 0..1.
    const ta = along(f, e.a), tb = along(f, e.b);
    const ha = outFrom(e.a), hb = outFrom(e.b);
    let [lo, hi] = narrowed(0, 1, ta, tb, 0, f.len);
    [lo, hi] = narrowed(lo, hi, ha, hb, -BEHIND_SLACK_M, AREA_REACH_M);
    if (hi <= lo) continue;
    const t0 = ta + (tb - ta) * lo, t1 = ta + (tb - ta) * hi;
    const h0 = ha + (hb - ha) * lo, h1 = ha + (hb - ha) * hi;
    found.push({ interval: [Math.min(t0, t1), Math.max(t0, t1)], gap: Math.max(0, Math.min(h0, h1)) });
  }

  found.sort((p, q) => p.interval[0] - q.interval[0]);
  const joined: Array<{ interval: [number, number]; gap: number }> = [];
  for (const { interval: [from, to], gap } of found) {
    const last = joined[joined.length - 1];
    if (last && from <= last.interval[1] + BOX_SLACK_M) {
      last.interval[1] = Math.max(last.interval[1], to);
      last.gap = Math.min(last.gap, gap);
    } else joined.push({ interval: [from, to], gap });
  }
  return joined;
}

/**
 * The stretches of a room's own wall that a walkable area among `rooms` lies
 * in front of, as the door fallback sees them. The wall's room must be among
 * `rooms`, since its footprint says which side is outside.
 */
export function areaFacing(piece: WallPiece, rooms: readonly Room[]): Interval[] {
  const f = frameOf(piece);
  const room = piece.rooms.length === 1 ? rooms.find(r => r.id === piece.rooms[0]) : undefined;
  const out = f && room ? outwardOf(f, room) : null;
  return f && out ? facingStretches(f, out, areaEdges(rooms)).map(s => s.interval) : [];
}

type Door = { index: number; interval: Interval };

/** A front door facing the nearest pathway within reach, on one of the room's own pieces. */
function pathwayDoor(pieces: readonly WallPiece[], own: readonly number[], pathways: readonly Pathway[]): Door | null {
  let best: (Door & { distance: number }) | null = null;
  for (const index of own) {
    const door = shopfrontOpening(pieces[index]!, pathways);
    if (door && (best === null || door.distance < best.distance)) best = { index, ...door };
  }
  return best;
}

/**
 * A front door onto the floor the room faces, for a room no pathway comes
 * near. It goes on the stretch of own wall with the nearest area in front,
 * and between stretches equally near, on the longest. It is as wide as a
 * pathway's opening at most, and centred on the stretch. A stretch narrower
 * than MIN_DOOR_M gets no door.
 */
function areaDoor(
  pieces: readonly WallPiece[], own: readonly number[], room: Room | undefined, edges: readonly AreaEdge[],
): Door | null {
  if (!room) return null;
  let best: { index: number; stretch: Interval; gap: number } | null = null;
  for (const index of own) {
    const f = frameOf(pieces[index]!);
    const out = f && outwardOf(f, room);
    if (!f || !out) continue;
    for (const { interval: stretch, gap } of facingStretches(f, out, edges)) {
      const length = stretch[1] - stretch[0];
      if (length + 1e-9 < MIN_DOOR_M) continue;
      if (best === null || gap < best.gap || (gap === best.gap && length > best.stretch[1] - best.stretch[0])) {
        best = { index, stretch, gap };
      }
    }
  }
  if (best === null) return null;
  const [from, to] = best.stretch;
  const middle = (from + to) / 2;
  const half = Math.min(to - from, MAX_PATH_OPENING_M) / 2;
  return { index: best.index, interval: [middle - half, middle + half] };
}

/**
 * The walls that stand, once every opening is cut out of them.
 *
 * Pathways and doorways open the walls they cross. A walled room that
 * nothing opens gets one front door, on a wall of its own and never one it
 * shares, because a shop front never opens into the shop next door. The door
 * faces the nearest pathway within 3 m. With none in reach, it opens onto the
 * nearest walkable area out in front of one of its own walls, up to 6 m
 * away, through at least 0.9 m of wall. A room with neither stays closed.
 *
 * `rooms` are the floor's rooms. The walkable areas among them are what a
 * closed room can open onto; areas are never walled, so their outlines come
 * in here rather than as pieces. A walled room's own footprint says which
 * side of its wall is outside, so a room missing from `rooms` gets no door
 * onto an area.
 */
export function wallRuns(
  pieces: readonly WallPiece[], pathways: readonly Pathway[], doorways: readonly Doorway[],
  rooms: readonly Room[] = [],
): WallPiece[] {
  const cuts: Interval[][] = pieces.map(p => [...pathwayOpenings(p, pathways), ...doorwayOpenings(p, doorways)]);

  const opened = new Set<string>();
  const ownPieces = new Map<string, number[]>();
  pieces.forEach((p, i) => {
    if (cuts[i]!.length > 0) for (const id of p.rooms) opened.add(id);
    if (p.rooms.length === 1) {
      const id = p.rooms[0]!;
      ownPieces.set(id, [...(ownPieces.get(id) ?? []), i]);
    }
  });

  const edges = areaEdges(rooms);
  const byId = new Map(rooms.map(r => [r.id, r]));
  for (const [roomId, own] of ownPieces) {
    if (opened.has(roomId)) continue;
    const door = pathwayDoor(pieces, own, pathways) ?? areaDoor(pieces, own, byId.get(roomId), edges);
    if (door) cuts[door.index]!.push(door.interval);
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
