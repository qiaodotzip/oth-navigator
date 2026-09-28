import { live, placeLevels, type MapModel, type Place, type Room, type ValidationReport } from "@oth/model";
import { waitingReview } from "../flow/floorProgress";
import { href } from "../route";
import { bestEvidence, type Evidence } from "./evidence";

/** What stands between a confirmed place and the map (spec §4). */
export type Gap = "unbound" | "roomGone" | "otherFloor" | "noConfirmedPhoto" | "photosDisagree";

export const GAP_LABEL: Record<Gap, string> = {
  unbound: "Not on the map",
  roomGone: "Room gone",
  otherFloor: "On another floor",
  noConfirmedPhoto: "No confirmed photo",
  photosDisagree: "Photos disagree",
};

export type PlaceRow = {
  place: Place;
  /** Its best frame, for the thumbnail. */
  best: Evidence | null;
  /** The live room it is bound to, on whichever floor that is. */
  room: Room | null;
  /** Bound to a live room on this floor. */
  onMap: boolean;
  gaps: Gap[];
};

/**
 * The live room a place is bound to, on whichever floor, or null. Deleting a
 * room leaves its place still naming it, so a place is bound only while that
 * room is on the map. Build's Bind step keeps the same rule, so the places
 * this list calls "Not on the map" or "Room gone" are the ones Bind places is
 * waiting on, and the two never disagree about a place.
 *
 * TODO(5A): read Plan 3's shared `floorUnits` (flow/buildSteps.ts, Ruling 29)
 * once it is committed. Its `waiting` places are this floor's "Not on the map"
 * and "Room gone"; until then this repeats its rule.
 */
function liveRoomOf(place: Place, rooms: ReadonlyMap<string, Room>): Room | null {
  return place.roomId ? rooms.get(place.roomId) ?? null : null;
}

/**
 * One row per confirmed place on a floor: the Places checklist (spec §4).
 *
 * A proposal is a claim until Review decides it, so it is counted, not
 * listed. A walkway is built as a path and never bound, so it is neither.
 * *Photos disagree* comes from the report, so the caller should hand over a
 * fresh one (see `recheck`).
 */
export function placeRows(model: MapModel, report: ValidationReport | null, levelId: string): PlaceRow[] {
  const floors = placeLevels(model);
  const rooms = new Map(live(model.rooms).map(r => [r.id, r]));
  // The validator files each far-apart pair once, against one of its two
  // places, so only that one shows the gap. The spec defines it by the issue.
  const disagree = new Set(
    (report?.issues ?? []).filter(i => i.code === "place.adjacencyBroken").map(i => i.entityId),
  );

  const rows = live(model.places)
    .filter(p => p.status === "confirmed" && !p.pathwayKindId && floors.get(p.id) === levelId)
    .map<PlaceRow>(place => {
      const evidence = bestEvidence(model, place.id);
      const room = liveRoomOf(place, rooms);
      const gaps: Gap[] = [];
      // A place still naming a deleted room is "Room gone", not "Not on the map":
      // what it was bound to is worth saying when you bind it again.
      if (!place.roomId) gaps.push("unbound");
      else if (!room) gaps.push("roomGone");
      else if (room.levelId !== levelId) gaps.push("otherFloor");
      if (!evidence.some(e => e.sighting.status === "confirmed")) gaps.push("noConfirmedPhoto");
      if (disagree.has(place.id)) gaps.push("photosDisagree");
      return { place, best: evidence[0] ?? null, room, onMap: room?.levelId === levelId, gaps };
    });

  // The id settles two places of the same name, so the order never depends on how the server sent them.
  return rows.sort(
    (a, b) =>
      Number(b.gaps.length > 0) - Number(a.gaps.length > 0)
      || a.place.nameEn.localeCompare(b.place.nameEn)
      || a.place.id.localeCompare(b.place.id),
  );
}

export type PlacesSummary = {
  confirmed: number;
  onMap: number;
  gaps: number;
  /** Proposals on this floor, waiting in Review. */
  waiting: number;
  /** The other direction: rooms and areas no surveyed place is bound to. */
  unfilmedRooms: number;
};

export function placesSummary(model: MapModel, rows: readonly PlaceRow[], levelId: string): PlacesSummary {
  // Any live place counts, a proposal too, as validation's room.unsurveyed does.
  const bound = new Set(live(model.places).map(p => p.roomId).filter(Boolean));
  return {
    confirmed: rows.length,
    onMap: rows.filter(r => r.onMap).length,
    gaps: rows.filter(r => r.gaps.length > 0).length,
    waiting: waitingReview(model, levelId),
    unfilmedRooms: live(model.rooms).filter(
      r => r.levelId === levelId && (r.kind === "room" || r.kind === "area") && !bound.has(r.id),
    ).length,
  };
}

export type RowAction = { label: "Show on map" | "Bind it"; to: string };

/**
 * A row's one action. A place with a live room goes to Build with that room
 * selected, which opens its card, on the room's own floor. A place with none,
 * or whose room is gone, goes to Bind places with it picked, as the to-do
 * list does.
 */
export function rowAction(model: MapModel, row: PlaceRow, levelCode: string): RowAction {
  const bind = (code: string, params: Record<string, string>) =>
    href({ name: "floor", code, tab: "build", params: { step: "bind", ...params } });
  if (row.room) {
    const roomLevelId = row.room.levelId;
    const code = live(model.levels).find(l => l.id === roomLevelId)?.code ?? levelCode;
    return { label: "Show on map", to: bind(code, { select: `room:${row.room.id}` }) };
  }
  return { label: "Bind it", to: bind(levelCode, { place: row.place.id }) };
}

/** "Starbucks → Shop (L1-shop-12)": where a place is on the map, in words. */
export function whereText(model: MapModel, row: PlaceRow): string {
  const name = row.place.nameEn;
  if (row.room) {
    const roomLevelId = row.room.levelId;
    const room = `${row.room.nameEn.trim() || "Unnamed room"} (${row.room.id})`;
    if (row.onMap) return `${name} → ${room}`;
    const code = live(model.levels).find(l => l.id === roomLevelId)?.code ?? "another floor";
    return `${name} → ${room} on ${code}`;
  }
  if (row.place.roomId) return `${name} → a room since deleted (${row.place.roomId})`;
  return `${name} → no room yet`;
}

export const PLACES_FILTERS = ["gaps", "on-map", "all"] as const;
export type PlacesFilter = (typeof PLACES_FILTERS)[number];
export const FILTER_LABEL: Record<PlacesFilter, string> = { gaps: "Gaps", "on-map": "On the map", all: "All" };

/** The address, read leniently: anything unknown is Gaps, the to-do view. */
export function readPlacesFilter(params: Record<string, string>): PlacesFilter {
  return (PLACES_FILTERS as readonly string[]).includes(params.filter ?? "") ? (params.filter as PlacesFilter) : "gaps";
}

/** Gaps and On the map can overlap: a bound place with no confirmed photo is in both. */
export function filterRows(rows: readonly PlaceRow[], filter: PlacesFilter): PlaceRow[] {
  if (filter === "gaps") return rows.filter(r => r.gaps.length > 0);
  if (filter === "on-map") return rows.filter(r => r.onMap);
  return [...rows];
}

/** The Places heading, which the Floors home card repeats. */
export function onMapLine(onMap: number, confirmed: number): string {
  return `${onMap} of ${confirmed} confirmed ${confirmed === 1 ? "place is" : "places are"} on the map`;
}
