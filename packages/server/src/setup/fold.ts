import type { Vec2 } from "@oth/model";
import type { Row } from "../db/rows";
import type { auditLog } from "../db/schema";
import { SET_ASIDE } from "../drafts/service";
import type { EntityType } from "../entities/registry";
import { count } from "../mcp/results";

export type AuditRow = typeof auditLog.$inferSelect;

/**
 * The check step's groups, in the order it shows them: spec §8's eight, then
 * Claude's survey labels, which Review decides, and anything else. Plan 6E's
 * ClaudeChangeGroup, word for word.
 */
export const CHANGE_GROUPS = ["rooms", "drafts", "names", "stops", "places", "objects", "pathways", "entrances", "labels", "other"] as const;
export type ChangeGroup = (typeof CHANGE_GROUPS)[number];

/** An entity a change wrote, at the version it left it: Undo is offered only while it still is. */
export type Touch = { type: EntityType; id: string; version: number };

/** One write that takes a change back, version-checked like any other. */
export type UndoStep =
  | { do: "delete" | "restore"; type: EntityType; id: string; version: number }
  | { do: "patch"; type: EntityType; id: string; version: number; patch: Row }
  | { do: "unaccept"; draftId: string; draftVersion: number; roomId: string; roomVersion: number };

/** What a change's plain line is made from. */
export type Facts =
  | { kind: "fromDraft"; name: string; drawingName: string; roomKind: string }
  | { kind: "draftOff"; name: string; setAside: boolean }
  | { kind: "renamed"; from: string; to: string; kindFrom: string; kindTo: string }
  | { kind: "stop"; roomId: string; roomName: string; portalId: string; stopKind: string | null; joined: boolean }
  | { kind: "stopOpened"; roomId: string; roomName: string }
  | { kind: "bound"; placeName: string; roomId: string; photos: number }
  | { kind: "object"; objectKindId: string; sightingIds: string[]; at: Vec2 }
  | { kind: "pathway"; name: string; lengthM: number }
  | { kind: "entrance"; name: string; roomId: string }
  | { kind: "label"; placeId: string; placeName: string; frameId: string; newPlace: boolean; object: boolean }
  | { kind: "generic"; action: string; type: string; name: string };

/** One of Claude's changes: the audit rows one tool call wrote for one thing, as one row of the check step. */
export type Folded = {
  /** The row it is keyed on: its id is the list's auditId, and what the Undo route takes. */
  id: string;
  auditIds: string[];
  group: ChangeGroup;
  at: Date;
  actorId: string | null;
  via: string;
  /** Its floor; null for a label, whose floor is its frame's (changes.ts reads it off the map). */
  levelId: string | null;
  /** The key row's entity and action, as the list reports them. */
  entityType: string;
  entityId: string;
  action: string;
  touches: Touch[];
  /** In the order to run them, the writes' reversed; null when the list doesn't undo it (a label is Review's). */
  undo: UndoStep[] | null;
  facts: Facts;
};

/** Names the plain lines need from the map as it is now. */
export type Names = {
  room: (id: string) => string;
  place: (id: string) => string;
  objectKind: (id: string) => string;
  portalKind: (id: string) => string | null;
  near: (levelId: string, at: Vec2) => string | null;
};

export const TYPE_WORDS: Record<string, string> = {
  room: "room", doorway: "doorway", entrance: "entrance", portal: "lift or stair", portalEndpoint: "stop",
  navHint: "route hint", pathway: "pathway", placement: "placement", tenant: "tenant",
};
/** The map's own types: a change to one of these can be a row on its own. */
const MAP_TYPES = new Set(Object.keys(TYPE_WORDS));
const AUDIT_KEYS = new Set(["id", "version", "updatedAt", "updatedBy", "deletedAt"]);

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : {});
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const num = (v: unknown): number => (typeof v === "number" ? v : 0);
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((s): s is string => typeof s === "string") : []);

/** The update that puts an update back: each field it changed, as it was; null clears one it added. */
export function patchBack(before: Json, after: Json): Row {
  const patch: Row = {};
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (AUDIT_KEYS.has(key)) continue;
    if (JSON.stringify(before[key]) === JSON.stringify(after[key])) continue;
    patch[key] = before[key] === undefined ? null : before[key];
  }
  return patch;
}

const version = (r: AuditRow) => num(obj(r.after).version);
const ref = (r: AuditRow) => ({ type: r.entityType as EntityType, id: r.entityId, version: version(r) });
const patchStep = (r: AuditRow): UndoStep => ({ do: "patch", ...ref(r), patch: patchBack(obj(r.before), obj(r.after)) });

function polylineLength(v: unknown): number {
  const points = Array.isArray(v) ? v.filter((p): p is [number, number] => Array.isArray(p) && p.length >= 2) : [];
  let total = 0;
  for (let i = 1; i < points.length; i++) total += Math.hypot(points[i]![0] - points[i - 1]![0], points[i]![1] - points[i - 1]![1]);
  return total;
}

function made(key: AuditRow, group: ChangeGroup, rows: readonly (AuditRow | undefined)[], parts: {
  levelId: string | null; undo: UndoStep[] | null; facts: Facts;
}): Folded {
  const all = rows.filter((r): r is AuditRow => r !== undefined);
  // One entity written twice in a call is left at its last write's version.
  const touches = new Map<string, Touch>();
  for (const r of all) {
    const t = ref(r);
    const was = touches.get(`${t.type}:${t.id}`);
    if (!was || t.version > was.version) touches.set(`${t.type}:${t.id}`, t);
  }
  return {
    id: key.id, auditIds: all.map(r => r.id), group, at: key.at, actorId: key.actorId, via: key.via ?? "",
    levelId: parts.levelId, entityType: key.entityType, entityId: key.entityId, action: key.action,
    touches: [...touches.values()], undo: parts.undo, facts: parts.facts,
  };
}

/** One tool call's rows: the changes made of several rows first, then each row left on its own. */
function foldGroup(rows: readonly AuditRow[]): Folded[] {
  const used = new Set<string>();
  const out: Folded[] = [];
  const free = (type: string, id: string, action: string) =>
    rows.find(r => !used.has(r.id) && r.entityType === type && r.entityId === id && r.action === action);
  const use = (...rs: (AuditRow | undefined)[]) => {
    for (const r of rs) if (r) used.add(r.id);
    return rs;
  };

  // Drafts made rooms (drafts/service.ts acceptDrafts): the room, and the draft's rename and retirement.
  for (const room of rows.filter(r => r.entityType === "room" && r.action === "create")) {
    const mine = rows.filter(r => r.entityType === "roomDraft" && str(obj(r.after).acceptedRoomId) === room.entityId);
    const renamed = mine.find(r => r.action === "update");
    const retired = mine.find(r => r.action === "delete");
    if (!renamed || !retired) continue;
    const after = obj(room.after);
    out.push(made(room, "rooms", use(room, renamed, retired), {
      levelId: str(after.levelId) || null,
      undo: [{ do: "unaccept", draftId: retired.entityId, draftVersion: version(retired), roomId: room.entityId, roomVersion: version(room) }],
      facts: { kind: "fromDraft", name: str(after.nameEn), drawingName: str(obj(renamed.before).nameEn), roomKind: str(after.kind) },
    }));
  }

  // Stops (stops/makeStop.ts): the stop that gained the outline, its lift or stair, and its space opened.
  for (const stop of rows.filter(r => r.entityType === "portalEndpoint" && !used.has(r.id))) {
    const after = obj(stop.after);
    const outlined = stop.action === "create"
      ? after.footprint !== undefined
      : stop.action === "update" && after.footprint !== undefined && obj(stop.before).footprint === undefined;
    if (!outlined) continue;
    const portalId = str(after.portalId);
    const roomId = str(after.roomId);
    const created = free("portal", portalId, "create");
    const kinded = free("portal", portalId, "update");
    const opened = free("room", roomId, "update");
    const undo: UndoStep[] = [];
    if (opened) undo.push(patchStep(opened));
    undo.push(stop.action === "create" ? { do: "delete", ...ref(stop) } : { do: "patch", ...ref(stop), patch: { footprint: null } });
    if (kinded) undo.push(patchStep(kinded));
    if (created) undo.push({ do: "delete", ...ref(created) });
    const portalAfter = obj((kinded ?? created)?.after);
    out.push(made(stop, "stops", use(stop, created, kinded, opened), {
      levelId: str(after.levelId) || null,
      undo,
      facts: {
        kind: "stop", roomId, roomName: str(obj(opened?.after).nameEn), portalId,
        stopKind: str(portalAfter.kind) || null, joined: !created && !kinded,
      },
    }));
  }

  // Binds (survey/bind.ts): the place takes the room, and the room is marked seen in its photos.
  for (const place of rows.filter(r => r.entityType === "place" && r.action === "update" && !used.has(r.id))) {
    const after = obj(place.after);
    const roomId = str(after.roomId);
    if (!roomId || roomId === str(obj(place.before).roomId)) continue;
    const seen = free("room", roomId, "update");
    out.push(made(place, "places", use(place, seen), {
      levelId: str(after.levelId) || null,
      undo: [...(seen ? [patchStep(seen)] : []), patchStep(place)],
      facts: { kind: "bound", placeName: str(after.nameEn), roomId, photos: seen ? strings(obj(obj(seen.after).verification).evidence).length : 0 },
    }));
  }

  // Labels (survey/tag.ts tagFrame): the tag, with the place and the kind it may have made. Review decides them.
  for (const tag of rows.filter(r => r.entityType === "sighting" && r.action === "create" && !used.has(r.id))) {
    const after = obj(tag.after);
    const placeId = str(after.placeId);
    const placeMade = free("place", placeId, "create");
    const madeObject = free("place", placeId, "update");
    // The kind this tag's own place points at — not any objectKind create
    // sitting elsewhere in the same call.
    const objectKindId = str(obj(placeMade?.after).objectKindId) || str(obj(madeObject?.after).objectKindId);
    const kindMade = objectKindId ? free("objectKind", objectKindId, "create") : undefined;
    out.push(made(tag, "labels", use(tag, placeMade, madeObject, kindMade), {
      levelId: null,
      undo: null,
      facts: {
        kind: "label", placeId, placeName: str(obj(placeMade?.after).nameEn), frameId: str(after.keyframeId),
        newPlace: placeMade !== undefined,
        object: objectKindId !== "",
      },
    }));
  }

  for (const r of rows) {
    if (used.has(r.id)) continue;
    const single = alone(r, rows);
    if (single) out.push(single);
  }
  return out;
}

/** A row that is a change by itself, or null for one the check step doesn't list. */
function alone(r: AuditRow, rows: readonly AuditRow[]): Folded | null {
  const after = obj(r.after);
  const before = obj(r.before);
  const levelId = str(after.levelId) || str(before.levelId) || null;
  const generic: Facts = { kind: "generic", action: r.action, type: r.entityType, name: str(after.nameEn) || str(before.nameEn) || r.entityId };
  const one = (group: ChangeGroup, facts: Facts, undo: UndoStep[]) => made(r, group, [r], { levelId, undo, facts });

  if (r.entityType === "roomDraft") {
    if (r.action !== "delete" || str(after.acceptedRoomId)) return null;
    const setAside = rows.some(s => s.entityType === "roomDraft" && s.entityId === r.entityId && s.action === SET_ASIDE);
    return one("drafts", { kind: "draftOff", name: str(after.nameEn), setAside }, [{ do: "restore", ...ref(r) }]);
  }
  if (!MAP_TYPES.has(r.entityType)) return null;
  if (r.action === "create" && r.entityType === "placement" && str(after.objectKindId)) {
    const p = Array.isArray(after.position) ? after.position : [];
    return one("objects", { kind: "object", objectKindId: str(after.objectKindId), sightingIds: strings(after.sightingIds), at: [num(p[0]), num(p[1])] },
      [{ do: "delete", ...ref(r) }]);
  }
  if (r.action === "create" && r.entityType === "pathway") {
    return one("pathways", { kind: "pathway", name: str(after.nameEn), lengthM: polylineLength(after.polyline) }, [{ do: "delete", ...ref(r) }]);
  }
  if (r.action === "create" && r.entityType === "entrance") {
    return one("entrances", { kind: "entrance", name: str(after.nameEn), roomId: str(after.roomId) }, [{ do: "delete", ...ref(r) }]);
  }
  if (r.action === "update") {
    const patch = patchBack(before, after);
    if (Object.keys(patch).length === 0) return null;
    // make_stop's "finish opening it" (stops/makeStop.ts): the stop was
    // already outlined in an earlier call, so this call writes only the
    // room's own opening, `{ kind: "area", walkable: true }` — Object.keys
    // of patchBack's reverse is a subset of those two fields exactly because
    // nothing else changed.
    if (
      r.entityType === "room" && str(after.kind) === "area" && after.walkable === true &&
      Object.keys(patch).every(key => key === "kind" || key === "walkable")
    ) {
      return one("stops", { kind: "stopOpened", roomId: r.entityId, roomName: str(after.nameEn) }, [{ do: "patch", ...ref(r), patch }]);
    }
    if (r.entityType === "room" && ("nameEn" in patch || "kind" in patch)) {
      return one("names", { kind: "renamed", from: str(before.nameEn), to: str(after.nameEn), kindFrom: str(before.kind), kindTo: str(after.kind) },
        [{ do: "patch", ...ref(r), patch }]);
    }
    return one("other", generic, [{ do: "patch", ...ref(r), patch }]);
  }
  if (r.action === "create" || r.action === "restore") return one("other", generic, [{ do: "delete", ...ref(r) }]);
  if (r.action === "delete") return one("other", generic, [{ do: "restore", ...ref(r) }]);
  return null;
}

/** Claude's changes in these rows, newest first. Rows with no via are a person's, and are left out. */
export function foldChanges(rows: readonly AuditRow[]): Folded[] {
  const calls = new Map<string, AuditRow[]>();
  for (const r of rows) {
    if (!r.via) continue;
    const key = `${r.via} ${r.at.getTime()}`;
    const group = calls.get(key);
    if (group) group.push(r);
    else calls.set(key, [r]);
  }
  // Ties (same moment: several changes from one call, or two calls that land
  // in the same instant) break on the entity, then the action — never on the
  // audit id, which is a random uuid and so no order at all.
  return [...calls.values()].flatMap(foldGroup)
    .sort((a, b) => b.at.getTime() - a.at.getTime()
      || a.entityId.localeCompare(b.entityId) || a.action.localeCompare(b.action));
}

const A: Record<string, string> = {
  room: "a room", area: "an area", detail: "a detail", service: "a service space", void: "a void",
  lift: "a lift", escalator: "an escalator", stair: "a stair", ramp: "a ramp",
};
const VERBS: Record<string, string> = { create: "Added", update: "Changed", delete: "Deleted", restore: "Restored" };

/** The change's one plain line (spec §8): "Made Starbucks from a draft", "Placed wastebin by Gate 4, from 2 frames". */
export function summarise(change: Folded, names: Names): string {
  const f = change.facts;
  switch (f.kind) {
    case "fromDraft": {
      const said = f.drawingName && f.drawingName !== f.name ? ` (the drawing said ${f.drawingName})` : "";
      const as = f.roomKind && f.roomKind !== "room" ? `, as ${A[f.roomKind] ?? f.roomKind}` : "";
      return `Made ${f.name} from a draft${said}${as}`;
    }
    case "draftOff":
      return f.setAside ? `Set aside the draft ${f.name} for a person to decide` : `Rejected the draft ${f.name}`;
    case "renamed": {
      const kinds = `${A[f.kindTo] ?? f.kindTo} (was ${A[f.kindFrom] ?? f.kindFrom})`;
      if (f.from !== f.to && f.kindFrom !== f.kindTo) return `Renamed ${f.from || "a space"} to ${f.to}, and made it ${kinds}`;
      if (f.from !== f.to) return `Renamed ${f.from || "a space"} to ${f.to || "nothing"}`;
      return `Made ${f.to || "a space"} ${kinds}`;
    }
    case "stop": {
      const kind = f.stopKind ?? names.portalKind(f.portalId);
      const what = kind ? A[kind] ?? kind : "a lift or stair";
      return `Made ${f.roomName || names.room(f.roomId)} ${what} stop${f.joined ? ", joining the one on another floor" : ""}`;
    }
    case "stopOpened":
      return `Finished opening ${f.roomName || names.room(f.roomId)} as a stop`;
    case "bound":
      return `Bound ${f.placeName} to ${names.room(f.roomId)}${f.photos > 0 ? `, seen in ${count(f.photos, "photo")}` : ""}`;
    case "object": {
      const near = change.levelId ? names.near(change.levelId, f.at) : null;
      const frames = f.sightingIds.length > 0 ? `, from ${count(f.sightingIds.length, "frame")}` : "";
      return `Placed ${names.objectKind(f.objectKindId)}${near ? ` by ${near}` : ""}${frames}`;
    }
    case "pathway":
      return `Drew ${f.name || "a pathway"}, ${Math.round(f.lengthM)} m`;
    case "entrance":
      return f.name ? `Added the entrance ${f.name}, in ${names.room(f.roomId)}` : `Added an entrance in ${names.room(f.roomId)}`;
    case "label": {
      const name = f.placeName || names.place(f.placeId);
      if (f.object) return `Tagged ${name} as an object on frame ${f.frameId}`;
      return f.newPlace ? `Proposed ${name}, seen on frame ${f.frameId}` : `Tagged ${name} on frame ${f.frameId}`;
    }
    case "generic":
      return `${VERBS[f.action] ?? "Changed"} ${TYPE_WORDS[f.type] ?? f.type} ${f.name}`;
  }
}
