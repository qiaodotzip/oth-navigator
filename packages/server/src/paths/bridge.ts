import { pointInPolygon, type Room, type Vec2 } from "@oth/model";
import type { PlanInk } from "./ink";
import { CROSS_M, crossesOf, lengthInside } from "./reach";

/**
 * Contract v6's bridge: a pathway from a point on the network to a point on an
 * island, laid across space no live room covers, and only where the drawing
 * shows that space is open floor. A connector (connect.ts) only ever runs over
 * floor the map already has; a bridge is what crosses the ground nobody traced.
 */

/** The most unlabelled space one bridge crosses: longer than any corridor on these floors. */
export const BRIDGE_MAX_M = 12;
/**
 * The most line one bridge is, end to end, however little of it is unlabelled.
 * The cap above bounds the untraced ground a wrong bridge crosses; this bounds
 * how much pathway a wrong bridge leaves on the floor for a person to check.
 *
 * 20 m, from L1's own gaps: 12 of its 22 islands stand within it, the drawing
 * round a 20 m line fits in one `view_plan` box (PLAN_MARGIN_M is 10 m), and it
 * is half the 40 m a connector may run — a connector follows floor the map has,
 * a bridge only what the drawing shows. It excludes one real bridge: a 48.4 m
 * line over Town Square to Studio (East 1), bridging 2.2 m of untraced ground
 * at its far end, which is now an island named for a person.
 */
export const BRIDGE_MAX_RUN_M = 20;
/** A bridge's width. The drawing shows open floor, not how wide a walk it is, so: the narrowest. */
export const BRIDGE_WIDTH_M = 1;
/** How finely the run is cut into the stretches rooms cover and the stretches they don't. */
const STEP_M = 0.05;
/**
 * The audit action marking a pathway as a bridge, beside its own create row, so
 * the check step reads it as one (setup/fold.ts) rather than as a connector.
 */
export const BRIDGED = "bridged";

/** An island's straight gap, as `connect_rooms` reports it. */
export type Gap = { from: Vec2; to: Vec2; roomIds: readonly string[] };

/** One bridge to lay: the island it reaches, and how much unlabelled ground it crosses. */
export type Bridge = {
  from: Vec2;
  to: Vec2;
  /** The island room nearest the far end — the room the check row names. */
  toRoomId: string;
  toName: string;
  lengthM: number;
  /** How much of it crosses space no room covers, all of which the drawing shows as open floor. */
  openM: number;
  /** The island's rooms, so a bridged island leaves `islands`. */
  roomIds: string[];
};

const round1 = (v: number) => Math.round(v * 10) / 10;

/** The stretches of a–b that no live room covers, as [start, end] in metres along it. */
function unlabelled(a: Vec2, b: Vec2, rooms: readonly Room[]): Array<[number, number]> {
  const lengthM = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const steps = Math.max(1, Math.round(lengthM / STEP_M));
  const out: Array<[number, number]> = [];
  let from = -1;
  for (let s = 0; s <= steps; s++) {
    const t = (s * lengthM) / steps;
    const p: Vec2 = [a[0] + ((b[0] - a[0]) * t) / lengthM, a[1] + ((b[1] - a[1]) * t) / lengthM];
    const bare = !rooms.some(r => pointInPolygon(p, r.footprint, r.holes));
    if (bare && from < 0) from = t;
    if (!bare && from >= 0) {
      out.push([from, t]);
      from = -1;
    }
  }
  if (from >= 0) out.push([from, lengthM]);
  return out;
}

/**
 * The bridge for one island's gap, or null where none may be laid. Null when:
 * the run is longer than BRIDGE_MAX_RUN_M end to end; when it crosses a live
 * room of kind room (contract v4's `crosses`, unchanged) or any other space no
 * one walks — a void, a service block; when it would cross more than
 * BRIDGE_MAX_M of unlabelled space; when there is no unlabelled
 * space at all, since a bridge crosses what no room covers; and when the
 * drawing does not show open floor along every unlabelled stretch of it.
 *
 * The drawing is asked only about the unlabelled stretches: the rest is floor
 * the map already carries, drawn over with the furniture, text and dimension
 * lines of the rooms it belongs to.
 */
export function bridgeAcross(gap: Gap, rooms: readonly Room[], ink: PlanInk): Bridge | null {
  const { from, to } = gap;
  const lengthM = Math.hypot(to[0] - from[0], to[1] - from[1]);
  if (lengthM === 0 || lengthM > BRIDGE_MAX_RUN_M) return null;
  const line: Vec2[] = [from, to];
  if (crossesOf(line, rooms).length > 0) return null;
  if (rooms.some(r => !r.walkable && lengthInside(line, r.footprint, r.holes) > CROSS_M)) return null;

  const stretches = unlabelled(from, to, rooms);
  const openM = stretches.reduce((sum, [s, e]) => sum + e - s, 0);
  if (openM === 0 || openM > BRIDGE_MAX_M) return null;
  const point = (t: number): Vec2 => [from[0] + ((to[0] - from[0]) * t) / lengthM, from[1] + ((to[1] - from[1]) * t) / lengthM];
  for (const [s, e] of stretches) {
    if (!ink.run(point(s), point(e)).open) return null;
  }

  const island = gap.roomIds.map(id => rooms.find(r => r.id === id)).filter((r): r is Room => r !== undefined);
  const reached = island
    .map(r => ({ r, d: Math.min(...r.footprint.map(p => Math.hypot(p[0] - to[0], p[1] - to[1]))) }))
    .sort((p, q) => p.d - q.d)[0]?.r;
  return {
    from, to,
    toRoomId: reached?.id ?? gap.roomIds[0] ?? "",
    toName: reached?.nameEn || reached?.id || gap.roomIds[0] || "",
    lengthM: round1(lengthM),
    openM: round1(openM),
    roomIds: [...gap.roomIds],
  };
}
