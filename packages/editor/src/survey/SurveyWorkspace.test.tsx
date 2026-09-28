import { parseModel, type Level } from "@oth/model";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, type Api } from "../api/client";
import { useCurrentRoute } from "../route";
import { createSaver } from "../state/save";
import { useEditorStore } from "../state/store";
import { fakeApi } from "../testing/fakeApi";
import { useToasts } from "../ui/toast";
import { SurveyWorkspace } from "./SurveyWorkspace";

const frame = (id: string, captureId: string, timeMs: number) =>
  ({ id, captureId, timeMs, imageId: id, widthPx: 640, heightPx: 360 });

const model = parseModel({
  building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
  levels: [{ id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "Level 1", nameZh: "一楼", elevationM: 0, heightM: 6 }],
  captures: [
    { id: "cap_1", kind: "video", filename: "L1 walk.mp4", levelId: "oth-L1" },
    // The real walkthrough: filed under no floor.
    { id: "cap_u", kind: "video", filename: "level 1" },
  ],
  pathwayKinds: [{ id: "pk-1", nameEn: "Covered link", colorHex: "#38bdf8" }],
  keyframes: [frame("kf_1", "cap_1", 1000), frame("kf_2", "cap_1", 2000), frame("kf_3", "cap_1", 3000), frame("kf_u", "cap_u", 0)],
  places: [
    { id: "p_kopi", nameEn: "Kopitiam", category: "retail", levelId: "oth-L1" },
    { id: "p_prop", nameEn: "Festive Mall", category: "retail", status: "proposed", levelId: "oth-L1" },
  ],
  sightings: [
    { id: "s1", placeId: "p_kopi", keyframeId: "kf_1", box: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 } },
    { id: "s2", placeId: "p_prop", keyframeId: "kf_2", status: "proposed" },
  ],
});
const L1 = model.levels[0] as Level;

/** The workspace as the floor hosts it: its parameters come from the address. */
function Hosted({ api }: { api: Api }) {
  const route = useCurrentRoute();
  const saver = createSaver(api, { validate: false });
  return <SurveyWorkspace api={api} saver={saver} level={L1} params={route.name === "floor" ? route.params : {}} />;
}

function at(search = "", api = fakeApi({ getModel: vi.fn().mockResolvedValue(model) })) {
  window.history.pushState({}, "", `/floors/L1/survey${search}`);
  render(<Hosted api={api} />);
  return api as unknown as Record<string, ReturnType<typeof vi.fn>>;
}

const param = (name: string) => new URLSearchParams(window.location.search).get(name);
const key = (k: string, target: Element = document.body) => fireEvent.keyDown(target, { key: k });

beforeEach(() => {
  useEditorStore.getState().reset();
  useEditorStore.getState().setUser({ id: "u_sc", email: "sc@oth.local", displayName: "Stef Chan" });
  useEditorStore.getState().setModel(model);
  useToasts.getState().clear();
  URL.createObjectURL = vi.fn(() => "blob:local-video");
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("SurveyWorkspace", () => {
  it("opens on the first frame with no tag, and says where it is in the footage", () => {
    at();
    expect(screen.getByText(/Frame 3 of 3/)).toBeTruthy();
    expect(screen.getByText(/0m03s/)).toBeTruthy();
  });

  it("counts the frames under each filter", () => {
    at();
    const chips = within(screen.getByRole("group", { name: "Show frames" }));
    expect(chips.getByRole("button", { name: /Untagged/ }).textContent).toContain("1");
    expect(chips.getByRole("button", { name: /Proposed/ }).textContent).toContain("1");
    expect(chips.getByRole("button", { name: /^Tagged/ }).textContent).toContain("1");
  });

  it("shows the frame at the size tagging needs, and the strip at the small one", () => {
    at();
    expect(screen.getByAltText("Frame 3 of 3").getAttribute("src")).toBe("/api/keyframes/kf_3/file?w=1600");
    expect(screen.getByTestId("filmstrip-kf_1").querySelector("img")!.getAttribute("src")).toBe("/api/keyframes/kf_1/file?w=240");
  });

  it("moves between frames with the arrow keys, and the address follows", () => {
    at();
    key("ArrowLeft");
    expect(param("frame")).toBe("kf_2");
    expect(screen.getByText(/Frame 2 of 3/)).toBeTruthy();
  });

  it("goes to the next frame with no tag on N", () => {
    at("?frame=kf_1");
    key("n");
    expect(param("frame")).toBe("kf_3");
  });

  it("takes letters typed into the name as text, not as commands", () => {
    // Review Focus 2: the N of "NTUC" is not "next untagged".
    at("?frame=kf_1");
    key("n", screen.getByLabelText("Place name"));
    key("g", screen.getByLabelText("Place name"));
    expect(param("frame")).toBe("kf_1");
    expect(param("view")).toBeNull();
  });

  it("tags a new name as a place on this floor, then ties it to the frame", async () => {
    const api = at();
    const name = screen.getByLabelText("Place name");
    fireEvent.change(name, { target: { value: "Kiosk" } });
    key("Enter", name);
    await waitFor(() => expect(api.createEntity).toHaveBeenCalledTimes(2));
    // noUncheckedIndexedAccess: `at()`'s helper type carries the Record's index
    // signature, so a known key needs telling apart from one absent.
    const [placeCall, sightingCall] = api.createEntity!.mock.calls as [string, Record<string, unknown>][];
    expect(placeCall![0]).toBe("place");
    expect(placeCall![1]).toMatchObject({ nameEn: "Kiosk", levelId: "oth-L1" });
    expect(sightingCall![0]).toBe("sighting");
    expect(sightingCall![1]).toMatchObject({ placeId: placeCall![1].id, keyframeId: "kf_3" });
  });

  it("links a name that exists, whatever its case, rather than making it again", async () => {
    // Review Focus 3.
    const api = at();
    fireEvent.change(screen.getByLabelText("Place name"), { target: { value: "  kopitiam " } });
    fireEvent.click(screen.getByRole("button", { name: /Tag as Kopitiam/ }));
    await waitFor(() => expect(api.createEntity).toHaveBeenCalledTimes(1));
    expect(api.createEntity).toHaveBeenCalledWith("sighting", expect.objectContaining({ placeId: "p_kopi", keyframeId: "kf_3" }));
  });

  it("keeps a name sent while the last tag still saves, and says to send it again", async () => {
    // Ruling 20 (I1): "NTUC", Enter, "Ko", Enter used to lose Ko without a word.
    let land!: () => void;
    const createEntity = vi.fn()
      .mockImplementationOnce(() => new Promise(resolve => { land = () => resolve({}); }))
      .mockResolvedValue({});
    at("", fakeApi({ getModel: vi.fn().mockResolvedValue(model), createEntity }));
    const name = screen.getByLabelText("Place name") as HTMLInputElement;
    fireEvent.change(name, { target: { value: "NTUC" } });
    key("Enter", name);
    fireEvent.change(name, { target: { value: "Ko" } });
    key("Enter", name);
    expect(name.value).toBe("Ko");
    expect(useToasts.getState().toasts.some(t =>
      t.tone === "info" && t.message === "Still saving the last change — press Enter again in a moment.")).toBe(true);

    await act(async () => { land(); });
    key("Enter", name);
    await waitFor(() =>
      expect(createEntity).toHaveBeenCalledWith("place", expect.objectContaining({ nameEn: "Ko" })));
    expect(name.value).toBe("");
  });

  it("sends a tag whose sighting failed again on Retry, making one place and one sighting", async () => {
    // Ruling 20 (I2): the place landed, the sighting did not. Retrying only
    // the sighting's write orphaned the place; retrying the whole tag must
    // find it by name rather than make it twice.
    const saved = { places: [...model.places] as unknown[], sightings: [...model.sightings] as unknown[] };
    let refuse = true;
    const createEntity = vi.fn(async (type: string, data: Record<string, unknown>) => {
      if (type === "sighting" && refuse) {
        refuse = false;
        throw new TypeError("Failed to fetch");
      }
      (type === "place" ? saved.places : saved.sightings).push(data);
      return data;
    });
    const getModel = vi.fn(async () => parseModel({ ...model, ...saved }));
    at("", fakeApi({ getModel, createEntity }));
    const name = screen.getByLabelText("Place name");
    fireEvent.change(name, { target: { value: "Kiosk" } });
    key("Enter", name);
    await waitFor(() => expect(useToasts.getState().toasts.some(t => t.tone === "error")).toBe(true));
    const failed = useToasts.getState().toasts.find(t => t.tone === "error")!;
    expect(failed).toMatchObject({
      message: "Couldn't save the tag Kiosk. Check your connection, then retry.",
      action: { label: "Retry" },
    });

    await act(async () => { await failed.action!.run(); });
    const kiosks = (saved.places as { id: string; nameEn: string }[]).filter(p => p.nameEn === "Kiosk");
    expect(kiosks).toHaveLength(1);
    const tags = (saved.sightings as { placeId: string; keyframeId: string }[])
      .filter(s => s.placeId === kiosks[0]!.id && s.keyframeId === "kf_3");
    expect(tags).toHaveLength(1);
    expect(useToasts.getState().toasts.filter(t => t.tone === "error")).toHaveLength(1);
  });

  it("keeps the drawn box when a tag fails, and lets it go once Retry saves it", async () => {
    // Ruling 9: the frame reports a real size; jsdom gives every element zero.
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
      left: 0, top: 0, width: 400, height: 300, right: 400, bottom: 300, x: 0, y: 0, toJSON: () => ({}),
    } as DOMRect);
    const createEntity = vi.fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValue({});
    at("?frame=kf_1", fakeApi({ getModel: vi.fn().mockResolvedValue(model), createEntity }));
    const drawOn = screen.getByTestId("tag-frame");
    fireEvent.mouseDown(drawOn, { clientX: 100, clientY: 60 });
    fireEvent.mouseMove(drawOn, { clientX: 300, clientY: 240 });
    fireEvent.mouseUp(drawOn);
    const name = screen.getByLabelText("Place name");
    fireEvent.change(name, { target: { value: "Kopitiam" } });
    key("Enter", name);
    await waitFor(() => expect(useToasts.getState().toasts.some(t => t.tone === "error")).toBe(true));
    expect(screen.getByTestId("tag-box")).toBeTruthy();

    const failed = useToasts.getState().toasts.find(t => t.tone === "error")!;
    await act(async () => { await failed.action!.run(); });
    expect(createEntity).toHaveBeenLastCalledWith("sighting", expect.objectContaining({
      placeId: "p_kopi", keyframeId: "kf_1", box: expect.objectContaining({ x: 0.25, w: 0.5 }),
    }));
    expect(screen.queryByTestId("tag-box")).toBeNull();
  });

  it("puts the cursor in the name on T", () => {
    at();
    key("t");
    expect(document.activeElement).toBe(screen.getByLabelText("Place name"));
  });

  it("bins the frame with Del, moves on, and Undo brings it back", async () => {
    const api = at();
    key("Delete");
    expect(param("frame")).toBe("kf_2");
    await waitFor(() => expect(useToasts.getState().toasts.some(t => t.message === "Binned frame 3")).toBe(true));
    expect(api.deleteKeyframe).toHaveBeenCalledWith("kf_3");
    const shown = useToasts.getState().toasts.find(t => t.message === "Binned frame 3")!;
    await act(async () => { await shown.action!.run(); });
    expect(api.restoreKeyframe).toHaveBeenCalledWith("kf_3");
  });

  it("does not bin the next frame too when Del is pressed again before the first has gone", async () => {
    // Review Focus 4.
    const api = at();
    key("Delete");
    key("Delete");
    await waitFor(() => expect(api.deleteKeyframe).toHaveBeenCalled());
    expect(api.deleteKeyframe).toHaveBeenCalledTimes(1);
  });

  it("bins the frame in view from the Bin frame button, with the same Undo as Del", async () => {
    // Ruling 24: teammates use the mouse, and a bin on a key alone is hard to find.
    const api = at();
    fireEvent.click(screen.getByRole("button", { name: /Bin frame/ }));
    expect(param("frame")).toBe("kf_2");
    await waitFor(() => expect(useToasts.getState().toasts.some(t =>
      t.message === "Binned frame 3" && t.action?.label === "Undo")).toBe(true));
    expect(api.deleteKeyframe).toHaveBeenCalledWith("kf_3");
  });

  it("holds Bin frame while a bin is under way, so a double click bins one frame", async () => {
    let land!: () => void;
    const deleteKeyframe = vi.fn(() => new Promise<void>(resolve => { land = resolve; }));
    at("", fakeApi({ getModel: vi.fn().mockResolvedValue(model), deleteKeyframe }));
    const button = screen.getByRole("button", { name: /Bin frame/ }) as HTMLButtonElement;
    fireEvent.click(button);
    fireEvent.click(button);
    expect(button.disabled).toBe(true);
    expect(deleteKeyframe).toHaveBeenCalledTimes(1);
    expect(param("frame")).toBe("kf_2");

    await act(async () => { land(); });
    await waitFor(() => expect(button.disabled).toBe(false));
    expect(deleteKeyframe).toHaveBeenCalledTimes(1);
  });

  it("comes back to a frame whose bin failed, and a bin sent again by Retry still offers Undo", async () => {
    // Ruling 20 (I2): the saver's Retry resent only the delete, so the Undo never came.
    const deleteKeyframe = vi.fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValue(undefined);
    at("", fakeApi({ getModel: vi.fn().mockResolvedValue(model), deleteKeyframe }));
    key("Delete");
    await waitFor(() => expect(useToasts.getState().toasts.some(t => t.tone === "error")).toBe(true));
    const failed = useToasts.getState().toasts.find(t => t.tone === "error")!;
    expect(failed).toMatchObject({
      message: "Couldn't bin frame 3. Check your connection, then retry.",
      action: { label: "Retry" },
    });
    expect(param("frame")).toBe("kf_3");

    await act(async () => { await failed.action!.run(); });
    expect(deleteKeyframe).toHaveBeenCalledTimes(2);
    expect(deleteKeyframe).toHaveBeenLastCalledWith("kf_3");
    expect(param("frame")).toBe("kf_2");
    expect(useToasts.getState().toasts.some(t => t.message === "Binned frame 3" && t.action?.label === "Undo")).toBe(true);
  });

  it("stays where you went when a bin fails after you have moved on", async () => {
    let refuse!: () => void;
    const deleteKeyframe = vi.fn(() => new Promise((_, reject) => { refuse = () => reject(new TypeError("Failed to fetch")); }));
    at("", fakeApi({ getModel: vi.fn().mockResolvedValue(model), deleteKeyframe }));
    key("Delete");
    expect(param("frame")).toBe("kf_2");
    key("ArrowLeft");
    expect(param("frame")).toBe("kf_1");
    await act(async () => { refuse(); });
    await waitFor(() => expect(useToasts.getState().toasts.some(t => t.tone === "error")).toBe(true));
    expect(param("frame")).toBe("kf_1");
  });

  it("says nothing of its own when a bin meets an ended session", async () => {
    // The sign-in dialog over the page is the message.
    const deleteKeyframe = vi.fn().mockRejectedValue(new ApiError(401, null));
    const api = at("", fakeApi({ getModel: vi.fn().mockResolvedValue(model), deleteKeyframe }));
    key("Delete");
    await waitFor(() => expect(api.listLevelImages).toHaveBeenCalled());
    expect(useToasts.getState().toasts).toHaveLength(0);
    expect(param("frame")).toBe("kf_3");
  });

  it("bins again on Del once a bin has failed", async () => {
    // The drop guard is for a bin under way, not one that has already failed.
    const deleteKeyframe = vi.fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValue(undefined);
    const api = at("", fakeApi({ getModel: vi.fn().mockResolvedValue(model), deleteKeyframe }));
    key("Delete");
    await waitFor(() => expect(useToasts.getState().toasts.some(t => t.tone === "error")).toBe(true));
    // The reload after it, whatever the outcome, is the last of that bin.
    await waitFor(() => expect(api.listLevelImages).toHaveBeenCalled());
    key("Delete");
    await waitFor(() => expect(deleteKeyframe).toHaveBeenCalledTimes(2));
  });

  it("removes a tag from the side panel, with Undo", async () => {
    const api = at("?frame=kf_1");
    // One name for the × on the frame and the one in the panel.
    expect(screen.getAllByRole("button", { name: "Remove tag Kopitiam from this frame" })).toHaveLength(2);
    const panel = within(screen.getByRole("complementary", { name: "This frame and the floor's places" }));
    fireEvent.click(panel.getByRole("button", { name: "Remove tag Kopitiam from this frame" }));
    await waitFor(() =>
      expect(useToasts.getState().toasts.some(t => t.message === "Deleted the tag Kopitiam" && t.action)).toBe(true));
    expect(api.deleteEntity).toHaveBeenCalledWith("sighting", "s1", 0);
  });

  it("offers to file footage that is on no floor under this one", async () => {
    // Review Focus 1: the real walkthrough has no level.
    const api = at();
    expect(screen.getByRole("status").textContent).toMatch(/level 1.*1 frame.*isn't filed under a floor/);
    fireEvent.click(screen.getByRole("button", { name: "File under L1" }));
    await waitFor(() => expect(api.updateEntity).toHaveBeenCalledWith("capture", "cap_u", 0, { levelId: "oth-L1" }));
  });

  it("holds File under L1 while it saves, so a double click can't send it twice", async () => {
    // A second update at the old version would be a 409 blamed on a teammate.
    let land!: () => void;
    const updateEntity = vi.fn(() => new Promise(resolve => { land = () => resolve({}); }));
    at("", fakeApi({ getModel: vi.fn().mockResolvedValue(model), updateEntity }));
    const file = screen.getByRole("button", { name: "File under L1" }) as HTMLButtonElement;
    fireEvent.click(file);
    expect(file.disabled).toBe(true);
    fireEvent.click(file);
    expect(updateEntity).toHaveBeenCalledTimes(1);
    await act(async () => { land(); });
    expect((screen.getByRole("button", { name: "File under L1" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("shows the contact sheet on G, and a frame chosen there opens in Frame view", () => {
    at();
    key("g");
    expect(param("view")).toBe("grid");
    fireEvent.click(screen.getByTestId("grid-kf_1"));
    expect(param("view")).toBeNull();
    expect(param("frame")).toBe("kf_1");
  });

  it("shows only the frames a place was seen in when it is chosen", () => {
    at();
    const panel = within(screen.getByRole("complementary", { name: "This frame and the floor's places" }));
    fireEvent.click(panel.getByRole("button", { name: /^Kopitiam/ }));
    expect(param("place")).toBe("p_kopi");
    expect(screen.getByRole("button", { name: /Seen: Kopitiam/ })).toBeTruthy();
    expect(screen.getByText(/Frame 1 of 3/)).toBeTruthy();
  });

  it("starts other footage picked from the list afresh, leaving the last one's frame and place behind", () => {
    useEditorStore.getState().setModel(parseModel({
      ...model,
      captures: [...model.captures, { id: "cap_2", kind: "video", filename: "L1 west.mp4", levelId: "oth-L1" }],
      keyframes: [...model.keyframes, frame("kf_w", "cap_2", 500)],
    }));
    at("?frame=kf_1&place=p_kopi");
    fireEvent.change(screen.getByLabelText("Footage"), { target: { value: "cap_2" } });
    expect(param("capture")).toBe("cap_2");
    expect(param("frame")).toBeNull();
    expect(param("place")).toBeNull();
    expect(screen.getByText(/Frame 1 of 1/)).toBeTruthy();
  });

  it("falls back to this floor's footage and all frames for an address it cannot use", () => {
    at("?capture=nope&filter=bogus&view=list");
    expect(screen.getByText(/Frame 3 of 3/)).toBeTruthy();
    expect(within(screen.getByRole("group", { name: "Show frames" })).getByRole("button", { name: "All" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("says there is no footage yet and offers to add some", () => {
    useEditorStore.getState().setModel(parseModel({ ...model, captures: [], keyframes: [], sightings: [] }));
    at();
    expect(screen.getByText(/No footage on L1 yet/)).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "+ Add footage" })[0]!);
    expect(screen.getByRole("dialog", { name: "Add footage" })).toBeTruthy();
  });

  it("stays on screen when the session expires", () => {
    at();
    act(() => useEditorStore.getState().endSession("expired"));
    expect(screen.getByText(/Frame 3 of 3/)).toBeTruthy();
  });

  it("loads nothing itself: the shell's one load is the only one", () => {
    const api = at();
    expect(api.getModel).not.toHaveBeenCalled();
  });
});
