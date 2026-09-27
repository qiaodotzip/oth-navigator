import { isNewScene } from "./autoFrames";

/** A video, as far as finding frames in it needs. The real one seeks and draws; a test's is numbers. */
export type FrameSource = {
  /** Moves to a moment and waits until that frame can be drawn. */
  seek: (timeMs: number) => Promise<void>;
  /** A tiny copy of the frame on screen, for telling frames apart. */
  thumbnail: () => Uint8ClampedArray;
  /** The frame on screen, as a JPEG. */
  grab: () => Promise<Blob>;
};

export type FindProgress = { checked: number; total: number; kept: number };

/** Where a run stopped, and why, so it can say which moment to look at. */
export class FindFramesError extends Error {
  constructor(public readonly atMs: number, public readonly reason: unknown) {
    super(`stopped at ${atMs} ms`);
    this.name = "FindFramesError";
  }
}

/**
 * Walks the moments given, keeps each frame that shows something new, and
 * hands it over as soon as it is taken — so frames appear while the rest of
 * the footage is still being read. Checks for Cancel between frames.
 */
export async function findFrames({ moments, source, keep, onProgress, cancelled }: {
  moments: readonly number[];
  source: FrameSource;
  keep: (blob: Blob, timeMs: number) => Promise<void>;
  onProgress: (progress: FindProgress) => void;
  cancelled: () => boolean;
}): Promise<{ kept: number; stopped: boolean }> {
  let kept = 0;
  let previous: Uint8ClampedArray | null = null;
  for (const [i, timeMs] of moments.entries()) {
    if (cancelled()) return { kept, stopped: true };
    onProgress({ checked: i, total: moments.length, kept });
    try {
      await source.seek(timeMs);
      const thumb = source.thumbnail();
      if (!isNewScene(previous, thumb)) continue;
      previous = thumb;
      await keep(await source.grab(), timeMs);
      kept++;
    } catch (err) {
      throw new FindFramesError(timeMs, err);
    }
  }
  onProgress({ checked: moments.length, total: moments.length, kept });
  return { kept, stopped: false };
}
