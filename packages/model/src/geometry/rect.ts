import type { Ring, Vec2 } from "../primitives";

/**
 * A rectangle at any angle: centre, the unit axis along its long side, and
 * half its length and width. The axis points east, or north when the
 * rectangle stands exactly upright, so the same outline always gives the
 * same rectangle.
 */
export type OrientedRect = { centre: Vec2; axis: Vec2; halfLength: number; halfWidth: number };

function cross(o: Vec2, a: Vec2, b: Vec2): number {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

/** Andrew's monotone chain; counter-clockwise, no repeated point. */
export function convexHull(points: readonly Vec2[]): Vec2[] {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length <= 2) return pts;
  const lower: Vec2[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Vec2[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]!;
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

function eastward(a: Vec2): Vec2 {
  const flip = a[0] < -1e-9 || (Math.abs(a[0]) <= 1e-9 && a[1] < 0);
  // + 0 turns -0 into 0, so an upright axis compares equal to [0, 1].
  return flip ? [-a[0] + 0, -a[1] + 0] : [a[0] + 0, a[1] + 0];
}

/**
 * The smallest rectangle around an outline. The best rectangle has a side
 * along an edge of the convex hull, so trying each hull edge is exact. It
 * turns a traced escalator into the flight's length, width and direction.
 */
export function minAreaRect(ring: Ring): OrientedRect {
  const hull = convexHull(ring);
  let best: OrientedRect | null = null;
  let bestArea = Infinity;
  for (let i = 0; i < hull.length; i++) {
    const p = hull[i]!;
    const q = hull[(i + 1) % hull.length]!;
    const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (len < 1e-12) continue;
    const u: Vec2 = [(q[0] - p[0]) / len, (q[1] - p[1]) / len];
    const v: Vec2 = [-u[1], u[0]];
    let minU = Infinity;
    let maxU = -Infinity;
    let minV = Infinity;
    let maxV = -Infinity;
    for (const h of hull) {
      const a = h[0] * u[0] + h[1] * u[1];
      const b = h[0] * v[0] + h[1] * v[1];
      minU = Math.min(minU, a);
      maxU = Math.max(maxU, a);
      minV = Math.min(minV, b);
      maxV = Math.max(maxV, b);
    }
    const area = (maxU - minU) * (maxV - minV);
    if (area >= bestArea - 1e-12) continue;
    bestArea = area;
    const cu = (minU + maxU) / 2;
    const cv = (minV + maxV) / 2;
    const long = maxU - minU >= maxV - minV;
    best = {
      centre: [u[0] * cu + v[0] * cv, u[1] * cu + v[1] * cv],
      axis: eastward(long ? u : v),
      halfLength: (long ? maxU - minU : maxV - minV) / 2,
      halfWidth: (long ? maxV - minV : maxU - minU) / 2,
    };
  }
  return best ?? { centre: ring[0] ?? [0, 0], axis: [1, 0], halfLength: 0, halfWidth: 0 };
}

export function rectCorners(r: OrientedRect): Vec2[] {
  const [ux, uy] = r.axis;
  const [vx, vy] = [-uy, ux];
  const [cx, cy] = r.centre;
  const l = r.halfLength;
  const w = r.halfWidth;
  return [
    [cx - ux * l - vx * w, cy - uy * l - vy * w],
    [cx + ux * l - vx * w, cy + uy * l - vy * w],
    [cx + ux * l + vx * w, cy + uy * l + vy * w],
    [cx - ux * l + vx * w, cy - uy * l + vy * w],
  ];
}
