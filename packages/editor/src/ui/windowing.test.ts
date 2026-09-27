import { describe, expect, it } from "vitest";
import { centerOffset, visibleRange } from "./windowing";

describe("visibleRange", () => {
  it("covers what is in view, and a few either side", () => {
    expect(visibleRange(0, 400, 100, 1000, 2)).toEqual({ start: 0, end: 7 });
    expect(visibleRange(1000, 400, 100, 1000, 2)).toEqual({ start: 8, end: 17 });
  });

  it("stops at the end of the list", () => {
    expect(visibleRange(0, 400, 100, 3, 2)).toEqual({ start: 0, end: 3 });
    expect(visibleRange(99_999, 400, 100, 10, 2)).toEqual({ start: 7, end: 10 });
  });

  it("is empty for an empty list, not broken", () => {
    expect(visibleRange(0, 400, 100, 0, 2)).toEqual({ start: 0, end: 0 });
  });
});

describe("centerOffset", () => {
  it("puts an item in the middle of the view", () => {
    expect(centerOffset(10, 100, 500)).toBe(800);
  });

  it("never scrolls before the start", () => {
    expect(centerOffset(0, 100, 500)).toBe(0);
  });
});
