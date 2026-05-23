import type { Detail, Floor, Service, RouteVariant } from "./types";
import { validateBundle } from "./validate";

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
  const { errors, warnings } = validateBundle(floors, services, routesRaw);
  if (errors.length) {
    console.warn("[validateBundle] errors:\n" + errors.join("\n"));
  }
  if (warnings.length) {
    console.warn("[validateBundle] path warnings:\n" + warnings.join("\n"));
  }
  return { floors, services, routes: routesRaw, errors };
}
