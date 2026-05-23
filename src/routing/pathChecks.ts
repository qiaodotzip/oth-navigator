import type { Floor } from "@/data/types";

export type Pt = [number, number];

export function pointInPolygon(point: Pt, polygon: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    const intersect =
      yi > point[1] !== yj > point[1] &&
      point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function ccw(a: Pt, b: Pt, c: Pt): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

export function segmentsIntersect(p1: Pt, p2: Pt, p3: Pt, p4: Pt): boolean {
  const d1 = ccw(p3, p4, p1);
  const d2 = ccw(p3, p4, p2);
  const d3 = ccw(p1, p2, p3);
  const d4 = ccw(p1, p2, p4);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
      ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }
  return false;
}

export function segmentCrossesPolygon(start: Pt, end: Pt, polygon: Pt[]): boolean {
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    if (segmentsIntersect(start, end, a, b)) return true;
  }
  return false;
}

export type BlockReport = {
  blocked: boolean;
  blockingRoomIds: string[];
};

/**
 * Checks if a line segment from `start` to `end` passes through any room
 * polygon on the floor, *excluding* the room with `destinationRoomId`
 * (the route's intended end). Landmarks, corridors, and voids are walkable.
 */
export function checkSegment(
  start: Pt,
  end: Pt,
  floor: Floor,
  destinationRoomId?: string,
): BlockReport {
  const blocking: string[] = [];
  for (const poly of floor.polygons) {
    if (poly.type !== "room") continue;
    if (poly.id === destinationRoomId) continue;
    const crossesEdge = segmentCrossesPolygon(start, end, poly.points);
    const startInside = pointInPolygon(start, poly.points);
    const endInside = pointInPolygon(end, poly.points);
    if (crossesEdge || startInside || endInside) {
      blocking.push(poly.id);
    }
  }
  return { blocked: blocking.length > 0, blockingRoomIds: blocking };
}
