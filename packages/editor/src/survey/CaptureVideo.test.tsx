import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CaptureVideo } from "./CaptureVideo";

// jsdom implements neither, and the component is right to use them: every
// browser this ships to has both, and they are what keeps the video local.
beforeEach(() => {
  URL.createObjectURL = vi.fn(() => "blob:local-video");
  URL.revokeObjectURL = vi.fn();
});

const file = () => new File([new Uint8Array([1, 2, 3])], "L1 walk.mp4", { type: "video/mp4" });

function open() {
  fireEvent.change(screen.getByLabelText("Choose the video file"), { target: { files: [file()] } });
}

describe("CaptureVideo", () => {
  it("says plainly that the video is not uploaded", () => {
    render(<CaptureVideo filename="L1 walk.mp4" onGrab={vi.fn()} />);
    expect(screen.getByText(/never uploaded/i)).toBeTruthy();
  });

  it("plays the chosen file locally, from an object URL", () => {
    render(<CaptureVideo filename="L1 walk.mp4" onGrab={vi.fn()} />);
    open();
    expect(screen.getByTestId("capture-video").getAttribute("src")).toMatch(/^blob:|^\w+:/);
  });

  it("hands back the frame and the moment it came from", async () => {
    const onGrab = vi.fn();
    const blob = new Blob(["jpeg"], { type: "image/jpeg" });
    render(
      <CaptureVideo filename="a.mp4" onGrab={onGrab} grab={vi.fn().mockResolvedValue(blob)} />,
    );
    open();
    const video = screen.getByTestId("capture-video") as HTMLVideoElement;
    Object.defineProperty(video, "currentTime", { value: 4.2, configurable: true });
    fireEvent.click(screen.getByRole("button", { name: /grab/i }));
    await waitFor(() => expect(onGrab).toHaveBeenCalledWith(blob, 4200));
  });

  it("shows why a grab failed rather than doing nothing", async () => {
    render(
      <CaptureVideo
        filename="a.mp4"
        onGrab={vi.fn()}
        grab={vi.fn().mockRejectedValue(new Error("could not read the frame"))}
      />,
    );
    open();
    fireEvent.click(screen.getByRole("button", { name: /grab/i }));
    await waitFor(() => expect(screen.getByText(/could not read the frame/)).toBeTruthy());
  });

  it("cannot grab before a file is opened", () => {
    render(<CaptureVideo filename="a.mp4" onGrab={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /grab/i })).toBeNull();
  });
});
