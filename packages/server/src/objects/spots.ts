import { facingRotation, insidePoint, live, pointInPolygon, type MapModel, type Room, type Vec2 } from "@oth/model";

export type ObjectSpot = {
  objectKindId: string;
  position: Vec2;
  rotationDeg: number;
  sightingIds: string[];
  confidence: "high" | "low";
  /** The rooms whose fronts fixed the position; none for a guess from filming order. */
  anchors: string[];
};
export type Unplaced = { sightingId: string; frameId: string; objectKindId: string; reason: string };
export type SpotReport = { spots: ObjectSpot[]; unplaced: Unplaced[]; alreadyPlaced: number };

/** Frames either side of a sighting whose bound places fix where it was taken (spec §5.4 step 1). */
export const NEAR_FRAMES = 3;
/** Two sightings this close, and this few frames apart, are one object (spec §5.4 step 3). */
export const MERGE_M = 3;
export const MERGE_FRAMES = 10;
/** An object stands this far in from the edge, beyond half its depth. */
const EDGE_GAP_M = 0.1;
/** How far to step off an edge to see which side the floor is on. */
const PROBE_M = 0.05;
/** How far past an edge to look for more walkable floor: if there is some, two areas share the edge. */
const SHARED_EDGE_M = 0.3;

type Frame = { id: string; captureId: string; index: number };
type Fix = { point: Vec2; anchors: string[] };

const dist = (p: Vec2, q: Vec2) => Math.hypot(p[0] - q[0], p[1] - q[1]);

function nearestOnSegment(p: Vec2, a: Vec2, b: Vec2): Vec2 {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
  return [a[0] + t * dx, a[1] + t * dy];
}

function edges(room: Room): [Vec2, Vec2][] {
  const out: [Vec2, Vec2][] = [];
  for (const ring of [room.footprint, ...room.holes]) {
    for (let i = 0; i < ring.length; i++) out.push([ring[i]!, ring[(i + 1) % ring.length]!]);
  }
  return out;
}

const onFloor = (p: Vec2, walkable: readonly Room[]) => walkable.some(r => pointInPolygon(p, r.footprint, r.holes));

/** The point itself on walkable floor, or else the nearest point of the walkable floor's outlines. */
function ontoWalkable(p: Vec2, walkable: readonly Room[]): Vec2 {
  if (onFloor(p, walkable)) return p;
  let best: Vec2 = p;
  let bestD = Infinity;
  for (const r of walkable) {
    for (const [a, b] of edges(r)) {
      const q = nearestOnSegment(p, a, b);
      const d = dist(p, q);
      if (d < bestD) {
        bestD = d;
        best = q;
      }
    }
  }
  return best;
}

/**
 * The nearest point on the walkable floor's outer edge, and the way into the
 * floor from it. An edge two walkable areas share is not an edge anyone stands
 * a bin against, so an edge with walkable floor just beyond it is passed over.
 */
function nearestEdge(p: Vec2, walkable: readonly Room[]): { at: Vec2; inward: Vec2 } | null {
  let best: { at: Vec2; inward: Vec2 } | null = null;
  let bestD = Infinity;
  for (const r of walkable) {
    for (const [a, b] of edges(r)) {
      const len = dist(a, b);
      if (len === 0) continue;
      const q = nearestOnSegment(p, a, b);
      const d = dist(p, q);
      if (d >= bestD) continue;
      const n: Vec2 = [-(b[1] - a[1]) / len, (b[0] - a[0]) / len];
      const inward: Vec2 = pointInPolygon([q[0] + n[0] * PROBE_M, q[1] + n[1] * PROBE_M], r.footprint, r.holes) ? n : [-n[0], -n[1]];
      if (onFloor([q[0] - inward[0] * SHARED_EDGE_M, q[1] - inward[1] * SHARED_EDGE_M], walkable)) continue;
      bestD = d;
      best = { at: q, inward };
    }
  }
  return best;
}

/** This floor's frames, per capture, in filming order: list_frames's order. */
function framesOn(model: MapModel, levelId: string): Map<string, Frame[]> {
  const captures = new Set(live(model.captures).filter(c => c.levelId === levelId).map(c => c.id));
  const byCapture = new Map<string, Frame[]>();
  const sorted = live(model.keyframes)
    .filter(k => captures.has(k.captureId))
    .sort((a, b) => a.captureId.localeCompare(b.captureId) || (a.timeMs ?? 0) - (b.timeMs ?? 0) || a.id.localeCompare(b.id));
  for (const k of sorted) {
    const list = byCapture.get(k.captureId) ?? [];
    list.push({ id: k.id, captureId: k.captureId, index: list.length });
    byCapture.set(k.captureId, list);
  }
  return byCapture;
}

/** Where each frame was taken (spec §5.4 step 1): among its anchors' fronts, else between its neighbours'. */
function fixes(model: MapModel, levelId: string, byCapture: Map<string, Frame[]>, walkable: readonly Room[]): Map<string, Fix | null> {
  const rooms = new Map(live(model.rooms).filter(r => r.levelId === levelId).map(r => [r.id, r]));
  const anchorOf = new Map<string, string>();
  for (const p of live(model.places)) {
    if (p.roomId && rooms.has(p.roomId) && !p.objectKindId && !p.pathwayKindId) anchorOf.set(p.id, p.roomId);
  }
  const roomsIn = new Map<string, Set<string>>();
  for (const s of live(model.sightings)) {
    const room = anchorOf.get(s.placeId);
    if (!room) continue;
    roomsIn.set(s.keyframeId, (roomsIn.get(s.keyframeId) ?? new Set<string>()).add(room));
  }
  const fronts = new Map<string, Vec2>();
  const front = (roomId: string): Vec2 => {
    const known = fronts.get(roomId);
    if (known) return known;
    const room = rooms.get(roomId)!;
    const found = ontoWalkable(insidePoint(room.footprint, room.holes), walkable);
    fronts.set(roomId, found);
    return found;
  };

  const out = new Map<string, Fix | null>();
  for (const frames of byCapture.values()) {
    const direct = frames.map((_, i): Fix | null => {
      const near = new Set<string>();
      for (let j = Math.max(0, i - NEAR_FRAMES); j <= Math.min(frames.length - 1, i + NEAR_FRAMES); j++) {
        for (const room of roomsIn.get(frames[j]!.id) ?? []) near.add(room);
      }
      if (near.size === 0) return null;
      const anchors = [...near].sort();
      const points = anchors.map(front);
      const mean: Vec2 = [points.reduce((s, p) => s + p[0], 0) / points.length, points.reduce((s, p) => s + p[1], 0) / points.length];
      return { point: ontoWalkable(mean, walkable), anchors };
    });
    frames.forEach((frame, i) => {
      if (direct[i]) {
        out.set(frame.id, direct[i]!);
        return;
      }
      let before: Fix | null = null;
      for (let j = i - 1; j >= 0 && !before; j--) before = direct[j] ?? null;
      let after: Fix | null = null;
      for (let j = i + 1; j < frames.length && !after; j++) after = direct[j] ?? null;
      const point = before && after
        ? ontoWalkable([(before.point[0] + after.point[0]) / 2, (before.point[1] + after.point[1]) / 2], walkable)
        : (before ?? after)?.point ?? null;
      out.set(frame.id, point ? { point, anchors: [] } : null);
    });
  }
  return out;
}

type Candidate = { sightingId: string; frame: Frame; objectKindId: string; position: Vec2; rotationDeg: number; anchors: string[] };

/** Spec §5.4 steps 1–3 for one floor: where each object filmed there probably stands. Read-only. */
export function objectSpotReport(model: MapModel, levelId: string): SpotReport {
  const walkable = live(model.rooms).filter(r => r.levelId === levelId && r.walkable);
  const kinds = new Map(live(model.objectKinds).map(k => [k.id, k]));
  const kindOf = new Map<string, string>();
  for (const p of live(model.places)) if (p.objectKindId && kinds.has(p.objectKindId)) kindOf.set(p.id, p.objectKindId);
  const byCapture = framesOn(model, levelId);
  const frameAt = new Map([...byCapture.values()].flat().map(f => [f.id, f]));
  const placed = new Set(live(model.placements).flatMap(p => p.sightingIds));
  const seen = live(model.sightings).filter(s => kindOf.has(s.placeId) && frameAt.has(s.keyframeId));
  const waiting = seen.filter(s => !placed.has(s.id));
  const fixAt = fixes(model, levelId, byCapture, walkable);

  const candidates: Candidate[] = [];
  const unplaced: Unplaced[] = [];
  for (const s of waiting) {
    const objectKindId = kindOf.get(s.placeId)!;
    const frame = frameAt.get(s.keyframeId)!;
    const refuse = (reason: string) => unplaced.push({ sightingId: s.id, frameId: frame.id, objectKindId, reason });
    if (walkable.length === 0) { refuse("the floor has no walkable area to stand it in yet"); continue; }
    const fix = fixAt.get(frame.id) ?? null;
    if (!fix) { refuse("nothing filmed near it is bound to a room on this floor"); continue; }
    const edge = nearestEdge(fix.point, walkable);
    if (!edge) { refuse("the walkable floor has no outer edge to stand it against"); continue; }
    const inset = kinds.get(objectKindId)!.size.d / 2 + EDGE_GAP_M;
    candidates.push({
      // 6A's rule (@oth/model objects.ts): 0° faces south, turning anticlockwise, as the marker and the export read it.
      sightingId: s.id, frame, objectKindId, anchors: fix.anchors, rotationDeg: facingRotation(edge.inward),
      position: [edge.at[0] + edge.inward[0] * inset, edge.at[1] + edge.inward[1] * inset],
    });
  }
  candidates.sort((a, b) =>
    a.frame.captureId.localeCompare(b.frame.captureId) || a.frame.index - b.frame.index || a.sightingId.localeCompare(b.sightingId));

  // Step 3: the closest pairs first; a group never takes two sightings of one frame.
  const parent = candidates.map((_, i) => i);
  const root = (i: number): number => (parent[i] === i ? i : (parent[i] = root(parent[i]!)));
  const framesOf = candidates.map(c => new Set([c.frame.id]));
  const pairs: { i: number; j: number; d: number }[] = [];
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const a = candidates[i]!;
      const b = candidates[j]!;
      if (a.objectKindId !== b.objectKindId || a.frame.captureId !== b.frame.captureId || a.frame.id === b.frame.id) continue;
      const d = dist(a.position, b.position);
      if (Math.abs(a.frame.index - b.frame.index) <= MERGE_FRAMES && d <= MERGE_M) pairs.push({ i, j, d });
    }
  }
  pairs.sort((p, q) => p.d - q.d || p.i - q.i || p.j - q.j);
  for (const { i, j } of pairs) {
    const a = root(i);
    const b = root(j);
    if (a === b || [...framesOf[b]!].some(f => framesOf[a]!.has(f))) continue;
    parent[b] = a;
    for (const f of framesOf[b]!) framesOf[a]!.add(f);
  }
  const groups = new Map<number, Candidate[]>();
  candidates.forEach((c, i) => groups.set(root(i), [...(groups.get(root(i)) ?? []), c]));

  const spots = [...groups.values()].map((members): ObjectSpot => {
    // Members are in filming order, so the first with the most anchors is the earliest.
    const best = members.reduce((m, c) => (c.anchors.length > m.anchors.length ? c : m), members[0]!);
    return {
      objectKindId: best.objectKindId,
      position: best.position,
      rotationDeg: best.rotationDeg,
      sightingIds: members.map(m => m.sightingId),
      confidence: best.anchors.length >= 2 ? "high" : "low",
      anchors: best.anchors,
    };
  });
  return { spots, unplaced, alreadyPlaced: seen.length - waiting.length };
}

export function suggestObjectSpots(model: MapModel, levelId: string): ObjectSpot[] {
  return objectSpotReport(model, levelId).spots;
}

/**
 * How sure the placing of these sightings was, worked out again from the map
 * as it is now, for the check step: high when any of their frames has two or
 * more anchors. The positions are worked out once, for every call it answers.
 */
export function confidenceFor(model: MapModel, levelId: string): (sightingIds: readonly string[]) => "high" | "low" {
  const walkable = live(model.rooms).filter(r => r.levelId === levelId && r.walkable);
  const fixAt = fixes(model, levelId, framesOn(model, levelId), walkable);
  const frameOf = new Map(live(model.sightings).map(s => [s.id, s.keyframeId]));
  return ids => (ids.some(id => (fixAt.get(frameOf.get(id) ?? "")?.anchors.length ?? 0) >= 2) ? "high" : "low");
}
