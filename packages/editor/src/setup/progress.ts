import { live, type MapModel } from "@oth/model";
import type { LevelImage, TeamMember } from "../api/client";
import { waitingReview } from "../flow/floorProgress";
import { href } from "../route";
import { imageForLevel } from "../state/underlay";
import { relativeTime } from "../ui/relativeTime";
import { STEP_COUNT } from "./steps";
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
 * whose evidence is its PDF.
 */
function roomsFound(ctx: StepContext): boolean {
  const r = ctx.setup?.counts.rooms;
  if (r && r.waiting + r.accepted + r.rejectedOrSetAside > 0) return true;
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
  return null;
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
      return stepDone("label", ctx) && waitingReview(ctx.model, ctx.levelId) === 0;
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
      if (!stepDone("label", ctx)) return "Claude hasn't labelled the survey yet.";
      const n = waitingReview(ctx.model, ctx.levelId);
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
 */
export function setupSince(setup: SetupState | null): string | null {
  return storedState(setup, "footage")?.finishedAt ?? null;
}

/** The since the server is sent: the run's start, or every change there is. */
export function sinceParam(setup: SetupState | null): string {
  return setupSince(setup) ?? EPOCH;
}

/** A Claude step's live counts (spec §4.3), as a label and a number each. */
export function countRows(step: SetupStepId, counts: SetupCounts): { label: string; value: number }[] {
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
        { label: "Rejected or set aside", value: counts.rooms.rejectedOrSetAside },
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
        { label: "Rooms with a door but no route", value: counts.paths.unreachable },
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
