import {
  coverage, draftMatch, labelPoint, live, namedLikeAStop, placeLevels, pointInPolygon, ringArea,
  type Level, type MapModel, type Ring, type Room, type RoomDraft, type ValidationReport, type Vec2,
} from "@oth/model";
import type { LineCheck } from "../drafts/lineUp";
import type { DraftTally } from "../drafts/service";
import type { SpotReport } from "../objects/spots";

const round2 = (n: number) => Math.round(n * 100) / 100;

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

/** A floor by its code ("L1", any case) or its id ("oth-L1"). */
export function findLevel(model: MapModel, floor: string): Level | null {
  const wanted = floor.trim().toLowerCase();
  return live(model.levels).find(l => l.id.toLowerCase() === wanted || l.code.toLowerCase() === wanted) ?? null;
}

/** get_floor's parts: the summary, then each list that comes a page at a time (contract v2). */
export const FLOOR_PARTS = ["summary", "rooms", "places", "pathways", "entrances", "objects"] as const;
export type FloorPart = (typeof FLOOR_PARTS)[number];

/**
 * Every get_floor reply stays under this: Claude Code sets a longer tool
 * result aside in a file it then struggles to read (the rehearsal's L1 was
 * 58,722 characters), so a page is cut short to fit and says where the next
 * one starts.
 */
export const MAX_REPLY_CHARS = 40_000;

const at1 = (p: Vec2): [number, number] => [round1(p[0]), round1(p[1])];

function lineLength(line: readonly Vec2[]): number {
  let total = 0;
  for (let i = 1; i < line.length; i++) total += Math.hypot(line[i]![0] - line[i - 1]![0], line[i]![1] - line[i - 1]![1]);
  return total;
}

/**
 * Every part comes in id order. The database gives rows back in the order it
 * stores them, and an edit moves a row to the end, so an edit between two
 * page reads would skip one item and repeat another.
 */
function byId<T extends { id: string }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** The frames a place gives: at most this many, so a page of places still fits a reply. */
export const PLACE_FRAMES = 3;

type PlaceFrame = { id: string; file: string; timeMs?: number; n?: number };

/**
 * Up to PLACE_FRAMES frames each place was tagged on, for view_frame: the
 * first, middle and last filmed, so they show it from along the walk. Each
 * names its footage and its time in it, or its number there when the frame
 * has no time.
 */
function placeFrames(model: MapModel): Map<string, PlaceFrame[]> {
  const file = new Map(live(model.captures).map(c => [c.id, c.filename]));
  const frames = live(model.keyframes)
    .filter(k => file.has(k.captureId))
    .sort((a, b) => a.captureId.localeCompare(b.captureId) || (a.timeMs ?? 0) - (b.timeMs ?? 0) || a.id.localeCompare(b.id));
  const order = new Map<string, { at: number; frame: PlaceFrame }>();
  const counted = new Map<string, number>();
  frames.forEach((k, at) => {
    const n = (counted.get(k.captureId) ?? 0) + 1;
    counted.set(k.captureId, n);
    order.set(k.id, { at, frame: { id: k.id, file: file.get(k.captureId)!, ...(k.timeMs !== undefined ? { timeMs: k.timeMs } : { n }) } });
  });
  const seenOn = new Map<string, Set<string>>();
  for (const s of live(model.sightings)) {
    if (!order.has(s.keyframeId)) continue;
    seenOn.set(s.placeId, (seenOn.get(s.placeId) ?? new Set<string>()).add(s.keyframeId));
  }
  const out = new Map<string, PlaceFrame[]>();
  for (const [placeId, ids] of seenOn) {
    const all = [...ids].map(id => order.get(id)!).sort((a, b) => a.at - b.at);
    const picked = all.length <= PLACE_FRAMES ? all : [all[0]!, all[Math.floor((all.length - 1) / 2)]!, all[all.length - 1]!];
    out.set(placeId, picked.map(p => p.frame));
  }
  return out;
}

/**
 * One part's items on one floor, in id order, each leaving out what is at its
 * default (a version 0, no name, not walkable, unverified, no room), so L1's
 * 260 rooms fit a page. A room's centre is where its name goes on the plan,
 * in metres.
 */
function partItems(model: MapModel, level: Level, part: Exclude<FloorPart, "summary" | "objects">): Record<string, unknown>[] {
  const version = (v: number) => (v ? { version: v } : {});
  const named = (name: string) => (name.trim() ? { name: name.trim() } : {});
  switch (part) {
    case "rooms": {
      const boundTo = new Map(live(model.places).filter(p => p.roomId && !p.objectKindId).map(p => [p.roomId!, p]));
      const portalKind = new Map(live(model.portals).map(p => [p.id, p.kind]));
      const stopIn = new Map(live(model.portalEndpoints).filter(e => e.levelId === level.id)
        .map(e => [e.roomId, portalKind.get(e.portalId) ?? "stop"]));
      return byId(live(model.rooms).filter(r => r.levelId === level.id)).map(r => {
        const place = boundTo.get(r.id);
        const stop = stopIn.get(r.id);
        return {
          id: r.id, ...named(r.nameEn), kind: r.kind,
          ...(r.walkable ? { walkable: true } : {}),
          ...(r.verification.status !== "unverified" ? { verification: r.verification.status } : {}),
          ...version(r.version),
          centre: at1(labelPoint(r.footprint, r.holes, 0.5).point),
          ...(place ? { place: { id: place.id, name: place.nameEn } } : {}),
          ...(stop ? { stop } : {}),
        };
      });
    }
    case "places": {
      const floorOf = placeLevels(model);
      const frames = placeFrames(model);
      return byId(live(model.places).filter(p => floorOf.get(p.id) === level.id)).map(p => ({
        id: p.id, name: p.nameEn, category: p.category, status: p.status,
        ...(p.proposedBy ? { proposedBy: p.proposedBy } : {}),
        ...(p.roomId ? { roomId: p.roomId } : {}),
        ...(p.objectKindId ? { objectKindId: p.objectKindId } : {}),
        ...(p.pathwayKindId ? { pathwayKindId: p.pathwayKindId } : {}),
        ...version(p.version),
        ...(frames.has(p.id) ? { frames: frames.get(p.id)! } : {}),
      }));
    }
    case "pathways":
      return byId(live(model.pathways).filter(p => p.levelId === level.id)).map(p => ({
        id: p.id, ...named(p.nameEn), ...(p.kindId ? { kindId: p.kindId } : {}), ...version(p.version),
        widthM: p.widthM, lengthM: round1(lineLength(p.polyline)), from: at1(p.polyline[0]!), to: at1(p.polyline[p.polyline.length - 1]!),
      }));
    case "entrances":
      return byId(live(model.entrances).filter(e => e.levelId === level.id)).map(e => ({
        id: e.id, ...named(e.nameEn), roomId: e.roomId, point: at1(e.point), ...version(e.version),
      }));
  }
}

/** A page of items, cut short when the reply would pass MAX_REPLY_CHARS, with `next` when there is more. */
function page(head: Record<string, unknown>, key: string, all: readonly Record<string, unknown>[], offset: number, limit: number) {
  const build = (items: readonly Record<string, unknown>[]) => ({
    ...head, total: all.length, offset, [key]: items, ...(offset + items.length < all.length ? { next: offset + items.length } : {}),
  });
  let items = all.slice(offset, offset + limit);
  let reply = build(items);
  for (let size = JSON.stringify(reply).length; size >= MAX_REPLY_CHARS && items.length > 1; size = JSON.stringify(reply).length) {
    items = items.slice(0, Math.max(1, Math.floor((items.length * MAX_REPLY_CHARS * 0.95) / size)));
    reply = build(items);
  }
  return reply;
}

/**
 * get_floor (contract v2): a floor's summary, the default, or one part a page
 * at a time, as list_frames pages. get gives any one thing in full.
 */
export function floorPart(
  model: MapModel, level: Level, names: ReadonlyMap<string, string>, part: FloorPart, offset: number, limit: number,
) {
  if (part === "summary") {
    const floorOf = placeLevels(model);
    const here = live(model.places).filter(p => floorOf.get(p.id) === level.id);
    const confirmed = here.filter(p => p.status === "confirmed");
    return {
      floor: {
        id: level.id, code: level.code, name: level.nameEn, ...(level.version ? { version: level.version } : {}),
        owners: level.ownerIds.map(id => names.get(id) ?? id),
      },
      counts: {
        rooms: live(model.rooms).filter(r => r.levelId === level.id).length,
        stops: live(model.portalEndpoints).filter(e => e.levelId === level.id).length,
        pathways: live(model.pathways).filter(p => p.levelId === level.id).length,
        entrances: live(model.entrances).filter(e => e.levelId === level.id).length,
        places: {
          confirmed: confirmed.length,
          proposed: here.length - confirmed.length,
          unbound: confirmed.filter(p => !p.roomId && !p.objectKindId && !p.pathwayKindId).length,
        },
        objectKinds: live(model.objectKinds).length,
        objects: live(model.placements).filter(p => p.levelId === level.id && p.objectKindId).length,
      },
      parts: FLOOR_PARTS.filter(p => p !== "summary"),
    };
  }
  const head = { floor: level.code, part };
  if (part === "objects") {
    const places = live(model.places);
    // Kinds are the same on every floor (Plan 6A), so each is listed with its places, wherever they were filmed.
    const kinds = byId(live(model.objectKinds)).map(k => ({
      id: k.id, name: k.nameEn, size: k.size, look: k.assetId ? "Model" : "Box",
      placeIds: byId(places.filter(p => p.objectKindId === k.id)).map(p => p.id), ...(k.version ? { version: k.version } : {}),
    }));
    const objects = byId(live(model.placements).filter(p => p.levelId === level.id && p.objectKindId)).map(p => ({
      id: p.id, kindId: p.objectKindId!, position: [round2(p.position[0]), round2(p.position[1])],
      rotationDeg: p.rotationDeg, sightings: p.sightingIds.length, ...(p.version ? { version: p.version } : {}),
    }));
    return page({ ...head, kinds }, "objects", objects, offset, limit);
  }
  return page(head, part, partItems(model, level, part), offset, limit);
}

/**
 * check_floor: the issues on one floor that the publish gate runs, errors
 * first, at most `max` of them, of the codes asked for when `codes` is given.
 * total counts every one that matched.
 */
export function floorIssues(report: ValidationReport, levelId: string, max = 100, codes?: readonly string[]) {
  const wanted = codes && codes.length > 0 ? new Set(codes) : null;
  const here = report.issues.filter(i =>
    (i.levelId === levelId || (i.entityType === "level" && i.entityId === levelId)) && (!wanted || wanted.has(i.code)));
  return {
    ...(wanted ? { codes: [...codes!] } : {}),
    total: here.length,
    errors: here.filter(i => i.severity === "error").length,
    warnings: here.filter(i => i.severity === "warning").length,
    issues: here.slice(0, max).map(({ severity, code, message, entityType, entityId }) => ({ severity, code, message, entityType, entityId })),
    ...(here.length > max ? { more: here.length - max } : {}),
  };
}

export const FRAME_FILTERS = ["untagged", "proposed", "tagged", "all"] as const;
export type FrameFilter = (typeof FRAME_FILTERS)[number];

/**
 * list_frames: a floor's frames in filming order. "tagged" means every tag
 * on the frame is confirmed; a frame with any claim left is "proposed".
 */
export function frameList(model: MapModel, levelId: string, show: FrameFilter, limit: number, offset: number) {
  const captures = new Set(live(model.captures).filter(c => c.levelId === levelId).map(c => c.id));
  const tags = new Map<string, { status: string }[]>();
  for (const s of live(model.sightings)) tags.set(s.keyframeId, [...(tags.get(s.keyframeId) ?? []), s]);
  const frames = live(model.keyframes)
    .filter(k => captures.has(k.captureId))
    .sort((a, b) => a.captureId.localeCompare(b.captureId) || (a.timeMs ?? 0) - (b.timeMs ?? 0) || a.id.localeCompare(b.id))
    .map(k => {
      const on = tags.get(k.id) ?? [];
      return { id: k.id, captureId: k.captureId, timeMs: k.timeMs ?? null, tags: on.length, proposed: on.filter(s => s.status === "proposed").length };
    })
    .filter(f => show === "all"
      || (show === "untagged" && f.tags === 0)
      || (show === "proposed" && f.proposed > 0)
      || (show === "tagged" && f.tags > 0 && f.proposed === 0));
  return { total: frames.length, offset, frames: frames.slice(offset, offset + limit) };
}

/** view_frame's text: what is already tagged on a frame. */
export function frameTags(model: MapModel, frameId: string) {
  const places = new Map(live(model.places).map(p => [p.id, p]));
  return live(model.sightings).filter(s => s.keyframeId === frameId).map(s => {
    const place = places.get(s.placeId);
    return {
      sightingId: s.id, placeId: s.placeId, name: place?.nameEn ?? "", category: place?.category ?? null,
      status: s.status, ...(s.box ? { box: s.box } : {}),
    };
  });
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** An outline's area in square metres, its holes taken out. */
function areaOf(footprint: Ring, holes: readonly Ring[]): number {
  return Math.abs(ringArea(footprint)) - holes.reduce((sum, h) => sum + Math.abs(ringArea(h)), 0);
}

/** At most this many rooms under one draft: a corridor's draft can run past dozens. */
const MAX_OVERLAPS = 5;

/**
 * The rooms a draft lies over, most first, each with its share: how much of
 * the draft's area is over that room, 0 to 1. A draft that is the same space
 * as a room has a share near 1 over it; a shop drawn inside a concourse has
 * the concourse's. The smaller of the two outlines is sampled, so a small
 * room is never stepped over by a large draft's grid.
 */
export function draftOverlaps(draft: RoomDraft, rooms: readonly Room[]): { roomId: string; name: string; share: number }[] {
  if (!draft.footprint) return [];
  const outline = { footprint: draft.footprint, holes: draft.holes };
  const draftArea = areaOf(draft.footprint, draft.holes);
  if (!(draftArea > 0)) return [];
  const out: { roomId: string; name: string; share: number }[] = [];
  for (const r of rooms) {
    const roomArea = areaOf(r.footprint, r.holes);
    const overlap = roomArea <= draftArea ? coverage(outline, r) * roomArea : coverage(r, outline) * draftArea;
    const share = Math.min(1, round2(overlap / draftArea));
    if (share > 0) out.push({ roomId: r.id, name: r.nameEn, share });
  }
  return out.sort((a, b) => b.share - a.share || a.roomId.localeCompare(b.roomId)).slice(0, MAX_OVERLAPS);
}

/**
 * list_drafts: a floor's drafts waiting for a decision, largest first, a page
 * at a time, with how the floor's drafts stand, and lineUp when the drawing
 * doesn't line up with the rooms already on the floor (contract v3), or
 * linedUp when it does (v4). The caller leaves out the drafts set aside for
 * a person. onMapAs is the room a draft copies, by Build's own rule
 * (draftMatch); overlaps are the rooms it lies over, with the share of it
 * over each.
 */
export function draftList(
  code: string, waiting: readonly RoomDraft[], tally: DraftTally, rooms: readonly Room[], limit: number, offset: number,
  { lineUp, linedUp }: LineCheck = {},
) {
  return {
    floor: code,
    counts: tally,
    ...(lineUp ? { lineUp } : {}),
    ...(linedUp ? { linedUp } : {}),
    total: waiting.length,
    offset,
    drafts: waiting.slice(offset, offset + limit).map(d => ({
      id: d.id, version: d.version, name: d.nameEn, kind: d.kind, areaM2: round1(d.areaM2),
      labelPoint: [round1(d.labelPoint[0]), round1(d.labelPoint[1])],
      open: !d.footprint, onMapAs: draftMatch(d, rooms).copyOf?.id ?? null, overlaps: draftOverlaps(d, rooms), likeAStop: namedLikeAStop(d.nameEn),
    })),
  };
}

/**
 * suggest_object_spots: each object, the rooms that fixed where it stands by
 * the names people know them by, its frames, and the placement to create as
 * it is, with a free id, and the room it stands in as its roomId: the anchor
 * room that holds it, else the first walkable room that does (contract v5).
 * `takenIds` holds every placement id, deleted ones too, since an id is a
 * primary key.
 */
export function spotsView(model: MapModel, level: Level, report: SpotReport, takenIds: ReadonlySet<string>) {
  const kinds = new Map(live(model.objectKinds).map(k => [k.id, k]));
  const rooms = live(model.rooms).filter(r => r.levelId === level.id);
  const roomById = new Map(rooms.map(r => [r.id, r]));
  const roomName = new Map(rooms.map(r => [r.id, r.nameEn]));
  const bound = new Map(live(model.places).filter(p => p.roomId && !p.objectKindId).map(p => [p.roomId!, p.nameEn]));
  const frameOf = new Map(live(model.sightings).map(s => [s.id, s.keyframeId]));
  const taken = new Set(takenIds);
  const freeId = (kindName: string) => {
    const base = `${level.code}-${kindName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "object"}`;
    let n = 1;
    while (taken.has(`${base}-${n}`)) n++;
    taken.add(`${base}-${n}`);
    return `${base}-${n}`;
  };
  return {
    floor: level.code,
    spots: report.spots.map(s => {
      const kind = kinds.get(s.objectKindId);
      // L1's Stadium, traced over the West Concourses and first in the model, took a spot anchored on and standing in one.
      const holds = (r: Room | undefined): r is Room => r !== undefined && pointInPolygon(s.position, r.footprint, r.holes);
      const standsIn = s.anchors.map(id => roomById.get(id)).find(holds) ?? rooms.find(r => r.walkable && holds(r));
      return {
        kind: kind?.nameEn ?? s.objectKindId,
        confidence: s.confidence,
        anchors: s.anchors.map(id => ({ id, name: bound.get(id) ?? (roomName.get(id) || id) })),
        frames: s.sightingIds.map(id => frameOf.get(id) ?? id),
        placement: {
          id: freeId(kind?.nameEn ?? "object"),
          levelId: level.id,
          objectKindId: s.objectKindId,
          ...(standsIn ? { roomId: standsIn.id } : {}),
          position: [round2(s.position[0]), round2(s.position[1]), 0],
          rotationDeg: Math.round(s.rotationDeg * 10) / 10,
          sightingIds: s.sightingIds,
        },
      };
    }),
    unplaced: report.unplaced.map(u => ({ ...u, kind: kinds.get(u.objectKindId)?.nameEn ?? u.objectKindId })),
    alreadyPlaced: report.alreadyPlaced,
  };
}
