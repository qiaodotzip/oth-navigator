import { parseModel } from "@oth/model";
import { describe, expect, it } from "vitest";
import { frameTime, nextUntagged, readSurveyParams, stepFrame, surveyView, type SurveyParams } from "./surveyView";

const frame = (id: string, captureId: string, timeMs: number) =>
  ({ id, captureId, timeMs, imageId: id, widthPx: 64, heightPx: 36 });

const model = parseModel({
  building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
  levels: [
    { id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6 },
    { id: "oth-L2", buildingId: "oth", code: "L2", ordinal: 2, nameEn: "L2", nameZh: "二楼", elevationM: 6, heightM: 4 },
  ],
  captures: [
    { id: "cap_b", kind: "video", filename: "B walk.mp4", levelId: "oth-L1" },
    { id: "cap_a", kind: "video", filename: "A walk.mp4", levelId: "oth-L1" },
    { id: "cap_2", kind: "video", filename: "L2 walk.mp4", levelId: "oth-L2" },
    { id: "cap_u", kind: "video", filename: "level 1" },
  ],
  keyframes: [
    frame("kf_3", "cap_a", 3000), frame("kf_1", "cap_a", 1000), frame("kf_2", "cap_a", 2000),
    frame("kf_4", "cap_a", 4000), frame("kf_b", "cap_b", 0),
  ],
  places: [
    { id: "p_mine", nameEn: "Kopitiam", category: "retail", levelId: "oth-L1" },
    { id: "p_prop", nameEn: "Festive Mall", category: "retail", status: "proposed" },
  ],
  sightings: [
    { id: "s1", placeId: "p_mine", keyframeId: "kf_1" },
    { id: "s2", placeId: "p_prop", keyframeId: "kf_2", status: "proposed" },
    { id: "s3", placeId: "p_mine", keyframeId: "kf_2" },
  ],
});

const at = (params: Partial<SurveyParams> = {}, levelId = "oth-L1") =>
  surveyView(model, levelId, { ...readSurveyParams({}), ...params });
const ids = (frames: { id: string }[]) => frames.map(f => f.id);

describe("readSurveyParams", () => {
  it("reads the address as given", () => {
    expect(readSurveyParams({ capture: "cap_a", frame: "kf_2", view: "grid", filter: "untagged", place: "p_mine" }))
      .toEqual({ capture: "cap_a", frame: "kf_2", view: "grid", filter: "untagged", place: "p_mine" });
  });

  it("falls back to the defaults for anything it does not know", () => {
    expect(readSurveyParams({ view: "list", filter: "bogus" }))
      .toEqual({ capture: null, frame: null, view: "frame", filter: "all", place: null });
  });
});

describe("surveyView", () => {
  it("lists this floor's footage by name, and footage on no floor apart", () => {
    const view = at();
    expect(view.captures.map(c => c.id)).toEqual(["cap_a", "cap_b"]);
    expect(view.unfiled.map(c => c.id)).toEqual(["cap_u"]);
  });

  it("opens the first footage when none is asked for, or when the one asked for is on another floor", () => {
    expect(at().capture?.id).toBe("cap_a");
    expect(at({ capture: "cap_2" }).capture?.id).toBe("cap_a");
  });

  it("opens the footage a frame belongs to when only the frame is given", () => {
    expect(at({ frame: "kf_b" }).capture?.id).toBe("cap_b");
  });

  it("puts the frames on their timeline", () => {
    expect(ids(at().frames)).toEqual(["kf_1", "kf_2", "kf_3", "kf_4"]);
  });

  it("opens on the first frame with no tag, when no frame is asked for", () => {
    const view = at();
    expect(view.frame?.id).toBe("kf_3");
    expect(view.index).toBe(2);
  });

  it("counts each filter over the footage in view", () => {
    expect(at().counts).toEqual({ all: 4, untagged: 2, proposed: 1, tagged: 1 });
  });

  it("opens the frame asked for even when the filter would hide it, and keeps it in the strip", () => {
    const view = at({ frame: "kf_1", filter: "untagged" });
    expect(view.frame?.id).toBe("kf_1");
    expect(ids(view.shown)).toEqual(["kf_1", "kf_3", "kf_4"]);
  });

  it("falls back to a frame of the footage when the one asked for is not in it", () => {
    expect(at({ capture: "cap_a", frame: "kf_b" }).frame?.id).toBe("kf_3");
  });

  it("shows only the frames a chosen place was seen in", () => {
    const view = at({ place: "p_mine" });
    expect(view.place?.id).toBe("p_mine");
    expect(ids(view.shown)).toEqual(["kf_1", "kf_2"]);
    expect(view.frame?.id).toBe("kf_1");
  });

  it("ignores a place that does not exist and applies the filter instead", () => {
    const view = at({ place: "p_nope", filter: "tagged" });
    expect(view.place).toBeNull();
    expect(ids(view.shown)).toEqual(["kf_1"]);
  });

  it("has no frame, not a broken one, when nothing passes the filter", () => {
    const empty = parseModel({ ...model, sightings: [] });
    const view = surveyView(empty, "oth-L1", { ...readSurveyParams({}), filter: "tagged" });
    expect(view.frame).toBeNull();
    expect(view.shown).toEqual([]);
    expect(view.index).toBe(-1);
  });

  it("has footage but no frames on a floor where nothing was grabbed yet", () => {
    const view = at({}, "oth-L2");
    expect(view.capture?.id).toBe("cap_2");
    expect(view.frames).toEqual([]);
    expect(view.frame).toBeNull();
  });

  it("is empty, not broken, before the model loads", () => {
    const view = surveyView(null, "oth-L1", readSurveyParams({}));
    expect(view.captures).toEqual([]);
    expect(view.frame).toBeNull();
    expect(view.index).toBe(-1);
  });
});

describe("stepping through frames", () => {
  it("moves to the next frame the filter lets through, from where you are", () => {
    expect(stepFrame(at({ frame: "kf_1", filter: "untagged" }), 1)?.id).toBe("kf_3");
  });

  it("moves back the same way", () => {
    expect(stepFrame(at({ frame: "kf_4", filter: "untagged" }), -1)?.id).toBe("kf_3");
  });

  it("stops at either end rather than wrapping without saying so", () => {
    expect(stepFrame(at({ frame: "kf_4" }), 1)).toBeNull();
    expect(stepFrame(at({ frame: "kf_1" }), -1)).toBeNull();
  });
});

describe("nextUntagged", () => {
  it("finds the next frame with no tag after this one", () => {
    expect(nextUntagged(at({ frame: "kf_1" }))?.id).toBe("kf_3");
  });

  it("wraps once to the start of the footage", () => {
    expect(nextUntagged(at({ frame: "kf_4" }))?.id).toBe("kf_3");
  });

  it("says there is none when every other frame has a tag", () => {
    const tagged = parseModel({
      ...model,
      sightings: ["kf_1", "kf_2", "kf_3", "kf_4"].map((kf, i) => ({ id: `t${i}`, placeId: "p_mine", keyframeId: kf })),
    });
    expect(nextUntagged(surveyView(tagged, "oth-L1", readSurveyParams({})))).toBeNull();
  });
});

describe("frameTime", () => {
  it("writes a moment the way the top row shows it", () => {
    expect(frameTime(424000)).toBe("7m04s");
    expect(frameTime(0)).toBe("0m00s");
    expect(frameTime(3_600_000)).toBe("60m00s");
  });
});
