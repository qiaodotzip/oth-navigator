import { parseModel } from "@oth/model";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, ConflictError } from "../api/client";
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

beforeEach(() => useEditorStore.getState().reset());

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

  it("surfaces an unexpected failure as a status message rather than crashing", async () => {
    const api = fakeApi({ updateEntity: vi.fn(async () => { throw new Error("network down"); }) });
    expect(await createSaver(api).update("room", "L1-a", 0, {})).toBe(false);
    expect(useEditorStore.getState().status).toMatch(/network down/);
  });

  it("clears a previous conflict on a successful write", async () => {
    useEditorStore.getState().setConflict({ entityType: "room", entityId: "L1-a", current: null });
    await createSaver(fakeApi()).update("room", "L1-a", 0, {});
    expect(useEditorStore.getState().conflict).toBeNull();
  });
});
