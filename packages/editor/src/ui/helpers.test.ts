import { afterEach, describe, expect, it, vi } from "vitest";
import { recall, remember } from "./remember";
import { relativeTime } from "./relativeTime";

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("remember", () => {
  it("keeps a value for this browser", () => {
    remember("lastFloor", "L2");
    expect(recall("lastFloor")).toBe("L2");
    expect(localStorage.getItem("oth.lastFloor")).toBe("L2");
  });

  it("shrugs off storage a browser refuses", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    expect(() => remember("k", "v")).not.toThrow();
    expect(recall("k")).toBeNull();
  });
});

describe("relativeTime", () => {
  const now = Date.parse("2026-09-27T12:00:00Z");
  it("says just now for the last minute", () => {
    expect(relativeTime("2026-09-27T11:59:30Z", now)).toBe("just now");
  });
  it("speaks in the largest whole unit", () => {
    expect(relativeTime("2026-09-27T09:00:00Z", now)).toBe("3 hours ago");
    expect(relativeTime("2026-09-24T12:00:00Z", now)).toBe("3 days ago");
  });
});
