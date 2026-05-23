import type {
  AccessibilityProfile,
  Floor,
  FloorId,
  Pt,
  RouteVariant,
  Service,
  Waypoint,
} from "@/data/types";
import { findPath, smoothPath } from "./pathfinder";

// Default start when the user hasn't set a location: Town Square on L1.
export const DEFAULT_START: { floorId: FloorId; point: Pt } = {
  floorId: "L1",
  point: [128, 83.37],
};

// Walkable transition point near Town Square used as the lift/escalator on both floors.
const TRANSITION_POINT: Pt = [130, 80];

function polygonCenter(points: Pt[]): Pt {
  const cx = points.reduce((a, [x]) => a + x, 0) / points.length;
  const cy = points.reduce((a, [, y]) => a + y, 0) / points.length;
  return [cx, cy];
}

function legPath(from: Pt, to: Pt, floor: Floor, destRoom?: string): Pt[] {
  const path = findPath(from, to, floor, destRoom);
  if (!path || path.length < 2) return [from, to];
  // Line-of-sight smoothing keeps each segment wall-clean (unlike a purely
  // geometric collinear simplify, which can cut corners through rooms).
  return smoothPath(path, floor, destRoom);
}

/**
 * Build a route from an arbitrary start location to a service, using A* for
 * each on-floor leg. Cross-floor trips go via a transition point (lift /
 * escalator) near Town Square.
 */
export function buildRoute(
  start: { floorId: FloorId; point: Pt },
  service: Service,
  profile: AccessibilityProfile,
  floors: Floor[],
): RouteVariant | null {
  if (!service.floorId) return null;
  const floorById = new Map(floors.map(f => [f.id, f]));
  const destFloor = floorById.get(service.floorId);
  if (!destFloor) return null;
  const roomPoly = destFloor.polygons.find(p => p.id === service.roomId);
  const dest = roomPoly ? polygonCenter(roomPoly.points) : start.point;

  const steps: Waypoint[] = [
    { floorId: start.floorId, point: start.point, decisionPoint: false, segmentKey: "start" },
  ];

  if (start.floorId === service.floorId) {
    steps.push({
      floorId: service.floorId,
      point: dest,
      decisionPoint: false,
      segmentKey: "arrived",
      pathFromPrev: legPath(start.point, dest, destFloor, service.roomId),
    });
  } else {
    const startFloor = floorById.get(start.floorId);
    steps.push({
      floorId: start.floorId,
      point: TRANSITION_POINT,
      decisionPoint: true,
      segmentKey: profile === "stepFree" ? "lift" : "escalator",
      pathFromPrev: startFloor
        ? legPath(start.point, TRANSITION_POINT, startFloor)
        : [start.point, TRANSITION_POINT],
    });
    steps.push({
      floorId: service.floorId,
      point: TRANSITION_POINT,
      decisionPoint: true,
      segmentKey: "level2",
      // no pathFromPrev — cross-floor hop teleports up
    });
    steps.push({
      floorId: service.floorId,
      point: dest,
      decisionPoint: false,
      segmentKey: "arrived",
      pathFromPrev: legPath(TRANSITION_POINT, dest, destFloor, service.roomId),
    });
  }

  return {
    serviceId: service.id,
    profile,
    counterId: service.counterIds?.[0],
    steps,
  };
}
