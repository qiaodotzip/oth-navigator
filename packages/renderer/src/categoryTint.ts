import { live, type MapModel, type TenantCategory } from "@oth/model";

/**
 * Light tints, so a tinted floor still reads as floor and walls stay darker.
 * Each differs from the plain room colour (theme.ts's #e7ddc7). Part A's
 * labels name the place; the tint only groups like with like.
 */
export const CATEGORY_TINT: Record<TenantCategory, string> = {
  government: "#c7d6ea",
  healthcare: "#f0c4c4",
  community: "#d8cbe9",
  retail: "#f2d59b",
  lifestyle: "#f3c9dd",
  sports: "#c3e0bf",
  facility: "#cfd6dc",
};

/**
 * Spec §7: a bound room is tinted by its place's category. When two places
 * are bound to one room, the one first by id wins, so the tint never flickers
 * between saves.
 */
export function roomTints(model: MapModel, levelId: string): Map<string, string> {
  const onLevel = new Set(live(model.rooms).filter(r => r.levelId === levelId).map(r => r.id));
  const tints = new Map<string, string>();
  const bound = live(model.places)
    .filter(p => p.roomId !== undefined && onLevel.has(p.roomId))
    .sort((a, b) => a.id.localeCompare(b.id));
  for (const place of bound) {
    if (!tints.has(place.roomId!)) tints.set(place.roomId!, CATEGORY_TINT[place.category]);
  }
  return tints;
}
