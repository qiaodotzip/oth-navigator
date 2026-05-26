import type {
  AccessibilityProfile,
  EntranceMap,
  Floor,
  FloorId,
  Pt,
  RouteVariant,
  Service,
  Waypoint,
} from "@/data/types";
import { findPath, smoothPath } from "./pathfinder";
import { checkSegment } from "./pathChecks";

// Default start when the user hasn't set a location: Town Square on L1.
export const DEFAULT_START: { floorId: FloorId; point: Pt } = {
  floorId: "L1",
  point: [128, 95.21],
};

// Fallback transition (near Town Square) if no lift/escalator/stair is defined.
const TRANSITION_POINT: Pt = [130, 91.37];

function polygonCenter(points: Pt[]): Pt {
  const cx = points.reduce((a, [x]) => a + x, 0) / points.length;
  const cy = points.reduce((a, [, y]) => a + y, 0) / points.length;
  return [cx, cy];
}

function dist(a: Pt, b: Pt): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

type ConnectorKind = "lift" | "escalator" | "stair";
type ConnectorDir = "up" | "down" | "both";
type Connector = { point: Pt; kind: ConnectorKind; dir: ConnectorDir; floorId: FloorId };

function floorIndex(id: FloorId): number {
  return id === "L3" ? 2 : id === "L2" ? 1 : 0; // L1 = 0, L2 = 1, L3 = 2
}

function connectorKindFromId(id: string): ConnectorKind | null {
  // "stairs-lift" / "elevator" → has a lift; "escalator" → escalator; "stair" → stair.
  if (/elevator|lift/i.test(id)) return "lift";
  if (/escalator/i.test(id)) return "escalator";
  if (/stair/i.test(id)) return "stair";
  return null;
}

function dirFromId(id: string, kind: ConnectorKind): ConnectorDir {
  if (kind === "lift" || kind === "stair") return "both";
  // Escalators are one-way. Infer from the id; "to-L2"/"up" rise, "down" descend.
  if (/to-l2|up/i.test(id)) return "up";
  // No B1 (basement) floor — building is L1–L3 only. A bare "down" escalator
  // still descends within L1–L3; we just no longer treat "to-b1" as a target.
  if (/down/i.test(id)) return "down";
  return "up"; // default an undirected escalator to "up"
}

function rectCenter(rect: [Pt, Pt]): Pt {
  return [(rect[0][0] + rect[1][0]) / 2, (rect[0][1] + rect[1][1]) / 2];
}

/**
 * Vertical-circulation points across the building, tagged with direction and the
 * floor they're boarded from. Lifts and stairs are bidirectional shafts usable
 * from any floor; escalators are one-way and only boardable from their own floor
 * (an up-escalator on L1 takes you to L2; a down-escalator on L2 takes you to L1).
 * Note: there is no B1 floor — the building is L1–L3 only.
 */
function collectConnectors(floors: Floor[]): Connector[] {
  const out: Connector[] = [];
  for (const f of floors) {
    for (const p of f.polygons) {
      const k = connectorKindFromId(p.id);
      if (k) out.push({ point: polygonCenter(p.points), kind: k, dir: dirFromId(p.id, k), floorId: f.id });
    }
    for (const d of f.details ?? []) {
      let k: ConnectorKind | null = null;
      let dir: ConnectorDir = "both";
      if (d.type === "lift-block") { k = "lift"; dir = "both"; }
      else if (d.type === "escalator-up") { k = "escalator"; dir = "up"; }
      else if (d.type === "escalator-down") { k = "escalator"; dir = "down"; }
      else if (d.type === "staircase") { k = "stair"; dir = "both"; }
      else if (d.type === "staircase-down") { k = "stair"; dir = "down"; }
      if (k && "rect" in d) out.push({ point: rectCenter(d.rect), kind: k, dir, floorId: f.id });
    }
  }
  // Merge near-duplicate shafts (~2.5m) of the same kind + direction.
  const dedup: Connector[] = [];
  for (const c of out) {
    if (!dedup.some(e => e.kind === c.kind && e.dir === c.dir && dist(e.point, c.point) < 2.5)) {
      dedup.push(c);
    }
  }
  return dedup;
}

/**
 * Pick the connector that minimises total travel (start → connector on the start
 * floor, then connector → destination on the dest floor), respecting direction:
 *  - lifts & stairs: bidirectional, usable from any floor.
 *  - escalators: must be boarded from the start floor and run the right way
 *    (an up-escalator only goes up; a down-escalator goes to the floor below).
 * Step-free profiles only consider lifts.
 */
function pathLength(pts: Pt[] | null): number {
  if (!pts || pts.length < 2) return Infinity;
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += dist(pts[i - 1], pts[i]);
  return len;
}

function pickConnector(
  floors: Floor[],
  startFloor: FloorId,
  startPoint: Pt,
  destFloor: FloorId,
  dest: Pt,
  profile: AccessibilityProfile,
  destRoomId?: string,
): Connector | null {
  const tripDir: ConnectorDir = floorIndex(destFloor) > floorIndex(startFloor) ? "up" : "down";
  // Escalators and stairs are single-hop (one floor); a lift serves every floor.
  // So a trip spanning more than one floor (e.g. L1→L3) must use a lift —
  // picking an L1 up-escalator would only land you on L2.
  const floorGap = Math.abs(floorIndex(destFloor) - floorIndex(startFloor));
  let cands = collectConnectors(floors).filter(c => {
    if (c.kind === "lift") return true; // lifts: any floor, both directions
    if (floorGap > 1) return false; // multi-floor jump: lifts only
    if (c.kind === "stair" && c.dir === "both") return true; // plain stairs: walkable both ways
    // directional stairs + escalators: board from the start floor, going the trip's direction
    return c.floorId === startFloor && c.dir === tripDir;
  });
  if (profile === "stepFree") cands = cands.filter(c => c.kind === "lift");
  if (cands.length === 0) return null;

  const sf = floors.find(f => f.id === startFloor);
  const df = floors.find(f => f.id === destFloor);

  // Pre-rank by straight-line total and keep the closest handful, then score
  // those by ACTUAL walking distance (A* on each floor). Straight-line alone
  // favours lifts that are near as the crow flies but walled off / whose
  // landing can't reach the room; real path length picks the connector you can
  // actually walk to fastest (often a nearer escalator or stair).
  const pre = cands
    .map(c => ({ c, s: dist(startPoint, c.point) + dist(c.point, dest) }))
    .sort((a, b) => a.s - b.s)
    .slice(0, 8);

  let best: Connector | null = null;
  let bestLen = Infinity;
  for (const { c } of pre) {
    const startLeg = sf ? pathLength(findPath(startPoint, c.point, sf)) : dist(startPoint, c.point);
    const destLeg = df ? pathLength(findPath(c.point, dest, df, destRoomId)) : dist(c.point, dest);
    const total = startLeg + destLeg;
    if (total < bestLen) {
      bestLen = total;
      best = c;
    }
  }
  // If no candidate's legs both connect, fall back to the straight-line nearest.
  return best ?? pre[0]?.c ?? null;
}

/**
 * Where the user stands after completing a route: its final waypoint. Used to
 * advance the journey start so the next leg begins from the stop just reached
 * (not the default location).
 */
export function routeArrivalLocation(
  variant: RouteVariant,
): { floorId: FloorId; point: Pt } {
  const last = variant.steps[variant.steps.length - 1];
  return { floorId: last.floorId, point: last.point };
}

/** The routable location of a service: the center of its room polygon. */
export function serviceLocation(
  service: Service,
  floors: Floor[],
): { floorId: FloorId; point: Pt } | null {
  if (!service.floorId || !service.roomId) return null;
  const floor = floors.find(f => f.id === service.floorId);
  if (!floor) return null;
  const poly = floor.polygons.find(p => p.id === service.roomId);
  if (!poly) return null;
  return { floorId: service.floorId, point: polygonCenter(poly.points) };
}

function legBlocked(pts: Pt[], floor: Floor, destRoom?: string): boolean {
  for (let i = 0; i < pts.length - 1; i++) {
    if (checkSegment(pts[i], pts[i + 1], floor, destRoom).blocked) return true;
  }
  return false;
}

function legPath(from: Pt, to: Pt, floor: Floor, destRoom?: string): Pt[] {
  const path = findPath(from, to, floor, destRoom);
  if (!path || path.length < 2) return [from, to];
  // Line-of-sight smoothing keeps each segment wall-clean (unlike a purely
  // geometric collinear simplify, which can cut corners through rooms).
  const smoothed = smoothPath(path, floor, destRoom);
  // Safety net: smoothing should never reintroduce a crossing, but if it does,
  // fall back to the raw grid path (adjacent walkable cells — clean by build).
  if (legBlocked(smoothed, floor, destRoom) && !legBlocked(path, floor, destRoom)) {
    return path;
  }
  return smoothed;
}

/**
 * Build a route from an arbitrary start location to a service, using A* for
 * each on-floor leg. Cross-floor trips go via a transition point (lift /
 * escalator) near Town Square.
 */
/**
 * Of a service's counters, the one with the lowest current load (so the guide
 * recommends the quieter queue). All counters share the service's room, so this
 * changes *which counter* we name, not the walked path. Falls back to the first
 * counter when there are no load readings.
 */
function leastBusyCounter(
  counterIds: string[] | undefined,
  loads: Record<string, number>,
): string | undefined {
  if (!counterIds || counterIds.length === 0) return undefined;
  let best = counterIds[0];
  let bestLoad = loads[best] ?? 0;
  for (const id of counterIds.slice(1)) {
    const l = loads[id] ?? 0;
    if (l < bestLoad) {
      best = id;
      bestLoad = l;
    }
  }
  return best;
}

export function buildRoute(
  start: { floorId: FloorId; point: Pt },
  service: Service,
  profile: AccessibilityProfile,
  floors: Floor[],
  entrances: EntranceMap = {},
  loads: Record<string, number> = {},
): RouteVariant | null {
  const floorById = new Map(floors.map(f => [f.id, f]));
  // An explicit entrance (set in the entrance editor) overrides the building
  // centroid. Look up by service id first, then by its room/place id.
  const entrance =
    entrances[service.id] ?? (service.roomId ? entrances[service.roomId] : undefined);
  const destFloorId = entrance?.floorId ?? service.floorId;
  if (!destFloorId) return null;
  const destFloor = floorById.get(destFloorId);
  if (!destFloor) return null;
  const loc = serviceLocation(service, floors);
  const dest = entrance?.point ?? (loc ? loc.point : start.point);

  const steps: Waypoint[] = [
    { floorId: start.floorId, point: start.point, decisionPoint: false, segmentKey: "start" },
  ];

  if (start.floorId === destFloorId) {
    steps.push({
      floorId: destFloorId,
      point: dest,
      decisionPoint: false,
      segmentKey: "arrived",
      pathFromPrev: legPath(start.point, dest, destFloor, service.roomId),
    });
  } else {
    const startFloor = floorById.get(start.floorId);
    // Route via the nearest suitable lift / escalator / stair (lift only when
    // step-free), picked to minimise total start→connector→destination travel.
    const connector =
      pickConnector(floors, start.floorId, start.point, destFloorId, dest, profile, service.roomId) ??
      ({
        point: TRANSITION_POINT,
        kind: profile === "stepFree" ? "lift" : "escalator",
        dir: "both",
        floorId: start.floorId,
      } as Connector);
    const transition = connector.point;
    const transitKey =
      connector.kind === "lift" ? "lift" : connector.kind === "stair" ? "stairs" : "escalator";
    steps.push({
      floorId: start.floorId,
      point: transition,
      decisionPoint: true,
      segmentKey: transitKey,
      pathFromPrev: startFloor
        ? legPath(start.point, transition, startFloor)
        : [start.point, transition],
    });
    steps.push({
      floorId: destFloorId,
      point: transition,
      decisionPoint: true,
      segmentKey: "level2",
      // no pathFromPrev — cross-floor hop teleports up
    });
    steps.push({
      floorId: destFloorId,
      point: dest,
      decisionPoint: false,
      segmentKey: "arrived",
      pathFromPrev: legPath(transition, dest, destFloor, service.roomId),
    });
  }

  return {
    serviceId: service.id,
    profile,
    counterId: leastBusyCounter(service.counterIds, loads),
    steps,
  };
}
