# Time-aware crowd routing — design

**Date:** 2026-05-29
**Status:** Approved, ready for implementation plan
**Context:** Day-before-pitch feature. Today the busyness layer is decorative —
crowd estimates feed map labels and which counter is *named*, but never bend the
walked route. And the "Daylight" time toggle only changes lighting, not crowds.
This connects the two so toggling time visibly re-routes around crowds.

## Goal

Make the existing time-of-day control drive busyness, and make busyness bend the
route around crowded vertical-circulation (a busy lift loses to a quieter
escalator). Ship a preset demo route whose connector choice visibly flips when
the presenter toggles time.

## Current state (verified)

- `timeOfDay` (`morning`/`evening`/`night`, store) only drives lighting
  (`Scene.tsx`, `primitives.tsx`). The control is the **"Daylight"** `OptionRow`
  in `FloorSelector.tsx:173`.
- `busynessNow` (`popularTimes.ts`) reads the **real wall clock** (`new Date()` in
  `counterLoads.ts:31`), independent of `timeOfDay`.
- `buildRoute` consumes `loads` only via `leastBusyCounter`, which changes *which
  counter is named*, not the path (`buildRoute.ts:222`). Pathfinding
  (`pathfinder.ts` A*) and connector selection (`pickConnector`,
  `buildRoute.ts:113`) are purely geometric — distance only.
- Connectors (lifts/escalators/stairs) have **no busyness data** of their own.
- The "receive demo" is `onReceiveJourney` (`App.tsx:294`), a faked 3-stop journey,
  wired to a button in `PromptPanel`.

## Data (real popular-times.json, Friday curve)

Strong morning↔evening contrast confirmed:
- **Morning (~10:00):** government peaks — `psc` 0.88, `hdb` 0.88; leisure empty.
- **Evening (~18:00):** leisure/retail peaks — `hawker` 0.97, `library` ~1.0,
  `gym` 1.0, `supermarket` 1.0; government quiet.

This swing is the basis for a believable connector flip.

## Design

### 1. Time toggle → busyness

- Pure helper `simHour(timeOfDay): number` → `morning→10`, `evening→18`,
  `night→21` (chosen from real peaks).
- Pure helper `simDate(timeOfDay): Date` from `simHour`, day-of-week pinned to a
  fixed weekday so curves are stable across runs.
- `counterLoads.ts:31` reads `simDate(timeOfDay)` from the store instead of
  `new Date()`. Toggling time now changes every crowd label.
- Relabel the `FloorSelector` control **"Daylight" → "Time"** (it now drives look
  *and* crowds). No behavior change to `cycleTimeOfDay` itself.

### 2. Connector crowd penalty (from nearby venues)

- Pure helper
  `connectorCrowdPenalty(point, floorId, services, floors, popularTimes, now): number`:
  finds services whose room-polygon center is within **R metres** of the
  connector *on that floor*, takes the **max** `busynessNow` at `now`, returns
  `crowd × WEIGHT` as a **metres-equivalent** cost. Returns 0 when no venue is
  near or all are off-hours.
- `buildRoute` and `pickConnector` gain an **optional**
  `connectorPenalty?: (point: Pt, floorId: FloorId) => number`, defaulting to
  `() => 0`. Every existing caller/test is therefore byte-for-byte unchanged.
- In `pickConnector`'s scoring loop:
  `total = startLeg + destLeg + connectorPenalty(c.point, c.floorId)`.
- `App.tsx` builds the closure from current `services` + `popularTimes` + sim time
  and passes it into both `buildRoute` calls.
- `R` and `WEIGHT` are named constants, tunable to guarantee the flip.

**Scope decision:** connector-only. The penalty does NOT alter the on-floor A*
path — that's riskier and harder to narrate. Connector choice is the visible,
explainable change.

### 3. Demo button → preset crowd-sensitive route

- Replace `onReceiveJourney` (`App.tsx:294`) with `onRoutingDemo`: sets a **preset
  start location** and routes to a **single destination**, chosen so the
  connector choice flips between morning and evening. Relabel the `PromptPanel`
  button to **"Show routing logic"**.
- Candidate to lock during build: **start on the hawker/leisure side of L1 → HDB
  branch on L2.** Evening → connector near the packed hawker/library is penalized
  → routes via the quieter one; morning → leisure empty → nearest connector wins.
- Implementation MUST verify the real connector geometry produces a visible flip
  and adjust the exact start/dest (and, if data is too flat, nudge R/WEIGHT or a
  single curve in the already-simulated `popular-times.json`).

### 4. Tests + verification

- Unit: `connectorCrowdPenalty` — high near a busy venue at peak, ~0 when far or
  off-hours.
- Unit: `pickConnector` — same start/dest, two connectors; penalty flips the
  winner vs the no-penalty baseline.
- Existing `buildRoute` / journey-chaining tests stay green (guaranteed by the
  default-noop param).
- **Manual gate:** load the preset route, toggle Time morning↔evening, confirm the
  *drawn path on screen* visibly changes. A flip that shows only in a unit test is
  a fail for the pitch.

## Risk + fallback

The on-screen flip is make-or-break. If, after tuning, the real geometry won't
flip in time, fall back to **hand-tuned per-connector busyness values** keyed to
time-of-day — same UI, guaranteed flip. This is the safety net, not the plan.

## Out of scope

- Crowd-aware on-floor A* pathing.
- Crowd-aware journey stop ordering or destination substitution.
- Real (non-simulated) queue data — the `source` hook already exists for later.
