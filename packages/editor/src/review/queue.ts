import { live, placeLevels, type Keyframe, type MapModel, type Place, type Sighting } from "@oth/model";
import { proposedPlaces, type ProposedPlace } from "../survey/review";
import { normalName } from "../survey/suggest";

export type ReviewScope = "floor" | "floorless";
export type ReviewParams = { place: string | null; listOpen: boolean; scope: ReviewScope };

/** The address, read leniently (spec §5.1: `?place=&list=open`). */
export function readReviewParams(params: Record<string, string>): ReviewParams {
  return {
    place: params.place || null,
    listOpen: params.list === "open",
    scope: params.scope === "floorless" ? "floorless" : "floor",
  };
}

/**
 * The proposals to decide on one floor, most-evidenced first — a name seen in
 * nine frames settles nine frames. A proposal is on the floor its frames were
 * filmed on (`placeLevel`). The "floorless" scope holds the ones on no floor
 * at all, which no floor's queue would otherwise ever show.
 */
export function reviewQueue(model: MapModel | null, levelId: string, scope: ReviewScope = "floor"): ProposedPlace[] {
  if (!model) return [];
  const levels = placeLevels(model);
  return proposedPlaces(model).filter(({ place }) => {
    const on = levels.get(place.id);
    return scope === "floor" ? on === levelId : on === undefined;
  });
}

export function floorlessProposals(model: MapModel | null): ProposedPlace[] {
  return reviewQueue(model, "", "floorless");
}

/**
 * The proposal the address asks for, or the first still waiting — the one
 * asked for may have been decided since.
 *
 * `decided` holds every proposal decided, or still being decided, whose
 * reload has not landed: the queue still lists them, and showing one again
 * would let a second A decide it twice — a 409 blamed on a teammate. A
 * decision that fails leaves the set, and so comes back into view.
 */
export function currentProposal(
  queue: readonly ProposedPlace[], placeId: string | null, decided: ReadonlySet<string>,
): ProposedPlace | null {
  const waiting = queue.filter(q => !decided.has(q.place.id));
  return waiting.find(q => q.place.id === placeId) ?? waiting[0] ?? null;
}

/**
 * What comes after `currentId` once it is decided or skipped: the next one
 * still waiting, wrapping to the start past any in `decided`; null when
 * nothing else is.
 */
export function nextProposal(
  queue: readonly ProposedPlace[], currentId: string, decided: ReadonlySet<string>,
): ProposedPlace | null {
  const i = queue.findIndex(q => q.place.id === currentId);
  const rest = i < 0 ? [...queue] : [...queue.slice(i + 1), ...queue.slice(0, i)];
  return rest.find(q => !decided.has(q.place.id)) ?? null;
}

/**
 * "Same as…" (spec §10): confirmed places on this floor with the name being
 * decided, however it is spaced or cased. Merging into one of them beats a
 * duplicate. Another floor's place of the same name is a different place.
 */
export function sameAs(model: MapModel, levelId: string, proposal: Place, name: string): Place[] {
  const wanted = normalName(name);
  if (wanted === "") return [];
  const levels = placeLevels(model);
  return live(model.places).filter(p =>
    p.id !== proposal.id &&
    p.status === "confirmed" &&
    levels.get(p.id) === levelId &&
    normalName(p.nameEn) === wanted);
}

export type Evidence = { sighting: Sighting; frame: Keyframe };

/**
 * The frames a proposal was read from, on their timeline. A tag whose frame is
 * gone shows nothing, and a proposal with no frame at all — there are real
 * ones — gets an empty list, never a broken image.
 */
export function evidenceFor(model: MapModel, sightings: readonly Sighting[]): Evidence[] {
  const frames = new Map(live(model.keyframes).map(k => [k.id, k]));
  return sightings
    .flatMap(sighting => {
      const frame = frames.get(sighting.keyframeId);
      return frame ? [{ sighting, frame }] : [];
    })
    .sort((a, b) => (a.frame.timeMs ?? 0) - (b.frame.timeMs ?? 0));
}
