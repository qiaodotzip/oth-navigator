import { live } from "../primitives";
import type { MapModel } from "../schema/model";

/** An unordered pair of place ids, normalised so a pair is its own key. */
export type Pair = { a: string; b: string };

const pair = (x: string, y: string): Pair => (x < y ? { a: x, b: y } : { a: y, b: x });

function dedupe(pairs: Pair[]): Pair[] {
  const seen = new Map<string, Pair>();
  for (const p of pairs) if (p.a !== p.b) seen.set(`${p.a} ${p.b}`, p);
  return [...seen.values()];
}

/**
 * Places seen in the same frame.
 *
 * You can see both at once, so they are near each other and facing the same
 * space — the strongest adjacency signal the footage carries.
 */
export function coVisiblePairs(model: MapModel): Pair[] {
  const byFrame = new Map<string, string[]>();
  for (const s of live(model.sightings)) {
    byFrame.set(s.keyframeId, [...(byFrame.get(s.keyframeId) ?? []), s.placeId]);
  }

  const out: Pair[] = [];
  for (const places of byFrame.values()) {
    for (let i = 0; i < places.length; i++) {
      for (let j = i + 1; j < places.length; j++) out.push(pair(places[i]!, places[j]!));
    }
  }
  return dedupe(out);
}

/**
 * Places in consecutive frames of one capture.
 *
 * Weaker than co-visibility as evidence of adjacency, but it says something
 * co-visibility cannot: a walkable route exists between them, because a person
 * walked it while filming.
 */
export function sequentialPairs(model: MapModel): Pair[] {
  const frames = live(model.keyframes);
  const sightings = live(model.sightings);

  const byCapture = new Map<string, typeof frames>();
  for (const f of frames) {
    byCapture.set(f.captureId, [...(byCapture.get(f.captureId) ?? []), f]);
  }

  const placesIn = (keyframeId: string) =>
    sightings.filter(s => s.keyframeId === keyframeId).map(s => s.placeId);

  const out: Pair[] = [];
  for (const group of byCapture.values()) {
    // Frames are grabbed out of order the moment anyone scrubs backwards, so
    // the timeline is the order — not the sequence they were inserted in.
    const ordered = [...group].sort((x, y) => (x.timeMs ?? 0) - (y.timeMs ?? 0));
    for (let i = 0; i + 1 < ordered.length; i++) {
      for (const a of placesIn(ordered[i]!.id)) {
        for (const b of placesIn(ordered[i + 1]!.id)) out.push(pair(a, b));
      }
    }
  }
  return dedupe(out);
}
