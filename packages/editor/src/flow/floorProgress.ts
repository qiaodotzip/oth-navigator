import { live, placeLevels, type MapModel, type ValidationReport } from "@oth/model";
import type { LevelImage } from "../api/client";
import { stepTodos, type StepTodos } from "../build/todo";
import { imageForLevel } from "../state/underlay";
import { labelCounts } from "../survey/labelled";
import { BUILD_STEPS, floorUnits, type BuildStepId } from "./buildSteps";
import { levelChecklist, type StepId } from "./checklist";

export { BUILD_STEPS, buildStepForCode, type BuildStepId } from "./buildSteps";

/**
 * Which of the six steps a floor has finished — the one rule the stepper, the
 * to-do list, the floor cards and the step Build opens on all read.
 *
 * A step is done when its work is there and nothing on its to-do list is an
 * error, since an error is what stops Publish: a ✓ over twelve columns too
 * small to publish would send you to Publish only to be turned back. Warnings
 * leave the tick alone; the stepper counts them beside it instead.
 *
 * `todos` saves a second pass when the caller already has the floor's lists.
 */
export function buildStepsDone(
  model: MapModel,
  report: ValidationReport | null,
  levelImages: LevelImage[],
  levelId: string,
  todos: StepTodos = stepTodos(model, report, levelImages, levelId),
  /**
   * Drafts from the floor's drawing still to review (Part B). While any wait,
   * Areas & rooms is not done: the drawing says there are rooms still to add
   * or turn down. Their to-do stays a warning, so Publish is not stopped.
   * Drafts are loaded only for the open floor, so the floor cards and the
   * switcher pass none (Ruling 13).
   */
  draftsToReview = 0,
): Record<BuildStepId, boolean> {
  const checklist = levelChecklist({ model, levelId, image: imageForLevel(levelImages, levelId), report });
  const done = (id: StepId) => checklist.find(s => s.id === id)?.status === "done";
  const units = floorUnits(model, levelId);
  const there: Record<BuildStepId, boolean> = {
    floorplan: done("floorplan") && done("scale"),
    rooms: done("rooms") && draftsToReview === 0,
    pathways: done("connect"),
    entrances: done("entrances") && done("portals"),
    // Nothing to bind is not the same as bound: a floor with no survey yet is not done.
    bind: units.bound.length > 0 && units.waiting.length === 0,
    // The checklist calls dressing done when there is nothing to dress, which
    // on a blank floor would read as one step of six already finished.
    dressing: done("rooms") && done("dressing"),
  };
  return Object.fromEntries(
    BUILD_STEPS.map(({ id }) => [id, there[id] && todos[id].every(t => t.severity !== "error")]),
  ) as Record<BuildStepId, boolean>;
}

/**
 * Places on one floor: confirmed, and still waiting on a person (spec §5.3).
 * A rejected proposal is deleted and leaves both counts, so the bar never
 * goes backwards on a reject. `levels` saves a second pass when the caller
 * already has them.
 */
export function reviewCounts(
  model: MapModel, levelId: string, levels: Map<string, string | undefined> = placeLevels(model),
): { confirmed: number; proposed: number } {
  const places = live(model.places).filter(p => levels.get(p.id) === levelId);
  return {
    confirmed: places.filter(p => p.status === "confirmed").length,
    proposed: places.filter(p => p.status === "proposed").length,
  };
}

export type FloorProgress = {
  levelId: string;
  /** Frames on the floor's footage that carry at least one tag, of all of them. */
  survey: { tagged: number; total: number };
  /** Places on the floor: confirmed, and still waiting on a person. */
  review: { confirmed: number; proposed: number };
  build: { done: number; total: number; next: BuildStepId | null };
  /**
   * The floor's confirmed units, and those of them on the map: bound to a
   * live room here. Bind places' own rule (`floorUnits`), so the card's line
   * and the step's tick cannot disagree about a place.
   */
  places: { onMap: number; confirmed: number };
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
  const done = buildStepsDone(model, report, levelImages, levelId);
  const units = floorUnits(model, levelId, levels);

  return {
    levelId,
    survey: {
      tagged: frames.filter(f => (counts.get(f.id) ?? 0) > 0).length,
      total: frames.length,
    },
    review: reviewCounts(model, levelId, levels),
    build: {
      done: BUILD_STEPS.filter(s => done[s.id]).length,
      total: BUILD_STEPS.length,
      next: BUILD_STEPS.find(s => !done[s.id])?.id ?? null,
    },
    places: { onMap: units.bound.length, confirmed: units.bound.length + units.waiting.length },
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
