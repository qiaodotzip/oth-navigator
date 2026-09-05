import { DEFAULT_PATHWAY_WIDTH_M, type Ring, type Vec2 } from "@oth/model";

/** The kinds of space a drawing tool commits. */
export type SpaceKind = "area" | "room" | "detail";

/**
 * What each tool commits, in one table.
 *
 * The tool decides kind, height and walkability, so nobody has to know the
 * walkable checkbox exists — which is the reason area, room and detail are
 * three tools rather than one tool and a form.
 */
const DEFAULTS: Record<SpaceKind, { heightM: number; walkable: boolean }> = {
  // Open floor you cross freely.
  area: { heightM: 5, walkable: true },
  // Somewhere you arrive, not somewhere you route through.
  room: { heightM: 3.5, walkable: false },
  // Furniture. The height is a brief for a modeller, so it is editable after.
  detail: { heightM: 1.2, walkable: false },
};

export function newSpace(kind: SpaceKind, levelId: string, footprint: Ring, now = Date.now()) {
  return { id: `${levelId}-${kind}-${now}`, levelId, kind, footprint, ...DEFAULTS[kind] };
}

export function newPathway(levelId: string, polyline: Vec2[], now = Date.now()) {
  return { id: `${levelId}-path-${now}`, levelId, polyline, widthM: DEFAULT_PATHWAY_WIDTH_M };
}
