import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConflictError } from "../api/client";
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

  it("offers nothing when the delete itself failed", async () => {
    const { api, saver } = fakes();
    saver.remove.mockResolvedValueOnce(false);
    expect(await deleteWithUndo({ api, saver, removals: [removals[0]!], label: "Lift A" })).toBe(false);
    expect(useToasts.getState().toasts).toHaveLength(0);
  });
});
