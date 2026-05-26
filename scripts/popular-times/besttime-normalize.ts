// Pure: BestTime forecast response -> our PopularTimesEntry shape.
// Type-only import (erased at runtime) so this also runs under tsx without
// the "@/" Vite alias.
import type { PopularTimesEntry, PopularTimesHour } from "../../src/data/types";

/** Subset of the BestTime /forecasts response we consume. */
export type BestTimeForecast = {
  analysis?: {
    day_info?: { day_int?: number }; // 0=Mon .. 6=Sun
    day_raw?: number[]; // hourly intensity 0..100
  }[];
  venue_info?: { venue_id?: string; venue_name?: string };
};

// BestTime day_int (0=Mon..6=Sun) -> JS getDay() (0=Sun..6=Sat)
const BT_TO_JS = [1, 2, 3, 4, 5, 6, 0];

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

export function normalizeBestTimeForecast(
  raw: BestTimeForecast,
  serviceId: string,
  opts: { dayStartHour?: number } = {},
): PopularTimesEntry {
  const dayStart = opts.dayStartHour ?? 0;
  const weekday: PopularTimesHour[][] = Array.from({ length: 7 }, () =>
    Array.from({ length: 24 }, (_, hour) => ({ hour, busyness: 0 })),
  );
  for (const day of raw.analysis ?? []) {
    const di = day.day_info?.day_int;
    if (di === undefined || di < 0 || di > 6) continue;
    const jsIdx = BT_TO_JS[di];
    (day.day_raw ?? []).forEach((v, i) => {
      const hour = dayStart + i;
      if (hour < 0 || hour > 23) return;
      weekday[jsIdx][hour] = { hour, busyness: clamp01((v ?? 0) / 100) };
    });
  }
  return {
    serviceId,
    placeId: raw.venue_info?.venue_id,
    placeName: raw.venue_info?.venue_name,
    weekday,
    source: "forecast",
  };
}
