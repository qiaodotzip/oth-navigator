import type { MapModel, Place, Sighting } from "@oth/model";

export type ProposedPlace = {
  place: Place;
  sightings: Sighting[];
};

/** The model's own soft-delete convention, narrowed to what this file needs. */
const live = <T extends { deletedAt?: string | null }>(xs: readonly T[]): T[] =>
  xs.filter(x => !x.deletedAt);

/**
 * What is waiting for a human.
 *
 * A labelling agent's output is a queue of claims, not facts. Each one comes
 * with the frames it was read from, because the only way to judge "is that
 * really what the sign said" is to look at the picture.
 */
export function proposedPlaces(model: MapModel | null): ProposedPlace[] {
  if (!model) return [];
  const sightings = live(model.sightings);
  return live(model.places)
    .filter(p => p.status === "proposed")
    .map(place => ({ place, sightings: sightings.filter(s => s.placeId === place.id) }))
    // Most-evidenced first: a name seen in nine frames is worth settling before
    // one seen once, because confirming it clears nine frames of the queue.
    .sort((a, b) => b.sightings.length - a.sightings.length);
}

/** How much of the queue is left, for a panel that would otherwise just look empty. */
export function reviewProgress(model: MapModel | null): { proposed: number; confirmed: number } {
  if (!model) return { proposed: 0, confirmed: 0 };
  const places: Place[] = live(model.places);
  return {
    proposed: places.filter(p => p.status === "proposed").length,
    confirmed: places.filter(p => p.status === "confirmed").length,
  };
}
