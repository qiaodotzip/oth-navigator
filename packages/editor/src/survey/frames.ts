import type { Capture, Keyframe } from "@oth/model";

/** `65400` → `01m05s`, so frames sort and read the same way. */
function stamp(timeMs: number): string {
  const total = Math.floor(timeMs / 1000);
  const mm = String(Math.floor(total / 60)).padStart(2, "0");
  const ss = String(total % 60).padStart(2, "0");
  return `${mm}m${ss}s`;
}

/**
 * What a grabbed frame is called.
 *
 * Named after its capture and the moment it came from, so a folder of frames
 * is still readable a month later without opening them.
 */
export function frameFilename(capture: Pick<Capture, "filename">, timeMs: number): string {
  const base = capture.filename
    .replace(/\.[^.]+$/, "")
    .trim()
    .replace(/[^\w-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return `${base || "capture"}-${stamp(timeMs)}.jpg`;
}

/**
 * Filmstrip order.
 *
 * The timeline, not the order frames were grabbed in — scrubbing backwards is
 * normal, and a filmstrip that jumped around would be unreadable. Photos have
 * no timeline, so they keep the order they were added.
 */
export function orderFrames(keyframes: readonly Keyframe[]): Keyframe[] {
  return [...keyframes].sort((a, b) => {
    if (a.timeMs === undefined || b.timeMs === undefined) return 0;
    return a.timeMs - b.timeMs;
  });
}
