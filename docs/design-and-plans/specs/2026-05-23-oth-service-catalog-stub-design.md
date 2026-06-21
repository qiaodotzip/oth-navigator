# OTH Service Catalog Stub Backend — Design

> **Status:** Design, 2026-05-23
> **Author:** brainstormed with the team
> **Companion:** `docs/PRD.md`, routing in `src/routing/buildRoute.ts`

## 1. Purpose

A stand-in for a teammate's backend that, when ready, will drive multi-stop
journeys through Our Tampines Hub. Until it lands, this stub serves a
**categorized catalog of OTH government / healthcare / community services**,
each carrying the building info that `buildRoute()` already consumes. The goal:
unblock development of **multi-destination ordering and routing** (the part
*we* own) against realistic data.

The stub is intentionally **dumb**: it returns services + building info. It does
**not** order stops, optimize journeys, or compute paths. That logic is built on
top, separately, and is out of scope here.

## 2. Division of labor

| Concern | Owner |
|---|---|
| Service catalog + physical building info | **This stub** |
| Multi-destination ordering ("optimal sequence to stop at") | Us (separate work) |
| Per-leg pathfinding | Existing `buildRoute()` + A* (`pathfinder.ts`) |
| Real production backend (journey chains) | Teammates (later swap) |

Swap path: the frontend talks to `GET /api/services`. When the real backend is
ready, repoint the fetch base URL (or proxy target) — no shape change if the
teammate matches this contract.

## 3. Scope

- **In:** OTH-internal services only (single building, floors L1–L2 modeled).
  Building info = floor + room polygon + indoor coordinates + counters +
  accessibility + category.
- **Out:** Singapore-wide / inter-building routing. Multi-stop ordering. Journey
  UI. Live queue data. Floors L3–L8 geometry.

## 4. Architecture

```
public/data/services.json        server/serviceCatalog.ts          src/data/loaders.ts
  (+ category, +approxLocation)   GET /api/services                   fetch("/api/services")
        catalog data        ──►   ?category= / ?floor= filter   ──►   (fallback: static file)
                                  returns Service[]                   feeds existing store
```

- Vite already proxies `/api` → `http://localhost:3000` (confirmed in
  `vite.config.ts`), so the endpoint works in dev with no extra config.
- The endpoint reads the catalog from `public/data/services.json` (single source
  of truth, also served statically), applies query filters, returns `Service[]`.

### Units

- **`server/serviceCatalog.ts`** — loads catalog JSON, exposes
  `getCatalog(filter?: { category?: Category[]; floor?: FloorId })`. Pure,
  testable, no Hono types.
- **`server/index.ts`** — thin `GET /api/services` route that parses query params
  and calls `getCatalog`.
- **`src/data/loaders.ts`** — `loadServices()` fetches `/api/services`, falls
  back to the static `/data/services.json` if the endpoint errors (keeps the app
  working if the server is down, mirrors existing `fetchDetails` resilience).

## 5. Data shape

Extend the existing `Service` type (in `src/data/types.ts`):

```ts
export type ServiceCategory =
  | "government" | "healthcare" | "community" | "retail" | "lifestyle";

export type Service = {
  id: string;
  nameEn: string;
  nameZh: string;
  providerName: string;
  category: ServiceCategory;        // NEW (required)
  routable: boolean;                // NEW: true iff on a modeled floor (L1/L2)
                                    //      with a roomId that maps to a polygon
  displayFloor: string;             // NEW: real human floor label, "L1".."L8"
  floorId?: FloorId;                // NOW OPTIONAL: present iff routable
  roomId?: string;                  // NOW OPTIONAL: present iff routable
  counterIds?: string[];
  accessibility: { liftAccess: boolean; stepFreeRoute: boolean; notes?: string };
  sourceUrl: string;
  iconKey: string;
};
```

Key change: `floorId`/`roomId` become **optional** because non-routable
services live on unmodeled floors (L3–L8) where `FloorId` (only `"L1" | "L2"`)
can't represent them and no polygon exists. `displayFloor` is the source of
truth for *showing* a floor; `floorId` is only used by `buildRoute` and is set
only when `routable` is true.

`buildRoute` is called only for routable services. It already returns `null`
when it can't resolve a floor, so optional `floorId` needs only light guarding.
The UI renders a "coming soon" hint for `routable: false` services from
`displayFloor` (e.g. EN *"On Level 4 — routing coming soon"*, ZH *"四楼 — 路线即将推出"*).

## 6. Endpoint contract

```
GET /api/services
GET /api/services?category=government
GET /api/services?category=healthcare,community   (comma = OR)
GET /api/services?floor=L2
GET /api/services?category=government&floor=L1     (AND across params)
→ 200  application/json   Service[]
→ 500  { error } if catalog fails to load
```

Empty filter = full catalog. Unknown category value = empty array (not an error).

## 7. Catalog contents

All entries carry a real `sourceUrl`; floors/units are real (web-sourced). A
service is **routable only if it sits on a modeled floor (L1/L2) and maps to a
real polygon**. Everything on L3–L8 is catalogued honestly as `routable: false`
with its real `displayFloor` and a "coming soon" hint — **no fake coordinates,
no proxy placement.** Representative set (final list compiled during
implementation):

| Service | Category | Real floor | routable | roomId / status |
|---|---|---|---|---|
| ServiceSG Centre | government | L1 #01-21 | ✅ | `L1-room-psc` |
| CPF services (via ServiceSG) | government | L1 #01-21 | ✅ | `L1-room-psc` |
| HDB Branch Office | government | L2 (existing demo) | ✅ | `L2-room-hdb-office` |
| Public Service Centre (existing) | government | L1 | ✅ | `L1-room-psc` |
| Tampines Regional Library | community | L2 | ✅ | `L2-room-library` |
| Festive Arts Theatre (existing) | lifestyle | L2 | ✅ | `L2-room-theatre` |
| Hawker Centre (existing) | retail | L1 | ✅ | `L1-room-hawker` |
| Tampines Family Medicine Clinic | healthcare | L3 #03-34 | ⏳ | "On Level 3 — soon" |
| Family Nexus @ OTH | healthcare | L3 | ⏳ | "On Level 3 — soon" |
| Health screening | healthcare | L3 | ⏳ | "On Level 3 — soon" |
| Family Service Centre (MSF) | community | L3 | ⏳ | "On Level 3 — soon" |
| Community Club (OTH CC) | community | **L4** | ⏳ | "On Level 4 — soon" |
| Active Ageing / Silver Zone | community | L4 | ⏳ | "On Level 4 — soon" |
| NE CDC | community | L4 | ⏳ | "On Level 4 — soon" |

> **`community-centre` reclassified, not "fixed":** the existing entry mapped to
> `L1-room-community-space` (no such polygon) because the CC is actually on **L4**,
> which isn't modeled. We mark it `routable: false`, `displayFloor: "L4"`, drop
> its `floorId`/`roomId`, and the UI shows "On Level 4 — routing coming soon."
> Its demo tile stops silently routing to nowhere.

**Consequence (accepted):** routable multi-stop destinations are the L1/L2 set
above — government + library + theatre + hawker. Healthcare is entirely
"coming soon" until L3 is modeled. The multi-stop *ordering* logic is still fully
exercisable over the routable set.

## 8. Data sourcing

Web search for the real OTH tenant list per category (names, floors, units,
providers), same honest pattern as the popular-times work. Each catalog entry
keeps `sourceUrl`. What's real: service existence, floor, unit, provider. What's
ours: only the routable-polygon mapping for the L1/L2 services. Nothing is
proxy-placed or invented.

## 9. Error handling

- Endpoint: if catalog JSON fails to parse → 500 `{ error }`, logged server-side.
- Client `loadServices()`: on non-200 or network error → fall back to static
  `/data/services.json`. App never hard-fails on a missing server.
- Catalog invariant (enforced by test, not runtime): `routable === true` iff
  `floorId` and `roomId` are present and `roomId` resolves to a polygon. A
  routable service that doesn't resolve is a data error, not a silent fallback.

## 10. Testing

- **`server/serviceCatalog.test.ts`** (Vitest):
  - returns full catalog when no filter
  - `?category=government` returns only government services
  - comma-separated categories OR correctly
  - `floor` + `category` AND correctly (floor filter applies to routable services)
  - unknown category → `[]`
- **Catalog integrity test** (`src/data/serviceCatalog.integrity.test.ts`):
  - **routable** entries: `floorId` + `roomId` present, and `roomId` exists as a
    polygon in that floor's JSON
  - **non-routable** entries: `floorId`/`roomId` absent, `displayFloor` present
  - every entry has a non-empty `category` and `sourceUrl`
  - This guard catches the `community-space` class of mistake (claiming a route
    to a polygon that doesn't exist).

## 11. Demo journey harness

A button-activated demo that simulates the teammates' backend handing us a
**pre-ordered multi-stop journey**, which the frontend then walks **stop by
stop**. This proves the multi-destination consumption flow end-to-end against
the catalog, before the real backend exists. It does **not** order or optimize —
it plays back the order the mock "backend" gives.

### Mock endpoint
```
GET /api/demo-journey
→ 200  Journey
```
Returns a hardcoded, ordered journey built from **routable** catalog services,
e.g. ServiceSG (L1) → Library (L2) → Festive Arts Theatre (L2). Lives in
`server/index.ts`, sourced from a small constant in `server/serviceCatalog.ts`.

### Types (in `src/data/types.ts`)
```ts
export type JourneyStop = {
  serviceId: string;
  order: number;        // 0-based position in the journey
  reason?: { en: string; zh: string };  // why this stop (shown in the panel)
};
export type Journey = {
  id: string;
  stops: JourneyStop[];
};
```

### Store additions (`src/store.ts`)
```ts
activeJourney: { journey: Journey; currentStopIndex: number } | null;
startJourney: (j: Journey) => void;     // sets index 0, builds route to stop 0
advanceJourney: () => void;             // index+1, builds route to next stop
endJourney: () => void;
```

### Flow (full journey, manual advance — chosen)
1. User taps **"Demo journey"** button (in `PromptPanel`).
2. Frontend `fetch("/api/demo-journey")` → full ordered `Journey`.
3. `startJourney` resolves stop 0's service from the catalog, calls the existing
   `buildRoute(start, service, profile, floors)`, and starts that route.
4. The existing per-waypoint **Next** mechanic walks the user to the stop.
5. On arrival (route's last waypoint), the panel shows **"Next stop →"** instead
   of the success dismiss. Tapping it calls `advanceJourney`: build a route from
   the just-reached stop to the next stop's service, start it.
6. After the final stop, show a journey-complete state; `endJourney` clears it.
7. A small progress indicator: **"Stop 2 of 3 · Library"**.

### Reuse, not rebuild
- Per-stop pathfinding = existing `buildRoute` + A*. No new routing math.
- Per-waypoint walking = existing `advanceRoute`/Next. The journey layer sits
  *above* the single-route layer and just feeds it the next destination.
- Start of stop *n+1* = the location of stop *n* (its arrival waypoint), so legs
  chain naturally.

### Out of scope for the harness
Optimal ordering (the mock journey is hand-ordered), editing the journey in-app,
persisting journeys. The harness is a playback of a backend-supplied sequence.

## 12. Out of scope (overall)

Multi-stop **ordering / optimization** (TSP/nearest-neighbor — that's our
separate work; the harness only plays a given order), journey-*builder* UI, live
queue data, L3–L8 geometry. The catalog stops at "categorized services with
building info; routable ones carry a polygon, the rest say coming soon."

The existing demo tiles are left as-is **except** `community-centre`, which
becomes non-routable (real floor L4) and shows "coming soon" instead of its
current silent route-to-nowhere.

## 13. Open questions

1. Final exhaustive service list — compiled during implementation via web search;
   the table in §7 is the representative seed.
2. When teammates publish their real contract, confirm field names match — both
   the service catalog and the `Journey`/`JourneyStop` shape — so the swap stays
   zero-change.
