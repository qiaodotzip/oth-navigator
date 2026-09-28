import { RoomDraftSchema, type RoomDraft } from "@oth/model";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { ApiError, ConflictError } from "../api/client";
import { createSaver } from "../state/save";
import { useEditorStore } from "../state/store";
import { fakeApi } from "../testing/fakeApi";
import { useToasts } from "../ui/toast";
import { acceptDrafts, nextDraft, rejectDraft } from "./draftActions";

const draft = (id: string, nameEn: string): RoomDraft => RoomDraftSchema.parse({
  id, levelId: "oth-L2", nameEn, kind: "room", footprint: [[0, 0], [10, 0], [10, 10], [0, 10]],
  labelPoint: [5, 5], areaM2: 96, source: { checksum: "c".repeat(64), page: 1 }, version: 0,
});
const shop = draft("rd_shop", "Shop");
const store = draft("rd_store", "Store Room");
const lastToast = () => useToasts.getState().toasts.at(-1);

function context(overrides: Parameters<typeof fakeApi>[0] = {}) {
  const api = fakeApi({
    acceptRoomDrafts: vi.fn(async (items: { id: string }[]) =>
      items.map((i, n) => ({ draftId: i.id, draftVersion: 2, roomId: `L2-room-${n}`, roomVersion: 0 }))),
    ...overrides,
  });
  return { api, saver: createSaver(api), levelId: "oth-L2" };
}

beforeEach(() => {
  useEditorStore.getState().reset();
  useToasts.getState().clear();
});

describe("acceptDrafts", () => {
  it("makes rooms with the names and kinds decided, reloads the map and the drafts, and offers one Undo", async () => {
    const ctx = context();
    expect(await acceptDrafts(ctx, [{ draft: shop, nameEn: "Shop 12", kind: "service" }, { draft: store, nameEn: "Store Room", kind: "room" }])).toBe(true);
    expect(ctx.api.acceptRoomDrafts).toHaveBeenCalledWith([
      { id: "rd_shop", expectedVersion: 0, nameEn: "Shop 12", kind: "service" },
      { id: "rd_store", expectedVersion: 0, nameEn: "Store Room", kind: "room" },
    ]);
    expect(ctx.api.getModel).toHaveBeenCalled();
    expect(ctx.api.listRoomDrafts).toHaveBeenCalledWith("oth-L2");
    expect(lastToast()).toMatchObject({ message: "Added 2 rooms", action: { label: "Undo" } });

    await lastToast()!.action!.run();
    expect(ctx.api.unacceptRoomDrafts).toHaveBeenCalledWith([
      { id: "rd_shop", expectedVersion: 2, roomVersion: 0 },
      { id: "rd_store", expectedVersion: 2, roomVersion: 0 },
    ]);
    expect(lastToast()?.message).toBe("The 2 rooms are drafts again");
  });

  it("names a single room in its toast", async () => {
    await acceptDrafts(context(), [{ draft: shop, nameEn: "Shop 12", kind: "room" }]);
    expect(lastToast()?.message).toBe("Added Shop 12");
  });

  it("says a refusal in the server's words, reloads the drafts, and offers no Undo", async () => {
    const ctx = context({
      acceptRoomDrafts: vi.fn().mockRejectedValue(new ApiError(422, { error: "Shop is no longer waiting for review: it was rejected, or the drawing was searched again." })),
    });
    expect(await acceptDrafts(ctx, [{ draft: shop, nameEn: "Shop", kind: "room" }])).toBe(false);
    expect(lastToast()?.message).toMatch(/the drawing was searched again/);
    expect(lastToast()?.action).toBeUndefined();
    expect(ctx.api.listRoomDrafts).toHaveBeenCalledWith("oth-L2");
  });

  it("says to accept again when a teammate's accept took the room's id first, rather than that someone changed the draft", async () => {
    const said = "Someone added a room with the same name just now. Accept again, and yours is numbered after theirs.";
    const ctx = context({ acceptRoomDrafts: vi.fn().mockRejectedValue(new ConflictError(null, { error: said, current: null })) });
    expect(await acceptDrafts(ctx, [{ draft: shop, nameEn: "Shop", kind: "room" }])).toBe(false);
    expect(useEditorStore.getState().conflict).toBeNull();
    expect(lastToast()?.message).toMatch(/Accept again, and yours is numbered after theirs/);
  });

  it("names the room that stopped Accept all's Undo, which took none of them back", async () => {
    const ctx = context({
      unacceptRoomDrafts: vi.fn().mockRejectedValue(new ConflictError({ id: "L2-shop-12", nameEn: "Shop 12", version: 3 }, { error: "version conflict" })),
    });
    await acceptDrafts(ctx, [{ draft: shop, nameEn: "Shop 12", kind: "room" }, { draft: store, nameEn: "Store Room", kind: "room" }]);
    await lastToast()!.action!.run();
    expect(ctx.api.unacceptRoomDrafts).toHaveBeenCalledTimes(1);
    expect(lastToast()?.message).toBe("Couldn't undo: Shop 12, one of the 2 rooms, was changed since. Reload to see the latest.");
  });

  it("reloads the drafts after an Undo even when the map's reload fails", async () => {
    const ctx = context();
    await acceptDrafts(ctx, [{ draft: shop, nameEn: "Shop 12", kind: "room" }]);
    (ctx.api.getModel as unknown as Mock).mockRejectedValue(new TypeError("Failed to fetch"));
    (ctx.api.listRoomDrafts as unknown as Mock).mockClear();
    await lastToast()!.action!.run();
    expect(ctx.api.listRoomDrafts).toHaveBeenCalledWith("oth-L2");
  });
});

describe("rejectDraft", () => {
  it("retires the draft and offers Undo, which brings it back at the version the delete left", async () => {
    const ctx = context();
    expect(await rejectDraft(ctx, shop)).toBe(true);
    expect(ctx.api.rejectRoomDraft).toHaveBeenCalledWith("rd_shop", 0);
    expect(lastToast()).toMatchObject({ message: "Rejected Shop", action: { label: "Undo" } });
    await lastToast()!.action!.run();
    expect(ctx.api.restoreRoomDraft).toHaveBeenCalledWith("rd_shop", 1);
  });

  it("offers Retry when the reject never arrived", async () => {
    const ctx = context({ rejectRoomDraft: vi.fn().mockRejectedValue(new TypeError("Failed to fetch")) });
    expect(await rejectDraft(ctx, shop)).toBe(false);
    expect(lastToast()?.action?.label).toBe("Retry");
    expect(ctx.api.restoreRoomDraft as unknown as Mock).not.toHaveBeenCalled();
  });
});

describe("nextDraft", () => {
  it("is the one after, going round, and nothing when it was the only one", () => {
    expect(nextDraft([shop, store], "rd_shop")?.id).toBe("rd_store");
    expect(nextDraft([shop, store], "rd_store")?.id).toBe("rd_shop");
    expect(nextDraft([shop], "rd_shop")).toBeNull();
    expect(nextDraft([shop, store], "gone")?.id).toBe("rd_shop");
    expect(nextDraft([], null)).toBeNull();
  });
});
