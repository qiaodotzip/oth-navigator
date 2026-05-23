import type { Detail, Floor, RouteVariant, Service, Waypoint } from "./types";
import { validateBundle } from "./validate";
import { checkSegment } from "@/routing/pathChecks";
import { findPath, smoothPath } from "@/routing/pathfinder";

async function fetchDetails(floorId: string): Promise<Detail[]> {
  try {
    const r = await fetch(`/data/floors/${floorId}-details.json`);
    if (!r.ok) return [];
    const data = await r.json();
    return Array.isArray(data?.details) ? (data.details as Detail[]) : [];
  } catch {
    return [];
  }
}

function expandRoutes(
  routes: RouteVariant[],
  floors: Floor[],
  services: Service[],
): RouteVariant[] {
  const floorById = new Map(floors.map(f => [f.id, f]));
  const servicesById = new Map(services.map(s => [s.id, s]));

  return routes.map(r => {
    const svc = servicesById.get(r.serviceId);
    const newSteps: Waypoint[] = r.steps.length > 0 ? [r.steps[0]] : [];

    for (let i = 0; i < r.steps.length - 1; i++) {
      const a = r.steps[i];
      const b = r.steps[i + 1];

      if (a.floorId !== b.floorId) {
        newSteps.push(b);
        continue;
      }

      const floor = floorById.get(a.floorId);
      if (!floor) {
        newSteps.push(b);
        continue;
      }

      const destRoom =
        svc && svc.floorId === floor.id ? svc.roomId : undefined;
      const report = checkSegment(a.point, b.point, floor, destRoom);

      if (!report.blocked) {
        newSteps.push(b);
        continue;
      }

      const path = findPath(a.point, b.point, floor, destRoom);
      if (!path || path.length < 2) {
        console.warn(
          `[expandRoutes] A* could not find a path for ${r.serviceId}/${r.profile} step ${i}->${i + 1}; keeping direct (may phase through walls)`,
        );
        newSteps.push(b);
        continue;
      }
      const smoothed = smoothPath(path, floor, destRoom);

      for (let k = 1; k < smoothed.length - 1; k++) {
        newSteps.push({
          floorId: a.floorId,
          point: smoothed[k],
          decisionPoint: false,
          segmentKey: `via-${i}-${k}`,
        });
      }
      newSteps.push(b);
    }

    return { ...r, steps: newSteps };
  });
}

export async function loadDataBundle() {
  const [L1, L2, L1Details, L2Details, services, routesRaw] = await Promise.all([
    fetch("/data/floors/L1.json").then(r => r.json() as Promise<Floor>),
    fetch("/data/floors/L2.json").then(r => r.json() as Promise<Floor>),
    fetchDetails("L1"),
    fetchDetails("L2"),
    fetch("/data/services.json").then(r => r.json() as Promise<Service[]>),
    fetch("/data/waypoints.json")
      .then(r => (r.ok ? r.json() : []))
      .then(j => j as RouteVariant[]),
  ]);

  L1.details = [...(L1.details ?? []), ...L1Details];
  L2.details = [...(L2.details ?? []), ...L2Details];

  const floors = [L1, L2];
  const routes = expandRoutes(routesRaw, floors, services);

  const { errors, warnings } = validateBundle(floors, services, routes);
  if (errors.length) {
    console.warn("[validateBundle] errors:\n" + errors.join("\n"));
  }
  if (warnings.length) {
    console.warn(
      "[validateBundle] path warnings (A* couldn't avoid all walls):\n" +
        warnings.join("\n"),
    );
  }
  return { floors, services, routes, errors };
}
