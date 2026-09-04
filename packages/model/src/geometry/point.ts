import type { BBox, Ring, Vec2 } from "../primitives";

export const EMPTY_BBOX: BBox = {
  minX: Number.POSITIVE_INFINITY,
  minY: Number.POSITIVE_INFINITY,
  maxX: Number.NEGATIVE_INFINITY,
  maxY: Number.NEGATIVE_INFINITY,
};

/** Ray casting. Behaviour exactly on an edge is unspecified and never relied upon. */
export function pointInRing(p: Vec2, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (!a || !b) continue;
    const intersects =
      a[1] > p[1] !== b[1] > p[1] &&
      p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0];
    if (intersects) inside = !inside;
  }
  return inside;
}

/** Inside the outer ring and outside every hole. */
export function pointInPolygon(p: Vec2, outer: Ring, holes: readonly Ring[] = []): boolean {
  if (!pointInRing(p, outer)) return false;
  for (const h of holes) {
    if (pointInRing(p, h)) return false;
  }
  return true;
}

export function bboxOfRing(ring: Ring): BBox {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const p of ring) {
    if (p[0] < minX) minX = p[0];
    if (p[1] < minY) minY = p[1];
    if (p[0] > maxX) maxX = p[0];
    if (p[1] > maxY) maxY = p[1];
  }
  return { minX, minY, maxX, maxY };
}

export function bboxOfRings(rings: readonly Ring[]): BBox {
  let acc = EMPTY_BBOX;
  for (const r of rings) {
    const b = bboxOfRing(r);
    acc = {
      minX: Math.min(acc.minX, b.minX),
      minY: Math.min(acc.minY, b.minY),
      maxX: Math.max(acc.maxX, b.maxX),
      maxY: Math.max(acc.maxY, b.maxY),
    };
  }
  return acc;
}

export function bboxContains(outer: BBox, inner: BBox): boolean {
  return (
    inner.minX >= outer.minX &&
    inner.minY >= outer.minY &&
    inner.maxX <= outer.maxX &&
    inner.maxY <= outer.maxY
  );
}
