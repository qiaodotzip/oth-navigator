import type { Floor, Service, RouteVariant } from "./types";

export function validateBundle(
  floors: Floor[],
  services: Service[],
  routes: RouteVariant[],
) {
  const errors: string[] = [];
  const polygonIds = new Set(
    floors.flatMap(f => f.polygons.map(p => p.id)),
  );
  const serviceIds = new Set(services.map(s => s.id));

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
  }

  return { errors };
}
