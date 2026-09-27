import { KeyframeSchema } from "@oth/model";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Filmstrip } from "./Filmstrip";
import type { FrameStatus } from "./frameStatus";

const frames = Array.from({ length: 400 }, (_, i) => KeyframeSchema.parse({
  id: `kf_${i}`, captureId: "cap_1", timeMs: i * 2000, imageId: `kf_${i}`, widthPx: 3840, heightPx: 2160,
}));
const statuses = new Map<string, FrameStatus>([["kf_0", "tagged"], ["kf_1", "proposed"]]);
const thumbUrl = (id: string) => `/api/keyframes/${id}/file?w=240`;

function strip(currentId: string, onPick = vi.fn()) {
  render(<Filmstrip frames={frames} statuses={statuses} currentId={currentId} thumbUrl={thumbUrl} onPick={onPick} />);
  return onPick;
}

describe("Filmstrip", () => {
  it("renders only the frames around the one in view, not all 400", () => {
    strip("kf_300");
    const shown = screen.getAllByRole("button");
    expect(shown.length).toBeLessThan(40);
    expect(screen.getByTestId("filmstrip-kf_300")).toBeTruthy();
    expect(screen.queryByTestId("filmstrip-kf_0")).toBeNull();
  });

  it("asks for the small copy of each frame, lazily", () => {
    strip("kf_0");
    const img = screen.getByTestId("filmstrip-kf_0").querySelector("img")!;
    expect(img.getAttribute("src")).toBe("/api/keyframes/kf_0/file?w=240");
    expect(img.getAttribute("loading")).toBe("lazy");
  });

  it("says each frame's status in words as well as colour", () => {
    strip("kf_0");
    expect(screen.getByTestId("filmstrip-kf_0").getAttribute("aria-label")).toBe("Frame 1, tagged");
    expect(screen.getByTestId("filmstrip-kf_1").getAttribute("aria-label")).toBe("Frame 2, has proposals");
    expect(screen.getByTestId("filmstrip-kf_2").getAttribute("aria-label")).toBe("Frame 3, no tags yet");
  });

  it("marks the frame in view", () => {
    strip("kf_1");
    expect(screen.getByTestId("filmstrip-kf_1").getAttribute("aria-current")).toBe("true");
    expect(screen.getByTestId("filmstrip-kf_2").getAttribute("aria-current")).toBeNull();
  });

  it("opens a frame when it is clicked", () => {
    const onPick = strip("kf_0");
    fireEvent.click(screen.getByTestId("filmstrip-kf_3"));
    expect(onPick).toHaveBeenCalledWith("kf_3");
  });

  it("follows a scroll to frames further along", () => {
    strip("kf_0");
    const el = screen.getByTestId("filmstrip");
    Object.defineProperty(el, "scrollLeft", { value: 136 * 200, configurable: true, writable: true });
    fireEvent.scroll(el);
    expect(screen.getByTestId("filmstrip-kf_200")).toBeTruthy();
  });
});
