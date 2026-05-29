# Time-aware Crowd Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the time-of-day toggle drive busyness, and make busyness bend the route around crowded lifts/escalators, with a preset demo route whose connector choice visibly flips when the presenter toggles time.

**Architecture:** A pure `simClock` maps the existing `morning/evening/night` toggle to a representative hour, which `counterLoads` and a new connector penalty both read instead of the wall clock. A pure `connectorCrowdPenalty` scores each lift/escalator by the busyness of nearby venues; `pickConnector` adds it (as a metres-equivalent cost) via an optional, default-noop injected closure, so all existing callers/tests are unchanged. `App` wires the closure into every `buildRoute` call and re-routes the active route when time changes. A demo button presets a crowd-sensitive single route.

**Tech Stack:** TypeScript, React, Zustand, Vitest, React Three Fiber. Path alias `@/` → `src/`.

---

## File Structure

- **Create** `src/enrichment/simClock.ts` — pure `simHour` / `simDate` mapping `TimeOfDay` → clock.
- **Create** `src/enrichment/simClock.test.ts` — unit tests for the above.
- **Create** `src/routing/crowdPenalty.ts` — pure `connectorCrowdPenalty`.
- **Create** `src/routing/crowdPenalty.test.ts` — unit tests for the above.
- **Modify** `src/routing/buildRoute.ts` — optional `connectorPenalty` param threaded into `pickConnector`.
- **Modify** `src/routing/buildRoute.test.ts` *(create if absent — none exists today)* — connector-flip test. (Plan creates it.)
- **Modify** `src/store.ts` — add `setTimeOfDay` action.
- **Modify** `src/agents/counterLoads.ts` — read `simDate(timeOfDay)` instead of `new Date()`.
- **Modify** `src/ui/FloorSelector.tsx` — relabel "Daylight" → "Time".
- **Modify** `src/App.tsx` — penalty closure into all `buildRoute` calls; re-route on time change; replace `onReceiveJourney` with `onRoutingDemo`.
- **Modify** `src/ui/PromptPanel.tsx` + `src/ui/IntentEntry.tsx` — rename prop `onReceiveJourney` → `onRoutingDemo`, relabel button.

---

## Task 1: simClock helper

**Files:**
- Create: `src/enrichment/simClock.ts`
- Test: `src/enrichment/simClock.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/enrichment/simClock.test.ts
import { describe, expect, it } from "vitest";
import { simHour, simDate } from "./simClock";

describe("simHour", () => {
  it("maps each time-of-day to a representative peak hour", () => {
    expect(simHour("morning")).toBe(10);
    expect(simHour("evening")).toBe(18);
    expect(simHour("night")).toBe(21);
  });
});

describe("simDate", () => {
  it("returns a Friday at the mapped hour (so weekday curves are stable)", () => {
    const d = simDate("evening");
    expect(d.getDay()).toBe(5); // Friday
    expect(d.getHours()).toBe(18);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/enrichment/simClock.test.ts`
Expected: FAIL — "Failed to resolve import './simClock'".

- [ ] **Step 3: Write minimal implementation**

```ts
// src/enrichment/simClock.ts
import type { TimeOfDay } from "@/store";

// Representative peak hours, chosen from the real popular-times.json curves:
// morning = government services peak (psc/hdb ~0.88), leisure empty;
// evening = leisure/retail peak (hawker/library/gym/supermarket ~1.0);
// night   = late venues only (theatre/arena).
export function simHour(t: TimeOfDay): number {
  return t === "morning" ? 10 : t === "evening" ? 18 : 21;
}

// A fixed Friday (2026-05-22 is a Friday) at the mapped hour, so busyness reads
// a stable weekday curve regardless of the real date the demo runs on.
export function simDate(t: TimeOfDay): Date {
  return new Date(2026, 4, 22, simHour(t), 0, 0);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/enrichment/simClock.test.ts`
Expected: PASS (4 assertions).

- [ ] **Step 5: Commit**

```bash
git add src/enrichment/simClock.ts src/enrichment/simClock.test.ts
git commit -m "feat(enrichment): simClock maps time-of-day to a busyness hour"
```

---

## Task 2: store — setTimeOfDay action

**Files:**
- Modify: `src/store.ts`

- [ ] **Step 1: Add the action to the State type**

In `src/store.ts`, in the `State` type next to `cycleTimeOfDay` (around line 78), add:

```ts
  setTimeOfDay: (t: TimeOfDay) => void;
```

- [ ] **Step 2: Implement the action**

In the `create<State>` body next to `cycleTimeOfDay` (around line 197), add:

```ts
  setTimeOfDay: t => set({ timeOfDay: t }),
```

- [ ] **Step 3: Verify it typechecks**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/store.ts
git commit -m "feat(store): add setTimeOfDay for deterministic demo presets"
```

---

## Task 3: counterLoads reads the sim clock

**Files:**
- Modify: `src/agents/counterLoads.ts`

- [ ] **Step 1: Subscribe to timeOfDay and use simDate**

In `src/agents/counterLoads.ts`:

Add the import near the top (after the existing `busynessNow` import on line 9):

```ts
import { simDate } from "@/enrichment/simClock";
```

Add a store subscription inside `useCounterLoadSimulator` next to the other `useStore` lines (around line 16):

```ts
  const timeOfDay = useStore(s => s.timeOfDay);
```

Replace `const now = new Date();` (line 31) with:

```ts
      const now = simDate(timeOfDay);
```

Add `timeOfDay` to the effect dependency array (line 47):

```ts
  }, [services, popularTimes, setLoad, timeOfDay]);
```

- [ ] **Step 2: Verify it typechecks and tests stay green**

Run: `npx tsc --noEmit && npx vitest run src/enrichment/popularTimes.test.ts`
Expected: no new type errors; popularTimes tests PASS.

- [ ] **Step 3: Commit**

```bash
git add src/agents/counterLoads.ts
git commit -m "feat(agents): counter loads follow the time toggle, not the wall clock"
```

---

## Task 4: connectorCrowdPenalty helper

**Files:**
- Create: `src/routing/crowdPenalty.ts`
- Test: `src/routing/crowdPenalty.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/routing/crowdPenalty.test.ts
import { describe, expect, it } from "vitest";
import type { Floor, PopularTimesEntry, Service } from "@/data/types";
import { connectorCrowdPenalty, CROWD_WEIGHT_M } from "./crowdPenalty";

const L1: Floor = {
  id: "L1",
  bounds: { width: 100, depth: 100 },
  polygons: [
    {
      id: "L1-room-hawker",
      type: "room",
      heightMeters: 3,
      points: [[20, 20], [24, 20], [24, 24], [20, 24]], // center [22,22]
    },
  ],
};

function hawker(): Service {
  return {
    id: "hawker",
    nameEn: "Hawker",
    nameZh: "小贩",
    providerName: "P",
    category: "lifestyle",
    routable: true,
    displayFloor: "L1",
    floorId: "L1",
    roomId: "L1-room-hawker",
    accessibility: { liftAccess: true, stepFreeRoute: true },
    sourceUrl: "https://example.com",
    iconKey: "info",
  };
}

// Busyness 1.0 at hour 18, 0.0 elsewhere.
function busyAt18(): PopularTimesEntry {
  const weekday = Array.from({ length: 7 }, () =>
    Array.from({ length: 24 }, (_, h) => ({ hour: h, busyness: h === 18 ? 1 : 0 })),
  );
  return { serviceId: "hawker", placeId: "p1", weekday, source: "modeled" };
}

const fri18 = new Date(2026, 4, 22, 18, 0, 0);
const fri10 = new Date(2026, 4, 22, 10, 0, 0);

describe("connectorCrowdPenalty", () => {
  it("is high for a connector next to a busy venue at peak hour", () => {
    const p = connectorCrowdPenalty([22, 23], "L1", [hawker()], [L1], [busyAt18()], fri18);
    expect(p).toBeCloseTo(CROWD_WEIGHT_M); // busyness 1.0 * weight
  });

  it("is ~0 when the venue is far away", () => {
    const p = connectorCrowdPenalty([90, 90], "L1", [hawker()], [L1], [busyAt18()], fri18);
    expect(p).toBe(0);
  });

  it("is ~0 off-peak even when adjacent", () => {
    const p = connectorCrowdPenalty([22, 23], "L1", [hawker()], [L1], [busyAt18()], fri10);
    expect(p).toBe(0);
  });

  it("ignores venues on a different floor", () => {
    const p = connectorCrowdPenalty([22, 23], "L2", [hawker()], [L1], [busyAt18()], fri18);
    expect(p).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/routing/crowdPenalty.test.ts`
Expected: FAIL — "Failed to resolve import './crowdPenalty'".

- [ ] **Step 3: Write minimal implementation**

```ts
// src/routing/crowdPenalty.ts
import type { Floor, FloorId, PopularTimesEntry, Pt, Service } from "@/data/types";
import { busynessNow } from "@/enrichment/popularTimes";
import { serviceLocation } from "./buildRoute";

// How close (metres) a venue must be to a connector to crowd it, and how many
// metres of "extra walking" a fully-busy (1.0) neighbour adds to that connector's
// cost. Tunable to guarantee the demo route flips — see Task 8.
export const CROWD_RADIUS_M = 12;
export const CROWD_WEIGHT_M = 40;

function dist(a: Pt, b: Pt): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

/**
 * Crowd cost (in metres-equivalent) for a connector at `point` on `floorId`:
 * the busyness of the busiest venue within CROWD_RADIUS_M on the same floor,
 * scaled by CROWD_WEIGHT_M. 0 when nothing nearby is busy.
 */
export function connectorCrowdPenalty(
  point: Pt,
  floorId: FloorId,
  services: Service[],
  floors: Floor[],
  popularTimes: PopularTimesEntry[],
  now: Date,
  radiusM = CROWD_RADIUS_M,
  weightM = CROWD_WEIGHT_M,
): number {
  let maxBusy = 0;
  for (const svc of services) {
    const loc = serviceLocation(svc, floors);
    if (!loc || loc.floorId !== floorId) continue;
    if (dist(loc.point, point) > radiusM) continue;
    const b = busynessNow(svc.id, popularTimes, now);
    if (b !== null && b > maxBusy) maxBusy = b;
  }
  return maxBusy * weightM;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/routing/crowdPenalty.test.ts`
Expected: PASS (4 assertions).

- [ ] **Step 5: Commit**

```bash
git add src/routing/crowdPenalty.ts src/routing/crowdPenalty.test.ts
git commit -m "feat(routing): connectorCrowdPenalty scores connectors by nearby venue busyness"
```

---

## Task 5: pickConnector honours an injected penalty

**Files:**
- Modify: `src/routing/buildRoute.ts`
- Test: `src/routing/buildRoute.test.ts` (create)

- [ ] **Step 1: Write the failing test**

```ts
// src/routing/buildRoute.test.ts
import { describe, expect, it } from "vitest";
import type { Floor, Pt, Service } from "@/data/types";
import { buildRoute } from "./buildRoute";

// L1 with two lifts: "near" (close to start) and "far".
const L1: Floor = {
  id: "L1",
  bounds: { width: 100, depth: 100 },
  polygons: [
    { id: "lift-near", type: "room", heightMeters: 3, points: [[18, 8], [22, 8], [22, 12], [18, 12]] }, // center [20,10]
    { id: "lift-far",  type: "room", heightMeters: 3, points: [[58, 8], [62, 8], [62, 12], [58, 12]] }, // center [60,10]
  ],
};
const L2: Floor = {
  id: "L2",
  bounds: { width: 100, depth: 100 },
  polygons: [
    { id: "lift-near", type: "room", heightMeters: 3, points: [[18, 8], [22, 8], [22, 12], [18, 12]] },
    { id: "lift-far",  type: "room", heightMeters: 3, points: [[58, 8], [62, 8], [62, 12], [58, 12]] },
    { id: "L2-room-dest", type: "room", heightMeters: 3, points: [[38, 78], [42, 78], [42, 82], [38, 82]] }, // center [40,80]
  ],
};

function dest(): Service {
  return {
    id: "dest", nameEn: "Dest", nameZh: "目的地", providerName: "P",
    category: "government", routable: true, displayFloor: "L2",
    floorId: "L2", roomId: "L2-room-dest",
    accessibility: { liftAccess: true, stepFreeRoute: true },
    sourceUrl: "https://example.com", iconKey: "info",
  };
}

const start = { floorId: "L1" as const, point: [20, 14] as Pt }; // hard by lift-near

function liftUsed(steps: { point: Pt }[]): "near" | "far" {
  // The transition waypoint is step index 1 (start, transition, ...).
  const t = steps[1].point;
  return Math.hypot(t[0] - 20, t[1] - 10) < Math.hypot(t[0] - 60, t[1] - 10) ? "near" : "far";
}

describe("buildRoute connector penalty", () => {
  it("with no penalty, picks the nearer lift", () => {
    const v = buildRoute(start, dest(), "stepFree", [L1, L2])!;
    expect(liftUsed(v.steps)).toBe("near");
  });

  it("a heavy penalty on the near lift flips the choice to the far one", () => {
    // Penalty: +500m to any connector within 5m of lift-near's center [20,10].
    const penalty = (p: Pt) => (Math.hypot(p[0] - 20, p[1] - 10) < 5 ? 500 : 0);
    const v = buildRoute(start, dest(), "stepFree", [L1, L2], {}, {}, penalty)!;
    expect(liftUsed(v.steps)).toBe("far");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/routing/buildRoute.test.ts`
Expected: FAIL — the 7th `buildRoute` argument is not accepted / penalty ignored, so the second test still picks "near".

- [ ] **Step 3: Thread the penalty through buildRoute → pickConnector**

In `src/routing/buildRoute.ts`:

Change the `pickConnector` signature (line 113) to add a final param, and use it in the scoring loop. Replace the scoring loop body (lines 150-160) so the total includes the penalty:

```ts
function pickConnector(
  floors: Floor[],
  startFloor: FloorId,
  startPoint: Pt,
  destFloor: FloorId,
  dest: Pt,
  profile: AccessibilityProfile,
  destRoomId?: string,
  connectorPenalty: (point: Pt, floorId: FloorId) => number = () => 0,
): Connector | null {
```

Then in the loop that scores `pre` (around lines 150-160), replace:

```ts
  let best: Connector | null = null;
  let bestLen = Infinity;
  for (const { c } of pre) {
    const startLeg = sf ? pathLength(findPath(startPoint, c.point, sf)) : dist(startPoint, c.point);
    const destLeg = df ? pathLength(findPath(c.point, dest, df, destRoomId)) : dist(c.point, dest);
    const total = startLeg + destLeg + connectorPenalty(c.point, c.floorId);
    if (total < bestLen) {
      bestLen = total;
      best = c;
    }
  }
```

Add the param to `buildRoute`'s signature (after `loads` on line 262):

```ts
  loads: Record<string, number> = {},
  connectorPenalty: (point: Pt, floorId: FloorId) => number = () => 0,
): RouteVariant | null {
```

And pass it through at the `pickConnector` call site (line 317-318):

```ts
    const connector =
      pickConnector(floors, start.floorId, start.point, destFloorId, dest, profile, service.roomId, connectorPenalty) ??
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/routing/buildRoute.test.ts src/routing/journeyChaining.test.ts`
Expected: both files PASS (new penalty tests + existing journey-chaining tests all green — the default-noop keeps old behaviour).

- [ ] **Step 5: Commit**

```bash
git add src/routing/buildRoute.ts src/routing/buildRoute.test.ts
git commit -m "feat(routing): pickConnector accepts an injected crowd penalty (default noop)"
```

---

## Task 6: App wires the penalty + re-routes on time change

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Add imports**

After the existing `buildRoute` import (line 13) add:

```ts
import { connectorCrowdPenalty } from "@/routing/crowdPenalty";
import { simDate } from "@/enrichment/simClock";
import type { Pt, FloorId } from "@/data/types";
```

(If `Pt`/`FloorId` are already imported via the existing `@/data/types` import on line 17, add them to that import instead of a new line.)

- [ ] **Step 2: Add a penalty-closure helper above `export default function App()`**

```ts
/** A connector-crowd penalty bound to the current catalog + the toggled time. */
function currentConnectorPenalty(): (point: Pt, floorId: FloorId) => number {
  const st = useStore.getState();
  const now = simDate(st.timeOfDay);
  return (point, floorId) =>
    connectorCrowdPenalty(point, floorId, st.services, st.floors, st.popularTimes, now);
}
```

- [ ] **Step 3: Pass the penalty into every buildRoute call**

In the profile-rebuild effect (line 112-119), add the penalty as the last arg:

```ts
    const rebuilt = buildRoute(
      { floorId: start.floorId, point: start.point },
      svc,
      profile,
      st.floors,
      st.entrances,
      st.counterLoads,
      currentConnectorPenalty(),
    );
```

In `onPickService` (line 136), change to:

```ts
      const variant = buildRoute(start, svc, profile, floors, entrances, loads, currentConnectorPenalty());
```

- [ ] **Step 4: Add a re-route-on-time-change effect**

Add `const timeOfDay = useStore(s => s.timeOfDay);` next to the other `useStore` selectors (around line 77). Then add this effect right after the profile-rebuild effect (after line 124), mirroring it:

```ts
  // Toggling the Time control re-routes the active route from the current leg's
  // start, so the path visibly bends around the new crowd picture.
  const prevTime = useRef(timeOfDay);
  useEffect(() => {
    if (prevTime.current === timeOfDay) return;
    prevTime.current = timeOfDay;
    const st = useStore.getState();
    const route = st.activeRoute;
    if (!route) return;
    const svc = st.services.find(s => s.id === route.variant.serviceId);
    const start = route.variant.steps[0];
    if (!svc || !start) return;
    const rebuilt = buildRoute(
      { floorId: start.floorId, point: start.point },
      svc,
      st.profile,
      st.floors,
      st.entrances,
      st.counterLoads,
      currentConnectorPenalty(),
    );
    if (rebuilt) {
      st.setActiveFloor(rebuilt.steps[0].floorId);
      st.startRoute(rebuilt);
    }
  }, [timeOfDay]);
```

- [ ] **Step 5: Verify typecheck + full test run**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no new type errors; all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx
git commit -m "feat(app): crowd-penalised routing + re-route when the time toggle changes"
```

---

## Task 7: Relabel the time control + swap the demo button

**Files:**
- Modify: `src/ui/FloorSelector.tsx`
- Modify: `src/App.tsx`
- Modify: `src/ui/PromptPanel.tsx`
- Modify: `src/ui/IntentEntry.tsx`

- [ ] **Step 1: Relabel the time control**

In `src/ui/FloorSelector.tsx:178`, change the `OptionRow` label from `"Daylight"` to `"Time"`:

```tsx
            label="Time"
```

- [ ] **Step 2: Replace `onReceiveJourney` with `onRoutingDemo` in App**

In `src/App.tsx`, replace the whole `onReceiveJourney` callback (lines 292-340) with:

```ts
  // DEMO: preset a crowd-sensitive single route so we can show the time toggle
  // bending the path. Start on the leisure (hawker) side of L1, route up to the
  // HDB branch on L2; presets the time to "evening" (leisure peak) so the crowd
  // effect is visible on first press — the presenter then toggles Time to show
  // the connector choice flip. NOTE (Task 8): verify this start/dest actually
  // flips against the real geometry and adjust the ids/anchor if not.
  const onRoutingDemo = useCallback(() => {
    const st = useStore.getState();
    const anchorSvc = st.services.find(s => s.id === "hawker");
    const anchor = anchorSvc ? serviceLocation(anchorSvc, st.floors) : null;
    const start = anchor
      ? { floorId: anchor.floorId, point: anchor.point }
      : DEFAULT_START;
    st.setUserLocation(start);
    st.setTimeOfDay("evening");
    onPickService("hdb");
  }, [onPickService]);
```

Add `serviceLocation` to the `buildRoute` import (line 13):

```ts
import { buildRoute, DEFAULT_START, routeArrivalLocation, serviceLocation } from "@/routing/buildRoute";
```

Update the `PromptPanel` prop (line 416) from `onReceiveJourney={onReceiveJourney}` to:

```tsx
              onRoutingDemo={onRoutingDemo}
```

- [ ] **Step 3: Rename the prop in PromptPanel**

In `src/ui/PromptPanel.tsx`: rename `onReceiveJourney` → `onRoutingDemo` in the destructure (line 20), the prop type (line 28), and the `IntentEntry` usage (line 75):

```tsx
  onRoutingDemo,
```
```tsx
  onRoutingDemo?: () => void;
```
```tsx
      <IntentEntry onSubmit={onSubmitIntent} onRoutingDemo={onRoutingDemo} />,
```

- [ ] **Step 4: Rename the prop + relabel the button in IntentEntry**

In `src/ui/IntentEntry.tsx`: rename `onReceiveJourney` → `onRoutingDemo` in the destructure (line 8), prop type (line 13), the guard (line 39), the `onClick` (line 42), and change the button label (line 46):

```tsx
  onRoutingDemo,
```
```tsx
  onRoutingDemo?: () => void;
```
```tsx
      {onRoutingDemo && (
```
```tsx
          onClick={onRoutingDemo}
```
```tsx
          {language === "zh" ? "演示路线逻辑" : "Show routing logic"}
```

- [ ] **Step 5: Verify typecheck + tests**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no type errors (no dangling `onReceiveJourney`); all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/ui/FloorSelector.tsx src/App.tsx src/ui/PromptPanel.tsx src/ui/IntentEntry.tsx
git commit -m "feat(ui): rename time control to Time; demo button presets a crowd-sensitive route"
```

---

## Task 8: Manual verification + tuning gate (make-or-break)

**Files:** none by default; possibly `src/routing/crowdPenalty.ts` (constants) or `public/data/popular-times.json` (one curve) if tuning is needed.

- [ ] **Step 1: Run the app**

Run: `npm run dev` and open the local URL.

- [ ] **Step 2: Trigger the demo + confirm the flip**

Press **"Show routing logic"**. Note which connector (lift/escalator) the route uses. Open the FloorSelector popover and toggle **Time** between evening and morning.

Expected: the drawn path visibly changes which connector it uses between two of the time states. **If the path does not visibly change, the feature is not done — continue to Step 3.**

- [ ] **Step 3: Tune if it does not flip**

In order of preference:
1. Raise `CROWD_WEIGHT_M` (e.g. 40 → 80) and/or adjust `CROWD_RADIUS_M` in `src/routing/crowdPenalty.ts` so a busy neighbour outweighs the distance gap between the two competing connectors.
2. Change the demo `start`/`dest` ids in `onRoutingDemo` to a pair with two genuinely competing connectors (e.g. a different L1→L2 origin nearer two connectors).
3. As a last resort, nudge one venue's evening curve in `public/data/popular-times.json` (already simulated, demo-dated data).

Re-run Step 2 after each change until the flip is visible. Commit any tuning:

```bash
git add -A
git commit -m "chore: tune crowd-routing constants/preset so the demo route flips"
```

- [ ] **Step 4: Fallback (only if real geometry stubbornly won't flip in time)**

Replace the body of `connectorCrowdPenalty` with hand-tuned per-connector values keyed to time-of-day (match the connector by rounded coordinates), keeping the same signature so nothing else changes. This guarantees a flip with the same UI. Commit:

```bash
git add src/routing/crowdPenalty.ts
git commit -m "chore: hand-tuned connector crowd fallback to guarantee the demo flip"
```

---

## Self-Review notes

- **Spec coverage:** §1 time→busyness = Tasks 1-3 + Task 7 relabel; §2 connector penalty = Tasks 4-5 + App wiring Task 6; §3 demo button = Task 7; §4 tests/verification = test steps throughout + Task 8 gate; risk/fallback = Task 8 Step 4.
- **Type consistency:** `connectorCrowdPenalty(point, floorId, services, floors, popularTimes, now, radiusM?, weightM?)` and the injected `connectorPenalty: (point: Pt, floorId: FloorId) => number` match across Tasks 4, 5, 6. `setTimeOfDay(t: TimeOfDay)` defined in Task 2, used in Task 7. `simDate`/`simHour` defined in Task 1, used in Tasks 3 and 6.
- **Re-route effect** added in Task 6 is the piece that makes the on-screen flip happen while a route is active (mirrors the existing profile-rebuild effect).
