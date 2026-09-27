import { live, type MapModel } from "@oth/model";

/** Where a frame stands, as its stripe and the filters say it. */
export type FrameStatus = "untagged" | "proposed" | "tagged";

export type SurveyFilter = "all" | FrameStatus;
export const SURVEY_FILTERS: readonly SurveyFilter[] = ["all", "untagged", "proposed", "tagged"];

/**
 * Every frame's status, in one pass (spec §5.3): Untagged — no sighting;
 * Proposed — at least one proposed sighting; Tagged — at least one sighting,
 * all confirmed. A tag of a deleted place counts for nothing, as everywhere
 * else. A frame nobody tagged is simply absent.
 */
export function frameStatuses(model: MapModel | null): Map<string, FrameStatus> {
  const out = new Map<string, FrameStatus>();
  if (!model) return out;
  const places = new Set(live(model.places).map(p => p.id));
  for (const s of live(model.sightings)) {
    if (!places.has(s.placeId)) continue;
    if (s.status === "proposed") out.set(s.keyframeId, "proposed");
    else if (!out.has(s.keyframeId)) out.set(s.keyframeId, "tagged");
  }
  return out;
}

export function statusOf(statuses: ReadonlyMap<string, FrameStatus>, frameId: string): FrameStatus {
  return statuses.get(frameId) ?? "untagged";
}

export function matchesFilter(status: FrameStatus, filter: SurveyFilter): boolean {
  return filter === "all" || status === filter;
}

/** The numbers on the filter chips, over one set of frames. */
export function filterCounts(
  frameIds: readonly string[], statuses: ReadonlyMap<string, FrameStatus>,
): Record<SurveyFilter, number> {
  const counts: Record<SurveyFilter, number> = { all: frameIds.length, untagged: 0, proposed: 0, tagged: 0 };
  for (const id of frameIds) counts[statusOf(statuses, id)] += 1;
  return counts;
}
