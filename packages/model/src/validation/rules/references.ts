import { pointInPolygon } from "../../geometry/point";
import { live } from "../../primitives";
import type { MapModel } from "../../schema/model";
import type { Room } from "../../schema/structure";
import type { Rule, ValidationIssue } from "../types";

function roomIndex(model: MapModel): Map<string, Room> {
  return new Map(live(model.rooms).map(r => [r.id, r]));
}

const doorwayRefs: Rule = model => {
  const issues: ValidationIssue[] = [];
  const rooms = roomIndex(model);
  const levelIds = new Set(live(model.levels).map(l => l.id));

  for (const d of live(model.doorways)) {
    if (!levelIds.has(d.levelId)) {
      issues.push({
        severity: "error",
        code: "doorway.levelId.missing",
        message: `Doorway "${d.id}" references level "${d.levelId}", which does not exist.`,
        entityType: "doorway",
        entityId: d.id,
      });
      continue;
    }
    if (d.roomA === d.roomB) {
      issues.push({
        severity: "error",
        code: "doorway.room.selfJoin",
        message: `Doorway "${d.id}" joins room "${d.roomA}" to itself.`,
        entityType: "doorway",
        entityId: d.id,
        levelId: d.levelId,
      });
      continue;
    }
    for (const roomId of [d.roomA, d.roomB]) {
      const room = rooms.get(roomId);
      if (!room || room.levelId !== d.levelId) {
        issues.push({
          severity: "error",
          code: "doorway.room.missing",
          message: `Doorway "${d.id}" references room "${roomId}", which does not exist on level "${d.levelId}".`,
          entityType: "doorway",
          entityId: d.id,
          levelId: d.levelId,
        });
      }
    }
  }
  return issues;
};

const entranceRefs: Rule = model => {
  const issues: ValidationIssue[] = [];
  const rooms = roomIndex(model);

  for (const e of live(model.entrances)) {
    const room = rooms.get(e.roomId);
    if (!room) {
      issues.push({
        severity: "error",
        code: "entrance.room.missing",
        message: `Entrance "${e.id}" references room "${e.roomId}", which does not exist.`,
        entityType: "entrance",
        entityId: e.id,
        levelId: e.levelId,
      });
      continue;
    }
    if (!pointInPolygon(e.point, room.footprint, room.holes)) {
      issues.push({
        severity: "error",
        code: "entrance.point.outsideRoom",
        message: `Entrance "${e.id}" sits outside room "${e.roomId}".`,
        entityType: "entrance",
        entityId: e.id,
        levelId: e.levelId,
      });
    }
  }
  return issues;
};

const portalRefs: Rule = model => {
  const issues: ValidationIssue[] = [];
  const rooms = roomIndex(model);
  const portals = new Map(live(model.portals).map(p => [p.id, p]));
  const endpointsByPortal = new Map<string, number>();

  for (const ep of live(model.portalEndpoints)) {
    if (!portals.has(ep.portalId)) {
      issues.push({
        severity: "error",
        code: "portalEndpoint.portal.missing",
        message: `Endpoint "${ep.id}" references portal "${ep.portalId}", which does not exist.`,
        entityType: "portalEndpoint",
        entityId: ep.id,
        levelId: ep.levelId,
      });
      continue;
    }
    endpointsByPortal.set(ep.portalId, (endpointsByPortal.get(ep.portalId) ?? 0) + 1);

    const room = rooms.get(ep.roomId);
    if (!room) {
      issues.push({
        severity: "error",
        code: "portalEndpoint.room.missing",
        message: `Endpoint "${ep.id}" references room "${ep.roomId}", which does not exist.`,
        entityType: "portalEndpoint",
        entityId: ep.id,
        levelId: ep.levelId,
      });
    } else if (!pointInPolygon(ep.point, room.footprint, room.holes)) {
      issues.push({
        severity: "error",
        code: "portalEndpoint.point.outsideRoom",
        message: `Endpoint "${ep.id}" sits outside room "${ep.roomId}".`,
        entityType: "portalEndpoint",
        entityId: ep.id,
        levelId: ep.levelId,
      });
    }
  }

  for (const portal of live(model.portals)) {
    if ((endpointsByPortal.get(portal.id) ?? 0) < 2) {
      issues.push({
        severity: "error",
        code: "portal.endpoints.insufficient",
        message: `Portal "${portal.id}" has fewer than two endpoints, so it connects nothing.`,
        entityType: "portal",
        entityId: portal.id,
      });
    }
  }
  return issues;
};

const semanticRefs: Rule = model => {
  const issues: ValidationIssue[] = [];
  const rooms = roomIndex(model);
  const assets = new Set(live(model.assets).map(a => a.id));

  for (const t of live(model.tenants)) {
    if (!rooms.has(t.roomId)) {
      issues.push({
        severity: "error",
        code: "tenant.room.missing",
        message: `Tenant "${t.id}" references room "${t.roomId}", which does not exist.`,
        entityType: "tenant",
        entityId: t.id,
        levelId: t.levelId,
      });
    }
  }

  for (const p of live(model.placements)) {
    if (!assets.has(p.assetId)) {
      issues.push({
        severity: "error",
        code: "placement.asset.missing",
        message: `Placement "${p.id}" references asset "${p.assetId}", which does not exist.`,
        entityType: "placement",
        entityId: p.id,
        levelId: p.levelId,
      });
    }
  }
  return issues;
};

export const referenceRules: Rule[] = [doorwayRefs, entranceRefs, portalRefs, semanticRefs];
