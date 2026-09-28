import { bboxOfRing, distancePointToSegment, pointInPolygon, type Ring, type Room, type Vec2 } from "@oth/model";

/**
 * Contract v4: a line's "end" end reaches a room it lies inside or within
 * this of. On a floor with no doorways, a dead end into a room is that room's
 * way in, and draw_paths keeps it.
 */
export const REACH_M = 1;
/**
 * Contract v4: a line crosses a room of kind room it runs more than this far
 * inside, measured along the line. Rehearsal 3's p7-02 ran 8 m through the
 * Public Service Centre, where a corridor was traced over it.
 */
export const CROSS_M = 2;

type End = "fork" | "end" | "loop";
type Box = { minX: number; minY: number; maxX: number; maxY: number };

const near = (a: Box, b: Box, pad: number) =>
  a.minX - pad <= b.maxX && b.minX - pad <= a.maxX && a.minY - pad <= b.maxY && b.minY - pad <= a.maxY;

function lineBox(line: readonly Vec2[]): Box {
  const xs = line.map(p => p[0]);
  const ys = line.map(p => p[1]);
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

/** How far a point is from a room: 0 inside it, else the nearest of its outline's edges, its holes' too. */
export function distanceToRoom(p: Vec2, room: Room): number {
  if (pointInPolygon(p, room.footprint, room.holes)) return 0;
  let best = Infinity;
  for (const ring of [room.footprint, ...room.holes]) {
    for (let i = 0; i < ring.length; i++) best = Math.min(best, distancePointToSegment(p, ring[i]!, ring[(i + 1) % ring.length]!));
  }
  return best;
}

/**
 * Contract v4's reaches: the ids of the rooms that a line's "end" ends lie
 * inside or within REACH_M of, in id order. Every kind counts, the open area
 * the end stands in too. A line with no "end" end reaches nothing.
 */
export function reachesOf(line: readonly Vec2[], ends: readonly [End, End], rooms: readonly Room[]): string[] {
  const at = [ends[0] === "end" ? line[0] : null, ends[1] === "end" ? line[line.length - 1] : null].filter((p): p is Vec2 => !!p);
  if (at.length === 0) return [];
  const out = new Set<string>();
  for (const room of rooms) {
    const box = bboxOfRing(room.footprint);
    for (const p of at) {
      if (near({ minX: p[0], minY: p[1], maxX: p[0], maxY: p[1] }, box, REACH_M) && distanceToRoom(p, room) <= REACH_M) out.add(room.id);
    }
  }
  return [...out].sort();
}

/** Where along a–b (0 to 1) it crosses the segment c–d, or null when it doesn't, or runs along it. */
function crossingAt(a: Vec2, b: Vec2, c: Vec2, d: Vec2): number | null {
  const rx = b[0] - a[0];
  const ry = b[1] - a[1];
  const sx = d[0] - c[0];
  const sy = d[1] - c[1];
  const denom = rx * sy - ry * sx;
  if (Math.abs(denom) < 1e-12) return null;
  const qx = c[0] - a[0];
  const qy = c[1] - a[1];
  const t = (qx * sy - qy * sx) / denom;
  const u = (qx * ry - qy * rx) / denom;
  return t > 0 && t < 1 && u >= 0 && u <= 1 ? t : null;
}

/**
 * How much of a line lies inside an outline, less its holes, in metres. Each
 * segment is cut where it crosses the outline, and each piece whose middle is
 * inside counts whole.
 */
export function lengthInside(line: readonly Vec2[], footprint: Ring, holes: readonly Ring[]): number {
  if (!near(lineBox(line), bboxOfRing(footprint), 0)) return 0;
  let total = 0;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1]!;
    const b = line[i]!;
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (length === 0) continue;
    const cuts = [0, 1];
    for (const ring of [footprint, ...holes]) {
      for (let k = 0; k < ring.length; k++) {
        const t = crossingAt(a, b, ring[k]!, ring[(k + 1) % ring.length]!);
        if (t !== null) cuts.push(t);
      }
    }
    cuts.sort((p, q) => p - q);
    for (let k = 1; k < cuts.length; k++) {
      const [t0, t1] = [cuts[k - 1]!, cuts[k]!];
      if (t1 - t0 <= 0) continue;
      const mid: Vec2 = [a[0] + (b[0] - a[0]) * ((t0 + t1) / 2), a[1] + (b[1] - a[1]) * ((t0 + t1) / 2)];
      if (pointInPolygon(mid, footprint, holes)) total += (t1 - t0) * length;
    }
  }
  return total;
}

/**
 * Contract v4's crosses: the ids of the rooms of kind room a line runs more
 * than CROSS_M inside, in id order. A pathway opens its full width all along,
 * so one through a shop opens the shop's walls.
 */
export function crossesOf(line: readonly Vec2[], rooms: readonly Room[]): string[] {
  return rooms
    .filter(r => r.kind === "room" && lengthInside(line, r.footprint, r.holes) > CROSS_M)
    .map(r => r.id)
    .sort();
}
