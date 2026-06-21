# OTH Navigator — Product Requirements Document

> **Status:** v0.1 hackathon build, 2026-05-23
> **Working title:** OTH Navigator (also referred to as "HubGuide" in pitches)
> **Companion docs:**
> - Technical design: `docs/design-and-plans/specs/2026-05-22-oth-2_5d-navigation-design.md`
> - Implementation plan: `docs/design-and-plans/plans/2026-05-22-oth-2_5d-navigation.md`

---

## 1. One-line description

A senior-friendly, bilingual indoor wayfinding app that walks visitors through Singapore's Our Tampines Hub in a stylised 2.5D model, with an AI guide that adapts routes to accessibility needs and real-time counter loads.

## 2. Problem

Our Tampines Hub (OTH) is Singapore's largest integrated community hub — 8 floors, 250,000 residents served, ~30+ tenants and services from 6 different government agencies plus retail and food. The hub's strength (everything under one roof) is also its weakness: visitors don't know **where to go** for the specific service they need.

The pain is sharpest for:
- **Elderly residents** who prefer in-person service over the website but get lost in the building's scale
- **First-time visitors** who can't navigate from agency name → physical counter
- **People with mobility constraints** who need step-free routes (lift only, no stairs/escalators) and currently have no way to filter
- **Anyone with a transactional intent** ("I need to renew my season parking" → which counter?) who'd benefit from a destination-first interface rather than a directory dump

Existing alternatives fail:
- **OTH's website** is a directory of tenants, not a wayfinder. No spatial context.
- **Google Maps** has partial 360° photos of OTH but no indoor routing graph.
- **Static maps and signage on site** require already being there and being able to read the signage.

## 3. Target users

### Primary persona — "Mrs Tan, 68"
- Singaporean, comfortable in English and Mandarin (and Hokkien at home)
- Doesn't type well — prefers voice or tapping big buttons
- Wants to know exactly *which counter* and *how to get there* before leaving the house
- Has been to OTH a few times but still gets confused on which floor things are on
- Doesn't want to bother her grandchildren with simple questions

### Secondary persona — "Mr Lim, 75, wheelchair user"
- Mobility-limited; cannot use escalators or stairs
- Needs to know in advance whether a service has a step-free route
- Currently relies on family or asks staff; both are friction

### Tertiary persona — "OTH operations"
- Hub administrators who want to see crowd flow patterns, peak hours, popular journeys
- Need this to plan staffing and signage improvements
- Get this insight today only through manual observation

### Demo audience (hackathon)
- Judges + early adopters / staff at OTH
- Validating whether the product feels like a real, deployable tool

## 4. Why now

- Public services in Singapore are pushing **digital first** but many transactions still require in-person counter visits.
- Singapore has an **aging population** — the 65+ cohort projected to be ~25% by 2030. Senior-friendly UX for public buildings is a near-term need, not a "nice to have".
- **LLMs with reasonable structured-output reliability** (GPT-4o, Claude Sonnet) make it tractable to build a wayfinder that doesn't require a full indoor-mapping operation. The AI can do the route reasoning + bilingual narration; the building owners don't need to publish detailed indoor GIS data.
- **Web 3D (React Three Fiber, three.js)** is mature enough to ship a stylised 2.5D indoor model that runs in any browser, no app install.

## 5. Product vision

Open the app on your phone (or kiosk in the lobby). See OTH as a clean, top-down 2.5D model — the building's volumes extruded from real floor plans, with named zones and small wandering figures representing other visitors. Tap a tile for the service you need ("Public Service Centre", "Library", "HDB"). A guide character appears at the entrance and walks the route to your destination while a warm voice tells you, step by step, where to go. The route adapts: if you've toggled "step-free", the agent takes the lift instead of the escalator. If one of three PSC counters has 7 people waiting and another has 2, the route picks the less busy one.

Everything in English or Mandarin, switchable mid-route.

## 6. Goals

- **Demonstrably useful at OTH today.** Geometry and service locations accurate to the real building. No fabricated facts.
- **Senior-friendly UX.** Big tap targets, voice in + voice out, bilingual (EN + ZH), no typing required.
- **Accessibility-aware.** Step-free routing produces a *different valid route* than default routing.
- **Live-load aware.** Simulated counter loads visibly influence which counter the guide recommends.
- **Privacy-respecting.** No accounts, no tracking, no personal data leaving the browser.
- **Deployable on a hobbyist budget.** Runs on Railway free/hobby tier. Single OpenAI key. No ops complexity.

## 7. Non-goals (for v0.1 / hackathon)

- Full 3D reconstruction of OTH or photorealistic visuals.
- All 8 floors. **L1 + L2 only** for the hackathon demo. L3-L8 if data sources allow.
- LLM doing live spatial reasoning over geometry. Routes are hand-authored waypoints; the LLM generates *narration*, not paths.
- A* / Dijkstra runtime pathfinding.
- Photo-based localization ("take a picture here to find me").
- Mobile native app — desktop or mobile web for v0.1.
- Authentication, persistence, user accounts.
- Real-time data hookup to live queue systems.

## 8. Key features (v0.1)

### F1. 2.5D model of OTH L1 + L2
- Polygons traced from real OTH floor plans (the 2020 hub guide PDF and the 1st/2nd-storey site plans)
- Extruded in three.js / React Three Fiber to give volume without modeling effort
- Stylised, not photorealistic — looks intentional, lightweight, ships fast
- Zone labels (Public Service Centre, Library, etc.) float above each polygon

### F2. AI guide agent
- Geometric primitive character (sphere head + rounded body) walks the user's route in real time
- Smooth easing between waypoints, slight tilt into turns, footstep breadcrumbs trail behind
- Camera tweens between top-down (overview) and zoom-in (at decision points like lifts, escalators)
- "Inspect mode" toggle for free orbital camera (useful for the demo wow-shot)

### F3. AI ambient agents (analytics)
- 8-12 colored dots wander predefined loops between landmarks
- Each counter has a live load (Perlin-noise driven, 0-12 people waiting visible as "N waiting" badges)
- Route picker picks the less-busy counter when multiple counters exist for a service
- Makes the model feel alive AND demonstrates the ops-analytics potential

### F4. Service discovery
- 6 demo services (PSC, Hawker Centre, Community Centre, Library, HDB, Theatre) as big iconographic tiles
- Voice input (Web Speech API) — say "library" and it routes you
- Search box for typed input (secondary mode)

### F5. Bilingual narration
- English + Mandarin, switchable any time including mid-route
- OpenAI proxies generate narration based on the service + accessibility profile + route segments
- Narration pre-warmed for all demo services on app boot to mask any cold-start latency
- Web Speech TTS for voice playback

### F6. Accessibility routing
- "Step-free" toggle filters routes that have a step-free variant
- The same service can have two routes (default uses escalator, step-free uses lift)
- Narration honestly states if a step-free route isn't available

### F7. Senior-friendly UX shell
- Vertical phone-shaped canvas (mocks the form-factor seniors actually hold)
- Large tap targets, system font, paper-cream + warm-orange palette
- Top bar: language toggle, step-free toggle, voice mic button
- Bottom panel: tiles by default; narration card during a route

### F8. Polygon editor (internal tool)
- A `/#polygon-editor` dev route for tracing floor plans
- Click-to-add-corner, autosave to localStorage, JSON export
- The team uses this to convert OTH floor plan images into the model in ~30 minutes per floor

## 9. Out of scope / future ideas (roadmap)

Ordered by judged value vs. effort:

### V0.2 — Right after hackathon
- L3-L8 floors (data sourcing dependent on hub directory mining or on-site capture)
- More services (target ~20 covered, the top transactional ones)
- Better waypoints — corridor-aware paths instead of straight lines through walls
- Persisted state across sessions for repeat visitors ("Welcome back, want to go to the library again?")

### V0.3 — If validated with users
- **Multilingual expansion** — add Malay and Tamil (Singapore's official languages)
- **Photo-based localization** — user takes a picture at a decision point, vision model identifies signage and updates "you are here"
- **Mobile companion** — QR code from kiosk → phone follows along
- **Real live data** — at least 2 services with real queue data (polyclinic, library)

### V1.0 — Productisation
- **Self-service authoring** — building managers upload their floor plans, hand-trace polygons in our editor, set up service tiles, deploy
- **Multi-venue** — same architecture for other community hubs, malls, transit hubs
- **Analytics dashboard** for ops — real heatmap of visitor flow if we have anonymous telemetry consent
- **Native iOS / Android apps** with offline capability
- **Beacon / BLE integration** for precise indoor positioning

## 10. Success metrics

### Demo (hackathon judging)
- Judges can complete the demo arc without my intervention in < 3 min
- Bilingual switch works smoothly mid-route at least once
- Step-free toggle visibly changes the route
- No console errors, no broken visuals

### V0.1 in-the-wild
- 70% of seniors aged 60+ shown the app can independently complete a single route ("show me how to get to the library") within 2 minutes
- At least 3 services demo'd live to OTH operators with positive qualitative feedback
- Average TTS narration latency < 1.5s from tile tap to first spoken word

### V0.2-V1.0
- 1000+ in-venue sessions / month after hub rollout
- < 5% session abandonment (user closes app mid-route)
- 90%+ accessibility compliance (WCAG 2.1 AA)
- Top 3 senior-friendly public service apps in Singapore

## 11. Risks & mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Senior users can't operate touch UI in noisy demo room | Medium | High | Voice button + large tiles, tested with parent/grandparent gate before demo |
| LLM hallucinates a service location | Low | High | LLM never invents — it picks from a curated `services.json` with sourced URLs. Every service has a `sourceUrl` audit trail. |
| OpenAI API down during demo | Low | High | Narration pre-warmed and cached on app load for all demo services. Falls back to cached text if live call fails. |
| Web Speech TTS misses zh-CN voice on judge's laptop | Medium | Medium | Fallback to text-only subtitle bar in the prompt panel. |
| Floor plan tracing is inaccurate, polygons misaligned | Medium | Medium | In-app polygon editor lets us re-trace any zone in minutes. Stylised aesthetic forgives small inaccuracies. |
| Polyclinic / agency PR concern that we misrepresent their hours / location | Low | Medium | Every service entry has `sourceUrl`. Disclaimer in app footer: "Demo data, verify with OTH Customer Service: 6260 8302". |
| Browser cache shows stale data during demo | Low | High | Service worker forced to skip; manual hard-refresh as part of demo prep checklist. |

## 12. Architecture summary

(See `docs/design-and-plans/specs/2026-05-22-oth-2_5d-navigation-design.md` for full detail.)

- **Frontend:** React 18 + Vite + TypeScript + Tailwind. React Three Fiber for the 2.5D model. Zustand for state. Web Speech API for voice in/out.
- **Backend:** Single Hono Node server (`server/index.ts`) deployed on Railway. Exposes `/api/narrate` (OpenAI proxy) and `/api/health`. Serves built static frontend in production.
- **Data:** Three JSON files in `public/data/` — `floors/{L1,L2}.json`, `services.json`, `waypoints.json`. No database.
- **LLM:** OpenAI `gpt-4o` via `response_format: json_schema` for structured narration output. Configurable to `gpt-4o-mini` if cost matters.

## 13. Open questions

1. **Service catalog ownership** — for v0.2, who maintains `services.json` as OTH tenants change? Stretch: build a tiny admin form.
2. **Privacy review** — voice input is currently processed on-device (Web Speech). For v0.3 server-side STT, need a privacy policy.
3. **Routing accuracy** — at what point do we need a real navmesh? Likely when we add L3-L8 or the building expands.
4. **Demo tone** — should the narration use full names ("Public Service Centre") or colloquial ("the PSC counter")? Affects how senior-natural it sounds.
5. **Branding** — the working title "OTH Navigator" is descriptive but generic. A real product name (Wayfinder, HubGuide, Navi, Aunty, etc.) should be picked before v1.0.

## 14. Glossary

- **OTH** — Our Tampines Hub
- **PSC** — Public Service Centre, the cluster of agency counters at #01-21 on L1 (PSC + ServiceSG + e2i)
- **L1, L2** — Level 1, Level 2 (floors of OTH)
- **Waypoint** — A single point on the floor that the guide agent walks through
- **Decision point** — A waypoint where the camera zooms in and the narration speaks (lifts, key turns)
- **Profile** — Accessibility profile, either "default" or "stepFree"
- **Floor plan** — The 2D top-down architectural drawing of a floor, used as the source for polygon tracing
- **Polygon** — A single closed shape representing a room, corridor, landmark, or void on a floor
- **Counter** — A specific service desk within a service zone (a service can have multiple counters)
- **Counter load** — The number of people waiting at a counter, simulated for v0.1
