import { describe, expect, it } from "vitest";
import type { PopularTimesEntry } from "@/data/types";
import { busynessNow } from "./popularTimes";

function makeEntry(): PopularTimesEntry {
  const weekday = Array.from({ length: 7 }, () =>
    Array.from({ length: 24 }, (_, h) => ({ hour: h, busyness: h / 24 })),
  );
  return { serviceId: "library", placeId: "p1", weekday, source: "modeled" };
}

describe("busynessNow", () => {
  it("returns the busyness for the given hour and weekday", () => {
    const data = [makeEntry()];
    const fri15 = new Date(2026, 4, 22, 15, 0, 0);
    const v = busynessNow("library", data, fri15);
    expect(v).toBeCloseTo(15 / 24);
  });

  it("uses currentPopularity when present (live override)", () => {
    const data = [{ ...makeEntry(), currentPopularity: 0.9 }];
    const v = busynessNow("library", data, new Date());
    expect(v).toBe(0.9);
  });

  it("returns null when no entry exists for the service", () => {
    const data = [makeEntry()];
    const v = busynessNow("unknown-service", data, new Date());
    expect(v).toBeNull();
  });

  it("returns null when weekday data is missing for that day", () => {
    const partial: PopularTimesEntry = {
      serviceId: "library",
      placeId: "p1",
      weekday: [[], [], [], [], [], [], []],
      source: "modeled",
    };
    const v = busynessNow("library", [partial], new Date());
    expect(v).toBeNull();
  });
});
