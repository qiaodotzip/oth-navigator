import { parseModel, type Level } from "@oth/model";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useEditorStore } from "../state/store";
import { sampleModel } from "../testing/fakeApi";
import { FootageStep } from "./FootageStep";

const [L1, L2] = sampleModel.levels as [Level, Level];

/** Review Focus I1: a walkthrough that crossed floors has no levelId (Survey's own `unfiled`). */
const modelWithUnfiled = parseModel({
  building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
  levels: sampleModel.levels,
  captures: [
    { id: "cap_1", kind: "video", filename: "L1 walk.mp4", levelId: "oth-L1" },
    { id: "cap_u", kind: "video", filename: "level 1" },
  ],
  keyframes: [
    { id: "kf_1", captureId: "cap_1", timeMs: 1000, imageId: "kf_1", widthPx: 640, heightPx: 480 },
    { id: "kf_2", captureId: "cap_1", timeMs: 2000, imageId: "kf_2", widthPx: 640, heightPx: 480 },
    { id: "kf_u", captureId: "cap_u", timeMs: 0, imageId: "kf_u", widthPx: 640, heightPx: 480 },
  ],
});

function open(level: Level = L1) {
  const api = { uploadKeyframe: vi.fn() };
  const saver = { create: vi.fn(async () => true), update: vi.fn(async () => true), refresh: vi.fn(async () => {}) };
  render(<FootageStep api={api} saver={saver} level={level} />);
  return { api, saver };
}

beforeEach(() => {
  useEditorStore.getState().reset();
  useEditorStore.getState().setModel(sampleModel);
});

describe("FootageStep", () => {
  it("lists the footage filed under the floor, each with its frames and a way into Survey", () => {
    open();
    const walk = within(screen.getByTestId("footage-cap_1"));
    expect(walk.getByText("L1 walk.mp4")).toBeTruthy();
    expect(walk.getByText("Video · 2 frames")).toBeTruthy();
    expect(walk.getByRole("link", { name: "Open in Survey: L1 walk.mp4" }).getAttribute("href"))
      .toBe("/floors/L1/survey?capture=cap_1");
  });

  it("says when a floor has none", () => {
    open(L2);
    expect(screen.getByText("No footage on L2 yet.")).toBeTruthy();
  });

  it("opens Survey's own Add footage dialog", async () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: "+ Add footage" }));
    expect(await screen.findByRole("dialog", { name: "Add footage" })).toBeTruthy();
  });

  it("looks through footage again for frames it missed", async () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: "Find more frames in L1 walk.mp4" }));
    expect(await screen.findByRole("dialog", { name: "Find more frames in L1 walk.mp4" })).toBeTruthy();
  });

  it("offers a floorless capture for filing, so it is never simply missing", () => {
    useEditorStore.getState().setModel(modelWithUnfiled);
    open();
    expect(screen.getByRole("status").textContent).toMatch(/level 1.*1 frame.*isn't filed under a floor/);
    expect(screen.getByRole("button", { name: "File under L1" })).toBeTruthy();
  });

  it("files a floorless capture under this floor on File under", async () => {
    useEditorStore.getState().setModel(modelWithUnfiled);
    const { saver } = open();
    const file = screen.getByRole("button", { name: "File under L1" }) as HTMLButtonElement;
    fireEvent.click(file);
    expect(saver.update).toHaveBeenCalledWith("capture", "cap_u", 0, { levelId: "oth-L1" });
    // Lets the pending setFiling(false) settle, so React has nothing left to
    // flush once the test has already finished.
    await waitFor(() => expect(file.disabled).toBe(false));
  });

  it("leaves the empty state alone with no footage anywhere, filed or not", () => {
    useEditorStore.getState().setModel(parseModel({ ...modelWithUnfiled, captures: [], keyframes: [] }));
    open();
    expect(screen.getByText("No footage on L1 yet.")).toBeTruthy();
    expect(screen.queryByText("Not filed under a floor yet")).toBeNull();
    expect(screen.queryByRole("button", { name: /File under/ })).toBeNull();
  });
});
