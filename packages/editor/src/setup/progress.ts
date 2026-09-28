import { live, type MapModel } from "@oth/model";
import type { LevelImage, LineUp, TeamMember } from "../api/client";
import { waitingReview } from "../flow/floorProgress";
import { href } from "../route";
import { imageForLevel } from "../state/underlay";
import { relativeTime } from "../ui/relativeTime";
import { STEP_COUNT, stepNumber } from "./steps";
import { SETUP_STEP_IDS, type SetupCounts, type SetupState, type SetupStepId, type SetupStepState } from "./types";

/** Everything a step's tick is read from. */
export type StepContext = {
  setup: SetupState | null;
  model: MapModel | null;
  levelImages: readonly LevelImage[];
  levelId: string;
  levelCode: string;
  /** The floor's drafts waiting, from the drafts store: 0 where they aren't loaded, as on the Floors home. */
  draftsWaiting: number;
  /**
   * The floor's line-up warning, from the drafts store (contract v3): the
   * drawing doesn't line up with the floor's rooms. Left out where the
   * drafts aren't loaded, as on the Floors home.
   */
  lineUp?: LineUp;
};

/** "Every change there is": the since sent before a run has a start. */
export const EPOCH = "1970-01-01T00:00:00.000Z";

export function storedState(setup: SetupState | null, step: SetupStepId): SetupStepState | null {
  return setup?.steps.find(s => s.step === step) ?? null;
}

function stored(ctx: StepContext, step: SetupStepId): boolean {
  const state = storedState(ctx.setup, step);
  return state !== null && state.status !== "open";
}

/**
 * Whether Find rooms has run on this floor. The server counts every search's
 * drafts, decided or not; the drafts store has them the moment a search
 * saves; and a floor whose drafts were all decided long ago still has rooms
 * whose evidence is its PDF. The Floorplan step's line-up line reads it too.
 */
export function roomsFound(ctx: StepContext): boolean {
  const r = ctx.setup?.counts.rooms;
  if (r && r.waiting + r.setAside + r.accepted + r.rejected > 0) return true;
  if (ctx.draftsWaiting > 0) return true;
  return live(ctx.model?.rooms ?? []).some(
    room => room.levelId === ctx.levelId && room.verification.evidence.some(e => e.startsWith("pdf:")),
  );
}

/** What the Floorplan step still needs, in the order it is done; null when it has it all. */
export function floorplanGap(ctx: StepContext): string | null {
  const image = imageForLevel(ctx.levelImages, ctx.levelId);
  if (!image) return `${ctx.levelCode} has no plan yet. Add the floor's PDF.`;
  if (!image.source) return "This plan came from an image. Add the floor's PDF to find rooms in it.";
  if (image.metresPerPixel == null) return "The plan isn't scaled yet.";
  if (!roomsFound(ctx)) return "Find rooms hasn't run on this plan yet.";
  if (ctx.lineUp) return `The drawing doesn't line up with ${ctx.levelCode}'s rooms yet.`;
  return null;
}

/**
 * Labels waiting in Review: the more of the map's count and the server's. The
 * map may be older than Claude's labelling (the Floors home loads it once);
 * the server's count may be older than your last decision, until the setup
 * is asked for again. Either still waiting means Review isn't done.
 */
function labelsWaiting(ctx: StepContext): number {
  return Math.max(waitingReview(ctx.model, ctx.levelId), ctx.setup?.counts.review.left ?? 0);
}

/**
 * A "you" step's own rule, read off the map (spec §4.1), whatever is stored.
 * Review waits for Claude's labels: with none yet, nothing waits either, and
 * a tick there would say the step was done before it began.
 */
export function autoDone(step: SetupStepId, ctx: StepContext): boolean {
  switch (step) {
    case "footage":
      return live(ctx.model?.captures ?? []).some(c => c.levelId === ctx.levelId);
    case "review":
      return stepDone("label", ctx) && labelsWaiting(ctx) === 0;
    case "floorplan":
      return floorplanGap(ctx) === null;
    default:
      return false;
  }
}

/** Done: stored as done or skipped (finish_step, Mark done, Skip), or done on the map. */
export function stepDone(step: SetupStepId, ctx: StepContext): boolean {
  return stored(ctx, step) || autoDone(step, ctx);
}

/** The bottom bar's one-line warning while a step isn't done; null once it is. */
export function notDoneLine(step: SetupStepId, ctx: StepContext): string | null {
  if (stepDone(step, ctx)) return null;
  switch (step) {
    case "footage":
      return `No footage is filed under ${ctx.levelCode} yet.`;
    case "label":
      return "Claude hasn't finished labelling yet.";
    case "review": {
      if (!stepDone("label", ctx)) {
        // Frames tagged: Claude has begun, and stopped or is still at it.
        return (ctx.setup?.counts.label.tagged ?? 0) > 0
          ? "Claude hasn't finished labelling yet."
          : "Claude hasn't labelled the survey yet.";
      }
      const n = labelsWaiting(ctx);
      return n === 1 ? "1 label is waiting for you." : `${n} labels are waiting for you.`;
    }
    case "floorplan":
      return floorplanGap(ctx);
    case "rooms":
      return "Claude hasn't finished the rooms yet.";
    case "things":
      return "Claude hasn't finished places and objects yet.";
    case "paths":
      return "Claude hasn't finished the pathways yet.";
    case "check":
      return "Press Looks right once you've checked Claude's work.";
    case "finish":
      return "Press Finish setup to hand the floor over.";
  }
}

/** The number, 1 to 9, of the first step not done; 9 when all are. */
export function firstOpenStep(ctx: StepContext): number {
  const i = SETUP_STEP_IDS.findIndex(step => !stepDone(step, ctx));
  return i < 0 ? STEP_COUNT : i + 1;
}

/** The numbers of the steps before Finish not done or skipped yet: Finish says the floor is set up only with none. */
export function stepsLeft(ctx: StepContext): number[] {
  return SETUP_STEP_IDS.filter(step => step !== "finish" && !stepDone(step, ctx)).map(stepNumber);
}

/** Whether anyone has started this floor's setup: something is stored. */
export function setupStarted(setup: SetupState | null): boolean {
  return setup?.steps.some(s => s.status !== "open") ?? false;
}

export function setupFinished(setup: SetupState | null): boolean {
  return storedState(setup, "finish")?.status === "done";
}

/**
 * When this run of the setup began: when Add footage was stored done, which
 * the wizard does the first time it shows a later step (SetupWizard). The
 * check lists Claude's changes from then (spec §8: "since the wizard's step 2
 * began"). Set up again opens every step, so a second run starts afresh.
 *
 * A stamp that failed is tried again at the next step, so it can land after
 * Claude has finished a step: it would then leave that work out of the
 * check. A stamp later than any other step's finish is no start, and the
 * check asks for every change there is.
 */
export function setupSince(setup: SetupState | null): string | null {
  const start = storedState(setup, "footage")?.finishedAt ?? null;
  if (!start || !setup) return start;
  const late = setup.steps.some(s =>
    s.step !== "footage" && s.status !== "open" && s.finishedAt !== null && Date.parse(s.finishedAt) < Date.parse(start));
  return late ? null : start;
}

/** The since the server is sent: the run's start, or every change there is. */
export function sinceParam(setup: SetupState | null): string {
  return setupSince(setup) ?? EPOCH;
}

/** A Claude step's live counts (spec §4.3), as a label and a number each: null for one not known, shown as a dash. */
export function countRows(step: SetupStepId, counts: SetupCounts): { label: string; value: number | null }[] {
  switch (step) {
    case "label":
      return [
        { label: "Frames tagged", value: counts.label.tagged },
        { label: "Frames binned", value: counts.label.binned },
        { label: "Frames left", value: counts.label.left },
      ];
    case "rooms":
      return [
        { label: "Drafts waiting", value: counts.rooms.waiting },
        { label: "Made rooms", value: counts.rooms.accepted },
        { label: "Set aside for you", value: counts.rooms.setAside },
        { label: "Rejected", value: counts.rooms.rejected },
        { label: "Stops made", value: counts.rooms.stops },
      ];
    case "things":
      return [
        { label: "Places bound", value: counts.things.bound },
        { label: "Places not bound yet", value: counts.things.unbound },
        ...(counts.things.objects.length === 0
          ? [{ label: "Objects placed", value: 0 }]
          : counts.things.objects.map(o => ({ label: `Objects placed: ${o.name}`, value: o.count }))),
      ];
    case "paths":
      return [
        { label: "Pathways", value: counts.paths.pathways },
        { label: "Entrances", value: counts.paths.entrances },
        { label: "Rooms no route reaches", value: counts.paths.unreachable },
      ];
    default:
      return [];
  }
}

/** A fingerprint of the counts: a Claude step reloads the map when it changes. */
export function countsKey(counts: SetupCounts): string {
  return JSON.stringify(counts);
}

/** "Done by Claude, 5 minutes ago": who finished a step, and when. Null while it is open. */
export function doneLine(state: SetupStepState | null, team: readonly TeamMember[], now = Date.now()): string | null {
  if (!state || state.status === "open") return null;
  const who = state.finishedVia ? "Claude" : team.find(m => m.id === state.finishedBy)?.displayName ?? "a teammate";
  const when = state.finishedAt ? `, ${relativeTime(state.finishedAt, now)}` : "";
  return `${state.status === "skipped" ? "Skipped" : "Done"} by ${who}${when}`;
}

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** What a Claude step's counts still show undone, as words: "13 places not bound". Null for none, or not known. */
export function workLeft(step: SetupStepId, counts: SetupCounts): string | null {
  switch (step) {
    case "label":
      return counts.label.left > 0 ? `${count(counts.label.left, "frame", "frames")} left` : null;
    case "rooms":
      return counts.rooms.waiting > 0 ? `${count(counts.rooms.waiting, "draft", "drafts")} waiting` : null;
    case "things":
      return counts.things.unbound > 0 ? `${count(counts.things.unbound, "place", "places")} not bound` : null;
    case "paths": {
      const n = counts.paths.unreachable;
      return n ? count(n, "room no route reaches", "rooms no route reaches") : null;
    }
    default:
      return null;
  }
}

/**
 * "Claude stopped with 13 places not bound, 5 minutes ago: <its note>": what
 * a step Claude finished still shows undone, as a warning in place of Done.
 * Null unless Claude finished it (finish_step) and the counts show work left.
 */
export function stoppedLine(state: SetupStepState | null, counts: SetupCounts, now = Date.now()): string | null {
  if (!state || state.status !== "done" || !state.finishedVia) return null;
  const left = workLeft(state.step, counts);
  if (!left) return null;
  const when = state.finishedAt ? `, ${relativeTime(state.finishedAt, now)}` : "";
  return `Claude stopped with ${left}${when}${state.note ? `: ${state.note}` : ""}`;
}

/**
 * Whether a Claude step's own counts have not finished loading their full
 * number yet. Only the paths step's `unreachable` has this: the light setup
 * the Floors home and Review leave in the store gives it as null, where every
 * other count is at worst a real zero. Neither a green tick nor a warning can
 * be shown truthfully from a count that isn't there yet.
 */
export function countsPending(step: SetupStepId, counts: SetupCounts): boolean {
  return step === "paths" && counts.paths.unreachable === null;
}

export type SetupLink = { label: string; to: string; restart: boolean };

/** The Floors home card's way into the wizard (spec §4.2). */
export function cardLink(ctx: StepContext): SetupLink {
  const at = (step?: number) => href({ name: "setup", code: ctx.levelCode, step, params: {} });
  if (setupFinished(ctx.setup)) return { label: "Set up again", to: at(1), restart: true };
  if (setupStarted(ctx.setup)) {
    const n = firstOpenStep(ctx);
    return { label: `Continue: step ${n} of ${STEP_COUNT}`, to: at(n), restart: false };
  }
  return { label: `Set up ${ctx.levelCode}`, to: at(), restart: false };
}
