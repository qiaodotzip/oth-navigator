import { parseModel, type Level } from "@oth/model";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, type Api } from "../api/client";
import type { Saver } from "../state/save";
import { useEditorStore } from "../state/store";
import { useToasts } from "../ui/toast";
import { AddFootageDialog } from "./AddFootageDialog";
import type { FrameSource } from "./findFrames";

const model = parseModel({
  building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
  levels: [{ id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "Level 1", nameZh: "一楼", elevationM: 0, heightM: 6 }],
  captures: [{ id: "cap_1", kind: "video", filename: "L1 walk.mp4", levelId: "oth-L1" }],
  keyframes: [
    { id: "kf_1", captureId: "cap_1", timeMs: 0, imageId: "kf_1", widthPx: 64, heightPx: 36 },
    { id: "kf_2", captureId: "cap_1", timeMs: 2000, imageId: "kf_2", widthPx: 64, heightPx: 36 },
  ],
});
const L1 = model.levels[0] as Level;

/** Every moment looks different, so every one is kept. */
function reader(): () => FrameSource {
  let n = 0;
  return () => ({
    seek: async () => {},
    thumbnail: () => new Uint8ClampedArray(16).fill((n++ * 97) % 256),
    grab: async () => new Blob(["jpeg"]),
  });
}

function setup({ captureId = null, upload = vi.fn().mockResolvedValue({}) }: {
  captureId?: string | null;
  upload?: ReturnType<typeof vi.fn>;
} = {}) {
  const api = { uploadKeyframe: upload } as unknown as Api;
  const saver = {
    create: vi.fn(async () => true),
    update: vi.fn(async () => true),
    refresh: vi.fn(async () => {}),
  };
  const onOpenChange = vi.fn();
  const onCapture = vi.fn();
  const { unmount } = render(
    <AddFootageDialog
      api={api} saver={saver as unknown as Saver} level={L1} captureId={captureId}
      open onOpenChange={onOpenChange} onCapture={onCapture} reader={reader()}
    />,
  );
  return { upload, saver, onOpenChange, onCapture, unmount };
}

/** An upload that hangs until the test releases it, so a run can be paused mid-loop. */
function pausableUpload() {
  let release: (() => void) | null = null;
  const upload = vi.fn().mockImplementation(
    () => new Promise(resolve => { release = () => resolve({}); }),
  );
  return { upload, release: () => release?.() };
}

/** Opens a six-second video and lets its length load. */
function openVideo() {
  fireEvent.change(screen.getByLabelText("Choose the video file"), {
    target: { files: [new File([new Uint8Array([1])], "L1 east.mp4", { type: "video/mp4" })] },
  });
  const video = screen.getByTestId("footage-video");
  Object.defineProperty(video, "duration", { value: 6, configurable: true });
  fireEvent.loadedMetadata(video);
}

beforeEach(() => {
  useEditorStore.getState().reset();
  useEditorStore.getState().setModel(model);
  useToasts.getState().clear();
  URL.createObjectURL = vi.fn(() => "blob:local-video");
  URL.revokeObjectURL = vi.fn();
});

describe("AddFootageDialog", () => {
  it("says the footage is filed under this floor and the video is never uploaded", () => {
    setup();
    expect(screen.getByText(/filed under L1/i).textContent).toMatch(/never uploaded/i);
  });

  it("names the footage after its file unless told otherwise", () => {
    setup();
    openVideo();
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("L1 east.mp4");
  });

  it("files new footage under this floor, then keeps and uploads each new frame", async () => {
    const { saver, upload, onCapture, onOpenChange } = setup();
    openVideo();
    fireEvent.click(screen.getByRole("button", { name: /find frames automatically/i }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(saver.create).toHaveBeenCalledWith("capture", expect.objectContaining({
      kind: "video", filename: "L1 east.mp4", levelId: "oth-L1", durationMs: 6000,
    }));
    const id = (saver.create.mock.calls[0] as unknown as [string, { id: string }])[1].id;
    expect(onCapture).toHaveBeenCalledWith(id);
    expect(upload).toHaveBeenCalledTimes(3);
    expect(upload.mock.calls.map(c => (c as unknown[])[1])).toEqual([id, id, id]);
    expect(useToasts.getState().toasts[0]!.message).toBe("Kept 3 frames from L1 east.mp4.");
  });

  it("finds more frames in footage that has some, skipping the moments it already has", async () => {
    const { saver, upload } = setup({ captureId: "cap_1" });
    openVideo();
    fireEvent.click(screen.getByRole("button", { name: /find frames automatically/i }));
    await waitFor(() => expect(upload).toHaveBeenCalledTimes(1));
    expect((upload.mock.calls[0] as unknown[]).slice(1, 3)).toEqual(["cap_1", 4000]);
    expect(saver.create).not.toHaveBeenCalled();
  });

  it("renames existing footage when its name is changed", async () => {
    const { saver } = setup({ captureId: "cap_1" });
    openVideo();
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "L1 walk, east end" } });
    fireEvent.click(screen.getByRole("button", { name: /find frames automatically/i }));
    await waitFor(() => expect(saver.update).toHaveBeenCalledWith("capture", "cap_1", 0, { filename: "L1 walk, east end" }));
  });

  it("says where it stopped when a frame will not upload, and stays open to run again", async () => {
    const upload = vi.fn()
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const { onOpenChange } = setup({ upload });
    openVideo();
    fireEvent.click(screen.getByRole("button", { name: /find frames automatically/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/stopped at 0m02s.*run it again/i);
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("shows the server's own words, without suggesting a retry it would only refuse again", async () => {
    const upload = vi.fn().mockRejectedValue(new ApiError(422, { error: "that file is too large" }));
    setup({ upload });
    openVideo();
    fireEvent.click(screen.getByRole("button", { name: /find frames automatically/i }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/that file is too large/i);
    expect(alert).not.toHaveTextContent(/run it again/i);
  });

  it("leaves an expired session to the sign-in dialog", async () => {
    const upload = vi.fn().mockRejectedValue(new ApiError(401, null));
    setup({ upload });
    openVideo();
    fireEvent.click(screen.getByRole("button", { name: /find frames automatically/i }));
    await waitFor(() => expect(upload).toHaveBeenCalled());
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("says so when the video's length is not known yet", () => {
    setup();
    fireEvent.change(screen.getByLabelText("Choose the video file"), {
      target: { files: [new File([new Uint8Array([1])], "a.mp4", { type: "video/mp4" })] },
    });
    fireEvent.click(screen.getByRole("button", { name: /find frames automatically/i }));
    expect(screen.getByRole("alert")).toHaveTextContent(/length isn't known yet/i);
  });

  it("offers nothing to run before a video is chosen", () => {
    setup();
    expect((screen.getByRole("button", { name: /find frames automatically/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("says what to do by hand once every stretch already has a frame", async () => {
    setup({ captureId: "cap_1" });
    fireEvent.change(screen.getByLabelText("Choose the video file"), {
      target: { files: [new File([new Uint8Array([1])], "L1 walk.mp4", { type: "video/mp4" })] },
    });
    const video = screen.getByTestId("footage-video");
    // Every sample this short video would offer (0ms, 2000ms) already has a frame.
    Object.defineProperty(video, "duration", { value: 2.5, configurable: true });
    fireEvent.loadedMetadata(video);
    fireEvent.click(screen.getByRole("button", { name: /find frames automatically/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/every stretch of this video already has a frame.*grab this frame/i);
  });

  it("grabs the current moment by hand and says so", async () => {
    const { upload } = setup();
    openVideo();
    const video = screen.getByTestId("footage-video") as HTMLVideoElement;
    Object.defineProperty(video, "currentTime", { value: 4.2, configurable: true });
    fireEvent.click(screen.getByRole("button", { name: /grab this frame/i }));
    await waitFor(() => expect(upload).toHaveBeenCalledTimes(1));
    expect(upload.mock.calls[0]![2]).toBe(4200);
    await waitFor(() => expect(useToasts.getState().toasts[0]!.message).toBe("Added the frame at 0m04s."));
  });

  it("says so when a hand-grabbed frame will not upload", async () => {
    const upload = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    setup({ upload });
    openVideo();
    fireEvent.click(screen.getByRole("button", { name: /grab this frame/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't add that frame/i);
  });

  it("leaves a hand-grabbed frame's expired session to the sign-in dialog", async () => {
    const upload = vi.fn().mockRejectedValue(new ApiError(401, null));
    setup({ upload });
    openVideo();
    fireEvent.click(screen.getByRole("button", { name: /grab this frame/i }));
    await waitFor(() => expect(upload).toHaveBeenCalled());
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("stops uploading once Cancel is pressed, and reports what it kept so far", async () => {
    const { upload, release } = pausableUpload();
    setup({ upload });
    openVideo();
    fireEvent.click(screen.getByRole("button", { name: /find frames automatically/i }));
    // The first frame (0ms) is always kept; its upload is the one left hanging.
    await waitFor(() => expect(upload).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    release();
    await waitFor(() => expect(useToasts.getState().toasts[0]?.message)
      .toBe("Stopped. Kept 1 frames — run it again to carry on."));
    expect(upload).toHaveBeenCalledTimes(1);
  });

  it("stops finding frames once the dialog unmounts, uploading nothing more", async () => {
    const { upload, release } = pausableUpload();
    const { unmount } = setup({ upload });
    openVideo();
    fireEvent.click(screen.getByRole("button", { name: /find frames automatically/i }));
    await waitFor(() => expect(upload).toHaveBeenCalledTimes(1));
    unmount();
    release();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(upload).toHaveBeenCalledTimes(1);
  });

  it("makes one capture, not two, when the button is clicked twice before it can disable itself", async () => {
    const { saver, upload, onOpenChange } = setup();
    openVideo();
    const button = screen.getByRole("button", { name: /find frames automatically/i });
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(saver.create).toHaveBeenCalledTimes(1);
    expect(upload).toHaveBeenCalledTimes(3);
  });

  it("grabs one frame, not two, when Grab this frame is clicked twice quickly", async () => {
    const { upload } = setup();
    openVideo();
    const button = screen.getByRole("button", { name: /grab this frame/i });
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(upload).toHaveBeenCalledTimes(1));
    // Give a wrongly-unguarded second call a chance to have landed too.
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(upload).toHaveBeenCalledTimes(1);
  });
});
