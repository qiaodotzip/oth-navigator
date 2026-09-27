import type { Box, TenantCategory } from "@oth/model";

export type Tag = {
  /** An existing place, or null when the name is new. */
  placeId: string | null;
  nameEn: string;
  category: TenantCategory;
  /** Set when what was boxed is a walkway rather than a unit. */
  pathwayKindId?: string;
  box?: Box;
};

/**
 * An id the server accepts (letters, digits, underscore) that nothing else
 * has: the time, and a little randomness for two made in one millisecond —
 * a place and its first sighting are.
 */
export function newId(prefix: string, now = Date.now(), random: () => number = Math.random): string {
  return `${prefix}_${now.toString(36)}${random().toString(36).slice(2, 8)}`;
}

/**
 * What tagging a frame writes: a new place when the name is new — filed under
 * the floor being surveyed, so it is on that floor from the start — and the
 * sighting that ties it to the frame.
 */
export function tagWrites(
  tag: Tag, frameId: string, levelId: string, id: (prefix: string) => string = newId,
): { place: Record<string, unknown> | null; sighting: Record<string, unknown> } {
  const placeId = tag.placeId ?? id("pl");
  return {
    place: tag.placeId
      ? null
      : {
          id: placeId,
          nameEn: tag.nameEn,
          category: tag.category,
          levelId,
          ...(tag.pathwayKindId ? { pathwayKindId: tag.pathwayKindId } : {}),
        },
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
