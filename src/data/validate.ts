import type { Floor, Service, RouteVariant } from "./types";
import { checkSegment } from "@/routing/pathChecks";

export function validateBundle(
  floors: Floor[],
  services: Service[],
  routes: RouteVariant[],
) {
  const errors: string[] = [];
  const warnings: string[] = [];
  const polygonIds = new Set(
    floors.flatMap(f => f.polygons.map(p => p.id)),
  );
  const serviceIds = new Set(services.map(s => s.id));
  const floorById = new Map(floors.map(f => [f.id, f]));
  const servicesById = new Map(services.map(s => [s.id, s]));

  for (const s of services) {
    if (!polygonIds.has(s.roomId)) {
      errors.push(`service "${s.id}" references unknown roomId "${s.roomId}"`);
    }
    if (!s.sourceUrl?.startsWith("http")) {
      errors.push(`service "${s.id}" has no valid sourceUrl`);
    }
  }

  for (const r of routes) {
    if (!serviceIds.has(r.serviceId)) {
      errors.push(`route references unknown serviceId "${r.serviceId}"`);
    }
    if (r.steps.length < 2) {
      errors.push(`route for "${r.serviceId}" has fewer than 2 waypoints`);
    }
    const svc = servicesById.get(r.serviceId);
    for (let i = 0; i < r.steps.length - 1; i++) {
      const a = r.steps[i];
      const b = r.steps[i + 1];
      if (a.floorId !== b.floorId) continue;
      const floor = floorById.get(a.floorId);
      if (!floor) continue;
      const destRoomId = svc && svc.floorId === floor.id ? svc.roomId : undefined;
      const report = checkSegment(a.point, b.point, floor, destRoomId);
      if (report.blocked) {
        warnings.push(
          `route ${r.serviceId}/${r.profile} step ${i}->${i + 1} crosses rooms: ${report.blockingRoomIds.join(", ")}`,
        );
      }
    }
  }

  return { errors, warnings };
}
