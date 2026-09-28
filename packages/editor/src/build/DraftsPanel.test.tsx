import { RoomDraftSchema, parseModel, type RoomDraft } from "@oth/model";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { ApiError } from "../api/client";
import { createSaver } from "../state/save";
import { useEditorStore } from "../state/store";
import { fakeApi } from "../testing/fakeApi";
import { useToasts } from "../ui/toast";
import { useDrafts } from "./drafts";
import { DraftsPanel } from "./DraftsPanel";
import { useBuildKeys } from "./useBuildKeys";

const square = (x: number, y: number, s: number): [number, number][] => [[x, y], [x + s, y], [x + s, y + s], [x, y + s]];
const model = parseModel({
  building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
  levels: [{ id: "oth-L2", buildingId: "oth", code: "L2", ordinal: 2, nameEn: "L2", nameZh: "二楼", elevationM: 6, heightM: 4 }],
  rooms: [{ id: "L2-hall", levelId: "oth-L2", kind: "area", footprint: square(100, 100, 20), heightM: 4 }],
});
const draft = (id: string, nameEn: string, over: Record<string, unknown> = {}): RoomDraft => RoomDraftSchema.parse({
  id, levelId: "oth-L2", nameEn, kind: "room", footprint: square(0, 0, 10), labelPoint: [5, 5], areaM2: 96.2,
  source: { checksum: "c".repeat(64), page: 1 }, version: 0, ...over,
});
const shop = draft("rd_shop", "Shop");
const store = draft("rd_store", "Store Room", { footprint: square(20, 0, 10), labelPoint: [25, 5], kind: "service" });
const copy = draft("rd_copy", "Hall", { footprint: square(100, 100, 20), labelPoint: [110, 110], kind: "area" });
const plaza = draft("rd_plaza", "Plaza", { footprint: undefined, kind: "area", labelPoint: [60, 60], areaM2: 0 });
const all = [shop, store, copy, plaza];

/** Build's own keys are mounted too, as in the workspace, so A and R are contested as they are there. */
function Keys() {
  useBuildKeys({ onFit: () => {}, onDelete: () => {}, onStep: () => {} });
  return null;
}

function setup(overrides: Parameters<typeof fakeApi>[0] = {}) {
  const api = fakeApi({
    getModel: vi.fn().mockResolvedValue(model),
    listRoomDrafts: vi.fn().mockResolvedValue({ drafts: all }),
    acceptRoomDrafts: vi.fn(async (items: { id: string }[]) =>
      items.map((i, n) => ({ draftId: i.id, draftVersion: 2, roomId: `L2-room-${n}`, roomVersion: 0 }))),
    ...overrides,
  });
  render(<><Keys /><DraftsPanel api={api} saver={createSaver(api)} /></>);
  return api;
}

const key = (k: string, target: Element = document.body) => fireEvent.keyDown(target, { key: k });
const lastToast = () => useToasts.getState().toasts.at(-1);
const hold = (d: RoomDraft) => act(() => useDrafts.getState().select(d.id));

beforeEach(() => {
  useDrafts.getState().reset();
  useToasts.getState().clear();
  const s = useEditorStore.getState();
  s.reset();
  s.setModel(model);
  s.setActiveLevel("oth-L2");
  useDrafts.getState().setDrafts("oth-L2", all);
});

describe("DraftsPanel: drafts Claude set aside for a person", () => {
  const aside = (reason: string) => ({ by: "u_sc", reason, at: "2026-09-29T03:00:00.000Z" });
  const asideCopy = { ...copy, setAside: aside("It lies over the hall; a person should say which is right.") };
  const asidePlaza = { ...plaza, setAside: aside("The drawing leaves it open.") };

  beforeEach(() => {
    useEditorStore.getState().setTeam([{ id: "u_sc", displayName: "Stef Chan" }]);
    useDrafts.getState().setDrafts("oth-L2", [shop, store, asideCopy, asidePlaza]);
  });

  it("counts them among the drafts to review, and says how many Claude set aside", () => {
    setup({ listRoomDrafts: vi.fn().mockResolvedValue({ drafts: [shop, store, asideCopy, asidePlaza] }) });
    expect(screen.getByText("3 drafts to review")).toBeTruthy();
    expect(screen.getByText(/1 set aside by Claude/)).toBeTruthy();
    expect(screen.queryByText(/already on the map/)).toBeNull();
  });

  it("says who set the draft in hand aside, and why", () => {
    setup({ listRoomDrafts: vi.fn().mockResolvedValue({ drafts: [shop, store, asideCopy, asidePlaza] }) });
    hold(asideCopy);
    expect(within(screen.getByRole("group", { name: "Draft: Hall" }))
      .getByText("Set aside by Stef Chan's Claude: It lies over the hall; a person should say which is right.")).toBeTruthy();
    hold(shop);
    expect(within(screen.getByRole("group", { name: "Draft: Shop" })).queryByText(/^Set aside by/)).toBeNull();
  });

  it("marks an open space Claude set aside, with its reason", () => {
    setup({ listRoomDrafts: vi.fn().mockResolvedValue({ drafts: [shop, store, asideCopy, asidePlaza] }) });
    expect(screen.getByText("Set aside by Stef Chan's Claude: The drawing leaves it open.")).toBeTruthy();
  });

  it("leaves them out of Accept all: each is decided knowingly", async () => {
    const api = setup({ listRoomDrafts: vi.fn().mockResolvedValue({ drafts: [shop, store, asideCopy, asidePlaza] }) });
    fireEvent.click(screen.getByRole("button", { name: "Accept all 2 not set aside" }));
    await waitFor(() => expect(api.acceptRoomDrafts).toHaveBeenCalledTimes(1));
    expect((api.acceptRoomDrafts as unknown as Mock).mock.calls[0]![0].map((i: { id: string }) => i.id)).toEqual(["rd_shop", "rd_store"]);
  });
});

describe("DraftsPanel", () => {
  it("says how many drafts wait, and how many are on the map already", () => {
    setup();
    expect(screen.getByText("2 drafts to review")).toBeTruthy();
    expect(screen.getByText(/1 already on the map/)).toBeTruthy();
  });

  it("warns above the list when the drawing's drafts show it sits off the rooms already on the floor", () => {
    act(() => useDrafts.getState().setDrafts("oth-L2", all, { dx: 11.5, dy: -4.6, pairs: 7 }));
    setup();
    expect(screen.getByText(
      "The drawing sits about 11.5 m east and 4.6 m south of the rooms already on L2. "
      + "Line it up with Align on the Floorplan step, then run Find rooms again.",
    )).toBeTruthy();
  });

  it("warns nothing above the list once no offset is known", () => {
    setup();
    expect(screen.queryByText(/The drawing sits about/)).toBeNull();
  });

  it("shows the draft in hand: its name to edit, its kind and its area", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Review the drafts" }));
    expect(useDrafts.getState().selectedId).toBe("rd_shop");
    expect(screen.getByLabelText("Draft name")).toHaveValue("Shop");
    expect(screen.getByLabelText("Draft kind")).toHaveValue("room");
    expect(screen.getByText("96 m²")).toBeTruthy();
  });

  it("accepts the draft with your corrections, then takes up the next", async () => {
    const api = setup();
    hold(shop);
    fireEvent.change(screen.getByLabelText("Draft name"), { target: { value: "Shop 12" } });
    fireEvent.change(screen.getByLabelText("Draft kind"), { target: { value: "service" } });
    fireEvent.click(screen.getByRole("button", { name: "Accept A" }));
    await waitFor(() => expect(api.acceptRoomDrafts).toHaveBeenCalledWith([{ id: "rd_shop", expectedVersion: 0, nameEn: "Shop 12", kind: "service" }]));
    await waitFor(() => expect(useDrafts.getState().selectedId).toBe("rd_store"));
    expect(lastToast()?.message).toBe("Added Shop 12");
  });

  it("won't accept a draft with no name", () => {
    setup();
    hold(shop);
    fireEvent.change(screen.getByLabelText("Draft name"), { target: { value: "  " } });
    expect(screen.getByRole("button", { name: "Accept A" })).toBeDisabled();
  });

  it("takes A as Accept while a draft is in hand, and never as Draw area", async () => {
    const api = setup();
    hold(shop);
    key("a");
    await waitFor(() => expect(api.acceptRoomDrafts).toHaveBeenCalledTimes(1));
    expect(useEditorStore.getState().tool).toBe("select");
  });

  it("takes R as Reject and S as Skip while a draft is in hand", async () => {
    const api = setup();
    hold(shop);
    key("s");
    expect(useDrafts.getState().selectedId).toBe("rd_store");
    key("r");
    await waitFor(() => expect(api.rejectRoomDraft).toHaveBeenCalledWith("rd_store", 0));
    expect(useEditorStore.getState().tool).toBe("select");
  });

  it("leaves A to Draw area when no draft is in hand", () => {
    const api = setup();
    key("a");
    expect(useEditorStore.getState().tool).toBe("draw-area");
    expect(api.acceptRoomDrafts).not.toHaveBeenCalled();
  });

  it("types an a into the name, rather than accepting", () => {
    const api = setup();
    hold(shop);
    key("a", screen.getByLabelText("Draft name"));
    expect(api.acceptRoomDrafts).not.toHaveBeenCalled();
  });

  it("never decides on a held key, nor lets its repeats through to Build", async () => {
    const api = setup();
    hold(shop);
    fireEvent.keyDown(document.body, { key: "a", repeat: true });
    fireEvent.keyDown(document.body, { key: "r", repeat: true });
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
    });
    expect(api.acceptRoomDrafts).not.toHaveBeenCalled();
    expect(api.rejectRoomDraft).not.toHaveBeenCalled();
    expect(useEditorStore.getState().tool).toBe("select");
  });

  it("sends one accept when A is pressed twice before the first lands", async () => {
    let land!: (accepted: unknown) => void;
    const api = setup({ acceptRoomDrafts: vi.fn(() => new Promise(resolve => { land = resolve; })) });
    hold(shop);
    key("a");
    key("a");
    expect(api.acceptRoomDrafts).toHaveBeenCalledTimes(1);
    await act(async () => land([{ draftId: "rd_shop", draftVersion: 2, roomId: "L2-shop", roomVersion: 0 }]));
    await waitFor(() => expect(useDrafts.getState().selectedId).toBe("rd_store"));
    expect(api.acceptRoomDrafts).toHaveBeenCalledTimes(1);
  });

  it("ignores S while a decision is on its way, so the next draft is the one after the draft decided", async () => {
    let land!: (accepted: unknown) => void;
    setup({ acceptRoomDrafts: vi.fn(() => new Promise(resolve => { land = resolve; })) });
    hold(shop);
    key("a");
    key("s");
    expect(useDrafts.getState().selectedId).toBe("rd_shop");
    await act(async () => land([{ draftId: "rd_shop", draftVersion: 2, roomId: "L2-shop", roomVersion: 0 }]));
    await waitFor(() => expect(useDrafts.getState().selectedId).toBe("rd_store"));
  });

  it("takes up no draft when the reload after a decision no longer has the next one", async () => {
    // A teammate searched the drawing again meanwhile: the Store Room draft is gone.
    setup({ listRoomDrafts: vi.fn().mockResolvedValue({ drafts: [copy, plaza] }) });
    hold(shop);
    fireEvent.click(screen.getByRole("button", { name: "Accept A" }));
    await waitFor(() => expect(lastToast()?.message).toBe("Added Shop"));
    await act(async () => {});
    expect(useDrafts.getState().selectedId).toBeNull();
    expect(screen.getByText("0 drafts to review")).toBeTruthy();
  });

  it("accepts every draft to review in one go, never one already on the map, with one Undo for them all", async () => {
    const api = setup();
    act(() => useDrafts.getState().setShowCovered(true));
    fireEvent.click(screen.getByRole("button", { name: "Accept all 2 to review" }));
    await waitFor(() => expect(api.acceptRoomDrafts).toHaveBeenCalledTimes(1));
    expect((api.acceptRoomDrafts as unknown as Mock).mock.calls[0]![0].map((i: { id: string }) => i.id)).toEqual(["rd_shop", "rd_store"]);
    await waitFor(() => expect(lastToast()?.message).toBe("Added 2 rooms"));
    await lastToast()!.action!.run();
    expect(api.unacceptRoomDrafts).toHaveBeenCalledTimes(1);
  });

  it("says so when the draft was replaced by a teammate's new search, and reloads the drafts", async () => {
    const api = setup({
      acceptRoomDrafts: vi.fn().mockRejectedValue(new ApiError(422, { error: "Shop is no longer waiting for review: it was rejected, or the drawing was searched again." })),
    });
    hold(shop);
    fireEvent.click(screen.getByRole("button", { name: "Accept A" }));
    await waitFor(() => expect(lastToast()?.message).toMatch(/the drawing was searched again/));
    expect(api.listRoomDrafts).toHaveBeenCalledWith("oth-L2");
  });

  it("lists open spaces to draw by hand: choosing one picks Draw area and frames it, and Done takes it off", async () => {
    const api = setup();
    fireEvent.click(screen.getByRole("button", { name: "Plaza" }));
    expect(useEditorStore.getState().tool).toBe("draw-area");
    expect(useDrafts.getState().frame?.box).toEqual({ minX: 45, minY: 45, maxX: 75, maxY: 75 });
    fireEvent.click(screen.getByRole("button", { name: "Done with Plaza" }));
    await waitFor(() => expect(api.rejectRoomDraft).toHaveBeenCalledWith("rd_plaza", 0));
  });

  it("counts the open spaces, and tells apart two the drawing names alike", () => {
    const plaza2 = draft("rd_plaza2", "Plaza", { footprint: undefined, kind: "area", labelPoint: [80, 80], areaM2: 0 });
    useDrafts.getState().setDrafts("oth-L2", [...all, plaza2]);
    setup();
    expect(screen.getByRole("heading", { name: "Draw by hand (2)" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Plaza (1 of 2)" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Done with Plaza (1 of 2)" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Plaza (2 of 2)" }));
    expect(useDrafts.getState().frame?.box).toEqual({ minX: 65, minY: 65, maxX: 95, maxY: 95 });
  });

  it("sends one Done while the first is on its way, and keeps the Done buttons off till it lands", async () => {
    let land!: (answer: unknown) => void;
    const api = setup({ rejectRoomDraft: vi.fn(() => new Promise(resolve => { land = resolve; })) });
    const done = screen.getByRole("button", { name: "Done with Plaza" });
    fireEvent.click(done);
    fireEvent.click(done);
    expect(api.rejectRoomDraft).toHaveBeenCalledTimes(1);
    expect(done).toBeDisabled();
    await act(async () => land({}));
    await waitFor(() => expect(lastToast()?.message).toBe("Took Plaza off the list"));
    expect(screen.getByRole("button", { name: "Done with Plaza" })).toBeEnabled();
  });

  it("lets go of the draft in hand to draw an open space, so A and R are Build's again", () => {
    const api = setup();
    hold(shop);
    fireEvent.click(screen.getByRole("button", { name: "Plaza" }));
    expect(useDrafts.getState().selectedId).toBeNull();
    key("r");
    expect(useEditorStore.getState().tool).toBe("draw-room");
    expect(api.rejectRoomDraft).not.toHaveBeenCalled();
  });

  it("lets go of the draft when a drawing tool is picked", () => {
    const api = setup();
    hold(shop);
    act(() => useEditorStore.getState().setTool("draw-room"));
    expect(useDrafts.getState().selectedId).toBeNull();
    key("a");
    expect(useEditorStore.getState().tool).toBe("draw-area");
    expect(api.acceptRoomDrafts).not.toHaveBeenCalled();
  });

  it("reviews with Select: taking up a draft puts a drawing tool down", () => {
    setup();
    act(() => useEditorStore.getState().setTool("draw-area"));
    fireEvent.click(screen.getByRole("button", { name: "Review the drafts" }));
    expect(useEditorStore.getState().tool).toBe("select");
    expect(useDrafts.getState().selectedId).toBe("rd_shop");
  });

  it("lets go of the draft when a room is picked on the plan", () => {
    setup();
    hold(shop);
    act(() => useEditorStore.getState().select({ type: "room", id: "L2-hall" }));
    expect(useDrafts.getState().selectedId).toBeNull();
  });

  it("lets go of the room picked on the plan when a draft is taken up", () => {
    setup();
    act(() => useEditorStore.getState().select({ type: "room", id: "L2-hall" }));
    fireEvent.click(screen.getByRole("button", { name: "Review the drafts" }));
    expect(useEditorStore.getState().selection).toBeNull();
    expect(useDrafts.getState().selectedId).toBe("rd_shop");
  });
});
