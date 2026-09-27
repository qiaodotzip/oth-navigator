import { live, pointInPolygon, ringArea, type MapModel, type Room, type Vec2 } from "@oth/model";

/**
 * A lift is a shaft, so its stop on the next floor is at the same plan position.
 * Levels share one building origin, which is what makes "the same spot" a test.
 */
const SAME_SHAFT_M = 3;

type Placed<T> = { ok: true } & T;
type Refused = { ok: false; reason: string };

/** Spaces on this level under the point, smallest first — the most specific wins. */
function spacesAt(model: MapModel, levelId: string, point: Vec2): Room[] {
  return live(model.rooms)
    .filter(r => r.levelId === levelId)
    // A detail is furniture standing on the floor, and a void is a hole in it.
    .filter(r => r.kind !== "detail" && r.kind !== "void")
    .filter(r => pointInPolygon(point, r.footprint, r.holes))
    .sort((a, b) => ringArea(a.footprint) - ringArea(b.footprint));
}

/**
 * Where an entrance clicked here belongs.
 *
 * Routing floods outward from each entrance, so an entrance has to stand on
 * walkable floor: a walkable area wins over a shop drawn inside it, even though
 * the shop is the smaller of the two.
 */
export function entranceAt(
  model: MapModel, levelId: string, point: Vec2, now = Date.now(),
): Placed<{ entrance: { id: string; levelId: string; roomId: string; point: Vec2 } }> | Refused {
  const spaces = spacesAt(model, levelId, point);
  const room = spaces.find(r => r.walkable) ?? spaces[0];
  if (!room) {
    return { ok: false, reason: "An entrance goes inside an area. Click inside one, or draw the area first." };
  }
  return { ok: true, entrance: { id: `${levelId}-entrance-${now}`, levelId, roomId: room.id, point } };
}

/**
 * A lift or stair stop clicked here: a new one, or the next stop of one that
 * already serves another level at this spot.
 */
export function portalEndpointAt(
  model: MapModel, levelId: string, point: Vec2, now = Date.now(),
): Placed<{
  /** Null when the stop joins a lift or stair that already exists. */
  portal: { id: string; kind: "lift" } | null;
  endpoint: { id: string; portalId: string; levelId: string; roomId: string; point: Vec2 };
}> | Refused {
  const room = spacesAt(model, levelId, point)[0];
  if (!room) {
    return { ok: false, reason: "A lift or stair stops inside an area or room. Click inside one." };
  }

  const endpoints = live(model.portalEndpoints);
  const stopsHere = new Set(endpoints.filter(e => e.levelId === levelId).map(e => e.portalId));
  const distance = (p: Vec2) => Math.hypot(p[0] - point[0], p[1] - point[1]);
  const shaft = endpoints
    .filter(e => e.levelId !== levelId && !stopsHere.has(e.portalId))
    .filter(e => distance(e.point) <= SAME_SHAFT_M)
    .sort((a, b) => distance(a.point) - distance(b.point))[0];

  const portal = shaft ? null : { id: `portal-${now}`, kind: "lift" as const };
  return {
    ok: true,
    portal,
    endpoint: {
      id: `${levelId}-portal-${now}`,
      portalId: shaft?.portalId ?? portal!.id,
      levelId,
      roomId: room.id,
      point,
    },
  };
}
