import {
  bboxOfRing, coverage, distancePointToSegment, live, pointInPolygon, ringArea, ringCentroid, segmentsProperlyIntersect, validateModel,
  type BBox, type MapModel, type Room, type Vec2,
} from "@oth/model";
import { bridgeAcross, type Bridge } from "./bridge";
import { distanceToEdge, lineWidth } from "./distance";
import { polylineLength } from "./graph";
import type { PlanInk } from "./ink";
import { cellCentre, cellIndex, walkableAt, walkableRaster, type Raster } from "./raster";
import { simplify } from "./simplify";

export type TargetType = "doorway" | "stop" | "entrance";
/** What spec §7.3 step 4 joins to the lines: where it is, and what it is. */
export type Target = { type: TargetType; id: string; point: Vec2 };
export type Link = { from: { type: TargetType; id: string }; segment: [Vec2, Vec2] };
export type Unconnected = { type: TargetType; id: string; reason: string };

/**
 * A doorway lies on the wall line between its two rooms, so its middle is on
 * the surface's rim or just off it, across the drawing's wall. A link may
 * leave the surface for this far from where it starts.
 */
export const SLACK_M = 0.6;
/** Nothing further from a line than this is joined to it: that is a path of its own. */
export const MAX_LINK_M = 50;
/** How closely a line is sampled for the nearest point a link can reach. */
const SAMPLE_M = 0.5;
/**
 * How many of those points, nearest first, are tried before a target is
 * listed as blocked. Each try walks the straight line to its point, so this
 * bounds the work for a target walled off from a busy network; 200 points is
 * 100 m of line.
 */
export const MAX_TRIES = 200;

export const REASONS = {
  noSurface: "This floor has no walkable area yet.",
  offSurface: "It is not on or beside a walkable area.",
  noLine: `No path was proposed within ${MAX_LINK_M} m of it.`,
  blocked: "No straight line from it to a proposed path stays on the walkable area.",
} as const;

const byId = <T extends { id: string }>(xs: T[]): T[] => xs.sort((p, q) => p.id.localeCompare(q.id));

/**
 * Every doorway's midpoint, every stop's footprint centre (its point when it
 * has no footprint), and every entrance on the floor, in that order.
 */
export function linkTargets(model: MapModel, levelId: string): Target[] {
  const doorways = byId(live(model.doorways).filter(d => d.levelId === levelId)).map((d): Target => ({
    type: "doorway", id: d.id,
    point: [(d.segment[0][0] + d.segment[1][0]) / 2, (d.segment[0][1] + d.segment[1][1]) / 2],
  }));
  const stops = byId(live(model.portalEndpoints).filter(e => e.levelId === levelId)).map((e): Target => ({
    type: "stop", id: e.id, point: e.footprint ? ringCentroid(e.footprint) : e.point,
  }));
  const entrances = byId(live(model.entrances).filter(e => e.levelId === levelId)).map((e): Target => ({
    type: "entrance", id: e.id, point: e.point,
  }));
  return [...doorways, ...stops, ...entrances];
}

/** Whether a walkable cell's centre is within `slackM` of `p`. */
function besideSurface(r: Raster, p: Vec2, slackM: number): boolean {
  if (walkableAt(r, p)) return true;
  const reach = Math.ceil(slackM / r.cellM);
  const col = Math.floor((p[0] - r.originX) / r.cellM);
  const row = Math.floor((p[1] - r.originY) / r.cellM);
  for (let dy = -reach; dy <= reach; dy++) {
    for (let dx = -reach; dx <= reach; dx++) {
      const c = col + dx;
      const w = row + dy;
      if (c < 0 || w < 0 || c >= r.cols || w >= r.rows || !r.cells[w * r.cols + c]) continue;
      const x = r.originX + (c + 0.5) * r.cellM;
      const y = r.originY + (w + 0.5) * r.cellM;
      if (Math.hypot(x - p[0], y - p[1]) <= slackM) return true;
    }
  }
  return false;
}

/**
 * Whether the straight line from `a` to `b` stays on the walkable surface,
 * sampled every half cell, past the first `slackM` from `a`.
 */
export function clearLine(r: Raster, a: Vec2, b: Vec2, slackM: number): boolean {
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const steps = Math.max(1, Math.ceil(length / (r.cellM / 2)));
  for (let k = 0; k <= steps; k++) {
    const t = k / steps;
    if (t * length <= slackM) continue;
    if (!walkableAt(r, [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])) return false;
  }
  return true;
}

/**
 * Contract v5 amendment 4: the run simplified, with any vertex kept back whose
 * dropping takes the line off the floor. connect_rooms' runs hug wall corners,
 * unlike suggest_paths' medial-axis lines, so a chord over dropped vertices can
 * leave a narrow strip of floor — on real L1, 9.75 m of one connector lay inside
 * a restaurant. Douglas–Peucker keeps whatever `clearLine` (the test the links
 * use, with no slack) refuses, farthest from the chord first, and stops at the
 * run's own steps, which are always on the floor.
 */
export function simplifyOnFloor(raw: readonly Vec2[], r: Raster, toleranceM: number): Vec2[] {
  const simplified = simplify(raw, toleranceM);
  const keep = new Uint8Array(raw.length);
  const kept: number[] = [];
  for (let i = 0, k = 0; i < raw.length && k < simplified.length; i++) {
    const p = simplified[k]!;
    if (raw[i]![0] !== p[0] || raw[i]![1] !== p[1]) continue;
    keep[i] = 1;
    kept.push(i);
    k++;
  }
  const stack: Array<[number, number]> = [];
  for (let k = 1; k < kept.length; k++) stack.push([kept[k - 1]!, kept[k]!]);
  while (stack.length > 0) {
    const [from, to] = stack.pop()!;
    if (to <= from + 1 || clearLine(r, raw[from]!, raw[to]!, 0)) continue;
    let far = from + 1;
    let farthest = -1;
    for (let i = from + 1; i < to; i++) {
      const d = distancePointToSegment(raw[i]!, raw[from]!, raw[to]!);
      if (d > farthest) {
        farthest = d;
        far = i;
      }
    }
    keep[far] = 1;
    stack.push([from, far], [far, to]);
  }
  return raw.filter((_, i) => keep[i] === 1);
}

/** The foot of `p` on segment a–b. */
function closestOn(p: Vec2, a: Vec2, b: Vec2): Vec2 {
  const vx = b[0] - a[0];
  const vy = b[1] - a[1];
  const lengthSq = vx * vx + vy * vy;
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / lengthSq));
  return [a[0] + t * vx, a[1] + t * vy];
}

/** Points on the lines within MAX_LINK_M of `p`, nearest first: each segment's foot of `p`, and a point every half metre. */
function pointsNear(p: Vec2, lines: readonly (readonly Vec2[])[]): Vec2[] {
  const found: Array<{ q: Vec2; d: number }> = [];
  const add = (q: Vec2) => {
    const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (d <= MAX_LINK_M) found.push({ q, d });
  };
  for (const line of lines) {
    for (let i = 0; i + 1 < line.length; i++) {
      const a = line[i]!;
      const b = line[i + 1]!;
      add(closestOn(p, a, b));
      const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / SAMPLE_M));
      for (let k = 0; k <= n; k++) add([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
    }
  }
  return found.sort((x, y) => x.d - y.d).map(f => f.q);
}

/**
 * Spec §7.3 step 4: each target joined to the nearest point on a line that a
 * straight segment can reach without leaving the walkable surface, of the
 * MAX_TRIES nearest within MAX_LINK_M, or listed as unconnected with the reason.
 */
export function connect(
  r: Raster, lines: readonly (readonly Vec2[])[], targets: readonly Target[],
): { links: Link[]; unconnected: Unconnected[] } {
  const links: Link[] = [];
  const unconnected: Unconnected[] = [];
  for (const t of targets) {
    const from = { type: t.type, id: t.id };
    const reason = r.cols === 0
      ? REASONS.noSurface
      : !besideSurface(r, t.point, SLACK_M) ? REASONS.offSurface : null;
    if (reason) {
      unconnected.push({ ...from, reason });
      continue;
    }
    const near = pointsNear(t.point, lines);
    const to = near.slice(0, MAX_TRIES).find(q => clearLine(r, t.point, q, SLACK_M));
    if (to) links.push({ from, segment: [t.point, to] });
    else unconnected.push({ ...from, reason: near.length === 0 ? REASONS.noLine : REASONS.blocked });
  }
  return { links, unconnected };
}

/* Contract v5's connect_rooms: pathways from the network routing reaches to the rooms it doesn't. */

/** A connector runs at most this far through walkable floor. */
export const CONNECT_MAX_M = 40;
/** A connector to a closed room ends this near its outline. */
export const CLOSED_NEAR_M = 1;
/** A connector's polyline is simplified this much, like suggest_paths' lines. */
export const CONNECTOR_SIMPLIFY_M = 0.3;
/** The width rule's answer for a connector (distance.ts), clamped to these. */
export const CONNECTOR_MIN_WIDTH_M = 1;
export const CONNECTOR_MAX_WIDTH_M = 3;
/** The most connectors one call makes. */
export const MAX_CONNECTORS = 150;
/**
 * Islands with rooms this near each other are one: the rooms' CLOSED_NEAR_M
 * reaches meet. On rehearsal 4's L1 most rooms left stand where no floor is
 * traced at all, each an island of its own, 86 in all; joined, 26.
 */
export const ISLAND_JOIN_M = 2 * CLOSED_NEAR_M;
/**
 * An island lies inside a room of kind room when each of its rooms lies this
 * much inside that room's outline (contract v5 amendment): a closed
 * "container" traced round open floor, as L1's Commercial & F&B (North) is.
 */
export const CONTAINER_SHARE = 0.9;
/**
 * room.noAccess's own distance: a room is served once a pathway passes this
 * near it. It is the model's ROOM_ACCESS_M (validation/rules/access.ts), which
 * the model doesn't export; the renderer keeps a copy too.
 */
export const ACCESS_M = 3;
/**
 * How many containers one call simulates (contract v6, fix round). A simulation
 * is a raster and a search over the whole floor — about half a second on real
 * L1 — and a floor's containers are not bounded, so the budget is: four of
 * them, and no more started once this long has gone on them. The rest are
 * counted in `containersLeft` and their islands named without a container,
 * rather than quietly reported as freeing nothing.
 */
export const MAX_CONTAINER_SIMS = 4;
export const CONTAINER_BUDGET_MS = 1200;

/** One pathway to make: from the network to the first of roomIds; the others it reaches on the way. */
export type Connector = { polyline: Vec2[]; widthM: number; roomIds: string[]; lengthM: number };
/**
 * Rooms no run of CONNECT_MAX_M reaches, and the straight gap from the network
 * (from) to their floor (to). inside is the container they all lie in, when
 * there is one (containerOf).
 */
export type Island = {
  roomIds: string[];
  gapM: number;
  from: Vec2;
  to: Vec2;
  /**
   * The closed room the island lies in, when opening it would help: `frees` is
   * how many of the island's rooms a connector would then reach (contract v6).
   * A container that frees none is not named at all, so draw_paths never opens
   * one for nothing.
   */
  inside?: { roomId: string; name: string; frees: number };
};
export type RoomConnectors = {
  connectors: Connector[];
  bridges: Bridge[];
  islands: Island[];
  left: number;
  /** Containers this call had no budget to try (contract v6, fix round): their islands are named without one. */
  containersLeft: number;
};

/** An island as the grouping leaves it: its container named, before the simulation says whether opening it helps. */
type Grouped = Omit<Island, "inside"> & { inside?: { roomId: string; name: string } };

/** A floor connect_rooms has nothing to run connectors from or through, and why, for a person. */
export class CannotConnect extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CannotConnect";
  }
}

/** check_floor's codes for a room no route reaches (contract v3). */
const UNREACHED = new Set(["area.unreachable", "room.noAccess"]);

/**
 * A room check_floor lists. enter (area.unreachable): a connector must run
 * into it. near (room.noAccess): one must pass within ACCESS_M of it. goals:
 * the walkable cells a connector to it may end on. fallback: those cells are
 * the band outside its outline, not floor inside it, so ending on one is no
 * proof the room is reached (contract v5 amendment 4).
 */
type Unreached = { room: Room; box: BBox; enter: boolean; near: boolean; goals: number[]; fallback: boolean };

const cm = (v: number) => Math.round(v * 100) / 100;
const at = (p: Vec2): Vec2 => [cm(p[0]), cm(p[1])];
const round1 = (v: number) => Math.round(v * 10) / 10;
const padded = (b: BBox, m: number): BBox => ({ minX: b.minX - m, minY: b.minY - m, maxX: b.maxX + m, maxY: b.maxY + m });
const meet = (a: BBox, b: BBox) => a.minX <= b.maxX && b.minX <= a.maxX && a.minY <= b.maxY && b.minY <= a.maxY;

/** A point every `step` or less along a line, both ends included, with the segment it lies on. */
function along(line: readonly Vec2[], step: number, visit: (p: Vec2, a: Vec2, b: Vec2) => void): void {
  for (let k = 1; k < line.length; k++) {
    const a = line[k - 1]!;
    const b = line[k]!;
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
    for (let s = k === 1 ? 0 : 1; s <= n; s++) visit([a[0] + ((b[0] - a[0]) * s) / n, a[1] + ((b[1] - a[1]) * s) / n], a, b);
  }
}

/** Each walkable cell the box touches, with its centre. */
function walkableIn(r: Raster, box: BBox, visit: (i: number, centre: Vec2) => void): void {
  const c0 = Math.max(0, Math.floor((box.minX - r.originX) / r.cellM));
  const c1 = Math.min(r.cols - 1, Math.floor((box.maxX - r.originX) / r.cellM));
  const r0 = Math.max(0, Math.floor((box.minY - r.originY) / r.cellM));
  const r1 = Math.min(r.rows - 1, Math.floor((box.maxY - r.originY) / r.cellM));
  for (let row = r0; row <= r1; row++) {
    for (let col = c0; col <= c1; col++) {
      const i = row * r.cols + col;
      if (r.cells[i]) visit(i, [r.originX + (col + 0.5) * r.cellM, r.originY + (row + 0.5) * r.cellM]);
    }
  }
}

function toOutline(p: Vec2, ring: readonly Vec2[]): number {
  let best = Infinity;
  for (let k = 0; k < ring.length; k++) best = Math.min(best, distancePointToSegment(p, ring[k]!, ring[(k + 1) % ring.length]!));
  return best;
}

/**
 * Where a connector to the room may end: into an area, on a walkable cell
 * inside it; to a closed room, or an area with no walkable cell left inside,
 * on one within CLOSED_NEAR_M of its outline (`fallback`).
 */
function goalsOf(r: Raster, room: Room): { goals: number[]; fallback: boolean } {
  const box = bboxOfRing(room.footprint);
  if (room.walkable) {
    const inside: number[] = [];
    walkableIn(r, box, (i, c) => {
      if (pointInPolygon(c, room.footprint, room.holes)) inside.push(i);
    });
    if (inside.length > 0) return { goals: inside, fallback: false };
  }
  const near: number[] = [];
  walkableIn(r, padded(box, CLOSED_NEAR_M), (i, c) => {
    if (toOutline(c, room.footprint) <= CLOSED_NEAR_M) near.push(i);
  });
  return { goals: near, fallback: true };
}

/**
 * room.noAccess's measure, as the model takes it (access.ts's
 * nearestPathwayDistance): 0 when a point of the line is in the room, else the
 * least distance between the line's segments and the room's outline.
 */
function accessDistance(line: readonly Vec2[], room: Room): number {
  if (line.some(p => pointInPolygon(p, room.footprint, room.holes))) return 0;
  const ring = room.footprint;
  let best = Infinity;
  for (let i = 1; i < line.length; i++) {
    const a1 = line[i - 1]!;
    const a2 = line[i]!;
    for (let j = 0; j < ring.length; j++) {
      const b1 = ring[j]!;
      const b2 = ring[(j + 1) % ring.length]!;
      const d = segmentsProperlyIntersect(a1, a2, b1, b2) ? 0 : Math.min(
        distancePointToSegment(a1, b1, b2), distancePointToSegment(a2, b1, b2),
        distancePointToSegment(b1, a1, a2), distancePointToSegment(b2, a1, a2),
      );
      best = Math.min(best, d);
    }
  }
  return best;
}

/** How far apart two rooms' outlines are, 0 where one overlaps or holds the other. */
function roomsApart(a: Room, b: Room): number {
  const closed = (r: Room) => [...r.footprint, r.footprint[0]!];
  return Math.min(accessDistance(closed(a), b), accessDistance(closed(b), a));
}

/**
 * Whether check_floor would stop listing the room once this line is a
 * pathway joined to the network: it runs into the room when that is what it
 * lacks, and passes within ACCESS_M of it when that is.
 */
function reachedBy(u: Unreached, line: readonly Vec2[], box: BBox, points: readonly Vec2[]): boolean {
  if (!meet(padded(box, ACCESS_M), u.box)) return false;
  if (u.enter && !points.some(p => pointInPolygon(p, u.room.footprint, u.room.holes))) return false;
  return !u.near || accessDistance(line, u.room) <= ACCESS_M;
}

/** A min-heap of cells by distance, in typed arrays that grow as it fills. */
class CellQueue {
  private keys = new Float64Array(4096);
  private cells = new Int32Array(4096);
  size = 0;

  /** The distance of the cell pop gives next. */
  get top(): number {
    return this.keys[0]!;
  }

  push(key: number, cell: number): void {
    if (this.size === this.keys.length) {
      const keys = new Float64Array(this.size * 2);
      keys.set(this.keys);
      this.keys = keys;
      const cells = new Int32Array(this.size * 2);
      cells.set(this.cells);
      this.cells = cells;
    }
    let k = this.size++;
    while (k > 0) {
      const parent = (k - 1) >> 1;
      if (this.keys[parent]! <= key) break;
      this.keys[k] = this.keys[parent]!;
      this.cells[k] = this.cells[parent]!;
      k = parent;
    }
    this.keys[k] = key;
    this.cells[k] = cell;
  }

  pop(): number {
    const cell = this.cells[0]!;
    const n = --this.size;
    const key = this.keys[n]!;
    const last = this.cells[n]!;
    let k = 0;
    for (;;) {
      let child = 2 * k + 1;
      if (child >= n) break;
      if (child + 1 < n && this.keys[child + 1]! < this.keys[child]!) child++;
      if (this.keys[child]! >= key) break;
      this.keys[k] = this.keys[child]!;
      this.cells[k] = this.cells[child]!;
      k = child;
    }
    this.keys[k] = key;
    this.cells[k] = last;
    return cell;
  }
}

/** The point on the lines nearest `p`. */
function nearestOn(lines: readonly (readonly Vec2[])[], p: Vec2): Vec2 {
  let best: Vec2 = lines[0]![0]!;
  let bestD = Infinity;
  for (const line of lines) {
    for (let k = 1; k < line.length; k++) {
      const q = closestOn(p, line[k - 1]!, line[k]!);
      const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (d < bestD) {
        best = q;
        bestD = d;
      }
    }
  }
  return best;
}

/**
 * Contract v5 amendment: the smallest live room of kind room on the floor that
 * every room of the island lies CONTAINER_SHARE or more inside (its outline;
 * a hole cut round a shop inside it still holds the shop). A room of the
 * island may be the container of the others, but a room is no container of
 * itself alone: it must hold at least one other.
 */
type Container = { r: Room; box: BBox };
/** The floor's rooms of kind room, smallest first: what containerOf tries. */
const containersOf = (rooms: readonly Room[]): Container[] => rooms.filter(r => r.kind === "room")
  .map(r => ({ r, area: Math.abs(ringArea(r.footprint)), box: bboxOfRing(r.footprint) }))
  .sort((a, b) => a.area - b.area);
/** The smallest room of kind room, not the room itself, that it lies CONTAINER_SHARE or more inside. */
function enclosureOf(room: Room, containers: readonly Container[]): Room | undefined {
  const box = bboxOfRing(room.footprint);
  return containers.find(({ r, box: c }) =>
    r.id !== room.id && meet(c, box) && coverage({ footprint: r.footprint, holes: [] }, room) >= CONTAINER_SHARE)?.r;
}

function containerOf(members: readonly Room[], containers: readonly Container[]): Room | undefined {
  return containers.find(({ r, box }) => {
    const others = members.filter(m => m.id !== r.id);
    return others.length > 0 &&
      others.every(m => meet(box, bboxOfRing(m.footprint)) && coverage({ footprint: r.footprint, holes: [] }, m) >= CONTAINER_SHARE);
  })?.r;
}

/** The point on `line` nearest the lines, and the point on the lines nearest it. */
function nearestPair(line: readonly Vec2[], lines: readonly (readonly Vec2[])[]): [Vec2, Vec2] {
  let best: [Vec2, Vec2] = [line[0]!, lines[0]![0]!];
  let bestD = Infinity;
  const consider = (p: Vec2, q: Vec2) => {
    const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (d < bestD) {
      best = [p, q];
      bestD = d;
    }
  };
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1]!;
    const b = line[i]!;
    for (const other of lines) {
      for (let k = 1; k < other.length; k++) {
        const c = other[k - 1]!;
        const d = other[k]!;
        // Two segments that don't cross are nearest at an end of one of them.
        consider(a, closestOn(a, c, d));
        consider(b, closestOn(b, c, d));
        consider(closestOn(c, a, b), c);
        consider(closestOn(d, a, b), d);
      }
    }
  }
  return best;
}

/**
 * The rooms no run reached, grouped by the stretch of floor they lie on that
 * the search never got to (8-neighbour, as it walks), each stretch with the
 * straight gap from the network to its cell nearest it. A room with no floor
 * beside it at all is measured to its outline. Then groups with rooms within
 * ISLAND_JOIN_M of each other are joined: a block of shops standing where no
 * floor is traced is one island, not one per shop. Rooms share a stretch, or
 * join, only when the same container holds both, or none holds either
 * (enclosureOf). A joined island is
 * measured to its nearest floor, or to its nearest outline when it has none,
 * and names the container it lies inside, if any (containerOf). `network` is
 * the lines the call leaves on the floor, which every gap is measured from
 * (contract v5 amendment 4).
 */
function islandsOf(
  r: Raster, dist: Float64Array, unreached: readonly Unreached[], network: readonly Vec2[][], floorRooms: readonly Room[],
): Grouped[] {
  if (unreached.length === 0) return [];
  const room = new Map(unreached.map(u => [u.room.id, u.room]));
  const containers = containersOf(floorRooms);
  // How far every cell is from the network: the distance to the edge, with the lines as the edge.
  const off = new Uint8Array(r.cols * r.rows).fill(1);
  for (const line of network) {
    along(line, r.cellM / 2, p => {
      const i = cellIndex(r, p);
      if (i >= 0) off[i] = 0;
    });
  }
  const away = distanceToEdge({ ...r, cells: off });
  const label = new Int32Array(r.cols * r.rows).fill(-1);
  const nearest: number[] = [];
  const stretchOf = (seed: number): number => {
    if (label[seed]! >= 0) return label[seed]!;
    const id = nearest.length;
    let best = seed;
    label[seed] = id;
    const stack = [seed];
    while (stack.length > 0) {
      const i = stack.pop()!;
      if (away[i]! < away[best]!) best = i;
      const col = i % r.cols;
      const row = (i - col) / r.cols;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const c = col + dc;
          const w = row + dr;
          if (c < 0 || w < 0 || c >= r.cols || w >= r.rows) continue;
          const j = w * r.cols + c;
          if (!r.cells[j] || dist[j] !== Infinity || label[j]! >= 0) continue;
          label[j] = id;
          stack.push(j);
        }
      }
    }
    nearest.push(best);
    return id;
  };
  // Rooms group, and later join, only inside the same container, or both in none: the shops on the edge of
  // L1's Commercial & F&B (North) reach floor outside it, and the rest of it stands within 2 m of the hawker
  // group; mixed in with those, they lay inside no one room.
  const enclosure = new Map(unreached.map(u => [u.room.id, enclosureOf(u.room, containers)?.id]));
  const byKey = new Map<string, { members: Unreached[]; to: Vec2; floor: boolean }>();
  for (const u of unreached) {
    let key: string;
    let to: Vec2;
    if (u.goals.length > 0) {
      const stretch = stretchOf(u.goals.reduce((b, i) => (away[i]! < away[b]! ? i : b)));
      key = `floor ${stretch} in ${enclosure.get(u.room.id) ?? ""}`;
      to = cellCentre(r, nearest[stretch]!);
    } else {
      key = `room ${u.room.id}`;
      to = nearestPair([...u.room.footprint, u.room.footprint[0]!], network)[0];
    }
    const group = byKey.get(key) ?? { members: [], to, floor: u.goals.length > 0 };
    group.members.push(u);
    byKey.set(key, group);
  }
  const groups = [...byKey.values()].map(g => {
    const from = nearestOn(network, g.to);
    return { ...g, from, gap: Math.hypot(g.to[0] - from[0], g.to[1] - from[1]) };
  });
  // Groups with rooms within ISLAND_JOIN_M of each other are one island, measured to its floor where it has
  // some, nearest first: a bridge there lets connect_rooms reach the rest of it. L1's hawker centre was one
  // with shops standing where no floor is traced, and read 6.7 m off, to a shop, not 29.7 m, to its floor.
  const parent = groups.map((_, k) => k);
  const root = (k: number): number => (parent[k] === k ? k : (parent[k] = root(parent[k]!)));
  for (let a = 0; a < groups.length; a++) {
    for (let b = a + 1; b < groups.length; b++) {
      if (root(a) === root(b)) continue;
      const near = groups[a]!.members.some(x => groups[b]!.members.some(y =>
        enclosure.get(x.room.id) === enclosure.get(y.room.id) &&
        meet(padded(x.box, ISLAND_JOIN_M), y.box) && roomsApart(x.room, y.room) <= ISLAND_JOIN_M));
      if (near) parent[root(a)] = root(b);
    }
  }
  const islands = new Map<number, Grouped & { gap: number; floor: boolean }>();
  groups.forEach((g, k) => {
    const had = islands.get(root(k));
    const roomIds = [...(had?.roomIds ?? []), ...g.members.map(u => u.room.id)];
    const better = !had || (g.floor && !had.floor) || (g.floor === had.floor && g.gap < had.gap);
    islands.set(root(k), better
      ? { roomIds, gap: g.gap, floor: g.floor, gapM: round1(g.gap), from: at(g.from), to: at(g.to) }
      : { ...had, roomIds });
  });
  return [...islands.values()]
    .map(({ gap: _gap, floor: _floor, ...island }): Grouped => {
      const container = containerOf(island.roomIds.map(id => room.get(id)!), containers);
      return { ...island, roomIds: island.roomIds.sort(), ...(container ? { inside: { roomId: container.id, name: container.nameEn || container.id } } : {}) };
    })
    .sort((a, b) => a.gapM - b.gapM || a.roomIds[0]!.localeCompare(b.roomIds[0]!));
}

/**
 * The floor's unreached rooms as targets on one raster. The goal cells are that
 * raster's, so a simulated raster (a container opened, freesOf) is handed its
 * own targets rather than the real floor's.
 */
function targetsOn(raster: Raster, rooms: ReadonlyMap<string, Room>, codes: ReadonlyMap<string, Set<string>>): Unreached[] {
  return [...codes.keys()].sort().map(id => {
    const room = rooms.get(id)!;
    const has = codes.get(id)!;
    return {
      room, box: bboxOfRing(room.footprint), enter: has.has("area.unreachable"), near: has.has("room.noAccess"),
      ...goalsOf(raster, room),
    };
  });
}

/**
 * One multi-source search over one raster: seed the lines it starts from, run
 * it, and read off the connectors it made. It is a factory rather than a plain
 * function because the search is run more than once over the same state — again
 * from the bridges once they are laid (contract v6) — and a second, throwaway
 * one runs over a simulated raster to answer whether opening a container would
 * help (freesOf).
 */
function searcher(raster: Raster, targets: readonly Unreached[]) {
  const { cols, rows, cells, cellM } = raster;
  const n = cols * rows;
  const toEdge = distanceToEdge(raster);
  const dist = new Float64Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  /** For each cell a line runs through, where a connector leaving it starts: the foot of its centre on the line. */
  const start = new Map<number, Vec2>();
  const queue = new CellQueue();
  const network: Vec2[][] = [];
  const seed = (line: readonly Vec2[]) => {
    network.push([...line]);
    along(line, cellM / 2, (p, a, b) => {
      const i = cellIndex(raster, p);
      if (i < 0 || !cells[i] || dist[i] === 0) return;
      dist[i] = 0;
      prev[i] = -1;
      start.set(i, closestOn(cellCentre(raster, i), a, b));
      queue.push(0, i);
    });
  };

  // Which targets may end at each cell, as linked lists.
  const goalHead = new Int32Array(n).fill(-1);
  const goalNext: number[] = [];
  const goalOf: number[] = [];
  targets.forEach((t, k) => {
    for (const i of t.goals) {
      goalOf.push(k);
      goalNext.push(goalHead[i]!);
      goalHead[i] = goalOf.length - 1;
    }
  });

  const done = new Uint8Array(targets.length);
  /**
   * Targets left to islandsOf (contract v5 amendment 4): a fallback-goal room
   * the run beside it never reached. Nothing more is searched for them, and a
   * later connector that does reach one still names it.
   */
  const givenUp = new Uint8Array(targets.length);
  let open = targets.length;
  const connectors: Connector[] = [];
  const diagonal = cellM * Math.SQRT2;
  /**
   * The search, out from whatever is seeded: the sources first, and again from
   * the bridges once they are laid (contract v6), so a bridge's island gets its
   * connectors in the same call rather than waiting for the next.
   */
  const search = () => {
    while (queue.size > 0 && open > 0) {
      const d = queue.top;
      const i = queue.pop();
      if (d > dist[i]!) continue;
      let hit = -1;
      for (let e = goalHead[i]!; e >= 0 && hit < 0; e = goalNext[e]!) {
        const k = goalOf[e]!;
        if (!done[k] && !givenUp[k]) hit = k;
      }
      if (hit >= 0) {
        const path: Vec2[] = [];
        let c = i;
        for (; dist[c]! > 0; c = prev[c]!) path.push(cellCentre(raster, c));
        // A room whose goal lies on a line already needs no connector; the search carries on from here.
        // Unless its goals are the band outside its outline (fallback), where a line can lie without
        // reaching the room at all: marked done with no connector and no reachedBy, it fell out of both
        // made and islands while check_floor went on listing it. It is islandsOf's instead.
        if (path.length === 0) {
          if (targets[hit]!.fallback) givenUp[hit] = 1;
          else done[hit] = 1;
          open--;
        } else {
          const raw = [start.get(c)!, ...path.reverse()];
          const polyline = simplifyOnFloor(raw, raster, CONNECTOR_SIMPLIFY_M).map(at);
          const box = bboxOfRing(polyline);
          const points: Vec2[] = [];
          along(polyline, cellM / 2, p => points.push(p));
          const target = targets[hit]!;
          // Amendment 4: its goals are the band outside its outline, so the run
          // can end beside a room check_floor still lists. Named only once
          // reachedBy says so; otherwise nothing is drawn for it and it is
          // islandsOf's, never claimed as connected.
          if (target.fallback && !reachedBy(target, polyline, box, points)) {
            givenUp[hit] = 1;
            open--;
          } else {
            done[hit] = 1;
            open--;
            const roomIds = [target.room.id];
            targets.forEach((u, k) => {
              if (done[k] || !reachedBy(u, polyline, box, points)) return;
              done[k] = 1;
              if (!givenUp[k]) open--;
              roomIds.push(u.room.id);
            });
            connectors.push({
              polyline,
              widthM: round1(lineWidth(raw, raster, toEdge, CONNECTOR_MIN_WIDTH_M, CONNECTOR_MAX_WIDTH_M)),
              roomIds,
              lengthM: round1(polylineLength(polyline)),
            });
            // The connector's own cells go in at 0, this one's included: it is taken again from there.
            seed(polyline);
            continue;
          }
        }
      }
      const col = i % cols;
      const row = (i - col) / cols;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dc === 0 && dr === 0) continue;
          const cc = col + dc;
          const rr = row + dr;
          if (cc < 0 || rr < 0 || cc >= cols || rr >= rows) continue;
          const j = rr * cols + cc;
          if (!cells[j]) continue;
          // A diagonal step passes between its two side cells: both must be floor.
          if (dc !== 0 && dr !== 0 && (!cells[row * cols + cc] || !cells[rr * cols + col])) continue;
          const nd = d + (dc !== 0 && dr !== 0 ? diagonal : cellM);
          if (nd > CONNECT_MAX_M || nd >= dist[j]!) continue;
          dist[j] = nd;
          prev[j] = i;
          queue.push(nd, j);
        }
      }
    }
  };
  return { seed, search, connectors, network, dist, done };
}

/**
 * Contract v6: which of an island's rooms a connector would reach if its
 * container were opened — the room made kind "area" and walkable, which is what
 * draw_paths does with an `inside`. It is worked out in memory, over a raster
 * built from a copy of the model: nothing here is written, and the model handed
 * in is not touched.
 *
 * Rehearsal 5 is why: opening Commercial & F&B (North) and Studio (East 3)
 * turned them into unreached areas inside bigger islands — 20 rooms no better
 * off, and two rooms needlessly areas.
 */
function freesOf(
  container: Room, model: MapModel, levelId: string, rooms: ReadonlyMap<string, Room>,
  codes: ReadonlyMap<string, Set<string>>, lines: readonly (readonly Vec2[])[],
): Set<string> {
  const open = (r: Room): Room => (r.id === container.id ? { ...r, kind: "area", walkable: true } : r);
  const raster = walkableRaster({ ...model, rooms: model.rooms.map(open) }, levelId);
  if (raster.cols === 0) return new Set();
  const run = searcher(raster, targetsOn(raster, new Map([...rooms].map(([id, r]) => [id, open(r)])), codes));
  for (const line of lines) run.seed(line);
  run.search();
  return new Set(run.connectors.flatMap(c => c.roomIds));
}

/**
 * Contract v5's connect_rooms, worked out; nothing is saved here.
 *
 * Targets are the rooms on the floor that check_floor lists as area.unreachable
 * or room.noAccess, from the model's own validation (validation reports no
 * unreached stop, so there are none of those). Sources are the floor's live
 * pathways routing reaches from an entrance or a stop: every one but those the
 * same validation calls pathway.disconnected, none while the building has no
 * entrance.
 *
 * One multi-source search walks suggest_paths' walkable raster (8-neighbour,
 * never cutting a blocked corner) out from the sources, CONNECT_MAX_M at most.
 * The first cell it takes where a connector to an unreached room may end (goalsOf)
 * makes that room's connector: nearest room first. The connector starts at the
 * foot of its first cell on the line it leaves, is simplified by
 * CONNECTOR_SIMPLIFY_M without leaving the floor (simplifyOnFloor), takes the width rule clamped to 1–3 m, and becomes a
 * source itself, so the search carries on from it too; every room check_floor
 * would then stop listing (reachedBy) goes on it and is skipped. A room whose
 * goals are the band outside its outline goes on it only once reachedBy says
 * so. What the search never reaches is on an island (islandsOf).
 *
 * Every connector is worked out, so `left` says how many past `max` a second
 * call would make; the islands are measured from the lines the call leaves on
 * the floor — its sources and the connectors it keeps, and with `preview`, which
 * writes nothing, its sources alone (contract v5 amendment 4).
 */
export function connectRooms(
  model: MapModel, levelId: string, max = MAX_CONNECTORS, preview = false, ink: PlanInk | null = null,
): RoomConnectors {
  const rooms = new Map(live(model.rooms).filter(r => r.levelId === levelId).map(r => [r.id, r]));
  const issues = validateModel(model).issues.filter(i => i.levelId === levelId);
  const codes = new Map<string, Set<string>>();
  for (const i of issues) {
    if (UNREACHED.has(i.code) && rooms.has(i.entityId)) codes.set(i.entityId, (codes.get(i.entityId) ?? new Set()).add(i.code));
  }
  if (codes.size === 0) return { connectors: [], bridges: [], islands: [], left: 0, containersLeft: 0 };

  const cut = new Set(issues.filter(i => i.code === "pathway.disconnected").map(i => i.entityId));
  const reached = live(model.entrances).length === 0
    ? []
    : live(model.pathways).filter(p => p.levelId === levelId && !cut.has(p.id));
  if (reached.length === 0) {
    throw new CannotConnect("No pathway there is reached from an entrance or a stop yet: add the entrances and the main lines first.");
  }
  const raster = walkableRaster(model, levelId);
  if (raster.cols === 0) throw new CannotConnect("It has no walkable area to run a pathway through.");

  const targets = targetsOn(raster, rooms, codes);
  const run = searcher(raster, targets);
  for (const p of reached) run.seed(p.polyline);
  /** How many of `network` were there before this call: seed appends one entry per connector after them. */
  const sources = run.network.length;
  run.search();
  const { connectors, network, dist, done } = run;

  const floorRooms = [...rooms.values()];
  const bridges: Bridge[] = [];
  // Amendment 4: the islands are measured from the lines this call leaves on
  // the floor, so an island's `from` is never a point on a line nobody wrote —
  // a bridge laid from it would be pathway.disconnected.
  const drawn = () => (preview
    ? network.slice(0, sources)
    : [...network.slice(0, sources), ...connectors.slice(0, max).map(c => c.polyline), ...bridges.map((b): Vec2[] => [b.from, b.to])]);
  /** The islands as the floor stands. Held, since the bridging phase asks before and after, and only a bridge changes the answer. */
  let grouped: Grouped[] | null = null;
  const standing = () => (grouped ??= islandsOf(raster, dist, targets.filter((_, k) => !done[k]), drawn(), floorRooms));

  // Contract v6's second phase: the islands this call would otherwise just
  // name, bridged where the drawing shows open floor, nearest gap first
  // (islandsOf sorts them). Only while nothing was capped, so a bridge is laid
  // from the whole network, and never on a preview, which writes nothing a
  // bridge could stand on.
  if (ink && !preview && connectors.length <= max) {
    for (const island of standing()) {
      const bridge = bridgeAcross(island, floorRooms, ink);
      if (bridge) bridges.push(bridge);
    }
    if (bridges.length > 0) {
      for (const b of bridges) run.seed([b.from, b.to]);
      run.search();
      grouped = null;
    }
  }

  const bridged = new Set(bridges.flatMap(b => b.roomIds));
  const left = standing().filter(i => !i.roomIds.every(id => bridged.has(id)));

  // Contract v6: a container is named only with how many of the island's rooms
  // opening it would free, and not at all when that is none. One simulation per
  // container, however many islands lie in it, the ones that could free most
  // first, and only as many as the budget allows (MAX_CONTAINER_SIMS).
  const could = new Map<string, number>();
  for (const island of left) {
    if (island.inside) could.set(island.inside.roomId, (could.get(island.inside.roomId) ?? 0) + island.roomIds.length);
  }
  const order = [...could.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const freed = new Map<string, Set<string>>();
  const started = Date.now();
  for (const [roomId] of order) {
    if (freed.size >= MAX_CONTAINER_SIMS || (freed.size > 0 && Date.now() - started > CONTAINER_BUDGET_MS)) break;
    freed.set(roomId, freesOf(rooms.get(roomId)!, model, levelId, rooms, codes, drawn()));
  }

  const islands = left.map(({ inside, ...island }): Island => {
    const reaches = inside && freed.get(inside.roomId);
    if (!reaches) return island;
    const frees = island.roomIds.filter(id => reaches.has(id)).length;
    return frees > 0 ? { ...island, inside: { ...inside, frees } } : island;
  });
  return {
    connectors: connectors.slice(0, max),
    bridges,
    islands,
    left: Math.max(0, connectors.length - max),
    containersLeft: order.length - freed.size,
  };
}
