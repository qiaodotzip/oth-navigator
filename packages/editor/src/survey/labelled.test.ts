import { parseModel } from "@oth/model";
import { describe, expect, it } from "vitest";
import { labelCounts, labelsForFrame } from "./labelled";

const model = (extra: Record<string, unknown>) => parseModel({
  building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
  captures: [{ id: "cap_1", kind: "video", filename: "a.mp4" }],
  keyframes: [
    { id: "kf_1", captureId: "cap_1", timeMs: 0, imageId: "kf_1", widthPx: 64, heightPx: 48 },
    { id: "kf_2", captureId: "cap_1", timeMs: 1000, imageId: "kf_2", widthPx: 64, heightPx: 48 },
  ],
  ...extra,
});

const withOne = model({
  places: [{ id: "p1", nameEn: "Starbucks", category: "retail" }],
  sightings: [{ id: "s1", placeId: "p1", keyframeId: "kf_1", box: { x: 0.1, y: 0.2, w: 0.3, h: 0.1 } }],
});

describe("labelsForFrame", () => {
  it("brings the place each label points at, so the frame can be annotated", () => {
    const [label] = labelsForFrame(withOne, "kf_1");
    expect(label?.place.nameEn).toBe("Starbucks");
    expect(label?.sighting.box?.w).toBe(0.3);
  });

  it("says nothing about a frame nobody has labelled", () => {
    expect(labelsForFrame(withOne, "kf_2")).toEqual([]);
  });

  it("drops a label whose place was rejected", () => {
    const m = model({
      places: [{ id: "p1", nameEn: "Gone", category: "retail", deletedAt: "2026-09-01T00:00:00.000Z" }],
      sightings: [{ id: "s1", placeId: "p1", keyframeId: "kf_1" }],
    });
    expect(labelsForFrame(m, "kf_1")).toEqual([]);
  });

  it("copes with no model, which is the first render", () => {
    expect(labelsForFrame(null, "kf_1")).toEqual([]);
  });
});

describe("labelCounts", () => {
  it("counts labels per frame, so the filmstrip can show what is covered", () => {
    const m = model({
      places: [{ id: "p1", nameEn: "A", category: "retail" }, { id: "p2", nameEn: "B", category: "retail" }],
      sightings: [
        { id: "s1", placeId: "p1", keyframeId: "kf_1" },
        { id: "s2", placeId: "p2", keyframeId: "kf_1" },
        { id: "s3", placeId: "p1", keyframeId: "kf_2" },
      ],
    });
    const counts = labelCounts(m);
    expect(counts.get("kf_1")).toBe(2);
    expect(counts.get("kf_2")).toBe(1);
  });

  it("knows nothing about a frame with no labels, rather than reporting zero", () => {
    expect(labelCounts(withOne).get("kf_2")).toBeUndefined();
  });

  it("does not count a label whose place is gone", () => {
    const m = model({
      places: [],
      sightings: [{ id: "s1", placeId: "p_missing", keyframeId: "kf_1" }],
    });
    expect(labelCounts(m).get("kf_1")).toBeUndefined();
  });
});
