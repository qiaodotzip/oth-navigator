import type { Floor, FloorId, PopularTimesEntry, Pt, Service } from "@/data/types";
import { busynessNow } from "@/enrichment/popularTimes";
import { serviceLocation } from "./buildRoute";

// How close (metres) a venue must be to a connector to crowd it, and how many
// metres of "extra walking" a fully-busy (1.0) neighbour adds to that connector's
// cost. Tuned (Task 8) against the real OTH geometry: radius 16 lets a connector
// "see" a venue ~14m away (the central lift sits ~14m from the hawker centre),
// and weight 120 is comfortably inside the stable flip zone (flips for r 16–20,
// w 100–140) so the hawker→HDB demo route swings off the crowded central lift in
// the evening without being a knife-edge.
export const CROWD_RADIUS_M = 16;
export const CROWD_WEIGHT_M = 120;

function dist(a: Pt, b: Pt): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

/**
 * Crowd cost (in metres-equivalent) for a connector at `point` on `floorId`:
 * the busyness of the busiest venue within CROWD_RADIUS_M on the same floor,
 * scaled by CROWD_WEIGHT_M. 0 when nothing nearby is busy.
 */
export function connectorCrowdPenalty(
  point: Pt,
  floorId: FloorId,
  services: Service[],
  floors: Floor[],
  popularTimes: PopularTimesEntry[],
  now: Date,
  radiusM = CROWD_RADIUS_M,
  weightM = CROWD_WEIGHT_M,
): number {
  let maxBusy = 0;
  for (const svc of services) {
    const loc = serviceLocation(svc, floors);
    if (!loc || loc.floorId !== floorId) continue;
    if (dist(loc.point, point) > radiusM) continue;
    const b = busynessNow(svc.id, popularTimes, now);
    if (b !== null && b > maxBusy) maxBusy = b;
  }
  return maxBusy * weightM;
}
