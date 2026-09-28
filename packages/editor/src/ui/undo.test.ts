import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, ConflictError } from "../api/client";
import { useToasts } from "./toast";
import { deleteWithUndo } from "./undo";

beforeEach(() => useToasts.getState().clear());

function fakes() {
  return {
    api: { restoreEntity: vi.fn(async () => ({})) },
    saver: { remove: vi.fn(async () => true), refresh: vi.fn(async () => {}) },
  };
}

const removals = [
  { type: "portalEndpoint" as const, id: "ep-1", version: 3 },
  { type: "portal" as const, id: "lift-a", version: 1 },
];

describe("deleteWithUndo", () => {
  it("deletes, then offers Undo", async () => {
    const { api, saver } = fakes();
    expect(await deleteWithUndo({ api, saver, removals, label: "Lift A" })).toBe(true);
    expect(saver.remove).toHaveBeenCalledTimes(2);
    expect(useToasts.getState().toasts[0]).toMatchObject({ message: "Deleted Lift A", action: { label: "Undo" } });
  });

  it("undoes in reverse, at the version each delete left, and reloads", async () => {
    const { api, saver } = fakes();
    await deleteWithUndo({ api, saver, removals, label: "Lift A" });
    await useToasts.getState().toasts[0]!.action!.run();
    expect(api.restoreEntity.mock.calls).toEqual([["portal", "lift-a", 2], ["portalEndpoint", "ep-1", 4]]);
    expect(saver.refresh).toHaveBeenCalled();
  });

  it("says Undo could not happen when a teammate has changed it since", async () => {
    const { api, saver } = fakes();
    api.restoreEntity.mockRejectedValueOnce(new ConflictError({ version: 9 }, null));
    await deleteWithUndo({ api, saver, removals: [removals[0]!], label: "Lift A" });
    await useToasts.getState().toasts[0]!.action!.run();
    const last = useToasts.getState().toasts.at(-1)!;
    expect(last.tone).toBe("error");
    expect(last.message).toMatch(/changed since/i);
  });

  it("says nothing on a 401: the session-ended dialog is the message", async () => {
    // I2: a direct write's 401 must not read as "check your connection" —
    // the client's onUnauthorized hook already opened the sign-in dialog.
    const { api, saver } = fakes();
    api.restoreEntity.mockRejectedValueOnce(new ApiError(401, null));
    await deleteWithUndo({ api, saver, removals: [removals[0]!], label: "Lift A" });
    await useToasts.getState().toasts[0]!.action!.run();
    expect(useToasts.getState().toasts.some(t => t.tone === "error")).toBe(false);
  });

  it("still reloads after a 401, since part of the undo may have landed first", async () => {
    const { api, saver } = fakes();
    api.restoreEntity.mockResolvedValueOnce({}).mockRejectedValueOnce(new ApiError(401, null));
    await deleteWithUndo({ api, saver, removals, label: "Lift A" });
    await useToasts.getState().toasts[0]!.action!.run();
    expect(saver.refresh).toHaveBeenCalled();
  });

  it("offers nothing when the delete itself failed", async () => {
    const { api, saver } = fakes();
    saver.remove.mockResolvedValueOnce(false);
    expect(await deleteWithUndo({ api, saver, removals: [removals[0]!], label: "Lift A" })).toBe(false);
    expect(useToasts.getState().toasts).toHaveLength(0);
  });

  it("reloads even when the undo fails, so the plan shows what is really there", async () => {
    const { api, saver } = fakes();
    api.restoreEntity.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await deleteWithUndo({ api, saver, removals: [removals[0]!], label: "Lift A" });
    await useToasts.getState().toasts[0]!.action!.run();
    expect(saver.refresh).toHaveBeenCalled();
  });

  it("says what came back when only part of the undo worked", async () => {
    const { api, saver } = fakes();
    // Restores run in reverse: the lift first, then its stop — which a teammate has touched.
    api.restoreEntity.mockResolvedValueOnce({}).mockRejectedValueOnce(new ConflictError({ version: 9 }, null));
    await deleteWithUndo({ api, saver, removals, label: "Lift A" });
    await useToasts.getState().toasts[0]!.action!.run();
    const message = useToasts.getState().toasts.at(-1)!.message;
    expect(message).toMatch(/the lift or stair came back/i);
    expect(message).toMatch(/its stop on this floor was changed since/i);
  });

  it("retries only what did not come back", async () => {
    const { api, saver } = fakes();
    api.restoreEntity.mockResolvedValueOnce({}).mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await deleteWithUndo({ api, saver, removals, label: "Lift A" });
    await useToasts.getState().toasts[0]!.action!.run();
    const failed = useToasts.getState().toasts.at(-1)!;
    expect(failed.message).toBe(
      "Couldn't undo the rest of Lift A (the lift or stair came back), its stop on this floor. Check your connection, then retry.",
    );
    expect(failed.action?.label).toBe("Retry");
    await failed.action!.run();
    expect(api.restoreEntity.mock.calls).toEqual([
      ["portal", "lift-a", 2],
      ["portalEndpoint", "ep-1", 4],
      ["portalEndpoint", "ep-1", 4],
    ]);
    expect(useToasts.getState().toasts.at(-1)).toMatchObject({ tone: "success", message: "Restored Lift A" });
  });
});
