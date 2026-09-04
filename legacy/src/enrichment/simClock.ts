import type { TimeOfDay } from "@/store";

// Representative peak hours, chosen from the real popular-times.json curves:
// morning = government services peak (psc/hdb ~0.88), leisure empty;
// evening = leisure/retail peak (hawker/library/gym/supermarket ~1.0);
// night   = late venues only (theatre/arena).
const PEAK_HOUR: Record<TimeOfDay, number> = { morning: 10, evening: 18, night: 21 };

export function simHour(t: TimeOfDay): number {
  return PEAK_HOUR[t];
}

// A fixed Friday (2026-05-22 is a Friday; month arg is 0-indexed, 4 = May) at
// the mapped hour, so busyness reads a stable weekday curve regardless of the
// real date the demo runs on.
export function simDate(t: TimeOfDay): Date {
  return new Date(2026, 4, 22, simHour(t), 0, 0);
}
