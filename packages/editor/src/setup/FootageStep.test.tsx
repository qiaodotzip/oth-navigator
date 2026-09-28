import type { Level } from "@oth/model";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useEditorStore } from "../state/store";
import { sampleModel } from "../testing/fakeApi";
import { FootageStep } from "./FootageStep";

const [L1, L2] = sampleModel.levels as [Level, Level];

function open(level: Level = L1) {
  const api = { uploadKeyframe: vi.fn() };
  const saver = { create: vi.fn(async () => true), update: vi.fn(async () => true), refresh: vi.fn(async () => {}) };
  render(<FootageStep api={api} saver={saver} level={level} />);
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
});
