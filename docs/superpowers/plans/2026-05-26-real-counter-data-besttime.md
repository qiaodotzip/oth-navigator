# Real Counter Data (BestTime) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace estimated counter-busyness curves with real BestTime.app foot-traffic where a venue resolves, keeping the existing estimated curves as a labeled fallback, and surface honest provenance ("real" vs "estimated") in the UI.

**Architecture:** A pure normalizer (`besttime-normalize.ts`, unit-tested) converts a BestTime forecast response into our existing `PopularTimesEntry` shape tagged `source:"forecast"`. A thin I/O script (`besttime.ts`) fetches per-venue and **upserts** into the committed `public/data/popular-times.json` produced by the existing `build-curves.ts` (which we retag `source:"modeled"`). Runtime is unchanged — `App.tsx` already loads that file and `counterLoads.ts` already consumes it; we only add a `source` field and a badge label.

**Tech Stack:** TypeScript, tsx (Node scripts), Vitest, Zustand, React Three Fiber (`drei` `Html` badges), BestTime.app REST API, dotenv.

**Context discovered (read before starting):**
- `PopularTimesEntry` (`src/data/types.ts:130`) currently has `placeId: string` + `estimated?: boolean`. `estimated` is **dead** (declared, never read). `placeId` is used only in the type + `popularTimes.test.ts`.
- `popular-times.json` is **already generated** by `scripts/popular-times/build-curves.ts` from `oth-services.csv` and **already loaded** at runtime (`src/App.tsx:64-69`). We are enhancing this pipeline, not creating it.
- Counter services (from `public/data/services.json`): `psc, servicesg, cpf, hdb, library, theatre, hawker, community-centre`. Curve `serviceId` must match these to affect a counter.
- BestTime day indexing is `day_int` 0=Mon…6=Sun; JS `getDay()` is 0=Sun…6=Sat. The normalizer must remap.

---

### Task 1: Add `source` provenance to the busyness type

**Files:**
- Modify: `src/data/types.ts:128-137`
- Modify (test fixtures): `src/enrichment/popularTimes.test.ts:5-10`, `:33-40`

- [ ] **Step 1: Update the type**

Replace the existing `PopularTimesHour` / `PopularTimesEntry` block (`src/data/types.ts:128-137`) with:

```ts
export type PopularTimesHour = { hour: number; busyness: number };

/** Where a busyness curve came from. "live"=current BestTime reading,
 *  "forecast"=BestTime weekly forecast, "modeled"=our category heuristic. */
export type BusynessSource = "live" | "forecast" | "modeled";

export type PopularTimesEntry = {
  serviceId: string;
  /** BestTime venue_id or legacy Google place id; absent for modeled curves. */
  placeId?: string;
  placeName?: string;
  weekday: PopularTimesHour[][];
  currentPopularity?: number;
  source: BusynessSource;
};
```

- [ ] **Step 2: Fix the existing test fixtures to satisfy the required `source`**

In `src/enrichment/popularTimes.test.ts`, update `makeEntry` (line ~9) return to include `source` and drop the now-removed `placeId` requirement is unchanged (still optional):

```ts
  return { serviceId: "library", placeId: "p1", weekday, source: "modeled" };
```

And the `partial` entry (line ~33-37):

```ts
    const partial: PopularTimesEntry = {
      serviceId: "library",
      placeId: "p1",
      weekday: [[], [], [], [], [], [], []],
      source: "modeled",
    };
```

- [ ] **Step 3: Run typecheck + the existing busyness test**

Run: `npx tsc --noEmit && npx vitest run src/enrichment/popularTimes.test.ts`
Expected: tsc clean; 4 tests PASS.

- [ ] **Step 4: Commit**

```bash
git add src/data/types.ts src/enrichment/popularTimes.test.ts
git commit -m "feat: add BusynessSource provenance to PopularTimesEntry"
```

---

### Task 2: `busynessSourceFor` helper (provenance lookup)

**Files:**
- Modify: `src/enrichment/popularTimes.ts`
- Modify: `src/enrichment/popularTimes.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/enrichment/popularTimes.test.ts`:

```ts
import { busynessSourceFor } from "./popularTimes";

describe("busynessSourceFor", () => {
  it("returns the entry's source", () => {
    const data: PopularTimesEntry[] = [
      { serviceId: "hdb", weekday: [], source: "forecast" },
    ];
    expect(busynessSourceFor("hdb", data)).toBe("forecast");
  });

  it("returns null when no entry exists", () => {
    expect(busynessSourceFor("nope", [])).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/enrichment/popularTimes.test.ts`
Expected: FAIL — `busynessSourceFor is not a function`.

- [ ] **Step 3: Implement the helper**

Append to `src/enrichment/popularTimes.ts`:

```ts
import type { BusynessSource } from "@/data/types";

/** Provenance of a service's busyness curve, for honest UI labeling. */
export function busynessSourceFor(
  serviceId: string,
  entries: PopularTimesEntry[],
): BusynessSource | null {
  const entry = entries.find(e => e.serviceId === serviceId);
  return entry?.source ?? null;
}
```

(Note: `PopularTimesEntry` is already imported at the top of the file; add `BusynessSource` to that existing import instead of a second line if you prefer — both compile.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/enrichment/popularTimes.test.ts`
Expected: 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/enrichment/popularTimes.ts src/enrichment/popularTimes.test.ts
git commit -m "feat: busynessSourceFor provenance lookup"
```

---

### Task 3: Retag generated curves as `source:"modeled"` and regenerate

**Files:**
- Modify: `scripts/popular-times/build-curves.ts:169-174`
- Regenerate: `public/data/popular-times.json`

- [ ] **Step 1: Change the emitted entry shape**

In `scripts/popular-times/build-curves.ts`, replace the `return { ... }` inside `.map` (lines ~169-174):

```ts
    return {
      serviceId: row.serviceId,
      placeName: row.name,
      source: "modeled" as const,
      weekday,
    };
```

(Removes `placeId: "estimated"` and `estimated: true`; adds `source` + `placeName`.)

- [ ] **Step 2: Regenerate the committed data file**

Run: `npm run build:popular-times`
Expected: `[done] wrote N estimated curves to .../popular-times.json` and a per-service peak list.

- [ ] **Step 3: Verify every entry now carries a modeled source**

Run: `node -e "const d=require('./public/data/popular-times.json'); console.log('entries',d.length,'missing source',d.filter(e=>!e.source).length,'sample',d[0].source)"`
Expected: `missing source 0`, sample `modeled`.

- [ ] **Step 4: Commit**

```bash
git add scripts/popular-times/build-curves.ts public/data/popular-times.json
git commit -m "chore: tag modeled busyness curves with source field"
```

---

### Task 4: BestTime forecast normalizer (pure, tested)

**Files:**
- Create: `scripts/popular-times/besttime-normalize.ts`
- Create: `scripts/popular-times/besttime-normalize.test.ts`

- [ ] **Step 1: Write the failing test**

Create `scripts/popular-times/besttime-normalize.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { normalizeBestTimeForecast, type BestTimeForecast } from "./besttime-normalize";

const raw: BestTimeForecast = {
  venue_info: { venue_id: "ven_123", venue_name: "HDB Tampines Branch" },
  analysis: [
    // day_int 0 = Monday -> JS index 1
    { day_info: { day_int: 0 }, day_raw: Array.from({ length: 24 }, (_, h) => (h === 10 ? 80 : 0)) },
    // day_int 6 = Sunday -> JS index 0
    { day_info: { day_int: 6 }, day_raw: Array.from({ length: 24 }, () => 50) },
  ],
};

describe("normalizeBestTimeForecast", () => {
  it("maps BestTime day_int to JS getDay and scales 0..100 -> 0..1", () => {
    const e = normalizeBestTimeForecast(raw, "hdb");
    expect(e.serviceId).toBe("hdb");
    expect(e.source).toBe("forecast");
    expect(e.placeId).toBe("ven_123");
    // Monday (jsIdx 1) hour 10 -> 0.8
    expect(e.weekday[1][10].busyness).toBeCloseTo(0.8);
    // Sunday (jsIdx 0) every hour -> 0.5
    expect(e.weekday[0][0].busyness).toBeCloseTo(0.5);
  });

  it("fills every day with 24 hours even if a day is missing", () => {
    const e = normalizeBestTimeForecast(raw, "hdb");
    expect(e.weekday).toHaveLength(7);
    e.weekday.forEach(day => expect(day).toHaveLength(24));
    // Tuesday (jsIdx 2) absent from input -> all zeros
    expect(e.weekday[2].every(h => h.busyness === 0)).toBe(true);
  });

  it("clamps out-of-range values", () => {
    const wild: BestTimeForecast = {
      analysis: [{ day_info: { day_int: 0 }, day_raw: [150, -10, ...Array(22).fill(0)] }],
    };
    const e = normalizeBestTimeForecast(wild, "x");
    expect(e.weekday[1][0].busyness).toBe(1);
    expect(e.weekday[1][1].busyness).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run scripts/popular-times/besttime-normalize.test.ts`
Expected: FAIL — cannot find module `./besttime-normalize`.

- [ ] **Step 3: Implement the normalizer**

Create `scripts/popular-times/besttime-normalize.ts`:

```ts
// Pure: BestTime forecast response -> our PopularTimesEntry shape.
// Type-only import (erased at runtime) so this also runs under tsx without
// the "@/" Vite alias.
import type { PopularTimesEntry, PopularTimesHour } from "../../src/data/types";

/** Subset of the BestTime /forecasts response we consume. */
export type BestTimeForecast = {
  analysis?: {
    day_info?: { day_int?: number }; // 0=Mon .. 6=Sun
    day_raw?: number[]; // hourly intensity 0..100
  }[];
  venue_info?: { venue_id?: string; venue_name?: string };
};

// BestTime day_int (0=Mon..6=Sun) -> JS getDay() (0=Sun..6=Sat)
const BT_TO_JS = [1, 2, 3, 4, 5, 6, 0];

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

export function normalizeBestTimeForecast(
  raw: BestTimeForecast,
  serviceId: string,
  opts: { dayStartHour?: number } = {},
): PopularTimesEntry {
  const dayStart = opts.dayStartHour ?? 0;
  const weekday: PopularTimesHour[][] = Array.from({ length: 7 }, () =>
    Array.from({ length: 24 }, (_, hour) => ({ hour, busyness: 0 })),
  );
  for (const day of raw.analysis ?? []) {
    const di = day.day_info?.day_int;
    if (di === undefined || di < 0 || di > 6) continue;
    const jsIdx = BT_TO_JS[di];
    (day.day_raw ?? []).forEach((v, i) => {
      const hour = dayStart + i;
      if (hour < 0 || hour > 23) return;
      weekday[jsIdx][hour] = { hour, busyness: clamp01((v ?? 0) / 100) };
    });
  }
  return {
    serviceId,
    placeId: raw.venue_info?.venue_id,
    placeName: raw.venue_info?.venue_name,
    weekday,
    source: "forecast",
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run scripts/popular-times/besttime-normalize.test.ts`
Expected: 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/popular-times/besttime-normalize.ts scripts/popular-times/besttime-normalize.test.ts
git commit -m "feat: BestTime forecast normalizer"
```

---

### Task 5: BestTime fetch + upsert script

**Files:**
- Create: `scripts/popular-times/venues.json`
- Create: `scripts/popular-times/besttime.ts`
- Modify: `package.json:14` (scripts block)
- Modify: `.env.example`

- [ ] **Step 1: Create the venue config**

Create `scripts/popular-times/venues.json` (keys MUST match `serviceId`s in `public/data/services.json`; names/addresses are best-effort and may need tuning if BestTime can't resolve a venue):

```json
{
  "_note": "serviceId -> BestTime venue. Address is the OTH street address; tune names if BestTime returns 'venue not found'.",
  "hdb": { "name": "HDB Tampines Branch", "address": "1 Tampines Walk, Singapore 528523" },
  "library": { "name": "Tampines Regional Library", "address": "1 Tampines Walk, Singapore 528523" },
  "servicesg": { "name": "ServiceSG Centre @ Our Tampines Hub", "address": "1 Tampines Walk, Singapore 528523" },
  "hawker": { "name": "Our Tampines Hub Hawker Centre", "address": "1 Tampines Walk, Singapore 528523" },
  "community-centre": { "name": "Our Tampines Hub", "address": "1 Tampines Walk, Singapore 528523" },
  "theatre": { "name": "Festive Arts Theatre Our Tampines Hub", "address": "1 Tampines Walk, Singapore 528523" }
}
```

- [ ] **Step 2: Add the npm script**

In `package.json`, add to the `scripts` block (after `build:popular-times`):

```json
    "build:popular-times:real": "tsx scripts/popular-times/besttime.ts",
```

- [ ] **Step 3: Add env keys**

Append to `.env.example`:

```
# BestTime.app foot-traffic API (https://besttime.app). Free tier.
# Private key creates/refreshes forecasts; public key reads live busyness.
BESTTIME_API_KEY_PRIVATE=pri_...
BESTTIME_API_KEY_PUBLIC=pub_...
```

- [ ] **Step 4: Implement the script**

Create `scripts/popular-times/besttime.ts`:

```ts
/**
 * Fetch real foot-traffic from BestTime.app for OTH counter services and
 * UPSERT into public/data/popular-times.json (which build-curves.ts seeds with
 * modeled curves). Real forecasts win for venues that resolve; every other
 * service keeps its modeled curve. Never throws per-venue — a failed venue is
 * logged and skipped, leaving its modeled fallback intact.
 *
 * Run: npm run build:popular-times:real   (after npm run build:popular-times)
 * Requires BESTTIME_API_KEY_PRIVATE in .env (BESTTIME_API_KEY_PUBLIC for live).
 *
 * Pass --debug to dump the first raw forecast response to
 * scripts/popular-times/.besttime-raw.json so you can verify the API shape
 * against besttime-normalize.ts before trusting it.
 */
import "dotenv/config";
import { promises as fs } from "node:fs";
import path from "node:path";
import { normalizeBestTimeForecast, type BestTimeForecast } from "./besttime-normalize";
import type { PopularTimesEntry } from "../../src/data/types";

const ROOT = process.cwd();
const VENUES = path.join(ROOT, "scripts", "popular-times", "venues.json");
const OUTPUT = path.join(ROOT, "public", "data", "popular-times.json");
const RAW_DUMP = path.join(ROOT, "scripts", "popular-times", ".besttime-raw.json");

const PRIVATE = process.env.BESTTIME_API_KEY_PRIVATE;
const PUBLIC = process.env.BESTTIME_API_KEY_PUBLIC;
const DEBUG = process.argv.includes("--debug");

type Venue = { name: string; address: string };

async function fetchForecast(v: Venue): Promise<BestTimeForecast | null> {
  const url = new URL("https://besttime.app/api/v1/forecasts");
  url.searchParams.set("api_key_private", PRIVATE!);
  url.searchParams.set("venue_name", v.name);
  url.searchParams.set("venue_address", v.address);
  const res = await fetch(url, { method: "POST" });
  if (!res.ok) {
    console.warn(`  [warn] forecast HTTP ${res.status} for "${v.name}"`);
    return null;
  }
  return (await res.json()) as BestTimeForecast;
}

async function fetchLive(venueId: string): Promise<number | null> {
  if (!PUBLIC) return null;
  const url = new URL("https://besttime.app/api/v1/forecasts/live");
  url.searchParams.set("api_key_public", PUBLIC);
  url.searchParams.set("venue_id", venueId);
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = (await res.json()) as {
    analysis?: { venue_live_busyness?: number; venue_forecasted_busyness?: number };
  };
  const live = data.analysis?.venue_live_busyness ?? data.analysis?.venue_forecasted_busyness;
  return typeof live === "number" ? Math.max(0, Math.min(1, live / 100)) : null;
}

async function main(): Promise<number> {
  if (!PRIVATE) {
    console.error("BESTTIME_API_KEY_PRIVATE not set. Copy .env.example -> .env and fill it in.");
    return 1;
  }
  const venues = JSON.parse(await fs.readFile(VENUES, "utf8")) as Record<string, Venue | string>;
  const existing = JSON.parse(await fs.readFile(OUTPUT, "utf8")) as PopularTimesEntry[];
  const byId = new Map(existing.map(e => [e.serviceId, e]));

  let dumped = false;
  let real = 0;
  for (const [serviceId, v] of Object.entries(venues)) {
    if (serviceId.startsWith("_") || typeof v === "string") continue;
    console.log(`[fetch] ${serviceId} — ${v.name}`);
    try {
      const raw = await fetchForecast(v);
      if (!raw) continue;
      if (DEBUG && !dumped) {
        await fs.writeFile(RAW_DUMP, JSON.stringify(raw, null, 2), "utf8");
        console.log(`  [debug] raw response written to ${RAW_DUMP}`);
        dumped = true;
      }
      const entry = normalizeBestTimeForecast(raw, serviceId);
      const venueId = entry.placeId;
      if (venueId) {
        const live = await fetchLive(venueId);
        if (live !== null) {
          entry.currentPopularity = live;
          entry.source = "live";
        }
      }
      byId.set(serviceId, entry); // upsert: real overwrites modeled
      real++;
      console.log(`  [ok] ${serviceId}: source=${entry.source}`);
    } catch (err) {
      console.warn(`  [warn] ${serviceId}: ${(err as Error).message} — keeping modeled curve`);
    }
  }

  const merged = Array.from(byId.values());
  await fs.writeFile(OUTPUT, JSON.stringify(merged, null, 2), "utf8");
  console.log(`[done] ${real} real / ${merged.length} total entries -> ${OUTPUT}`);
  return 0;
}

main().then(code => process.exit(code)).catch(err => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 5: Verify the script wiring without a key (graceful exit)**

Run: `npm run build:popular-times:real`
Expected (no key in `.env`): prints `BESTTIME_API_KEY_PRIVATE not set...` and exits non-zero **without** corrupting `popular-times.json` (the file is only written after a successful run). Confirm the file is unchanged: `git status --short public/data/popular-times.json` shows no change.

- [ ] **Step 6: (Manual, when a key is available) capture + verify real shape**

With keys in `.env`, run: `npx tsx scripts/popular-times/besttime.ts --debug`
Inspect `scripts/popular-times/.besttime-raw.json` and confirm `analysis[].day_info.day_int` and `analysis[].day_raw` match `besttime-normalize.ts`. If `day_raw` is shorter than 24 or offset, pass `dayStartHour` in `normalizeBestTimeForecast` and re-run. Then verify: `node -e "const d=require('./public/data/popular-times.json'); console.log(d.filter(e=>e.source!=='modeled').map(e=>e.serviceId+':'+e.source))"`.

- [ ] **Step 7: Commit (script + config; do NOT commit .env or the raw dump)**

Add `scripts/popular-times/.besttime-raw.json` to `.gitignore` first:

```
scripts/popular-times/.besttime-raw.json
```

```bash
git add scripts/popular-times/besttime.ts scripts/popular-times/venues.json package.json .env.example .gitignore
git commit -m "feat: BestTime real foot-traffic fetch + upsert script"
```

---

### Task 6: Provenance label on the counter badge

**Files:**
- Modify: `src/world/CounterBadge.tsx`

- [ ] **Step 1: Read provenance + render a label**

Replace the body of `CounterBadges` in `src/world/CounterBadge.tsx` so it reads `popularTimes` and shows a small honest tag. Full file:

```tsx
import { Html } from "@react-three/drei";
import { useStore } from "@/store";
import { busynessSourceFor } from "@/enrichment/popularTimes";
import type { BusynessSource, Service, Floor } from "@/data/types";

const SOURCE_LABEL: Record<BusynessSource, string> = {
  live: "live now",
  forecast: "typical (real data)",
  modeled: "typical (estimated)",
};

export function CounterBadges({ floor }: { floor: Floor }) {
  const services = useStore(s => s.services);
  const counterLoads = useStore(s => s.counterLoads);
  const popularTimes = useStore(s => s.popularTimes);
  const onFloor = services.filter((s: Service) => s.floorId === floor.id);
  return (
    <>
      {onFloor.map(svc => {
        const poly = floor.polygons.find(p => p.id === svc.roomId);
        if (!poly) return null;
        const cx = poly.points.reduce((a, [x]) => a + x, 0) / poly.points.length;
        const cz = poly.points.reduce((a, [, z]) => a + z, 0) / poly.points.length;
        const x = cx - floor.bounds.width / 2;
        const z = cz - floor.bounds.depth / 2;
        const ids = svc.counterIds ?? [];
        const avg =
          ids.length === 0
            ? 0
            : ids.reduce((acc, id) => acc + (counterLoads[id] ?? 0), 0) / ids.length;
        const people = Math.round(avg * 12);
        const source = busynessSourceFor(svc.id, popularTimes);
        return (
          <Html key={svc.id} position={[x, 6, z]} center>
            <div className="px-2 py-0.5 rounded-full bg-oth-ink text-white whitespace-nowrap text-center">
              <div className="text-[10px] leading-tight">{people} waiting</div>
              {source && (
                <div className="text-[7px] leading-tight opacity-70">{SOURCE_LABEL[source]}</div>
              )}
            </div>
          </Html>
        );
      })}
    </>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Visual check**

Run: `npm run dev`, open the app, confirm counter badges show "N waiting" with a sub-label "typical (estimated)" (or "typical (real data)" / "live now" once BestTime data is in). No console errors.

- [ ] **Step 4: Commit**

```bash
git add src/world/CounterBadge.tsx
git commit -m "feat: show busyness provenance on counter badges"
```

---

### Task 7: Document the BestTime path + final check

**Files:**
- Modify: `scripts/popular-times/README.md`

- [ ] **Step 1: Add a BestTime section**

Insert after the "Primary: heuristic curves" section in `scripts/popular-times/README.md`:

```markdown
## Real foot-traffic: BestTime.app (preferred real source)

`besttime.ts` fetches real forecast (and optional live) foot-traffic from
[BestTime.app](https://besttime.app) and **upserts** it over the modeled curves,
tagging each entry `source: "forecast"` (or `"live"`). Modeled curves remain the
fallback for any venue BestTime can't resolve.

```
# 1. seed modeled curves (sets every entry source:"modeled")
npm run build:popular-times
# 2. overlay real data (needs BESTTIME_API_KEY_PRIVATE in .env)
npm run build:popular-times:real
```

Get free keys at besttime.app (Account → API keys). Edit
`scripts/popular-times/venues.json` to tune venue names/addresses. Run once with
`npx tsx scripts/popular-times/besttime.ts --debug` to dump and verify the raw
API shape. Government counters may not exist in BestTime's DB — those keep their
modeled curve, which is honest and labeled "(estimated)" in the UI.
```

- [ ] **Step 2: Full test + typecheck sweep**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all tests PASS, tsc clean.

- [ ] **Step 3: Commit**

```bash
git add scripts/popular-times/README.md
git commit -m "docs: BestTime real foot-traffic workflow"
```

---

## Notes for the next phase

- This plan does **not** wire `source` into narration or routing weighting — `selectRoute.ts` already picks the least-busy counter regardless of source, which is correct.
- Once real data is flowing, Phase 2 (open/closed status) and Phase 3 (transport) from the spec are the next plans.
- If BestTime resolves zero government venues, the demo story is still honest: "real foot-traffic where available (e.g. library/hawker), modeled elsewhere, all labeled" — which matches the PRD's no-fabrication principle.
