import type { Ring, Vec2 } from "../primitives";
import { bboxOfRing, pointInPolygon } from "./point";
import { ringCentroid } from "./ring";
import { distancePointToSegment } from "./segment";

export type LabelPoint = {
  /** The point deepest inside the shape: its pole of inaccessibility. */
  point: Vec2;
  /** How far that point is from the nearest edge, in metres: the radius of the widest circle that fits. */
  distance: number;
};

export type LabelSpan = { width: number; height: number };

/**
 * Cells examined before settling for the best found so far. A traced room
 * needs a few hundred; the cap is for footprints no room should have, which
 * the extractor can still produce.
 */
const MAX_CELLS = 4000;
/** At most this many starting cells along a room's length. */
const MAX_CELLS_PER_SIDE = 64;
/**
 * How far off a line, as a fraction of its length, a point may sit and still
 * count as on it. Extracted points are seldom exactly collinear; a billionth
 * is rounding, not a room.
 */
const COLLINEAR_TOLERANCE = 1e-9;

type Cell = { x: number; y: number; h: number; d: number; max: number };

/**
 * True when the ring encloses nothing: fewer than three points, or all of them
 * on one line. Its box cannot tell: a line drawn on the diagonal has a square
 * box, and would be searched cell by cell up to the cap.
 */
function enclosesNothing(ring: Ring): boolean {
  const a = ring[0];
  if (!a || ring.length < 3) return true;
  // The line runs from the first point to the one farthest from it.
  let b = a;
  let lengthSq = 0;
  for (const p of ring) {
    const d = (p[0] - a[0]) ** 2 + (p[1] - a[1]) ** 2;
    if (d > lengthSq) {
      lengthSq = d;
      b = p;
    }
  }
  // The cross product is a point's distance off the line, times the line's length.
  const tolerance = COLLINEAR_TOLERANCE * lengthSq;
  return ring.every(
    p => Math.abs((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])) <= tolerance,
  );
}

/**
 * The average of a ring's points. The centroid is no answer for a ring that
 * encloses nothing: it divides by the area, and an area that is only rounding
 * error puts it anywhere at all. An empty ring is nowhere, so it gets the
 * origin, which is at least a point.
 */
function vertexAverage(ring: Ring): Vec2 {
  if (ring.length === 0) return [0, 0];
  let x = 0;
  let y = 0;
  for (const p of ring) {
    x += p[0];
    y += p[1];
  }
  return [x / ring.length, y / ring.length];
}

function edgeDistance(p: Vec2, rings: readonly Ring[]): number {
  let min = Number.POSITIVE_INFINITY;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      min = Math.min(min, distancePointToSegment(p, ring[j]!, ring[i]!));
    }
  }
  return min;
}

/** A square cell of half-width `h`: its centre's signed distance, and the most any point in it could have. */
function makeCell(x: number, y: number, h: number, outer: Ring, holes: readonly Ring[]): Cell {
  const p: Vec2 = [x, y];
  const d = edgeDistance(p, [outer, ...holes]) * (pointInPolygon(p, outer, holes) ? 1 : -1);
  return { x, y, h, d, max: d + h * Math.SQRT2 };
}

function swap(cells: Cell[], i: number, j: number): void {
  const t = cells[i]!;
  cells[i] = cells[j]!;
  cells[j] = t;
}

/** A max-heap on `max`: the cell that could still hold the deepest point comes out first. */
class CellQueue {
  private readonly cells: Cell[] = [];

  get size(): number {
    return this.cells.length;
  }

  push(cell: Cell): void {
    const a = this.cells;
    a.push(cell);
    let i = a.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (a[parent]!.max >= a[i]!.max) break;
      swap(a, parent, i);
      i = parent;
    }
  }

  pop(): Cell | undefined {
    const a = this.cells;
    const top = a[0];
    const last = a.pop();
    if (a.length > 0 && last) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l]!.max > a[m]!.max) m = l;
        if (r < a.length && a[r]!.max > a[m]!.max) m = r;
        if (m === i) break;
        swap(a, i, m);
        i = m;
      }
    }
    return top;
  }
}

/**
 * Where a room's name goes: the point deepest inside it (Mapbox's polylabel).
 *
 * Not the centroid, which falls outside an L-shaped unit and on the wall of a
 * U. The plane is cut into square cells, and the cell that could still hold a
 * deeper point is always split next, until none can beat the best by more
 * than `precision` metres.
 */
export function labelPoint(outer: Ring, holes: readonly Ring[] = [], precision = 0.1): LabelPoint {
  // A line or a point has no inside: nothing fits, and the middle of its
  // points is as good as anywhere.
  if (enclosesNothing(outer)) return { point: vertexAverage(outer), distance: 0 };
  const box = bboxOfRing(outer);
  const width = box.maxX - box.minX;
  const height = box.maxY - box.minY;
  const centroid = ringCentroid(outer);

  // Cells as wide as the room is narrow, but no more than 64 along its
  // length: a sliver a thousand times longer than it is wide must not start
  // from a thousand cells.
  const size = Math.max(Math.min(width, height), Math.max(width, height) / MAX_CELLS_PER_SIDE);
  const h = size / 2;
  const queue = new CellQueue();
  // Counted, not stepped: a step smaller than rounding at the room's
  // coordinates would leave `x += size` where it was, for ever.
  const columns = Math.ceil(width / size);
  const rows = Math.ceil(height / size);
  for (let i = 0; i < columns; i++) {
    for (let j = 0; j < rows; j++) {
      queue.push(makeCell(box.minX + i * size + h, box.minY + j * size + h, h, outer, holes));
    }
  }

  // The centroid is right for most rooms; the box's middle is a second guess
  // for the ones where it is not.
  let best = makeCell(centroid[0], centroid[1], 0, outer, holes);
  const middle = makeCell(box.minX + width / 2, box.minY + height / 2, 0, outer, holes);
  if (middle.d > best.d) best = middle;

  for (let examined = 0; queue.size > 0 && examined < MAX_CELLS; examined++) {
    const cell = queue.pop()!;
    if (cell.d > best.d) best = cell;
    // The heap hands out the most promising cell first, so once it cannot
    // beat the best by more than the precision, none left can either.
    if (cell.max - best.d <= precision) break;
    const q = cell.h / 2;
    queue.push(makeCell(cell.x - q, cell.y - q, q, outer, holes));
    queue.push(makeCell(cell.x + q, cell.y - q, q, outer, holes));
    queue.push(makeCell(cell.x - q, cell.y + q, q, outer, holes));
    queue.push(makeCell(cell.x + q, cell.y + q, q, outer, holes));
  }
  return { point: [best.x, best.y], distance: Math.max(0, best.d) };
}

/**
 * How long a line centred on `p`, along `axis`, can be while staying inside
 * the rings: twice the distance to the nearer edge it would cross. Labels are
 * centred on their point, so a whole chord would overstate the room. At the
 * crook of an L, the arm running away from the point cannot hold the half of
 * the label on the other side.
 */
function centredChord(p: Vec2, rings: readonly Ring[], axis: 0 | 1): number {
  const across = axis === 0 ? 1 : 0;
  let below = Number.NEGATIVE_INFINITY;
  let above = Number.POSITIVE_INFINITY;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[j]!;
      const b = ring[i]!;
      // Half-open, as in ray casting: an edge touching the line at a vertex counts once.
      if (a[across] > p[across] === b[across] > p[across]) continue;
      const t = (p[across] - a[across]) / (b[across] - a[across]);
      const at = a[axis] + t * (b[axis] - a[axis]);
      if (at <= p[axis]) below = Math.max(below, at);
      else above = Math.min(above, at);
    }
  }
  return Number.isFinite(below) && Number.isFinite(above) ? 2 * Math.min(p[axis] - below, above - p[axis]) : 0;
}

/**
 * How much room a label centred on a point has: the widest and the tallest it
 * can be while staying inside the shape. A name is cut to the width, and
 * hidden when the height cannot take a line of text.
 */
export function labelSpan(point: Vec2, outer: Ring, holes: readonly Ring[] = []): LabelSpan {
  const rings = [outer, ...holes];
  return { width: centredChord(point, rings, 0), height: centredChord(point, rings, 1) };
}
