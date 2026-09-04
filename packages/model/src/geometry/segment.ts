import type { Vec2 } from "../primitives";

/** Cross product of (a-o) and (b-o). Sign gives orientation. */
function cross(o: Vec2, a: Vec2, b: Vec2): number {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

/**
 * True only when the segments cross at an interior point of both. Shared
 * endpoints and T-touches are deliberately excluded: consecutive polygon edges
 * always share an endpoint, and treating that as an intersection would flag
 * every valid ring.
 */
export function segmentsProperlyIntersect(p1: Vec2, p2: Vec2, q1: Vec2, q2: Vec2): boolean {
  const d1 = cross(q1, q2, p1);
  const d2 = cross(q1, q2, p2);
  const d3 = cross(p1, p2, q1);
  const d4 = cross(p1, p2, q2);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/** Shortest distance from a point to a segment, clamped to the segment's ends. */
export function distancePointToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const vx = b[0] - a[0];
  const vy = b[1] - a[1];
  const lenSq = vx * vx + vy * vy;
  let t = 0;
  if (lenSq > 0) {
    t = ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / lenSq;
    t = Math.max(0, Math.min(1, t));
  }
  const dx = p[0] - (a[0] + t * vx);
  const dy = p[1] - (a[1] + t * vy);
  return Math.sqrt(dx * dx + dy * dy);
}
