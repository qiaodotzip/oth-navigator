import { useEffect, useRef, useState } from "react";
import { captureFrame } from "./captureFrame";

/**
 * Plays a local video and grabs frames from it.
 *
 * The file is never uploaded. It is opened as an object URL, played entirely in
 * the browser, and only the JPEG of a chosen moment is sent — which is what
 * makes surveying eight floors possible on a hobby-tier server.
 */
export function CaptureVideo({
  filename,
  onGrab,
  grab = captureFrame,
}: {
  filename: string;
  onGrab: (blob: Blob, timeMs: number) => void;
  /** Seam for tests: jsdom has no canvas. */
  grab?: (video: HTMLVideoElement, canvas: HTMLCanvasElement) => Promise<Blob>;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Revoke on unmount, or the file stays pinned in memory for the session.
  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url);
  }, [url]);

  async function takeFrame() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !url) return;
    try {
      onGrab(await grab(video, canvas), video.currentTime * 1000);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="space-y-2">
      {!url && (
        <label className="block rounded border border-dashed p-4 text-center text-sm">
          <span className="block pb-2 text-stone-600">
            Open <span className="font-medium">{filename}</span> from this computer.
            It is never uploaded — only the frames you keep.
          </span>
          <input
            type="file"
            accept="video/*"
            aria-label="Choose the video file"
            onChange={e => {
              const file = e.target.files?.[0];
              if (file) setUrl(URL.createObjectURL(file));
            }}
          />
        </label>
      )}

      {url && (
        <>
          <video
            ref={videoRef}
            src={url}
            controls
            data-testid="capture-video"
            className="max-h-[50vh] w-full bg-black"
            onKeyDown={e => {
              if (e.key === " ") {
                e.preventDefault();
                void takeFrame();
              }
            }}
          />
          <button
            className="w-full rounded bg-stone-800 px-3 py-1.5 text-sm text-white"
            onClick={() => void takeFrame()}
          >
            Grab this frame
          </button>
        </>
      )}

      <canvas ref={canvasRef} className="hidden" />
      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  );
}
