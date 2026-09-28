import { live, placeLevels, type Level, type MapModel, type ValidationReport } from "@oth/model";

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

/** get_floor: one floor as ids, names, kinds and versions (spec §6.3); get gives any one in full. */
export function floorOutline(model: MapModel, level: Level, names: ReadonlyMap<string, string>) {
  const floorOf = placeLevels(model);
  const places = live(model.places);
  const boundTo = new Map(places.filter(p => p.roomId).map(p => [p.roomId!, p]));
  const portals = new Map(live(model.portals).map(p => [p.id, p]));
  return {
    floor: {
      id: level.id, code: level.code, name: level.nameEn, version: level.version,
      owners: level.ownerIds.map(id => names.get(id) ?? id),
    },
    rooms: live(model.rooms).filter(r => r.levelId === level.id).map(r => {
      const place = boundTo.get(r.id);
      return {
        id: r.id, name: r.nameEn, kind: r.kind, version: r.version, walkable: r.walkable,
        verification: r.verification.status,
        ...(place ? { place: { id: place.id, name: place.nameEn } } : {}),
      };
    }),
    pathways: live(model.pathways).filter(p => p.levelId === level.id)
      .map(p => ({ id: p.id, name: p.nameEn, kindId: p.kindId ?? null, version: p.version })),
    entrances: live(model.entrances).filter(e => e.levelId === level.id)
      .map(e => ({ id: e.id, name: e.nameEn, roomId: e.roomId, version: e.version })),
    lifts: live(model.portalEndpoints).filter(e => e.levelId === level.id).map(e => {
      const portal = portals.get(e.portalId);
      return { id: e.id, portalId: e.portalId, kind: portal?.kind ?? "unknown", name: portal?.nameEn ?? "", roomId: e.roomId, version: e.version };
    }),
    places: places.filter(p => floorOf.get(p.id) === level.id).map(p => ({
      id: p.id, name: p.nameEn, category: p.category, status: p.status, roomId: p.roomId ?? null, version: p.version,
    })),
  };
}

/** check_floor: the issues on one floor that the publish gate runs, errors first. */
export function floorIssues(report: ValidationReport, levelId: string, max = 100) {
  const here = report.issues.filter(i => i.levelId === levelId || (i.entityType === "level" && i.entityId === levelId));
  return {
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
