import type { Floor, Journey, Service } from "@/data/types";
import {
  retrieveServices,
  type AdaptedService,
  type RetrieveResponse,
  type UserContext,
} from "@/data/retrieval";
import { INTENT_SYNONYMS } from "./synonyms";
import type { Plan, PlanStop, ResolveResult } from "./types";

/** Local matches at or above this confidence skip the backend entirely. */
const LOCAL_CONFIDENCE_THRESHOLD = 0.7;

const SERVICESG_ID = "servicesg"; // human-help anchor

function toStop(svc: Service): PlanStop {
  return {
    serviceId: svc.id,
    name: { en: svc.nameEn, zh: svc.nameZh },
    floorId: svc.floorId,
    roomId: svc.roomId,
    accessibility: {
      liftAccess: svc.accessibility.liftAccess,
      stepFree: svc.accessibility.stepFreeRoute,
      notes: svc.accessibility.notes,
    },
  };
}

function score(query: string, keywords: string[]): number {
  let s = 0;
  for (const k of keywords) if (query.includes(k)) s += k.length; // longer = stronger
  return s;
}

export function resolveLocal(query: string, services: Service[]): ResolveResult {
  const q = query.trim().toLowerCase();
  let best: { serviceId: string; score: number } | null = null;

  for (const entry of INTENT_SYNONYMS) {
    const s = score(q, entry.keywords);
    if (s > 0 && (!best || s > best.score)) best = { serviceId: entry.serviceId, score: s };
  }
  // direct service-name match wins outright
  for (const svc of services) {
    const name = svc.nameEn.toLowerCase();
    if (q.length > 2 && (name.includes(q) || q.includes(name))) {
      best = { serviceId: svc.id, score: 999 };
    }
  }

  const anchor = services.find(s => s.id === SERVICESG_ID) ?? services[0];

  if (!best) {
    return {
      confidence: 0,
      plan: {
        kind: "human",
        message: {
          en: "I'm not sure where that is — let's get you to someone who can help.",
          zh: "我不确定地点 — 带您去找工作人员协助。",
        },
        stop: toStop(anchor),
      },
    };
  }

  const svc = services.find(s => s.id === best!.serviceId) ?? anchor;
  const confidence = best.score >= 4 ? 0.9 : 0.6;

  if (svc.routable && svc.floorId && svc.roomId) {
    const lvl = svc.displayFloor.replace(/^L/, "Level ");
    return {
      confidence,
      plan: {
        kind: "destination",
        answer: { en: `${svc.nameEn} · ${lvl}`, zh: svc.nameZh },
        stop: toStop(svc),
      },
    };
  }

  // Matched a service we can't place on our map yet. These are physical
  // services the backend can route better (to the right counter), so defer to
  // it with LOW confidence rather than dead-ending in a local "Start in App"
  // card. If the backend is down, send the user to the ServiceSG counter.
  // (Genuine digital "Start in App" cards come from the backend's
  // Digital_Hotline classification — see planFromRetrieval — not from here.)
  return {
    confidence: 0.3,
    plan: {
      kind: "human",
      message: {
        en: "Let me point you to the ServiceSG counter — the staff there can direct you.",
        zh: "带您到 ServiceSG 柜台，工作人员可为您指引。",
      },
      stop: toStop(anchor),
    },
  };
}

/** A backend retrieval result → a PlanStop (carries docs/hours into the card). */
function adaptedToStop(a: AdaptedService): PlanStop {
  return {
    serviceId: a.id,
    name: { en: a.nameEn, zh: a.nameZh },
    floorId: a.floorId,
    roomId: a.roomId,
    operatingHours: a.operatingHours,
    requiredDocuments: a.requiredDocuments.map(d => ({
      name: d.name,
      note: d.notes ?? undefined,
    })),
    accessibility: {
      liftAccess: a.accessibility.liftAccess,
      stepFree: a.accessibility.stepFreeRoute,
      notes: a.accessibility.notes,
    },
  };
}

/** Map the backend's top-ranked result into a Plan (destination or offsite). */
export function planFromRetrieval(resp: RetrieveResponse): Plan {
  const top = resp.services[0];
  const stop = adaptedToStop(top);
  if (top.locationType === "Digital_Hotline") {
    return {
      kind: "offsite",
      stop,
      appHandoff: { label: { en: "Start in App", zh: "在应用中开始" } },
    };
  }
  const lvl = top.displayFloor ? top.displayFloor.replace(/^L/, "Level ") : "";
  return {
    kind: "destination",
    answer: { en: lvl ? `${top.nameEn} · ${lvl}` : top.nameEn, zh: top.nameZh },
    stop,
  };
}

/**
 * Two-tier resolve: try locally first; if we're not confident, ask the backend.
 * Falls back to the local guess if the backend signals low confidence, returns
 * nothing, or is unreachable — so the app still works offline.
 * `retrieve` is injectable for testing.
 */
export async function resolveIntent(
  query: string,
  services: Service[],
  floors: Floor[],
  ctx?: UserContext,
  retrieve: typeof retrieveServices = retrieveServices,
): Promise<Plan> {
  const local = resolveLocal(query, services);
  if (local.confidence >= LOCAL_CONFIDENCE_THRESHOLD) return local.plan;
  try {
    const resp = await retrieve(query, floors, ctx);
    if (resp.confidenceLow || resp.services.length === 0) return local.plan;
    return planFromRetrieval(resp);
  } catch {
    return local.plan; // backend down → best local guess
  }
}

export function planToJourney(plan: Extract<Plan, { kind: "journey" }>): Journey {
  return {
    id: "plan-journey",
    stops: plan.stops.map((s, i) => ({ serviceId: s.serviceId, order: i, reason: s.reason })),
  };
}
