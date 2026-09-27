import { parseModel } from "@oth/model";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, ConflictError } from "../api/client";
import { useToasts } from "../ui/toast";
import { createSaver } from "./save";
import { useEditorStore } from "./store";

const model = parseModel({
  building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
  levels: [{ id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6 }],
});

const report = { issues: [], errorCount: 0, warningCount: 0, ok: true };

function fakeApi(overrides: Record<string, unknown> = {}) {
  return {
    getModel: vi.fn(async () => model),
    validate: vi.fn(async () => report),
    listLevelImages: vi.fn(async () => []),
    createEntity: vi.fn(async () => ({ id: "new", version: 0 })),
    updateEntity: vi.fn(async () => ({ id: "L1-a", version: 1 })),
    deleteEntity: vi.fn(async () => ({ id: "L1-a", version: 1 })),
    ...overrides,
  } as never;
}

beforeEach(() => {
  useEditorStore.getState().reset();
  useToasts.getState().clear();
});

describe("saver.apply", () => {
  it("runs any request through the same guard, and reloads once after it", async () => {
    const getModel = vi.fn(async () => model);
    const run = vi.fn(async () => ({}));
    expect(await createSaver(fakeApi({ getModel })).apply("place", "p1", run)).toBe(true);
    expect(run).toHaveBeenCalledTimes(1);
    expect(getModel).toHaveBeenCalledTimes(1);
  });

  it("turns a 409 into a conflict, like any other write", async () => {
    const run = vi.fn(async () => { throw new ConflictError({ id: "p1", version: 4 }, null); });
    expect(await createSaver(fakeApi()).apply("place", "p1", run)).toBe(false);
    expect(useEditorStore.getState().conflict?.entityId).toBe("p1");
  });
});

describe("a saver that does not validate", () => {
  it("never asks for the report, which only the map editor shows", async () => {
    const validate = vi.fn(async () => report);
    await createSaver(fakeApi({ validate }), { validate: false }).refresh();
    expect(validate).not.toHaveBeenCalled();
    expect(useEditorStore.getState().model).toEqual(model);
  });
});

describe("saver.load", () => {
  it("loads like refresh when all is well", async () => {
    expect(await createSaver(fakeApi()).load()).toBe(true);
    expect(useEditorStore.getState().model).toEqual(model);
  });

  it("sends someone whose session expired back to sign in", async () => {
    useEditorStore.getState().setUser({ id: "u1", email: "a@oth.local", displayName: "A" });
    const getModel = vi.fn(async () => { throw new ApiError(401, null); });
    expect(await createSaver(fakeApi({ getModel })).load()).toBe(false);
    expect(useEditorStore.getState().user).toBeNull();
  });

  it("says the server cannot be reached, instead of throwing into the void", async () => {
    const getModel = vi.fn(async () => { throw new TypeError("Failed to fetch"); });
    expect(await createSaver(fakeApi({ getModel })).load()).toBe(false);
    expect(useEditorStore.getState().status).toMatch(/can't reach the server/i);
  });
});

describe("saver", () => {
  it("refresh loads the model and the validation report together", async () => {
    await createSaver(fakeApi()).refresh();
    expect(useEditorStore.getState().model).toEqual(model);
    expect(useEditorStore.getState().report).toEqual(report);
  });

  it("create refreshes so the canvas shows what the server accepted", async () => {
    const getModel = vi.fn(async () => model);
    await createSaver(fakeApi({ getModel })).create("room", { id: "x" });
    expect(getModel).toHaveBeenCalledTimes(1);
  });

  it("loads level images alongside the model", async () => {
    const image = {
      id: "img_1", levelId: "oth-L1", filename: "a.png", widthPx: 1, heightPx: 1,
      sizeBytes: 1, metresPerPixel: null, offsetX: 0, offsetY: 0, opacity: 0.6, version: 0,
    };
    await createSaver(fakeApi({ listLevelImages: vi.fn(async () => [image]) })).refresh();
    expect(useEditorStore.getState().levelImages).toEqual([image]);
  });

  it("update returns true on success", async () => {
    expect(await createSaver(fakeApi()).update("room", "L1-a", 0, { nameEn: "X" })).toBe(true);
  });

  it("raises a conflict into the store instead of throwing", async () => {
    const current = { id: "L1-a", version: 3, nameEn: "Theirs" };
    const api = fakeApi({
      updateEntity: vi.fn(async () => { throw new ConflictError(current, null); }),
    });
    expect(await createSaver(api).update("room", "L1-a", 0, { nameEn: "Mine" })).toBe(false);
    expect(useEditorStore.getState().conflict).toEqual({
      entityType: "room", entityId: "L1-a", current,
    });
  });

  it("does not retry a conflicted write — the user decides", async () => {
    const updateEntity = vi.fn(async () => { throw new ConflictError(null, null); });
    await createSaver(fakeApi({ updateEntity })).update("room", "L1-a", 0, {});
    expect(updateEntity).toHaveBeenCalledTimes(1);
  });

  it("reports an unexpected failure as a toast with Retry, and Retry sends the same write", async () => {
    const updateEntity = vi.fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce({ id: "L1-a", version: 1 });
    expect(await createSaver(fakeApi({ updateEntity })).update("room", "L1-a", 0, { nameEn: "X" })).toBe(false);
    const failed = useToasts.getState().toasts.at(-1)!;
    expect(failed).toMatchObject({ tone: "error", action: { label: "Retry" } });
    await failed.action!.run();
    expect(updateEntity).toHaveBeenCalledTimes(2);
    expect(updateEntity.mock.calls[1]).toEqual(["room", "L1-a", 0, { nameEn: "X" }]);
  });

  it("gives a refusal in the server's words, with no Retry", async () => {
    const updateEntity = vi.fn(async () => { throw new ApiError(422, { error: "invalid entity" }); });
    await createSaver(fakeApi({ updateEntity })).update("room", "L1-a", 0, {});
    expect(useToasts.getState().toasts.at(-1)).toMatchObject({
      tone: "error",
      message: "Couldn't save your change: invalid entity.",
    });
    expect(useToasts.getState().toasts.at(-1)!.action).toBeUndefined();
  });

  it("keeps the failure on screen until it is dismissed", async () => {
    const updateEntity = vi.fn(async () => { throw new TypeError("Failed to fetch"); });
    await createSaver(fakeApi({ updateEntity })).update("room", "L1-a", 0, {});
    expect(useToasts.getState().toasts.at(-1)!.durationMs).toBeNull();
  });

  it("counts a write that landed as saved, even when the reload after it fails", async () => {
    const getModel = vi.fn(async () => { throw new TypeError("Failed to fetch"); });
    expect(await createSaver(fakeApi({ getModel })).create("room", { id: "x" })).toBe(true);
    const failed = useToasts.getState().toasts.at(-1)!;
    expect(failed.message).toBe("Couldn't reload the map after saving. Check your connection, then retry.");
    expect(failed.action?.label).toBe("Retry");
  });

  it("goes through apply for a frame, which is not a generic entity", async () => {
    const run = vi.fn(async () => undefined);
    expect(await createSaver(fakeApi()).apply("keyframe", "kf_1", run)).toBe(true);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("clears a previous conflict on a successful write", async () => {
    useEditorStore.getState().setConflict({ entityType: "room", entityId: "L1-a", current: null });
    await createSaver(fakeApi()).update("room", "L1-a", 0, {});
    expect(useEditorStore.getState().conflict).toBeNull();
  });
});

describe("an expired session", () => {
  it("ends the session as expired when a write is refused as signed out", async () => {
    useEditorStore.getState().setUser({ id: "u1", email: "a@oth.local", displayName: "A" });
    const updateEntity = vi.fn(async () => { throw new ApiError(401, null); });
    expect(await createSaver(fakeApi({ updateEntity })).update("room", "r1", 0, { nameEn: "x" })).toBe(false);
    expect(useEditorStore.getState().user).toBeNull();
    expect(useEditorStore.getState().sessionEnd).toBe("expired");
  });

  it("clears the reason once someone signs in again", () => {
    useEditorStore.getState().endSession("expired");
    useEditorStore.getState().setUser({ id: "u1", email: "a@oth.local", displayName: "A" });
    expect(useEditorStore.getState().sessionEnd).toBeNull();
  });

  it("says the change was lost when the write itself was refused", async () => {
    useEditorStore.getState().setUser({ id: "u1", email: "a@oth.local", displayName: "A" });
    const updateEntity = vi.fn(async () => { throw new ApiError(401, null); });
    await createSaver(fakeApi({ updateEntity })).update("room", "r1", 0, {});
    expect(useEditorStore.getState().sessionEndUnsaved).toBe(true);
  });

  it("does not say a change was lost when it landed and only the reload was refused", async () => {
    useEditorStore.getState().setUser({ id: "u1", email: "a@oth.local", displayName: "A" });
    const getModel = vi.fn(async () => { throw new ApiError(401, null); });
    expect(await createSaver(fakeApi({ getModel })).update("room", "r1", 0, {})).toBe(true);
    expect(useEditorStore.getState().sessionEnd).toBe("expired");
    expect(useEditorStore.getState().sessionEndUnsaved).toBe(false);
  });
});
