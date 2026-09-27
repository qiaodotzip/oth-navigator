import { parseModel } from "@oth/model";
import { describe, expect, it } from "vitest";
import { filterCounts, frameStatuses, matchesFilter, statusOf } from "./frameStatus";

const model = parseModel({
  building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
  captures: [{ id: "cap_1", kind: "video", filename: "a.mp4" }],
  keyframes: ["kf_1", "kf_2", "kf_3", "kf_4"].map((id, i) => ({
    id, captureId: "cap_1", timeMs: i * 1000, imageId: id, widthPx: 64, heightPx: 36,
  })),
  places: [
    { id: "p_mine", nameEn: "Kopitiam", category: "retail" },
    { id: "p_prop", nameEn: "Festive Mall", category: "retail", status: "proposed" },
    { id: "p_gone", nameEn: "Gone", category: "retail", deletedAt: "2026-09-01T00:00:00.000Z" },
  ],
  sightings: [
    { id: "s1", placeId: "p_mine", keyframeId: "kf_1" },
    { id: "s2", placeId: "p_prop", keyframeId: "kf_2", status: "proposed" },
    { id: "s3", placeId: "p_mine", keyframeId: "kf_2" },
    { id: "s4", placeId: "p_gone", keyframeId: "kf_3" },
  ],
});

describe("frameStatuses", () => {
  const statuses = frameStatuses(model);

  it("calls a frame whose tags are all confirmed tagged", () => {
    expect(statusOf(statuses, "kf_1")).toBe("tagged");
  });

  it("calls a frame with any proposed tag proposed, whatever else is on it", () => {
    expect(statusOf(statuses, "kf_2")).toBe("proposed");
  });

  it("counts a tag of a deleted place for nothing", () => {
    expect(statusOf(statuses, "kf_3")).toBe("untagged");
  });

  it("calls a frame nobody has tagged untagged", () => {
    expect(statusOf(statuses, "kf_4")).toBe("untagged");
  });

  it("is empty, not broken, before the model loads", () => {
    expect(frameStatuses(null).size).toBe(0);
  });
});

describe("filters", () => {
  it("lets everything through All, and only its own status through the rest", () => {
    expect(matchesFilter("proposed", "all")).toBe(true);
    expect(matchesFilter("proposed", "proposed")).toBe(true);
    expect(matchesFilter("proposed", "tagged")).toBe(false);
  });

  it("counts the frames under each filter", () => {
    expect(filterCounts(["kf_1", "kf_2", "kf_3", "kf_4"], frameStatuses(model)))
      .toEqual({ all: 4, untagged: 2, proposed: 1, tagged: 1 });
  });
});
