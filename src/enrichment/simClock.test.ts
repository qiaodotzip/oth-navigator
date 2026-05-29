import { describe, expect, it } from "vitest";
import { simHour, simDate } from "./simClock";

describe("simHour", () => {
  it("maps each time-of-day to a representative peak hour", () => {
    expect(simHour("morning")).toBe(10);
    expect(simHour("evening")).toBe(18);
    expect(simHour("night")).toBe(21);
  });
});

describe("simDate", () => {
  it("returns a Friday at the mapped hour (so weekday curves are stable)", () => {
    const d = simDate("evening");
    expect(d.getDay()).toBe(5); // Friday
    expect(d.getHours()).toBe(18);
  });
});
