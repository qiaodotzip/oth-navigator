import type { Journey } from "@/data/types";

/**
 * The id of the next journey stop after `finishedServiceId`, or null if the
 * finished service is not a member of the journey, or it was the last stop.
 * (Guards the old bug where a non-member's order defaulted to -1 and chained
 * back to the first stop.)
 */
export function nextJourneyStopId(journey: Journey, finishedServiceId: string): string | null {
  const sorted = [...journey.stops].sort((a, b) => a.order - b.order);
  const i = sorted.findIndex(s => s.serviceId === finishedServiceId);
  if (i < 0) return null; // not a member — do NOT chain
  const next = sorted[i + 1];
  return next ? next.serviceId : null;
}
