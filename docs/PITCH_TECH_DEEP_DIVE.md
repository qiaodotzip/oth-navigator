# OTH Navigator — Unique Features & Tech (Pitch Deck Backing)

*Tamp (3D wayfinding map) + JOM (AI concierge chatbot). Two apps, one journey.*

Everything below is implemented unless explicitly marked *roadmap* or *mock*.

---

## The one-liner UVP

> **"A concierge that understands *why* you came, and a 3D indoor GPS that walks you
> through every stop — built for the people who struggle most with government buildings."**

Two products, one journey:
- **JOM** = the *brain* — an AI chatbot concierge that turns "I lost my job and can't
  pay my mortgage" into a ranked set of the right government services.
- **Tamp** = the *body* — a 3D indoor map that receives that plan and physically walks
  the resident from counter to counter.

The handoff between them *is* the product. Most wayfinding apps make you already know
where you're going. We start one step earlier — at the **intent**.

---

## 1. Intent-first, not directory-first ⭐ *(core thesis)*

Every other building app is a directory: a search box and a list of shops. We rejected
that, because residents arrive **with a problem, not a destination**. You describe a
life situation in your own words, and we decompose it into the actual services you need
— across agencies (MSF, HDB, WSG, CPF…) you wouldn't know to ask for by name. We
resolve intent in two tiers: a fast on-device keyword match handles common errands
instantly (and works even with no internet), weighting stronger/longer matches and
direct service-name hits, while messy natural language falls through to JOM's AI
concierge. Crucially, we don't pretend to be sure when we aren't — every match carries a
confidence level, and below a threshold the app deliberately hands you to a real person
at the ServiceSG counter rather than guessing and sending you to the wrong place. It's
bilingual throughout and tuned to how Tampines seniors actually phrase things ("elderly"
maps to active-ageing, not a literal keyword).

## 2. The auto-planned "Your trip" multi-stop journey ⭐ *(killer differentiator)*

This is the feature nobody else has. One errand to a civic hub usually means **several
counters, in the right order** — and people give up halfway. JOM assembles the
itinerary (one service per agency), each stop carrying a plain-language reason ("needed
for your HDB eligibility"), and Tamp renders it as a progress stepper that chains you
from stop to stop, re-routing each leg from where the previous one ended.

**Our planning algorithm (the effort-aware planner):** we treat trip-planning as an
optimisation problem — find the stop order that costs *this* resident the least
**effort**, not the shortest raw distance. Effort is a weighted blend of four things:

- **metres walked** (the real A* path length, summed across floors),
- **floor changes** (each lift/escalator hop, with transfers costing more),
- **projected queue wait at the time you'd actually arrive**, and
- **trips outside the building** (an off-site detour is penalised heavily — counted as
  travel out *and back* plus a re-entry penalty).

We then **simulate the clock**: start → walk to a stop → arrive at time *t* → queue
(reading that service's busyness *at t*) → spend the task time → move on. The task
duration doesn't count as effort but it *advances the clock*, which shifts the queue
predictions for every later stop. For a typical journey (≤5 stops) we **enumerate every
possible order** (at most 120 permutations), throw out any that would arrive after a
counter has closed — **operating hours are the only hard constraint** — and keep the
lowest-effort feasible order. Off-site stops are schedulable: the planner can decide
it's best to step out and come back, and if an early closing *forces* a mid-journey
return, we surface that honestly instead of hiding it. Net effect: an elderly resident
walks less, climbs fewer floors, and queues at quieter times — automatically.

## 3. Foot-traffic & queue-aware routing ⭐

We don't just route to a *service* — we route to the **least-busy counter** of that
service, and we time your arrival against the crowd.

**Where the data comes from:** we pulled **real foot-traffic data from the BestTime
API** for key OTH venues (the regional library, the hawker centre, the community club),
captured as a snapshot of how busy each place is by hour and day of week. Where we don't
have a real reading for a given counter, we fall back to **modeled weekday curves**. Every
busyness value is tagged with its provenance — **live, forecast, or modeled** — and the
interface labels which, so we never paint a guess as a live reading.

**How it plays a part:** that busyness signal feeds two things. At the counter level, we
send you to the quietest open queue of your service rather than the first one. At the
journey level, it's the **"projected wait" term in the effort model** above — because we
simulate when you'll actually arrive at each stop, we can prefer an order that hits busy
counters during their lulls. To make it tangible on screen, ambient crowd agents walk
the building along real OTH loops, so busyness is something you *see*, not just a number.

## 4. Real indoor 3D wayfinding (not a flat floorplan) ⭐

A genuine 3D model of all of OTH with navigation-grade pathfinding, not a static map.
Here's what made it possible:

**A data-driven 3D building.** We didn't hand-sculpt a 3D mesh. We *traced* each floor
of OTH as a set of polygons — rooms, corridors, open landmarks, walkways — plus typed
fixtures (lifts, escalators, stairs, benches, shopfronts) in a custom in-app editor, and
stored it all as plain data. The renderer (React Three Fiber, a React layer over
Three.js) extrudes that data into the 3D scene at load time, giving each room and fixture
its own height and material. The key win: because the map *is* data, the same geometry
drives both what you see and what the router walks — trace one new room and it instantly
becomes routable, no code change.

**Pathfinding that respects walls and rooms.** Over that geometry we lay a fine walkable
grid and run A* across it, with three ideas that make the result feel human. First, we
forbid diagonal moves that would clip a wall corner (a diagonal step is only allowed when
both side cells are clear). Second, we resolve walkability by *precedence*: barriers like
gates and courts block first (with slightly inflated hit-boxes so a thin gate can't be
stepped over), then walkways and open landmarks are walkable, and every room acts as a
wall — *except the one you're heading to*, which we open up for that single trip. So
you're routed *around* every office but *into* your target, with zero per-room tuning.
(If you're ever dropped on a blocked spot, we spiral outward to the nearest reachable
cell first.) Third, raw grid paths look like staircases, so we "pull the string" —
repeatedly jumping to the furthest point still in clear line of sight — to collapse them
into clean, direct runs, falling back to the grid path if a shortcut ever clips a wall.

**Smart vertical movement between floors.** Lifts, escalators and stairs are detected
straight from the floor data. For a multi-floor trip we shortlist the nearest few
connectors, then score them by *actual walking distance* on each floor — so we pick the
lift you can really reach fastest, not the one that merely looks close but is walled off.
Escalators respect their travel direction, a two-floor jump forces a lift, and step-free
mode simply drops everything but lifts and recomputes the whole route.

**A real navigation feel.** A GPS-style camera follows you from behind your heading with
smoothing tuned to elapsed time, so the chase feels identical on a slow or a fast device
(plus an optional first-person walk-through). The route is drawn as a glowing ribbon — a
smooth spline through the path with chevrons that *flow* toward your destination and fade
at the ends — and it breaks naturally at each lift, resuming on the floor above.

## 5. Accessibility & elderly-first by design ⭐

Accessibility shapes the engine, not just the styling. What we actually did to make it
real:

**Step-free routing is a genuine recomputation, not a label.** Because we model vertical
movement as a *typed set* of connectors (lift / escalator / stair), turning on step-free
mode removes every escalator and stair from the candidate set and runs the pathfinder
again from scratch. You get the truly optimal lift-only route — not a normal route with a
warning slapped on — and if no lift-only path exists, we say so instead of sending you up
a stair.

**Bilingual from the data layer up.** Every user-facing string — service names, map
labels, the per-stop reasons, the turn-by-turn narration — is stored as a paired
English/Mandarin value at the source, rather than passed through a translate-on-the-fly
layer. That means switching language is instant and *complete*, with nothing left
half-translated, and it's safe to flip mid-route.

**Voice instead of typing.** We built voice input on the browser's speech recognition,
supporting both English and Mandarin. The transcript feeds the *same* intent resolver as
typed input, and a confident match auto-routes — so a senior can simply *say* what they
need ("I want to renew my passport") and start walking, no keyboard at all.

**Turn-by-turn that doesn't overwhelm.** During navigation we surface one large
instruction at a time, an ETA, and a clear "Stop N of M", with a step-free confirmation
pill when that mode is on — deliberately sized and sequenced for low vision and low
tech-comfort.

## 6. Beyond the resident: the Service Fragmentation Dashboard 🚀 *(vision / "so what")*

The same engine that guides one resident becomes an **evidence engine for service
planners** — our answer to "so what?" Here's how the simulation is built and how it works:

**A reproducible persona cast.** We use an LLM *once*, offline, to author a diverse cast
of Singaporean residents — each with an age, a mobility level, a first language, a
tech-comfort level, and a real need written in their own voice — then freeze that cast to
a data file. Keeping the LLM out of the live loop is deliberate: the simulation stays
reproducible and runs fully offline, with no risk of a model wandering or stalling
mid-demo.

**Agents that actually walk the building.** We turn each persona into an agent. Their
need is resolved into a set of services, and that journey is run through the *exact same*
routing and effort-aware planner the resident app uses — same A* paths, same connector
choices, same effort model. The simulation then **steps a virtual clock** for each agent:
walk to a stop → arrive at a specific time → queue based on *that hour's* busyness → spend
the task's dwell time → move to the next. So the result reflects a realistic day, not a
straight-line estimate. Given a fixed start time and busyness snapshot the entire run is
**deterministic** — every run produces identical, auditable numbers. On screen, the camera
follows one "hero" agent through the real 3D model while the rest of the crowd simulates in
parallel (the crowd size is a single configurable number).

**Turning journeys into a fragmentation score.** Each agent's journey emits a breakdown —
**metres walked, floor changes, minutes queued, and trips out of the building** — which we
combine into one **effort score**, alongside friction flags: did the service force the
resident to *leave OTH and come back*, does it sit on a hard-to-reach floor, and how much
**queue exposure** does it impose on *low-mobility* personas specifically. We then
aggregate across the whole cast three ways — per persona type, per service, and per intent
— so "this service is fragmented" becomes a number with named victims, not a vibe.

**From numbers to recommendations (rules + LLM, not a black box).** A deterministic rules
engine scans the aggregate for known friction patterns — an off-site service with a high
forced-return rate, a hard floor driving lots of floor changes, high queue exposure for
the elderly — and ranks them by the strength of their evidence (the actual numbers and the
affected personas). Only the final *wording* is handed to an LLM, which phrases each into a
grassroots recommendation: "bring a Family Service intake point into the Hub," "add a
queue-number system and seating here," "relocate this counter nearer a lift." Detection
lives in the rules and only the phrasing in the LLM — so every recommendation is grounded
in real measured friction, never hallucinated. It turns wayfinding data into a concrete
argument for **fixing the building, not just navigating it.**

---

## How to frame the deck's "why us"

> Others help you find a shop. We understand your problem, sequence the half-dozen
> counters you didn't know you needed, route you to the *quietest* one at the *right
> time*, walk you there in 3D with step-free options — and then tell the town council
> where the building is failing people.

---

## Q&A honesty notes (so nothing bites you on stage)

- **Foot-traffic** is a real **BestTime snapshot** for our hero venues plus **modeled
  curves** elsewhere; the product always labels which (live / forecast / modeled).
- The **effort-aware planner** and the **fragmentation dashboard's simulation engine**
  are designed and partly scaffolded; the dashboard currently runs on **mock personas**,
  and the full least-effort scheduler is the next build. The core wayfinding, multi-stop
  journeys, step-free routing, and least-busy-counter selection are live.
- **HDB is modeled on L2** (on-site truth), even though the backend's location text says
  Level 3 — a deliberate decision, not a bug.
