import { describe, expect, it } from "vitest";
import { FindFramesError, findFrames, type FindProgress, type FrameSource } from "./findFrames";

/** A video whose frames look like the given grey levels, one per moment. */
function source(levels: number[]): FrameSource {
  let at = 0;
  return {
    seek: async (timeMs: number) => { at = timeMs; },
    thumbnail: () => new Uint8ClampedArray(16).fill(levels[at / 2000] ?? 0),
    grab: async () => new Blob([String(at)]),
  };
}

describe("findFrames", () => {
  it("keeps the frames that show something new and drops the near-identical ones", async () => {
    const kept: number[] = [];
    const result = await findFrames({
      moments: [0, 2000, 4000],
      source: source([10, 11, 200]),
      keep: async (_blob, timeMs) => { kept.push(timeMs); },
      onProgress: () => {},
      cancelled: () => false,
    });
    expect(kept).toEqual([0, 4000]);
    expect(result).toEqual({ kept: 2, stopped: false });
  });

  it("says how far it has got, ending with everything checked", async () => {
    const progress: FindProgress[] = [];
    await findFrames({
      moments: [0, 2000],
      source: source([10, 200]),
      keep: async () => {},
      onProgress: p => progress.push(p),
      cancelled: () => false,
    });
    expect(progress[0]).toEqual({ checked: 0, total: 2, kept: 0 });
    expect(progress.at(-1)).toEqual({ checked: 2, total: 2, kept: 2 });
  });

  it("stops between frames when asked to, keeping what it has", async () => {
    let stop = false;
    const result = await findFrames({
      moments: [0, 2000, 4000],
      source: source([10, 200, 10]),
      keep: async () => { stop = true; },
      onProgress: () => {},
      cancelled: () => stop,
    });
    expect(result).toEqual({ kept: 1, stopped: true });
  });

  it("says at which moment it stopped when a frame could not be kept", async () => {
    const failure = new TypeError("Failed to fetch");
    const run = findFrames({
      moments: [0, 2000],
      source: source([10, 200]),
      keep: async (_blob, timeMs) => { if (timeMs === 2000) throw failure; },
      onProgress: () => {},
      cancelled: () => false,
    });
    await expect(run).rejects.toBeInstanceOf(FindFramesError);
    await run.catch((err: FindFramesError) => {
      expect(err.atMs).toBe(2000);
      expect(err.reason).toBe(failure);
    });
  });
});
