import { KeyframeSchema } from "@oth/model";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { FrameStatus } from "./frameStatus";
import { GridView } from "./GridView";

const frames = Array.from({ length: 400 }, (_, i) => KeyframeSchema.parse({
  id: `kf_${i}`, captureId: "cap_1", timeMs: i * 2000, imageId: `kf_${i}`, widthPx: 3840, heightPx: 2160,
}));
const statuses = new Map<string, FrameStatus>([["kf_0", "tagged"]]);
const thumbUrl = (id: string) => `/api/keyframes/${id}/file?w=240`;

function grid(currentId: string | null, onOpen = vi.fn()) {
  render(<GridView frames={frames} statuses={statuses} currentId={currentId} thumbUrl={thumbUrl} onOpen={onOpen} />);
  return onOpen;
}

describe("GridView", () => {
  it("renders only the rows in view, not all 400 frames", () => {
    grid("kf_0");
    const cells = screen.getAllByRole("button");
    expect(cells.length).toBeGreaterThan(0);
    expect(cells.length).toBeLessThan(100);
  });

  it("opens on the frame you were on", () => {
    grid("kf_350");
    expect(screen.getByTestId("grid-kf_350").getAttribute("aria-current")).toBe("true");
  });

  it("opens a frame in Frame view when it is clicked", () => {
    const onOpen = grid("kf_0");
    fireEvent.click(screen.getByTestId("grid-kf_3"));
    expect(onOpen).toHaveBeenCalledWith("kf_3");
  });

  it("says each frame's status in words", () => {
    grid("kf_0");
    expect(screen.getByTestId("grid-kf_0").getAttribute("aria-label")).toBe("Open frame 1, tagged");
  });

  it("follows a scroll further down the sheet", () => {
    grid("kf_0");
    const el = screen.getByTestId("grid");
    // Five columns at the laptop width assumed before measuring: frame 200 is on row 40.
    Object.defineProperty(el, "scrollTop", { value: 40 * 150, configurable: true, writable: true });
    fireEvent.scroll(el);
    expect(screen.getByTestId("grid-kf_200")).toBeTruthy();
  });

  it("uses the small copy of each frame, lazily", () => {
    grid("kf_0");
    const img = screen.getByTestId("grid-kf_0").querySelector("img")!;
    expect(img.getAttribute("src")).toBe("/api/keyframes/kf_0/file?w=240");
    expect(img.getAttribute("loading")).toBe("lazy");
  });
});
