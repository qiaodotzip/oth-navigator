# Intent-First Navigation — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the directory + always-on demo trip with an ask-first intent flow that resolves a typed/spoken need locally into a normalized Plan and presents it as a readable result + step-by-step directions — fully working offline (no backend).

**Architecture:** A pure `resolveLocal(query, services)` maps an intent to a `Plan` (destination | journey | offsite | human). The store holds `activePlan` + `intentStatus`. `PromptPanel` becomes a 4-state machine (IntentEntry → Resolving → ResultCard → TurnByTurn). Routing reuses the existing `buildRoute`/`onPickService`. The demo journey is no longer preloaded, which also removes the snap-back bug.

**Tech Stack:** React + Zustand + TypeScript + Tailwind + Vitest. phosphor-react icons.

---

## File structure

- Create `src/intent/types.ts` — `Plan`, `PlanStop`, `LocalizedText`, `ResolveResult`.
- Create `src/intent/synonyms.ts` — keyword→serviceId map + purpose-tile presets.
- Create `src/intent/resolveIntent.ts` — `resolveLocal()`, `planToJourney()`.
- Create `src/intent/resolveIntent.test.ts` — unit tests.
- Create `src/ui/IntentEntry.tsx` — ask box + purpose tiles + voice mic.
- Create `src/ui/ResultCard.tsx` — destination/journey/offsite/human views.
- Modify `src/store.ts` — add `activePlan`, `intentStatus`, actions; (App stops preloading the demo journey).
- Modify `src/ui/PromptPanel.tsx` — state machine + enriched directions.
- Modify `src/App.tsx` — `onSubmitIntent`, voice rewire, plan handlers, JourneyTimeline gating.
- Modify `src/App.tsx`/routing `onArrived` — guard chaining (snap-back fix).
- Add `src/routing/journeyChaining.test.ts` cases — snap-back regression.
- Delete `src/ui/ServiceTiles.tsx`, `src/ui/ServiceBrowser.tsx` (replaced).

---

## Task 1: Plan types

**Files:**
- Create: `src/intent/types.ts`

- [ ] **Step 1: Write the types**

```ts
import type { FloorId } from "@/data/types";

export type LocalizedText = { en: string; zh: string };

export type PlanStop = {
  serviceId: string;
  name: LocalizedText;
  floorId?: FloorId;
  roomId?: string;
  reason?: LocalizedText;
  walkInAccepted?: boolean;
  appointmentRequired?: boolean;
  operatingHours?: Record<string, string>;
  requiredDocuments?: { name: string; note?: string }[];
  accessibility?: { liftAccess: boolean; stepFree: boolean; notes?: string };
};

export type Plan =
  | { kind: "destination"; answer: LocalizedText; stop: PlanStop }
  | { kind: "journey"; title?: LocalizedText; stops: PlanStop[] }
  | { kind: "offsite"; stop: PlanStop; appHandoff: { label: LocalizedText; url?: string } }
  | { kind: "human"; message: LocalizedText; stop: PlanStop };

export type ResolveResult = { plan: Plan; confidence: number };
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/intent/types.ts
git commit -m "feat(intent): normalized Plan types"
```

---

## Task 2: Synonym map + purpose-tile presets

**Files:**
- Create: `src/intent/synonyms.ts`

- [ ] **Step 1: Write the map**

```ts
/** Local keyword → serviceId resolution (Phase 1, offline). Longer keyword
 *  matches score higher (see resolveLocal). serviceIds are the ids in
 *  public/data/services.json. */
export const INTENT_SYNONYMS: { serviceId: string; keywords: string[] }[] = [
  { serviceId: "servicesg", keywords: ["passport", "nric", "ic", "renew", "identity card", "servicesg", "service sg", "government document", "document", "documents"] },
  { serviceId: "cpf", keywords: ["cpf", "retirement", "provident fund", "silver support", "workfare"] },
  { serviceId: "hdb", keywords: ["hdb", "housing", "flat", "bto", "rental", "housing grant", "lease", "mortgage"] },
  { serviceId: "library", keywords: ["library", "book", "books", "borrow", "reading", "reserve book"] },
  { serviceId: "theatre", keywords: ["theatre", "theater", "show", "performance", "play", "concert", "event", "ticket", "tickets"] },
  { serviceId: "hawker", keywords: ["food", "eat", "hawker", "lunch", "dinner", "meal", "coffee", "hungry"] },
  { serviceId: "family-nexus", keywords: ["baby", "child", "children", "vaccination", "immunisation", "parenthood", "family nexus", "preschool"] },
  { serviceId: "family-medicine-clinic", keywords: ["doctor", "clinic", "sick", "medical", "medicine", "gp", "health check", "unwell"] },
  { serviceId: "family-service-centre", keywords: ["family service", "counselling", "social worker", "comcare", "financial help", "assistance"] },
  { serviceId: "community-centre", keywords: ["community", "cc", "activity", "class", "course", "interest group"] },
  { serviceId: "active-ageing", keywords: ["elderly", "senior", "ageing", "aging", "active ageing"] },
];

/** Quick-start tiles shown under the ask box. label is bilingual; query is fed
 *  to resolveLocal exactly as if typed. */
export const PURPOSE_TILES: { en: string; zh: string; query: string; iconKey: string }[] = [
  { en: "Documents", zh: "证件", query: "renew document", iconKey: "info" },
  { en: "Housing / HDB", zh: "组屋", query: "hdb housing", iconKey: "receipt" },
  { en: "Borrow books", zh: "借书", query: "library books", iconKey: "book" },
  { en: "Family & Care", zh: "家庭关怀", query: "family nexus baby", iconKey: "hospital" },
];
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/intent/synonyms.ts
git commit -m "feat(intent): local synonym map + purpose tiles"
```

---

## Task 3: `resolveLocal` + `planToJourney` (TDD)

**Files:**
- Create: `src/intent/resolveIntent.ts`
- Test: `src/intent/resolveIntent.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import type { Service } from "@/data/types";
import { resolveLocal, planToJourney } from "./resolveIntent";

function svc(over: Partial<Service> & { id: string }): Service {
  return {
    id: over.id,
    nameEn: over.nameEn ?? over.id,
    nameZh: over.nameZh ?? over.id,
    providerName: "P",
    category: "government",
    routable: over.routable ?? true,
    displayFloor: over.displayFloor ?? "L1",
    floorId: over.floorId,
    roomId: over.roomId,
    accessibility: { liftAccess: true, stepFreeRoute: true },
    sourceUrl: "https://x",
    iconKey: "info",
    ...over,
  };
}

const services: Service[] = [
  svc({ id: "servicesg", nameEn: "ServiceSG Centre", routable: true, floorId: "L1", roomId: "L1-room-psc", displayFloor: "L1" }),
  svc({ id: "library", nameEn: "Library", routable: true, floorId: "L2", roomId: "L2-room-library", displayFloor: "L2" }),
  svc({ id: "active-ageing", nameEn: "Active Ageing", routable: false, displayFloor: "L4" }),
];

describe("resolveLocal", () => {
  it("maps a passport intent to a routable destination Plan", () => {
    const { plan } = resolveLocal("I need to renew my passport", services);
    expect(plan.kind).toBe("destination");
    if (plan.kind === "destination") expect(plan.stop.serviceId).toBe("servicesg");
  });

  it("maps a non-routable service to an offsite (Start in App) Plan", () => {
    const { plan } = resolveLocal("elderly active ageing", services);
    expect(plan.kind).toBe("offsite");
  });

  it("falls back to a human Plan (ServiceSG) on no match", () => {
    const { plan } = resolveLocal("asdfghjkl nonsense", services);
    expect(plan.kind).toBe("human");
    if (plan.kind === "human") expect(plan.stop.serviceId).toBe("servicesg");
  });

  it("planToJourney numbers stops in order", () => {
    const j = planToJourney({
      kind: "journey",
      stops: [
        { serviceId: "servicesg", name: { en: "A", zh: "A" } },
        { serviceId: "library", name: { en: "B", zh: "B" } },
      ],
    });
    expect(j.stops.map(s => s.order)).toEqual([0, 1]);
    expect(j.stops[1].serviceId).toBe("library");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/intent/resolveIntent.test.ts`
Expected: FAIL — "resolveLocal is not a function".

- [ ] **Step 3: Write the implementation**

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/intent/resolveIntent.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/intent/resolveIntent.ts src/intent/resolveIntent.test.ts
git commit -m "feat(intent): resolveLocal + planToJourney with tests"
```

---

## Task 4: Store — `activePlan` + `intentStatus`

**Files:**
- Modify: `src/store.ts`

- [ ] **Step 1: Add imports + state fields**

In `src/store.ts`, add `Plan` to imports from a new path:

```ts
import type { Plan } from "@/intent/types";
```

Add to the `State` type (near `journey`/`activeRoute`):

```ts
  activePlan: Plan | null;
  intentStatus: "idle" | "resolving" | "resolved";
```

Add the action signatures:

```ts
  setPlan: (p: Plan | null) => void;
  setIntentStatus: (s: "idle" | "resolving" | "resolved") => void;
  resetIntent: () => void;
```

- [ ] **Step 2: Add initial values + implementations**

In the `create<State>` initial object add:

```ts
  activePlan: null,
  intentStatus: "idle",
```

And the implementations:

```ts
  setPlan: p => set({ activePlan: p }),
  setIntentStatus: s => set({ intentStatus: s }),
  resetIntent: () => set({ activePlan: null, intentStatus: "idle", journey: null }),
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/store.ts
git commit -m "feat(store): activePlan + intentStatus"
```

---

## Task 5: Snap-back fix + regression test

**Files:**
- Modify: `src/App.tsx` (the `onArrived` callback)
- Test: `src/routing/journeyChaining.test.ts` (add a case)

- [ ] **Step 1: Add the failing regression test**

Append to `src/routing/journeyChaining.test.ts`:

```ts
import { nextJourneyStopId } from "@/routing/journeyNav";

describe("journey chaining guard (snap-back fix)", () => {
  const journey = {
    id: "j",
    stops: [
      { serviceId: "servicesg", order: 0 },
      { serviceId: "library", order: 1 },
    ],
  };

  it("returns the next stop when the finished service is a member", () => {
    expect(nextJourneyStopId(journey, "servicesg")).toBe("library");
  });

  it("returns null when the finished service is NOT a journey member", () => {
    // Was the bug: a non-member defaulted to order -1 and chained to stop 0.
    expect(nextJourneyStopId(journey, "hawker")).toBeNull();
  });

  it("returns null after the last stop", () => {
    expect(nextJourneyStopId(journey, "library")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/routing/journeyChaining.test.ts`
Expected: FAIL — "nextJourneyStopId is not a function".

- [ ] **Step 3: Create the helper**

Create `src/routing/journeyNav.ts`:

```ts
import type { Journey } from "@/data/types";

/**
 * The id of the next journey stop after `finishedServiceId`, or null if the
 * finished service is not a member of the journey, or it was the last stop.
 * (Guards the old bug where a non-member's order defaulted to -1 and chained
 * back to the first stop.)
 */
export function nextJourneyStopId(journey: Journey, finishedServiceId: string): string | null {
  const sorted = [...journey.stops].sort((a, b) => a.order - b.order);
  const i = sorted.findIndex(s => s.serviceId === finishedServiceId);
  if (i < 0) return null; // not a member — do NOT chain
  const next = sorted[i + 1];
  return next ? next.serviceId : null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/routing/journeyChaining.test.ts`
Expected: PASS.

- [ ] **Step 5: Use the helper in `onArrived`**

In `src/App.tsx`, replace the journey-chaining block inside `onArrived` with:

```ts
  const onArrived = useCallback(() => {
    const st = useStore.getState();
    const route = st.activeRoute;
    if (!route) return;
    const sid = route.variant.serviceId;
    st.markStopDone(sid);
    st.setUserLocation(routeArrivalLocation(route.variant));
    const journey = st.journey;
    if (journey) {
      const nextId = nextJourneyStopId(journey, sid);
      if (nextId) {
        onPickService(nextId);
        return;
      }
    }
    st.endRoute();
    st.resetIntent();
  }, [onPickService]);
```

Add the import at the top of `App.tsx`:

```ts
import { nextJourneyStopId } from "@/routing/journeyNav";
```

- [ ] **Step 6: Run the full routing suite**

Run: `npx vitest run src/routing/`
Expected: PASS (all).

- [ ] **Step 7: Commit**

```bash
git add src/routing/journeyNav.ts src/routing/journeyChaining.test.ts src/App.tsx
git commit -m "fix(journey): chain only within journey members (snap-back)"
```

---

## Task 6: `IntentEntry` component

**Files:**
- Create: `src/ui/IntentEntry.tsx`

- [ ] **Step 1: Write the component**

```tsx
import { useEffect, useState } from "react";
import { MagnifyingGlass, Microphone } from "phosphor-react";
import { useStore } from "@/store";
import { ServiceIcon } from "./iconMap";
import { PURPOSE_TILES } from "@/intent/synonyms";

export function IntentEntry({
  onSubmit,
  onVoiceTap,
  voiceListening,
  voiceTranscript,
}: {
  onSubmit: (query: string) => void;
  onVoiceTap?: () => void;
  voiceListening?: boolean;
  voiceTranscript?: string;
}) {
  const language = useStore(s => s.language);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (voiceTranscript) setQuery(voiceTranscript);
  }, [voiceTranscript]);

  const submit = () => {
    const q = query.trim();
    if (q) onSubmit(q);
  };

  return (
    <div className="flex h-full flex-col px-4 pt-4">
      <h2 className="mb-3 text-lg font-extrabold text-oth-ink">
        {language === "zh" ? "今天需要办理什么？" : "What do you need to do today?"}
      </h2>

      <form
        onSubmit={e => {
          e.preventDefault();
          submit();
        }}
        className="flex items-center gap-2 rounded-2xl bg-white px-3 py-3 shadow-sm ring-1 ring-neutral-200 focus-within:ring-2 focus-within:ring-oth-primary"
      >
        <MagnifyingGlass size={22} weight="bold" className="text-neutral-400" />
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={language === "zh" ? "例如：更新护照" : "e.g. renew my passport"}
          className="w-full bg-transparent text-base font-medium text-oth-ink placeholder:text-neutral-400 focus:outline-none"
          aria-label="Describe what you need"
        />
        {onVoiceTap && (
          <button
            type="button"
            onClick={onVoiceTap}
            aria-label={voiceListening ? "Stop listening" : "Search by voice"}
            aria-pressed={voiceListening}
            className={`grid h-10 w-10 flex-shrink-0 place-items-center rounded-full transition ${
              voiceListening ? "animate-pulse bg-rose-500 text-white" : "bg-oth-primary/10 text-oth-primary"
            }`}
          >
            <Microphone size={22} weight="fill" />
          </button>
        )}
      </form>
      {voiceListening && (
        <p className="mt-1.5 px-1 text-xs font-semibold text-rose-500">
          {language === "zh" ? "正在聆听…请说出需求" : "Listening… say what you need"}
        </p>
      )}

      <p className="mb-2 mt-4 text-xs font-bold uppercase tracking-wider text-neutral-400">
        {language === "zh" ? "常见需求" : "Common needs"}
      </p>
      <div className="grid grid-cols-2 gap-2">
        {PURPOSE_TILES.map(t => (
          <button
            key={t.query}
            onClick={() => onSubmit(t.query)}
            className="flex items-center gap-2.5 rounded-2xl border border-neutral-200 bg-white p-3 text-left shadow-sm transition active:scale-[0.98] hover:border-oth-primary/40"
          >
            <span className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl bg-oth-primary/10 text-oth-primary">
              <ServiceIcon iconKey={t.iconKey} size={22} />
            </span>
            <span className="text-sm font-bold text-oth-ink">
              {language === "zh" ? t.zh : t.en}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/ui/IntentEntry.tsx
git commit -m "feat(ui): IntentEntry ask box + purpose tiles"
```

---

## Task 7: `ResultCard` component

**Files:**
- Create: `src/ui/ResultCard.tsx`

- [ ] **Step 1: Write the component**

```tsx
import { ArrowRight, MapPinLine, ArrowSquareOut, Check, Info } from "phosphor-react";
import { useStore } from "@/store";
import type { Plan } from "@/intent/types";

export function ResultCard({
  plan,
  onGuide,
  onStartInApp,
  onAskAgain,
}: {
  plan: Plan;
  onGuide: (plan: Plan) => void;
  onStartInApp: (plan: Extract<Plan, { kind: "offsite" }>) => void;
  onAskAgain: () => void;
}) {
  const language = useStore(s => s.language);
  const t = (x: { en: string; zh: string }) => (language === "zh" ? x.zh : x.en);

  const AskAgain = (
    <button
      onClick={onAskAgain}
      className="mt-2 w-full text-center text-sm font-semibold text-neutral-400 hover:text-oth-primary"
    >
      {language === "zh" ? "不是这个？重新询问" : "Not quite? Ask again"}
    </button>
  );

  if (plan.kind === "human") {
    return (
      <div className="flex h-full flex-col px-4 pt-4">
        <div className="flex items-start gap-3 rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200">
          <Info size={26} weight="fill" className="mt-0.5 flex-shrink-0 text-amber-600" />
          <p className="text-base font-semibold text-oth-ink">{t(plan.message)}</p>
        </div>
        <button
          onClick={() => onGuide(plan)}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-oth-primary py-3.5 text-base font-bold text-white shadow-sm transition active:scale-95"
        >
          {language === "zh" ? "带我去服务柜台" : "Take me to the help desk"}
          <ArrowRight size={20} weight="bold" />
        </button>
        {AskAgain}
      </div>
    );
  }

  if (plan.kind === "offsite") {
    return (
      <div className="flex h-full flex-col px-4 pt-4">
        <p className="text-xs font-bold uppercase tracking-wider text-violet-500">
          {language === "zh" ? "线上服务" : "Online service"}
        </p>
        <h2 className="mt-0.5 text-xl font-extrabold text-oth-ink">{t(plan.stop.name)}</h2>
        <p className="mt-1 text-sm font-medium text-neutral-500">
          {language === "zh" ? "此服务在应用中办理。" : "This is handled in the OTH app."}
        </p>
        <button
          onClick={() => onStartInApp(plan)}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-violet-600 py-3.5 text-base font-bold text-white shadow-sm transition active:scale-95"
        >
          {t(plan.appHandoff.label)}
          <ArrowSquareOut size={20} weight="bold" />
        </button>
        {AskAgain}
      </div>
    );
  }

  if (plan.kind === "journey") {
    return (
      <div className="flex h-full flex-col px-4 pt-4">
        <p className="text-xs font-bold uppercase tracking-wider text-oth-primary">
          {language === "zh" ? `行程 · ${plan.stops.length} 站` : `Your plan · ${plan.stops.length} stops`}
        </p>
        <ul className="mt-2 flex flex-col gap-2 overflow-y-auto">
          {plan.stops.map((s, i) => (
            <li key={s.serviceId} className="flex items-center gap-3 rounded-xl border border-neutral-200 bg-white p-2.5">
              <span className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-full bg-oth-primary text-sm font-bold text-white">
                {i + 1}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-bold text-oth-ink">{t(s.name)}</span>
                {s.reason && <span className="block truncate text-xs text-neutral-500">{t(s.reason)}</span>}
              </span>
            </li>
          ))}
        </ul>
        <button
          onClick={() => onGuide(plan)}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-oth-primary py-3.5 text-base font-bold text-white shadow-sm transition active:scale-95"
        >
          {language === "zh" ? `开始：${t(plan.stops[0].name)}` : `Start with ${t(plan.stops[0].name)}`}
          <ArrowRight size={20} weight="bold" />
        </button>
        {AskAgain}
      </div>
    );
  }

  // destination
  const a11y = plan.stop.accessibility;
  return (
    <div className="flex h-full flex-col px-4 pt-4">
      <div className="flex items-center gap-2">
        <Check size={20} weight="bold" className="text-green-600" />
        <h2 className="text-xl font-extrabold leading-tight text-oth-ink">{t(plan.answer)}</h2>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        {a11y?.stepFree && (
          <span className="inline-flex items-center gap-1 font-semibold text-green-700">
            <Check size={14} weight="bold" />
            {language === "zh" ? "无障碍" : "Step-free"}
          </span>
        )}
        {plan.stop.walkInAccepted && (
          <span className="font-semibold text-neutral-600">
            {language === "zh" ? "可直接前往" : "Walk-in OK"}
          </span>
        )}
      </div>
      {plan.stop.requiredDocuments && plan.stop.requiredDocuments.length > 0 && (
        <p className="mt-2 text-sm text-neutral-600">
          📄 {language === "zh" ? "请携带：" : "Bring: "}
          {plan.stop.requiredDocuments.map(d => d.name).join(", ")}
        </p>
      )}
      <button
        onClick={() => onGuide(plan)}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-oth-primary py-3.5 text-base font-bold text-white shadow-sm transition active:scale-95"
      >
        <MapPinLine size={20} weight="bold" />
        {language === "zh" ? "带我去" : "Guide me there"}
      </button>
      {AskAgain}
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: 0 errors. (If `ArrowSquareOut` is not exported by the installed phosphor-react, substitute `Export` or `ArrowRight`.)

- [ ] **Step 3: Commit**

```bash
git add src/ui/ResultCard.tsx
git commit -m "feat(ui): ResultCard with destination/journey/offsite/human views"
```

---

## Task 8: PromptPanel state machine + enriched directions

**Files:**
- Modify: `src/ui/PromptPanel.tsx`

- [ ] **Step 1: Replace the idle branch with the state machine**

At the top of `PromptPanel`, add store reads and props. Change the signature to accept the new handlers:

```tsx
export function PromptPanel({
  narrationText,
  onSubmitIntent,
  onGuide,
  onStartInApp,
  onAskAgain,
  onNext,
  onArrived,
  onVoiceTap,
  voiceListening,
  voiceTranscript,
}: {
  narrationText: string;
  onSubmitIntent: (query: string) => void;
  onGuide: (plan: import("@/intent/types").Plan) => void;
  onStartInApp: (plan: Extract<import("@/intent/types").Plan, { kind: "offsite" }>) => void;
  onAskAgain: () => void;
  onNext: () => void;
  onArrived: () => void;
  onVoiceTap?: () => void;
  voiceListening?: boolean;
  voiceTranscript?: string;
}) {
  const route = useStore(s => s.activeRoute);
  const activePlan = useStore(s => s.activePlan);
  const intentStatus = useStore(s => s.intentStatus);
  const services = useStore(s => s.services);
  const language = useStore(s => s.language);
  const journey = useStore(s => s.journey);
  const profile = useStore(s => s.profile);
  const endRoute = useStore(s => s.endRoute);
```

Add the imports near the top of the file:

```tsx
import { IntentEntry } from "./IntentEntry";
import { ResultCard } from "./ResultCard";
```

Replace the existing `if (!route) { ... ServiceBrowser ... }` block with:

```tsx
  if (!route) {
    const shell = (inner: React.ReactNode) => (
      <div className="h-full bg-oth-paper border-t border-neutral-300">{inner}</div>
    );
    if (intentStatus === "resolving") {
      return shell(
        <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-oth-primary/20 border-t-oth-primary" />
          <p className="text-base font-semibold text-oth-ink">
            {language === "zh" ? "正在为您寻找…" : "Finding the right place…"}
          </p>
          <p className="text-xs text-neutral-400">
            {language === "zh" ? "正在查询 One Tampines Hub" : "Checking One Tampines Hub"}
          </p>
        </div>,
      );
    }
    if (activePlan) {
      return shell(
        <ResultCard
          plan={activePlan}
          onGuide={onGuide}
          onStartInApp={onStartInApp}
          onAskAgain={onAskAgain}
        />,
      );
    }
    return shell(
      <IntentEntry
        onSubmit={onSubmitIntent}
        onVoiceTap={onVoiceTap}
        voiceListening={voiceListening}
        voiceTranscript={voiceTranscript}
      />,
    );
  }
```

- [ ] **Step 2: Enrich the turn-by-turn instruction sentences**

In the routing view (the `instruction` builder), expand the headline strings to full sentences. Replace the walk/transit/arrived titles with:

```tsx
    if (isLast) {
      return {
        kind: "arrived" as const,
        title: language === "zh" ? "您已到达" : "You've arrived",
        sub: language === "zh" ? `${svcName} 就在这里。` : `${svcName} is right here.`,
      };
    }
    if (floorChange) {
      const word = transitWord(current.segmentKey, language) ?? (language === "zh" ? "电梯" : "lift");
      return {
        kind: "transit" as const,
        title:
          language === "zh"
            ? `乘${word}前往 ${next!.floorId}`
            : `Take the ${word} ${goingUp ? "up" : "down"} to ${next!.floorId}`,
        sub:
          language === "zh"
            ? `${word}就在前方，跟着指示牌走。`
            : `The ${word} is just ahead — follow the signs.`,
      };
    }
    const nextWord = next && isTransit(next.segmentKey) ? transitWord(next.segmentKey, language) : null;
    const title = nextWord
      ? language === "zh" ? `步行前往${nextWord}` : `Walk to the ${nextWord}`
      : language === "zh" ? `步行前往 ${svcName}` : `Walk to ${svcName}`;
    const sub = nextWord
      ? language === "zh"
        ? `继续往前走，${nextWord}就在附近。`
        : `Head straight ahead — the ${nextWord} is nearby.`
      : language === "zh"
        ? `继续往前走，${svcName} 就在前方。`
        : `Keep going straight — ${svcName} is just ahead.`;
    return { kind: "walk" as const, title, sub: `${sub}  ·  ${Math.round(distance)}m · ${eta}` };
```

(Leave the rest of the routing JSX — hero icon, progress bar, footer — as-is; it already renders `instruction.title` and `instruction.sub`.)

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/ui/PromptPanel.tsx
git commit -m "feat(ui): bottom-sheet state machine + fuller direction sentences"
```

---

## Task 9: Wire App — intent submit, plan handlers, voice, JourneyTimeline gating

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Add imports + handlers**

Add imports:

```ts
import { resolveLocal, planToJourney } from "@/intent/resolveIntent";
import type { Plan } from "@/intent/types";
```

Add handlers inside `App` (after `onPickService`):

```ts
  const onSubmitIntent = useCallback((query: string) => {
    const st = useStore.getState();
    st.setIntentStatus("resolving");
    // Phase 1: synchronous local resolve. (Phase 2 will await the backend.)
    const { plan } = resolveLocal(query, st.services);
    st.setPlan(plan);
    st.setIntentStatus("resolved");
  }, []);

  const onGuide = useCallback((plan: Plan) => {
    if (plan.kind === "destination" || plan.kind === "human") {
      onPickService(plan.stop.serviceId);
    } else if (plan.kind === "journey") {
      useStore.getState().setJourney(planToJourney(plan));
      onPickService(plan.stops[0].serviceId);
    }
  }, [onPickService]);

  const onStartInApp = useCallback((_plan: Extract<Plan, { kind: "offsite" }>) => {
    // Phase 1 stub — Phase 2 deep-links to the teammates' app.
    window.alert("Opening the OTH app… (handoff to be wired in Phase 2)");
  }, []);

  const onAskAgain = useCallback(() => {
    useStore.getState().resetIntent();
  }, []);
```

- [ ] **Step 2: Rewire voice to feed intent resolution**

Replace the transcript effect body so a spoken phrase resolves an intent instead of directly picking a service:

```ts
  useEffect(() => {
    if (!sr.transcript) return;
    onSubmitIntent(sr.transcript);
  }, [sr.transcript, onSubmitIntent]);
```

- [ ] **Step 3: Update the render — PromptPanel props + JourneyTimeline gating**

Replace the `<PromptPanel .../>` usage with:

```tsx
          <PromptPanel
            narrationText={narrationText}
            onSubmitIntent={onSubmitIntent}
            onGuide={onGuide}
            onStartInApp={onStartInApp}
            onAskAgain={onAskAgain}
            onNext={onNext}
            onArrived={onArrived}
            onVoiceTap={sr.supported ? onVoiceTap : undefined}
            voiceListening={sr.listening}
            voiceTranscript={sr.transcript}
          />
```

Gate the JourneyTimeline so it only shows for a journey plan. Replace `<JourneyTimeline onPick={onPickService} />` with:

```tsx
          {useStore.getState().journey && <JourneyTimeline onPick={onPickService} />}
```

(Or read `journey` via a `useStore(s => s.journey)` selector at the top of `App` and use that.)

- [ ] **Step 4: Stop preloading the demo journey**

In the `loadDataBundle().then(...)` block, remove the line:

```ts
        useStore.getState().setJourney(b.journey ?? null);
```

(Leave `setEntrances`.) The journey is now only set when a journey Plan starts.

- [ ] **Step 5: Verify it compiles + full test suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: 0 type errors; all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx
git commit -m "feat(app): intent submit, plan handlers, voice→intent, timeline gating"
```

---

## Task 10: Remove dead components + build

**Files:**
- Delete: `src/ui/ServiceTiles.tsx`, `src/ui/ServiceBrowser.tsx`

- [ ] **Step 1: Confirm nothing imports them**

Run: `npx grep -rn "ServiceTiles\|ServiceBrowser" src` (or use the Grep tool).
Expected: no matches outside the files themselves.

- [ ] **Step 2: Delete the files**

```bash
git rm src/ui/ServiceTiles.tsx src/ui/ServiceBrowser.tsx
```

- [ ] **Step 3: Typecheck + build + tests**

Run: `npx tsc --noEmit && npx vitest run && npx vite build`
Expected: 0 errors; tests pass; build succeeds.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore(ui): remove ServiceTiles/ServiceBrowser (replaced by intent flow)"
```

---

## Manual verification (run the app)

Run `npm run dev`, open the app, and confirm:
- Home shows the ask box + 4 purpose tiles (no service grid).
- Typing "renew passport" (or tapping Documents) → ResultCard for ServiceSG with "Guide me there" → starts a route; directions read as full sentences in large type.
- Tapping a non-routable purpose (e.g. an elderly/active-ageing query) → offsite card with "Start in App".
- Gibberish → "get you to someone who can help" → routes to ServiceSG.
- Finishing a single destination ends cleanly (no snap-back to a trip).
- The "Your trip" bar is absent unless a journey plan is started.
- Voice mic (Chrome/Edge): speaking a need resolves an intent.

---

## Self-review notes

- Spec coverage: ask-first entry (Task 6), normalized Plan (Task 1), local resolve + confidence (Task 3), four result shapes (Task 7), readable step-by-step directions (Task 8), remove demo trip + snap-back (Tasks 5, 9). Phase 2 (backend) intentionally excluded.
- The `offsite` Plan in Phase 1 is produced for known-but-unmapped services; digital-only handling with real contact data arrives with the backend in Phase 2.
- `requiredDocuments`/`operatingHours`/`walkInAccepted` on `PlanStop` are optional and unset in Phase 1 (local services.json lacks them); the ResultCard renders them only when present, so they light up automatically once the backend adapter supplies them.
