import { isNull } from "drizzle-orm";
import type { Database } from "../db/client";
import { softDeleteEntity, updateEntity } from "../entities/repository";
import { places, sightings } from "../db/schema";

/**
 * What to do about one labelled place, and why.
 *
 * The labelling pass named everything it could see, which is the right
 * instinct for evidence and the wrong one for a map: a map carries what will
 * still be there next month. This list is the second pass, written out so it
 * can be argued with instead of disappearing into a migration.
 */
export type TidyDecision = {
  /** Matched case-insensitively against `place.nameEn`. */
  name: string;
  action: TidyAction;
  reason: string;
};

export type TidyAction =
  /** Soft-delete it: temporary, or never a place to begin with. */
  | "remove"
  /**
   * A level-to-level connection. It keeps its facility identity and loses any
   * walkway kind, because a pathway is a walkable line on one floor and this
   * is not one — it belongs to the map as a `portal`, which already carries
   * `kind: "escalator" | "stair"` and step-free routing.
   */
  | "portal";

export const TIDY_DECISIONS: TidyDecision[] = [
  // --- Vertical circulation: portals, not walkways ------------------------
  { name: "Escalator (Festive Mall)", action: "portal", reason: "escalator" },
  { name: "Escalator (Gate 1 forecourt)", action: "portal", reason: "escalator" },
  { name: "Escalator (Gate 6 concourse)", action: "portal", reason: "escalator" },
  { name: "Escalator (Lobby J concourse)", action: "portal", reason: "escalator" },
  { name: "Escalator (hawker centre)", action: "portal", reason: "escalator" },
  { name: "Staircase (arena concourse)", action: "portal", reason: "stair" },
  { name: "E-Lobby", action: "portal", reason: "escalator lobby" },
  // Tagged as walkways by hand during review. Both are real, and both climb:
  // the walkway kind comes off, the thing stays, named for where it goes.
  { name: "stairs to starbucks", action: "portal", reason: "stair, up to Starbucks" },
  { name: "escalator to library", action: "portal", reason: "escalator, up to the library" },

  // --- Events, and the signage that only exists for them ------------------
  { name: "Carnival (event)", action: "remove", reason: "event: a carnival, gone with it" },
  { name: "Cyberscape Adventure (event standee)", action: "remove", reason: "event standee" },
  { name: "Event stage (arena concourse)", action: "remove", reason: "staging, put up per event" },
  { name: "National Day event stage", action: "remove", reason: "staging, put up per event" },
  { name: "Festive Plaza exhibition", action: "remove", reason: "exhibition, rotates" },
  { name: "Happy Birthday Singapore display", action: "remove", reason: "dated display" },
  { name: "Grand Opening photo wall", action: "remove", reason: "dated display" },
  { name: "K-pop record display", action: "remove", reason: "a shop's stock, not a place" },
  { name: "Festive Walk poster wall", action: "remove", reason: "posters change; the wall is not a destination" },
  { name: "Festive Arts Theatre display board", action: "remove", reason: "what's-on board for current shows" },
  { name: "OTH programmes display", action: "remove", reason: "what's-on board for current programmes" },

  // --- Fairground rides: brought in, taken away ---------------------------
  { name: "Double Storey Carousel", action: "remove", reason: "fairground ride, trucked in" },
  { name: "Fairground ride (Town Square)", action: "remove", reason: "fairground ride, trucked in" },
  { name: "Children's ride (Festive Plaza)", action: "remove", reason: "coin-op ride, moved about" },
  { name: "Children's ride (Festive Walk)", action: "remove", reason: "coin-op ride, moved about" },

  // --- Booths and pop-ups -------------------------------------------------
  { name: "Custom shop (Festive Walk)", action: "remove", reason: "roadshow booth in the walkway" },
  { name: "Mall food kiosk (Festive Mall)", action: "remove", reason: "pop-up kiosk, unnamed" },
  { name: "Bakery (Festive Mall)", action: "remove", reason: "pop-up kiosk, unnamed" },
  { name: "Crowd barrier store", action: "remove", reason: "barriers parked for an event" },

  // --- Never a place ------------------------------------------------------
  { name: "Customers", action: "remove", reason: "people; my labelling mistake" },
];

export type TidyResult = {
  removed: { name: string; sightings: number }[];
  portals: { name: string; wasWalkway: boolean }[];
  /** Already removed by an earlier run. Not a problem; not news either. */
  alreadyDone: string[];
  /**
   * Named in the list and nowhere in the model at all — renamed since, or a
   * typo in the list. Worth reading, unlike the line above.
   */
  missing: string[];
  /**
   * Still tagged as a walkway, and named like something that climbs. The list
   * above is hand-written, so anything labelled after it was written would
   * otherwise pass silently — this is the part that refuses to be silent.
   */
  suspects: string[];
};

/** Names that mean vertical circulation, whatever the labeller called it. */
const CLIMBS = /escalator|escalador|travelator|stair|staircase|lift|elevator/i;

/**
 * Applies the decisions above, once, and says exactly what it did.
 *
 * `dryRun` reads and reports without writing, which is the way to look at
 * somebody else's data before changing it.
 *
 * Removals are soft deletes with an audit entry, so a wrong call here is one
 * `deletedAt` away from being undone rather than a re-label of 446 frames.
 */
export async function tidySurvey(
  db: Database, { actorId = "cli:tidy", dryRun = false } = {},
): Promise<TidyResult> {
  const all = await db.select().from(places);
  const rows = all.filter(p => p.deletedAt == null);
  const byName = new Map(rows.map(p => [p.nameEn.trim().toLowerCase(), p]));
  const gone = new Set(all.filter(p => p.deletedAt != null).map(p => p.nameEn.trim().toLowerCase()));
  const counts = new Map<string, number>();
  for (const s of await db.select().from(sightings).where(isNull(sightings.deletedAt))) {
    counts.set(s.placeId, (counts.get(s.placeId) ?? 0) + 1);
  }

  const result: TidyResult = { removed: [], portals: [], alreadyDone: [], missing: [], suspects: [] };
  const listed = new Set(TIDY_DECISIONS.map(d => d.name.trim().toLowerCase()));
  for (const p of rows) {
    if (p.pathwayKindId != null && CLIMBS.test(p.nameEn) && !listed.has(p.nameEn.trim().toLowerCase())) {
      result.suspects.push(p.nameEn);
    }
  }
  const done = new Set<string>();

  for (const decision of TIDY_DECISIONS) {
    const key = decision.name.trim().toLowerCase();
    if (done.has(key)) continue;
    const place = byName.get(key);
    if (!place) {
      (gone.has(key) ? result.alreadyDone : result.missing).push(decision.name);
      continue;
    }
    done.add(key);

    if (decision.action === "remove") {
      // The sightings stay: they are the evidence that this was here on the
      // day, which is worth keeping even once the thing is not on the map.
      if (!dryRun) await softDeleteEntity(db, "place", place.id, place.version, actorId);
      result.removed.push({ name: place.nameEn, sightings: counts.get(place.id) ?? 0 });
      continue;
    }

    const wasWalkway = place.pathwayKindId != null;
    const note = `portal: ${decision.reason}`;
    // Already decided on an earlier run. Writing it again would bump the
    // version and add an audit entry saying nothing changed.
    if (!wasWalkway && place.category === "facility" && place.notes.includes(note)) continue;

    if (!dryRun) await updateEntity(db, "place", place.id, place.version, {
      pathwayKindId: null,
      category: "facility",
      notes: withNote(place.notes, note),
    } as never, actorId);
    result.portals.push({ name: place.nameEn, wasWalkway });
  }

  return result;
}

/** Appends a note without repeating it on a second run. */
export function withNote(notes: string, note: string): string {
  if (notes.includes(note)) return notes;
  return notes ? `${notes} — ${note}` : note;
}
