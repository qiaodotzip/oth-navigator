import {
  bboxOfRing, live, pointInPolygon, ringCentroid,
  type MapModel, type PortalKind, type Ring, type Room, type Vec2,
} from "@oth/model";
import { portalEndpointAt } from "../flow/placePoint";

export type StopKind = "lift" | "escalator" | "stair";

/**
 * A point inside the ring and clear of its holes. The centroid if that is
 * inside, and otherwise the middle of the widest span across the outline at
 * one of a few heights. An L-shaped outline's centroid is outside it.
 */
export function insidePoint(ring: Ring, holes: readonly Ring[] = []): Vec2 {
  const centroid = ringCentroid(ring);
  if (pointInPolygon(centroid, ring, holes)) return centroid;
  const b = bboxOfRing(ring);
  for (const f of [0.5, 0.25, 0.75, 0.125, 0.375, 0.625, 0.875]) {
    const y = b.minY + (b.maxY - b.minY) * f;
    const xs: number[] = [];
    for (let i = 0; i < ring.length; i++) {
      const p = ring[i]!;
      const q = ring[(i + 1) % ring.length]!;
      if ((p[1] > y) !== (q[1] > y)) xs.push(p[0] + ((y - p[1]) * (q[0] - p[0])) / (q[1] - p[1]));
    }
    xs.sort((m, n) => m - n);
    let best: Vec2 | null = null;
    let widest = 0;
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const point: Vec2 = [(xs[k]! + xs[k + 1]!) / 2, y];
      if (xs[k + 1]! - xs[k]! > widest && pointInPolygon(point, ring, holes)) {
        widest = xs[k + 1]! - xs[k]!;
        best = point;
      }
    }
    if (best) return best;
  }
  return centroid;
}

const FLIGHT = "(?:escalators?|staircase|stairs?|lifts?|elevators?)";
const NUMBER = "(?:\\d+[a-z]?|[a-z])";
const NUMBERS = `(?:\\s*[-–—:#]?\\s*${NUMBER}(?:\\s*[,&/]\\s*${NUMBER})*)?`;
/**
 * The drawing names the flight itself: "Escalator – 07", "Lift A", "Stairs",
 * or two at once, "Escalator - 05 Escalator - 06". A space named for what is
 * beside one, "Lift lobby" or "Stairs landing", is where people wait, not
 * the shaft or the flight.
 */
const NAMED_AS_ONE = new RegExp(`^${FLIGHT}${NUMBERS}(?:\\s*[,&/]?\\s*${FLIGHT}${NUMBERS})*$`, "i");

export function namedLikeAStop(name: string): boolean {
  return NAMED_AS_ONE.test(name.trim());
}

/** A converted space is the floor you step onto the stop from: no walls, and walkable. */
export const OPENED = { kind: "area", walkable: true } as const;

export function isOpen(room: Room): boolean {
  return room.kind === OPENED.kind && room.walkable;
}

/**
 * The floor above a stop at this point, and whether it has a traced space
 * there for the next stop to stand in. Null on the top floor.
 */
export function floorAbove(model: MapModel, levelId: string, point: Vec2): { code: string; landing: boolean } | null {
  const floors = live(model.levels).sort((a, b) => a.ordinal - b.ordinal);
  const here = floors.findIndex(l => l.id === levelId);
  const above = here >= 0 ? floors[here + 1] : undefined;
  if (!above) return null;
  const landing = live(model.rooms).some(r =>
    r.levelId === above.id && r.kind !== "detail" && r.kind !== "void" && pointInPolygon(point, r.footprint, r.holes));
  return { code: above.code, landing };
}

export type StopPlan =
  | { ok: false; reason: string }
  | {
      ok: true;
      /** A new lift or stair. Null when the stop joins one on another floor, or is one already. */
      portal: { id: string; kind: StopKind } | null;
      endpoint: {
        id: string; portalId: string; levelId: string; roomId: string; point: Vec2;
        footprint: Array<[number, number]>;
      };
      /**
       * Set when someone placed this space's stop by hand: it gains the
       * outline, at this version, rather than getting a twin.
       */
      placedByHand: { version: number } | null;
      /** That stop's lift or stair takes the kind chosen, since the kind is what 3D builds. */
      kindPatch: {
        portalId: string; version: number;
        to: { kind: StopKind; stepFree: boolean };
        from: { kind: PortalKind; stepFree: boolean };
      } | null;
      roomPatch: typeof OPENED | null;
    };

/**
 * What turning a traced space into a lift, escalator or stairs stop saves.
 *
 * The stop keeps the space's outline, so 3D builds a shaft or a flight from
 * it. A stop someone already placed in the space by hand gains the outline.
 * Otherwise the new stop joins the portal of the same kind already stopping
 * at this spot on another floor, as the Lift or stair tool does. A portal of
 * another kind there is a different thing, so a new one is started.
 */
export function portalFromRoom(model: MapModel, room: Room, kind: StopKind, now = Date.now()): StopPlan {
  if (room.kind === "detail" || room.kind === "void") {
    return { ok: false, reason: "Only a room, area or service space can be a lift or stair stop." };
  }
  const here = live(model.portalEndpoints).filter(e => e.levelId === room.levelId && e.roomId === room.id);
  if (here.some(e => e.footprint)) {
    return { ok: false, reason: "This space is already a lift or stair stop." };
  }
  const footprint = room.footprint.map(p => [p[0], p[1]] as [number, number]);
  const roomPatch = isOpen(room) ? null : OPENED;

  if (here.length > 1) {
    return {
      ok: false,
      reason: `This space has ${here.length} lift or stair stops, so its outline can't be one of them. Trace each one's own space.`,
    };
  }
  const byHand = here[0];
  if (byHand) {
    const current = live(model.portals).find(p => p.id === byHand.portalId);
    const stepFree = kind === "lift";
    return {
      ok: true,
      portal: null,
      endpoint: {
        id: byHand.id, portalId: byHand.portalId, levelId: byHand.levelId, roomId: room.id, point: byHand.point, footprint,
      },
      placedByHand: { version: byHand.version },
      kindPatch: current && current.kind !== kind
        ? {
            portalId: current.id, version: current.version,
            to: { kind, stepFree },
            from: { kind: current.kind, stepFree: current.stepFree },
          }
        : null,
      roomPatch,
    };
  }

  const placed = portalEndpointAt(model, room.levelId, insidePoint(room.footprint, room.holes), now);
  if (!placed.ok) return placed;

  const joinedKind = placed.portal ? null : live(model.portals).find(p => p.id === placed.endpoint.portalId)?.kind;
  const portal = placed.portal || joinedKind !== kind ? { id: `portal-${now}`, kind } : null;

  return {
    ok: true,
    portal,
    endpoint: {
      ...placed.endpoint,
      portalId: portal?.id ?? placed.endpoint.portalId,
      roomId: room.id,
      footprint,
    },
    placedByHand: null,
    kindPatch: null,
    roomPatch,
  };
}
