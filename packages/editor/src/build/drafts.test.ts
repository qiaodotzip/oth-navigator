import { RoomDraftSchema, RoomSchema, parseModel, type Room, type RoomDraft } from "@oth/model";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/client";
import { draftNameSpot } from "../plan/DraftLayer";
import { useEditorStore } from "../state/store";
import { fakeApi } from "../testing/fakeApi";
import { useToasts } from "../ui/toast";
import {
  draftBox, draftView, loadDrafts, planNewerThanDrafts, useDraftView, useDrafts, useLinedUp, useLineUp, usePlanChanged, useRoomDrafts,
} from "./drafts";

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
    const api = fakeApi({ listRoomDrafts: vi.fn().mockResolvedValue({ drafts: [draft("rd_a")] }) });
    expect(await loadDrafts(api, "oth-L2")).toBe(true);
    expect(useDrafts.getState().byLevel["oth-L2"]!.map(d => d.id)).toEqual(["rd_a"]);
  });

  it("loads the floor's line-up warning alongside its drafts, when the server sends one", async () => {
    const api = fakeApi({
      listRoomDrafts: vi.fn().mockResolvedValue({ drafts: [draft("rd_a")], lineUp: { dx: 11.5, dy: -4.6, pairs: 7 } }),
    });
    expect(await loadDrafts(api, "oth-L2")).toBe(true);
    expect(useDrafts.getState().lineUpByLevel["oth-L2"]).toEqual({ dx: 11.5, dy: -4.6, pairs: 7 });
    expect(renderHook(() => useLineUp("oth-L2")).result.current).toEqual({ dx: 11.5, dy: -4.6, pairs: 7 });
  });

  it("keeps a floor's linedUp beside its drafts, as it keeps lineUp, and clears it on a load without one (contract v4)", async () => {
    const api = fakeApi({ listRoomDrafts: vi.fn().mockResolvedValue({ drafts: [draft("rd_a")], linedUp: { pairs: 162 } }) });
    expect(await loadDrafts(api, "oth-L2")).toBe(true);
    expect(useDrafts.getState().linedUpByLevel["oth-L2"]).toEqual({ pairs: 162 });
    expect(useDrafts.getState().lineUpByLevel["oth-L2"]).toBeUndefined();
    expect(renderHook(() => useLinedUp("oth-L2")).result.current).toEqual({ pairs: 162 });
    act(() => useDrafts.getState().setDrafts("oth-L2", [draft("rd_a")]));
    expect(useDrafts.getState().linedUpByLevel["oth-L2"]).toBeUndefined();
  });

  it("clears a floor's line-up warning on a load that finds none, or names none in hand", () => {
    act(() => useDrafts.getState().setDrafts("oth-L2", [draft("rd_a")], { dx: 11.5, dy: -4.6, pairs: 7 }));
    expect(useDrafts.getState().lineUpByLevel["oth-L2"]).toBeDefined();
    act(() => useDrafts.getState().setDrafts("oth-L2", [draft("rd_a")]));
    expect(useDrafts.getState().lineUpByLevel["oth-L2"]).toBeUndefined();
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
    const api = fakeApi({ listRoomDrafts: vi.fn().mockResolvedValue({ drafts: [] }) });
    const { rerender } = renderHook(({ levelId }) => useRoomDrafts(api, levelId), { initialProps: { levelId: "oth-L1" as string | null } });
    rerender({ levelId: "oth-L2" });
    await vi.waitFor(() => expect(api.listRoomDrafts).toHaveBeenCalledTimes(2));
    expect((api.listRoomDrafts as unknown as { mock: { calls: string[][] } }).mock.calls.map(c => c[0])).toEqual(["oth-L1", "oth-L2"]);
  });
});

describe("a load that answers late", () => {
  /** A listRoomDrafts whose answers are given by hand, in any order. */
  function slowList() {
    const answers: ((body: { drafts: RoomDraft[] }) => void)[] = [];
    const fails: ((err: unknown) => void)[] = [];
    const api = fakeApi({
      listRoomDrafts: vi.fn(() => new Promise<{ drafts: RoomDraft[] }>((resolve, reject) => {
        answers.push(resolve);
        fails.push(reject);
      })),
    });
    return { api, answers, fails };
  }
  const ids = (levelId: string) => useDrafts.getState().byLevel[levelId]?.map(d => d.id);

  it("doesn't bring back the drafts a search's save replaced", async () => {
    const { api, answers } = slowList();
    const loading = loadDrafts(api, "oth-L2");
    // The search's PUT answers first, with its new drafts; the GET sent before it answers after.
    act(() => useDrafts.getState().setDrafts("oth-L2", [draft("rd_new")]));
    answers[0]!({ drafts: [draft("rd_retired")] });
    expect(await loading).toBe(true);
    expect(ids("oth-L2")).toEqual(["rd_new"]);
  });

  it("keeps the newer of two loads when they answer out of order", async () => {
    const { api, answers } = slowList();
    const first = loadDrafts(api, "oth-L2");
    const second = loadDrafts(api, "oth-L2");
    answers[1]!({ drafts: [draft("rd_newer")] });
    await second;
    answers[0]!({ drafts: [draft("rd_older")] });
    await first;
    expect(ids("oth-L2")).toEqual(["rd_newer"]);
  });

  it("isn't held back by a change to another floor's drafts", async () => {
    const { api, answers } = slowList();
    const loading = loadDrafts(api, "oth-L2");
    act(() => useDrafts.getState().setDrafts("oth-L3", [draft("rd_l3")]));
    answers[0]!({ drafts: [draft("rd_a")] });
    await loading;
    expect(ids("oth-L2")).toEqual(["rd_a"]);
  });

  it("says nothing when a load fails after newer drafts came, since those stand", async () => {
    const { api, fails } = slowList();
    const loading = loadDrafts(api, "oth-L2");
    act(() => useDrafts.getState().setDrafts("oth-L2", [draft("rd_new")]));
    fails[0]!(new ApiError(500, {}));
    expect(await loading).toBe(false);
    expect(useToasts.getState().toasts).toEqual([]);
    expect(ids("oth-L2")).toEqual(["rd_new"]);
  });
});

const square = (x: number, y: number, s: number): [number, number][] => [[x, y], [x + s, y], [x + s, y + s], [x, y + s]];
const room = (id: string, ring: [number, number][], kind: Room["kind"] = "room"): Room =>
  RoomSchema.parse({ id, levelId: "oth-L2", kind, footprint: ring, heightM: 4 });
const shaped = (id: string, ring: [number, number][] | undefined, over: Partial<RoomDraft> = {}): RoomDraft =>
  ({ ...draft(id), footprint: ring, ...over });

describe("whether the plan changed since Find rooms ran", () => {
  const at = (iso: string) => ({ ...draft("rd_a"), updatedAt: iso });
  const found = "2026-09-29T10:00:00.000Z";

  it("reads it from the plan saved after the floor's drafts waiting were found, as after a reload", () => {
    expect(planNewerThanDrafts({ updatedAt: "2026-09-29T10:05:00.000Z" }, [at(found)])).toBe(true);
    expect(planNewerThanDrafts({ updatedAt: "2026-09-29T09:55:00.000Z" }, [at(found)])).toBe(false);
    expect(planNewerThanDrafts({ updatedAt: found }, [at(found)])).toBe(false);
  });

  it("goes by the oldest draft waiting: a search saves them all at once, and only a later undo touches one", () => {
    const restored = { ...at("2026-09-29T10:20:00.000Z"), id: "rd_b" };
    expect(planNewerThanDrafts({ updatedAt: "2026-09-29T10:05:00.000Z" }, [restored, at(found)])).toBe(true);
  });

  it("can't tell with no drafts waiting, or no times to go by", () => {
    expect(planNewerThanDrafts({ updatedAt: "2026-09-29T10:05:00.000Z" }, [])).toBe(false);
    expect(planNewerThanDrafts({}, [at(found)])).toBe(false);
    expect(planNewerThanDrafts({ updatedAt: "2026-09-29T10:05:00.000Z" }, [draft("rd_a")])).toBe(false);
    expect(planNewerThanDrafts(null, [at(found)])).toBe(false);
  });

  it("says so from this tab's mark at once, or from the times with no mark, and not once Find rooms runs again", () => {
    const plan = (updatedAt: string) => ({
      id: "img_2", levelId: "oth-L2", filename: "L2.png", widthPx: 1, heightPx: 1, sizeBytes: 1,
      metresPerPixel: 0.05, offsetX: 0, offsetY: 0, opacity: 0.6, version: 2, updatedAt,
    });
    useEditorStore.getState().setLevelImages([plan("2026-09-29T09:55:00.000Z")]);
    act(() => useDrafts.getState().setDrafts("oth-L2", [at(found)]));
    const { result } = renderHook(() => usePlanChanged("oth-L2"));
    expect(result.current).toBe(false);
    act(() => useDrafts.getState().planChanged("oth-L2"));
    expect(result.current).toBe(true);
    // A reload: no mark, and the plan saved after the drafts were found.
    act(() => {
      useDrafts.getState().reset();
      useEditorStore.getState().setLevelImages([plan("2026-09-29T10:05:00.000Z")]);
      useDrafts.getState().setDrafts("oth-L2", [at(found)]);
    });
    expect(result.current).toBe(true);
    // Find rooms again: its drafts are newer than the plan.
    act(() => useDrafts.getState().searched("oth-L2", [at("2026-09-29T10:10:00.000Z")]));
    expect(result.current).toBe(false);
  });
});

describe("draftView", () => {
  it("sorts drafts into those to review, those already on the map, and open spaces to draw by hand", () => {
    const view = draftView(
      [shaped("new", square(0, 0, 10)), shaped("copy", square(50, 50, 10)), shaped("plaza", undefined)],
      [room("L2-shop", square(50.2, 50.2, 9.6))],
    );
    expect(view.review.map(d => d.id)).toEqual(["new"]);
    expect(view.covered).toEqual([{ draft: expect.objectContaining({ id: "copy" }), roomId: "L2-shop" }]);
    expect(view.open.map(d => d.id)).toEqual(["plaza"]);
  });

  it("hides the copies a second search makes of rooms accepted from the first", () => {
    // Accepted rooms are drafts' exact shapes, so searching again finds them already on the map.
    const accepted = [room("L2-shop", square(0, 0, 10)), room("L2-store", square(20, 0, 10))];
    const again = [shaped("a", square(0, 0, 10)), shaped("b", square(20, 0, 10))];
    expect(draftView(again, accepted).review).toEqual([]);
  });

  it("keeps a draft Claude set aside for a person to review, even one already on the map", () => {
    const setAside = { by: "u_sc", reason: "It lies over a room traced by hand.", at: "2026-09-29T03:00:00.000Z" };
    const view = draftView(
      [shaped("new", square(0, 0, 10)), { ...shaped("copy", square(50, 50, 10)), setAside }],
      [room("L2-shop", square(50.2, 50.2, 9.6))],
    );
    expect(view.review.map(d => d.id)).toEqual(["new", "copy"]);
    expect(view.review[1]!.setAside).toEqual(setAside);
    expect(view.covered).toEqual([]);
    expect(view.shapes.has("copy")).toBe(true);
  });

  it("never takes a hall for a column standing in it, or a column for the hall", () => {
    const view = draftView(
      [shaped("hall", square(0, 0, 30)), shaped("col", square(10, 10, 1), { kind: "detail" })],
      [room("L2-column", square(10, 10, 1), "detail"), room("L2-kiosk", square(40, 40, 5))],
    );
    expect(view.review.map(d => d.id)).toEqual(["hall"]);
    expect(view.covered.map(c => c.roomId)).toEqual(["L2-column"]);
  });

  it("keeps a new hall built round a small room for review, since that room is only a sliver of it", () => {
    // The hall covers all of the service room, but the room covers under 1% of the hall.
    const view = draftView([shaped("hall", square(0, 0, 30))], [room("L2-riser", square(10, 10, 2))]);
    expect(view.review.map(d => d.id)).toEqual(["hall"]);
    expect(view.covered).toEqual([]);
  });

  it("works out once where each draft is named, and whether it lies over the map's rooms and details", () => {
    const hall = shaped("hall", square(0, 0, 30));
    const view = draftView(
      [hall, shaped("shop", square(50, 0, 10)), shaped("copy", square(80, 0, 10)), shaped("plaza", undefined)],
      [room("L2-column", square(10, 10, 1), "detail"), room("L2-store", square(80, 0, 10))],
    );
    expect(view.shapes.get("hall")).toEqual({ ...draftNameSpot(hall), overRooms: true });
    expect(view.shapes.get("shop")?.overRooms).toBe(false);
    expect(view.shapes.get("copy")?.overRooms).toBe(true);
    expect(view.shapes.has("plaza")).toBe(false);
  });

  it("notices a small draft inside a big room, where the room's own samples step over it", () => {
    // The 100 m room is sampled every 5 m, at 2.5, 7.5 … 52.5: none of them falls in the draft.
    const view = draftView([shaped("booth", square(50.3, 50.3, 1))], [room("L2-hall", square(0, 0, 100), "area")]);
    expect(view.shapes.get("booth")?.overRooms).toBe(true);
  });
});

describe("draftBox and useDraftView", () => {
  it("frames a draft with 4 m round it, and an open space 15 m round its name", () => {
    expect(draftBox(shaped("d", square(0, 0, 10)))).toEqual({ minX: -4, minY: -4, maxX: 14, maxY: 14 });
    expect(draftBox(shaped("p", undefined, { labelPoint: [60, 60] }))).toEqual({ minX: 45, minY: 45, maxX: 75, maxY: 75 });
  });

  it("gives everything that asks one answer, until the drafts or the map change", () => {
    useEditorStore.getState().setModel(parseModel({
      building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
      levels: [{ id: "oth-L2", buildingId: "oth", code: "L2", ordinal: 2, nameEn: "L2", nameZh: "二楼", elevationM: 6, heightM: 4 }],
    }));
    act(() => useDrafts.getState().setDrafts("oth-L2", [draft("rd_a")]));
    const a = renderHook(() => useDraftView("oth-L2")).result.current;
    const b = renderHook(() => useDraftView("oth-L2")).result.current;
    expect(a).toBe(b);
    act(() => useDrafts.getState().setDrafts("oth-L2", [draft("rd_a"), draft("rd_b")]));
    expect(renderHook(() => useDraftView("oth-L2")).result.current.review).toHaveLength(2);
  });

  it("sorts again when a room on the floor changes, but not for a save elsewhere on the map", () => {
    const base = {
      building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
      levels: [{ id: "oth-L2", buildingId: "oth", code: "L2", ordinal: 2, nameEn: "L2", nameZh: "二楼", elevationM: 6, heightM: 4 }],
      rooms: [{ id: "L2-shop", levelId: "oth-L2", kind: "room", footprint: square(0, 0, 10), heightM: 4, version: 1 }],
    };
    act(() => {
      useEditorStore.getState().setModel(parseModel(base));
      useDrafts.getState().setDrafts("oth-L2", [draft("rd_a")]);
    });
    const before = renderHook(() => useDraftView("oth-L2")).result.current;
    expect(before.covered).toHaveLength(1);

    // A save reloads the whole model: every room is a new object, at the version it had.
    act(() => useEditorStore.getState().setModel(parseModel({ ...base, places: [{ id: "pl_1", nameEn: "Festive Mall", category: "retail" }] })));
    expect(renderHook(() => useDraftView("oth-L2")).result.current).toBe(before);

    act(() => useEditorStore.getState().setModel(parseModel({
      ...base, rooms: [{ ...base.rooms[0]!, footprint: square(20, 20, 10), version: 2 }],
    })));
    expect(renderHook(() => useDraftView("oth-L2")).result.current.review.map(d => d.id)).toEqual(["rd_a"]);
  });
});
