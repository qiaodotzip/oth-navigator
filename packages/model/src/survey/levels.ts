import { live } from "../primitives";
import type { MapModel } from "../schema/model";
import type { Place } from "../schema/survey";

/**
 * The floor each place is on.
 *
 * A place's own levelId when it has one. Otherwise the floor of the footage it
 * was seen in: most of the survey was labelled before places carried a level,
 * and the frames already know where they were filmed. When its sightings
 * disagree, the floor it was seen on most wins; a tie goes to the lower floor,
 * so the answer does not change between reloads.
 */
export function placeLevels(model: MapModel): Map<string, string | undefined> {
  const captureLevel = new Map(live(model.captures).map(c => [c.id, c.levelId]));
  const frameLevel = new Map(live(model.keyframes).map(k => [k.id, captureLevel.get(k.captureId)]));
  const ordinal = new Map(model.levels.map(l => [l.id, l.ordinal]));

  const counts = new Map<string, Map<string, number>>();
  for (const s of live(model.sightings)) {
    const level = frameLevel.get(s.keyframeId);
    if (!level) continue;
    const perPlace = counts.get(s.placeId) ?? new Map<string, number>();
    perPlace.set(level, (perPlace.get(level) ?? 0) + 1);
    counts.set(s.placeId, perPlace);
  }

  const result = new Map<string, string | undefined>();
  for (const place of live(model.places)) {
    if (place.levelId) {
      result.set(place.id, place.levelId);
      continue;
    }
    const best = [...(counts.get(place.id) ?? new Map<string, number>()).entries()]
      .sort((a, b) => b[1] - a[1] || (ordinal.get(a[0]) ?? 0) - (ordinal.get(b[0]) ?? 0))[0];
    result.set(place.id, best?.[0]);
  }
  return result;
}

/** One place's floor. For many places, placeLevels answers them all in one pass. */
export function placeLevel(model: MapModel, place: Place): string | undefined {
  return placeLevels(model).get(place.id) ?? place.levelId;
}
