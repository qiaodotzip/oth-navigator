import { pointInPolygon } from "../../geometry/point";
import { distancePointToSegment, segmentsProperlyIntersect } from "../../geometry/segment";
import { navGridGet } from "../../nav/grid";
import { buildingReachability } from "../../nav/reachability";
import { live } from "../../primitives";
import type { Vec2 } from "../../primitives";
import type { Rule, ValidationIssue } from "../types";

/** How near a pathway must pass for a destination to count as served. */
export const ROOM_ACCESS_M = 3;

/**
 * Shortest distance between two segments. Zero if they cross; otherwise the
 * nearest of the four endpoint-to-segment distances, which is exact for
 * non-crossing segments.
 */
function segmentDistance(a1: Vec2, a2: Vec2, b1: Vec2, b2: Vec2): number {
  if (segmentsProperlyIntersect(a1, a2, b1, b2)) return 0;
  return Math.min(
    distancePointToSegment(a1, b1, b2),
    distancePointToSegment(a2, b1, b2),
    distancePointToSegment(b1, a1, a2),
    distancePointToSegment(b2, a1, a2),
  );
}

/**
 * How far a room's boundary is from the nearest pathway.
 *
 * Measured edge to edge, not vertex to vertex: a path running down the middle
 * of a room, or parallel to a long wall, is metres from every corner while
 * plainly serving it. A path with any point inside the footprint is zero.
 */
function nearestPathwayDistance(
  lines: readonly (readonly Vec2[])[],
  footprint: readonly Vec2[],
  holes: readonly (readonly Vec2[])[],
): number {
  let best = Infinity;

  for (const line of lines) {
    for (const point of line) {
      if (pointInPolygon(point, footprint, holes)) return 0;
    }
    for (let i = 0; i + 1 < line.length; i++) {
      const p1 = line[i];
      const p2 = line[i + 1];
      if (!p1 || !p2) continue;
      for (let j = 0; j < footprint.length; j++) {
        const e1 = footprint[j];
        const e2 = footprint[(j + 1) % footprint.length];
        if (!e1 || !e2) continue;
        best = Math.min(best, segmentDistance(p1, p2, e1, e2));
      }
    }
  }
  return best;
}

/**
 * A destination room is served if a pathway passes near it.
 *
 * A warning rather than an error on purpose: on an approximate floorplan "does
 * this path reach the shop front" is inherently fuzzy, and blocking publish on
 * it would mean a rough plan could never be published at all.
 */
const roomAccess: Rule = model => {
  const issues: ValidationIssue[] = [];
  const rooms = live(model.rooms).filter(r => r.kind === "room" || r.kind === "service");

  const byLevel = new Map<string, Vec2[][]>();
  for (const p of live(model.pathways)) {
    byLevel.set(p.levelId, [...(byLevel.get(p.levelId) ?? []), [...p.polyline]]);
  }

  for (const room of rooms) {
    const lines = byLevel.get(room.levelId) ?? [];
    const nearest = nearestPathwayDistance(lines, room.footprint, room.holes);
    if (nearest > ROOM_ACCESS_M) {
      issues.push({
        severity: "warning",
        code: "room.noAccess",
        message: `No pathway passes within ${ROOM_ACCESS_M} m of "${room.nameEn || room.id}", so nobody can reach it.`,
        entityType: "room",
        entityId: room.id,
        levelId: room.levelId,
      });
    }
  }
  return issues;
};

/** A pathway nothing can reach leads nowhere and is almost certainly a mistake. */
const pathwayConnectivity: Rule = model => {
  const pathways = live(model.pathways);
  // Before an entrance exists everything is unreachable; that is the entrance
  // step's problem, not every pathway's.
  if (pathways.length === 0 || live(model.entrances).length === 0) return [];

  const byLevel = buildingReachability(model);
  const issues: ValidationIssue[] = [];

  for (const p of pathways) {
    const level = byLevel.get(p.levelId);
    if (!level) continue;
    const { grid, mask } = level;

    const reachable = p.polyline.some(point => {
      const col = Math.floor((point[0] - grid.originX) / grid.cellSizeM);
      const row = Math.floor((point[1] - grid.originY) / grid.cellSizeM);
      if (!navGridGet(grid, col, row)) return false;
      const i = row * grid.cols + col;
      const byte = mask[i >> 3];
      return byte !== undefined && (byte & (1 << (i & 7))) !== 0;
    });

    if (!reachable) {
      issues.push({
        severity: "error",
        code: "pathway.disconnected",
        message: `Pathway "${p.id}" cannot be reached from any entrance, so it leads nowhere.`,
        entityType: "pathway",
        entityId: p.id,
        levelId: p.levelId,
      });
    }
  }
  return issues;
};

export const accessRules: Rule[] = [roomAccess, pathwayConnectivity];
