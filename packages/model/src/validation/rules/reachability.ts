import { bboxOfRings, pointInPolygon } from "../../geometry/point";
import { cellCentre, navGridGet, worldToCell } from "../../nav/grid";
import { buildingReachability } from "../../nav/reachability";
import { live } from "../../primitives";
import type { Rule, ValidationIssue } from "../types";

const reachable: Rule = model => {
  const rooms = live(model.rooms).filter(r => r.walkable);
  if (rooms.length === 0) return [];

  if (live(model.entrances).length === 0) {
    return [{
      severity: "error",
      code: "building.entrances.none",
      message: "The model has walkable areas but no entrance, so nothing is reachable.",
      entityType: "building",
      entityId: model.building.id,
    }];
  }

  const byLevel = buildingReachability(model);
  const issues: ValidationIssue[] = [];

  // The flood fill silently skips an entrance on a closed cell. Say so here, or
  // the only symptom is every area reading as a missing pathway.
  for (const e of live(model.entrances)) {
    const level = byLevel.get(e.levelId);
    if (!level) continue;
    const { col, row } = worldToCell(level.grid, e.point);
    if (!navGridGet(level.grid, col, row)) {
      issues.push({
        severity: "error",
        code: "entrance.offFloor",
        message: `Entrance "${e.nameEn || e.id}" stands on a wall or off walkable floor, so routing cannot start from it. Move it into the open part of an area, or run a pathway through it.`,
        entityType: "entrance",
        entityId: e.id,
        levelId: e.levelId,
      });
    }
  }

  for (const room of rooms) {
    const level = byLevel.get(room.levelId);
    if (!level) continue;
    const { grid, mask } = level;

    // Bounded by the room's own extent. Scanning the whole grid per room made
    // this O(rooms x cells), and worst for exactly the rooms that are
    // unreachable, since those scan every cell before giving up — measured at
    // 1.8 seconds for two hundred units.
    const rb = bboxOfRings([room.footprint]);
    const c0 = Math.max(0, Math.floor((rb.minX - grid.originX) / grid.cellSizeM));
    const c1 = Math.min(grid.cols - 1, Math.ceil((rb.maxX - grid.originX) / grid.cellSizeM));
    const r0 = Math.max(0, Math.floor((rb.minY - grid.originY) / grid.cellSizeM));
    const r1 = Math.min(grid.rows - 1, Math.ceil((rb.maxY - grid.originY) / grid.cellSizeM));

    let anyReachable = false;
    for (let row = r0; row <= r1 && !anyReachable; row++) {
      for (let col = c0; col <= c1; col++) {
        if (!navGridGet(grid, col, row)) continue;
        const centre = cellCentre(grid, col, row);
        if (!pointInPolygon(centre, room.footprint, room.holes)) continue;
        const i = row * grid.cols + col;
        const byte = mask[i >> 3];
        if (byte !== undefined && (byte & (1 << (i & 7))) !== 0) {
          anyReachable = true;
          break;
        }
      }
    }

    if (!anyReachable) {
      issues.push({
        severity: "error",
        code: "area.unreachable",
        message: `Area "${room.nameEn || room.id}" cannot be reached from any entrance. Check for a missing pathway or portal.`,
        entityType: "room",
        entityId: room.id,
        levelId: room.levelId,
      });
    }
  }
  return issues;
};

export const reachabilityRules: Rule[] = [reachable];
