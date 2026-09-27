import { live, placeLevels, type MapModel, type ValidationReport } from "@oth/model";
import type { LevelImage } from "../api/client";
import { imageForLevel } from "../state/underlay";
import { labelCounts } from "../survey/labelled";
import { levelChecklist, stepForCode, type StepId } from "./checklist";

export type BuildStepId = "floorplan" | "rooms" | "pathways" | "entrances" | "bind" | "dressing";

/** The six build steps, in the order a floor is built, with what "next" says for each. */
export const BUILD_STEPS: ReadonlyArray<{ id: BuildStepId; label: string; next: string }> = [
  { id: "floorplan", label: "Floorplan", next: "add the floorplan and set its scale" },
  { id: "rooms", label: "Areas & rooms", next: "trace areas and rooms" },
  { id: "pathways", label: "Pathways", next: "draw pathways" },
  { id: "entrances", label: "Entrances & lifts", next: "mark entrances, lifts and stairs" },
  { id: "bind", label: "Bind places", next: "bind surveyed places to rooms" },
  { id: "dressing", label: "Dressing", next: "dress the details" },
];

const FROM_CHECKLIST: Record<StepId, BuildStepId> = {
  floorplan: "floorplan",
  scale: "floorplan",
  rooms: "rooms",
  connect: "pathways",
  entrances: "entrances",
  portals: "entrances",
  dressing: "dressing",
};

/**
 * Which build step owns a validation code. Survey agreement — a place with no
 * room, a room nobody surveyed — is answered by binding, not by tracing.
 */
export function buildStepForCode(code: string): BuildStepId | null {
  if (code.startsWith("place.") || code === "room.unsurveyed") return "bind";
  const step = stepForCode(code);
  return step ? FROM_CHECKLIST[step] : null;
}

/** Which of the six steps a floor has finished, from the existing checklist plus binding. */
export function buildStepsDone(
  model: MapModel,
  report: ValidationReport | null,
  levelImages: LevelImage[],
  levelId: string,
): Record<BuildStepId, boolean> {
  const checklist = levelChecklist({ model, levelId, image: imageForLevel(levelImages, levelId), report });
  const done = (id: StepId) => checklist.find(s => s.id === id)?.status === "done";
  const levels = placeLevels(model);
  // Walkways are stretches of floor, not units: nothing to bind them to.
  const units = live(model.places).filter(
    p => p.status === "confirmed" && !p.pathwayKindId && levels.get(p.id) === levelId,
  );
  return {
    floorplan: done("floorplan") && done("scale"),
    rooms: done("rooms"),
    pathways: done("connect"),
    entrances: done("entrances") && done("portals"),
    // Nothing to bind is not the same as bound: a floor with no survey yet is not done.
    bind: units.length > 0 && units.every(p => Boolean(p.roomId)),
    // The checklist calls dressing done when there is nothing to dress, which
    // on a blank floor would read as one step of six already finished.
    dressing: done("rooms") && done("dressing"),
  };
}

export type FloorProgress = {
  levelId: string;
  /** Frames on the floor's footage that carry at least one tag, of all of them. */
  survey: { tagged: number; total: number };
  /** Places on the floor: confirmed, and still waiting on a person. */
  review: { confirmed: number; proposed: number };
  build: { done: number; total: number; next: BuildStepId | null };
};

/** One floor's progress. The home cards, the floor switcher and the tabs all read this. */
export function floorProgress(
  model: MapModel,
  report: ValidationReport | null,
  levelImages: LevelImage[],
  levelId: string,
): FloorProgress {
  const captures = new Set(live(model.captures).filter(c => c.levelId === levelId).map(c => c.id));
  const frames = live(model.keyframes).filter(k => captures.has(k.captureId));
  const counts = labelCounts(model);
  const levels = placeLevels(model);
  const places = live(model.places).filter(p => levels.get(p.id) === levelId);
  const done = buildStepsDone(model, report, levelImages, levelId);

  return {
    levelId,
    survey: {
      tagged: frames.filter(f => (counts.get(f.id) ?? 0) > 0).length,
      total: frames.length,
    },
    review: {
      confirmed: places.filter(p => p.status === "confirmed").length,
      proposed: places.filter(p => p.status === "proposed").length,
    },
    build: {
      done: BUILD_STEPS.filter(s => done[s.id]).length,
      total: BUILD_STEPS.length,
      next: BUILD_STEPS.find(s => !done[s.id])?.id ?? null,
    },
  };
}

/** Proposals waiting on a person on one floor — the number on the Review tab. */
export function waitingReview(model: MapModel | null, levelId: string): number {
  if (!model) return 0;
  const levels = placeLevels(model);
  return live(model.places).filter(p => p.status === "proposed" && levels.get(p.id) === levelId).length;
}

/** The line on a floor card saying what to do next. */
export function nextStepText(progress: FloorProgress): string {
  const step = BUILD_STEPS.find(s => s.id === progress.build.next);
  return step ? `Next: ${step.next}` : "Every build step done";
}
