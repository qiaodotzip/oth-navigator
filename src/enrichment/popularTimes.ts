import type { PopularTimesEntry } from "@/data/types";

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
