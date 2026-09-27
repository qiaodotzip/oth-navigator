import { describe, expect, it } from "vitest";
import { fitSize } from "./fit";

describe("fitSize", () => {
  it("fills the width when the space is wider in shape than the frame is not", () => {
    expect(fitSize({ width: 800, height: 800 }, { widthPx: 3840, heightPx: 2160 })).toEqual({ width: 800, height: 450 });
  });

  it("fills the height when the space is wide and short", () => {
    expect(fitSize({ width: 1600, height: 450 }, { widthPx: 3840, heightPx: 2160 })).toEqual({ width: 800, height: 450 });
  });

  it("is nothing, not NaN, for a space or frame of no size", () => {
    expect(fitSize({ width: 0, height: 500 }, { widthPx: 3840, heightPx: 2160 })).toEqual({ width: 0, height: 0 });
    expect(fitSize({ width: 500, height: 500 }, { widthPx: 0, heightPx: 0 })).toEqual({ width: 0, height: 0 });
  });
});
