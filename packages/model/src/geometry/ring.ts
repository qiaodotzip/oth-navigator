import type { Ring, Vec2 } from "../primitives";
import { segmentsProperlyIntersect } from "./segment";

/**
 * Signed area by the shoelace formula. Positive is counter-clockwise in plan
 * coordinates (x east, y north). Magnitude is the area in square metres.
 */
export function ringArea(ring: Ring): number {
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    if (!a || !b) continue;
    sum += a[0] * b[1] - b[0] * a[1];
  }
  return sum / 2;
}

export function ringIsClockwise(ring: Ring): boolean {
  return ringArea(ring) < 0;
}

/**
 * Canonical form: counter-clockwise, with no repeated closing point. Every
 * downstream predicate assumes this, so footprints are normalised on the way in.
 */
export function normaliseRing(ring: Ring): Vec2[] {
  let pts: Vec2[] = ring.map(p => [p[0], p[1]] as Vec2);
  const first = pts[0];
  const last = pts[pts.length - 1];
  if (pts.length > 1 && first && last && first[0] === last[0] && first[1] === last[1]) {
    pts = pts.slice(0, -1);
  }
  return ringIsClockwise(pts) ? pts.reverse() : pts;
}

/**
 * A ring is simple when no two non-adjacent edges cross and no vertex repeats.
 * Self-intersecting footprints break point-in-polygon, area and rasterisation,
 * so this is a blocking validation error rather than a warning.
 */
export function ringIsSimple(ring: Ring): boolean {
  const n = ring.length;
  if (n < 3) return false;

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = ring[i];
      const b = ring[j];
      if (a && b && a[0] === b[0] && a[1] === b[1]) return false;
    }
  }

  for (let i = 0; i < n; i++) {
    const p1 = ring[i];
    const p2 = ring[(i + 1) % n];
    if (!p1 || !p2) return false;
    for (let j = i + 1; j < n; j++) {
      // Adjacent edges share an endpoint by construction; skip them.
      if (j === i + 1) continue;
      if (i === 0 && j === n - 1) continue;
      const q1 = ring[j];
      const q2 = ring[(j + 1) % n];
      if (!q1 || !q2) return false;
      if (segmentsProperlyIntersect(p1, p2, q1, q2)) return false;
    }
  }
  return true;
}

/**
 * The area-weighted centroid of a ring.
 *
 * Not the average of the vertices: a hand-traced footprint often has several
 * points bunched along one edge, and a vertex average would be dragged toward
 * them. A ring with no area — every point collinear — has no meaningful
 * centroid, so the vertex average is the honest fallback there.
 */
export function ringCentroid(ring: Ring): Vec2 {
  let twiceArea = 0;
  let x = 0;
  let y = 0;

  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    const cross = a[0] * b[1] - b[0] * a[1];
    twiceArea += cross;
    x += (a[0] + b[0]) * cross;
    y += (a[1] + b[1]) * cross;
  }

  if (twiceArea === 0) {
    const n = ring.length;
    return [
      ring.reduce((sum, p) => sum + p[0], 0) / n,
      ring.reduce((sum, p) => sum + p[1], 0) / n,
    ];
  }

  return [x / (3 * twiceArea), y / (3 * twiceArea)];
}
