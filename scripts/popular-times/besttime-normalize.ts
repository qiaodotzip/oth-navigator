// Pure: BestTime forecast response -> our PopularTimesEntry shape.
// Type-only import (erased at runtime) so this also runs under tsx without
// the "@/" Vite alias.
import type { PopularTimesEntry, PopularTimesHour } from "../../src/data/types";

/** Subset of the BestTime /forecasts response we consume. */
export type BestTimeForecast = {
  analysis?: {
    day_info?: { day_int?: number }; // 0=Mon .. 6=Sun
    // Parallel to day_raw: hour_analysis[i].hour is the clock hour for day_raw[i].
    hour_analysis?: { hour?: number }[];
    day_raw?: number[]; // intensity 0..100, aligned to hour_analysis (starts 06:00)
  }[];
  venue_info?: { venue_id?: string; venue_name?: string };
};

// BestTime day_int (0=Mon..6=Sun) -> JS getDay() (0=Sun..6=Sat)
const BT_TO_JS = [1, 2, 3, 4, 5, 6, 0];

// BestTime's day_raw/hour_analysis arrays begin at this clock hour, not midnight.
const DEFAULT_DAY_START = 6;

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

export function normalizeBestTimeForecast(
  raw: BestTimeForecast,
  serviceId: string,
  opts: { dayStartHour?: number } = {},
): PopularTimesEntry {
  const dayStart = opts.dayStartHour ?? DEFAULT_DAY_START;
  const weekday: PopularTimesHour[][] = Array.from({ length: 7 }, () =>
    Array.from({ length: 24 }, (_, hour) => ({ hour, busyness: 0 })),
  );
  for (const day of raw.analysis ?? []) {
    const di = day.day_info?.day_int;
    if (di === undefined || di < 0 || di > 6) continue;
    const jsIdx = BT_TO_JS[di];
    const hours = day.hour_analysis;
    (day.day_raw ?? []).forEach((v, i) => {
      // Prefer the explicit per-slot hour; fall back to a 06:00-based offset.
      const hour = hours?.[i]?.hour ?? (dayStart + i) % 24;
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
