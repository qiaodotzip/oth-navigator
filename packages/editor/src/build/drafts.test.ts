import { RoomDraftSchema, type RoomDraft } from "@oth/model";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/client";
import { fakeApi } from "../testing/fakeApi";
import { useToasts } from "../ui/toast";
import { loadDrafts, useDrafts, useRoomDrafts } from "./drafts";

const draft = (id: string): RoomDraft => RoomDraftSchema.parse({
  id, levelId: "oth-L2", nameEn: id, kind: "room", footprint: [[0, 0], [10, 0], [10, 10], [0, 10]],
  labelPoint: [5, 5], areaM2: 96, source: { checksum: "c".repeat(64), page: 1 },
});

beforeEach(() => {
  useDrafts.getState().reset();
  useToasts.getState().clear();
});

describe("the drafts store", () => {
  it("loads a floor's drafts", async () => {
    const api = fakeApi({ listRoomDrafts: vi.fn().mockResolvedValue([draft("rd_a")]) });
    expect(await loadDrafts(api, "oth-L2")).toBe(true);
    expect(useDrafts.getState().byLevel["oth-L2"]!.map(d => d.id)).toEqual(["rd_a"]);
  });

  it("lets go of the draft in hand when a reload no longer has it", () => {
    act(() => {
      useDrafts.getState().setDrafts("oth-L2", [draft("rd_a"), draft("rd_b")]);
      useDrafts.getState().select("rd_a");
      useDrafts.getState().setDrafts("oth-L2", [draft("rd_b")]);
    });
    expect(useDrafts.getState().selectedId).toBeNull();
  });

  it("keeps the draft in hand when another floor's drafts load", () => {
    act(() => {
      useDrafts.getState().setDrafts("oth-L2", [draft("rd_a")]);
      useDrafts.getState().select("rd_a");
      useDrafts.getState().setDrafts("oth-L3", []);
    });
    expect(useDrafts.getState().selectedId).toBe("rd_a");
  });

  it("asks to frame the same box twice as two requests", () => {
    const box = { minX: 0, minY: 0, maxX: 1, maxY: 1 };
    act(() => useDrafts.getState().frameBox(box));
    const first = useDrafts.getState().frame;
    act(() => useDrafts.getState().frameBox(box));
    expect(useDrafts.getState().frame).not.toBe(first);
    expect(useDrafts.getState().frame!.seq).toBe(first!.seq + 1);
  });

  it("says a failed load in words, with Retry where trying again could work", async () => {
    const api = fakeApi({ listRoomDrafts: vi.fn().mockRejectedValue(new ApiError(500, {})) });
    expect(await loadDrafts(api, "oth-L2")).toBe(false);
    expect(useToasts.getState().toasts.at(-1)?.message).toMatch(/^Couldn't load the drafts from the drawing/);
    expect(useToasts.getState().toasts.at(-1)?.action?.label).toBe("Retry");
  });

  it("loads the floor's drafts whenever the floor changes", async () => {
    const api = fakeApi({ listRoomDrafts: vi.fn().mockResolvedValue([]) });
    const { rerender } = renderHook(({ levelId }) => useRoomDrafts(api, levelId), { initialProps: { levelId: "oth-L1" as string | null } });
    rerender({ levelId: "oth-L2" });
    await vi.waitFor(() => expect(api.listRoomDrafts).toHaveBeenCalledTimes(2));
    expect((api.listRoomDrafts as unknown as { mock: { calls: string[][] } }).mock.calls.map(c => c[0])).toEqual(["oth-L1", "oth-L2"]);
  });
});
