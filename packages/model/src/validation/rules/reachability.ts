import { pointInPolygon } from "../../geometry/point";
import { cellCentre, navGridGet } from "../../nav/grid";
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
      message: "The model has walkable rooms but no entrance, so nothing is reachable.",
      entityType: "building",
      entityId: model.building.id,
    }];
  }

  const byLevel = buildingReachability(model);
  const issues: ValidationIssue[] = [];

  for (const room of rooms) {
    const level = byLevel.get(room.levelId);
    if (!level) continue;
    const { grid, mask } = level;

    let anyReachable = false;
    for (let row = 0; row < grid.rows && !anyReachable; row++) {
      for (let col = 0; col < grid.cols; col++) {
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
        code: "room.unreachable",
        message: `Room "${room.id}" is walkable but cannot be reached from any entrance. Check for a missing doorway or portal.`,
        entityType: "room",
        entityId: room.id,
        levelId: room.levelId,
      });
    }
  }
  return issues;
};

export const reachabilityRules: Rule[] = [reachable];
