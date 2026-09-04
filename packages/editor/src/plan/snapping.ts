import type { Ring, Vec2 } from "@oth/model";

export type SnapKind = "vertex" | "edge" | "grid" | "none";
export type SnapTarget = { point: Vec2; kind: SnapKind };

export type SnapOptions = { toleranceM: number; gridM?: number };
export type SnapCandidates = { rings: readonly Ring[] };

function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

/** Closest point on segment ab to p, clamped to the segment. */
function closestOnSegment(p: Vec2, a: Vec2, b: Vec2): Vec2 {
  const vx = b[0] - a[0];
  const vy = b[1] - a[1];
  const lenSq = vx * vx + vy * vy;
  if (lenSq === 0) return a;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / lenSq));
  return [a[0] + t * vx, a[1] + t * vy];
}

/**
 * Vertex beats edge beats grid.
 *
 * The precedence is deliberate: when you trace a room against one that already
 * exists you nearly always mean its corner, and a shared corner is what lets two
 * footprints abut exactly rather than leaving a sliver the nav bake would turn
 * into a phantom wall.
 */
export function snapPoint(
  world: Vec2, candidates: SnapCandidates, opts: SnapOptions,
): SnapTarget {
  let best: { point: Vec2; d: number } | null = null;

  for (const ring of candidates.rings) {
    for (const vertex of ring) {
      const d = distance(world, vertex);
      if (d <= opts.toleranceM && (!best || d < best.d)) best = { point: vertex, d };
    }
  }
  if (best) return { point: best.point, kind: "vertex" };

  for (const ring of candidates.rings) {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      if (!a || !b) continue;
      const p = closestOnSegment(world, a, b);
      const d = distance(world, p);
      if (d <= opts.toleranceM && (!best || d < best.d)) best = { point: p, d };
    }
  }
  if (best) return { point: best.point, kind: "edge" };

  if (opts.gridM && opts.gridM > 0) {
    return {
      point: [
        Math.round(world[0] / opts.gridM) * opts.gridM,
        Math.round(world[1] / opts.gridM) * opts.gridM,
      ],
      kind: "grid",
    };
  }

  return { point: world, kind: "none" };
}
