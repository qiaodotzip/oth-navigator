import {
  bboxOfRing, live, pointInPolygon, ringCentroid,
  type MapModel, type Ring, type Room, type Vec2,
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

export type StopPlan =
  | { ok: false; reason: string }
  | {
      ok: true;
      /** Null when the stop joins the same lift or stair on another floor. */
      portal: { id: string; kind: StopKind } | null;
      endpoint: {
        id: string; portalId: string; levelId: string; roomId: string; point: Vec2;
        footprint: Array<[number, number]>;
      };
      /** The space stays as the floor you step onto the stop from: open, and walkable. */
      roomPatch: { kind: "area"; walkable: true } | null;
    };

/**
 * What turning a traced space into a lift, escalator or stairs stop saves.
 *
 * The stop keeps the space's outline, so 3D builds a shaft or a flight from
 * it. It joins the portal of the same kind already stopping at this spot on
 * another floor, as the Lift or stair tool does. A portal of another kind
 * there is a different thing, so a new one is started.
 */
export function portalFromRoom(model: MapModel, room: Room, kind: StopKind, now = Date.now()): StopPlan {
  if (room.kind === "detail" || room.kind === "void") {
    return { ok: false, reason: "Only a room, area or service space can be a lift or stair stop." };
  }
  if (live(model.portalEndpoints).some(e => e.roomId === room.id && e.footprint)) {
    return { ok: false, reason: "This space is already a lift or stair stop." };
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
      footprint: room.footprint.map(p => [p[0], p[1]] as [number, number]),
    },
    roomPatch: room.kind === "area" && room.walkable ? null : { kind: "area", walkable: true },
  };
}
