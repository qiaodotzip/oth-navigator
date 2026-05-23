# Future Features — Real-Data Integrations

> Parked ideas for post-hackathon (V0.2+). Source companion: `docs/PRD.md` §9.
> Status: 2026-05-23 — no work started, scoping notes only.

The PRD's V0.3 line item *"Real live data — at least 2 services with real queue data"* is the umbrella. This doc breaks it into concrete, free, official data sources we can use.

---

## 1. LTA DataMall — transport context

**What it is:** Singapore's Land Transport Authority open data API. Free, requires a registered AccountKey, generous rate limits.

**Docs:** https://datamall.lta.gov.sg/content/datamall/en/dynamic-data.html
**Register:** https://datamall.lta.gov.sg/content/datamall/en/request-for-api.html

### Endpoints we'd actually use

| Endpoint | What it gives us | OTH fit |
|---|---|---|
| `BusStops` (static) | All ~5,000 SG bus stops with code, name, lat/lng | Filter to a ~300m radius of OTH for the "arriving by bus" overlay |
| `BusServices` (static) | Every service number + operator | Show which buses serve OTH-adjacent stops |
| `BusRoutes` (static) | Stop sequence per service | Power "your bus stops at" hints |
| `BusArrivalv2` (real-time) | Next 3 buses per stop, with `Load` field (`SEA` / `SDA` / `LSD`) | Live "how full is the next bus" — fits the ambient-data theme |
| `PCDRealTime` (real-time, MRT) | Passenger crowd density per station | Tampines, Tampines East, Tampines West stations → proxy for hub busyness |
| `TaxiAvailability` | Available taxi GPS points | Show taxi pickup heat near OTH |
| `CarParkAvailabilityv2` | Live carpark slot counts | OTH has carparks — direct live data |

### Concrete OTH ingestion plan

1. One-time: pull `BusStops`, filter by Haversine ≤ 300m from OTH centroid (`1.3531, 103.9447`). Cache as `public/data/bus-stops-oth.json`.
2. Cross-reference `BusRoutes` to label each stop with its services.
3. Runtime: poll `BusArrivalv2` per visible stop every 30s. Render arrows/dots on the 2.5D model at each stop's projected position.
4. **CarParkAvailability** is the highest-impact win — directly answers "can I park" for elderly visitors driving in.

### Effort estimate
- Static ingestion + map projection: ~half day
- Live polling overlay + Zustand store: ~half day
- Carpark live tile: ~2 hrs

---

## 2. data.gov.sg — places & opening hours

**What it is:** Singapore's open data portal. REST + CKAN. No key required for most datasets.

**Docs:** https://data.gov.sg/developer

### Datasets we'd actually use

| Dataset | What it gives us | OTH fit |
|---|---|---|
| `hawker-centres` (NEA) | Location, opening hours, **scheduled cleaning closures**, no. of stalls | OTH Round Market & Food Centre — show real closures, not made-up |
| `polyclinics` | Locations + opening hours | OTH polyclinic — real data for the queue-aware demo |
| `community-clubs` | CC list + facilities | Confirm OTH CC info |
| `sportsg-facilities` | Sport SG facility list with timings | OTH ActiveSG gym, pools, courts |
| `libraries` | NLB branch list | OTH Public Library hours |

### Concrete OTH ingestion plan

1. Pull each dataset once, filter to OTH-matching records by name/postal (`529653`).
2. Merge into `services.json` as a `liveSource` field per service.
3. At render time, overlay: "Closed for cleaning today" / "Open until 9pm" badges sourced from the dataset, not hand-typed.
4. Cron a daily refresh (Railway scheduled job or just on server boot).

### Effort estimate
- Initial pull + filter + merge: ~3 hrs
- Cleaning-closure UI badge: ~1 hr
- Daily refresh job: ~1 hr

---

## 3. How this slots into existing PRD features

| PRD feature | Augmentation |
|---|---|
| **F3 ambient agents** — currently Perlin-noise loads | Replace counter-load fake data with `PCDRealTime` for MRT proxy, `BusArrivalv2.Load` for bus stops. Keep simulated counter loads where no real signal exists. |
| **F4 service discovery** | Each tile shows live "open / closed / closing soon" computed from data.gov.sg opening hours. |
| **F6 accessibility routing** | If carpark is full, suggest the alternative carpark or "arriving by bus" route. |
| **F2 AI guide narration** | LLM gets live signals as input (`{ carpark: "B2 has 14 lots", nextBus: "Bus 8 arriving in 4 min, half full" }`) and weaves them into spoken guidance. |
| **New** — arrival overlay | Before route starts, show "How are you getting here?" with live bus / carpark / MRT badges. |

---

## 4. Risks & gotchas

- **AccountKey for DataMall** is per-developer and rate-limited (~60k requests/day across endpoints). Cache aggressively.
- **CORS:** DataMall doesn't send CORS headers — must proxy through our Hono server (`/api/lta/*`). Same pattern as `/api/narrate`.
- **data.gov.sg schemas drift** — datasets get reorganised. Version-pin dataset IDs in code and fail loud if structure changes.
- **Opening hours strings** in data.gov.sg are free text (e.g. "7am to 9pm, closed Mondays") — needs parsing or LLM extraction.
- **Live data during demo:** if a network blip kills LTA polling, fall back to last cached values. Never show a blank.

---

## 5. Order of attack (suggested)

1. **Bus stops + live `BusArrivalv2`** — highest visual payoff, makes the model feel connected to reality.
2. **Carpark availability** — single API call, instantly useful, real elderly-visitor problem.
3. **Hawker centre closures + library hours from data.gov.sg** — replaces hard-coded service hours.
4. **MRT `PCDRealTime`** — most impressive analytic angle but lowest user-facing value (most OTH visitors don't enter via MRT).
5. **Polyclinic real data** — pending whether data.gov.sg or HealthHub exposes queue length (likely a separate scrape).

---

## 6. Not in this doc (separate roadmap items)

- Google Popular Times for tenant shops — see `populartimes` scraper / BestTime.app API.
- NEA Hawker Go Where crowd indicator — undocumented internal API; for now planned via on-demand web fetch.
- HealthHub polyclinic queue — no public API, would require scraping or partnership.
