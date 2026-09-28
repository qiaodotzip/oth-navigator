import { live, ringCentroid, type MapModel, type Vec2 } from "@oth/model";
import { walkableAt, type Raster } from "./raster";

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
 * straight segment can reach without leaving the walkable surface, or listed
 * as unconnected with the reason.
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
    const to = near.find(q => clearLine(r, t.point, q, SLACK_M));
    if (to) links.push({ from, segment: [t.point, to] });
    else unconnected.push({ ...from, reason: near.length === 0 ? REASONS.noLine : REASONS.blocked });
  }
  return { links, unconnected };
}
