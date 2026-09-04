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
  if (
    ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
    ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
  ) {
    return true;
  }
  return false;
}

export function isInWalkableLandmark(pt: Pt, floor: Floor): boolean {
  for (const p of floor.polygons) {
    if (p.type === "landmark" || p.type === "corridor" || p.type === "void") {
      if (pointInPolygon(pt, p.points)) return true;
    }
  }
  return false;
}

function pointInRect(pt: Pt, rect: [Pt, Pt], margin = 0): boolean {
  const [[x1, y1], [x2, y2]] = rect;
  return (
    pt[0] >= Math.min(x1, x2) - margin &&
    pt[0] <= Math.max(x1, x2) + margin &&
    pt[1] >= Math.min(y1, y2) - margin &&
    pt[1] <= Math.max(y1, y2) + margin
  );
}

/**
 * Detail types you cannot walk through. Football pitches are open fields you
 * CAN walk across, so they are not here. Barriers (gates/fences) and sports
 * courts block.
 */
const ROUTE_BLOCKING_DETAILS = new Set([
  "barrier",
  "court",
  "wall",
  "stadium-seats",
]);

/** Walkway details define where you CAN walk (the deck / paved path). */
export function isOnWalkway(pt: Pt, floor: Floor): boolean {
  for (const d of floor.details ?? []) {
    if (d.type === "walkway-bridge" && "rect" in d && pointInRect(pt, d.rect, 0.4)) return true;
    if (d.type === "walkway" && "points" in d && pointInPolygon(pt, d.points)) return true;
  }
  return false;
}

/**
 * A floor "constrained to walkways" only lets you walk on walkways / landmarks /
 * destination rooms — open space (the tile, e.g. open air on an upper deck) is
 * NOT walkable. Auto-detected: true once the floor defines any walkway.
 */
export function floorHasWalkways(floor: Floor): boolean {
  return (floor.details ?? []).some(d => d.type === "walkway" || d.type === "walkway-bridge");
}

// Inflate barrier hit-tests so thin gate strips reliably block the A* grid
// (cell centres are 1.2m apart; a 0.5m-thin gate could otherwise be stepped over).
const BARRIER_MARGIN = 0.9;

/** Blocking details cut movement even inside walkable landmarks. */
export function isInBarrier(pt: Pt, floor: Floor): boolean {
  for (const d of floor.details ?? []) {
    if (
      ROUTE_BLOCKING_DETAILS.has(d.type) &&
      "rect" in d &&
      pointInRect(pt, d.rect, BARRIER_MARGIN)
    ) {
      return true;
    }
  }
  return false;
}

export function isPointWalkable(
  pt: Pt,
  floor: Floor,
  destRoomId?: string,
): boolean {
  if (
    pt[0] < 0 ||
    pt[1] < 0 ||
    pt[0] > floor.bounds.width ||
    pt[1] > floor.bounds.depth
  ) {
    return false;
  }
  // Barriers block first — they cut through landmarks (e.g. gated town square).
  if (isInBarrier(pt, floor)) return false;
  // Walkways are explicit walkable surfaces (decks / paved paths).
  if (isOnWalkway(pt, floor)) return true;
  if (isInWalkableLandmark(pt, floor)) return true;
  let inDestRoom = false;
  for (const poly of floor.polygons) {
    if (poly.type !== "room") continue;
    if (!pointInPolygon(pt, poly.points)) continue;
    if (poly.id === destRoomId) inDestRoom = true;
    else return false; // a non-destination room blocks
  }
  if (inDestRoom) return true;
  // Open space (no polygon): walkable on ground floors, but NOT on floors whose
  // walkable area is defined by walkways (so the guide stays off the open tile).
  return floorHasWalkways(floor) ? false : true;
}

export type BlockReport = {
  blocked: boolean;
  blockingRoomIds: string[];
};

/**
 * Checks if a straight line from `start` to `end` ever passes through a
 * non-destination room polygon. Landmarks override rooms (the same cell can
 * sit inside both an overlapping landmark and a room — landmark wins).
 */
export function checkSegment(
  start: Pt,
  end: Pt,
  floor: Floor,
  destinationRoomId?: string,
): BlockReport {
  const SAMPLES = 80;
  const blocking = new Set<string>();
  for (let i = 0; i <= SAMPLES; i++) {
    const t = i / SAMPLES;
    const x = start[0] + (end[0] - start[0]) * t;
    const y = start[1] + (end[1] - start[1]) * t;
    const pt: Pt = [x, y];
    if (isInBarrier(pt, floor)) {
      blocking.add("barrier");
      continue;
    }
    if (isOnWalkway(pt, floor)) continue;
    if (isInWalkableLandmark(pt, floor)) continue;
    let inAnyRoom = false;
    for (const poly of floor.polygons) {
      if (poly.type !== "room") continue;
      if (!pointInPolygon(pt, poly.points)) continue;
      inAnyRoom = true;
      if (poly.id !== destinationRoomId) blocking.add(poly.id);
    }
    // Off-walkway open space counts as blocked on walkway-constrained floors.
    if (!inAnyRoom && floorHasWalkways(floor)) blocking.add("off-walkway");
  }
  return { blocked: blocking.size > 0, blockingRoomIds: Array.from(blocking) };
}
