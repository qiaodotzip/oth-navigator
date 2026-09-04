import type { Ring, Vec2 } from "@oth/model";

/** Below three points it is no longer a ring, and the model would reject it. */
export const MIN_RING_LENGTH = 3;

export function moveVertex(ring: Ring, index: number, to: Vec2): Ring {
  if (index < 0 || index >= ring.length) return ring;
  const next = ring.slice();
  next[index] = to;
  return next;
}

/** Inserts a point into the edge running from `afterIndex` to the next vertex. */
export function insertVertex(ring: Ring, afterIndex: number, point: Vec2): Ring {
  const next = ring.slice();
  next.splice(afterIndex + 1, 0, point);
  return next;
}

export function deleteVertex(ring: Ring, index: number): Ring {
  if (ring.length <= MIN_RING_LENGTH) return ring;
  if (index < 0 || index >= ring.length) return ring;
  const next = ring.slice();
  next.splice(index, 1);
  return next;
}

function distanceToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const vx = b[0] - a[0];
  const vy = b[1] - a[1];
  const lenSq = vx * vx + vy * vy;
  const t = lenSq === 0
    ? 0
    : Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / lenSq));
  return Math.hypot(p[0] - (a[0] + t * vx), p[1] - (a[1] + t * vy));
}

/** Index of the edge whose start vertex is returned; -1 when the ring has no edges. */
export function nearestEdgeIndex(ring: Ring, p: Vec2): number {
  if (ring.length < 2) return -1;
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    if (!a || !b) continue;
    const d = distanceToSegment(p, a, b);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}
