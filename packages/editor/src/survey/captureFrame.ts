/**
 * Pull the current video frame out as a JPEG.
 *
 * The one untestable function in the tool — jsdom has no canvas — so it is
 * isolated here with nothing else in it, and everything either side is a pure
 * function that is tested.
 *
 * The video itself never leaves the machine: it is an object URL over a local
 * file, and only the bytes this returns are ever uploaded.
 */
export function captureFrame(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
): Promise<Blob> {
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.reject(new Error("this browser cannot read video frames"));
  ctx.drawImage(video, 0, 0);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => (blob ? resolve(blob) : reject(new Error("could not read the frame"))),
      "image/jpeg",
      0.85,
    );
  });
}

/** Seek and wait for the frame to actually be there to draw. */
export function seekTo(video: HTMLVideoElement, seconds: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const done = () => { cleanup(); resolve(); };
    const failed = () => { cleanup(); reject(new Error("could not seek the video")); };
    function cleanup() {
      video.removeEventListener("seeked", done);
      video.removeEventListener("error", failed);
    }
    video.addEventListener("seeked", done, { once: true });
    video.addEventListener("error", failed, { once: true });
    video.currentTime = seconds;
  });
}

/**
 * A tiny greyscale-ish copy of the current frame, for telling frames apart.
 *
 * Deliberately small: comparing full frames would cost more than decoding them,
 * and the question is only whether the view has changed, not by how much.
 */
export function frameThumbnail(
  video: HTMLVideoElement, canvas: HTMLCanvasElement, size = 32,
): Uint8ClampedArray {
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("this browser cannot read video frames");
  ctx.drawImage(video, 0, 0, size, size);
  return ctx.getImageData(0, 0, size, size).data;
}
