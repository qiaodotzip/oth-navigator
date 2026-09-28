import { OBJECT_SIZE_GUESS, type Box, type ObjectKind, type Place, type TenantCategory } from "@oth/model";
import { normalName } from "./suggest";

export type Tag = {
  /** An existing place, or null when the name is new. */
  placeId: string | null;
  nameEn: string;
  category: TenantCategory;
  /** Set when what was boxed is a walkway rather than a unit. */
  pathwayKindId?: string;
  /**
   * Set when what was tagged is an object (spec §5.1): a wastebin, a water
   * cooler. Its place stands for the object's kind, as a walkway's place
   * stands for a stretch of floor.
   */
  object?: boolean;
  box?: Box;
};

export type TagWrites = {
  /** A new kind of object, when no kind has this name yet. */
  objectKind: Record<string, unknown> | null;
  place: Record<string, unknown> | null;
  /** A place already surveyed that this tag says is an object: it becomes the kind's place. */
  makeObject: { placeId: string; objectKindId: string } | null;
  sighting: Record<string, unknown>;
};

/** What the server has now, so a tag reuses a place or a kind rather than making it again. */
export type Known = { places: readonly Place[]; kinds: readonly ObjectKind[] };

const NOTHING_KNOWN: Known = { places: [], kinds: [] };

/**
 * An id the server accepts (letters, digits, underscore) that nothing else
 * has: the time, and a little randomness for two made in one millisecond —
 * a place and its first sighting are.
 */
export function newId(prefix: string, now = Date.now(), random: () => number = Math.random): string {
  return `${prefix}_${now.toString(36)}${random().toString(36).slice(2, 8)}`;
}

/** The kind a name means, as place names are matched: case, inner spacing and the ends ignored. */
export function kindNamed(kinds: readonly ObjectKind[], name: string): ObjectKind | undefined {
  const wanted = normalName(name);
  return wanted === "" ? undefined : kinds.find(k => normalName(k.nameEn) === wanted);
}

/** "0.5 × 0.5 × 1 m": width, depth and height, to the centimetre. */
export function sizeText(size: ObjectKind["size"]): string {
  const m = (v: number) => String(Math.round(v * 100) / 100);
  return `${m(size.w)} × ${m(size.d)} × ${m(size.h)} m`;
}

/**
 * What tagging a frame writes: a new place when the name is new — filed under
 * the floor being surveyed, so it is on that floor from the start — and the
 * sighting that ties it to the frame.
 *
 * An object also makes or reuses its kind (spec §5.1). A kind is the same on
 * every floor, so its place is filed under none. A place already surveyed
 * that is tagged as an object becomes the kind's place, rather than a second
 * place of the same name. A kind of the same name is reused, so a retry after
 * the kind landed and its place did not makes no second kind.
 */
export function tagWrites(
  tag: Tag, frameId: string, levelId: string, id: (prefix: string) => string = newId, known: Known = NOTHING_KNOWN,
): TagWrites {
  const placeId = tag.placeId ?? id("pl");
  const existing = tag.placeId ? known.places.find(p => p.id === tag.placeId) : undefined;
  let objectKind: Record<string, unknown> | null = null;
  let kindId: string | undefined;
  if (tag.object) {
    kindId = existing?.objectKindId ?? kindNamed(known.kinds, tag.nameEn)?.id;
    if (!kindId) {
      kindId = id("ok");
      objectKind = { id: kindId, nameEn: tag.nameEn, size: { ...OBJECT_SIZE_GUESS } };
    }
  }
  return {
    objectKind,
    place: tag.placeId
      ? null
      : {
          id: placeId,
          nameEn: tag.nameEn,
          category: tag.category,
          ...(kindId ? { objectKindId: kindId } : { levelId }),
          ...(tag.pathwayKindId ? { pathwayKindId: tag.pathwayKindId } : {}),
        },
    makeObject: tag.placeId && kindId && !existing?.objectKindId ? { placeId, objectKindId: kindId } : null,
    sighting: { id: id("sg"), placeId, keyframeId: frameId, ...(tag.box ? { box: tag.box } : {}) },
  };
}

/** A stray click leaves a box of almost no size; that is not a box, and saving it would put a dot on the frame. */
const SMALLEST = 0.01;

export function drawnBox(box: Box | null): Box | undefined {
  return box && box.w > SMALLEST && box.h > SMALLEST ? box : undefined;
}

// Raw hex, not tokens: data values drawn onto frames, moved as-is from the old SurveyApp.
const WALKWAY_COLOURS = ["#38bdf8", "#f2a33c", "#a78bfa", "#34d399", "#f472b6", "#facc15"];

/** The colour for the next walkway type, so a floor of walkways does not read as one blue tangle. */
export function walkwayColour(existing: number): string {
  return WALKWAY_COLOURS[existing % WALKWAY_COLOURS.length]!;
}
