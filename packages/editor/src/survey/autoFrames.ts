/**
 * Choosing frames out of a walkthrough, without a human scrubbing for them.
 *
 * Everything here is a pure function of numbers, so the part that decides what
 * to keep is testable. Only the seeking and drawing is not, and that lives in
 * `captureFrame.ts`, driven by `findFrames.ts`.
 */

/** How often to look. A walking pace covers a shopfront in roughly this long. */
export const SAMPLE_EVERY_MS = 2000;

/**
 * How different two frames must be to be worth keeping, as a fraction of full
 * scale. A walkthrough down a corridor produces hundreds of near-identical
 * frames, and labelling the same shopfront forty times is worse than useless —
 * it buries the frames that show something new.
 */
export const SCENE_CHANGE = 0.06;

/**
 * A cap, so a long recording cannot produce a labelling job nobody will finish.
 * At one frame every two seconds this is twenty minutes of walking.
 */
export const MAX_FRAMES = 600;

/** The moments to look at, in order. */
export function samplePlan(
  durationMs: number,
  everyMs = SAMPLE_EVERY_MS,
  maxFrames = MAX_FRAMES,
): number[] {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return [];
  if (!Number.isFinite(everyMs) || everyMs <= 0) return [];

  const out: number[] = [];
  for (let t = 0; t < durationMs && out.length < maxFrames; t += everyMs) out.push(t);
  return out;
}

/**
 * How different two frames are, 0 to 1.
 *
 * Mean absolute difference in luma over RGBA pixels. Luma rather than colour
 * because a walkthrough's colour shifts with the lighting far more than its
 * content does, and this should notice a new shopfront rather than a cloud.
 */
export function frameDifference(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  if (a.length === 0 || a.length !== b.length) return 1;

  let total = 0;
  let n = 0;
  for (let i = 0; i + 3 < a.length; i += 4) {
    const la = 0.299 * a[i]! + 0.587 * a[i + 1]! + 0.114 * a[i + 2]!;
    const lb = 0.299 * b[i]! + 0.587 * b[i + 1]! + 0.114 * b[i + 2]!;
    total += Math.abs(la - lb);
    n++;
  }
  return n === 0 ? 1 : total / n / 255;
}

/** Whether a frame is worth keeping, given the last one kept. */
export function isNewScene(
  previous: Uint8ClampedArray | null,
  current: Uint8ClampedArray,
  threshold = SCENE_CHANGE,
): boolean {
  // The first frame is always new; there is nothing to be the same as.
  if (!previous) return true;
  return frameDifference(previous, current) >= threshold;
}

/**
 * The moments not already covered by a frame the footage has — so running it
 * again on the same video finds more frames rather than the same ones twice,
 * and a run that stopped halfway carries on from where it stopped.
 */
export function freshSamples(
  plan: readonly number[], existingMs: readonly number[], toleranceMs = SAMPLE_EVERY_MS / 2,
): number[] {
  return plan.filter(t => !existingMs.some(e => Math.abs(e - t) < toleranceMs));
}
