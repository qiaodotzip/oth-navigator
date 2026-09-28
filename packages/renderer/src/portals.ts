import {
  live, minAreaRect,
  type Level, type MapModel, type OrientedRect, type PortalEndpoint, type PortalKind, type Ring, type Vec2,
} from "@oth/model";
import type { Block } from "./blocks";

/** A lift car's shaft, when the drawing gives no outline. */
export const DEFAULT_SHAFT_M = 2.4;
/** A comfortable riser; escalator steps are close to it. */
export const RISER_M = 0.17;
/** Thin, so a shaft reads as glass and shows the lift inside. */
const SHAFT_WALL_M = 0.12;

export type Shaft = { portalId: string; ring: Ring; heightM: number };
export type Flight = { portalId: string; kind: PortalKind; steps: Block[] };

/** A portal's live stops on live floors, lowest floor first. */
export function stopsInOrder(model: MapModel, portalId: string): Array<{ stop: PortalEndpoint; level: Level }> {
  const levels = new Map(live(model.levels).map(l => [l.id, l]));
  return live(model.portalEndpoints)
    .filter(e => e.portalId === portalId && levels.has(e.levelId))
    .map(stop => ({ stop, level: levels.get(stop.levelId)! }))
    .sort((a, b) => a.level.ordinal - b.level.ordinal);
}

export function nextStopAbove(model: MapModel, endpoint: PortalEndpoint): PortalEndpoint | null {
  const stops = stopsInOrder(model, endpoint.portalId);
  const i = stops.findIndex(s => s.stop.id === endpoint.id);
  return i >= 0 ? stops[i + 1]?.stop ?? null : null;
}

/**
 * Spec §7: a flight rises toward the end nearer the upper stop. With the
 * upper stop at the middle, which is what clicking the dashed outline
 * places, there is no evidence either way: it rises toward the axis's end,
 * and Flip is how a person says otherwise.
 */
export function risesTowardPositive(rect: OrientedRect, upperPoint: Vec2 | null, flipped: boolean): boolean {
  let positive = true;
  if (upperPoint) {
    const t = (upperPoint[0] - rect.centre[0]) * rect.axis[0] + (upperPoint[1] - rect.centre[1]) * rect.axis[1];
    if (Math.abs(t) > 1e-6) positive = t > 0;
  }
  return flipped ? !positive : positive;
}

/**
 * A flight as stepped blocks standing on the floor, from the low end to the
 * high one. The top step is level with the floor above. Each block runs
 * across the flight, as deep as one tread.
 */
export function flightSteps(rect: OrientedRect, riseM: number, towardPositive: boolean, riserM = RISER_M): Block[] {
  const count = Math.max(1, Math.ceil(riseM / riserM - 1e-9));
  const depth = (2 * rect.halfLength) / count;
  const dir = towardPositive ? 1 : -1;
  const [ux, uy] = rect.axis;
  const vx = -uy * rect.halfWidth;
  const vy = ux * rect.halfWidth;
  const steps: Block[] = [];
  for (let i = 0; i < count; i++) {
    const s = dir * (-rect.halfLength + depth * (i + 0.5));
    const cx = rect.centre[0] + ux * s;
    const cy = rect.centre[1] + uy * s;
    steps.push({ a: [cx - vx, cy - vy], b: [cx + vx, cy + vy], thicknessM: depth, baseM: 0, topM: (riseM * (i + 1)) / count });
  }
  return steps;
}

function squareAround(point: Vec2, size: number): Ring {
  const h = size / 2;
  return [[point[0] - h, point[1] - h], [point[0] + h, point[1] - h], [point[0] + h, point[1] + h], [point[0] - h, point[1] + h]];
}

/** A shaft's sides, as blocks on its outline. */
export function shaftBlocks(shaft: Shaft): Block[] {
  const blocks: Block[] = [];
  const ring = shaft.ring;
  for (let i = 0; i < ring.length; i++) {
    blocks.push({ a: ring[i]!, b: ring[(i + 1) % ring.length]!, thicknessM: SHAFT_WALL_M, baseM: 0, topM: shaft.heightM });
  }
  return blocks;
}

/**
 * What the lifts, escalators and stairs build on one level.
 *
 * A lift builds a shaft at every stop, one storey tall, so the stops stack
 * into one shaft. An escalator, stair or ramp builds a flight on the lower
 * of each pair of stops, from its outline (or the upper stop's) up to the
 * upper floor. With no outline at either stop, or no rise between the floors,
 * it builds no flight and is shown only by its markers.
 */
export function portalParts(model: MapModel, levelId: string): { shafts: Shaft[]; flights: Flight[] } {
  const shafts: Shaft[] = [];
  const flights: Flight[] = [];
  for (const portal of live(model.portals)) {
    const stops = stopsInOrder(model, portal.id);
    if (portal.kind === "lift") {
      for (const { stop, level } of stops) {
        if (stop.levelId !== levelId) continue;
        shafts.push({ portalId: portal.id, ring: stop.footprint ?? squareAround(stop.point, DEFAULT_SHAFT_M), heightM: level.heightM });
      }
      continue;
    }
    for (let i = 0; i + 1 < stops.length; i++) {
      const lower = stops[i]!;
      const upper = stops[i + 1]!;
      if (lower.stop.levelId !== levelId) continue;
      const outline = lower.stop.footprint ?? upper.stop.footprint;
      const rise = upper.level.elevationM - lower.level.elevationM;
      if (!outline || rise <= 0) continue;
      const rect = minAreaRect(outline);
      if (rect.halfLength <= 0) continue;
      const toward = risesTowardPositive(rect, upper.stop.point, lower.stop.flipped);
      flights.push({ portalId: portal.id, kind: portal.kind, steps: flightSteps(rect, rise, toward) });
    }
  }
  return { shafts, flights };
}
