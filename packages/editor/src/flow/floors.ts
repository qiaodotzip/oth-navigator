import { live, type Level, type MapModel } from "@oth/model";
import { FLOOR_TABS, type FloorTab } from "../route";

/** Floors from the bottom up, deleted ones left out. */
export function sortedLevels(model: MapModel | null): Level[] {
  if (!model) return [];
  return [...live(model.levels)].sort((a, b) => a.ordinal - b.ordinal);
}

/** A floor by its code. "l1" typed by hand means L1. */
export function findLevel(model: MapModel | null, code: string): Level | null {
  const wanted = code.toUpperCase();
  return sortedLevels(model).find(l => l.code.toUpperCase() === wanted) ?? null;
}

/** The floor directly below, by ordinal — what a plan is lined up against. Null for the lowest. */
export function levelBelow(model: MapModel | null, levelId: string): Level | null {
  const levels = sortedLevels(model);
  const i = levels.findIndex(l => l.id === levelId);
  return i > 0 ? levels[i - 1]! : null;
}

/**
 * "Your floor", wherever the app says it: the lowest floor you own; if you own
 * none, the one you last worked on in this browser; failing that, the lowest.
 * An owner id for someone no longer on the team simply matches nobody.
 */
export function yourFloor(model: MapModel | null, userId: string | null, lastFloorCode: string | null): Level | null {
  const levels = sortedLevels(model);
  return (
    (userId ? levels.find(l => l.ownerIds.includes(userId)) : undefined) ??
    (lastFloorCode ? levels.find(l => l.code === lastFloorCode) : undefined) ??
    levels[0] ??
    null
  );
}

/**
 * Which tab a floor opens on: the one you last used there; otherwise Survey if
 * the floor has footage to label, and Build if it does not.
 */
export function pickTab(remembered: string | null, hasFootage: boolean): FloorTab {
  if (remembered && (FLOOR_TABS as readonly string[]).includes(remembered)) return remembered as FloorTab;
  return hasFootage ? "survey" : "build";
}
