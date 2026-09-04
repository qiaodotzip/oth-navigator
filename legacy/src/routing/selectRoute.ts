import type { AccessibilityProfile, RouteVariant } from "@/data/types";

export function selectRoute(
  serviceId: string,
  profile: AccessibilityProfile,
  loads: Record<string, number>,
  routes: RouteVariant[],
): RouteVariant | null {
  const matches = routes.filter(
    r => r.serviceId === serviceId && r.profile === profile,
  );
  if (matches.length === 0) {
    if (profile === "stepFree") return selectRoute(serviceId, "default", loads, routes);
    return null;
  }
  if (matches.length === 1) return matches[0];
  let best = matches[0];
  let bestLoad = loads[best.counterId ?? ""] ?? 0;
  for (const r of matches.slice(1)) {
    const l = loads[r.counterId ?? ""] ?? 0;
    if (l < bestLoad) {
      best = r;
      bestLoad = l;
    }
  }
  return best;
}
