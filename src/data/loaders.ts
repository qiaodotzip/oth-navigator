import type { Detail, Floor, Pt, RouteVariant, Service, Waypoint } from "./types";
import { validateBundle } from "./validate";
import { checkSegment } from "@/routing/pathChecks";
import { findPath } from "@/routing/pathfinder";

/** Remove points that lie on a straight line between their neighbours. */
function simplifyCollinear(path: Pt[]): Pt[] {
  if (path.length < 3) return path;
  const result: Pt[] = [path[0]];
  for (let i = 1; i < path.length - 1; i++) {
    const a = result[result.length - 1];
    const b = path[i];
    const c = path[i + 1];
    const cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    if (Math.abs(cross) > 0.5) result.push(b);
  }
  result.push(path[path.length - 1]);
  return result;
}

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
    if (r.steps.length === 0) return r;

    const newSteps: Waypoint[] = [{ ...r.steps[0] }];

    for (let i = 0; i < r.steps.length - 1; i++) {
      const a = r.steps[i];
      const b = r.steps[i + 1];

      // Cross-floor hop (lift/escalator): no walk path, blob teleports up.
      if (a.floorId !== b.floorId) {
        newSteps.push({ ...b, pathFromPrev: undefined });
        continue;
      }

      const floor = floorById.get(a.floorId);
      if (!floor) {
        newSteps.push({ ...b, pathFromPrev: [a.point, b.point] });
        continue;
      }

      const destRoom = svc && svc.floorId === floor.id ? svc.roomId : undefined;
      const report = checkSegment(a.point, b.point, floor, destRoom);

      if (!report.blocked) {
        newSteps.push({ ...b, pathFromPrev: [a.point, b.point] });
        continue;
      }

      const path = findPath(a.point, b.point, floor, destRoom);
      if (!path || path.length < 2) {
        console.warn(
          `[expandRoutes] A* could not find a path for ${r.serviceId}/${r.profile} step ${i}->${i + 1}; keeping direct (may phase through walls)`,
        );
        newSteps.push({ ...b, pathFromPrev: [a.point, b.point] });
        continue;
      }
      // Use the raw A* path (collinear-simplified only) — it is guaranteed
      // to stay in walkable cells, so it never re-crosses walls.
      newSteps.push({ ...b, pathFromPrev: simplifyCollinear(path) });
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
