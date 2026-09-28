import { ringCentroid } from "../../geometry/ring";
import { live } from "../../primitives";
import { coVisiblePairs } from "../../survey/graph";
import type { Rule, ValidationIssue } from "../types";

/**
 * Two places seen in one frame whose rooms are further apart than this have
 * disagreed with each other. Generous on purpose: a long lens down a concourse
 * really can show two shops thirty metres apart.
 */
export const CO_VISIBLE_MAX_M = 40;

/**
 * A named place no room claims — either the trace is missing a unit, or this
 * was a duplicate. A kind of object is placed on the map as markers, never
 * bound, so it is never unbound either.
 */
const placeUnbound: Rule = model =>
  live(model.places)
    .filter(p => !p.roomId && !p.objectKindId)
    .map<ValidationIssue>(p => ({
      severity: "warning",
      code: "place.unbound",
      message: `Surveyed place "${p.nameEn}" is not bound to any room yet.`,
      entityType: "place",
      entityId: p.id,
      levelId: p.levelId,
    }));

/**
 * A traced room nobody has ever seen.
 *
 * The honest answer to "how much of this map has anyone actually looked at?".
 * Only rooms and areas — a detail is furniture and a void is a hole, and
 * nobody surveys those.
 */
const roomUnsurveyed: Rule = model => {
  const surveyed = new Set(live(model.places).map(p => p.roomId));
  return live(model.rooms)
    .filter(r => (r.kind === "room" || r.kind === "area") && !surveyed.has(r.id))
    .map<ValidationIssue>(r => ({
      severity: "warning",
      code: "room.unsurveyed",
      message: `Room "${r.nameEn || r.id}" has no surveyed place bound to it, so nothing confirms it exists.`,
      entityType: "room",
      entityId: r.id,
      levelId: r.levelId,
    }));
};

/**
 * Two places seen in the same frame whose rooms are nowhere near each other.
 *
 * This is the check the whole survey exists for: the footage and the geometry
 * are independent descriptions of one building, and this is where they are
 * allowed to disagree out loud. A warning, because either could be the wrong
 * one — the footage may be old, or the frame may show a reflection.
 */
const adjacencyBroken: Rule = model => {
  const places = new Map(live(model.places).map(p => [p.id, p]));
  const rooms = new Map(live(model.rooms).map(r => [r.id, r]));
  const issues: ValidationIssue[] = [];

  for (const { a, b } of coVisiblePairs(model)) {
    const pa = places.get(a);
    const pb = places.get(b);
    // Nothing to check while either is unbound; that is place.unbound's job.
    if (!pa?.roomId || !pb?.roomId) continue;

    const ra = rooms.get(pa.roomId);
    const rb = rooms.get(pb.roomId);
    if (!ra || !rb) continue;

    const [ax, ay] = ringCentroid(ra.footprint);
    const [bx, by] = ringCentroid(rb.footprint);
    const metres = Math.hypot(ax - bx, ay - by);
    if (metres <= CO_VISIBLE_MAX_M) continue;

    issues.push({
      severity: "warning",
      code: "place.adjacencyBroken",
      message:
        `"${pa.nameEn}" and "${pb.nameEn}" appear in the same photo, but the rooms ` +
        `they are bound to are ${metres.toFixed(0)} m apart.`,
      entityType: "place",
      entityId: pa.id,
      levelId: pa.levelId ?? ra.levelId,
    });
  }
  return issues;
};

export const surveyRules: Rule[] = [placeUnbound, roomUnsurveyed, adjacencyBroken];
