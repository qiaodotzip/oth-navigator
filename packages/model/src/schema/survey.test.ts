import { describe, expect, it } from "vitest";
import { CaptureSchema, KeyframeSchema, PlaceSchema, SightingSchema } from "./survey";

describe("capture", () => {
  it("accepts a video with a duration", () => {
    const c = CaptureSchema.parse({ id: "cap_1", kind: "video", filename: "L1.mp4", durationMs: 90_000 });
    expect(c.kind).toBe("video");
  });

  it("accepts a photo set, which has no duration", () => {
    expect(() => CaptureSchema.parse({ id: "cap_2", kind: "photos", filename: "L3 photos" })).not.toThrow();
  });

  it("rejects a capture with no filename to recognise it by", () => {
    expect(() => CaptureSchema.parse({ id: "cap_3", kind: "video", filename: "" })).toThrow();
  });

  it("does not insist on a level, since a walkthrough can cross floors", () => {
    expect(CaptureSchema.parse({ id: "cap_4", kind: "video", filename: "a.mp4" }).levelId)
      .toBeUndefined();
  });
});

describe("place", () => {
  it("needs a name, since naming is the whole point", () => {
    expect(() => PlaceSchema.parse({ id: "pl_1", nameEn: "", category: "retail" })).toThrow();
  });

  it("is unbound until a room claims it", () => {
    expect(PlaceSchema.parse({ id: "pl_1", nameEn: "NTUC", category: "retail" }).roomId)
      .toBeUndefined();
  });

  it("takes a tenant category, so the catalogue lands without translation", () => {
    expect(() => PlaceSchema.parse({ id: "pl_1", nameEn: "X", category: "wormhole" })).toThrow();
  });

  it("carries no coordinates, because handheld video does not know any", () => {
    const place = PlaceSchema.parse({ id: "pl_1", nameEn: "X", category: "retail" });
    expect(place).not.toHaveProperty("position");
  });
});

describe("sighting", () => {
  it("may carry no box, when the whole frame is the thing", () => {
    expect(SightingSchema.parse({ id: "s1", placeId: "pl_1", keyframeId: "kf_1" }).box)
      .toBeUndefined();
  });

  it("takes a box in image fractions, so it survives any resize", () => {
    const s = SightingSchema.parse({
      id: "s1", placeId: "pl_1", keyframeId: "kf_1", box: { x: 0.1, y: 0.2, w: 0.3, h: 0.4 },
    });
    expect(s.box?.w).toBe(0.3);
  });

  it("rejects a box that extends outside the frame", () => {
    expect(() => SightingSchema.parse({
      id: "s1", placeId: "pl_1", keyframeId: "kf_1", box: { x: 0.9, y: 0, w: 0.5, h: 0.1 },
    })).toThrow();
  });

  it("rejects a box measured in pixels by mistake", () => {
    expect(() => SightingSchema.parse({
      id: "s1", placeId: "pl_1", keyframeId: "kf_1", box: { x: 120, y: 80, w: 300, h: 200 },
    })).toThrow();
  });
});

describe("keyframe", () => {
  it("carries the moment it came from", () => {
    expect(KeyframeSchema.parse({
      id: "kf_1", captureId: "cap_1", timeMs: 4200, imageId: "img_1", widthPx: 1920, heightPx: 1080,
    }).timeMs).toBe(4200);
  });

  it("has no time when it is an uploaded photo", () => {
    expect(KeyframeSchema.parse({
      id: "kf_1", captureId: "cap_2", imageId: "img_1", widthPx: 4032, heightPx: 3024,
    }).timeMs).toBeUndefined();
  });
});
