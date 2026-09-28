import { parseModel, type Place } from "@oth/model";
import { describe, expect, it } from "vitest";
import { bestEvidence, frameWindow, imageWidthFor, statusLine, surveyLink } from "./evidence";

const iso = "2026-09-20T00:00:00.000Z";
const frame = (id: string, captureId = "cap_1", extra = {}) =>
  ({ id, captureId, imageId: id, widthPx: 640, heightPx: 480, ...extra });

const model = parseModel({
  building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
  levels: [
    { id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6 },
    { id: "oth-L2", buildingId: "oth", code: "L2", ordinal: 2, nameEn: "L2", nameZh: "二楼", elevationM: 6, heightM: 4 },
  ],
  captures: [
    { id: "cap_1", kind: "video", filename: "l1.mp4", levelId: "oth-L1" },
    { id: "cap_l2", kind: "video", filename: "l2.mp4", levelId: "oth-L2" },
    { id: "cap_loose", kind: "photos", filename: "phone" },
    { id: "cap_gone", kind: "video", filename: "old.mp4", levelId: "oth-L1", deletedAt: iso },
  ],
  keyframes: [
    frame("kf_1"), frame("kf_2"), frame("kf_3"), frame("kf_4"), frame("kf_5"),
    frame("kf_bin", "cap_1", { deletedAt: iso }),
    frame("kf_gonecap", "cap_gone"),
    frame("kf_l2", "cap_l2"),
    frame("kf_loose", "cap_loose"),
  ],
  places: [
    { id: "p", nameEn: "Starbucks", category: "retail", levelId: "oth-L1" },
    { id: "q", nameEn: "Other", category: "retail", levelId: "oth-L1" },
  ],
  sightings: [
    { id: "s_small", placeId: "p", keyframeId: "kf_1", box: { x: 0.1, y: 0.1, w: 0.1, h: 0.1 } },
    { id: "s_big", placeId: "p", keyframeId: "kf_2", box: { x: 0.1, y: 0.1, w: 0.3, h: 0.2 } },
    { id: "s_whole", placeId: "p", keyframeId: "kf_3" },
    { id: "s_claim", placeId: "p", keyframeId: "kf_4", box: { x: 0, y: 0, w: 0.5, h: 0.5 }, status: "proposed" },
    { id: "s_binned", placeId: "p", keyframeId: "kf_bin", box: { x: 0, y: 0, w: 0.9, h: 0.9 } },
    { id: "s_gonecap", placeId: "p", keyframeId: "kf_gonecap" },
    // A second tag on kf_2, worse than s_big: one entry per frame, by its best tag.
    { id: "s_dup", placeId: "p", keyframeId: "kf_2", status: "proposed" },
    { id: "s_deleted", placeId: "p", keyframeId: "kf_5", deletedAt: iso },
    { id: "s_other", placeId: "q", keyframeId: "kf_1", box: { x: 0, y: 0, w: 0.8, h: 0.8 } },
  ],
});

describe("bestEvidence", () => {
  it("puts confirmed tags with the largest box first, then other confirmed tags, then claims", () => {
    expect(bestEvidence(model, "p").map(e => e.sighting.id)).toEqual(["s_big", "s_small", "s_whole", "s_claim"]);
  });

  it("never offers a frame in the bin, deleted footage, or a deleted tag", () => {
    const frames = bestEvidence(model, "p").map(e => e.frame.id);
    for (const gone of ["kf_bin", "kf_gonecap", "kf_5"]) expect(frames).not.toContain(gone);
  });

  it("is empty for a place nobody filmed", () => {
    expect(bestEvidence(model, "nobody")).toEqual([]);
  });
});

describe("frameWindow", () => {
  it("shows the whole frame when there is no box", () => {
    expect(frameWindow(undefined)).toEqual({ x: 0, y: 0, size: 1 });
  });

  it("centres a small box in 40% of the frame", () => {
    const w = frameWindow({ x: 0.45, y: 0.45, w: 0.1, h: 0.1 });
    expect(w.size).toBeCloseTo(0.4);
    expect(w.x).toBeCloseTo(0.3);
    expect(w.y).toBeCloseTo(0.3);
  });

  it("keeps the window inside the frame for a box at its edge", () => {
    const w = frameWindow({ x: 0.95, y: 0, w: 0.05, h: 0.05 });
    expect(w.x).toBeCloseTo(0.6);
    expect(w.y).toBe(0);
  });

  it("shows the box with as much again around it, up to the whole frame", () => {
    expect(frameWindow({ x: 0.2, y: 0.2, w: 0.3, h: 0.1 }).size).toBeCloseTo(0.6);
    expect(frameWindow({ x: 0, y: 0, w: 0.6, h: 0.6 })).toEqual({ x: 0, y: 0, size: 1 });
  });
});

describe("imageWidthFor", () => {
  it("asks for the smallest width the server keeps that is wide enough", () => {
    expect(imageWidthFor(224, undefined)).toBe(240);
    expect(imageWidthFor(300, undefined)).toBe(320);
    // A 40% window shown 224 px wide needs 560 px of frame.
    expect(imageWidthFor(224, { x: 0.45, y: 0.45, w: 0.1, h: 0.1 })).toBe(1600);
    expect(imageWidthFor(5000, undefined)).toBe(1600);
  });
});

describe("surveyLink", () => {
  const kf = (id: string) => model.keyframes.find(k => k.id === id)!;

  it("opens the frame in its footage, on the floor that footage is filed under", () => {
    expect(surveyLink(model, kf("kf_1"))).toBe("/floors/L1/survey?capture=cap_1&frame=kf_1");
    expect(surveyLink(model, kf("kf_l2"))).toBe("/floors/L2/survey?capture=cap_l2&frame=kf_l2");
  });

  it("offers nothing for footage filed under no floor, which Survey cannot show", () => {
    expect(surveyLink(model, kf("kf_loose"))).toBeNull();
  });
});

describe("statusLine", () => {
  const team = [{ id: "u_wei", displayName: "Wei Kang" }];
  const place = model.places[0]!;
  const tagged = (sighting: Partial<(typeof model.sightings)[number]>) => ({
    frame: model.keyframes[0]!,
    sighting: { ...model.sightings[0]!, ...sighting },
  });
  // Built from local parts, so it is 27 Sep wherever the test runs.
  const on27 = new Date(2026, 8, 27, 12).toISOString();

  it("says who confirmed the photo shown, and when", () => {
    expect(statusLine(place, tagged({ updatedBy: "u_wei", updatedAt: on27 }), team)).toBe("Confirmed by Wei Kang, 27 Sep");
  });

  it("leaves out a name it does not know, such as the importer's", () => {
    expect(statusLine(place, tagged({ updatedBy: "system", updatedAt: on27 }), team)).toBe("Confirmed, 27 Sep");
    expect(statusLine(place, tagged({}), team)).toBe("Confirmed");
  });

  it("says a place still proposed is waiting in Review", () => {
    const claim: Place = { ...place, status: "proposed" };
    expect(statusLine(claim, tagged({}), team)).toBe("Proposed, waiting in Review");
  });

  it("says when the photo shown is only a claim", () => {
    expect(statusLine(place, tagged({ status: "proposed" }), team)).toBe("Confirmed, but this photo's tag is still proposed");
  });

  it("still says confirmed with no photo", () => {
    expect(statusLine(place, undefined, team)).toBe("Confirmed");
  });
});
