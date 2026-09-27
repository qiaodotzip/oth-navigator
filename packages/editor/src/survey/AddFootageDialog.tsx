import { live, type Level } from "@oth/model";
import { useEffect, useRef, useState } from "react";
import { ApiError, isUnauthorized, type Api } from "../api/client";
import type { Saver } from "../state/save";
import { useEditorStore } from "../state/store";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { serverWords, worthRetrying } from "../ui/failure";
import { Progress } from "../ui/Progress";
import { toast } from "../ui/toast";
import { freshSamples, samplePlan } from "./autoFrames";
import { captureFrame, frameThumbnail, seekTo } from "./captureFrame";
import { FindFramesError, findFrames, type FindProgress, type FrameSource } from "./findFrames";
import { frameFilename } from "./frames";
import { frameTime } from "./surveyView";
import { newId } from "./tagging";

/** How a browser reads frames: seek the video, draw it on a canvas. */
export function readVideo(video: HTMLVideoElement, canvas: HTMLCanvasElement): FrameSource {
  return {
    seek: timeMs => seekTo(video, timeMs / 1000),
    thumbnail: () => frameThumbnail(video, canvas),
    grab: () => captureFrame(video, canvas),
  };
}

/** Frames are shown in batches: reloading the model after each of 400 uploads would be the slow part. */
const REFRESH_EVERY = 10;

type Target = { id: string; filename: string };

/**
 * What a failed upload said, and whether trying again could actually help.
 *
 * A refusal (a 4xx) gives the server's own reason and will be refused again,
 * so the next step it suggests must not be "run it again" — that would just
 * fail the same way. A dropped connection might well go through next time.
 */
function explain(reason: unknown): { said: string; retryable: boolean } {
  const said = serverWords(reason)
    ?? (reason instanceof ApiError ? `the server refused it (HTTP ${reason.status})`
      : reason instanceof Error && /read|seek|video/i.test(reason.message) ? reason.message
      : "it didn't upload — check your connection");
  return { said: `${said}.`, retryable: worthRetrying(reason) };
}

/**
 * Add footage (spec §9): a video from this computer, never uploaded — it is
 * opened as an object URL and only the frames worth keeping are sent. New
 * footage is filed under this floor as it is made (spec §5.3). Opened on
 * existing footage, it looks through the video again for moments that have
 * no frame yet, and renames it if the name was changed.
 */
export function AddFootageDialog({ api, saver, level, captureId, open, onOpenChange, onCapture, reader = readVideo }: {
  api: Pick<Api, "uploadKeyframe">;
  saver: Pick<Saver, "create" | "update" | "refresh">;
  level: Level;
  /** Existing footage to find more frames in, or null for new footage. */
  captureId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Told the new footage's id once it exists, so the workspace can show it behind the dialog. */
  onCapture: (captureId: string) => void;
  /** Seam for tests: jsdom can neither seek a video nor draw one. */
  reader?: (video: HTMLVideoElement, canvas: HTMLCanvasElement) => FrameSource;
}) {
  const capture = useEditorStore(s =>
    captureId ? live(s.model?.captures ?? []).find(c => c.id === captureId) ?? null : null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cancelled = useRef(false);
  const [url, setUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [name, setName] = useState(capture?.filename ?? "");
  const [durationMs, setDurationMs] = useState<number | null>(null);
  const [made, setMade] = useState<Target | null>(null);
  const [progress, setProgress] = useState<FindProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const running = progress !== null;

  // The video is a whole file held in memory; let it go when the dialog does.
  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url);
  }, [url]);

  function choose(file: File) {
    setUrl(URL.createObjectURL(file));
    setFileName(file.name);
    setDurationMs(null);
    setError(null);
    if (!capture && name.trim() === "") setName(file.name);
  }

  /** The footage frames go into: this one, renamed if asked, or new footage filed under this floor. */
  async function target(): Promise<Target | null> {
    if (capture) {
      const filename = name.trim();
      if (filename !== "" && filename !== capture.filename) {
        if (!(await saver.update("capture", capture.id, capture.version, { filename }))) return null;
      }
      return { id: capture.id, filename: filename || capture.filename };
    }
    if (made) return made;
    const filename = name.trim() || fileName || "footage";
    const id = newId("cap");
    const ok = await saver.create("capture", {
      id, kind: "video", filename, levelId: level.id,
      ...(durationMs ? { durationMs: Math.round(durationMs) } : {}),
    });
    if (!ok) return null;
    const next = { id, filename };
    setMade(next);
    onCapture(id);
    return next;
  }

  async function run() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    if (!durationMs) {
      setError("The video's length isn't known yet. Give it a moment, then try again.");
      return;
    }
    setError(null);
    const into = await target();
    if (!into) return;

    const existing = live(useEditorStore.getState().model?.keyframes ?? [])
      .filter(k => k.captureId === into.id)
      .flatMap(k => (k.timeMs === undefined ? [] : [k.timeMs]));
    const moments = freshSamples(samplePlan(durationMs), existing);
    if (moments.length === 0) {
      setError("Every stretch of this video already has a frame. To add one by hand, pause the video where you want it and choose Grab this frame.");
      return;
    }

    cancelled.current = false;
    setProgress({ checked: 0, total: moments.length, kept: 0 });
    let uploaded = 0;
    try {
      const result = await findFrames({
        moments,
        source: reader(video, canvas),
        cancelled: () => cancelled.current,
        onProgress: setProgress,
        keep: async (blob, timeMs) => {
          await api.uploadKeyframe(blob, into.id, timeMs, frameFilename(into, timeMs));
          uploaded++;
          // Frames appear as they upload, a batch at a time.
          if (uploaded % REFRESH_EVERY === 0) await saver.refresh().catch(() => {});
        },
      });
      await saver.refresh().catch(() => {});
      toast({
        tone: "success",
        message: result.stopped
          ? `Stopped. Kept ${result.kept} frames — run it again to carry on.`
          : `Kept ${result.kept} frames from ${into.filename}.`,
      });
      onOpenChange(false);
    } catch (err) {
      await saver.refresh().catch(() => {});
      setProgress(null);
      const reason = err instanceof FindFramesError ? err.reason : err;
      // The sign-in dialog over the page is the message.
      if (isUnauthorized(reason)) return;
      const at = err instanceof FindFramesError ? ` at ${frameTime(err.atMs)}` : "";
      const { said, retryable } = explain(reason);
      const next = retryable
        ? "run it again and it carries on from there"
        : "check the footage, then try again";
      setError(`Stopped${at}: ${said} Frames kept so far stay — ${next}.`);
    }
  }

  async function grabOne() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    setError(null);
    const into = await target();
    if (!into) return;
    const timeMs = video.currentTime * 1000;
    try {
      const blob = await reader(video, canvas).grab();
      await api.uploadKeyframe(blob, into.id, timeMs, frameFilename(into, timeMs));
      await saver.refresh().catch(() => {});
      toast({ tone: "success", message: `Added the frame at ${frameTime(timeMs)}.` });
    } catch (err) {
      if (isUnauthorized(err)) return;
      setError(`Couldn't add that frame: ${explain(err).said}`);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        if (!running) onOpenChange(next);
      }}
      title={capture ? `Find more frames in ${capture.filename}` : "Add footage"}
      description={`Filed under ${level.code}. The video is never uploaded — only the frames worth keeping are.`}
      dismissible={!running}
    >
      <div className="space-y-3">
        <label className="block">
          <span className="text-xs font-medium text-stone-600">Video file</span>
          <input
            type="file"
            accept="video/*"
            aria-label="Choose the video file"
            disabled={running}
            className="mt-1 block w-full text-sm"
            onChange={event => {
              const file = event.target.files?.[0];
              if (file) choose(file);
            }}
          />
        </label>
        {capture && !url && (
          <p className="text-xs text-stone-500">Open {capture.filename} from this computer to look through it again.</p>
        )}
        <label className="block">
          <span className="text-xs font-medium text-stone-600">Name</span>
          <input
            aria-label="Name"
            value={name}
            disabled={running}
            placeholder="Defaults to the file's name"
            onChange={event => setName(event.target.value)}
            className="mt-1 h-9 w-full rounded border border-stone-300 px-2 text-sm"
          />
        </label>
        {url && (
          <video
            ref={videoRef}
            src={url}
            controls
            preload="metadata"
            data-testid="footage-video"
            className="max-h-56 w-full rounded bg-black"
            onLoadedMetadata={event => {
              const seconds = event.currentTarget.duration;
              setDurationMs(Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : null);
            }}
          />
        )}
        <canvas ref={canvasRef} className="hidden" />
        {progress && (
          <div role="status" className="space-y-1.5">
            <Progress value={progress.checked} max={progress.total} label="Looking through the video" />
            <p className="text-sm">
              Looking through the video — {progress.checked} of {progress.total} checked, {progress.kept} kept.
            </p>
          </div>
        )}
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          {running ? (
            <Button onClick={() => { cancelled.current = true; }}>Cancel</Button>
          ) : (
            <>
              <Button disabled={!url} onClick={() => void grabOne()}>Grab this frame</Button>
              <Button variant="primary" disabled={!url} onClick={() => void run()}>Find frames automatically</Button>
            </>
          )}
        </div>
      </div>
    </Dialog>
  );
}
