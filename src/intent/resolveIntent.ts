import type { Journey, Service } from "@/data/types";
import { INTENT_SYNONYMS } from "./synonyms";
import type { Plan, PlanStop, ResolveResult } from "./types";

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

  // Known service but not on our map → hand off to the app.
  return {
    confidence,
    plan: {
      kind: "offsite",
      stop: toStop(svc),
      appHandoff: { label: { en: "Start in App", zh: "在应用中开始" } },
    },
  };
}

export function planToJourney(plan: Extract<Plan, { kind: "journey" }>): Journey {
  return {
    id: "plan-journey",
    stops: plan.stops.map((s, i) => ({ serviceId: s.serviceId, order: i, reason: s.reason })),
  };
}
