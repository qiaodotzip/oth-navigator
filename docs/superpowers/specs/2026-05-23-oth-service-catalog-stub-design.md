# OTH Service Catalog Stub Backend — Design

> **Status:** Design, 2026-05-23
> **Author:** brainstormed with Stef
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

Extend the existing `Service` type (in `src/data/types.ts`) with:

```ts
export type ServiceCategory =
  | "government" | "healthcare" | "community" | "retail" | "lifestyle";

export type Service = {
  // ...existing fields unchanged...
  category: ServiceCategory;
  /** true when floor/room geometry is approximate (real floor not modeled). */
  approxLocation?: boolean;
};
```

No other field changes. `floorId`, `roomId`, `counterIds`, `accessibility`,
`sourceUrl` already exist and already feed routing.

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

All entries carry a real `sourceUrl`. Floors/units are real (web-sourced).
Polygon mapping is ours; flagged `approxLocation: true` when the real floor isn't
modeled. Representative set (final list compiled during implementation):

| Service | Category | Real location | Routable polygon | approx? |
|---|---|---|---|---|
| ServiceSG Centre | government | L1 #01-21 | `L1-room-psc` | no |
| HDB Tampines Branch | government | L1 #01-21 (in ServiceSG) | `L2-room-hdb-office` (existing demo) | flag |
| CPF services (via ServiceSG) | government | L1 #01-21 | `L1-room-psc` | no |
| Town Council | government | L1 | `L1-room-commercial` (proxy) | flag |
| Tampines Family Medicine Clinic | healthcare | L3 #03-34 | L2 proxy (e.g. `L2-room-enrichment`) | flag |
| Family Nexus @ OTH | healthcare/community | L3 | L2 proxy | flag |
| Health screening | healthcare | L3 | L2 proxy | flag |
| Community Club (OTH CC) | community | L1/L4 | `L1-room-community-space` **→ fix to a real polygon** | flag |
| Family Service Centre (MSF) | community | L3 | L2 proxy | flag |
| Active Ageing / Silver Zone | community | L4 | L2 proxy | flag |
| NE CDC | community | L1 | `L1-room-commercial` (proxy) | flag |
| Tampines Regional Library | community/lifestyle | L2 | `L2-room-library` | no |

> **Bug fix folded in:** the existing `community-centre` entry references
> `L1-room-community-space`, which is **not** a polygon in `L1.json`. `buildRoute`
> silently falls back to the start point for it today. We re-map it to a real
> polygon and add a validation test so this class of bug fails loudly.

Proxy placements spread destinations across L1 and L2 so multi-stop ordering has
a real spatial mix to optimize over.

## 8. Data sourcing

Web search for the real OTH tenant list per category (names, floors, units,
providers), same honest pattern as the popular-times work. Each catalog entry
keeps `sourceUrl`. What's real: service existence, floor, unit, provider. What's
ours: the routable polygon mapping (flagged when approximate).

## 9. Error handling

- Endpoint: if catalog JSON fails to parse → 500 `{ error }`, logged server-side.
- Client `loadServices()`: on non-200 or network error → fall back to static
  `/data/services.json`. App never hard-fails on a missing server.
- Catalog builder: a service whose `roomId` resolves to no polygon **and** is not
  flagged `approxLocation` is a data error caught by a test (see §10), not a
  silent runtime fallback.

## 10. Testing

- **`server/serviceCatalog.test.ts`** (Vitest):
  - returns full catalog when no filter
  - `?category=government` returns only government services
  - comma-separated categories OR correctly
  - `floor` + `category` AND correctly
  - unknown category → `[]`
- **Catalog integrity test** (`src/data/serviceCatalog.integrity.test.ts`):
  - every catalog entry's `roomId` exists as a polygon in its `floorId` file,
    **or** the entry is flagged `approxLocation: true`
  - every entry has a non-empty `category` and `sourceUrl`
  - This is the guard that catches the `community-space` bug.

## 11. Out of scope (explicit)

Multi-stop ordering, route optimization (TSP/nearest-neighbor), journey-builder
UI, changing the existing 6 demo tiles, live queue data, L3–L8 geometry. The
catalog stops at "categorized, routable services with building info."

## 12. Open questions

1. Final exhaustive service list — compiled during implementation via web search;
   the table in §7 is the representative seed.
2. When teammates publish their real contract, confirm field names match (esp.
   how they express location) so the swap stays zero-change.
