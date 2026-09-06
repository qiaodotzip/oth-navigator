import type { MapModel, Place, Sighting } from "@oth/model";

export type FrameLabel = { sighting: Sighting; place: Place };

const live = <T extends { deletedAt?: string | null }>(xs: readonly T[]): T[] =>
  xs.filter(x => !x.deletedAt);

/** What has been said about one frame, with the place each label points at. */
export function labelsForFrame(model: MapModel | null, keyframeId: string): FrameLabel[] {
  if (!model) return [];
  const places = new Map(live(model.places).map(p => [p.id, p]));
  return live(model.sightings)
    .filter(s => s.keyframeId === keyframeId)
    .flatMap(s => {
      const place = places.get(s.placeId);
      return place ? [{ sighting: s, place }] : [];
    });
}

/**
 * How many labels each frame carries.
 *
 * The filmstrip needs this to show what has been covered: with hundreds of
 * frames, "which of these have I done" is otherwise unanswerable, and someone
 * ends up labelling the same stretch twice while another goes untouched.
 */
export function labelCounts(model: MapModel | null): Map<string, number> {
  const counts = new Map<string, number>();
  if (!model) return counts;
  const places = new Set(live(model.places).map(p => p.id));
  for (const s of live(model.sightings)) {
    if (!places.has(s.placeId)) continue;
    counts.set(s.keyframeId, (counts.get(s.keyframeId) ?? 0) + 1);
  }
  return counts;
}
