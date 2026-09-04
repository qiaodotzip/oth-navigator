import { describe, expect, it, vi } from "vitest";
import { PresenceTracker } from "./service";

describe("PresenceTracker", () => {
  it("lists a user after a heartbeat", () => {
    const t = new PresenceTracker(5000);
    t.heartbeat("user_1", "Wei", "oth-L2");
    expect(t.list()).toEqual([
      expect.objectContaining({ userId: "user_1", displayName: "Wei", levelId: "oth-L2" }),
    ]);
  });

  it("replaces a user's entry rather than duplicating it", () => {
    const t = new PresenceTracker(5000);
    t.heartbeat("user_1", "Wei", "oth-L1");
    t.heartbeat("user_1", "Wei", "oth-L2");
    expect(t.list()).toHaveLength(1);
    expect(t.list()[0]?.levelId).toBe("oth-L2");
  });

  it("drops a user who has stopped sending heartbeats", () => {
    vi.useFakeTimers();
    const t = new PresenceTracker(5000);
    t.heartbeat("user_1", "Wei", "oth-L1");
    vi.advanceTimersByTime(6000);
    expect(t.list()).toEqual([]);
    vi.useRealTimers();
  });

  it("keeps several users apart", () => {
    const t = new PresenceTracker(5000);
    t.heartbeat("user_1", "Wei", "oth-L1");
    t.heartbeat("user_2", "Sam", "oth-L2");
    expect(t.list()).toHaveLength(2);
  });

  it("notifies subscribers on a heartbeat", () => {
    const t = new PresenceTracker(5000);
    const seen: unknown[] = [];
    t.subscribe(p => seen.push(p));
    t.heartbeat("user_1", "Wei", "oth-L1");
    expect(seen).toHaveLength(1);
  });

  it("stops notifying after unsubscribe", () => {
    const t = new PresenceTracker(5000);
    const seen: unknown[] = [];
    const off = t.subscribe(p => seen.push(p));
    off();
    t.heartbeat("user_1", "Wei", "oth-L1");
    expect(seen).toHaveLength(0);
  });
});
