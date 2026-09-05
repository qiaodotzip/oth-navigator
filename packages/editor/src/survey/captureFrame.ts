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
