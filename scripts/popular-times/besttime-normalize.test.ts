import { describe, expect, it } from "vitest";
import { normalizeBestTimeForecast, type BestTimeForecast } from "./besttime-normalize";

const raw: BestTimeForecast = {
  venue_info: { venue_id: "ven_123", venue_name: "HDB Tampines Branch" },
  analysis: [
    // day_int 0 = Monday -> JS index 1
    { day_info: { day_int: 0 }, day_raw: Array.from({ length: 24 }, (_, h) => (h === 10 ? 80 : 0)) },
    // day_int 6 = Sunday -> JS index 0
    { day_info: { day_int: 6 }, day_raw: Array.from({ length: 24 }, () => 50) },
  ],
};

describe("normalizeBestTimeForecast", () => {
  it("maps BestTime day_int to JS getDay and scales 0..100 -> 0..1", () => {
    const e = normalizeBestTimeForecast(raw, "hdb");
    expect(e.serviceId).toBe("hdb");
    expect(e.source).toBe("forecast");
    expect(e.placeId).toBe("ven_123");
    expect(e.weekday[1][10].busyness).toBeCloseTo(0.8);
    expect(e.weekday[0][0].busyness).toBeCloseTo(0.5);
  });

  it("fills every day with 24 hours even if a day is missing", () => {
    const e = normalizeBestTimeForecast(raw, "hdb");
    expect(e.weekday).toHaveLength(7);
    e.weekday.forEach(day => expect(day).toHaveLength(24));
    expect(e.weekday[2].every(h => h.busyness === 0)).toBe(true);
  });

  it("clamps out-of-range values", () => {
    const wild: BestTimeForecast = {
      analysis: [{ day_info: { day_int: 0 }, day_raw: [150, -10, ...Array(22).fill(0)] }],
    };
    const e = normalizeBestTimeForecast(wild, "x");
    expect(e.weekday[1][0].busyness).toBe(1);
    expect(e.weekday[1][1].busyness).toBe(0);
  });
});
