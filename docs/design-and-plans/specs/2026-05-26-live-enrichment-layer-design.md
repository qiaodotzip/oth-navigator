# Live Enrichment Layer — Design

> **Status:** approved design, 2026-05-26
> **Roadmap home:** PRD §9 V0.3 "Real live data — at least 2 services with real
> queue data"; `docs/FUTURE_FEATURES.md` §1 (LTA DataMall crowd) + §2 (data.gov.sg).
> **Companion:** implementation plan to follow in `docs/design-and-plans/plans/`.

---

## 1. Summary

Add a **live enrichment layer**: real-world crowd, busyness, and open/closed
signals layered onto the existing OTH model. The data is fetched/scraped
**offline** by a refresh script into committed snapshot JSON, then read at
runtime where the genuinely time-varying bits (open status, busyness-curve
lookup) are computed live from the clock. Demo-safe by default; an optional
live-proxy knob can re-poll transport data when desired.

This is **frontend-owned**. The teammates' backend (the JOM chatbot, a separate repo)
is retrieval-only — it returns service records with static `operating_hours` but
**no crowd, queue, or live data**. We do not depend on a new backend endpoint.

## 2. Goals

- Replace the pure Perlin-noise counter loads with **real-first busyness**,
  falling back to labeled modeled curves only when no real source resolves.
- **Honest provenance everywhere:** every datum carries a `source`; the UI shows
  "live" vs "typical/modeled". Aligns with the PRD "no fabricated facts" rule.
- **Open / closed / closing-soon** status on service tiles and the destination
  card, computed live from the backend's `operating_hours` + scraped closures.
- **Transport arrival context** (MRT crowd density, carpark availability) as a
  compact "Getting here" surface.
- **Ambient agent density** scales with current building busyness.
- Live signals **woven into AI narration**.
- **Nothing breaks mid-demo:** runtime never depends on a live network call;
  snapshots always exist; missing files degrade to empty, not crash.

## 3. Non-goals

- Real-time per-second polling as the primary path (the live-proxy knob is
  opt-in, off by default).
- A real OTH counter-queue feed (none is published; BestTime/forecast is the
  closest real signal, modeled curves are the honest fallback).
- Scraping fresh opening hours to replace the backend's `operating_hours` — we
  lean on the backend's hours and only scrape *closures*, which it lacks.
- Python `populartimes` wired into the build (documented as an optional manual
  step only; the Node path uses BestTime).

## 4. Architecture

```
scripts/refresh-enrichment.ts        ← run offline before demo (npx tsx)
   ├─ enrich/busyness.ts → public/data/popular-times.json
   ├─ enrich/transport.ts → public/data/transport.json
   └─ enrich/closures.ts  → public/data/closures.json
                 │  (committed JSON = demo-safe real snapshot)
                 ▼
   loaders.ts → store slices: popularTimes (exists), transport, closures
                 ▼
   ┌──────────────┬─────────────────┬────────────────────┐
 crowd           scraped            narration
 • counterLoads  • openStatus()     • {busyness, openStatus,
   (already       → badges on         transport} added to
   wired)         tiles + card        /api/narrate payload
 • buildingBusyness → ambient agent count
 • transport → "Getting here" strip
```

**Hybrid, concretely:** the *fetch/scrape* runs offline in the refresh script
(handles keys/CORS once, commits a snapshot). At *runtime* the live-varying bits
— open/closed status and the busyness-curve hour lookup — are evaluated against
`new Date()` each tick, always current with zero network. `VITE_LIVE_ENRICHMENT=1`
optionally re-polls transport through a proxy, falling back to the snapshot.

## 5. Data sources & provenance

### 5.1 Counter busyness (real-first)
Per OTH agency Google Place, priority order, recorded as `source`:
1. **BestTime.app API** (free tier, REST, not scraping) — forecast + optional
   live foot-traffic. Needs `BESTTIME_API_KEY`. → `source: "live"` (if live
   field present) or `"forecast"`.
2. **Hand-authored modeled curve** (`enrich/seeds.ts`) — govt-counter rhythm
   (peak ~10:00–12:00, lunch lull, quiet late afternoon), per agency type. Used
   only when BestTime fails. → `source: "modeled"`.

`populartimes` (Python Google scrape) is documented as an optional manual
refresh, **not** wired into the Node script (flaky, ToS-gray).

### 5.2 Transport (LTA DataMall, keyed)
- `PCDRealTime` → Tampines / Tampines East / Tampines West MRT crowd level.
- `CarParkAvailabilityv2` → OTH carpark available lots.
- Needs `LTA_ACCOUNT_KEY`. No key → labeled seed snapshot. → `source: "live"`
  or `"modeled"`.

### 5.3 Closures (data.gov.sg, keyless)
- SG public-holidays dataset → flag PH closures.
- NEA hawker-cleaning dataset → OTH Round Market cleaning days.
- No key required. Failure → empty closures (status falls back to hours only).

Every fetcher **never throws**: on any error it writes the seed/empty fallback
and records a per-source status in the file's `meta` block.

## 6. Data schemas (`src/data/types.ts`)

```ts
type BusynessSource = "live" | "forecast" | "modeled";

// extend existing PopularTimesEntry
type PopularTimesEntry = {
  serviceId: string;
  placeName?: string;
  weekday: PopularTimesHour[][];   // [dayIdx][slot]
  currentPopularity?: number;      // live, 0..1
  source: BusynessSource;          // NEW
};

type MrtCrowd = { station: string; level: "low" | "moderate" | "high"; source: BusynessSource };
type Carpark  = { id: string; name: string; available: number; total?: number; source: BusynessSource };
type TransportSnapshot = { mrt: MrtCrowd[]; carparks: Carpark[] };

type ClosureScope = "service" | "hawker" | "public_holiday";
type ClosureEntry = {
  scope: ClosureScope;
  serviceId?: string;     // when scope === "service"
  date: string;           // ISO yyyy-mm-dd
  reason: string;
  source: "data_gov_sg" | "modeled";
};

type EnrichmentMeta = { fetchedAt: string; sources: Record<string, "live" | "fallback"> };
```

Snapshot files: `public/data/popular-times.json` (`{ meta, entries }`),
`transport.json` (`{ meta, ...TransportSnapshot }`), `closures.json`
(`{ meta, closures }`).

## 7. Units

| Unit | Responsibility | Notes |
|---|---|---|
| `src/data/types.ts` (extend) | the schemas in §6 | — |
| `scripts/refresh-enrichment.ts` | orchestrate the 3 fetchers, write JSON + meta | never throws; always writes valid files |
| `scripts/enrich/busyness.ts` | BestTime → entries, else seed | per-agency place config |
| `scripts/enrich/transport.ts` | LTA PCDRealTime + CarPark, else seed | keyed |
| `scripts/enrich/closures.ts` | data.gov.sg PH + hawker, else empty | keyless |
| `scripts/enrich/seeds.ts` | hand-authored modeled curves + fallbacks | all `source:"modeled"` |
| `src/data/loaders.ts` (extend) | `loadEnrichment()` fetches 3 JSONs, sets store | try/catch → empty |
| `src/store.ts` (extend) | `transport`, `closures` slices + setters | `popularTimes` already present |
| `src/enrichment/openStatus.ts` (new) | `statusNow(hours, closures, now)` | hours parser — see §8 |
| `src/enrichment/buildingBusyness.ts` (new) | aggregate counter busyness → 0..1 | drives ambient density |
| `src/enrichment/popularTimes.ts` (extend) | surface `source` alongside busyness | existing `busynessNow` |
| `src/agents/counterLoads.ts` | already consumes `busynessNow` | minimal change once store populated |
| `src/world/CounterBadge.tsx` (extend) | provenance label ("live"/"typical") | — |
| `src/ui/ServiceBrowser.tsx` + `SuccessCard.tsx` (extend) | open/closed badge | via `statusNow` |
| "Getting here" strip (new component) | MRT density + carpark lots | placement: PromptPanel pre-route |
| `src/narration/client.ts` + server `/api/narrate` (extend) | add `{busyness, openStatus, transport}` to payload + prompt | — |

## 8. `openStatus` — the tricky pure unit

Backend `operating_hours` is `Record<string,string>` with **day-range keys** and
24h values, sometimes annotated:

```json
{ "mon-fri": "08:00-19:00 [VERIFY]", "sat": "08:00-13:00", "sun": "closed", "public_holidays": "closed" }
```

`statusNow(hours, closures, now)` must:
1. Strip `[VERIFY]` / bracketed annotations from values.
2. Resolve today's key: a `public_holidays` closure (from `closures.json`) wins;
   else match the weekday against keys like `mon-fri`, `sat`, `sun`, `mon`,
   `daily` (support single days + ranges + `daily`).
3. `"closed"` value or matching service/PH closure → `{ state: "closed", reason }`.
4. Parse `HH:MM-HH:MM`; compare to `now`:
   - before open / after close → `closed`
   - within 30 min of close → `closing-soon` (`until`)
   - else → `open` (`until` = close time)
5. Unparseable / missing key → `{ state: "unknown" }` (badge hidden, never wrong).

Fully unit-tested against the real shape above + edge cases (ranges, daily,
closed days, PH, closing-soon boundary, annotations).

## 9. Phasing (each demo-able alone)

- **Phase 1 — Crowd core.** Schemas + `enrich/busyness.ts` + `seeds.ts` +
  populate `popular-times.json` + load into store + provenance label on
  `CounterBadge`. Existing badges + least-busy routing now run on real-first
  curves. *No new UI surface — upgrades what exists.*
- **Phase 2 — Open/closed status.** `openStatus.ts` (+ tests) + `enrich/closures.ts`
  + status badges on tiles + destination card.
- **Phase 3 — Transport / arrival.** `enrich/transport.ts` (LTA) + `transport.json`
  + "Getting here" strip (MRT density + carpark).
- **Phase 4 — Ambient density + narration.** `buildingBusyness` → live agent
  count; `{busyness, openStatus, transport}` woven into narration.

P1+P2 alone is a strong demo if time runs short.

## 10. Testing

- `openStatus.ts` and `buildingBusyness.ts` are pure → Vitest unit tests
  (mirrors existing `popularTimes.test.ts`).
- Each `enrich/*` fetcher: a test that the fallback path produces a valid,
  schema-shaped file when the network/key is absent (mock fetch reject).
- `loaders` enrichment load: tolerates missing files (→ empty store slices).
- Provenance: a guard test that every emitted busyness entry has a `source`.

## 11. Risks & mitigations

| Risk | Mitigation |
|---|---|
| BestTime has no record for an OTH agency | Per-agency fall back to modeled curve, labeled "typical". |
| LTA key absent during dev/demo | Seed transport snapshot, labeled; live-proxy knob off by default. |
| Google scrape (`populartimes`) breaks | Not in the Node path; optional manual step only. |
| Hours strings drift / annotations | Parser strips annotations; unparseable → `unknown` (badge hidden). |
| Presenting modeled data as live | Provenance `source` on every datum + UI label + footer disclaimer. |
| Network blip mid-demo | Runtime reads committed snapshots; no live call on the critical path. |

## 12. Open questions

1. "Getting here" strip placement — PromptPanel pre-route vs a dedicated tile.
   (Default: PromptPanel pre-route; revisit in the plan.)
2. BestTime free-tier quota across ~6 agencies — may need to cache forecasts and
   refresh weekly, not per-run. (Default: weekly cache.)
