import {
  live, minAreaRect,
  type Level, type MapModel, type OrientedRect, type PortalEndpoint, type PortalKind, type Ring, type Vec2,
} from "@oth/model";
import type { Block } from "./blocks";
import { SLAB_HEIGHT_M } from "./geometry";

/** A lift car's shaft, when the drawing gives no outline. */
export const DEFAULT_SHAFT_M = 2.4;
/** A comfortable riser; escalator steps are close to it. */
export const RISER_M = 0.17;
/** Thin, so a shaft reads as glass and shows the lift inside. */
const SHAFT_WALL_M = 0.12;

/** What lifts and flights are painted with, in the preview (PortalMesh) and the export. */
export const PORTAL_COLOUR = { shaft: "#7c93b5", escalator: "#8d99a6", stair: "#b9ae96" } as const;
/** A shaft is see-through, so the lift inside it shows. */
export const SHAFT_OPACITY = 0.45;

/** A flight's colour: an escalator's grey, or the stone of stairs and ramps. */
export function flightColour(kind: PortalKind): string {
  return kind === "escalator" ? PORTAL_COLOUR.escalator : PORTAL_COLOUR.stair;
}

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
 * A flight as treads, from the low end to the high one. It climbs from this
 * floor's walking surface, the top of its slab, to the next floor's, so the
 * top step is level with the floor it arrives on. Each tread runs across the
 * flight, as deep as one going, and only two risers thick, so a flight
 * reads as steps and not as a solid wedge as tall as the floor.
 */
export function flightSteps(rect: OrientedRect, riseM: number, towardPositive: boolean, riserM = RISER_M): Block[] {
  const count = Math.max(1, Math.ceil(riseM / riserM - 1e-9));
  const riser = riseM / count;
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
    const topM = SLAB_HEIGHT_M + (riseM * (i + 1)) / count;
    const baseM = Math.max(SLAB_HEIGHT_M, topM - 2 * riser);
    steps.push({ a: [cx - vx, cy - vy], b: [cx + vx, cy + vy], thicknessM: depth, baseM, topM });
  }
  return steps;
}

function squareAround(point: Vec2, size: number): Ring {
  const h = size / 2;
  return [[point[0] - h, point[1] - h], [point[0] + h, point[1] - h], [point[0] + h, point[1] + h], [point[0] - h, point[1] + h]];
}

/**
 * How tall a shaft stands on a floor: up to the next floor's elevation, so
 * the stops' shafts meet whatever the floors' own heights say. The top floor,
 * or one with no rise to the next, uses its own height.
 */
function shaftHeightM(model: MapModel, level: Level): number {
  const floors = live(model.levels).sort((a, b) => a.ordinal - b.ordinal);
  const above = floors[floors.findIndex(l => l.id === level.id) + 1];
  const gap = above ? above.elevationM - level.elevationM : 0;
  return gap > 0 ? gap : level.heightM;
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
 * A lift builds a shaft at every stop, up to the next floor, so the stops
 * stack into one shaft. An escalator, stair or ramp builds a flight on the
 * lower of each pair of stops, from its outline (or the upper stop's) up to
 * the upper floor. With no outline at either stop, or no rise between the
 * floors, it builds no flight and is shown only by its markers.
 *
 * A flight is flipped when its lower stop says so, which is the stop the
 * inspector's Flip writes to (Task 7). The top stop has no flight rising
 * from it, so a flag there can only mean the flight arriving at it; a
 * middle stop's flag is its own flight's, never the one below.
 */
export function portalParts(model: MapModel, levelId: string): { shafts: Shaft[]; flights: Flight[] } {
  const shafts: Shaft[] = [];
  const flights: Flight[] = [];
  for (const portal of live(model.portals)) {
    const stops = stopsInOrder(model, portal.id);
    if (portal.kind === "lift") {
      for (const { stop, level } of stops) {
        if (stop.levelId !== levelId) continue;
        shafts.push({
          portalId: portal.id,
          ring: stop.footprint ?? squareAround(stop.point, DEFAULT_SHAFT_M),
          heightM: shaftHeightM(model, level),
        });
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
      const flipped = lower.stop.flipped || (i + 2 === stops.length && upper.stop.flipped);
      const toward = risesTowardPositive(rect, upper.stop.point, flipped);
      flights.push({ portalId: portal.id, kind: portal.kind, steps: flightSteps(rect, rise, toward) });
    }
  }
  return { shafts, flights };
}
