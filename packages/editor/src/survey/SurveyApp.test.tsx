import { parseModel } from "@oth/model";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Api } from "../api/client";
import { useEditorStore } from "../state/store";
import { SurveyApp } from "./SurveyApp";

const model = parseModel({
  building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
  levels: [{ id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6 }],
  captures: [{ id: "cap_1", kind: "video", filename: "L1 walk.mp4" }],
  pathwayKinds: [{ id: "pk-1", nameEn: "Covered link", colorHex: "#38bdf8" }],
  keyframes: [
    { id: "kf_2", captureId: "cap_1", timeMs: 2000, imageId: "kf_2", widthPx: 640, heightPx: 480 },
    { id: "kf_1", captureId: "cap_1", timeMs: 1000, imageId: "kf_1", widthPx: 640, heightPx: 480 },
  ],
  places: [{ id: "pl_1", nameEn: "NTUC FairPrice", category: "retail" }],
  sightings: [{ id: "sg_1", placeId: "pl_1", keyframeId: "kf_1", box: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 } }],
});

function fakeApi(overrides: Record<string, unknown> = {}) {
  return {
    getModel: vi.fn().mockResolvedValue(model),
    validate: vi.fn().mockResolvedValue({ issues: [], errorCount: 0, warningCount: 0, ok: true }),
    listLevelImages: vi.fn().mockResolvedValue([]),
    keyframeFileUrl: (id: string) => `/api/keyframes/${id}/file`,
    deleteKeyframe: vi.fn().mockResolvedValue(undefined),
    deleteCapture: vi.fn().mockResolvedValue({ frames: 2 }),
    setKeyframeWalkway: vi.fn().mockResolvedValue({ updated: 1 }),
    updateEntity: vi.fn().mockResolvedValue({}),
    uploadKeyframe: vi.fn().mockResolvedValue({}),
    createEntity: vi.fn().mockResolvedValue({}),
    ...overrides,
  } as unknown as Api;
}

beforeEach(() => {
  useEditorStore.getState().reset();
  URL.createObjectURL = vi.fn(() => "blob:local-video");
  URL.revokeObjectURL = vi.fn();
});

describe("SurveyApp", () => {
  it("lists the captures", async () => {
    render(<SurveyApp api={fakeApi()} />);
    await waitFor(() => expect(screen.getByTestId("capture-cap_1")).toBeTruthy());
  });

  it("says the model never loaded, rather than that there is nothing", async () => {
    // A server that is not running used to read as an empty survey, which sent
    // someone hunting for data that was never lost.
    const api = fakeApi({ getModel: vi.fn().mockRejectedValue(new TypeError("Failed to fetch")) });
    render(<SurveyApp api={api} />);
    await waitFor(() => expect(screen.getByTestId("captures-unloaded")).toBeTruthy());
    expect(screen.getByTestId("captures-unloaded").textContent).toMatch(/npm run dev/);
  });

  it("says there is genuinely nothing once the model has loaded empty", async () => {
    const api = fakeApi({
      getModel: vi.fn().mockResolvedValue(parseModel({
        building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
      })),
    });
    render(<SurveyApp api={api} />);
    await waitFor(() => expect(screen.getByText(/add the walkthrough you filmed/i)).toBeTruthy());
    expect(screen.queryByTestId("captures-unloaded")).toBeNull();
  });

  it("renames a capture in place", async () => {
    const api = fakeApi();
    render(<SurveyApp api={api} />);
    await waitFor(() => screen.getByTestId("capture-cap_1"));
    fireEvent.click(screen.getByLabelText("Rename L1 walk.mp4"));
    const input = screen.getByLabelText("Rename L1 walk.mp4");
    fireEvent.change(input, { target: { value: "Level 1 east" } });
    fireEvent.blur(input);
    await waitFor(() =>
      expect((api as unknown as { updateEntity: ReturnType<typeof vi.fn> }).updateEntity)
        .toHaveBeenCalledWith("capture", "cap_1", 0, { filename: "Level 1 east" }));
  });

  it("does not save a rename that changed nothing", async () => {
    const api = fakeApi();
    render(<SurveyApp api={api} />);
    await waitFor(() => screen.getByTestId("capture-cap_1"));
    fireEvent.click(screen.getByLabelText("Rename L1 walk.mp4"));
    fireEvent.blur(screen.getByLabelText("Rename L1 walk.mp4"));
    expect((api as unknown as { updateEntity: ReturnType<typeof vi.fn> }).updateEntity)
      .not.toHaveBeenCalled();
  });

  it("asks before deleting a capture, since it is hours of labelling", async () => {
    const api = fakeApi();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<SurveyApp api={api} />);
    await waitFor(() => screen.getByTestId("capture-cap_1"));
    fireEvent.click(screen.getByLabelText("Delete L1 walk.mp4"));
    expect(confirm).toHaveBeenCalled();
    expect((api as unknown as { deleteCapture: ReturnType<typeof vi.fn> }).deleteCapture)
      .not.toHaveBeenCalled();
    confirm.mockRestore();
  });

  it("deletes the capture once confirmed", async () => {
    const api = fakeApi();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<SurveyApp api={api} />);
    await waitFor(() => screen.getByTestId("capture-cap_1"));
    fireEvent.click(screen.getByLabelText("Delete L1 walk.mp4"));
    await waitFor(() =>
      expect((api as unknown as { deleteCapture: ReturnType<typeof vi.fn> }).deleteCapture)
        .toHaveBeenCalledWith("cap_1"));
    confirm.mockRestore();
  });

  it("asks you to pick one before showing a video", async () => {
    render(<SurveyApp api={fakeApi()} />);
    await waitFor(() => expect(screen.getByText(/pick a capture/i)).toBeTruthy());
  });

  it("shows the filmstrip in timeline order, not insertion order", async () => {
    render(<SurveyApp api={fakeApi()} />);
    await waitFor(() => screen.getByTestId("capture-cap_1"));
    fireEvent.click(screen.getByTestId("capture-cap_1"));
    const strip = await screen.findByTestId("filmstrip");
    const ids = [...strip.querySelectorAll("[data-testid^='filmstrip-']")]
      .map(el => el.getAttribute("data-testid"));
    expect(ids).toEqual(["filmstrip-kf_1", "filmstrip-kf_2"]);
  });

  it("marks which frames have been labelled, so coverage is visible at a glance", async () => {
    // With hundreds of frames, "which of these have I done" is otherwise
    // unanswerable and a stretch gets labelled twice while another is missed.
    render(<SurveyApp api={fakeApi()} />);
    await waitFor(() => screen.getByTestId("capture-cap_1"));
    fireEvent.click(screen.getByTestId("capture-cap_1"));
    await screen.findByTestId("filmstrip");
    expect(screen.getByTestId("labelled-kf_1").textContent).toBe("1");
    expect(screen.queryByTestId("labelled-kf_2")).toBeNull();
  });

  it("draws what was identified on the frame itself", async () => {
    render(<SurveyApp api={fakeApi()} />);
    await waitFor(() => screen.getByTestId("capture-cap_1"));
    fireEvent.click(screen.getByTestId("capture-cap_1"));
    fireEvent.click(await screen.findByTestId("filmstrip-kf_1"));
    expect(screen.getByTestId("label-box-sg_1")).toBeTruthy();
  });

  it("says which walkway a frame was taken in", async () => {
    const api = fakeApi();
    render(<SurveyApp api={api} />);
    await waitFor(() => screen.getByTestId("capture-cap_1"));
    fireEvent.click(screen.getByTestId("capture-cap_1"));
    fireEvent.click(await screen.findByTestId("filmstrip-kf_1"));
    fireEvent.change(screen.getByLabelText("Walkway type for this frame"), {
      target: { value: "pk-1" },
    });
    await waitFor(() =>
      expect((api as unknown as { setKeyframeWalkway: ReturnType<typeof vi.fn> })
        .setKeyframeWalkway).toHaveBeenCalledWith("kf_1", "pk-1", false));
  });

  it("carries the walkway onward, since a walk stays in one for many frames", async () => {
    const withKind = parseModel({
      ...JSON.parse(JSON.stringify(model)),
      keyframes: [
        { id: "kf_1", captureId: "cap_1", timeMs: 1000, imageId: "kf_1", widthPx: 64, heightPx: 48, pathwayKindId: "pk-1" },
      ],
    });
    const api = fakeApi({ getModel: vi.fn().mockResolvedValue(withKind) });
    render(<SurveyApp api={api} />);
    await waitFor(() => screen.getByTestId("capture-cap_1"));
    fireEvent.click(screen.getByTestId("capture-cap_1"));
    fireEvent.click(await screen.findByTestId("filmstrip-kf_1"));
    fireEvent.click(screen.getByRole("button", { name: /apply onward/i }));
    await waitFor(() =>
      expect((api as unknown as { setKeyframeWalkway: ReturnType<typeof vi.fn> })
        .setKeyframeWalkway).toHaveBeenCalledWith("kf_1", "pk-1", true));
  });

  it("shows the route as a colour band along the filmstrip", async () => {
    const withKind = parseModel({
      ...JSON.parse(JSON.stringify(model)),
      keyframes: [
        { id: "kf_1", captureId: "cap_1", timeMs: 1000, imageId: "kf_1", widthPx: 64, heightPx: 48, pathwayKindId: "pk-1" },
        { id: "kf_2", captureId: "cap_1", timeMs: 2000, imageId: "kf_2", widthPx: 64, heightPx: 48 },
      ],
    });
    render(<SurveyApp api={fakeApi({ getModel: vi.fn().mockResolvedValue(withKind) })} />);
    await waitFor(() => screen.getByTestId("capture-cap_1"));
    fireEvent.click(screen.getByTestId("capture-cap_1"));
    await screen.findByTestId("filmstrip");
    expect((screen.getByTestId("walkway-kf_1") as HTMLElement).style.background)
      .toContain("rgb(56, 189, 248)");
    // A frame with no type shows no band rather than a wrong one.
    expect((screen.getByTestId("walkway-kf_2") as HTMLElement).style.background)
      .toBe("transparent");
  });

  it("lists places with how often each was seen", async () => {
    render(<SurveyApp api={fakeApi()} />);
    await waitFor(() => expect(screen.getByTestId("place-pl_1").textContent).toContain("×1"));
  });

  it("says how many places still have no room", async () => {
    render(<SurveyApp api={fakeApi()} />);
    await waitFor(() => expect(screen.getByText(/1 not yet bound/)).toBeTruthy());
  });

  it("bins a frame that is not worth keeping", async () => {
    const api = fakeApi();
    render(<SurveyApp api={api} />);
    await waitFor(() => screen.getByTestId("capture-cap_1"));
    fireEvent.click(screen.getByTestId("capture-cap_1"));
    await screen.findByTestId("filmstrip");
    fireEvent.click(screen.getByLabelText("Remove frame kf_1"));
    await waitFor(() =>
      expect((api as unknown as { deleteKeyframe: ReturnType<typeof vi.fn> }).deleteKeyframe)
        .toHaveBeenCalledWith("kf_1"));
  });

  it("offers a plain delete for the frame in view, not only a hover target", async () => {
    const api = fakeApi();
    render(<SurveyApp api={api} />);
    await waitFor(() => screen.getByTestId("capture-cap_1"));
    fireEvent.click(screen.getByTestId("capture-cap_1"));
    fireEvent.click(await screen.findByTestId("filmstrip-kf_1"));
    fireEvent.click(screen.getByRole("button", { name: /delete this frame/i }));
    await waitFor(() =>
      expect((api as unknown as { deleteKeyframe: ReturnType<typeof vi.fn> }).deleteKeyframe)
        .toHaveBeenCalledWith("kf_1"));
  });

  it("says which frame of how many is in view", async () => {
    render(<SurveyApp api={fakeApi()} />);
    await waitFor(() => screen.getByTestId("capture-cap_1"));
    fireEvent.click(screen.getByTestId("capture-cap_1"));
    fireEvent.click(await screen.findByTestId("filmstrip-kf_1"));
    expect(screen.getByText(/Frame 1 of 2/)).toBeTruthy();
  });

  it("says the video will find its own frames, before a file is picked", async () => {
    render(<SurveyApp api={fakeApi()} />);
    await waitFor(() => screen.getByTestId("capture-cap_1"));
    fireEvent.click(screen.getByTestId("capture-cap_1"));
    expect(screen.getByText(/find the frames for you/i)).toBeTruthy();
  });

  it("offers a way back to the map editor", async () => {
    render(<SurveyApp api={fakeApi()} />);
    expect(screen.getByRole("button", { name: /map editor/i })).toBeTruthy();
  });

  it("reports a failed grab rather than losing it silently", async () => {
    // jsdom has no canvas, so the real captureFrame rejects here — which is
    // exactly the path a browser that cannot read the video would take, and
    // the point is that it says so instead of appearing to work.
    render(<SurveyApp api={fakeApi()} />);
    await waitFor(() => screen.getByTestId("capture-cap_1"));
    fireEvent.click(screen.getByTestId("capture-cap_1"));
    fireEvent.change(screen.getByLabelText("Choose the video file"), {
      target: { files: [new File([new Uint8Array([1])], "L1 walk.mp4", { type: "video/mp4" })] },
    });
    fireEvent.click(screen.getByRole("button", { name: /grab/i }));
    await waitFor(() => expect(screen.getByText(/cannot read video frames/i)).toBeTruthy());
  });
});
