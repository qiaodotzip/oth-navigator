import { parseModel, type Level } from "@oth/model";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConflictError, type Api } from "../api/client";
import { useCurrentRoute } from "../route";
import { createSaver } from "../state/save";
import { useEditorStore } from "../state/store";
import { fakeApi } from "../testing/fakeApi";
import { useToasts } from "../ui/toast";
import { ReviewWorkspace } from "./ReviewWorkspace";

const frame = (id: string, captureId: string, timeMs: number) =>
  ({ id, captureId, timeMs, imageId: id, widthPx: 640, heightPx: 360 });

const reviewModel = parseModel({
  building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
  levels: [
    { id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "Level 1", nameZh: "一楼", elevationM: 0, heightM: 6 },
    { id: "oth-L2", buildingId: "oth", code: "L2", ordinal: 2, nameEn: "Level 2", nameZh: "二楼", elevationM: 6, heightM: 4 },
  ],
  captures: [
    { id: "cap_1", kind: "video", filename: "L1.mp4", levelId: "oth-L1" },
    { id: "cap_2", kind: "video", filename: "L2.mp4", levelId: "oth-L2" },
  ],
  keyframes: [frame("kf_1", "cap_1", 1000), frame("kf_2", "cap_1", 2000), frame("kf_9", "cap_2", 0)],
  places: [
    { id: "p_big", nameEn: "Festive Mall", category: "retail", status: "proposed", proposedBy: "claude-code", notes: "Fascia reads FESTIVE MALL." },
    { id: "p_small", nameEn: "Gate 1", category: "facility", status: "proposed", proposedBy: "claude-code" },
    { id: "p_conf", nameEn: "Gate 1", category: "facility", levelId: "oth-L1" },
    { id: "p_l2", nameEn: "Up there", category: "retail", status: "proposed" },
    { id: "p_none", nameEn: "No frames", category: "retail", status: "proposed", notes: "From the directory." },
  ],
  sightings: [
    { id: "s1", placeId: "p_big", keyframeId: "kf_1", status: "proposed", box: { x: 0.1, y: 0.2, w: 0.3, h: 0.2 } },
    { id: "s2", placeId: "p_big", keyframeId: "kf_2", status: "proposed" },
    { id: "s3", placeId: "p_small", keyframeId: "kf_1", status: "proposed" },
    { id: "s9", placeId: "p_l2", keyframeId: "kf_9", status: "proposed" },
  ],
});
const L1 = reviewModel.levels[0] as Level;

function Hosted({ api }: { api: Api }) {
  const route = useCurrentRoute();
  const saver = createSaver(api, { validate: false });
  return <ReviewWorkspace api={api} saver={saver} level={L1} params={route.name === "floor" ? route.params : {}} />;
}

function at(search = "", overrides: Record<string, unknown> = {}) {
  const api = fakeApi({ getModel: vi.fn().mockResolvedValue(reviewModel), ...overrides });
  window.history.pushState({}, "", `/floors/L1/review${search}`);
  render(<Hosted api={api} />);
  return api as unknown as Record<string, ReturnType<typeof vi.fn>>;
}

const param = (name: string) => new URLSearchParams(window.location.search).get(name);
const key = (k: string, target: Element = document.body) => fireEvent.keyDown(target, { key: k });
const nameField = () => screen.getByLabelText("Name") as HTMLInputElement;
const toastSaying = (message: string) => useToasts.getState().toasts.find(t => t.message === message);
const errorToast = () => useToasts.getState().toasts.find(t => t.tone === "error");

/** A request that answers when the test says so. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

/** Lets every pending answer from the fake API arrive: they are all microtasks. */
const settle = () => act(async () => { await new Promise(r => setTimeout(r, 0)); });

/** Drags the agent's box on Festive Mall's first frame 40 px to the right. */
function dragBox() {
  // Ruling 9: the frame reports a real size; jsdom gives every element zero.
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
    left: 0, top: 0, width: 400, height: 300, right: 400, bottom: 300, x: 0, y: 0, toJSON: () => ({}),
  } as DOMRect);
  fireEvent.mouseDown(screen.getByTitle(/Drag to move/), { clientX: 100, clientY: 100 });
  fireEvent.mouseMove(screen.getByTestId("tag-frame"), { clientX: 140, clientY: 100 });
  fireEvent.mouseUp(screen.getByTestId("tag-frame"));
}

beforeEach(() => {
  useEditorStore.getState().reset();
  useEditorStore.getState().setUser({ id: "u_sc", email: "sc@oth.local", displayName: "Stef Chan" });
  useEditorStore.getState().setModel(reviewModel);
  useToasts.getState().clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ReviewWorkspace", () => {
  it("shows one proposal at a time, the most-evidenced first, and how far the floor has got", () => {
    at();
    expect(nameField().value).toBe("Festive Mall");
    expect(screen.getByText("1 of 3 decided on L1")).toBeTruthy();
    expect(screen.getByText("Fascia reads FESTIVE MALL.")).toBeTruthy();
    expect(screen.getByText(/Proposed by claude-code · 2 frames/)).toBeTruthy();
  });

  it("labels the name where you can see it, not only for a screen reader", () => {
    // Ruling 14.
    at();
    const label = screen.getByText("Name", { selector: "label span" });
    expect(label.closest("label")!.contains(nameField())).toBe(true);
    expect(label.className).not.toContain("sr-only");
  });

  it("shows the evidence large, with the agent's box drawn on it", () => {
    at();
    expect(screen.getByAltText(/Evidence for Festive Mall: frame 1 of 2/).getAttribute("src")).toBe("/api/keyframes/kf_1/file?w=1600");
    expect(screen.getByTestId("label-box-s1")).toBeTruthy();
  });

  it("steps through the proposal's other frames with the arrow keys", () => {
    at();
    key("ArrowRight");
    expect(screen.getByAltText(/frame 2 of 2/).getAttribute("src")).toBe("/api/keyframes/kf_2/file?w=1600");
  });

  it("A accepts with the corrections typed, files it under this floor, and shows the next at once", async () => {
    const api = at();
    fireEvent.change(nameField(), { target: { value: "Festive Mall Tampines" } });
    key("a");
    expect(param("place")).toBe("p_small");
    await waitFor(() => expect(api.acceptPlace).toHaveBeenCalledWith("p_big", 0, {
      nameEn: "Festive Mall Tampines", category: "retail", levelId: "oth-L1",
    }));
  });

  it("offers Undo on the accept, which puts the proposal back as it was", async () => {
    const api = at();
    key("a");
    await waitFor(() => expect(toastSaying("Accepted Festive Mall")).toBeTruthy());
    await act(async () => { await toastSaying("Accepted Festive Mall")!.action!.run(); });
    expect(api.reopenPlace).toHaveBeenCalledWith("p_big", 1, expect.objectContaining({
      nameEn: "Festive Mall", category: "retail", levelId: null,
    }));
  });

  it("takes letters typed into the name as text, not as decisions", () => {
    // Review Focus 2: the R of "Rice Garden" is not Reject.
    const api = at();
    key("r", nameField());
    key("a", nameField());
    expect(api.rejectPlace).not.toHaveBeenCalled();
    expect(api.acceptPlace).not.toHaveBeenCalled();
    expect(param("place")).toBeNull();
  });

  it("accepts with Enter from inside the name, as corrected", async () => {
    const api = at();
    fireEvent.change(nameField(), { target: { value: "Festive Mall East" } });
    key("Enter", nameField());
    await waitFor(() => expect(api.acceptPlace).toHaveBeenCalledWith("p_big", 0, expect.objectContaining({ nameEn: "Festive Mall East" })));
  });

  it("R rejects, and Undo brings the place back with its tags", async () => {
    const api = at();
    key("r");
    await waitFor(() => expect(toastSaying("Rejected Festive Mall")).toBeTruthy());
    expect(api.rejectPlace).toHaveBeenCalledWith("p_big", 0);
    await act(async () => { await toastSaying("Rejected Festive Mall")!.action!.run(); });
    expect(api.restoreEntity).toHaveBeenCalledWith("place", "p_big", 1);
  });

  it("S skips without deciding anything", () => {
    const api = at();
    key("s");
    expect(param("place")).toBe("p_small");
    expect(api.acceptPlace).not.toHaveBeenCalled();
    expect(api.rejectPlace).not.toHaveBeenCalled();
  });

  it("decides two different proposals when A is pressed twice, never the same one twice", async () => {
    // Review Focus 4.
    const api = at();
    key("a");
    key("a");
    await waitFor(() => expect(api.acceptPlace).toHaveBeenCalledTimes(2));
    // noUncheckedIndexedAccess: `at()` returns a Record, so a known key needs the `!`.
    expect(api.acceptPlace!.mock.calls.map(c => (c as unknown[])[0])).toEqual(["p_big", "p_small"]);
  });

  it("decides the last proposal once, however often A is pressed", async () => {
    // Ruling 1. Nothing is left to move on to, so the address does not change
    // when it goes; the proposal must leave the screen all the same.
    const api = at("?scope=floorless");
    expect(nameField().value).toBe("No frames");
    key("a");
    key("a");
    await waitFor(() => expect(toastSaying("Accepted No frames")).toBeTruthy());
    key("a");
    expect(api.acceptPlace).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Every proposal is filed under a floor.")).toBeTruthy();
  });

  it("keeps a decided proposal out of view when the reload after it fails", async () => {
    // Ruling 1. The stale model still lists Festive Mall as waiting, at the
    // version it was accepted at; showing it again would invite a second A.
    const api = at("", { getModel: vi.fn().mockRejectedValue(new TypeError("Failed to fetch")) });
    key("a");
    await waitFor(() => expect(toastSaying("Accepted Festive Mall")).toBeTruthy());
    expect(useToasts.getState().toasts.some(t => t.message.startsWith("Couldn't reload the map after saving"))).toBe(true);
    expect(nameField().value).toBe("Gate 1");
    key("s");
    expect(param("place")).toBe("p_small");
    expect(api.acceptPlace).toHaveBeenCalledTimes(1);
  });

  it("comes back to a proposal whose decision did not go through", async () => {
    const api = at("", { acceptPlace: vi.fn().mockRejectedValue(new ConflictError({ id: "p_big", version: 4 }, null)) });
    key("a");
    await waitFor(() => expect(api.acceptPlace).toHaveBeenCalled());
    await waitFor(() => expect(param("place")).toBe("p_big"));
    expect(useEditorStore.getState().conflict?.entityId).toBe("p_big");
  });

  it("brings back a proposal whose decision failed, with Retry", async () => {
    // Ruling 1: a failed decision leaves the decided set, so it is in view again.
    at("", { rejectPlace: vi.fn().mockRejectedValue(new TypeError("Failed to fetch")) });
    key("r");
    expect(nameField().value).toBe("Gate 1");
    await waitFor(() => expect(nameField().value).toBe("Festive Mall"));
    expect(param("place")).toBe("p_big");
    expect(useToasts.getState().toasts.find(t => t.tone === "error")?.action?.label).toBe("Retry");
  });

  it("keeps what you typed when the accept does not go through", async () => {
    // Fix 2.
    at("", { acceptPlace: vi.fn().mockRejectedValue(new TypeError("Failed to fetch")) });
    fireEvent.change(nameField(), { target: { value: "Festive Mall Tampines" } });
    fireEvent.change(screen.getByLabelText("Category"), { target: { value: "lifestyle" } });
    key("a");
    expect(nameField().value).toBe("Gate 1");
    await settle();
    expect(param("place")).toBe("p_big");
    expect(nameField().value).toBe("Festive Mall Tampines");
    expect((screen.getByLabelText("Category") as HTMLSelectElement).value).toBe("lifestyle");
  });

  it("leaves you typing on the next proposal when a decision fails, and says so with Retry", async () => {
    // Fix 2: the failed one waits in the queue; the toast says what failed.
    const accept = deferred<never>();
    at("", { acceptPlace: vi.fn(() => accept.promise) });
    key("a");
    nameField().focus();
    fireEvent.change(nameField(), { target: { value: "Gate 1A" } });
    await act(async () => { accept.reject(new TypeError("Failed to fetch")); });
    await settle();
    expect(errorToast()?.action?.label).toBe("Retry");
    expect(param("place")).toBe("p_small");
    expect(nameField().value).toBe("Gate 1A");
    expect(document.activeElement).toBe(nameField());
    key("Escape", nameField());
    key("s");
    expect(param("place")).toBe("p_big");
  });

  it("counts a decision under way at once, so the progress line agrees with the proposal on screen", () => {
    // Fix 3: an accept counts as confirmed; a reject leaves both counts.
    at("", { acceptPlace: vi.fn(() => new Promise(() => {})), rejectPlace: vi.fn(() => new Promise(() => {})) });
    key("a");
    expect(screen.getByText("2 of 3 decided on L1")).toBeTruthy();
    key("r");
    expect(screen.getByText("2 of 2 decided on L1")).toBeTruthy();
  });

  it("leaves a proposal on no floor out of the counts while it is being decided", () => {
    // Fix 3.
    at("?scope=floorless", { acceptPlace: vi.fn(() => new Promise(() => {})) });
    expect(screen.getByText("1 proposal on no floor")).toBeTruthy();
    key("a");
    expect(screen.getByText("0 proposals on no floor")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Back to L1" }));
    expect(screen.queryByRole("button", { name: /on no floor/ })).toBeNull();
  });

  it("hands the keys back once a category is picked, and accepts with it", async () => {
    // Fix 4: left focused, the select would take A as type-ahead.
    const api = at();
    const category = screen.getByLabelText("Category") as HTMLSelectElement;
    category.focus();
    fireEvent.change(category, { target: { value: "lifestyle" } });
    expect(document.activeElement).not.toBe(category);
    key("a");
    await waitFor(() => expect(api.acceptPlace).toHaveBeenCalledWith("p_big", 0, expect.objectContaining({ category: "lifestyle" })));
  });

  it("keeps the category focused while you arrow through it; Enter accepts and Esc steps out", async () => {
    // Fix 4, as the name field does it.
    const api = at();
    const category = screen.getByLabelText("Category") as HTMLSelectElement;
    category.focus();
    fireEvent.keyDown(category, { key: "ArrowDown" });
    fireEvent.change(category, { target: { value: "sports" } });
    fireEvent.keyUp(category, { key: "ArrowDown" });
    expect(document.activeElement).toBe(category);
    key("a", category);
    expect(api.acceptPlace).not.toHaveBeenCalled();
    key("Escape", category);
    expect(document.activeElement).not.toBe(category);
    category.focus();
    key("Enter", category);
    await waitFor(() => expect(api.acceptPlace).toHaveBeenCalledWith("p_big", 0, expect.objectContaining({ category: "sports" })));
  });

  it("hands the keys back after a pick with the mouse, even when Esc left the category before its keyup", async () => {
    // Esc blurs the select before its keyup arrives; a key still counted as
    // down would keep the next pick focused, and R would go to it as type-ahead.
    const api = at();
    const category = screen.getByLabelText("Category") as HTMLSelectElement;
    category.focus();
    fireEvent.keyDown(category, { key: "Escape" });
    expect(document.activeElement).not.toBe(category);
    category.focus();
    fireEvent.change(category, { target: { value: "lifestyle" } });
    expect(document.activeElement).not.toBe(category);
    key("r", document.activeElement!);
    await waitFor(() => expect(api.rejectPlace).toHaveBeenCalledWith("p_big", 0));
  });

  it("counts the frames it can show, and says how to decide one with no frame and no note", () => {
    // Fix 5: a tag whose frame was binned is not a frame to look at.
    useEditorStore.getState().setModel(parseModel({
      ...reviewModel,
      keyframes: reviewModel.keyframes.map(k => (k.id === "kf_2" ? { ...k, deletedAt: "2026-09-27T00:00:00.000Z" } : k)),
      places: reviewModel.places.map(p => (p.id === "p_none" ? { ...p, notes: "" } : p)),
    }));
    at();
    expect(screen.getByText(/^Proposed by claude-code · 1 frame$/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /1 on no floor/ }));
    expect(screen.getByText("No frame shows this proposal. Decide from its name and category below.")).toBeTruthy();
    expect(screen.getByText(/^Proposed · 0 frames$/)).toBeTruthy();
  });

  it("shows a proposal again once its Undo has landed", async () => {
    // An Undo leaves the place two versions on from where it was decided, so
    // it is waiting again, not decided.
    const reopened = parseModel({
      ...reviewModel,
      places: reviewModel.places.map(p => (p.id === "p_big" ? { ...p, version: 2 } : p)),
    });
    const getModel = vi.fn().mockResolvedValue(reviewModel);
    at("", { getModel });
    key("a");
    await waitFor(() => expect(toastSaying("Accepted Festive Mall")).toBeTruthy());
    getModel.mockResolvedValue(reopened);
    await act(async () => { await toastSaying("Accepted Festive Mall")!.action!.run(); });
    key("s");
    expect(param("place")).toBe("p_big");
    expect(nameField().value).toBe("Festive Mall");
  });

  it("leaves the address alone when a decision fails after you have left Review", async () => {
    // Survey reads `place` too, as a filter: a late failure must not set it there.
    let fail!: (err: unknown) => void;
    at("", { acceptPlace: vi.fn(() => new Promise((_, reject) => { fail = reject; })) });
    key("a");
    window.history.pushState({}, "", "/floors/L1/survey?frame=kf_1");
    await act(async () => { fail(new TypeError("Failed to fetch")); });
    await waitFor(() => expect(useToasts.getState().toasts.some(t => t.tone === "error")).toBe(true));
    expect(window.location.pathname).toBe("/floors/L1/survey");
    expect(param("place")).toBeNull();
  });

  it("offers Same as… when the name matches a place already on this floor, and merges into it", async () => {
    // Review Focus 3.
    const api = at("?place=p_small");
    fireEvent.click(screen.getByRole("button", { name: "Same as Gate 1" }));
    await waitFor(() => expect(api.mergePlace).toHaveBeenCalledWith("p_small", 0, "p_conf"));
  });

  it("offers Same as… for a name corrected to match, whatever its case", () => {
    at();
    fireEvent.change(nameField(), { target: { value: "  gate 1" } });
    expect(screen.getByRole("button", { name: "Same as Gate 1" })).toBeTruthy();
  });

  it("corrects the agent's box in place", async () => {
    const api = at();
    dragBox();
    await waitFor(() => expect(api.updateEntity).toHaveBeenCalledWith("sighting", "s1", 0, expect.objectContaining({ box: expect.any(Object) })));
  });

  it("saves a corrected box before deciding, and decides only once it has", async () => {
    // Fix 1: sent after the accept, the correction would meet the tag at an
    // old version and blame a teammate.
    const update = deferred<unknown>();
    const api = at("", { updateEntity: vi.fn(() => update.promise) });
    dragBox();
    key("a");
    expect(param("place")).toBe("p_small");
    await settle();
    expect(api.updateEntity).toHaveBeenCalledTimes(1);
    expect(api.acceptPlace).not.toHaveBeenCalled();
    await act(async () => { update.resolve({}); });
    await waitFor(() => expect(api.acceptPlace).toHaveBeenCalledWith("p_big", 0, expect.anything()));
  });

  it("does not decide when the corrected box could not be saved, and comes back to it", async () => {
    // Fix 1: accepting anyway would settle the agent's box, not yours.
    const api = at("", { updateEntity: vi.fn().mockRejectedValue(new TypeError("Failed to fetch")) });
    dragBox();
    key("a");
    await settle();
    expect(api.acceptPlace).not.toHaveBeenCalled();
    expect(param("place")).toBe("p_big");
    expect(nameField().value).toBe("Festive Mall");
    expect(errorToast()?.action?.label).toBe("Retry");
  });

  it("offers the proposals on no floor, and one with no frame can still be decided", async () => {
    // Review Focus 1 and 5.
    const api = at();
    fireEvent.click(screen.getByRole("button", { name: /1 on no floor/ }));
    expect(param("scope")).toBe("floorless");
    expect(nameField().value).toBe("No frames");
    expect(screen.getByText(/No frame shows this proposal/)).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
    key("a");
    await waitFor(() => expect(api.acceptPlace).toHaveBeenCalledWith("p_none", 0, expect.objectContaining({ levelId: "oth-L1" })));
  });

  it("falls back to the first proposal for a link to one already decided", () => {
    at("?place=p_gone");
    expect(nameField().value).toBe("Festive Mall");
  });

  it("says the queue is clear rather than showing nothing", () => {
    useEditorStore.getState().setModel(parseModel({
      ...reviewModel,
      places: reviewModel.places.filter(p => p.status === "confirmed"),
      sightings: [],
    }));
    at();
    expect(screen.getByText("Nothing waiting on L1.")).toBeTruthy();
    expect(screen.getByText("1 place confirmed here.")).toBeTruthy();
  });

  it("stays on screen when the session expires", () => {
    at();
    act(() => useEditorStore.getState().endSession("expired"));
    expect(nameField().value).toBe("Festive Mall");
  });

  it("loads nothing itself: the shell's one load is the only one", () => {
    const api = at();
    expect(api.getModel).not.toHaveBeenCalled();
  });

  it("refuses to accept a proposal whose name has been emptied", () => {
    // A place with no name is no place: A, Enter and the button all wait for one.
    const api = at();
    fireEvent.change(nameField(), { target: { value: "   " } });
    key("a");
    key("Enter", nameField());
    expect(screen.getByRole("button", { name: /^Accept/ })).toHaveProperty("disabled", true);
    expect(api.acceptPlace).not.toHaveBeenCalled();
    expect(param("place")).toBeNull();
    expect(nameField().value).toBe("   ");
  });

  it("says where proposals come from when nothing on the floor has been labelled", () => {
    useEditorStore.getState().setModel(parseModel({ ...reviewModel, places: [], sightings: [] }));
    at();
    expect(screen.getByText("Nothing waiting on L1.")).toBeTruthy();
    expect(screen.getByText("Proposals appear here once this floor's footage has been labelled.")).toBeTruthy();
  });

  it("opens the list on L and closes it on Esc, and the address says so", () => {
    at();
    key("l");
    expect(param("list")).toBe("open");
    expect(screen.getByRole("complementary", { name: "Proposals" })).toBeTruthy();
    key("Escape");
    expect(param("list")).toBeNull();
  });

  it("accepts several ticked in the list, with one Undo for all", async () => {
    const api = at("?list=open");
    fireEvent.click(screen.getByLabelText("Tick Festive Mall"));
    fireEvent.click(screen.getByLabelText("Tick Gate 1"));
    fireEvent.click(screen.getByRole("button", { name: "Accept 2 ticked" }));
    await waitFor(() => expect(toastSaying("Accepted 2 places")).toBeTruthy());
    expect(api.acceptPlace!.mock.calls.map(c => (c as unknown[])[0])).toEqual(["p_big", "p_small"]);
  });

  it("leaves the proposal behind the list alone: A, R and S do nothing until the list is closed", async () => {
    // A tick box takes no letters, so without this an A pressed after a tick
    // would accept the proposal in view, not the ones ticked.
    const api = at("?list=open");
    key("a");
    key("r");
    key("s");
    const tick = screen.getByLabelText("Tick Gate 1");
    fireEvent.click(tick);
    tick.focus();
    key(" ", tick);
    key("a", tick);
    key("r", tick);
    key("s", tick);
    expect(api.acceptPlace).not.toHaveBeenCalled();
    expect(api.rejectPlace).not.toHaveBeenCalled();
    expect(param("place")).toBeNull();
    expect(param("list")).toBe("open");
    expect((tick as HTMLInputElement).checked).toBe(true);
    key("Escape");
    key("a");
    expect(param("place")).toBe("p_small");
    await waitFor(() => expect(api.acceptPlace).toHaveBeenCalledWith("p_big", 0, expect.anything()));
  });

  it("takes letters typed into the filter as text, and Esc steps out of it before closing the list", () => {
    const api = at("?list=open");
    const filter = screen.getByLabelText("Filter proposals");
    filter.focus();
    key("l", filter);
    key("a", filter);
    fireEvent.change(filter, { target: { value: "gate" } });
    expect(param("list")).toBe("open");
    expect(api.acceptPlace).not.toHaveBeenCalled();
    key("Escape", filter);
    expect(document.activeElement).not.toBe(filter);
    expect(param("list")).toBe("open");
    key("Escape");
    expect(param("list")).toBeNull();
  });

  it("leaves out of the list a proposal still being decided", () => {
    // Ruling: listed, it could be ticked and accepted a second time.
    at("", { acceptPlace: vi.fn(() => new Promise(() => {})) });
    key("a");
    key("l");
    expect(screen.getByRole("heading", { name: "Proposals (1)" })).toBeTruthy();
    expect(screen.queryByLabelText("Tick Festive Mall")).toBeNull();
    expect(screen.getByLabelText("Tick Gate 1")).toBeTruthy();
  });

  it("counts the ones accepted from the list at once, and moves on from the one in view", () => {
    // A batch joins the decisions under way, as A does.
    at("?list=open", { acceptPlace: vi.fn(() => new Promise(() => {})) });
    fireEvent.click(screen.getByLabelText("Tick Festive Mall"));
    fireEvent.click(screen.getByRole("button", { name: "Accept 1 ticked" }));
    expect(screen.getByText("2 of 3 decided on L1")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Proposals (1)" })).toBeTruthy();
    expect(param("place")).toBe("p_small");
    expect(nameField().value).toBe("Gate 1");
  });

  it("saves a corrected box before accepting it from the list", async () => {
    const update = deferred<unknown>();
    const api = at("", { updateEntity: vi.fn(() => update.promise) });
    dragBox();
    key("l");
    fireEvent.click(screen.getByLabelText("Tick Festive Mall"));
    fireEvent.click(screen.getByLabelText("Tick Gate 1"));
    fireEvent.click(screen.getByRole("button", { name: "Accept 2 ticked" }));
    await settle();
    expect(api.acceptPlace).not.toHaveBeenCalled();
    await act(async () => { update.resolve({}); });
    await waitFor(() => expect(toastSaying("Accepted 2 places")).toBeTruthy());
  });

  it("accepts the rest from the list when one's corrected box could not be saved, and lists that one again", async () => {
    const api = at("", { updateEntity: vi.fn().mockRejectedValue(new TypeError("Failed to fetch")) });
    dragBox();
    key("l");
    fireEvent.click(screen.getByLabelText("Tick Festive Mall"));
    fireEvent.click(screen.getByLabelText("Tick Gate 1"));
    fireEvent.click(screen.getByRole("button", { name: "Accept 2 ticked" }));
    await waitFor(() => expect(toastSaying("Accepted Gate 1")).toBeTruthy());
    expect(api.acceptPlace!.mock.calls.map(c => (c as unknown[])[0])).toEqual(["p_small"]);
    await waitFor(() => expect(screen.getByLabelText("Tick Festive Mall")).toBeTruthy());
    expect(errorToast()?.action?.label).toBe("Retry");
    expect(toastSaying("Festive Mall wasn't accepted and is back in the list.")).toBeTruthy();
  });

  it("lists again the ones a batch could not accept, and says so with Retry", async () => {
    const api = at("?list=open", {
      acceptPlace: vi.fn()
        .mockResolvedValueOnce({ sightings: 2, confirmed: ["s1", "s2"] })
        .mockRejectedValueOnce(new TypeError("Failed to fetch")),
    });
    fireEvent.click(screen.getByLabelText("Tick Festive Mall"));
    fireEvent.click(screen.getByLabelText("Tick Gate 1"));
    fireEvent.click(screen.getByRole("button", { name: "Accept 2 ticked" }));
    await waitFor(() => expect(screen.getByLabelText("Tick Gate 1")).toBeTruthy());
    expect(api.acceptPlace).toHaveBeenCalledTimes(2);
    expect(toastSaying("Accepted Festive Mall")).toBeTruthy();
    expect(errorToast()?.action?.label).toBe("Retry");
    expect(screen.queryByLabelText("Tick Festive Mall")).toBeNull();
    expect(screen.getByText("2 of 3 decided on L1")).toBeTruthy();
  });

  it("accepts from the list what you typed for it, and the list shows it as you type", async () => {
    // Ruling 25a.
    const api = at("?list=open");
    fireEvent.change(nameField(), { target: { value: "Festive Mall Tampines " } });
    fireEvent.click(screen.getByLabelText("Tick Festive Mall Tampines"));
    fireEvent.click(screen.getByRole("button", { name: "Accept 1 ticked" }));
    await waitFor(() => expect(toastSaying("Accepted Festive Mall Tampines")).toBeTruthy());
    expect(api.acceptPlace).toHaveBeenCalledWith("p_big", 0, {
      nameEn: "Festive Mall Tampines", category: "retail", levelId: "oth-L1",
    });
  });

  it("keeps a proposal whose name you emptied in the list, not offered for accepting", () => {
    at();
    fireEvent.change(nameField(), { target: { value: "  " } });
    key("l");
    expect((screen.getByLabelText("Tick Festive Mall") as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByText("Needs a name before it can be accepted")).toBeTruthy();
  });

  it("counts in the list the frames each proposal's own footer counts", () => {
    // Ruling 25b: a tag whose frame was binned is not a frame to look at.
    useEditorStore.getState().setModel(parseModel({
      ...reviewModel,
      keyframes: reviewModel.keyframes.map(k => (k.id === "kf_2" ? { ...k, deletedAt: "2026-09-27T00:00:00.000Z" } : k)),
    }));
    at("?list=open");
    const drawer = within(screen.getByRole("complementary", { name: "Proposals" }));
    expect(drawer.getByText("1 frame · retail")).toBeTruthy();
    expect(screen.getByText(/^Proposed by claude-code · 1 frame$/)).toBeTruthy();
  });

  it("hides the A, R and S hints while the list holds those keys", () => {
    // Ruling 25c.
    at("?list=open");
    expect(screen.getByRole("button", { name: "Accept" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reject" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Skip" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close the list" }));
    expect(screen.getByRole("button", { name: "Accept A" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reject R" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Skip S" })).toBeTruthy();
  });

  it("jumps to a proposal from the list", () => {
    at("?list=open");
    fireEvent.click(within(screen.getByRole("complementary", { name: "Proposals" })).getByRole("button", { name: /^Gate 1/ }));
    expect(param("place")).toBe("p_small");
    expect(nameField().value).toBe("Gate 1");
  });

  it("takes the focus into the filter when the list opens, and gives it back to List when it closes by Esc, L or ×", () => {
    at();
    const listButton = () => screen.getByRole("button", { name: /^List/ });
    const filter = () => screen.getByLabelText("Filter proposals");
    key("l");
    expect(document.activeElement).toBe(filter());
    key("Escape", filter());
    expect(param("list")).toBeNull();
    expect(document.activeElement).toBe(listButton());

    key("l", listButton());
    expect(document.activeElement).toBe(filter());
    filter().blur();
    key("l");
    expect(param("list")).toBeNull();
    expect(document.activeElement).toBe(listButton());

    fireEvent.click(listButton());
    expect(document.activeElement).toBe(filter());
    fireEvent.click(screen.getByRole("button", { name: "Close the list" }));
    expect(param("list")).toBeNull();
    expect(document.activeElement).toBe(listButton());
  });
});
