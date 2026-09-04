import { ringArea, ringIsSimple } from "../../geometry/ring";
import { live } from "../../primitives";
import type { Rule, ValidationIssue } from "../types";

/** Below this, a footprint is a drawing mistake rather than a room. */
export const MIN_ROOM_AREA_M2 = 0.5;

const duplicateIds: Rule = model => {
  const issues: ValidationIssue[] = [];
  const seen = new Set<string>();
  for (const room of live(model.rooms)) {
    if (seen.has(room.id)) {
      issues.push({
        severity: "error",
        code: "room.id.duplicate",
        message: `Two rooms share the id "${room.id}".`,
        entityType: "room",
        entityId: room.id,
        levelId: room.levelId,
      });
    }
    seen.add(room.id);
  }
  return issues;
};

const duplicateLevelCodes: Rule = model => {
  const issues: ValidationIssue[] = [];
  const seen = new Set<string>();
  for (const level of live(model.levels)) {
    if (seen.has(level.code)) {
      issues.push({
        severity: "error",
        code: "level.code.duplicate",
        message: `Two levels share the code "${level.code}".`,
        entityType: "level",
        entityId: level.id,
      });
    }
    seen.add(level.code);
  }
  return issues;
};

const roomFootprints: Rule = model => {
  const issues: ValidationIssue[] = [];
  const levelIds = new Set(live(model.levels).map(l => l.id));

  for (const room of live(model.rooms)) {
    if (!levelIds.has(room.levelId)) {
      issues.push({
        severity: "error",
        code: "room.levelId.missing",
        message: `Room "${room.id}" references level "${room.levelId}", which does not exist.`,
        entityType: "room",
        entityId: room.id,
      });
    }

    if (!ringIsSimple(room.footprint)) {
      issues.push({
        severity: "error",
        code: "room.footprint.selfIntersecting",
        message: `Room "${room.id}" has a self-intersecting footprint.`,
        entityType: "room",
        entityId: room.id,
        levelId: room.levelId,
      });
    } else if (Math.abs(ringArea(room.footprint)) < MIN_ROOM_AREA_M2) {
      issues.push({
        severity: "error",
        code: "room.footprint.degenerateArea",
        message: `Room "${room.id}" has an area below ${MIN_ROOM_AREA_M2} m².`,
        entityType: "room",
        entityId: room.id,
        levelId: room.levelId,
      });
    }

    for (const hole of room.holes) {
      if (!ringIsSimple(hole)) {
        issues.push({
          severity: "error",
          code: "room.hole.selfIntersecting",
          message: `Room "${room.id}" has a self-intersecting hole.`,
          entityType: "room",
          entityId: room.id,
          levelId: room.levelId,
        });
      }
    }
  }
  return issues;
};

export const structureRules: Rule[] = [duplicateIds, duplicateLevelCodes, roomFootprints];
