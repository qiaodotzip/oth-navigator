# One Tampines Hub — 2.5D Indoor Navigation with AI Agents

**Status:** Design approved 2026-05-22, pending spec review before implementation plan.
**Author:** Brainstormed with Claude Code.
**Repo:** `tamp_hackathon`

---

## 1. Problem statement

Services at One Tampines Hub (OTH) are fragmented across many agencies and providers. Although many can be done online, a sizeable share require visiting a specific counter inside the 8-floor complex. Elderly visitors — the most likely to prefer in-person service — struggle to find the right counter, especially when accessibility (step-free, lift-only) routing matters.

This project builds the **physical-navigation layer** of a broader OTH-services assistant. The wider system also has: (a) a service database, and (b) an LLM that answers "where do I go for X." Both are out of scope here except as interfaces.

The output of this layer: a senior taps or speaks what they need, and a small geometric character walks them through a stylised 2.5D model of OTH from entrance to the correct counter, with bilingual narration and live counter-load awareness.

## 2. Goals

- **Demonstrably useful at OTH today.** Geometry and service locations are accurate to the real building. No fabrication.
- **Senior-friendly UX.** Large tap targets, voice, bilingual (English + Mandarin), no typing required.
- **Accessibility-aware.** Step-free routing produces a different, valid route than default routing.
- **Live-load aware.** Simulated counter loads visibly influence which counter the guide recommends.
- **Buildable in a hackathon.** Asset pipeline ≤ 10h of one-off work, build ≤ 4 working days.

## 3. Non-goals

- Full 3D reconstruction of OTH or photorealistic visuals.
- All 8 floors. **L1 + L2 only** for v1; L3–L8 are a contingent extension if floor plans can be sourced.
- A* / Dijkstra runtime pathfinding. Routes are hand-authored waypoint arrays.
- LLM doing spatial reasoning over the geometry. The LLM picks the right service and generates narration; it does not invent paths.
- Photo-based localization, mobile app, kiosk hardware, authentication, persistence.
- Real on-site capture (Polycam, panorama, etc.).

## 4. Users and personas

**Primary user — "Mrs Tan, 68."** Singaporean, comfortable in English and Mandarin, dislikes typing, holds her phone close to read. Tries to visit OTH for specific transactions but is intimidated by the multi-storey layout and unsure which counter she needs.

**Secondary observer — judges / OTH operators.** Care about: feasibility (does it scale to all services?), accessibility (does step-free routing actually work?), and the "this could be real" feeling.

## 5. Demo scope

- **Floors modeled:** L1 + L2.
- **Services demoed:** 4–6 high-impact services across L1 and L2. Final list locked once `othhubguide2020.pdf` is mined. Candidates: Customer Service, Regional Library counter, Polyclinic registration, Sports facility booking, e-service lobby, Hawker / FairPrice landmarks for analytics agents.
- **Languages:** English + Mandarin.
- **Accessibility profiles:** default + step-free.
- **Analytics agents:** 8–12 wandering NPCs, simulated load only.

L3–L8 may be added if data is sourced cheaply (PA tenants directory, OTH website). If not, omitted from the demo without breaking the narrative.

## 6. Architecture

Single-page React app, fully client-side except one LLM proxy.

```
Browser (laptop, vertical phone-shaped canvas)
├── React 18 + Vite + TypeScript + Tailwind CSS
├── React Three Fiber + drei (3D viewport)
├── Web Speech API
│     ├── SpeechSynthesis (TTS) — narration playback
│     └── SpeechRecognition (STT) — voice input button
└── Static data under /public/data
      ├── floors/L1.json, L2.json
      ├── services.json
      └── waypoints.json

Client → Serverless function (Vercel Edge or Cloudflare Worker)
└── /api/narrate — proxies OpenAI Chat Completions
      └── Hides OPENAI_API_KEY, adds rate-limiting headroom
```

No backend database. No auth. No persistence. The serverless function exists only to hide the OpenAI API key from the browser.

## 7. Layout

Vertical phone-shaped canvas (390×844 logical pixels, scaled to fit viewport), three zones:

| Zone | Height | Contents |
|---|---|---|
| TopBar | ~8% | Language toggle (EN/中), step-free toggle, voice mic button |
| WorldView | ~60% | 2.5D extruded floor, agents, floor selector tab (L1/L2) on right edge |
| PromptPanel | ~32% | Service tiles by default; collapses to narration strip while a route plays |

## 8. Component breakdown

```
src/
├── app/                        # Vite + React entry, routing, layout
├── world/
│   ├── Scene.tsx               # R3F root, lighting, postprocessing
│   ├── Floor.tsx               # Extrudes a single floor's polygons
│   ├── CameraRig.tsx           # Top-down ↔ zoom-in tween controller
│   └── Landmark.tsx            # Counter signage, lift markers, etc.
├── agents/
│   ├── GuideAgent.tsx          # Sphere head + rounded-rectangle body
│   ├── AnalyticsAgent.tsx      # Top-down colored dot, simple wander
│   ├── FootstepBreadcrumb.tsx  # Trailing footprint icons (~0.5s lifetime)
│   └── motion.ts               # Smooth easing + tilt-into-turns helpers
├── routing/
│   ├── waypoints.ts            # Load and validate JSON
│   ├── filter.ts               # Accessibility + load filtering
│   └── selectRoute.ts          # Picks variant per (service, profile, load)
├── narration/
│   ├── client.ts               # Calls /api/narrate
│   ├── ttsQueue.ts             # SpeechSynthesis queue with timing
│   └── cache.ts                # Pre-warms narration for demo services on app load
├── ui/
│   ├── TopBar.tsx
│   ├── PromptPanel.tsx
│   ├── ServiceTiles.tsx
│   ├── SearchBox.tsx
│   ├── VoiceButton.tsx         # Web Speech STT wrapper
│   └── SuccessCard.tsx
├── data/                       # TypeScript types and loaders
│   ├── types.ts
│   ├── services.ts
│   └── floors.ts
└── dev/
    └── WaypointEditor.tsx      # Internal route at /dev/waypoints for authoring
```

```
public/data/
├── floors/L1.json
├── floors/L2.json
├── services.json
└── waypoints.json
```

## 9. Data model

```ts
// floors/<id>.json
type Floor = {
  id: 'L1' | 'L2';
  bounds: { width: number; depth: number };       // metres
  polygons: Polygon[];
};

type Polygon = {
  id: string;                                     // stable, matches services.roomId
  points: [number, number][];                     // 2D path, metres
  heightMeters: number;                           // extrusion height
  type: 'room' | 'corridor' | 'landmark' | 'void';
  label?: { en: string; zh: string };
};

// services.json
type Service = {
  id: string;
  nameEn: string;
  nameZh: string;
  providerName: string;
  floorId: 'L1' | 'L2';
  roomId: string;                                 // Polygon.id
  counterIds?: string[];                          // for multi-counter services
  accessibility: {
    liftAccess: boolean;
    stepFreeRoute: boolean;
    notes?: string;
  };
  sourceUrl: string;                              // citation; never null
  iconKey: string;                                // maps to icon component
};

// waypoints.json
type RouteVariant = {
  serviceId: string;
  profile: 'default' | 'stepFree';
  counterId?: string;                             // optional, for load-aware picking
  steps: Waypoint[];
};

type Waypoint = {
  floorId: 'L1' | 'L2';
  point: [number, number];                        // metres in floor coords
  decisionPoint: boolean;                         // triggers camera zoom-in
  segmentKey: string;                             // narration segment binding
};

// counter load (runtime)
type CounterLoad = {
  counterId: string;
  load: number;                                   // 0..1, Perlin-driven
};
```

## 10. Data flow

### 10.1 Guide demo (happy path)

1. User taps a service tile or finishes a voice query.
2. Client POSTs `{ query, language, profile }` to `/api/narrate`.
3. Edge function calls OpenAI Chat Completions with:
   - **System prompt:** "You are an indoor wayfinding assistant for One Tampines Hub…"
   - **Tools / structured output:** `response_format: { type: "json_schema", json_schema: {...} }` requesting `{ serviceId, segments: [{ key, en, zh }] }`.
   - **User content:** the query + the full service catalog as context.
4. Edge function returns parsed JSON.
5. Client looks up `RouteVariant[]` for `(serviceId, profile)`.
6. If multiple variants differ only in `counterId`, the route picker chooses the variant whose counter currently has lowest `load`.
7. Camera tweens to the entrance waypoint over 0.8s.
8. Guide agent spawns, begins walking. Smooth easing between waypoints, ~15° tilt into turns, footstep breadcrumbs trail behind.
9. At each `decisionPoint: true` waypoint, camera tweens to a closer angle (0.8s), TTS speaks `segments[segmentKey][language]`, then pulls back.
10. At the final waypoint the camera holds, success card slides up with counter name, load, and "you've arrived" text.

### 10.2 Analytics layer

- Each counter zone has `currentLoad: number` driven by Perlin noise with a slow drift and a simulated "lunch peak" between 12:00–13:30 of demo time.
- Loads are visible in the WorldView as small badges over each counter.
- 8–12 analytics agents spawn at entrances and walk pre-defined "common journey" loops between landmarks (e.g. entrance → library → hawker → exit). Walking is along sparse waypoints, no real pathfinding.
- Agents queue at high-load counters (visible clustering) to make the load badge feel earned.
- Agents are decorative — the loads drive them, not the other way around. Avoids feedback loops.

### 10.3 Language switch mid-route

- TTS queue holds an ordered list of `{ segmentKey, language }` pairs.
- On language toggle, the queue is rewritten: remaining segments switch language; the currently-playing segment is cancelled and restarted in the new language at the same segment.

## 11. LLM integration (OpenAI)

- **SDK:** `openai` npm package.
- **Default model:** `gpt-4o`, configurable via `OPENAI_MODEL` env var. Bilingual narration with Singapore-English tone benefits from the larger model; user has leftover credits so cost is not a constraint. Drop to `gpt-4o-mini` only if latency feels off during the demo.
- **Endpoint:** Chat Completions with `response_format: { type: "json_schema", json_schema: { strict: true, ... } }` for guaranteed structured output.
- **Prompt structure:**
  - System: role, tone (warm, concise, Singapore-English-aware), forbidden behaviours (no fabricating locations, no step-free claims for non-step-free routes).
  - User: `query`, `profile`, the services catalog (small enough to send inline), the current floor.
  - Output schema: `{ serviceId: string, segments: { key: string, en: string, zh: string }[] }`.
- **Pre-warming:** on app load, the client fires a single batch call requesting narration for all demo services in both languages, caches the result in memory. Subsequent taps use the cache. The voice / search path still calls live for arbitrary queries.
- **Error handling:** see §13.

## 12. Asset pipeline

| Step | Tool | Output | Effort |
|---|---|---|---|
| 1. Mine `othhubguide2020.pdf` | manual review | `research/oth-services-from-pdf.md` | 1h |
| 2. Mine PA tenants directory + OTH website | manual review + browser | `research/services-merged.md`, `gaps.md` | 1-2h |
| 3. Trace L1 PNG → SVG | Inkscape Trace Bitmap + cleanup | `assets/floors/L1.svg` | 1.5-2h |
| 4. Trace L2 PNG → SVG | Inkscape Trace Bitmap + cleanup | `assets/floors/L2.svg` | 1.5-2h |
| 5. Assign stable polygon IDs | Inkscape XML editor | edits in same SVGs | 30m |
| 6. SVG → polygon JSON | `scripts/svg-to-polygons.ts` | `public/data/floors/L1.json`, `L2.json` | 1h (script) |
| 7. Build `services.json` | hand-authored from §1-2 research | `public/data/services.json` | 1.5h |
| 8. Build `/dev/waypoints` editor route | code | internal tool | 2h |
| 9. Author route variants per service | clicks in the editor | `public/data/waypoints.json` | 2h |
| 10. Service tile icons | Heroicons / Phosphor | static imports | 30m |
| **Total irreducible asset work** | | | **~10h** |

Asset work is parallel-friendly with engineering. The waypoint editor (step 8) is the only step that blocks step 9, and step 9 unblocks the end-to-end demo.

## 13. Error handling and edge cases

| Failure mode | Behaviour |
|---|---|
| `/api/narrate` request fails or times out | Fall back to cached narration if `serviceId` matches a pre-warmed entry. Else show "I didn't catch that — please tap a tile" message in the prompt panel. |
| OpenAI returns malformed JSON | Strict JSON schema makes this rare; on parse fail, retry once, then fall back as above. |
| Web Speech `zh-CN` voice unavailable | Detect missing voice; show subtitles in the prompt panel during narration; do not silent-fail. |
| Web Speech STT misrecognizes query | Display recognized text in the search box; user can edit and re-submit before any LLM call. No silent failure. |
| Step-free route requested but none exists for that service | Narration explicitly states the limitation ("Counter X is only reachable by escalator; please ask staff at Customer Service for assistance"). System never fabricates a step-free route. |
| Camera tween stalls | Every tween has a 1.5s hard timeout; on timeout, snap to target state. |
| WebGL unavailable | Static landing page with "this demo requires WebGL" + screenshots fallback. |
| Polygon JSON missing for a referenced room | Route is rejected at load time with a console error; service is hidden from tiles. Validation runs on app boot. |

## 14. Demo arc (2–3 min)

| Time | Action |
|---|---|
| 0:00 | Top-down view of OTH L1. Analytics agents wandering. Counter load badges visible. |
| 0:15 | Persona: "Mrs Tan, 68, doesn't know where to return library books." Tap **Library** tile. |
| 0:25 | OpenAI returns route + narration. Guide agent spawns at entrance, starts walking. TTS speaks first segment in English. |
| 0:45 | Camera zooms in at the escalator decision point. TTS: "Take the escalator on your right to Level 2." |
| 1:00 | Mid-route, toggle language to 中. Narration switches to Mandarin from the next segment. |
| 1:20 | Agent arrives at library counter. Success card: "Regional Library Counter — Level 2, Counter 3, 2 people waiting." |
| 1:30 | Toggle **step-free**. Same query. Different route shown (lift instead of escalator). Same destination. |
| 2:00 | Pull back to wide shot. Highlight analytics: "the route picker chose Counter 3 because Counter 5 has 7 people queuing." |
| 2:30 | Close on the wrap: "every OTH service, accessibility-aware, multilingual, works on a phone." |

## 15. Testing

No automated tests for this scope. Two manual gates before demo:

1. **Cold-start gate.** Load the deployed URL in an incognito window on a colleague's laptop. Run the full demo arc end-to-end without opening dev tools.
2. **Senior-friendliness gate.** Show the running app to a parent or grandparent. Watch them try the tile interface unprompted. Fix anything they trip on (target size, contrast, copy).

Validation that runs at app boot (free safety net):

- Every `services.json` entry's `roomId` resolves to a real polygon in its `floorId`.
- Every `waypoints.json` entry's `serviceId` exists in `services.json`.
- Every route's first waypoint is on the floor of a known entrance.
- Every route's last waypoint is inside the service's `roomId`.

Failing validation hides the service from the tile grid and logs to the console. Demo never goes live with a broken service.

## 16. Folder layout

```
tamp_hackathon/
├── docs/superpowers/specs/2026-05-22-oth-2_5d-navigation-design.md    # this file
├── images/                                                            # source floor plans
├── research/                                                          # service-mapping notes
│   ├── oth-services-from-pdf.md
│   ├── services-merged.md
│   └── gaps.md
├── assets/floors/                                                     # SVG sources
├── public/data/                                                       # runtime JSON
├── scripts/                                                           # one-shot tooling
├── api/                                                               # serverless function(s)
│   └── narrate.ts
└── src/                                                               # see §8
```

## 17. Out of scope (deferred)

- L3–L8 floors. Conditional extension only.
- Real photogrammetry / on-site capture.
- Photo-based localization ("take a picture here").
- A* runtime pathfinding.
- Real-time queue data from polyclinics or library systems.
- Mobile app, kiosk hardware deployment.
- User accounts, history, favourites.
- Tamil and Malay narration (after Mandarin lands cleanly, low risk to add).

## 18. Open questions for plan stage

1. Final demo service list — locked after step 1-2 of §12 (mining `othhubguide2020.pdf` and the PA directory).
2. Does the OpenAI key live in Vercel env vars, or run locally for the demo? Affects whether we deploy at all or run on `npm run dev`.
3. Which serverless runtime — Vercel Edge or Cloudflare Worker? Either works; pick whichever you're already signed into.
4. Single guide character design — sphere head + rounded-rectangle body confirmed; what colour scheme? (Suggest one warm primary, one neutral.)
5. Whether to ship a static "list of sources" page in the UI for credibility ("every service location here was sourced from \[link]") — small effort, high judge-credibility payoff.
