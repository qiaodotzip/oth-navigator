import { describe, expect, it } from "vitest";
import {
  MAX_FRAMES, SAMPLE_EVERY_MS, frameDifference, freshSamples, isNewScene, samplePlan,
} from "./autoFrames";

const solid = (v: number, pixels = 64) => {
  const a = new Uint8ClampedArray(pixels * 4);
  for (let i = 0; i < a.length; i += 4) {
    a[i] = v; a[i + 1] = v; a[i + 2] = v; a[i + 3] = 255;
  }
  return a;
};

describe("samplePlan", () => {
  it("walks the whole recording at the sample interval", () => {
    expect(samplePlan(10_000, 2000)).toEqual([0, 2000, 4000, 6000, 8000]);
  });

  it("starts at the first frame, which a walkthrough opens on", () => {
    expect(samplePlan(5000)[0]).toBe(0);
  });

  it("never samples past the end", () => {
    expect(Math.max(...samplePlan(5000, 2000))).toBeLessThan(5000);
  });

  it("caps a long recording, so the labelling job stays finishable", () => {
    expect(samplePlan(60 * 60 * 1000, 1000)).toHaveLength(MAX_FRAMES);
  });

  it("returns nothing for a video whose duration is unknown", () => {
    // A browser reports NaN until metadata loads, and sampling that would hang.
    expect(samplePlan(Number.NaN)).toEqual([]);
    expect(samplePlan(0)).toEqual([]);
  });

  it("refuses a nonsensical interval rather than looping forever", () => {
    expect(samplePlan(5000, 0)).toEqual([]);
    expect(samplePlan(5000, -1)).toEqual([]);
  });

  it("samples every two seconds by default, about one shopfront at walking pace", () => {
    expect(SAMPLE_EVERY_MS).toBe(2000);
  });
});

describe("frameDifference", () => {
  it("is zero for a frame that has not changed", () => {
    expect(frameDifference(solid(120), solid(120))).toBe(0);
  });

  it("is one for black against white", () => {
    expect(frameDifference(solid(0), solid(255))).toBeCloseTo(1, 5);
  });

  it("grows with the size of the change", () => {
    const small = frameDifference(solid(120), solid(130));
    const large = frameDifference(solid(120), solid(200));
    expect(large).toBeGreaterThan(small);
  });

  it("treats mismatched frames as completely different rather than crashing", () => {
    expect(frameDifference(solid(120, 4), solid(120, 8))).toBe(1);
    expect(frameDifference(new Uint8ClampedArray(0), new Uint8ClampedArray(0))).toBe(1);
  });

  it("ignores the alpha channel, which a canvas fixes at opaque", () => {
    const a = solid(120);
    const b = solid(120);
    for (let i = 3; i < b.length; i += 4) b[i] = 0;
    expect(frameDifference(a, b)).toBe(0);
  });
});

describe("isNewScene", () => {
  it("keeps the first frame, which has nothing to be the same as", () => {
    expect(isNewScene(null, solid(10))).toBe(true);
  });

  it("drops a frame that looks like the one before it", () => {
    // Walking down a corridor makes hundreds of these, and labelling the same
    // shopfront forty times buries the frames that show something new.
    expect(isNewScene(solid(120), solid(121))).toBe(false);
  });

  it("keeps a frame once the view has actually changed", () => {
    expect(isNewScene(solid(60), solid(200))).toBe(true);
  });

  it("compares against the last frame kept, not the last one looked at", () => {
    // A slow pan moves too little between samples to notice step by step, but
    // drifts past the threshold against the frame actually kept: 100 -> 116 is
    // 0.063, over the line, while every single step is 0.031, under it.
    let kept = solid(100);
    const keptValues = [108, 116, 124].filter(v => {
      const frame = solid(v);
      if (!isNewScene(kept, frame)) return false;
      kept = frame;
      return true;
    });
    expect(keptValues).toEqual([116]);
  });

  it("would keep nothing at all if each step were judged against the last sample", () => {
    // The reason the baseline is the last frame *kept*: judged step by step a
    // slow pan never changes enough, and a whole corridor goes unlabelled.
    const drift = [100, 108, 116, 124];
    const stepwise = drift.filter((v, i) =>
      i > 0 && isNewScene(solid(drift[i - 1]!), solid(v)));
    expect(stepwise).toEqual([]);
  });
});

describe("freshSamples", () => {
  it("skips moments that already have a frame close by, so running it again finds more rather than the same", () => {
    expect(freshSamples([0, 2000, 4000, 6000], [0, 2400])).toEqual([4000, 6000]);
  });

  it("keeps every moment for footage with no frames yet", () => {
    expect(freshSamples([0, 2000], [])).toEqual([0, 2000]);
  });
});
