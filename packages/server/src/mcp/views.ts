import { live, placeLevels, type MapModel } from "@oth/model";

export type FloorSummary = {
  id: string;
  code: string;
  name: string;
  version: number;
  owners: string[];
  rooms: number;
  places: { confirmed: number; proposed: number };
  /** Confirmed places bound to a room that exists on this floor. */
  bound: number;
};

/**
 * list_floors: each floor's owners, by name where the team still has them,
 * and how far its map has come, lowest floor first.
 */
export function summariseFloors(model: MapModel, names: ReadonlyMap<string, string>): FloorSummary[] {
  const floorOf = placeLevels(model);
  const rooms = live(model.rooms);
  const places = live(model.places);
  return [...live(model.levels)].sort((a, b) => a.ordinal - b.ordinal).map(level => {
    const here = places.filter(p => floorOf.get(p.id) === level.id);
    const roomIds = new Set(rooms.filter(r => r.levelId === level.id).map(r => r.id));
    const confirmed = here.filter(p => p.status === "confirmed");
    return {
      id: level.id,
      code: level.code,
      name: level.nameEn,
      version: level.version,
      owners: level.ownerIds.map(id => names.get(id) ?? id),
      rooms: roomIds.size,
      places: { confirmed: confirmed.length, proposed: here.length - confirmed.length },
      bound: confirmed.filter(p => p.roomId !== undefined && roomIds.has(p.roomId)).length,
    };
  });
}
