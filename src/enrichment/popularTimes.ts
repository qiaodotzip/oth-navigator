import type { BusynessSource, PopularTimesEntry } from "@/data/types";

export function busynessNow(
  serviceId: string,
  entries: PopularTimesEntry[],
  now: Date,
): number | null {
  const entry = entries.find(e => e.serviceId === serviceId);
  if (!entry) return null;
  if (typeof entry.currentPopularity === "number") {
    return clamp01(entry.currentPopularity);
  }
  const dayIdx = now.getDay();
  const dayHours = entry.weekday[dayIdx];
  if (!dayHours || dayHours.length === 0) return null;
  const hour = now.getHours();
  const slot = dayHours.find(h => h.hour === hour);
  if (!slot) return null;
  return clamp01(slot.busyness);
}

function clamp01(n: number): number {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

/** Provenance of a service's busyness curve, for honest UI labeling. */
export function busynessSourceFor(
  serviceId: string,
  entries: PopularTimesEntry[],
): BusynessSource | null {
  const entry = entries.find(e => e.serviceId === serviceId);
  return entry?.source ?? null;
}

// A "queue" venue (service counter) reports people waiting in line; an
// "occupancy" venue (a space you walk into) reports people currently inside.
type CrowdKind = "queue" | "occupancy";
type CrowdProfile = { capacity: number; kind: CrowdKind };

// Realistic peak head-count per venue, so the modeled 0..1 busyness maps to a
// believable number instead of a flat ×12 for everything. Queues stay small
// (a handful at a counter); spaces scale to their real size.
const CROWD_PROFILES: Record<string, CrowdProfile> = {
  psc: { capacity: 15, kind: "queue" },
  servicesg: { capacity: 15, kind: "queue" },
  cpf: { capacity: 12, kind: "queue" },
  hdb: { capacity: 14, kind: "queue" },
  library: { capacity: 400, kind: "occupancy" },
  theatre: { capacity: 350, kind: "occupancy" },
  hawker: { capacity: 250, kind: "occupancy" },
  "community-centre": { capacity: 150, kind: "occupancy" },
  gym: { capacity: 120, kind: "occupancy" },
  pool: { capacity: 80, kind: "occupancy" },
  supermarket: { capacity: 200, kind: "occupancy" },
  arena: { capacity: 500, kind: "occupancy" },
  mcdonalds: { capacity: 60, kind: "occupancy" },
};

const DEFAULT_PROFILE: CrowdProfile = { capacity: 30, kind: "occupancy" };

/**
 * Turn a 0..1 busyness average into a believable head-count + the right noun
 * for the venue ("waiting" at a counter vs "here" inside a space).
 */
export function crowdEstimate(
  serviceId: string,
  avg: number,
): { count: number; noun: string } {
  const p = CROWD_PROFILES[serviceId] ?? DEFAULT_PROFILE;
  return {
    count: Math.round(clamp01(avg) * p.capacity),
    noun: p.kind === "queue" ? "waiting" : "here",
  };
}
