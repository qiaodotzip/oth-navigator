import { labelPoint, labelSpan, live, type MapModel, type Place, type Room, type Vec2 } from "@oth/model";
import type { LabelTone, RoomLabel } from "@oth/renderer";

type Anchor = { at: Vec2; widthM: number; heightM: number };

/**
 * Keyed by the room object, so a label is never placed from an outline that
 * has since changed: an edited room is a new object. The plan and 3D both ask
 * for the same model's labels, and the second one costs nothing. A save
 * reloads the whole model, so every room is new then and worked out again,
 * which on L1 is a few milliseconds.
 */
const anchors = new WeakMap<Room, Anchor>();

function anchorOf(room: Room): Anchor {
  let anchor = anchors.get(room);
  if (!anchor) {
    const { point } = labelPoint(room.footprint, room.holes);
    const span = labelSpan(point, room.footprint, room.holes);
    anchor = { at: point, widthM: span.width, heightM: span.height };
    anchors.set(room, anchor);
  }
  return anchor;
}

// TODO(5A): use the shared helper from flow/
/**
 * A place counts as bound only while the room it names still exists: a room
 * deleted from under it leaves nothing to label or to list the place on.
 */
function isBoundToLiveRoom(place: Place, model: MapModel): place is Place & { roomId: string } {
  return model.rooms.some(r => r.id === place.roomId && r.deletedAt == null);
}

/**
 * Every live place bound to each room, by name. None comes first: on L1 the
 * west concourses hold their gates and an escalator on purpose, three to an
 * area, so the card lists them all alike rather than picking one.
 */
export function placesByRoom(model: MapModel): Map<string, Place[]> {
  const byRoom = new Map<string, Place[]>();
  for (const place of live(model.places)) {
    if (!isBoundToLiveRoom(place, model)) continue;
    const list = byRoom.get(place.roomId);
    if (list) list.push(place);
    else byRoom.set(place.roomId, [place]);
  }
  for (const list of byRoom.values()) {
    list.sort((a, b) => a.nameEn.localeCompare(b.nameEn) || a.id.localeCompare(b.id));
  }
  return byRoom;
}

/**
 * A room's label text and tone, or null when it has nothing to be called.
 * With several places, naming the room after one of them would hide the
 * rest, so it keeps its own name and says how many. It is ticked once any of
 * them is confirmed, since then a person has checked what is there.
 */
function called(room: Room, places: readonly Place[]): { name: string; tone: LabelTone } | null {
  const drawn = room.nameEn.trim();
  if (places.length === 0) return drawn ? { name: drawn, tone: "drawing" } : null;
  const tone: LabelTone = places.some(p => p.status === "confirmed") ? "confirmed" : "proposed";
  if (places.length === 1) return { name: places[0]!.nameEn, tone };
  const count = `${places.length} places`;
  return { name: drawn ? `${drawn} · ${count}` : count, tone };
}

/**
 * What each room on a floor is called on the plan and in 3D (spec §4). A room
 * with one place shows the place's name, with ✓ once confirmed and *proposed*
 * until then; a room with several shows its own name and how many. An
 * unbound room shows the drawing's name, in grey, and a room with neither has
 * no label.
 */
export function roomLabels(model: MapModel, levelId: string): RoomLabel[] {
  const byRoom = placesByRoom(model);
  const labels: RoomLabel[] = [];
  for (const room of live(model.rooms)) {
    if (room.levelId !== levelId) continue;
    const label = called(room, byRoom.get(room.id) ?? []);
    if (label) labels.push({ roomId: room.id, ...label, ...anchorOf(room), liftM: room.heightM });
  }
  return labels;
}
