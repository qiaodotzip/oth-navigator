import { describe, expect, it, vi } from "vitest";
import { reloadForGate } from "./gateReload";

function memory() {
  const kept = new Map<string, string>();
  return {
    getItem: (key: string) => kept.get(key) ?? null,
    setItem: (key: string, value: string) => void kept.set(key, value),
  };
}

describe("reloadForGate", () => {
  it("reloads, so the server can ask for the team code", () => {
    const reload = vi.fn();
    expect(reloadForGate(reload, memory(), 1_000_000)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("does not reload again at once, so a page that is gated straight away cannot spin", () => {
    const reload = vi.fn();
    const storage = memory();
    reloadForGate(reload, storage, 1_000_000);
    expect(reloadForGate(reload, storage, 1_010_000)).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("reloads again once half a minute has passed", () => {
    const reload = vi.fn();
    const storage = memory();
    reloadForGate(reload, storage, 1_000_000);
    expect(reloadForGate(reload, storage, 1_031_000)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it("still reloads in a browser that keeps nothing", () => {
    const reload = vi.fn();
    expect(reloadForGate(reload, null, 1_000_000)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
