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
  keyframes: [
    { id: "kf_2", captureId: "cap_1", timeMs: 2000, imageId: "kf_2", widthPx: 640, heightPx: 480 },
    { id: "kf_1", captureId: "cap_1", timeMs: 1000, imageId: "kf_1", widthPx: 640, heightPx: 480 },
  ],
  places: [{ id: "pl_1", nameEn: "NTUC FairPrice", category: "retail" }],
  sightings: [{ id: "sg_1", placeId: "pl_1", keyframeId: "kf_1" }],
});

function fakeApi(overrides: Record<string, unknown> = {}) {
  return {
    getModel: vi.fn().mockResolvedValue(model),
    validate: vi.fn().mockResolvedValue({ issues: [], errorCount: 0, warningCount: 0, ok: true }),
    listLevelImages: vi.fn().mockResolvedValue([]),
    keyframeFileUrl: (id: string) => `/api/keyframes/${id}/file`,
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

  it("lists places with how often each was seen", async () => {
    render(<SurveyApp api={fakeApi()} />);
    await waitFor(() => expect(screen.getByTestId("place-pl_1").textContent).toContain("×1"));
  });

  it("says how many places still have no room", async () => {
    render(<SurveyApp api={fakeApi()} />);
    await waitFor(() => expect(screen.getByText(/1 not yet bound/)).toBeTruthy());
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
