# Implementation Plan — Off-site & cross-floor service endings (DEFERRED)

**Status:** shelved on 2026-05-26 to do Level 3 first. Resume after L3 is traced.
**Brainstorm decisions captured below — design is approved in shape; one open
data question remains (the curated off-site set).**

This is **piece 1** of a larger vision (the grassroots "service-fragmentation"
dashboard). It is the foundation the dashboard's headline recommendation depends
on (e.g. "Family Service Centre is off-site → place a kiosk / a helper at OTH").
Pieces 2–4 (LLM persona simulation → simulated reviews → fragmentation report +
recommendations dashboard) are out of scope for this plan.

---

## Approved decisions

1. **Off-site final step = exit route + handoff card.** Route the resident
   *inside* OTH to the nearest relevant exit, then show a card with address,
   distance, travel mode + time, and `[Open in Maps]` / `[Open OTH app]`.
2. **Three location buckets**, tagged per service:
   - `modelled` — on L1/L2/L3 with a real polygon → routes normally (today's behaviour).
   - `inOthUnmodelled` — inside OTH, floor not built → in-building ending
     ("ride the lift to L3, #03-34"), no external leg.
   - `offsite` — outside OTH → exit + external handoff card.
3. **Curated data**, hand-authored for a small real set. Google Maps deep-link
   is built from the address string, so **no coordinates/transit API needed**.
4. **Exits reuse `entrances.json`** with `exit-*` ids placed in the existing
   entrance editor — no new tool. Exit metadata (friendly name + "leads to")
   lives in a small code map.
5. **Journey ordering:** ~~off-site stops sort to the end~~ — **superseded** by the
   effort-aware planner (see "Effort-aware journey planner" below). Off-site is now
   a schedulable stop; its slot is decided by least-effort scheduling, and the
   resident **may leave OTH and return** if that's optimal/forced.
6. OTH-app handoff stays the **current stub**; **no embedded external map**.

### OPEN QUESTION (answer before resuming)
Which services form the curated off-site demo set? Hero is the **Family Service
Centre** (MSF/VWO, elsewhere in Tampines). Candidates to also include: a
polyclinic, ICA/CPF errands. Decide the final list.

---

## Work breakdown

### 1. Types (`src/data/types.ts`, `src/intent/types.ts`)
- Add `LocationKind = "modelled" | "inOthUnmodelled" | "offsite"` and
  `locationKind: LocationKind` to `Service`.
- Add an optional `offsite` block to `Service`:
  ```ts
  offsite?: {
    address: { en: string; zh: string };
    exitId: string;
    travel: { mode: "bus" | "mrt" | "walk" | "taxi"; line?: string; minutes: number; km: number };
    latLng?: [number, number];
  };
  ```
- Add optional `unitLabel?: string` (e.g. `"#03-34"`) for `inOthUnmodelled`.
- `PlanStop` already carries `walkInAccepted` / `appointmentRequired` /
  `operatingHours`; reuse. The `offsite` Plan kind + `appHandoff` already exist.

### 2. Data (`public/data/services.json`, `src/data/retrieval.ts`)
- Tag every service with `locationKind`. Fix mislabels: `family-service-centre`
  is `offsite` (not L3); `family-medicine-clinic` is `inOthUnmodelled` (L3 in OTH).
- Author the `offsite` block for each curated off-site service.
- Place `exit-*` points in `entrances.json` (entrance editor): at minimum
  `exit-mrt`, `exit-bus-interchange`, `exit-south-plaza`.
- Add `src/data/exits.ts`: `Record<string, { name: LocalizedText; leadsTo: LocalizedText }>`.

### 3. Routing (`src/routing/buildRoute.ts`)
- `offsite`: destination = `entrances[service.offsite.exitId]`; final step
  `segmentKey: "offsite-exit"`, carrying the `offsite` block (extend `Waypoint`
  with an optional `handoff` payload, or look it up by serviceId in the UI).
- `inOthUnmodelled`: route to the nearest **lift** on the start floor; final step
  `segmentKey: "inbuilding-handoff"` with the target floor + `unitLabel`.
- Journey builder: sort `offsite` stops last.

### 4. Resident UX (`src/ui/PromptPanel.tsx` + a new card component)
- **Off-site card** on `offsite-exit`: "Outside OTH" + name, address,
  `🚌 {line} · {minutes} min · {km} km`, `[Open in Maps]`
  (`https://www.google.com/maps/dir/?api=1&destination=<address>`), `[Open OTH app]`.
- **Unmodelled-floor card** on `inbuilding-handoff`: "It's on Level {n}
  ({unitLabel}) — take the lift."

### 5. Forward hooks for the dashboard
- On off-site / unmodelled steps, stash friction facts (extra travel minutes,
  "left the building", floor gap) on the step so piece 3 can aggregate later
  with zero rework. Not user-visible.

---

## Test / verify (off-site & cross-floor)
- A route to an `offsite` service ends at the correct exit + shows the card.
- A route to an `inOthUnmodelled` service ends at a lift + shows the floor card.
- `modelled` services are unchanged (existing routing tests stay green).

---

# Effort-aware journey planner

**Status:** designed & approved 2026-05-26 (brainstorm). Build alongside / after
the off-site foundation above. Replaces the static "off-site sorts last" rule.

Upgrades a journey from a fixed stop order into a **least-effort, time-aware
schedule**. The same engine powers the resident's plan *and* the dashboard's
agent-simulation metrics (pieces 2–4).

## Decisions
- **Objective: least effort** (elderly-first). Queue-wait and trip-out are folded
  into the effort cost; **operating/closing hours are the only hard constraints**.
- **Off-site may be left and returned to.** Each trip out carries a high effort
  penalty, so off-site usually still lands last — but the planner **allows a
  forced mid-journey return** (e.g. when the off-site place closes early) and
  **flags it** as a fragmentation signal.

## Effort model — `effort(stop, t)` at projected arrival time `t`
```
effort = wWalk  · walkMetres          // A* path length, summed across floors
       + wFloor · floorChanges         // lift hop ≈ 1 unit; transfers cost more
       + wWait  · projectedWaitMin(t)  // live load / popular-times curve READ AT t
       + wTrip  · tripOut              // off-site: (travelMin × 2) + fixed re-entry penalty
```
- Dwell time (per-service task duration) is **not** effort but **advances the
  clock**, shifting later stops' arrival times (and their queue reads).
- Senior walk speed ≈ 1.0 m/s for walk→time conversion.
- Weights start as constants (`wWalk`, `wFloor`, `wWait`, `wTrip`); later tunable
  per persona in the dashboard.

## Scheduler — `simulateJourney(stops, startTime, ctx)`
- ≤5 stops → **enumerate all permutations** (≤120).
- For each order, **simulate the clock**: start → walk/travel to stop → arrive at
  `t` → `wait(t)` → dwell → next. (A* path lengths + connector picks reuse
  `buildRoute`; wait from live `counterLoads` / popular-times at `t`.)
- Discard orders that break a closing-hour constraint; keep the **lowest total
  effort** feasible order.
- Returns `{ order, breakdown }` where `breakdown` = `{ totalEffort, walkMetres,
  floorChanges, waitMinutes, tripsOut, forcedReturn: boolean, wallClockMin,
  perStop: [...] }`.

## Resident UX
- Journey timeline shows **per-stop ETA + projected wait**.
- A banner: **"Leave OTH by HH:MM for <off-site service>."**
- If a return trip is forced: **"You'll step out and come back"** (surfaced, not
  hidden) — honest about the burden.

## Dashboard reuse (pieces 2–4)
- `simulateJourney().breakdown` is the per-persona journey stat.
- Agent sim runs each LLM persona's intent → journey → `simulateJourney` →
  aggregate `breakdown`s into fragmentation metrics per persona/service
  (e.g. "elderly-low-mobility: 312 m walked, 2 floor changes, 1 forced trip-out,
  41 min queueing → effort 78").

## Data needed
- per-service `dwellMinutes` (curated default by category: clinic 25, ServiceSG
  15, library 10, …).
- operating hours — backend services carry `operating_hours`; curate for app
  services in `services.json`.
- off-site `travel` block (already specified in the off-site section above).

## Test / verify (planner)
- `simulateJourney` picks a feasible order; closing-hour violations are excluded.
- High `wTrip` keeps off-site last when hours allow; an early-closing off-site
  forces it earlier and sets `forcedReturn: true`.
- Quieter projected-wait orderings beat busier ones when effort is otherwise tied.
- `breakdown` numbers are deterministic for a fixed `startTime` + load snapshot
  (so the dashboard/sim is reproducible).
