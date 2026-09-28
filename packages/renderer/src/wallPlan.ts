import type { Room, Vec2 } from "@oth/model";
import { subtractIntervals, type Interval } from "./intervals";

/**
 * Neighbouring rooms' edges that are parallel and this close are one wall,
 * the drawing's own partition traced from both sides. Spec §7 says 0.4 m;
 * Plan 5D Ruling 6 raised it because 42 m of L1's neighbouring edges sit
 * 0.4–0.5 m apart, and would otherwise stand as two walls with a slot between.
 */
export const MERGE_GAP_M = 0.5;
/** A wall's thickness when nothing says otherwise: the old shell's. */
export const DEFAULT_WALL_M = 0.15;
/** Edges within 5° of parallel can be one wall. A traced line wanders that much. */
const MERGE_ANGLE_SIN = Math.sin((5 * Math.PI) / 180);
/** A shorter shared stretch is two corners touching, not a wall. */
const MIN_SHARED_M = 0.1;
/** A shorter leftover is rounding at a corner. */
const MIN_PIECE_M = 0.05;

/**
 * One wall on the plan: its centre line, its thickness, and the rooms it
 * encloses. That is one room, or two when the wall is shared.
 */
export type WallPiece = { a: Vec2; b: Vec2; thicknessM: number; rooms: string[] };

type Edge = {
  a: Vec2; b: Vec2; roomId: string; len: number; ux: number; uy: number;
  minX: number; maxX: number; minY: number; maxY: number;
};

function edgesOf(room: Room): Edge[] {
  const edges: Edge[] = [];
  for (const ring of [room.footprint, ...room.holes]) {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]!;
      const b = ring[(i + 1) % ring.length]!;
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len < 1e-6) continue;
      edges.push({
        a, b, roomId: room.id, len, ux: (b[0] - a[0]) / len, uy: (b[1] - a[1]) / len,
        minX: Math.min(a[0], b[0]), maxX: Math.max(a[0], b[0]),
        minY: Math.min(a[1], b[1]), maxY: Math.max(a[1], b[1]),
      });
    }
  }
  return edges;
}

/** Metres along the edge to the foot of `p`. */
const along = (e: Edge, p: Vec2) => (p[0] - e.a[0]) * e.ux + (p[1] - e.a[1]) * e.uy;
const pointAt = (e: Edge, t: number): Vec2 => [e.a[0] + e.ux * t, e.a[1] + e.uy * t];
const midpoint = (p: Vec2, q: Vec2): Vec2 => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
const distance = (p: Vec2, q: Vec2) => Math.hypot(p[0] - q[0], p[1] - q[1]);

/** Whether all but a sliver of the stretch from t0 to t1 is already a shared wall. */
function alreadyShared(shares: readonly Interval[], t0: number, t1: number): boolean {
  const from = Math.min(t0, t1);
  const to = Math.max(t0, t1);
  const free = subtractIntervals(to - from, shares.map(([p, q]): Interval => [p - from, q - from]));
  return free.reduce((sum, [p, q]) => sum + q - p, 0) < MIN_SHARED_M;
}

/**
 * Every room's boundary as wall pieces, with one wall wherever two rooms meet.
 *
 * Where two rooms share a boundary the old shell stood two walls, one per
 * room, and the drawing's partition read twice. Here the stretch two edges
 * share becomes one piece midway between them, owned by both. Whatever is
 * left of each edge stays a wall of its own room.
 *
 * `stats.pairsTested` counts the pairs of edges the sweep compares, so a test
 * can prove it stays a sweep without timing it.
 */
export function wallPieces(rooms: readonly Room[], stats?: { pairsTested: number }): WallPiece[] {
  // Sorted west to east, so each edge meets only the few that overlap it in x:
  // a whole floor is thousands of edges, and every pair would be millions.
  const edges = rooms.flatMap(edgesOf).sort((p, q) => p.minX - q.minX);
  const covered: Interval[][] = edges.map(() => []);
  const pieces: WallPiece[] = [];

  for (let i = 0; i < edges.length; i++) {
    const e = edges[i]!;
    for (let j = i + 1; j < edges.length; j++) {
      const f = edges[j]!;
      if (f.minX > e.maxX + MERGE_GAP_M) break;
      if (stats) stats.pairsTested++;
      if (f.roomId === e.roomId) continue;
      if (f.minY > e.maxY + MERGE_GAP_M || f.maxY < e.minY - MERGE_GAP_M) continue;
      if (Math.abs(e.ux * f.uy - e.uy * f.ux) > MERGE_ANGLE_SIN) continue;

      // The stretch of e that f runs alongside.
      const s0 = along(e, f.a);
      const s1 = along(e, f.b);
      const t0 = Math.max(0, Math.min(s0, s1));
      const t1 = Math.min(e.len, Math.max(s0, s1));
      if (t1 - t0 < MIN_SHARED_M) continue;

      const p0 = pointAt(e, t0);
      const p1 = pointAt(e, t1);
      const q0 = pointAt(f, along(f, p0));
      const q1 = pointAt(f, along(f, p1));
      const gap0 = distance(p0, q0);
      const gap1 = distance(p1, q1);
      if (gap0 > MERGE_GAP_M || gap1 > MERGE_GAP_M) continue;

      // A room thinner than the merge gap puts the rooms either side of it
      // within reach of each other. Once a stretch is shared it is taken: a
      // second wall over it would stand across the thin room, stacked on the first.
      const u0 = along(f, q0);
      const u1 = along(f, q1);
      if (alreadyShared(covered[i]!, t0, t1) || alreadyShared(covered[j]!, u0, u1)) continue;

      pieces.push({
        a: midpoint(p0, q0),
        b: midpoint(p1, q1),
        // Coincident edges have no gap to measure. They still get a wall.
        thicknessM: Math.max((gap0 + gap1) / 2, DEFAULT_WALL_M),
        rooms: [e.roomId, f.roomId],
      });
      covered[i]!.push([t0, t1]);
      covered[j]!.push([u0, u1]);
    }
  }

  edges.forEach((e, i) => {
    for (const [t0, t1] of subtractIntervals(e.len, covered[i]!, MIN_PIECE_M)) {
      pieces.push({ a: pointAt(e, t0), b: pointAt(e, t1), thicknessM: DEFAULT_WALL_M, rooms: [e.roomId] });
    }
  });
  return pieces;
}
