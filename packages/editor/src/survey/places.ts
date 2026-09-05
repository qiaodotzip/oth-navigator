import type { Place } from "@oth/model";

/**
 * Autocomplete over the places already named.
 *
 * The single most important interaction in the tool: naming is the slow step,
 * and without this the seventh NTUC sighting makes a seventh NTUC rather than
 * linking to the one that exists.
 */
export function matchPlaces(places: readonly Place[], query: string): Place[] {
  const q = query.trim().toLowerCase();
  if (q === "") return [...places];

  const hits = places.filter(
    p => p.nameEn.toLowerCase().includes(q) || p.nameZh.toLowerCase().includes(q),
  );

  // A prefix match is nearly always the one meant, so it goes first.
  return hits.sort((a, b) => {
    const ap = a.nameEn.toLowerCase().startsWith(q) ? 0 : 1;
    const bp = b.nameEn.toLowerCase().startsWith(q) ? 0 : 1;
    return ap - bp || a.nameEn.localeCompare(b.nameEn);
  });
}

/** How many times each place has been sighted, for the places list. */
export function sightingCounts(sightings: readonly { placeId: string }[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const s of sightings) counts.set(s.placeId, (counts.get(s.placeId) ?? 0) + 1);
  return counts;
}
