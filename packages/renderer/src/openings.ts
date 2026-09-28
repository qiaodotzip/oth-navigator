import { distancePointToSegment, type Doorway, type Pathway, type Room, type Vec2 } from "@oth/model";
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
 * How near an area's edge must run alongside a wall for a closed room with no
 * pathway in reach to get its front door there: the same 0.5 m within which
 * two rooms' edges are one wall, the drawing's partition between them.
 */
export const AREA_FACING_M = 0.5;
/** Edges within 5° of parallel face each other. A traced line wanders that much. */
const FACING_ANGLE_SIN = Math.sin((5 * Math.PI) / 180);
/** A shorter stretch is two corners touching, not a wall facing an area. */
const MIN_FACING_M = 0.1;
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

/** Overlapping or touching stretches as one, in order along the wall. */
function joined(stretches: Interval[]): Interval[] {
  const sorted = [...stretches].sort((p, q) => p[0] - q[0]);
  const out: Array<[number, number]> = [];
  for (const [from, to] of sorted) {
    const last = out[out.length - 1];
    if (last && from <= last[1] + BOX_SLACK_M) last[1] = Math.max(last[1], to);
    else out.push([from, to]);
  }
  return out;
}

/** The stretches of the piece that an area's edge runs alongside, near enough to face it. */
function facingStretches(f: Frame, edges: readonly AreaEdge[]): Interval[] {
  const m = AREA_FACING_M + BOX_SLACK_M;
  const stretches: Interval[] = [];
  for (const e of edges) {
    if (e.maxX < f.minX - m || e.minX > f.maxX + m || e.maxY < f.minY - m || e.minY > f.maxY + m) continue;
    if (Math.abs(f.ux * e.uy - f.uy * e.ux) > FACING_ANGLE_SIN) continue;
    const s0 = along(f, e.a);
    const s1 = along(f, e.b);
    const t0 = Math.max(0, Math.min(s0, s1));
    const t1 = Math.min(f.len, Math.max(s0, s1));
    if (t1 <= t0) continue;
    // Measured at both ends of the stretch, as two rooms' edges are for one wall.
    if (distancePointToSegment(pointAt(f, t0), e.a, e.b) > AREA_FACING_M) continue;
    if (distancePointToSegment(pointAt(f, t1), e.a, e.b) > AREA_FACING_M) continue;
    stretches.push([t0, t1]);
  }
  return joined(stretches).filter(([from, to]) => to - from >= MIN_FACING_M);
}

/** The stretches of a piece that a walkable area among `rooms` runs alongside, within AREA_FACING_M. */
export function areaFacing(piece: WallPiece, rooms: readonly Room[]): Interval[] {
  const f = frameOf(piece);
  return f ? facingStretches(f, areaEdges(rooms)) : [];
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
 * near: as wide as a pathway's opening at most, centred on the room's
 * longest stretch of own wall that faces a walkable area.
 */
function areaDoor(pieces: readonly WallPiece[], own: readonly number[], edges: readonly AreaEdge[]): Door | null {
  let best: { index: number; stretch: Interval } | null = null;
  for (const index of own) {
    const f = frameOf(pieces[index]!);
    if (!f) continue;
    for (const stretch of facingStretches(f, edges)) {
      if (best === null || stretch[1] - stretch[0] > best.stretch[1] - best.stretch[0]) best = { index, stretch };
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
 * faces the nearest pathway within 3 m. With none in reach, it opens onto
 * the walkable area the room faces for longest. A room with neither stays
 * closed.
 *
 * `rooms` are the floor's rooms, and the walkable areas among them are what
 * a closed room can open onto. Areas are never walled, so their outlines
 * come in here rather than as pieces.
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
  for (const [roomId, own] of ownPieces) {
    if (opened.has(roomId)) continue;
    const door = pathwayDoor(pieces, own, pathways) ?? areaDoor(pieces, own, edges);
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
