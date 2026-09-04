import { describe, expect, it } from "vitest";
import { normalizeBestTimeForecast, type BestTimeForecast } from "./besttime-normalize";

// Mirrors the real BestTime /forecasts shape: day_raw and hour_analysis are
// PARALLEL 24-length arrays that start at 06:00 (not midnight). hour_analysis[i]
// carries the canonical hour for day_raw[i]. This library curve (venue_open 10,
// venue_closed 21) has nonzero intensity at indices 4..14, i.e. hours 10..20.
const HOURS_FROM_6 = Array.from({ length: 24 }, (_, i) => ({ hour: (6 + i) % 24 }));
const LIB_RAW = [0, 0, 0, 0, 35, 45, 50, 55, 55, 60, 65, 70, 70, 60, 40, 0, 0, 0, 0, 0, 0, 0, 0, 0];

const raw: BestTimeForecast = {
  venue_info: { venue_id: "ven_123", venue_name: "Tampines Regional Library" },
  analysis: [
    // day_int 0 = Monday -> JS index 1
    { day_info: { day_int: 0 }, hour_analysis: HOURS_FROM_6, day_raw: LIB_RAW },
    // day_int 6 = Sunday -> JS index 0
    { day_info: { day_int: 6 }, hour_analysis: HOURS_FROM_6, day_raw: Array(24).fill(50) },
  ],
};

describe("normalizeBestTimeForecast", () => {
  it("aligns day_raw to the hours in hour_analysis (06:00 start), not the array index", () => {
    const e = normalizeBestTimeForecast(raw, "library");
    expect(e.serviceId).toBe("library");
    expect(e.source).toBe("forecast");
    expect(e.placeId).toBe("ven_123");
    // day_raw[4]=35 pairs with hour_analysis[4].hour=10 -> Monday(jsIdx1) hour 10
    expect(e.weekday[1][10].busyness).toBeCloseTo(0.35);
    // day_raw[14]=40 pairs with hour 20
    expect(e.weekday[1][20].busyness).toBeCloseTo(0.4);
    // 04:00 is before opening -> stays 0, NOT busy (the old index bug put load here)
    expect(e.weekday[1][4].busyness).toBe(0);
    // Sunday (jsIdx 0) hour 6 (day_raw index 0) -> 0.5
    expect(e.weekday[0][6].busyness).toBeCloseTo(0.5);
  });

  it("maps BestTime day_int to JS getDay and fills every day with 24 hours", () => {
    const e = normalizeBestTimeForecast(raw, "library");
    expect(e.weekday).toHaveLength(7);
    e.weekday.forEach(day => expect(day).toHaveLength(24));
    // Tuesday (jsIdx 2) absent from input -> all zeros
    expect(e.weekday[2].every(h => h.busyness === 0)).toBe(true);
  });

  it("falls back to a 06:00 start when hour_analysis is absent", () => {
    const noHours: BestTimeForecast = {
      analysis: [{ day_info: { day_int: 0 }, day_raw: LIB_RAW }],
    };
    const e = normalizeBestTimeForecast(noHours, "library");
    // index 4 -> hour 6+4 = 10
    expect(e.weekday[1][10].busyness).toBeCloseTo(0.35);
    expect(e.weekday[1][4].busyness).toBe(0);
  });

  it("clamps out-of-range values", () => {
    const wild: BestTimeForecast = {
      analysis: [
        { day_info: { day_int: 0 }, hour_analysis: HOURS_FROM_6, day_raw: [150, -10, ...Array(22).fill(0)] },
      ],
    };
    const e = normalizeBestTimeForecast(wild, "x");
    // index 0 -> hour 6, index 1 -> hour 7
    expect(e.weekday[1][6].busyness).toBe(1);
    expect(e.weekday[1][7].busyness).toBe(0);
  });
});
