import {
  NAV_CELL_SIZE_M, bakeNavGrid, bboxOfRing, live, navGridWalkableAt, pointInPolygon, type MapModel, type NavGrid, type Room, type Vec2,
} from "@oth/model";

/** Contract v4: where a gate place is probably, for draw_paths to make its entrance. */
export type EntranceGuess = { placeId: string; name: string; roomId: string; point: Vec2 };

/**
 * A guess stands this far inside its room (contract v5; v4's 0.5 m put Gate 6
 * 0.2 m from the concourse's other edge, and entrance.offFloor refused it).
 */
export const GUESS_INSET_M = 1;
/**
 * Where routing can't start from that point (entrance.offFloor: the nav cell
 * there is closed), the guess moves further in, a nav cell at a time, up to
 * this far; past it there is no guess.
 */
export const GUESS_MAX_INSET_M = 3;
/**
 * Guesses on one run stand at least this far apart; the places a run is too
 * short for go to the next longest (contract v5). Rehearsal 4 had Gates 2–4
 * 1.2–1.4 m apart on 5.5 m of run. A run too short for two still holds one.
 */
export const GUESS_APART_M = 3;
/**
 * On a corner, going further in runs along the room's other edge and never
 * leaves it: then the spot moves along its run, a nav cell at a time, up to
 * this far either way, as v4's guess moved off a notch.
 */
export const GUESS_SHIFT_M = 1;
/**
 * A room's outline is the building's outside where the point this far out
 * from it, away from the room, lies in no room on the floor (contract v4,
 * amended). The first rule, no other room within 0.5 m, found no outside on
 * L1's West Concourses: the Stadium's rectangle is traced right over them.
 */
export const OUTWARD_M = 1;
/**
 * A place whose name has one of these words, case aside, is a way in
 * (contract v4, amended): plurals count, and so does a number run on ("Gate1"),
 * but not "Gateway" or "Northgate", and never a word in parentheses:
 * "Stairs to library (Gate 6 Concourse)" is stairs, named by where they are.
 */
const WAY_IN = /\b(gates?|entrances?|exits?|way in)(?![a-z])/;
/** A name less what it says in parentheses; an unclosed one runs to the end. */
const unbracketed = (name: string) => name.replace(/\([^)]*\)?/g, " ");
/** An outline is walked in pieces this long, or a little shorter, to find where it is outside. */
const STEP_M = 0.25;
/** How far off an edge to look for which side the room is on. */
const PROBE_M = 0.05;

/** Names compared the way people mean them: capitals, inner spacing and the ends aside. */
const normalName = (name: string) => name.trim().replace(/\s+/g, " ").toLowerCase();
const cm = (v: number) => Math.round(v * 100) / 100;

/** A piece of a room's outline: where it starts, which way it runs and how far, which way is into the room, and whether it is outside. */
type Piece = { from: Vec2; dir: Vec2; length: number; inward: Vec2; outside: boolean };

/**
 * A room's outer ring in pieces, each marked outside when the point OUTWARD_M
 * out from its middle lies in no room on the floor, this one included (a
 * notch in its own outline is not outside).
 */
function piecesOf(room: Room, floorRooms: readonly Room[]): Piece[] {
  const ring = room.footprint;
  const box = bboxOfRing(ring);
  const nearby = floorRooms.filter(o => {
    const b = bboxOfRing(o.footprint);
    return b.minX - OUTWARD_M <= box.maxX && box.minX - OUTWARD_M <= b.maxX && b.minY - OUTWARD_M <= box.maxY && box.minY - OUTWARD_M <= b.maxY;
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
      const beyond: Vec2 = [centre[0] - inward[0] * OUTWARD_M, centre[1] - inward[1] * OUTWARD_M];
      out.push({ from: along(k / count), dir, length: length / count, inward, outside: !nearby.some(o => pointInPolygon(beyond, o.footprint, o.holes)) });
    }
  }
  return out;
}

/** A run of outside pieces, in order along the outline, and its length. */
type Run = { pieces: Piece[]; length: number };

/**
 * Every run of outside pieces, going round the ring, longest first (the one
 * met first on a tie); the whole ring when all of it is outside.
 */
function outsideRuns(pieces: readonly Piece[]): Run[] {
  const start = pieces.findIndex(p => !p.outside);
  if (start < 0) return [{ pieces: [...pieces], length: pieces.reduce((sum, p) => sum + p.length, 0) }];
  const runs: Run[] = [];
  let run: Run | null = null;
  for (let k = 1; k <= pieces.length; k++) {
    const p = pieces[(start + k) % pieces.length]!;
    if (!p.outside) {
      run = null;
      continue;
    }
    if (!run) {
      run = { pieces: [], length: 0 };
      runs.push(run);
    }
    run.pieces.push(p);
    run.length += p.length;
  }
  return runs.sort((a, b) => b.length - a.length);
}

/**
 * How many guesses a run holds with GUESS_APART_M between each two (contract
 * v5 amendment: the spacing is between guesses, not from the run's ends): one
 * on a run too short for two, and one more for each GUESS_APART_M of it.
 */
const holds = (run: Run) => Math.floor(run.length / GUESS_APART_M) + 1;

/**
 * Where `n` guesses stand along a run: evenly, the ends of the run as far off
 * as the spaces between them, while those spaces are GUESS_APART_M or more;
 * else GUESS_APART_M apart, about its middle. One stands at its middle.
 */
function spread(run: Run, n: number): number[] {
  const apart = Math.max(GUESS_APART_M, run.length / (n + 1));
  const first = (run.length - (n - 1) * apart) / 2;
  return Array.from({ length: n }, (_, k) => first + k * apart);
}

/** The point `s` metres along the run, and which way is into the room there. */
function along(run: Run, s: number): { edge: Vec2; inward: Vec2 } {
  let acc = 0;
  const piece = run.pieces.find(p => {
    if (s <= acc + p.length) return true;
    acc += p.length;
    return false;
  }) ?? run.pieces.at(-1)!;
  const t = Math.min(s - acc, piece.length);
  return { edge: [piece.from[0] + piece.dir[0] * t, piece.from[1] + piece.dir[1] * t], inward: piece.inward };
}

/**
 * The guess `s` metres along the run: GUESS_INSET_M inside the room, or
 * further in, a nav cell at a time up to GUESS_MAX_INSET_M, until the point is
 * in the room and routing can start there (entrance.offFloor's own test: the
 * nav cell under it is open). Where none is, the same from a spot moved along
 * the run, nearest first, up to GUESS_SHIFT_M. A point nearer than
 * GUESS_APART_M, in a straight line, to a guess already on the run is no
 * guess: L1's run bends, and Gates 2 and 3 came to 2.63 m. Null when none is.
 */
function guessAt(run: Run, s: number, placed: readonly Vec2[], room: Room, grid: NavGrid): Vec2 | null {
  const shifts = Math.round(GUESS_SHIFT_M / NAV_CELL_SIZE_M);
  const apart = (p: Vec2) => placed.every(q => Math.hypot(q[0] - p[0], q[1] - p[1]) >= GUESS_APART_M - 1e-9);
  for (let k = 0; k <= 2 * shifts; k++) {
    // 0, then a cell on, a cell back, two on, two back…
    const at = s + (k % 2 === 1 ? 1 : -1) * Math.ceil(k / 2) * NAV_CELL_SIZE_M;
    if (at < 0 || at > run.length) continue;
    const { edge, inward } = along(run, at);
    for (let inset = GUESS_INSET_M; inset <= GUESS_MAX_INSET_M + 1e-9; inset += NAV_CELL_SIZE_M) {
      // Checked as it is sent, to the centimetre: rounding moved L1's Gate 6 onto the next cell, a closed one.
      const point: Vec2 = [cm(edge[0] + inward[0] * inset), cm(edge[1] + inward[1] * inset)];
      if (pointInPolygon(point, room.footprint, room.holes) && navGridWalkableAt(grid, point) && apart(point)) return point;
    }
  }
  return null;
}

/**
 * Contract v4's entranceGuesses, as v5 amends them. For each confirmed place
 * bound to a room on this floor whose name reads as a way in (WAY_IN), with no
 * live entrance of that name on the floor: a point GUESS_INSET_M inside the
 * room (guessAt) on its longest outside run, the stretch of its outline where
 * OUTWARD_M out from it is in no room on the floor. Several such places in one
 * room stand evenly along that run, in the order of their names, at least
 * GUESS_APART_M apart; the places it is too short for go on the next longest
 * run, and so on. A place with no run left, or whose spot has no floor routing
 * can start on, gets no guess. Rehearsal 3's Claude placed no entrance at all,
 * since a place has no point of its own; a person moves a guess in Check.
 */
export function entranceGuesses(model: MapModel, levelId: string): EntranceGuess[] {
  const rooms = live(model.rooms).filter(r => r.levelId === levelId);
  const byId = new Map(rooms.map(r => [r.id, r]));
  const named = new Set(live(model.entrances).filter(e => e.levelId === levelId).map(e => normalName(e.nameEn)).filter(Boolean));
  const inRoom = new Map<string, { id: string; nameEn: string }[]>();
  for (const p of live(model.places)) {
    const name = normalName(p.nameEn);
    if (p.status !== "confirmed" || !p.roomId || !byId.has(p.roomId) || !WAY_IN.test(normalName(unbracketed(p.nameEn))) || named.has(name)) continue;
    inRoom.set(p.roomId, [...(inRoom.get(p.roomId) ?? []), p]);
  }
  const out: EntranceGuess[] = [];
  if (inRoom.size === 0) return out;
  // entrance.offFloor's grid: the one the reachability rule bakes for this floor.
  const grid = bakeNavGrid(model, levelId);
  for (const roomId of [...inRoom.keys()].sort()) {
    const room = byId.get(roomId)!;
    const waiting = inRoom.get(roomId)!.sort((a, b) => a.nameEn.localeCompare(b.nameEn, "en", { numeric: true }) || a.id.localeCompare(b.id));
    for (const run of outsideRuns(piecesOf(room, rooms))) {
      const here = waiting.splice(0, holds(run));
      const at = spread(run, here.length);
      const placed: Vec2[] = [];
      here.forEach((p, k) => {
        const point = guessAt(run, at[k]!, placed, room, grid);
        if (!point) return;
        placed.push(point);
        out.push({ placeId: p.id, name: p.nameEn, roomId, point });
      });
      if (waiting.length === 0) break;
    }
  }
  return out;
}
