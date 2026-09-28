import { bboxOfRing, live, pointInPolygon, type MapModel, type Room, type Vec2 } from "@oth/model";
import { distanceToRoom } from "./reach";

/** Contract v4: where a gate place is probably, for draw_paths to make its entrance. */
export type EntranceGuess = { placeId: string; name: string; roomId: string; point: Vec2 };

/** A guess stands this far inside its room (contract v4). */
export const GUESS_INSET_M = 0.5;
/** A room's outline is the building's outside where no other room on the floor is within this (contract v4). */
export const OUTSIDE_M = 0.5;
/** A place whose name has one of these words, case aside, is a way in (contract v4). "Gateway" is not. */
const WAY_IN = /\b(gate|entrance|exit|way in)\b/;
/** An outline is walked in pieces this long, or a little shorter, to find where it is outside. */
const STEP_M = 0.25;
/** How far off an edge to look for which side the room is on. */
const PROBE_M = 0.05;

/** Names compared the way people mean them: capitals, inner spacing and the ends aside. */
const normalName = (name: string) => name.trim().replace(/\s+/g, " ").toLowerCase();
const cm = (v: number) => Math.round(v * 100) / 100;

/** A piece of a room's outline: where it starts, which way it runs and how far, which way is into the room, and whether it is outside. */
type Piece = { from: Vec2; dir: Vec2; length: number; inward: Vec2; outside: boolean };

/** A room's outer ring in pieces, each marked outside when no other room is within OUTSIDE_M of its middle. */
function piecesOf(room: Room, others: readonly Room[]): Piece[] {
  const ring = room.footprint;
  const box = bboxOfRing(ring);
  const nearby = others.filter(o => {
    const b = bboxOfRing(o.footprint);
    return b.minX - OUTSIDE_M <= box.maxX && box.minX - OUTSIDE_M <= b.maxX && b.minY - OUTSIDE_M <= box.maxY && box.minY - OUTSIDE_M <= b.maxY;
  });
  const out: Piece[] = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (length === 0) continue;
    const dir: Vec2 = [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
    const n: Vec2 = [-dir[1], dir[0]];
    const mid: Vec2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const inward: Vec2 = pointInPolygon([mid[0] + n[0] * PROBE_M, mid[1] + n[1] * PROBE_M], ring) ? n : [-n[0], -n[1]];
    const count = Math.max(1, Math.ceil(length / STEP_M));
    for (let k = 0; k < count; k++) {
      const along = (t: number): Vec2 => [a[0] + dir[0] * length * t, a[1] + dir[1] * length * t];
      const centre = along((k + 0.5) / count);
      out.push({ from: along(k / count), dir, length: length / count, inward, outside: !nearby.some(o => distanceToRoom(centre, o) <= OUTSIDE_M) });
    }
  }
  return out;
}

/** The longest run of outside pieces, going round the ring; the whole ring when all of it is outside, none when none is. */
function longestRun(pieces: readonly Piece[]): Piece[] {
  const start = pieces.findIndex(p => !p.outside);
  if (start < 0) return [...pieces];
  let best: Piece[] = [];
  let bestLength = 0;
  let run: Piece[] = [];
  let runLength = 0;
  for (let k = 1; k <= pieces.length; k++) {
    const p = pieces[(start + k) % pieces.length]!;
    if (!p.outside) {
      run = [];
      runLength = 0;
      continue;
    }
    run.push(p);
    runLength += p.length;
    if (runLength > bestLength) {
      best = run;
      bestLength = runLength;
    }
  }
  return best;
}

/**
 * The point GUESS_INSET_M inside the room from `s` metres along the run. A
 * sharp corner or a notch can put that step outside the room again: then the
 * nearest piece of the run whose middle steps inside, or null.
 */
function insideAt(run: readonly Piece[], s: number, room: Room): Vec2 | null {
  const inset = (p: Vec2, inward: Vec2): Vec2 => [p[0] + inward[0] * GUESS_INSET_M, p[1] + inward[1] * GUESS_INSET_M];
  const inRoom = (p: Vec2) => pointInPolygon(p, room.footprint, room.holes);
  let acc = 0;
  const middles: { at: number; point: Vec2 }[] = [];
  let exact: Vec2 | null = null;
  for (const p of run) {
    if (exact === null && s <= acc + p.length) {
      const t = s - acc;
      exact = inset([p.from[0] + p.dir[0] * t, p.from[1] + p.dir[1] * t], p.inward);
    }
    const half = p.length / 2;
    middles.push({ at: acc + half, point: inset([p.from[0] + p.dir[0] * half, p.from[1] + p.dir[1] * half], p.inward) });
    acc += p.length;
  }
  if (exact && inRoom(exact)) return exact;
  return middles.sort((x, y) => Math.abs(x.at - s) - Math.abs(y.at - s)).find(m => inRoom(m.point))?.point ?? null;
}

/**
 * Contract v4's entranceGuesses. For each confirmed place bound to a room on
 * this floor whose name reads as a way in (WAY_IN), with no live entrance of
 * that name on the floor: a point GUESS_INSET_M inside the room on its
 * longest outside run, the stretch of its outline with no other room on the
 * floor within OUTSIDE_M. Several such places in one room stand evenly along
 * that run, in the order of their names. A room with no outside run gives
 * its places no guess. Rehearsal 3's Claude placed no entrance at all, since
 * a place has no point of its own; a person moves a guess in Check.
 */
export function entranceGuesses(model: MapModel, levelId: string): EntranceGuess[] {
  const rooms = live(model.rooms).filter(r => r.levelId === levelId);
  const byId = new Map(rooms.map(r => [r.id, r]));
  const named = new Set(live(model.entrances).filter(e => e.levelId === levelId).map(e => normalName(e.nameEn)).filter(Boolean));
  const inRoom = new Map<string, { id: string; nameEn: string }[]>();
  for (const p of live(model.places)) {
    const name = normalName(p.nameEn);
    if (p.status !== "confirmed" || !p.roomId || !byId.has(p.roomId) || !WAY_IN.test(name) || named.has(name)) continue;
    inRoom.set(p.roomId, [...(inRoom.get(p.roomId) ?? []), p]);
  }
  const out: EntranceGuess[] = [];
  for (const roomId of [...inRoom.keys()].sort()) {
    const room = byId.get(roomId)!;
    const run = longestRun(piecesOf(room, rooms.filter(r => r.id !== roomId)));
    if (run.length === 0) continue;
    const length = run.reduce((sum, p) => sum + p.length, 0);
    const places = inRoom.get(roomId)!.sort((a, b) => a.nameEn.localeCompare(b.nameEn, "en", { numeric: true }) || a.id.localeCompare(b.id));
    places.forEach((p, k) => {
      const point = insideAt(run, (length * (k + 1)) / (places.length + 1), room);
      if (point) out.push({ placeId: p.id, name: p.nameEn, roomId, point: [cm(point[0]), cm(point[1])] });
    });
  }
  return out;
}
