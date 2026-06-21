# OTH Navigator — Intent-First Navigation (design)

**Date:** 2026-05-26
**Status:** approved direction, pending spec review

## Problem

The current home experience is a directory of "shortcut" tiles plus an always-on
scripted multi-stop "trip." This contradicts the project thesis (`docs/OTH_navigation_context.md`):
services at One Tampines Hub are *fragmented*, and people arrive **with a
purpose**, not to browse a map. Three concrete failures today:

1. **Wrong entry model.** A generic service grid implies "browse," when the job
   is "I came to do X — where do I go?"
2. **Directions are unreadable.** Turn-by-turn shows terse 3-word fragments in
   small text. The thesis calls for natural-language guidance.
3. **Snap-back bug.** Finishing any service that isn't part of the demo journey
   makes `onArrived` chain into the journey's *first* stop (because a
   non-member's `order` defaults to `-1`), so the app "jumps back to the trip."

## Goals

- Pivot the entry to **ask-first**: "What do you need to do today?" (type or voice),
  with a few purpose tiles as quick-start.
- Resolve an intent through a **two-tier pipeline** (local first, backend
  fallback) and present every result as one **normalized Plan**.
- Make directions **readable**: one clear step at a time, full natural-language
  sentence, large type.
- Remove the always-on demo trip; a journey appears only as a *resolved*
  multi-stop Plan. This also deletes the snap-back bug.

## Non-goals

- Building the backend retrieval/journey service (teammate owns it; adapter
  `src/data/retrieval.ts` already exists).
- The online/digital service flow itself — off-site results **hand off** to the
  teammates' app via a "Start in App" CTA; we do not render online forms.
- New floors (L3), events dataset, or LLM-generated prose directions in Phase 1
  (templated client-side; LLM is a Phase 2 upgrade).

## The normalized Plan (core abstraction)

Every resolution — local or backend — produces one `Plan`. The display and the
routing read only the Plan, so the two tiers stay interchangeable.

```ts
type PlanKind = "destination" | "journey" | "offsite" | "human";

type PlanStop = {
  serviceId: string;
  name: { en: string; zh: string };
  floorId?: FloorId;          // physical placement (destination/journey/human)
  roomId?: string;
  reason?: { en: string; zh: string };   // "why this stop" (journeys)
  walkInAccepted?: boolean;
  appointmentRequired?: boolean;
  operatingHours?: Record<string, string>;
  requiredDocuments?: { name: string; note?: string }[];
  accessibility?: { liftAccess: boolean; stepFree: boolean; notes?: string };
};

type Plan =
  | { kind: "destination"; answer: { en: string; zh: string }; stop: PlanStop }
  | { kind: "journey";     title?: { en: string; zh: string }; stops: PlanStop[] }
  | { kind: "offsite";     stop: PlanStop; appHandoff: { label: string; url?: string } }
  | { kind: "human";       message: { en: string; zh: string }; stop: PlanStop /* ServiceSG */ };
```

`confidence` from a resolver decides whether we accept a local Plan or fall
through to the backend; it is not stored on the Plan itself.

## Resolution pipeline

`resolveIntent(query, ctx)` orchestrates:

1. **Tier 1 — local.** `resolveLocal(query)` matches the query against our
   mappable services using a hand-written **synonym/keyword map**
   (passport→ServiceSG, books→Library, housing/HDB grant→HDB Office, …) and
   returns `{ plan, confidence }`. High confidence → use it.
   - (Future) an LLM confidence check and a local **events** source slot in here.
2. **Tier 2 — backend.** On low confidence, call `retrieveServices(query, floors, ctx)`
   (existing adapter). Map its output to a Plan:
   - ranked single best → `destination` (or `offsite` if `locationType === "Digital_Hotline"`),
   - an ordered itinerary (if the backend returns one) → `journey`,
   - `confidence_low` → `human` (route to ServiceSG, don't bluff).
3. The chosen Plan goes into the store as `activePlan`.

**Robustness:** whether the backend returns a ready journey or a ranked list we
assemble into stops, both normalize to `Plan.journey`. (Open question below.)

## UI states (one bottom-sheet state machine)

Driven by `intentStatus: "idle" | "resolving" | "resolved"` + `activePlan` +
`activeRoute`:

- **idle → `IntentEntry`**: big ask box (text + existing voice mic) and purpose
  tiles. Replaces the `ServiceBrowser` grid.
- **resolving → `Resolving`**: spinner + "Finding the right place… / Checking One
  Tampines Hub" (and "Asking the assistant" when it hits the backend).
- **resolved, not yet navigating → `ResultCard`**, rendered by `Plan.kind`:
  - `destination`: headline answer · walk time · step-free · hours/walk-in ·
    documents · **Guide me there** CTA · "Not quite? Ask again."
  - `offsite`: "Handled in the OTH app." · **Start in App** handoff CTA.
  - `journey`: numbered stops with reasons · **Start with <first>** CTA.
  - `human`: "Let me get you to a person" · routes to the ServiceSG counter.
- **navigating → `TurnByTurn`**: step-by-step, one instruction at a time, full
  sentence, large type; progress bar; "Stop N of M" for journeys; end (✕).

The map highlights the route (existing `RouteArrow`) and pulses the destination
(existing `PolygonLabels` dest pin) when navigating.

## Directions presentation

Keep **step-by-step (one at a time)** but enrich the instruction text:

- Full sentences from richer client-side templates, e.g.
  *"Walk straight ahead to the lift."* / *"Take the lift up to Level 2."* /
  *"You've arrived — ServiceSG is right here."*
- Larger type for the headline instruction; distance · ETA · step-free as a
  secondary line.
- Hook left in place to swap templated text for backend/LLM narration later
  (the `segmentKey`-keyed narration system already exists).

## Changes to existing code

- **New:** `src/intent/resolveIntent.ts` (orchestrator), `src/intent/synonyms.ts`
  (local keyword map), `Plan` types (in `src/data/types.ts` or `src/intent/types.ts`).
- **New UI:** `IntentEntry`, `Resolving`, `ResultCard` (with per-kind sub-views),
  reuse/rename of the enriched `TurnByTurn` (today's `PromptPanel` routing view).
- **Store:** add `activePlan`, `intentStatus`, `setPlan/clearPlan`; stop
  auto-loading the `DEMO_JOURNEY`; `journey` becomes derived from a `journey`
  Plan.
- **Repurpose:** `ServiceBrowser` → `IntentEntry` (its search box becomes the ask
  box; its rich card becomes `ResultCard`'s destination view; the long list goes
  away). `ServiceTiles` (already dead) deleted.
- **Fix/remove:** the `onArrived` chaining only advances within an explicit
  `journey` Plan; a single `destination` just ends. `JourneyTimeline` renders
  only when `activePlan.kind === "journey"`.

## Phasing

- **Phase 1 (offline-demoable, no backend):** ask-first entry + purpose tiles,
  `resolveLocal` (synonyms over our mapped services), normalized Plan, all four
  ResultCard views (offsite uses a stubbed handoff for demo), enriched
  step-by-step directions, remove demo trip + snap-back. Fully works with the
  app alone.
- **Phase 2 (backend):** wire `retrieveServices` as Tier 2, confidence handling,
  resolving/loading states, real "Start in App" handoff target, optional
  `/api/chat` narration.

## Open questions / contracts

- **Backend output shape:** ordered journey vs ranked list we assemble? (Design
  absorbs both; confirm with teammate to set the journey-builder.)
- **"Start in App" handoff:** deep link / URL scheme to the teammates' app? (URL
  TBD; Phase 1 stubs the CTA.)
- **HDB floor:** stays on L2 for the demo (per backend integration plan).

## Testing

- Unit: `resolveLocal` maps representative intents to the right Plan kind/service
  (passport→destination/ServiceSG; baby bonus→offsite; gibberish→human).
- Unit: backend `RetrievalResult` → Plan adapter (destination/offsite/journey/human).
- Unit: journey `onArrived` advances only within plan stops; single destination
  ends (regression for the snap-back bug).
- Existing routing tests (`buildRoute`, journey chaining) stay green.
