import { live, type MapModel, type ObjectKind, type Place, type Placement } from "@oth/model";
import { normalName } from "../survey/suggest";
import { kindNamed, newId } from "../survey/tagging";
import { bestEvidence, type Evidence } from "./evidence";

export type ObjectSize = ObjectKind["size"];

/** A size as typed into the forms: metres, as text. */
export type SizeText = { w: string; d: string; h: string };

/** Any side longer than this was typed in centimetres: 60 for 0.6. */
export const MAX_OBJECT_SIDE_M = 10;

/** One kind of object in the Places tab's Objects section (spec §5.2). */
export type ObjectRow = {
  kind: ObjectKind;
  /** The places that stand for it in the survey: usually one. */
  places: Place[];
  /** "Model" once its kind has a model on the server; until then every one is drawn as a box. */
  look: "Box" | "Model";
  /** Its live objects per floor, lowest floor first. Floors with none are left out. */
  onMap: { code: string; count: number }[];
  /** How many frames show it, one per frame, across its places. */
  frames: number;
  /** Its best frame, for the thumbnail. */
  best: Evidence | null;
};

export function objectRows(model: MapModel): ObjectRow[] {
  const places = live(model.places);
  const assets = new Set(live(model.assets).map(a => a.id));
  const levels = [...live(model.levels)].sort((a, b) => a.ordinal - b.ordinal);
  const placements = live(model.placements);
  return [...live(model.objectKinds)]
    .sort((a, b) => a.nameEn.localeCompare(b.nameEn) || a.id.localeCompare(b.id))
    .map<ObjectRow>(kind => {
      const own = places.filter(p => p.objectKindId === kind.id);
      const evidence = own.flatMap(p => bestEvidence(model, p.id));
      const mine = placements.filter(p => p.objectKindId === kind.id);
      return {
        kind,
        places: own,
        // A model the server no longer has is drawn as the box, so it reads as one.
        look: kind.assetId && assets.has(kind.assetId) ? "Model" : "Box",
        onMap: levels
          .map(l => ({ code: l.code, count: mine.filter(p => p.levelId === l.id).length }))
          .filter(floor => floor.count > 0),
        frames: evidence.length,
        best: evidence[0] ?? null,
      };
    });
}

export function onMapText(row: ObjectRow): string {
  if (row.onMap.length === 0) return "Not on the map yet";
  return `On the map: ${row.onMap.map(f => `${f.code} ${f.count}`).join(" · ")}`;
}

export function framesText(frames: number): string {
  return frames === 0 ? "No frames" : `${frames} frame${frames === 1 ? "" : "s"}`;
}

/** The ids of the rooms on the map, for `boundToRoom`. */
export function mapRoomIds(model: MapModel): Set<string> {
  return new Set(live(model.rooms).map(r => r.id));
}

/**
 * Whether a place is bound to a room on the map: a unit you go into, which is
 * never an object. A room since deleted no longer counts.
 */
export function boundToRoom(place: Place, rooms: ReadonlySet<string>): boolean {
  return Boolean(place.roomId && rooms.has(place.roomId));
}

/**
 * The places "This is an object" may turn into one (spec §5.1): any live
 * place that is not one already, not a walkway, and not bound to a room on
 * the map. Proposals are in, since Claude's 8 are proposals. So are places no
 * floor claims, which no floor's checklist lists.
 */
export function objectCandidates(model: MapModel): Place[] {
  const rooms = mapRoomIds(model);
  return live(model.places)
    .filter(p => !p.objectKindId && !p.pathwayKindId && !boundToRoom(p, rooms))
    .sort((a, b) => a.nameEn.localeCompare(b.nameEn) || a.id.localeCompare(b.id));
}

/** Metres, with a dot for decimals. parseFloat would read "1,2" as 1, which is worse than refusing it. */
const METRES = /^\d*\.?\d+$/;

/** A size from the form, or why not. Checked before anything is sent. */
export function parseSize(text: SizeText): { ok: true; size: ObjectSize } | { ok: false; reason: string } {
  const size: ObjectSize = { w: 0, d: 0, h: 0 };
  for (const side of ["w", "d", "h"] as const) {
    const typed = text[side].trim();
    const value = METRES.test(typed) ? Number(typed) : Number.NaN;
    if (!(value > 0)) return { ok: false, reason: "Give each side in metres, above 0, like 0.6." };
    if (value > MAX_OBJECT_SIDE_M) {
      return { ok: false, reason: `${typed} m is more than ${MAX_OBJECT_SIDE_M} m. Sizes are in metres: 60 cm is 0.6.` };
    }
    size[side] = value;
  }
  return { ok: true, size };
}

export function sizeFields(size: ObjectSize): SizeText {
  return { w: String(size.w), d: String(size.d), h: String(size.h) };
}

export type MakeObject = {
  /** A new kind to make first, or null when one of this name exists and the place joins it. */
  objectKind: Record<string, unknown> | null;
  /** The kind the place joins: `{ objectKindId }` is its update. */
  objectKindId: string;
};

/**
 * "This is an object" (spec §5.1): the kind the place becomes, by the name
 * given — the place's own unless you chose another — at the size asked. A
 * kind of that name is joined at its own size rather than doubled, the rule
 * Survey's Object tag follows, so a place called "wast" can join "wastebin".
 */
export function makeObjectWrites(
  place: Place, kindName: string, size: ObjectSize, kinds: readonly ObjectKind[], id: (prefix: string) => string = newId,
): MakeObject {
  const same = kindNamed(live(kinds), kindName);
  if (same) return { objectKind: null, objectKindId: same.id };
  const objectKindId = id("ok");
  const nameEn = kindName.trim();
  // The place's Chinese name is its own; a kind named otherwise has none yet.
  const nameZh = normalName(nameEn) === normalName(place.nameEn) ? place.nameZh : "";
  return { objectKind: { id: objectKindId, nameEn, nameZh, size }, objectKindId };
}

/**
 * Why a kind can't be called this, or null if it can. Two live kinds of one
 * name would split the survey's tags between them, so names are compared as
 * the survey compares them.
 */
export function kindNameProblem(kinds: readonly ObjectKind[], kindId: string, name: string): string | null {
  if (name.trim() === "") return "Give the kind a name.";
  const other = kindNamed(live(kinds).filter(k => k.id !== kindId), name);
  return other ? `There is a kind called ${other.nameEn} already.` : null;
}

/**
 * "Not an object", the undo for a place made an object by mistake: the
 * kind's places, to be plain places again before the kind goes. Null while
 * any object of the kind is on the map, which would be left a kind of nothing.
 */
export function notAnObject(model: MapModel, kindId: string): Place[] | null {
  if (live(model.placements).some(p => p.objectKindId === kindId)) return null;
  return live(model.places).filter(p => p.objectKindId === kindId);
}

/**
 * The object whose surroundings go to Blender with its kind (spec §5.5):
 * this floor's first by id, else any floor's, so the choice never changes
 * between clicks.
 */
export function referenceObject(model: MapModel, kindId: string, levelId: string): Placement | null {
  const mine = live(model.placements)
    .filter(p => p.objectKindId === kindId)
    .sort((a, b) => a.id.localeCompare(b.id));
  return mine.find(p => p.levelId === levelId) ?? mine[0] ?? null;
}
