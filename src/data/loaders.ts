import type { Floor, Service, RouteVariant } from "./types";
import { validateBundle } from "./validate";

export async function loadDataBundle() {
  const [L1, L2, services, routesRaw] = await Promise.all([
    fetch("/data/floors/L1.json").then(r => r.json() as Promise<Floor>),
    fetch("/data/floors/L2.json").then(r => r.json() as Promise<Floor>),
    fetch("/data/services.json").then(r => r.json() as Promise<Service[]>),
    fetch("/data/waypoints.json")
      .then(r => (r.ok ? r.json() : []))
      .then(j => j as RouteVariant[]),
  ]);

  const floors = [L1, L2];
  const { errors } = validateBundle(floors, services, routesRaw);
  if (errors.length) {
    console.warn("[validateBundle] errors:\n" + errors.join("\n"));
  }
  return { floors, services, routes: routesRaw, errors };
}
