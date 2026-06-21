# Backend Integration Plan — Bolo Bao retrieval → OTH Navigator

**Backend:** the JOM chatbot — a separate companion repo (Digital OTH retrieval layer).
**Contract:** `POST /api/retrieve` returns ranked `Service` records (no spatial
data). We map them onto our floors + routing.

The adapter is already built: `src/data/retrieval.ts`
(`retrieveServices()`, `adaptService()`, `SERVICE_LOCATION_MAP`).

---

## What the backend gives us

`POST /api/retrieve` → `{ services: [{ service, relevance_score, rerank_justification }], confidence_low, query_decomposition }`.
Each `service` is a rich record (`service_id`, `service_name`, `agency`,
`location_type`, `oth_location` (free text), `eligibility`, `required_documents`,
`operating_hours`, `contact`, `source_url`, …). **No floor / room / coordinates.**

23 services, all government: MSF, HDB, WSG, SSG, AIC, CPF, FAMNEX, ServiceSG.

---

## Where each service lands (the map we own)

| Backend services | Physical location | Our room | Status |
|---|---|---|---|
| `SSGC-001` ServiceSG | L1 ServiceSG | `L1-room-psc` | ✅ exists |
| `AIC-001/002`, `CPF-001/002`, `MSF-008` (Digital_Hotline) | no counter → ServiceSG | `L1-room-psc` | ✅ (routed to ServiceSG) |
| `HDB-001…006` | HDB Tampines Branch | `L2-room-hdb-office` | ✅ exists (backend says L3 — see below) |
| `MSF-001/002/003` ComCare | SSO Tampines (L1) | `L1-room-sso-tampines` | 🔴 **STUB — trace** |
| `MSF-007` Family Service Centre | TFSC @ OTH (L1) | `L1-room-tfsc` | 🔴 **STUB — trace** |
| `WSG-001…004`, `SSG-001/002` | WSG Careers Connect counter | `L1-room-careers-connect` | 🔴 **STUB — trace** |
| `FAMNEX-001` Family Nexus | L1, near Gate 10 | `L1-room-family-nexus` | 🔴 **STUB — trace** |

Until a STUB room's polygon exists, `resolveLocation()` falls back to
`L1-room-psc` (ServiceSG) so routing always works. **The moment you trace the
room and its polygon loads, it auto-routes there — no code change.**

---

## Your to-do list

### 1. Point the app at the backend  *(5 min)*
The backend is a separate FastAPI (default `http://127.0.0.1:8000`). Either:
- set `VITE_RETRIEVAL_API=http://127.0.0.1:8000` in `.env`, **or**
- add a Vite proxy: in `vite.config.ts` `server.proxy`, add
  `"/api/retrieve": "http://127.0.0.1:8000"` (and `/api/chat` if you use it).
CORS is already enabled on their FastAPI.

### 2. Trace the 4 STUB rooms on L1  *(polygon editor, ~20 min)*
In `/#polygon-editor`, trace and name these as rooms (they auto-route once present):
- `L1-room-sso-tampines` — Social Service Office (ComCare)
- `L1-room-tfsc` — Tampines Family Service Centre
- `L1-room-careers-connect` — WSG Careers Connect (also serves SkillsFuture)
- `L1-room-family-nexus` — Family Nexus (L1, near Gate 10)
Re-export `L1.json`. No code edit needed — the map already references these IDs.

### 3. Decide HDB: keep L2, or add L3  *(your call)*
The backend authoritatively places HDB Tampines Branch on **Level 3**; we
currently model it on `L2-room-hdb-office`.
- **Hackathon-fast (recommended):** keep HDB on L2. It already routes. The
  demo doesn't need L3.
- **Full fidelity (add L3):** larger task —
  1. `FloorId` type → add `"L3"` (`src/data/types.ts`); update `floorIndex()` in
     `buildRoute.ts` (L1=0, L2=1, L3=2) and the store's `activeFloor` handling.
  2. Add `public/data/floors/L3.json` (+ optional `L3-details.json`); trace the
     HDB branch + lift/escalator landings (connectors must share x,y with L1/L2
     shafts so the vertical hop lines up).
  3. Add an **L3** button to `FloorSelector`.
  4. Point `HDB-*` in `SERVICE_LOCATION_MAP` to `{ floorId:"L3", roomId:"L3-room-hdb" }`.
  5. Cross-floor routing already generalises by floor index, but verify the
     connector picker reaches L3 (lifts serve all floors; escalators are one
     hop, so L1→L3 may need a transfer — out of scope for the demo).

### 4. Wire retrieval into the UI  *(~30 min)*
- Replace/augment service discovery: on a typed/voice query, call
  `retrieveServices(query, floors, ctx, topK)` → get `AdaptedService[]`.
- Render them as tiles (they already match the `Service` shape + extras like
  `justification`, `operatingHours`, `requiredDocuments`, `locationType`).
- Tapping a result routes via the existing `buildRoute` (uses `floorId`/`roomId`).
- If `confidenceLow`, show a "let me get a human" / ServiceSG fallback instead of
  bluffing (per their contract).
- For `locationType === "Digital_Hotline"`, the tile should show the
  phone/website **and** "in-person help at ServiceSG L1" (the adapter already
  sets `accessibility.notes`).

### 5. Journey vs. single result  *(design choice)*
The backend returns a *ranked list*, not an itinerary. Options:
- Keep the scripted `DEMO_JOURNEY` for the demo arc (current behaviour), and use
  retrieval only for free-form "find a service" queries; **or**
- Build a journey on the fly from the top-N results (each becomes a stop). The
  `JourneyTimeline` already renders any `Journey`; you'd just construct stops
  from `retrieveServices` output.

### 6. (Optional) Chat + voice
`POST /api/chat` → `{ reply }` (LLM concierge, Singlish-aware). `main.py` also
has Whisper/`gpt-4o-transcribe` for voice. If you want the conversational layer,
proxy `/api/chat` and feed the reply into the narration card; otherwise stick
with direct `/api/retrieve`.

---

## Minimal path to a working demo
1. Step 1 (proxy/env) + Step 4 (wire `retrieveServices`).
2. Skip L3; keep HDB on L2.
3. Trace the 4 L1 stub rooms when you have time (until then they route to
   ServiceSG, which is the correct real-world fallback anyway).
