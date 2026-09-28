import { live, type MapModel, type Room } from "@oth/model";
import { massingOf } from "./massing";
import { wallRuns } from "./openings";
import { balustradeRuns, voidHoles } from "./voids";
import { wallPieces, type WallPiece } from "./wallPlan";

/** Spec §7: walls stand 1.2 m high in the preview so rooms read from above. */
export const LOW_WALL_M = 1.2;

/**
 * Names the drawing gives a flight of steps. L1's escalators were imported
 * as rooms (spec §7), and walled they read as closed boxes. The whole name
 * must be flights and their numbers ("Escalator - 05 Escalator - 06",
 * "Stair A"), the shape MakeStop's NAMED_AS_ONE takes, so "Stairs landing",
 * "Stairway Café" and "Stair Pressurisation Fan Rm" keep their walls. Flights
 * only: a lift keeps its walls until someone converts it (Task 7).
 */
const FLIGHT = "(?:escalators?|staircase|stairs?)";
const NUMBER = "(?:\\d+[a-z]?|[a-z])";
const NUMBERS = `(?:\\s*[-–—:#]?\\s*${NUMBER}(?:\\s*[,&/]\\s*${NUMBER})*)?`;
const FLIGHT_NAME = new RegExp(`^${FLIGHT}${NUMBERS}(?:\\s*[,&/]?\\s*${FLIGHT}${NUMBERS})*$`, "i");

/** Everything Part D builds on one level, as plain data. */
export type LevelStructure = {
  /** Walls that stand, already merged and opened. */
  walls: WallPiece[];
  balustrades: WallPiece[];
  /** Voids to cut from each floor room's slab. */
  holesByRoom: ReadonlyMap<string, Room["holes"]>;
  heightByRoom: ReadonlyMap<string, number>;
};

export function levelStructure(model: MapModel, levelId: string): LevelStructure {
  const rooms = live(model.rooms).filter(r => r.levelId === levelId);
  const walled = rooms.filter(r => massingOf(r) === "shell" && !FLIGHT_NAME.test(r.nameEn.trim()));
  const pathways = live(model.pathways).filter(p => p.levelId === levelId);
  const doorways = live(model.doorways).filter(d => d.levelId === levelId);
  return {
    // Every live room on the floor, walled or not: the walkable areas among
    // them are what a closed room gets a front door onto, and a walled room's
    // own footprint says which side of its wall is outside (Rulings 8–10).
    walls: wallRuns(wallPieces(walled), pathways, doorways, rooms),
    balustrades: balustradeRuns(rooms),
    holesByRoom: voidHoles(rooms),
    heightByRoom: new Map(rooms.map(r => [r.id, r.heightM])),
  };
}

/** How tall a wall stands: 1.2 m, or at full height as tall as the taller room it encloses. */
export function wallTop(piece: WallPiece, heights: ReadonlyMap<string, number>, fullHeight: boolean): number {
  const own = Math.max(...piece.rooms.map(id => heights.get(id) ?? LOW_WALL_M));
  return fullHeight ? own : Math.min(LOW_WALL_M, own);
}
