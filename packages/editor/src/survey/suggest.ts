import type { Place } from "@oth/model";
import { matchPlaces } from "./places";

/** Names compared the way people mean them: case, inner spacing and the ends ignored. */
export function normalName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * The places a tag on one floor may link to: that floor's, and those with no
 * floor yet. Another floor's "Toilets" is a different place, and linking to it
 * would put L2's toilets in L1's footage.
 */
export function linkablePlaces(
  places: readonly Place[], levels: ReadonlyMap<string, string | undefined>, levelId: string,
): Place[] {
  return places.filter(p => {
    const on = levels.get(p.id);
    return on === levelId || on === undefined;
  });
}

export type Suggestion = { place: Place; count: number; onFloor: boolean };

/** The name field's suggestions (spec §9): this floor's places first, then those on no floor, each with its sighting count. */
export function suggestPlaces(
  candidates: readonly Place[],
  levels: ReadonlyMap<string, string | undefined>,
  levelId: string,
  query: string,
  counts: ReadonlyMap<string, number>,
): Suggestion[] {
  const matched = matchPlaces(candidates, query);
  const ordered = query.trim() === "" ? [...matched].sort((a, b) => a.nameEn.localeCompare(b.nameEn)) : matched;
  const onFloor = (p: Place) => levels.get(p.id) === levelId;
  return [...ordered.filter(onFloor), ...ordered.filter(p => !onFloor(p))]
    .map(place => ({ place, count: counts.get(place.id) ?? 0, onFloor: onFloor(place) }));
}

/** The place a typed name means: this floor's first, then one with no floor. Null for a new name. */
export function exactPlace(
  candidates: readonly Place[], levels: ReadonlyMap<string, string | undefined>, levelId: string, name: string,
): Place | null {
  const wanted = normalName(name);
  if (wanted === "") return null;
  const same = candidates.filter(p => normalName(p.nameEn) === wanted);
  return same.find(p => levels.get(p.id) === levelId) ?? same[0] ?? null;
}
