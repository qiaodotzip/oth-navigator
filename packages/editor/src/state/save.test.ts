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
    // The sign-in dialog is the message; a toast would only repeat it.
    expect(useToasts.getState().toasts).toHaveLength(0);
  });

  it("says the map could not be loaded, and offers Retry", async () => {
    const getModel = vi.fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(model);
    expect(await createSaver(fakeApi({ getModel })).load()).toBe(false);
    const failed = useToasts.getState().toasts.at(-1)!;
    expect(failed).toMatchObject({ tone: "error", action: { label: "Retry" } });
    expect(failed.message).toMatch(/couldn't load the map/i);
    await failed.action!.run();
    expect(useEditorStore.getState().model).toEqual(model);
  });

  it("gives a refusal in the server's words, and says to reload the page rather than retry", async () => {
    const getModel = vi.fn(async () => { throw new ApiError(403, { error: "not allowed" }); });
    expect(await createSaver(fakeApi({ getModel })).load()).toBe(false);
    expect(useToasts.getState().toasts.at(-1)).toMatchObject({
      tone: "error",
      message: "Couldn't load the map: not allowed. Reload the page to try again.",
      action: undefined,
    });
  });

  it("says the server refused, with its status, when it gave no words", async () => {
    const getModel = vi.fn(async () => { throw new ApiError(404, null); });
    await createSaver(fakeApi({ getModel })).load();
    expect(useToasts.getState().toasts.at(-1)!.message)
      .toBe("Couldn't load the map: the server refused it (HTTP 404). Reload the page to try again.");
  });

  it("shares one attempt between loads at once, so a failure is said once", async () => {
    // StrictMode runs the mount effect twice in development, on the same saver.
    const getModel = vi.fn(async () => { throw new TypeError("Failed to fetch"); });
    const saver = createSaver(fakeApi({ getModel }));
    expect(await Promise.all([saver.load(), saver.load()])).toEqual([false, false]);
    expect(getModel).toHaveBeenCalledTimes(1);
    expect(useToasts.getState().toasts).toHaveLength(1);
  });

  it("tries afresh once the last attempt has finished", async () => {
    const getModel = vi.fn(async () => model);
    const saver = createSaver(fakeApi({ getModel }));
    await saver.load();
    await saver.load();
    expect(getModel).toHaveBeenCalledTimes(2);
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

  describe("the plans a reload brings", () => {
    const image = {
      id: "img_1", levelId: "oth-L1", filename: "a.png", widthPx: 1, heightPx: 1,
      sizeBytes: 1, metresPerPixel: null, offsetX: 0, offsetY: 0, opacity: 0.6, version: 0,
    };

    it("never roll back a plan saved after the list was read, so its next save does not 409", async () => {
      useEditorStore.getState().setLevelImages([image]);
      let answer!: (items: typeof image[]) => void;
      const listLevelImages = vi.fn(() => new Promise<typeof image[]>(resolve => { answer = resolve; }));
      const reloading = createSaver(fakeApi({ listLevelImages })).refresh();
      // A plan save lands while the list, read before it at version 0, is still on its way back.
      const saved = { ...image, metresPerPixel: 0.21, version: 1 };
      useEditorStore.getState().setLevelImages([saved]);
      answer([image]);
      await reloading;
      expect(useEditorStore.getState().levelImages).toEqual([saved]);
    });

    it("still bring a newer version from the server, such as someone else's change", async () => {
      useEditorStore.getState().setLevelImages([image]);
      const theirs = { ...image, opacity: 0.3, version: 2 };
      await createSaver(fakeApi({ listLevelImages: vi.fn(async () => [theirs]) })).refresh();
      expect(useEditorStore.getState().levelImages).toEqual([theirs]);
    });
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

  it("leaves Retry off a write whose caller asked for none, even when the network failed", async () => {
    const createEntity = vi.fn(async () => { throw new TypeError("Failed to fetch"); });
    expect(await createSaver(fakeApi({ createEntity })).create("portalEndpoint", { id: "ep" }, { retry: false }))
      .toBe(false);
    const failed = useToasts.getState().toasts.at(-1)!;
    expect(failed).toMatchObject({ tone: "error", message: expect.stringMatching(/couldn't save your change/i) });
    expect(failed.action).toBeUndefined();
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

describe("a write followed quickly by another", () => {
  const start = parseModel({
    building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
    levels: model.levels,
    objectKinds: [{ id: "ok_bin", nameEn: "wastebin", size: { w: 0.5, d: 0.5, h: 1 } }],
    placements: [{ id: "L1-bin-1", levelId: "oth-L1", objectKindId: "ok_bin", roomId: "L1-hall", position: [3, 3, 0] }],
  });
  type Placed = (typeof start.placements)[number];

  /**
   * The server in miniature: it keeps each placement's version and refuses a
   * stale one with a 409, as the real one does. Its reloads are slow: each
   * answers only when the test says, with what the server had when it was asked.
   */
  function server() {
    let now = start;
    const waiting: (() => void)[] = [];
    const bin = () => now.placements.find(p => p.id === "L1-bin-1")!;
    const write = (patch: Partial<Placed>) => {
      const saved = { ...bin(), ...patch, version: bin().version + 1 } as Placed;
      now = { ...now, placements: now.placements.map(p => (p.id === saved.id ? saved : p)) };
      return saved;
    };
    const api = fakeApi({
      getModel: vi.fn(() => {
        const asked = now;
        return new Promise(resolve => waiting.push(() => resolve(asked)));
      }),
      updateEntity: vi.fn(async (_type: string, _id: string, expectedVersion: number, data: Partial<Placed>) => {
        if (bin().version !== expectedVersion) throw new ConflictError({ ...bin() }, null);
        return write(data);
      }),
    });
    return {
      api,
      /** A teammate's change, straight to the server. */
      teammate: (patch: Partial<Placed>) => write(patch),
      /** Answers the reloads asked so far, the earliest first unless told otherwise. */
      answer: (order: "in turn" | "latest first" = "in turn") => {
        const now = waiting.splice(0);
        for (const go of order === "in turn" ? now : now.reverse()) go();
      },
      /** Answers only the earliest reload still out. */
      answerEarliest: async () => {
        waiting.shift()!();
        // Let its answer reach the store.
        for (let i = 0; i < 5; i++) await Promise.resolve();
      },
    };
  }

  const held = () => useEditorStore.getState().model!.placements.find(p => p.id === "L1-bin-1")!;

  beforeEach(() => useEditorStore.getState().setModel(start));

  it("puts the saved version and the fields sent into the store at once, before the reload answers", async () => {
    const { api } = server();
    void createSaver(api).update("placement", "L1-bin-1", 0, { position: [5, 4, 0] });
    await vi.waitFor(() => expect(held().version).toBe(1));
    expect(held().position).toEqual([5, 4, 0]);
  });

  it("lets a rotation typed just after a drag save too, rather than 409 against your own drag", async () => {
    const { api, answer } = server();
    const saver = createSaver(api);
    const drag = saver.update("placement", "L1-bin-1", held().version, { position: [5, 4, 0] });
    await vi.waitFor(() => expect(held().version).toBe(1));
    // The drag's reload has not answered yet.
    const turn = saver.update("placement", "L1-bin-1", held().version, { rotationDeg: 90 });
    await vi.waitFor(() => expect(held().version).toBe(2));
    answer();
    expect(await Promise.all([drag, turn])).toEqual([true, true]);
    expect(useEditorStore.getState().conflict).toBeNull();
    expect(held()).toMatchObject({ version: 2, position: [5, 4, 0], rotationDeg: 90 });
  });

  it("never lets the drag's slow reload put the old version back after the rotation saved", async () => {
    const { api, answer } = server();
    const saver = createSaver(api);
    const drag = saver.update("placement", "L1-bin-1", 0, { position: [5, 4, 0] });
    await vi.waitFor(() => expect(held().version).toBe(1));
    const turn = saver.update("placement", "L1-bin-1", 1, { rotationDeg: 90 });
    await vi.waitFor(() => expect(held().version).toBe(2));
    // Both reloads answer, the drag's first: it was asked at version 1.
    answer();
    await Promise.all([drag, turn]);
    expect(held().version).toBe(2);
    // So a third change, made now, still saves.
    const scale = saver.update("placement", "L1-bin-1", held().version, { scale: 2 });
    await vi.waitFor(() => expect(held().version).toBe(3));
    answer();
    expect(await scale).toBe(true);
  });

  it("drops a reload asked before a write landed, even when it answers before the write's own reload", async () => {
    const { api, answer, answerEarliest } = server();
    const saver = createSaver(api);
    // A reload already on its way — a load, say — when the drag lands.
    const before = saver.refresh();
    const drag = saver.update("placement", "L1-bin-1", 0, { position: [5, 4, 0] });
    await vi.waitFor(() => expect(held().version).toBe(1));
    await answerEarliest();
    await before;
    // Asked at version 0, it would have made a rotation typed now a conflict.
    expect(held()).toMatchObject({ version: 1, position: [5, 4, 0] });
    answer();
    await drag;
    expect(held()).toMatchObject({ version: 1, position: [5, 4, 0] });
  });

  it("keeps the newer of two reloads, whichever answers last", async () => {
    const { api, answer, teammate } = server();
    const saver = createSaver(api);
    const first = saver.refresh();
    teammate({ rotationDeg: 45 });
    const second = saver.refresh();
    answer("latest first");
    await Promise.all([first, second]);
    expect(held()).toMatchObject({ version: 1, rotationDeg: 45 });
  });

  it("still refuses a change a teammate saved in between, with a conflict naming it", async () => {
    const { api, teammate } = server();
    const saver = createSaver(api);
    const drag = saver.update("placement", "L1-bin-1", 0, { position: [5, 4, 0] });
    await vi.waitFor(() => expect(held().version).toBe(1));
    teammate({ rotationDeg: 180 });
    expect(await saver.update("placement", "L1-bin-1", held().version, { scale: 2 })).toBe(false);
    expect(useEditorStore.getState().conflict).toMatchObject({
      entityType: "placement", entityId: "L1-bin-1", current: { version: 2, rotationDeg: 180 },
    });
    void drag;
  });

  it("clears a field sent as null, as the server does", async () => {
    const withRoom = parseModel({ ...start, placements: [{ ...start.placements[0]!, assetId: "asset_1" }] });
    useEditorStore.getState().setModel(withRoom);
    const api = fakeApi({
      getModel: vi.fn(() => new Promise(() => {})),
      updateEntity: vi.fn(async () => ({ id: "L1-bin-1", version: 1 })),
    });
    void createSaver(api).update("placement", "L1-bin-1", 0, { assetId: null });
    await vi.waitFor(() => expect(held().version).toBe(1));
    expect(held()).not.toHaveProperty("assetId");
  });

  it("leaves the store alone when the reply carries no version to trust", async () => {
    const updateEntity = vi.fn(async () => ({}));
    const api = fakeApi({ getModel: vi.fn(() => new Promise(() => {})), updateEntity });
    void createSaver(api).update("placement", "L1-bin-1", 0, { position: [5, 4, 0] });
    await vi.waitFor(() => expect(updateEntity).toHaveBeenCalled());
    await Promise.resolve();
    expect(held()).toMatchObject({ version: 0, position: [3, 3, 0] });
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
