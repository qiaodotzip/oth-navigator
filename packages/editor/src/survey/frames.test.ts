import { KeyframeSchema } from "@oth/model";
import { describe, expect, it } from "vitest";
import { frameFilename, orderFrames } from "./frames";

const kf = (id: string, timeMs?: number) =>
  KeyframeSchema.parse({ id, captureId: "cap_1", timeMs, imageId: id, widthPx: 640, heightPx: 480 });

describe("frameFilename", () => {
  it("names a frame by its capture and timestamp, so a download is recognisable", () => {
    expect(frameFilename({ filename: "L1 walk.mp4" }, 65_400)).toBe("l1-walk-01m05s.jpg");
  });

  it("copes with a capture whose name has no extension", () => {
    expect(frameFilename({ filename: "L3 photos" }, 0)).toBe("l3-photos-00m00s.jpg");
  });

  it("strips punctuation that a filesystem would object to", () => {
    expect(frameFilename({ filename: "L1/L2 (draft).mov" }, 1000)).toBe("l1-l2-draft-00m01s.jpg");
  });

  it("still produces a name when the capture is called nothing useful", () => {
    expect(frameFilename({ filename: "!!!.mp4" }, 0)).toBe("capture-00m00s.jpg");
  });

  it("pads minutes past an hour rather than wrapping", () => {
    expect(frameFilename({ filename: "a.mp4" }, 3_723_000)).toBe("a-62m03s.jpg");
  });
});

describe("orderFrames", () => {
  it("orders by timeline, not by when they were grabbed", () => {
    // Scrubbing backwards is normal; the filmstrip must still read left to right.
    const out = orderFrames([kf("c", 3000), kf("a", 1000), kf("b", 2000)]);
    expect(out.map(f => f.id)).toEqual(["a", "b", "c"]);
  });

  it("keeps photos in insertion order, since they have no timeline", () => {
    const out = orderFrames([kf("p3"), kf("p1"), kf("p2")]);
    expect(out.map(f => f.id)).toEqual(["p3", "p1", "p2"]);
  });

  it("does not mutate what it was given", () => {
    const input = [kf("b", 2000), kf("a", 1000)];
    orderFrames(input);
    expect(input.map(f => f.id)).toEqual(["b", "a"]);
  });
});
