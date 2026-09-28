import { insidePoint, type Ring, type Vec2 } from "@oth/model";
import type { Row } from "../db/rows";
import type { auditLog } from "../db/schema";
import { SET_ASIDE } from "../drafts/service";
import type { EntityType } from "../entities/registry";
import { count } from "../mcp/results";

export type AuditRow = typeof auditLog.$inferSelect;

/**
 * The check step's groups, in the order it shows them: contract v2's nine
 * (spec §8's eight, then the frames Claude binned), then Claude's survey
 * labels, which Review decides, and anything else. Plan 6E's
 * ClaudeChangeGroup, word for word.
 */
export const CHANGE_GROUPS = [
  "rooms", "drafts", "names", "stops", "places", "objects", "pathways", "entrances", "frames", "labels", "other",
] as const;
export type ChangeGroup = (typeof CHANGE_GROUPS)[number];

/** What a change can write: the map's entities, and a survey frame, which a bin soft-deletes. */
export type TouchType = EntityType | "keyframe";

/** An entity a change wrote, at the version it left it: Undo is offered only while it still is. */
export type Touch = { type: TouchType; id: string; version: number };

/** One write that takes a change back, version-checked like any other. */
export type UndoStep =
  | { do: "delete" | "restore"; type: EntityType; id: string; version: number }
  | { do: "patch"; type: EntityType; id: string; version: number; patch: Row }
  | { do: "unaccept"; draftId: string; draftVersion: number; roomId: string; roomVersion: number }
  | { do: "unsetAside"; draftId: string; version: number }
  | { do: "unbin"; frameId: string; version: number };

/** What a change's plain line is made from. */
export type Facts =
  | { kind: "fromDraft"; roomId: string; name: string; drawingName: string; roomKind: string; areaM2: number | null; at: Vec2 | null }
  | { kind: "draftOff"; name: string }
  | { kind: "setAside"; draftId: string; name: string; reason: string }
  | { kind: "renamed"; from: string; to: string; kindFrom: string; kindTo: string }
  | { kind: "stop"; roomId: string; roomName: string; portalId: string; stopKind: string | null; joined: boolean }
  | { kind: "stopOpened"; roomId: string; roomName: string }
  | { kind: "bound"; placeId: string; placeName: string; roomId: string; photos: number }
  | { kind: "object"; objectKindId: string; sightingIds: string[]; at: Vec2 }
  | { kind: "kindMade"; kindId: string; name: string; size: { w: number; d: number; h: number }; frameId: string | null }
  | { kind: "pathway"; pathwayId: string; name: string; lengthM: number; mid: Vec2 | null }
  | { kind: "entrance"; entranceId: string; name: string; roomId: string }
  | { kind: "label"; placeId: string; placeName: string; frameId: string; newPlace: boolean; object: boolean }
  | { kind: "binned"; frameId: string; tags: number }
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
  /**
   * Its floor; null for what is on no floor by itself: a label or a binned
   * frame is on its frame's floor, and a kind of object on the floor of the
   * frame it was made for (changes.ts reads both off the frames).
   */
  levelId: string | null;
  /**
   * The entity the list reports: the key row's, except that a room made from
   * a draft reports its draft (contract v3), as its reject and set-aside do,
   * so Show frames the draft's outline. action is the key row's.
   */
  entityType: string;
  entityId: string;
  action: string;
  touches: Touch[];
  /** In the order to run them, the writes' reversed; null when the list doesn't undo it (a label is Review's). */
  undo: UndoStep[] | null;
  facts: Facts;
};

/** Names the plain lines need, from the map as it is now. */
export type Names = {
  /** A room's name now, or its id once it has none. */
  room: (id: string) => string;
  /** A live entity's name now ("" when it has none), or null when it is gone: the line then keeps the name it had. */
  current: (type: string, id: string) => string | null;
  place: (id: string) => string;
  objectKind: (id: string) => string;
  portalKind: (id: string) => string | null;
  /** The nearest named room to a point on a floor, leaving out `except` (the room the point is in, for a room's own line). */
  near: (levelId: string, at: Vec2, except?: string) => string | null;
  /** A frame as people find it: "frame 12 of L1 walk.mp4". */
  frame: (id: string) => string;
};

export const TYPE_WORDS: Record<string, string> = {
  room: "room", doorway: "doorway", entrance: "entrance", portal: "lift or stair", portalEndpoint: "stop",
  navHint: "route hint", pathway: "pathway", placement: "placement", tenant: "tenant", objectKind: "kind of object",
};
/** The map's own types: a change to one of these can be a row on its own. */
const MAP_TYPES = new Set(Object.keys(TYPE_WORDS).filter(type => type !== "objectKind"));
const AUDIT_KEYS = new Set(["id", "version", "updatedAt", "updatedBy", "deletedAt"]);

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : {});
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const num = (v: unknown): number => (typeof v === "number" ? v : 0);
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((s): s is string => typeof s === "string") : []);
const points = (v: unknown): Vec2[] =>
  Array.isArray(v) ? v.filter((p): p is [number, number] => Array.isArray(p) && typeof p[0] === "number" && typeof p[1] === "number") : [];

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

export function polylineLength(line: readonly Vec2[]): number {
  let total = 0;
  for (let i = 1; i < line.length; i++) total += Math.hypot(line[i]![0] - line[i - 1]![0], line[i]![1] - line[i - 1]![1]);
  return total;
}

/** The point halfway along a line, where "near" is judged for a pathway. */
export function midpoint(line: readonly Vec2[]): Vec2 | null {
  if (line.length === 0) return null;
  let left = polylineLength(line) / 2;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1]!;
    const b = line[i]!;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len >= left && len > 0) return [a[0] + ((b[0] - a[0]) * left) / len, a[1] + ((b[1] - a[1]) * left) / len];
    left -= len;
  }
  return line[line.length - 1]!;
}

/** A point inside an outline, where "near" is judged for a room. */
function inside(footprint: unknown): Vec2 | null {
  const ring = points(footprint);
  return ring.length >= 3 ? insidePoint(ring as Ring) : null;
}

function made(key: AuditRow, group: ChangeGroup, rows: readonly (AuditRow | undefined)[], parts: {
  levelId: string | null; undo: UndoStep[] | null; facts: Facts; touches?: Touch[]; entity?: { type: string; id: string };
}): Folded {
  const all = rows.filter((r): r is AuditRow => r !== undefined);
  // One entity written twice in a call is left at its last write's version.
  const touches = new Map<string, Touch>();
  for (const t of parts.touches ?? all.map(ref)) {
    const was = touches.get(`${t.type}:${t.id}`);
    if (!was || t.version > was.version) touches.set(`${t.type}:${t.id}`, t);
  }
  return {
    id: key.id, auditIds: all.map(r => r.id), group, at: key.at, actorId: key.actorId, via: key.via ?? "",
    levelId: parts.levelId, entityType: parts.entity?.type ?? key.entityType, entityId: parts.entity?.id ?? key.entityId, action: key.action,
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
    const area = obj(renamed.after).areaM2;
    out.push(made(room, "rooms", use(room, renamed, retired), {
      levelId: str(after.levelId) || null,
      entity: { type: "roomDraft", id: retired.entityId },
      undo: [{ do: "unaccept", draftId: retired.entityId, draftVersion: version(retired), roomId: room.entityId, roomVersion: version(room) }],
      facts: {
        kind: "fromDraft", roomId: room.entityId, name: str(after.nameEn), drawingName: str(obj(renamed.before).nameEn),
        roomKind: str(after.kind), areaM2: typeof area === "number" ? area : null, at: inside(after.footprint),
      },
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
      facts: {
        kind: "bound", placeId: place.entityId, placeName: str(after.nameEn), roomId,
        photos: seen ? strings(obj(obj(seen.after).verification).evidence).length : 0,
      },
    }));
  }

  // Frames binned (survey/frames.ts binFrame): the frame, and the tags binned with it at the same moment.
  for (const frame of rows.filter(r => r.entityType === "keyframe" && r.action === "delete")) {
    const tags = rows.filter(r => r.entityType === "sighting" && r.action === "delete" && str(obj(r.after).keyframeId) === frame.entityId);
    out.push(made(frame, "frames", use(frame, ...tags), {
      levelId: null,
      undo: [{ do: "unbin", frameId: frame.entityId, version: version(frame) }],
      facts: { kind: "binned", frameId: frame.entityId, tags: tags.length },
      touches: [{ type: "keyframe", id: frame.entityId, version: version(frame) }],
    }));
  }

  // Labels (survey/tag.ts tagFrame): the tag, with the place it may have made or made an object. Review decides them.
  for (const tag of rows.filter(r => r.entityType === "sighting" && r.action === "create" && !used.has(r.id))) {
    const after = obj(tag.after);
    const placeId = str(after.placeId);
    const placeMade = free("place", placeId, "create");
    const madeObject = free("place", placeId, "update");
    const objectKindId = str(obj(placeMade?.after).objectKindId) || str(obj(madeObject?.after).objectKindId);
    out.push(made(tag, "labels", use(tag, placeMade, madeObject), {
      levelId: null,
      undo: null,
      facts: {
        kind: "label", placeId, placeName: str(obj(placeMade?.after).nameEn), frameId: str(after.keyframeId),
        newPlace: placeMade !== undefined,
        object: objectKindId !== "",
      },
    }));
  }

  // A kind is on no floor: one made for a tag goes with the tag's frame.
  const frameOfCall = rows.find(r => r.entityType === "sighting" && r.action === "create")?.after;
  for (const r of rows) {
    if (used.has(r.id)) continue;
    const single = alone(r, str(obj(frameOfCall).keyframeId) || null);
    if (single) out.push(single);
  }
  return out;
}

/** A row that is a change by itself, or null for one the check step doesn't list. */
function alone(r: AuditRow, frameOfCall: string | null): Folded | null {
  const after = obj(r.after);
  const before = obj(r.before);
  const levelId = str(after.levelId) || str(before.levelId) || null;
  const generic: Facts = { kind: "generic", action: r.action, type: r.entityType, name: str(after.nameEn) || str(before.nameEn) || r.entityId };
  const one = (group: ChangeGroup, facts: Facts, undo: UndoStep[]) => made(r, group, [r], { levelId, undo, facts });

  if (r.entityType === "roomDraft") {
    // A set-aside writes nothing to the draft: its mark is the change, and Undo takes the mark back.
    if (r.action === SET_ASIDE) {
      return one("drafts", { kind: "setAside", draftId: r.entityId, name: str(after.nameEn), reason: str(after.reason) },
        [{ do: "unsetAside", draftId: r.entityId, version: version(r) }]);
    }
    if (r.action !== "delete" || str(after.acceptedRoomId)) return null;
    return one("drafts", { kind: "draftOff", name: str(after.nameEn) }, [{ do: "restore", ...ref(r) }]);
  }
  if (r.entityType === "objectKind" && r.action === "create") {
    const size = obj(after.size);
    return made(r, "objects", [r], {
      levelId: null,
      undo: [{ do: "delete", ...ref(r) }],
      facts: {
        kind: "kindMade", kindId: r.entityId, name: str(after.nameEn),
        size: { w: num(size.w), d: num(size.d), h: num(size.h) }, frameId: frameOfCall,
      },
    });
  }
  if (!MAP_TYPES.has(r.entityType)) return null;
  if (r.action === "create" && r.entityType === "placement" && str(after.objectKindId)) {
    const p = Array.isArray(after.position) ? after.position : [];
    return one("objects", { kind: "object", objectKindId: str(after.objectKindId), sightingIds: strings(after.sightingIds), at: [num(p[0]), num(p[1])] },
      [{ do: "delete", ...ref(r) }]);
  }
  if (r.action === "create" && r.entityType === "pathway") {
    const line = points(after.polyline);
    return one("pathways", { kind: "pathway", pathwayId: r.entityId, name: str(after.nameEn), lengthM: polylineLength(line), mid: midpoint(line) },
      [{ do: "delete", ...ref(r) }]);
  }
  if (r.action === "create" && r.entityType === "entrance") {
    return one("entrances", { kind: "entrance", entranceId: r.entityId, name: str(after.nameEn), roomId: str(after.roomId) }, [{ do: "delete", ...ref(r) }]);
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

/** The frame a change is filmed on, for the ones whose floor is their frame's. */
export function frameOf(facts: Facts): string | null {
  if (facts.kind === "label" || facts.kind === "binned") return facts.frameId;
  if (facts.kind === "kindMade") return facts.frameId;
  return null;
}

const A: Record<string, string> = {
  room: "a room", area: "an area", detail: "a detail", service: "a service space", void: "a void",
  lift: "a lift", escalator: "an escalator", stair: "a stair", ramp: "a ramp",
};
const VERBS: Record<string, string> = { create: "Added", update: "Changed", delete: "Deleted", restore: "Restored" };

/** An area as the check list says it: 40 m², or 2.5 m² under ten. */
function squareMetres(area: number): string {
  return `${area < 10 ? Math.round(area * 10) / 10 : Math.round(area)} m²`;
}

/** A length or size in metres, to the centimetre, with no trailing zeros. */
const metres = (n: number) => String(Math.round(n * 100) / 100);

/** The change's one plain line (spec §8): "Made Starbucks from a draft", "Placed wastebin by Gate 4, from 2 frames". */
export function summarise(change: Folded, names: Names): string {
  const f = change.facts;
  switch (f.kind) {
    case "fromDraft": {
      const name = names.current("room", f.roomId) || f.name;
      const said = f.drawingName && f.drawingName !== name ? ` (the drawing said ${f.drawingName})` : "";
      const as = f.roomKind && f.roomKind !== "room" ? `, as ${A[f.roomKind] ?? f.roomKind}` : "";
      const near = change.levelId && f.at ? names.near(change.levelId, f.at, f.roomId) : null;
      const where = [f.areaM2 !== null ? squareMetres(f.areaM2) : "", near ? `near ${near}` : ""].filter(Boolean).join(" ");
      return `Made ${name} from a draft${said}${as}${where ? `, ${where}` : ""}`;
    }
    case "draftOff":
      return `Rejected the draft ${f.name}`;
    case "setAside":
      return `Set aside ${f.name} for you: ${f.reason}`;
    case "renamed": {
      const kinds = `${A[f.kindTo] ?? f.kindTo} (was ${A[f.kindFrom] ?? f.kindFrom})`;
      if (f.from !== f.to && f.kindFrom !== f.kindTo) return `Renamed ${f.from || "a space"} to ${f.to}, and made it ${kinds}`;
      if (f.from !== f.to) return `Renamed ${f.from || "a space"} to ${f.to || "nothing"}`;
      return `Made ${f.to || "a space"} ${kinds}`;
    }
    case "stop": {
      const kind = f.stopKind ?? names.portalKind(f.portalId);
      const what = kind ? A[kind] ?? kind : "a lift or stair";
      const room = names.current("room", f.roomId) || f.roomName || names.room(f.roomId);
      return `Made ${room} ${what} stop${f.joined ? ", joining the one on another floor" : ""}`;
    }
    case "stopOpened":
      return `Finished opening ${names.current("room", f.roomId) || f.roomName || names.room(f.roomId)} as a stop`;
    case "bound": {
      const place = names.current("place", f.placeId) || f.placeName;
      return `Bound ${place} to ${names.room(f.roomId)}${f.photos > 0 ? `, seen in ${count(f.photos, "photo")}` : ""}`;
    }
    case "object": {
      const near = change.levelId ? names.near(change.levelId, f.at) : null;
      const frames = f.sightingIds.length > 0 ? `, from ${count(f.sightingIds.length, "frame")}` : "";
      return `Placed ${names.objectKind(f.objectKindId)}${near ? ` by ${near}` : ""}${frames}`;
    }
    case "kindMade":
      return `Made the kind ${names.current("objectKind", f.kindId) || f.name}, ${metres(f.size.w)} × ${metres(f.size.d)} × ${metres(f.size.h)} m`;
    case "pathway": {
      const name = names.current("pathway", f.pathwayId) ?? f.name;
      const near = change.levelId && f.mid ? names.near(change.levelId, f.mid) : null;
      return `Drew ${name || "a pathway"}, ${Math.round(f.lengthM)} m${near ? `, near ${near}` : ""}`;
    }
    case "entrance": {
      const name = names.current("entrance", f.entranceId) ?? f.name;
      return name ? `Added the entrance ${name}, in ${names.room(f.roomId)}` : `Added an entrance in ${names.room(f.roomId)}`;
    }
    case "label": {
      const name = names.current("place", f.placeId) || f.placeName || names.place(f.placeId);
      const frame = names.frame(f.frameId);
      if (f.object) return `Tagged ${name} as an object on ${frame}`;
      return f.newPlace ? `Proposed ${name}, seen on ${frame}` : `Tagged ${name} on ${frame}`;
    }
    case "binned":
      return `Binned ${names.frame(f.frameId)}`;
    case "generic":
      return `${VERBS[f.action] ?? "Changed"} ${TYPE_WORDS[f.type] ?? f.type} ${f.name}`;
  }
}
