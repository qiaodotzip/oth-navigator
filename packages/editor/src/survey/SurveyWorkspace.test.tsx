import { parseModel, type Level } from "@oth/model";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Api } from "../api/client";
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

  it("removes a tag from the side panel, with Undo", async () => {
    const api = at("?frame=kf_1");
    fireEvent.click(screen.getByRole("button", { name: "Remove Kopitiam from this frame" }));
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
