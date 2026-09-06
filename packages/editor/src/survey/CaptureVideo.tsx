import { useEffect, useRef, useState } from "react";
import { MAX_FRAMES, SAMPLE_EVERY_MS, isNewScene, samplePlan } from "./autoFrames";
import { captureFrame, frameThumbnail, seekTo } from "./captureFrame";

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
  const [progress, setProgress] = useState<{ done: number; total: number; kept: number } | null>(null);
  const cancelled = useRef(false);

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

  /**
   * Walks the whole recording and keeps the frames that show something new.
   *
   * This is the job, not grabbing frames by hand: eight floors of walkthrough is
   * hours of scrubbing, and a person doing it will stop long before the footage
   * does. Near-identical frames are dropped, because labelling the same
   * shopfront forty times buries the frames that show something else.
   */
  async function extractAll() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !url) return;

    const plan = samplePlan(video.duration * 1000, SAMPLE_EVERY_MS, MAX_FRAMES);
    if (plan.length === 0) {
      setError("The video's length is not known yet — give it a moment and try again.");
      return;
    }

    cancelled.current = false;
    setError(null);
    let kept = 0;
    let previous: Uint8ClampedArray | null = null;

    for (const [i, timeMs] of plan.entries()) {
      if (cancelled.current) break;
      setProgress({ done: i, total: plan.length, kept });
      try {
        await seekTo(video, timeMs / 1000);
        const thumb = frameThumbnail(video, canvas);
        if (!isNewScene(previous, thumb)) continue;
        previous = thumb;
        onGrab(await grab(video, canvas), timeMs);
        kept++;
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        break;
      }
    }

    setProgress(null);
  }

  return (
    <div className="space-y-2">
      {!url && (
        <label className="block rounded border border-dashed p-4 text-center text-sm">
          <span className="block pb-2 text-stone-600">
            Open <span className="font-medium">{filename}</span> from this computer,
            then let it find the frames for you.
            <span className="mt-1 block text-xs text-stone-500">
              The video is never uploaded — only the frames worth keeping are.
            </span>
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
          {progress ? (
            <div className="flex items-center gap-2 text-sm">
              <span className="flex-1">
                Looking through the video — {progress.done} of {progress.total} checked,{" "}
                {progress.kept} kept.
              </span>
              <button
                className="rounded border px-3 py-1"
                onClick={() => { cancelled.current = true; }}
              >
                Stop
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <button
                className="flex-1 rounded bg-stone-800 px-3 py-1.5 text-sm text-white"
                onClick={() => void extractAll()}
              >
                Find frames automatically
              </button>
              <button
                className="rounded border px-3 py-1.5 text-sm"
                onClick={() => void takeFrame()}
              >
                Grab this one
              </button>
            </div>
          )}
        </>
      )}

      <canvas ref={canvasRef} className="hidden" />
      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  );
}
