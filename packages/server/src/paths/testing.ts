import { parseModel, type MapModel, type RoomKind, type Vec2 } from "@oth/model";

/** The floor every paths test draws on. */
export const LEVEL = "oth-L1";

export type Pt = [number, number];

export function rect(x0: number, y0: number, x1: number, y1: number): Pt[] {
  return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
}

export type TestRoom = {
  id?: string;
  footprint: Pt[];
  holes?: Pt[][];
  kind?: RoomKind;
  walkable?: boolean;
  levelId?: string;
  deletedAt?: string;
  nameEn?: string;
};

/**
 * A building with floors L1 and L2, and the rooms given: walkable areas on L1
 * unless a room says otherwise. `extra` adds doorways, entrances, portals and
 * stops as the model defines them.
 */
export function floor(rooms: TestRoom[], extra: Record<string, unknown> = {}): MapModel {
  return parseModel({
    building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
    levels: [
      { id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "Level 1", nameZh: "一楼", elevationM: 0, heightM: 6 },
      { id: "oth-L2", buildingId: "oth", code: "L2", ordinal: 2, nameEn: "Level 2", nameZh: "二楼", elevationM: 6, heightM: 4 },
    ],
    rooms: rooms.map((r, i) => ({
      id: r.id ?? `room-${i}`,
      levelId: r.levelId ?? LEVEL,
      kind: r.kind ?? "area",
      walkable: r.walkable ?? true,
      heightM: 4,
      footprint: r.footprint,
      holes: r.holes ?? [],
      deletedAt: r.deletedAt,
      nameEn: r.nameEn,
    })),
    ...extra,
  });
}

/** A doorway on L1 across `segment`, between two rooms the test need not draw. */
export function doorway(id: string, segment: [Vec2, Vec2]) {
  return { id, levelId: LEVEL, roomA: "room-a", roomB: "room-b", segment, widthM: 2 };
}
