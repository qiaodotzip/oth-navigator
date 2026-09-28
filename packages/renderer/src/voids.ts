import {
  distancePointToSegment, pointInPolygon, pointInRing, segmentsProperlyIntersect,
  type Ring, type Room, type RoomKind, type Vec2,
} from "@oth/model";

/** Spec §7: a 1.1 m balustrade around a void's edge. */
export const BALUSTRADE_HEIGHT_M = 1.1;
/** Thin: glass and a handrail, not a wall. */
export const BALUSTRADE_THICKNESS_M = 0.08;

/** The kinds that are floor. A detail stands on the floor; a void is the lack of one. */
const FLOORED: ReadonlySet<RoomKind> = new Set<RoomKind>(["room", "area", "service"]);

/** A stretch of balustrade. It has the same shape as a wall piece, so one builder stands both. */
export type Rail = { a: Vec2; b: Vec2; thicknessM: number; rooms: string[] };

/** A corner within a millimetre of an edge is on it. */
const ON_EDGE_M = 1e-3;

function cornerOnEdge(corners: Ring, ring: Ring): boolean {
  return corners.some(p =>
    ring.some((a, i) => distancePointToSegment(p, a, ring[(i + 1) % ring.length]!) < ON_EDGE_M),
  );
}

/**
 * Whether the rings meet without properly crossing. Any touch or shared stretch
 * of edge puts a corner of one ring on an edge of the other.
 */
function touches(p: Ring, q: Ring): boolean {
  return cornerOnEdge(p, q) || cornerOnEdge(q, p);
}

function edgesCross(p: Ring, q: Ring): boolean {
  for (let i = 0; i < p.length; i++) {
    const a = p[i]!;
    const b = p[(i + 1) % p.length]!;
    for (let j = 0; j < q.length; j++) {
      if (segmentsProperlyIntersect(a, b, q[j]!, q[(j + 1) % q.length]!)) return true;
    }
  }
  return false;
}

/**
 * Whether `inner` lies wholly on the slab's floor: inside its outline and
 * clear of its holes.
 *
 * Every corner inside is not enough, since an edge can still cross a notch
 * of an L-shaped floor, and a hole already there must not overlap the new
 * one. Either would make a slab its triangulation cannot draw. A void that
 * only touches the slab's edge or a hole's is left uncut rather than guessed
 * at, because ray casting gives a corner on an edge no reliable answer: it
 * counts one on a left or bottom edge as inside and one on a right or top
 * edge as outside.
 */
export function floorContains(slab: Room, inner: Ring): boolean {
  if (!inner.every(p => pointInPolygon(p, slab.footprint, slab.holes))) return false;
  if (edgesCross(inner, slab.footprint) || touches(inner, slab.footprint)) return false;
  for (const hole of slab.holes) {
    if (edgesCross(inner, hole) || touches(inner, hole)) return false;
    if (hole.some(p => pointInRing(p, inner))) return false;
  }
  return true;
}

/**
 * Cuts the voids in turn. Each one sees the holes cut before it, so a void
 * drawn twice, or one sharing an edge with another, is cut only once.
 */
function cutVoids(rooms: readonly Room[]): { holes: Map<string, Room["holes"]>; cut: Room[] } {
  const holes = new Map<string, Room["holes"]>();
  const cut: Room[] = [];
  for (const opening of rooms.filter(r => r.kind === "void")) {
    let cuts = false;
    for (const slab of rooms) {
      if (slab.levelId !== opening.levelId || !FLOORED.has(slab.kind)) continue;
      const already = holes.get(slab.id) ?? [];
      if (!floorContains({ ...slab, holes: [...slab.holes, ...already] }, opening.footprint)) continue;
      holes.set(slab.id, [...already, opening.footprint]);
      cuts = true;
    }
    if (cuts) cut.push(opening);
  }
  return { holes, cut };
}

/**
 * Spec §7: a void cuts itself out of any slab on its floor that contains it.
 * Keyed by the slab's room id; each value is extra holes for that slab.
 */
export function voidHoles(rooms: readonly Room[]): Map<string, Room["holes"]> {
  return cutVoids(rooms).holes;
}

/**
 * A balustrade along every edge of every void that cuts a floor. A void left
 * uncut has no drop to guard, so it gets none.
 */
export function balustradeRuns(rooms: readonly Room[]): Rail[] {
  const rails: Rail[] = [];
  for (const opening of cutVoids(rooms).cut) {
    const ring = opening.footprint;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]!;
      const b = ring[(i + 1) % ring.length]!;
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 1e-6) continue;
      rails.push({ a, b, thicknessM: BALUSTRADE_THICKNESS_M, rooms: [opening.id] });
    }
  }
  return rails;
}
