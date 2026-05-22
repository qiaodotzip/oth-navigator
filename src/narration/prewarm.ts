import { fetchNarration } from "./client";
import { setCached } from "./cache";
import type { Service, AccessibilityProfile, RouteVariant } from "@/data/types";

export async function prewarmAll(
  services: Service[],
  routes: RouteVariant[],
) {
  const profiles: AccessibilityProfile[] = ["default", "stepFree"];
  await Promise.allSettled(
    services.flatMap(svc =>
      profiles.map(async profile => {
        const route = routes.find(r => r.serviceId === svc.id && r.profile === profile);
        if (!route) return;
        const segmentKeys = route.steps.map(s => s.segmentKey);
        try {
          const result = await fetchNarration({
            query: svc.nameEn,
            profile,
            services: [svc],
            segmentKeys,
          });
          setCached(svc.id, profile, result);
        } catch (e) {
          console.warn(`prewarm failed for ${svc.id}/${profile}`, e);
        }
      }),
    ),
  );
}
