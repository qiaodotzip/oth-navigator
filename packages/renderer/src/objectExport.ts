import { RoomSchema, type Level, type ObjectKind, type Placement, type Room, type Vec2 } from "@oth/model";
import { buildDetailGlb, detailContextRooms } from "./contextExport";

/** Spec §5.5: the surroundings within 5 m of one of its objects. */
export const OBJECT_CONTEXT_MARGIN_M = 5;

export const OBJECT_ORIGIN_NOTE =
  "Origin is the object's base centre. Units are metres. Y is up, and the object's front faces +Z. " +
  "Model inside the box: every object of this kind shows the model, turned and placed as on the map.";

/** `oth-object-water-cooler.glb`: the English name, lower-case and hyphenated, or the id when that leaves nothing. */
export function objectKindExportName(kind: Pick<ObjectKind, "id" | "nameEn">): string {
  const slug = kind.nameEn.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `oth-object-${slug || kind.id}.glb`;
}

/** A point turned about another, anticlockwise seen from above. */
function turn(p: Vec2, about: Vec2, deg: number): [number, number] {
  const r = (deg * Math.PI) / 180;
  const dx = p[0] - about[0];
  const dy = p[1] - about[1];
  return [about[0] + dx * Math.cos(r) - dy * Math.sin(r), about[1] + dx * Math.sin(r) + dy * Math.cos(r)];
}

function turnRoom(room: Room, about: Vec2, deg: number): Room {
  if (deg % 360 === 0) return room;
  return {
    ...room,
    footprint: room.footprint.map(p => turn(p, about, deg)),
    holes: room.holes.map(hole => hole.map(p => turn(p, about, deg))),
  };
}

/** The kind's box as a traced detail is: a rectangle w across and d deep about `at`, as tall as the kind. */
function kindBlock(kind: ObjectKind, at: Vec2, levelId: string): Room {
  const w = kind.size.w / 2;
  const d = kind.size.d / 2;
  return RoomSchema.parse({
    id: kind.id, levelId, kind: "detail", nameEn: kind.nameEn, heightM: kind.size.h,
    footprint: [[at[0] - w, at[1] - d], [at[0] + w, at[1] - d], [at[0] + w, at[1] + d], [at[0] - w, at[1] + d]],
  });
}

/**
 * Export for modelling (spec §5.5): the kind's box, and the surroundings of
 * one of its objects as locked reference, centred on that object's base.
 *
 * It is `buildDetailGlb` with a box in place of a traced outline. The box
 * stays square to the axes. The surroundings turn by the object's rotation,
 * so what the object faces is in front of it at +Z, which is where the model's
 * front goes. The model then comes back into every object of the kind, turned
 * as each one is. With none on the map, the box comes alone.
 *
 * `rooms` are the map's live rooms; only `level`'s are used.
 */
export async function buildObjectKindGlb(
  kind: ObjectKind, at: Placement | null, rooms: readonly Room[], level: Level,
): Promise<Uint8Array> {
  const centre: Vec2 = at ? [at.position[0], at.position[1]] : [0, 0];
  const block = kindBlock(kind, centre, level.id);
  const context = at
    ? detailContextRooms(block, rooms.filter(r => r.levelId === level.id), OBJECT_CONTEXT_MARGIN_M)
      .map(r => turnRoom(r, centre, -at.rotationDeg))
    : [];
  return (await buildDetailGlb(block, context, level, OBJECT_ORIGIN_NOTE)).bytes;
}
