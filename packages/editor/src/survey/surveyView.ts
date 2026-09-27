import { live, type Capture, type Keyframe, type MapModel, type Place } from "@oth/model";
import {
  SURVEY_FILTERS, filterCounts, frameStatuses, matchesFilter, statusOf,
  type FrameStatus, type SurveyFilter,
} from "./frameStatus";
import { orderFrames } from "./frames";

export type SurveyParams = {
  capture: string | null;
  frame: string | null;
  view: "frame" | "grid";
  filter: SurveyFilter;
  /** A place chosen in the side panel: only the frames it was seen in. */
  place: string | null;
};

/** The address, read leniently: anything unknown is the default, never a blank screen (spec §5.1). */
export function readSurveyParams(params: Record<string, string>): SurveyParams {
  const filter = (SURVEY_FILTERS as readonly string[]).includes(params.filter ?? "")
    ? (params.filter as SurveyFilter)
    : "all";
  return {
    capture: params.capture || null,
    frame: params.frame || null,
    view: params.view === "grid" ? "grid" : "frame",
    filter,
    place: params.place || null,
  };
}

export type SurveyView = {
  /** Footage filed under this floor, by name. */
  captures: Capture[];
  /** Footage filed under no floor yet: offered for filing, not for tagging. */
  unfiled: Capture[];
  capture: Capture | null;
  /** The capture's frames, on its timeline. */
  frames: Keyframe[];
  statuses: Map<string, FrameStatus>;
  counts: Record<SurveyFilter, number>;
  /** What the filter lets through — plus the frame in view, even once it no longer matches. */
  shown: Keyframe[];
  frame: Keyframe | null;
  /** The frame's position in `frames`, from 0; -1 with no frame. */
  index: number;
  /** The place filter, when it names a place that exists. */
  place: Place | null;
};

/**
 * Everything the survey shows for one floor and one address.
 *
 * With no frame asked for, it opens on the first frame the filter lets through
 * that has no tag — the next piece of work — or else the first it lets
 * through. The frame in view stays in `shown` after it is tagged, so tagging
 * it does not make it vanish from under you; the arrow keys then move on.
 */
export function surveyView(model: MapModel | null, levelId: string, params: SurveyParams): SurveyView {
  const statuses = frameStatuses(model);
  if (!model) {
    return {
      captures: [], unfiled: [], capture: null, frames: [], statuses,
      counts: filterCounts([], statuses), shown: [], frame: null, index: -1, place: null,
    };
  }

  const footage = live(model.captures);
  const captures = footage.filter(c => c.levelId === levelId).sort((a, b) => a.filename.localeCompare(b.filename));
  const unfiled = footage.filter(c => !c.levelId);
  const asked = params.frame ? live(model.keyframes).find(k => k.id === params.frame) : undefined;
  const capture =
    captures.find(c => c.id === params.capture) ??
    captures.find(c => c.id === asked?.captureId) ??
    captures[0] ??
    null;

  const frames = capture ? orderFrames(live(model.keyframes).filter(k => k.captureId === capture.id)) : [];
  const counts = filterCounts(frames.map(f => f.id), statuses);
  const place = (params.place && live(model.places).find(p => p.id === params.place)) || null;
  const seenIn = place
    ? new Set(live(model.sightings).filter(s => s.placeId === place.id).map(s => s.keyframeId))
    : null;
  const passes = (f: Keyframe) =>
    seenIn ? seenIn.has(f.id) : matchesFilter(statusOf(statuses, f.id), params.filter);

  const frame =
    frames.find(f => f.id === params.frame) ??
    frames.find(f => passes(f) && statusOf(statuses, f.id) === "untagged") ??
    frames.find(passes) ??
    null;
  const shown = frames.filter(f => passes(f) || f.id === frame?.id);

  return {
    captures, unfiled, capture, frames, statuses, counts, shown, frame,
    index: frame ? frames.indexOf(frame) : -1,
    place,
  };
}

/**
 * The next or previous frame the filter lets through, from where you are —
 * which may itself no longer match, having just been tagged. Stops at the
 * ends: wrapping would jump from the end of the walkthrough to its start
 * without saying so.
 */
export function stepFrame(view: SurveyView, direction: 1 | -1): Keyframe | null {
  if (!view.frame) return view.shown[0] ?? null;
  const at = view.shown.findIndex(f => f.id === view.frame!.id);
  return view.shown[at + direction] ?? null;
}

/** N: the next frame with no tag after this one, wrapping once to the start; null when there is none. */
export function nextUntagged(view: SurveyView): Keyframe | null {
  const n = view.frames.length;
  for (let k = 1; k <= n; k++) {
    const f = view.frames[(view.index + k + n) % n]!;
    if (f.id !== view.frame?.id && statusOf(view.statuses, f.id) === "untagged") return f;
  }
  return null;
}

/** `424000` → `"7m04s"`, as the top row shows a moment. */
export function frameTime(timeMs: number): string {
  const total = Math.max(0, Math.floor(timeMs / 1000));
  return `${Math.floor(total / 60)}m${String(total % 60).padStart(2, "0")}s`;
}
