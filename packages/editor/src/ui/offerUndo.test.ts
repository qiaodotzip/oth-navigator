import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, ConflictError } from "../api/client";
import { offerUndo } from "./offerUndo";
import { useToasts } from "./toast";

beforeEach(() => useToasts.getState().clear());

const undoIt = async () => { await useToasts.getState().toasts[0]!.action!.run(); };
const last = () => useToasts.getState().toasts.at(-1)!;

describe("offerUndo", () => {
  it("shows what happened, with Undo", () => {
    offerUndo({ message: "Binned frame 3", undone: "Frame 3 is back", what: "frame 3", run: vi.fn(), refresh: vi.fn(async () => {}) });
    expect(last()).toMatchObject({ message: "Binned frame 3", action: { label: "Undo" } });
  });

  it("says what came back when Undo works, and reloads", async () => {
    const run = vi.fn(async () => ({}));
    const refresh = vi.fn(async () => {});
    offerUndo({ message: "Binned frame 3", undone: "Frame 3 is back", what: "frame 3", run, refresh });
    await undoIt();
    expect(run).toHaveBeenCalledTimes(1);
    expect(last()).toMatchObject({ tone: "success", message: "Frame 3 is back" });
    expect(refresh).toHaveBeenCalled();
  });

  it("reloads even when the undo is refused, and says a teammate changed it", async () => {
    const refresh = vi.fn(async () => {});
    offerUndo({
      message: "Accepted Gate 1", undone: "Gate 1 is back in the queue", what: "Gate 1",
      run: async () => { throw new ConflictError({ version: 5 }, null); },
      refresh,
    });
    await undoIt();
    expect(last().message).toBe("Couldn't undo: Gate 1 was changed since. Reload to see the latest.");
    expect(last().action).toBeUndefined();
    expect(refresh).toHaveBeenCalled();
  });

  it("offers Retry when the undo never arrived, and Retry tries it again", async () => {
    const run = vi.fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce({});
    offerUndo({ message: "Rejected Gate 1", undone: "Gate 1 is back in the queue", what: "Gate 1", run, refresh: vi.fn(async () => {}) });
    await undoIt();
    expect(last()).toMatchObject({ message: "Couldn't undo Gate 1. Check your connection, then retry.", action: { label: "Retry" } });
    await last().action!.run();
    expect(run).toHaveBeenCalledTimes(2);
    expect(last()).toMatchObject({ tone: "success", message: "Gate 1 is back in the queue" });
  });

  it("says nothing on a 401: the session-ended dialog is the message", async () => {
    offerUndo({
      message: "Binned frame 3", undone: "Frame 3 is back", what: "frame 3",
      run: async () => { throw new ApiError(401, null); }, refresh: vi.fn(async () => {}),
    });
    await undoIt();
    expect(useToasts.getState().toasts.some(t => t.tone === "error")).toBe(false);
  });

  // Ruling 7: a refusal that a retry would only meet again ends with a next
  // step, rather than leaving a teammate stuck on an undo that will not go
  // through, with the server's own words when it gave any.
  it("gives the server's own refusal and a next step, offering no Retry it would only fail again", async () => {
    const refresh = vi.fn(async () => {});
    offerUndo({
      message: "Rejected Gate 1", undone: "Gate 1 is back in the queue", what: "Gate 1",
      run: async () => { throw new ApiError(422, { error: "that vote is closed" }); },
      refresh,
    });
    await undoIt();
    expect(last()).toMatchObject({
      message: "Couldn't undo Gate 1: that vote is closed. Reload to see where it stands.",
      action: undefined,
    });
    expect(refresh).toHaveBeenCalled();
  });

  it("falls back to a generic refusal when the server gave no words of its own", async () => {
    offerUndo({
      message: "Binned frame 3", undone: "Frame 3 is back", what: "frame 3",
      run: async () => { throw new ApiError(422, null); }, refresh: vi.fn(async () => {}),
    });
    await undoIt();
    expect(last().message).toBe("Couldn't undo frame 3: the server refused it. Reload to see where it stands.");
  });
});
