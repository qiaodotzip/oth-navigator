import { parseModel, type PlanSource } from "@oth/model";
import { describe, expect, it } from "vitest";
import type { LevelImage } from "../api/client";
import {
  EPOCH, autoDone, cardLink, countRows, doneLine, firstOpenStep, notDoneLine, setupSince, sinceParam, stepDone,
  type StepContext,
} from "./progress";
import { STEP_COUNT, WIZARD_STEPS, doItMyself, slashCommand, stepAt, stepNumber } from "./steps";
import { NO_COUNTS, setupState } from "./testing";
import { SETUP_STEP_IDS } from "./types";

const sq: [number, number][] = [[0, 0], [10, 0], [10, 10], [0, 10]];
/** L1 has footage and one of Claude's labels waiting in Review; L2 has nothing. */
const model = parseModel({
  building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
  levels: [
    { id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6 },
    { id: "oth-L2", buildingId: "oth", code: "L2", ordinal: 2, nameEn: "L2", nameZh: "二楼", elevationM: 6, heightM: 4 },
  ],
  captures: [{ id: "cap_1", kind: "video", filename: "l1.mp4", levelId: "oth-L1" }],
  keyframes: [{ id: "kf_1", captureId: "cap_1", imageId: "kf_1", widthPx: 640, heightPx: 480 }],
  places: [{ id: "pl_tea", nameEn: "iTea", category: "retail", status: "proposed", proposedBy: "claude-code" }],
  sightings: [{ id: "s1", placeId: "pl_tea", keyframeId: "kf_1", status: "proposed" }],
});
/** The same, with Review done: nothing waits. */
const reviewed = parseModel({ ...model, places: [], sightings: [] });

const source: PlanSource = {
  page: 1, pageCount: 1, pageSizePt: [400, 300], rotation: 0, clipPt: [36, 78, 246, 292], pointsPerPixel: 0.1,
  metresPerPoint: 0.5, runsAgree: 2, runsFound: 2, pdfId: "pdf_1", checksum: "d".repeat(64), filename: "L1.pdf",
};
const plan = (over: Partial<LevelImage> = {}): LevelImage => ({
  id: "img_1", levelId: "oth-L1", filename: "L1.png", widthPx: 2000, heightPx: 1400, sizeBytes: 1,
  metresPerPixel: 0.05, offsetX: 0, offsetY: 0, opacity: 0.6, version: 1, source, ...over,
});

function on(code: "L1" | "L2", over: Partial<StepContext> = {}): StepContext {
  return { setup: setupState(), model, levelImages: [], levelId: `oth-${code}`, levelCode: code, draftsWaiting: 0, ...over };
}

const done = { status: "done" } as const;

describe("the nine steps", () => {
  it("are 6C's SETUP_STEPS, in order, numbered from 1", () => {
    expect(SETUP_STEP_IDS).toEqual(["footage", "label", "review", "floorplan", "rooms", "things", "paths", "check", "finish"]);
    expect(WIZARD_STEPS.map(s => s.id)).toEqual([...SETUP_STEP_IDS]);
    expect(STEP_COUNT).toBe(9);
    expect(stepNumber("check")).toBe(8);
    expect([stepAt(1), stepAt(9)]).toEqual(["footage", "finish"]);
    expect([stepAt(0), stepAt(10), stepAt(undefined)]).toEqual([null, null, null]);
  });

  it("give each Claude step its slash command for the floor", () => {
    expect(slashCommand("label", "L1")).toBe("/mcp__oth__label_survey L1");
    expect(slashCommand("rooms", "L2")).toBe("/mcp__oth__map_rooms L2");
    expect(slashCommand("things", "L1")).toBe("/mcp__oth__place_things L1");
    expect(slashCommand("paths", "L1")).toBe("/mcp__oth__draw_paths L1");
  });

  it("send Do it myself to the step's own tool", () => {
    expect(doItMyself("label", "L1")).toEqual({ label: "Do it myself in Survey", to: "/floors/L1/survey" });
    expect(doItMyself("rooms", "L1")).toEqual({ label: "Do it myself on Build", to: "/floors/L1/build?step=rooms" });
    expect(doItMyself("things", "L1")).toEqual({ label: "Do it myself on the Places tab", to: "/floors/L1/places" });
    expect(doItMyself("paths", "L1")).toEqual({ label: "Do it myself on Build", to: "/floors/L1/build?step=pathways" });
  });
});

describe("a step's tick", () => {
  it("ticks Add footage once footage is filed under the floor", () => {
    expect(stepDone("footage", on("L1"))).toBe(true);
    expect(stepDone("footage", on("L2"))).toBe(false);
    expect(notDoneLine("footage", on("L2"))).toBe("No footage is filed under L2 yet.");
    expect(notDoneLine("footage", on("L1"))).toBeNull();
  });

  it("ticks a Claude step only once it is stored: finish_step, or Mark done", () => {
    expect(stepDone("rooms", on("L1"))).toBe(false);
    expect(notDoneLine("rooms", on("L1"))).toBe("Claude hasn't finished the rooms yet.");
    expect(stepDone("rooms", on("L1", { setup: setupState({ rooms: done }) }))).toBe(true);
  });

  it("ticks Review once Claude has labelled and nothing waits, and says how much does", () => {
    expect(notDoneLine("review", on("L1"))).toBe("Claude hasn't labelled the survey yet.");
    const labelled = setupState({ label: done });
    expect(notDoneLine("review", on("L1", { setup: labelled }))).toBe("1 label is waiting for you.");
    expect(stepDone("review", on("L1", { setup: labelled, model: reviewed }))).toBe(true);
    // Before Claude has labelled, nothing waits either: that is not done.
    expect(autoDone("review", on("L1", { model: reviewed }))).toBe(false);
    expect(stepDone("review", on("L1", { setup: setupState({ review: { status: "skipped" } }) }))).toBe(true);
  });

  it("says what the Floorplan step still needs, in the order it is done", () => {
    expect(notDoneLine("floorplan", on("L1"))).toBe("L1 has no plan yet. Add the floor's PDF.");
    expect(notDoneLine("floorplan", on("L1", { levelImages: [plan({ source: null })] })))
      .toBe("This plan came from an image. Add the floor's PDF to find rooms in it.");
    expect(notDoneLine("floorplan", on("L1", { levelImages: [plan({ metresPerPixel: null })] })))
      .toBe("The plan isn't scaled yet.");
    expect(notDoneLine("floorplan", on("L1", { levelImages: [plan()] }))).toBe("Find rooms hasn't run on this plan yet.");
  });

  it("knows Find rooms has run from the server's drafts, the drafts store, or rooms from the drawing", () => {
    const withPlan = { levelImages: [plan()] };
    const found = setupState({}, { rooms: { waiting: 0, accepted: 0, rejectedOrSetAside: 3, stops: 0 } });
    expect(stepDone("floorplan", on("L1", { ...withPlan, setup: found }))).toBe(true);
    expect(stepDone("floorplan", on("L1", { ...withPlan, draftsWaiting: 4 }))).toBe(true);
    const fromPdf = parseModel({
      ...model,
      rooms: [{ id: "L1-a", levelId: "oth-L1", kind: "room", footprint: sq, heightM: 4, verification: { status: "cad", evidence: ["pdf:d"] } }],
    });
    expect(stepDone("floorplan", on("L1", { ...withPlan, model: fromPdf }))).toBe(true);
  });
});

describe("where the wizard opens", () => {
  it("opens on the first step not done", () => {
    expect(firstOpenStep(on("L2"))).toBe(1);
    expect(firstOpenStep(on("L1"))).toBe(2);
    const all = setupState({
      footage: done, label: done, review: done, floorplan: done, rooms: done, things: done, paths: done, check: done, finish: done,
    });
    expect(firstOpenStep(on("L1", { setup: all }))).toBe(9);
  });

  it("gives the Floors card Set up, Continue, or Set up again", () => {
    expect(cardLink(on("L1", { setup: null }))).toEqual({ label: "Set up L1", to: "/floors/L1/setup", restart: false });
    // Footage alone ticks by itself; nothing stored means nobody has started.
    expect(cardLink(on("L1"))).toEqual({ label: "Set up L1", to: "/floors/L1/setup", restart: false });
    const started = setupState({ footage: { status: "done", finishedAt: "2026-09-28T09:00:00.000Z" } });
    expect(cardLink(on("L1", { setup: started })))
      .toEqual({ label: "Continue: step 2 of 9", to: "/floors/L1/setup/2", restart: false });
    expect(cardLink(on("L1", { setup: setupState({ finish: done }) })))
      .toEqual({ label: "Set up again", to: "/floors/L1/setup/1", restart: true });
  });
});

describe("since when the check looks", () => {
  it("starts from when Add footage was stored done: when step 2 began", () => {
    const setup = setupState({
      footage: { status: "done", finishedAt: "2026-09-28T09:00:00.000Z" },
      label: { status: "done", finishedAt: "2026-09-28T09:40:00.000Z" },
    });
    expect(setupSince(setup)).toBe("2026-09-28T09:00:00.000Z");
    expect(sinceParam(setup)).toBe("2026-09-28T09:00:00.000Z");
  });

  it("asks for every change there is before the run has a start", () => {
    expect(setupSince(setupState())).toBeNull();
    expect(sinceParam(null)).toBe(EPOCH);
  });
});

describe("words", () => {
  it("names each Claude step's counts", () => {
    const counts = {
      ...NO_COUNTS,
      rooms: { waiting: 12, accepted: 150, rejectedOrSetAside: 53, stops: 8 },
      things: { bound: 30, unbound: 5, objects: [{ kindId: "ok_bin", name: "wastebin", count: 5 }] },
    };
    expect(countRows("rooms", counts)).toEqual([
      { label: "Drafts waiting", value: 12 },
      { label: "Made rooms", value: 150 },
      { label: "Rejected or set aside", value: 53 },
      { label: "Stops made", value: 8 },
    ]);
    expect(countRows("things", counts).map(r => r.label)).toEqual(["Places bound", "Places not bound yet", "Objects placed: wastebin"]);
    expect(countRows("things", NO_COUNTS).at(-1)).toEqual({ label: "Objects placed", value: 0 });
    expect(countRows("footage", counts)).toEqual([]);
  });

  it("says who finished a step, and when", () => {
    const team = [{ id: "u_sc", displayName: "Stef Chan" }];
    const now = Date.parse("2026-09-28T10:00:00.000Z");
    const at = "2026-09-28T09:55:00.000Z";
    const base = { step: "label" as const, status: "done" as const, note: "", finishedBy: "u_sc", finishedAt: at };
    expect(doneLine({ ...base, finishedVia: "tok_1" }, team, now)).toBe("Done by Claude, 5 minutes ago");
    expect(doneLine({ ...base, finishedVia: null }, team, now)).toBe("Done by Stef Chan, 5 minutes ago");
    expect(doneLine({ ...base, status: "skipped", finishedBy: "u_gone", finishedVia: null, finishedAt: null }, team, now))
      .toBe("Skipped by a teammate");
    expect(doneLine(null, team, now)).toBeNull();
  });
});
