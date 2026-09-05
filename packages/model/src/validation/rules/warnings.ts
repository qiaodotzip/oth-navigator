import { bboxContains, bboxOfRing } from "../../geometry/point";
import { live } from "../../primitives";
import type { Rule, ValidationIssue } from "../types";

/** Warnings surface quality problems without blocking a publish. */
const unnamedRooms: Rule = model =>
  live(model.rooms)
    // A detail is not somewhere you go, so it needs no name to be announced by.
    .filter(r => r.kind !== "detail")
    .filter(r => r.nameEn.trim() === "" && r.nameZh.trim() === "")
    .map<ValidationIssue>(r => ({
      severity: "warning",
      code: "room.name.missing",
      message: `Room "${r.id}" has no name in either language.`,
      entityType: "room",
      entityId: r.id,
      levelId: r.levelId,
    }));

const unverifiedTenants: Rule = model =>
  live(model.tenants)
    .filter(t => t.verification.status === "unverified")
    .map<ValidationIssue>(t => ({
      severity: "warning",
      code: "tenant.unverified",
      message: `Tenant "${t.nameEn}" has never been verified against the real building.`,
      entityType: "tenant",
      entityId: t.id,
      levelId: t.levelId,
    }));

const levelsWithoutPortals: Rule = model => {
  const served = new Set(live(model.portalEndpoints).map(ep => ep.levelId));
  return live(model.levels)
    .filter(l => !served.has(l.id))
    .map<ValidationIssue>(l => ({
      severity: "warning",
      code: "level.portals.none",
      message: `Level "${l.code}" has no lift, stair or escalator endpoint.`,
      entityType: "level",
      entityId: l.id,
      levelId: l.id,
    }));
};

/**
 * Uses the asset's XY bounding box only — placements rotate about the vertical
 * axis, so the footprint check ignores Z deliberately.
 */
const placementsOutsideAnchor: Rule = model => {
  const rooms = new Map(live(model.rooms).map(r => [r.id, r]));
  const assets = new Map(live(model.assets).map(a => [a.id, a]));
  const issues: ValidationIssue[] = [];

  for (const p of live(model.placements)) {
    if (!p.roomId) continue;
    const room = rooms.get(p.roomId);
    const asset = assets.get(p.assetId);
    if (!room || !asset) continue;

    const placed = {
      minX: p.position[0] + asset.bbox.minX * p.scale,
      minY: p.position[1] + asset.bbox.minY * p.scale,
      maxX: p.position[0] + asset.bbox.maxX * p.scale,
      maxY: p.position[1] + asset.bbox.maxY * p.scale,
    };

    if (!bboxContains(bboxOfRing(room.footprint), placed)) {
      issues.push({
        severity: "warning",
        code: "placement.outsideAnchorRoom",
        message: `Placement "${p.id}" extends outside its anchor room "${p.roomId}".`,
        entityType: "placement",
        entityId: p.id,
        levelId: p.levelId,
      });
    }
  }
  return issues;
};

export const warningRules: Rule[] = [
  unnamedRooms,
  unverifiedTenants,
  levelsWithoutPortals,
  placementsOutsideAnchor,
];
