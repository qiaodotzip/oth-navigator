import { parseModel } from "@oth/model";
import { describe, expect, it } from "vitest";
import { proposedPlaces, reviewProgress } from "./review";

const base = {
  building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
  levels: [{ id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6 }],
  captures: [{ id: "cap_1", kind: "video", filename: "a.mp4" }],
  keyframes: [
    { id: "kf_1", captureId: "cap_1", timeMs: 0, imageId: "kf_1", widthPx: 64, heightPx: 48 },
    { id: "kf_2", captureId: "cap_1", timeMs: 1000, imageId: "kf_2", widthPx: 64, heightPx: 48 },
  ],
};

const model = (extra: Record<string, unknown>) => parseModel({ ...base, ...extra });

describe("proposedPlaces", () => {
  it("shows only what a human has not settled yet", () => {
    const m = model({
      places: [
        { id: "p1", nameEn: "Proposed", category: "retail", status: "proposed" },
        { id: "p2", nameEn: "Already mine", category: "retail", status: "confirmed" },
      ],
    });
    expect(proposedPlaces(m).map(p => p.place.id)).toEqual(["p1"]);
  });

  it("brings the frames it was read from, since that is what settles it", () => {
    const m = model({
      places: [{ id: "p1", nameEn: "NTUC", category: "retail", status: "proposed" }],
      sightings: [
        { id: "s1", placeId: "p1", keyframeId: "kf_1" },
        { id: "s2", placeId: "p1", keyframeId: "kf_2" },
      ],
    });
    expect(proposedPlaces(m)[0]?.sightings).toHaveLength(2);
  });

  it("puts the most-evidenced first, so one decision clears the most queue", () => {
    const m = model({
      places: [
        { id: "p1", nameEn: "Seen once", category: "retail", status: "proposed" },
        { id: "p2", nameEn: "Seen twice", category: "retail", status: "proposed" },
      ],
      sightings: [
        { id: "s1", placeId: "p1", keyframeId: "kf_1" },
        { id: "s2", placeId: "p2", keyframeId: "kf_1" },
        { id: "s3", placeId: "p2", keyframeId: "kf_2" },
      ],
    });
    expect(proposedPlaces(m).map(p => p.place.id)).toEqual(["p2", "p1"]);
  });

  it("ignores a rejected place, which is a soft delete", () => {
    const m = model({
      places: [{
        id: "p1", nameEn: "Binned", category: "retail", status: "proposed",
        deletedAt: "2026-09-01T00:00:00.000Z",
      }],
    });
    expect(proposedPlaces(m)).toEqual([]);
  });

  it("does not count a sighting that was binned on its own", () => {
    const m = model({
      places: [{ id: "p1", nameEn: "NTUC", category: "retail", status: "proposed" }],
      sightings: [
        { id: "s1", placeId: "p1", keyframeId: "kf_1" },
        { id: "s2", placeId: "p1", keyframeId: "kf_2", deletedAt: "2026-09-01T00:00:00.000Z" },
      ],
    });
    expect(proposedPlaces(m)[0]?.sightings).toHaveLength(1);
  });

  it("copes with no model at all, which is the first render", () => {
    expect(proposedPlaces(null)).toEqual([]);
  });
});

describe("reviewProgress", () => {
  it("counts both sides, so an empty queue reads as done rather than as nothing", () => {
    const m = model({
      places: [
        { id: "p1", nameEn: "A", category: "retail", status: "proposed" },
        { id: "p2", nameEn: "B", category: "retail", status: "confirmed" },
        { id: "p3", nameEn: "C", category: "retail", status: "confirmed" },
      ],
    });
    expect(reviewProgress(m)).toEqual({ proposed: 1, confirmed: 2 });
  });
});
