import { DEFAULT_PATHWAY_WIDTH_M, type Ring, type Vec2 } from "@oth/model";

/**
 * What each drawing tool commits.
 *
 * The tool decides kind and walkability, so nobody has to know the walkable
 * checkbox exists — which is the whole reason area and room are separate tools
 * rather than one tool plus a field.
 */

/** Default storey heights, only until someone sets a real one. */
const AREA_HEIGHT_M = 5;
const ROOM_HEIGHT_M = 3.5;

export function newArea(levelId: string, footprint: Ring, now = Date.now()) {
  return {
    id: `${levelId}-area-${now}`,
    levelId,
    kind: "area" as const,
    footprint,
    heightM: AREA_HEIGHT_M,
    // An area is open floor you cross freely.
    walkable: true,
  };
}

export function newRoom(levelId: string, footprint: Ring, now = Date.now()) {
  return {
    id: `${levelId}-room-${now}`,
    levelId,
    kind: "room" as const,
    footprint,
    heightM: ROOM_HEIGHT_M,
    // A room is somewhere you arrive, not somewhere you route through.
    walkable: false,
  };
}

export function newPathway(levelId: string, polyline: Vec2[], now = Date.now()) {
  return {
    id: `${levelId}-path-${now}`,
    levelId,
    polyline,
    widthM: DEFAULT_PATHWAY_WIDTH_M,
  };
}
