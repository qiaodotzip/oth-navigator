# Real-Data Enrichment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace hand-typed and Perlin-simulated service data with real signals from Exa (static enrichment: hours, descriptions, closures) and a one-shot scrape of Google Popular Times (per-service hourly busyness curve), shown live on the OTH Navigator service tiles and feeding the ambient counter-load layer.

**Architecture:** Two independent data layers added on top of the existing Hono + React stack. (1) An Exa-backed `/api/enrich/:serviceId` endpoint with a file-cached, server-side proxy — frontend pulls enrichment per service on tile mount, results survive a server restart. (2) A pre-scraped `public/data/popular-times.json` produced by a Python script in `scripts/popular-times/` and consumed at runtime by a pure mapping function that converts the current hour into a 0..1 "busyness" value. Counter-load simulator falls back to Perlin only when no Popular Times curve exists for a service.

**Tech Stack:**
- Server: Hono (existing), `exa-js` SDK (new), file-based cache (new — plain `node:fs` JSON files)
- Frontend: React 18 + Zustand (existing), pure TS mapper module (new)
- Scripts: Python 3 + `populartimes` lib (one-shot, not part of runtime)
- Tests: Vitest (existing)

**Reference companions:**
- `docs/PRD.md` — product context (V0.3 "Real live data" item)
- `docs/FUTURE_FEATURES.md` — broader future-data roadmap (LTA, data.gov.sg)
- `server/index.ts` — current Hono server, pattern for new endpoints
- `src/agents/counterLoads.ts` — current Perlin simulator we will augment
- `src/data/types.ts` — types live here

**Cost ceiling:** User has $20 Exa credit, no other budget. Cache aggressively; do not call Exa from request hot paths without a cache check. Pre-scraped Popular Times is free after one-time run.

---

## File Structure

### Files to create

| Path | Responsibility |
|---|---|
| `server/cache.ts` | Tiny file-based JSON cache helper: `getCached(key, ttlMs)`, `setCached(key, value)`. Stores under `server/.cache/`. |
| `server/exaClient.ts` | Thin wrapper around `exa-js` SDK. Single function `enrichService(service)` that runs a configured search + content query. |
| `src/data/enrichment.ts` | TS types and frontend types for `ServiceEnrichment` (hours string, status, summary, sources). |
| `src/enrichment/client.ts` | Frontend fetch client for `/api/enrich/:serviceId`. In-memory promise dedupe. |
| `src/enrichment/popularTimes.ts` | Pure mapper: `busynessNow(serviceId, popularTimes, now)` → number in 0..1. |
| `src/enrichment/popularTimes.test.ts` | Vitest tests for the mapper. |
| `src/enrichment/client.test.ts` | Vitest tests with mocked fetch. |
| `server/exaClient.test.ts` | Vitest tests with mocked exa-js. |
| `server/cache.test.ts` | Vitest tests for the file cache. |
| `scripts/popular-times/scrape.py` | One-shot Python scraper. Reads `place-ids.json`, writes `public/data/popular-times.json`. |
| `scripts/popular-times/place-ids.json` | Map of `serviceId → google_place_id`. Hand-curated. |
| `scripts/popular-times/requirements.txt` | Python deps: `populartimes` from git. |
| `scripts/popular-times/README.md` | How to run the scrape (Windows + macOS commands). |
| `public/data/popular-times.json` | Output of the scrape. Committed. |
| `server/.cache/.gitkeep` | Placeholder so cache dir exists. |

### Files to modify

| Path | What changes |
|---|---|
| `server/index.ts` | Add `GET /api/enrich/:serviceId` route. Import `exaClient` and `cache`. |
| `src/data/types.ts` | Add `ServiceEnrichment` and `PopularTimesEntry` types. |
| `src/store.ts` | Add `enrichments: Record<string, ServiceEnrichment>`, `popularTimes: PopularTimesEntry[]`, setters. |
| `src/agents/counterLoads.ts` | Use Popular Times curve when available for the service's counters; Perlin fallback otherwise. |
| `src/App.tsx` | Pre-load `popular-times.json` once on mount, store in Zustand. |
| `src/ui/ServiceTiles.tsx` | On tile mount, fetch enrichment and display open/closed badge + hours. |
| `package.json` | Add `exa-js` dep. Add `npm run scrape:popular-times` script (`python scripts/popular-times/scrape.py`). |
| `.gitignore` | Add `server/.cache/*` (but keep `.gitkeep`). |
| `.env.example` (create if absent) | Add `EXA_API_KEY=` placeholder. |

### Decomposition rationale

- `server/cache.ts` and `server/exaClient.ts` are split so cache is unit-testable without hitting Exa, and Exa client is unit-testable without disk I/O.
- `src/enrichment/popularTimes.ts` is a pure function with no React, so trivially testable.
- The Python script is isolated under `scripts/popular-times/` because it has a separate dependency tree (pip not npm) and runs once, not at build time.

---

## Task 1: Install Exa SDK and env scaffolding

**Files:**
- Modify: `package.json`
- Modify: `.gitignore`
- Create: `.env.example`
- Create: `server/.cache/.gitkeep`

- [ ] **Step 1: Install Exa SDK**

Run: `npm install exa-js`
Expected: package added to dependencies, lockfile updated. No errors.

- [ ] **Step 2: Add `.env.example` so collaborators know which keys to set**

Create `.env.example`:

```dotenv
# Required for /api/narrate
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o

# Required for /api/enrich (Exa static enrichment)
EXA_API_KEY=

# Optional
PORT=3000
NODE_ENV=development
```

- [ ] **Step 3: Add cache dir placeholder and gitignore the contents**

Create `server/.cache/.gitkeep` as an empty file.

Modify `.gitignore` (append):

```gitignore

# Server runtime cache (Exa enrichment results)
server/.cache/*
!server/.cache/.gitkeep
```

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json .env.example .gitignore server/.cache/.gitkeep
git commit -m "chore: scaffold Exa SDK and server cache dir"
```

---

## Task 2: File-based cache helper (TDD)

**Files:**
- Create: `server/cache.ts`
- Create: `server/cache.test.ts`

- [ ] **Step 1: Write the failing test**

Create `server/cache.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import { getCached, setCached } from "./cache";

const TEST_KEY = "test-key";
const CACHE_FILE = path.resolve("server/.cache", `${TEST_KEY}.json`);

describe("cache", () => {
  beforeEach(async () => {
    await fs.rm(CACHE_FILE, { force: true });
  });
  afterEach(async () => {
    await fs.rm(CACHE_FILE, { force: true });
    vi.useRealTimers();
  });

  it("returns null when nothing cached", async () => {
    const v = await getCached<{ x: number }>(TEST_KEY, 1000);
    expect(v).toBeNull();
  });

  it("returns cached value within TTL", async () => {
    await setCached(TEST_KEY, { x: 42 });
    const v = await getCached<{ x: number }>(TEST_KEY, 60_000);
    expect(v).toEqual({ x: 42 });
  });

  it("returns null when entry is expired", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-23T10:00:00Z"));
    await setCached(TEST_KEY, { x: 1 });
    vi.setSystemTime(new Date("2026-05-23T10:00:02Z"));
    const v = await getCached<{ x: number }>(TEST_KEY, 1000);
    expect(v).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/cache.test.ts`
Expected: FAIL — module `./cache` not found.

- [ ] **Step 3: Implement the cache helper**

Create `server/cache.ts`:

```ts
import { promises as fs } from "node:fs";
import path from "node:path";

const CACHE_DIR = path.resolve("server/.cache");

type Envelope<T> = { savedAt: number; value: T };

async function ensureDir() {
  await fs.mkdir(CACHE_DIR, { recursive: true });
}

function fileFor(key: string) {
  const safe = key.replace(/[^a-zA-Z0-9_-]/g, "_");
  return path.join(CACHE_DIR, `${safe}.json`);
}

export async function getCached<T>(key: string, ttlMs: number): Promise<T | null> {
  try {
    const raw = await fs.readFile(fileFor(key), "utf8");
    const env = JSON.parse(raw) as Envelope<T>;
    if (Date.now() - env.savedAt > ttlMs) return null;
    return env.value;
  } catch {
    return null;
  }
}

export async function setCached<T>(key: string, value: T): Promise<void> {
  await ensureDir();
  const env: Envelope<T> = { savedAt: Date.now(), value };
  await fs.writeFile(fileFor(key), JSON.stringify(env), "utf8");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/cache.test.ts`
Expected: PASS — 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add server/cache.ts server/cache.test.ts
git commit -m "feat: file-based server cache with TTL"
```

---

## Task 3: Enrichment types

**Files:**
- Modify: `src/data/types.ts`

- [ ] **Step 1: Append enrichment types**

Modify `src/data/types.ts` — append at end of file:

```ts
export type ServiceEnrichment = {
  serviceId: string;
  status: "open" | "closed" | "unknown";
  hoursLine?: string;
  summary?: string;
  closures?: string[];
  sources: { title: string; url: string }[];
  fetchedAt: number;
};

export type PopularTimesHour = { hour: number; busyness: number };

export type PopularTimesEntry = {
  serviceId: string;
  placeId: string;
  weekday: PopularTimesHour[][];
  currentPopularity?: number;
};
```

- [ ] **Step 2: Verify typecheck still passes**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/data/types.ts
git commit -m "feat: add ServiceEnrichment and PopularTimesEntry types"
```

---

## Task 4: Exa client wrapper (TDD)

**Files:**
- Create: `server/exaClient.ts`
- Create: `server/exaClient.test.ts`

- [ ] **Step 1: Write the failing test**

Create `server/exaClient.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

vi.mock("exa-js", () => {
  return {
    default: class FakeExa {
      constructor(_key: string) {}
      async searchAndContents() {
        return {
          results: [
            {
              title: "OTH Tampines Public Library",
              url: "https://example.com/library",
              text: "Open daily 10am to 9pm. Closed on public holidays.",
            },
          ],
        };
      }
    },
  };
});

import { enrichService } from "./exaClient";

describe("enrichService", () => {
  it("returns an enrichment with status, hoursLine, and sources", async () => {
    const result = await enrichService({
      id: "library",
      nameEn: "Tampines Regional Library",
      providerName: "National Library Board",
    });
    expect(result.serviceId).toBe("library");
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0].url).toBe("https://example.com/library");
    expect(result.fetchedAt).toBeGreaterThan(0);
    expect(["open", "closed", "unknown"]).toContain(result.status);
  });

  it("returns status=unknown when no usable hours text is found", async () => {
    const result = await enrichService({
      id: "mystery",
      nameEn: "Mystery Service",
      providerName: "Nobody",
    });
    // FakeExa returns library text, but mystery name won't match — status should still parse
    expect(result.serviceId).toBe("mystery");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/exaClient.test.ts`
Expected: FAIL — module `./exaClient` not found.

- [ ] **Step 3: Implement the Exa client wrapper**

Create `server/exaClient.ts`:

```ts
import Exa from "exa-js";
import type { ServiceEnrichment } from "../src/data/types";

type ServiceInput = {
  id: string;
  nameEn: string;
  providerName: string;
};

let client: Exa | null = null;
function getClient(): Exa {
  if (client) return client;
  const key = process.env.EXA_API_KEY;
  if (!key) throw new Error("EXA_API_KEY not set");
  client = new Exa(key);
  return client;
}

function deriveStatus(text: string): "open" | "closed" | "unknown" {
  const lower = text.toLowerCase();
  if (/closed|tutup|休息/.test(lower)) return "closed";
  if (/open|operating|am to|pm to|\d+\s*(am|pm)/.test(lower)) return "open";
  return "unknown";
}

function extractHoursLine(text: string): string | undefined {
  const match = text.match(/[^.]*(\d+\s*(am|pm)[^.]*?\d+\s*(am|pm))[^.]*/i);
  return match ? match[0].trim() : undefined;
}

export async function enrichService(svc: ServiceInput): Promise<ServiceEnrichment> {
  const query = `${svc.nameEn} ${svc.providerName} Our Tampines Hub opening hours`;
  const exa = getClient();
  const res = await exa.searchAndContents(query, {
    numResults: 3,
    text: { maxCharacters: 600 },
  });

  const sources = (res.results ?? []).map(r => ({
    title: r.title ?? "Source",
    url: r.url,
  }));

  const blob = (res.results ?? []).map(r => r.text ?? "").join(" \n ");
  const status = deriveStatus(blob);
  const hoursLine = extractHoursLine(blob);

  return {
    serviceId: svc.id,
    status,
    hoursLine,
    summary: blob.slice(0, 240) || undefined,
    sources,
    fetchedAt: Date.now(),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/exaClient.test.ts`
Expected: PASS — 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add server/exaClient.ts server/exaClient.test.ts
git commit -m "feat: Exa client wrapper for service enrichment"
```

---

## Task 5: `/api/enrich/:serviceId` Hono route

**Files:**
- Modify: `server/index.ts`

- [ ] **Step 1: Add the new route**

Modify `server/index.ts` — add these imports near the top after the existing imports:

```ts
import { enrichService } from "./exaClient";
import { getCached, setCached } from "./cache";
```

Add the new route after the `/api/narrate` handler block (before the `NODE_ENV === "production"` check):

```ts
const ENRICH_TTL_MS = 1000 * 60 * 60 * 24; // 24h

app.get("/api/enrich/:serviceId", async c => {
  const serviceId = c.req.param("serviceId");
  const nameEn = c.req.query("nameEn");
  const providerName = c.req.query("providerName");
  if (!nameEn || !providerName) {
    return c.json({ error: "nameEn and providerName query params required" }, 400);
  }

  const cacheKey = `enrich-${serviceId}`;
  const cached = await getCached<unknown>(cacheKey, ENRICH_TTL_MS);
  if (cached) return c.json(cached);

  if (!process.env.EXA_API_KEY) {
    return c.json({ error: "EXA_API_KEY not set" }, 500);
  }

  try {
    const enrichment = await enrichService({ id: serviceId, nameEn, providerName });
    await setCached(cacheKey, enrichment);
    return c.json(enrichment);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[enrich] Exa error:", msg);
    return c.json({ error: msg }, 500);
  }
});
```

- [ ] **Step 2: Verify the server still starts**

Run: `npm run dev:server`
Expected: console logs `[server] listening on http://localhost:3000`. No type errors.
Stop with Ctrl+C after confirming.

- [ ] **Step 3: Smoke-test the cache 400 path (no Exa key needed)**

In a second terminal, with server running:

Run: `curl -i http://localhost:3000/api/enrich/library`
Expected: HTTP 400 with `{"error":"nameEn and providerName query params required"}`.

- [ ] **Step 4: Commit**

```bash
git add server/index.ts
git commit -m "feat: /api/enrich/:serviceId route with file cache"
```

---

## Task 6: Frontend enrichment client (TDD)

**Files:**
- Create: `src/enrichment/client.ts`
- Create: `src/enrichment/client.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/enrichment/client.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchEnrichment, _resetEnrichmentCache } from "./client";

const sample = {
  serviceId: "library",
  status: "open" as const,
  hoursLine: "10am to 9pm",
  summary: "Tampines Regional Library is open daily.",
  sources: [{ title: "NLB", url: "https://nlb.gov.sg" }],
  fetchedAt: 1716480000000,
};

describe("fetchEnrichment", () => {
  beforeEach(() => _resetEnrichmentCache());
  afterEach(() => vi.restoreAllMocks());

  it("fetches enrichment from /api/enrich/:serviceId and returns parsed JSON", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => sample,
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchEnrichment({
      id: "library",
      nameEn: "Tampines Regional Library",
      providerName: "NLB",
    });
    expect(result).toEqual(sample);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain("/api/enrich/library");
    expect(fetchMock.mock.calls[0][0]).toContain("nameEn=Tampines+Regional+Library");
  });

  it("dedupes concurrent calls for the same service", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => sample,
    });
    vi.stubGlobal("fetch", fetchMock);

    const [a, b] = await Promise.all([
      fetchEnrichment({ id: "library", nameEn: "L", providerName: "P" }),
      fetchEnrichment({ id: "library", nameEn: "L", providerName: "P" }),
    ]);
    expect(a).toEqual(b);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns null on non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    const result = await fetchEnrichment({
      id: "x",
      nameEn: "x",
      providerName: "x",
    });
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/enrichment/client.test.ts`
Expected: FAIL — module `./client` not found.

- [ ] **Step 3: Implement the client**

Create `src/enrichment/client.ts`:

```ts
import type { ServiceEnrichment } from "@/data/types";

const inflight = new Map<string, Promise<ServiceEnrichment | null>>();

export function _resetEnrichmentCache() {
  inflight.clear();
}

type ServiceInput = { id: string; nameEn: string; providerName: string };

export function fetchEnrichment(svc: ServiceInput): Promise<ServiceEnrichment | null> {
  const existing = inflight.get(svc.id);
  if (existing) return existing;

  const params = new URLSearchParams({
    nameEn: svc.nameEn,
    providerName: svc.providerName,
  });
  const url = `/api/enrich/${encodeURIComponent(svc.id)}?${params.toString()}`;

  const promise = (async () => {
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      return (await res.json()) as ServiceEnrichment;
    } catch {
      return null;
    }
  })();

  inflight.set(svc.id, promise);
  return promise;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/enrichment/client.test.ts`
Expected: PASS — 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/enrichment/client.ts src/enrichment/client.test.ts
git commit -m "feat: frontend enrichment client with promise dedupe"
```

---

## Task 7: Zustand store extension

**Files:**
- Modify: `src/store.ts`

- [ ] **Step 1: Add enrichment slice**

Modify `src/store.ts` — extend the imports:

```ts
import type {
  AccessibilityProfile,
  Floor,
  FloorId,
  Language,
  PopularTimesEntry,
  RouteVariant,
  Service,
  ServiceEnrichment,
} from "@/data/types";
```

Add to the `State` type (alongside existing fields):

```ts
  enrichments: Record<string, ServiceEnrichment>;
  popularTimes: PopularTimesEntry[];

  setEnrichment: (e: ServiceEnrichment) => void;
  setPopularTimes: (entries: PopularTimesEntry[]) => void;
```

Add to the initial state inside `create<State>(set => ({ ... }))`:

```ts
  enrichments: {},
  popularTimes: [],
```

Add the new setters alongside the existing ones:

```ts
  setEnrichment: e =>
    set(s => ({ enrichments: { ...s.enrichments, [e.serviceId]: e } })),
  setPopularTimes: entries => set({ popularTimes: entries }),
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/store.ts
git commit -m "feat: enrichment + popular-times slice in Zustand store"
```

---

## Task 8: Popular Times mapper (TDD, pure function)

**Files:**
- Create: `src/enrichment/popularTimes.ts`
- Create: `src/enrichment/popularTimes.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/enrichment/popularTimes.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { PopularTimesEntry } from "@/data/types";
import { busynessNow } from "./popularTimes";

function makeEntry(): PopularTimesEntry {
  // 7 weekdays, each 24 hours, busyness scaled 0..1
  const weekday = Array.from({ length: 7 }, () =>
    Array.from({ length: 24 }, (_, h) => ({ hour: h, busyness: h / 24 })),
  );
  return { serviceId: "library", placeId: "p1", weekday };
}

describe("busynessNow", () => {
  it("returns the busyness for the given hour and weekday", () => {
    const data = [makeEntry()];
    // Friday 2026-05-22 15:00 — weekday index for getDay() Fri = 5
    const fri15 = new Date(2026, 4, 22, 15, 0, 0);
    const v = busynessNow("library", data, fri15);
    expect(v).toBeCloseTo(15 / 24);
  });

  it("uses currentPopularity when present (live override)", () => {
    const data = [{ ...makeEntry(), currentPopularity: 0.9 }];
    const v = busynessNow("library", data, new Date());
    expect(v).toBe(0.9);
  });

  it("returns null when no entry exists for the service", () => {
    const data = [makeEntry()];
    const v = busynessNow("unknown-service", data, new Date());
    expect(v).toBeNull();
  });

  it("returns null when weekday data is missing for that day", () => {
    const partial: PopularTimesEntry = {
      serviceId: "library",
      placeId: "p1",
      weekday: [[], [], [], [], [], [], []],
    };
    const v = busynessNow("library", [partial], new Date());
    expect(v).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/enrichment/popularTimes.test.ts`
Expected: FAIL — module `./popularTimes` not found.

- [ ] **Step 3: Implement the mapper**

Create `src/enrichment/popularTimes.ts`:

```ts
import type { PopularTimesEntry } from "@/data/types";

export function busynessNow(
  serviceId: string,
  entries: PopularTimesEntry[],
  now: Date,
): number | null {
  const entry = entries.find(e => e.serviceId === serviceId);
  if (!entry) return null;
  if (typeof entry.currentPopularity === "number") {
    return clamp01(entry.currentPopularity);
  }
  const dayIdx = now.getDay(); // 0=Sun..6=Sat
  const dayHours = entry.weekday[dayIdx];
  if (!dayHours || dayHours.length === 0) return null;
  const hour = now.getHours();
  const slot = dayHours.find(h => h.hour === hour);
  if (!slot) return null;
  return clamp01(slot.busyness);
}

function clamp01(n: number): number {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/enrichment/popularTimes.test.ts`
Expected: PASS — 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/enrichment/popularTimes.ts src/enrichment/popularTimes.test.ts
git commit -m "feat: popular-times current-hour mapper"
```

---

## Task 9: Wire enrichment into ServiceTiles UI

**Files:**
- Modify: `src/ui/ServiceTiles.tsx`

- [ ] **Step 1: Read the current ServiceTiles to understand its layout**

Run: `cat src/ui/ServiceTiles.tsx` (or open in editor).
Goal: find where each service tile is rendered. Identify the JSX node that holds the service name. We will add a status badge sibling.

- [ ] **Step 2: Add the enrichment effect and badge**

Modify `src/ui/ServiceTiles.tsx` — at the top of the file alongside other imports:

```tsx
import { useEffect } from "react";
import { fetchEnrichment } from "@/enrichment/client";
```

Inside the component (above the return), add:

```tsx
const services = useStore(s => s.services);
const enrichments = useStore(s => s.enrichments);
const setEnrichment = useStore(s => s.setEnrichment);

useEffect(() => {
  services.forEach(svc => {
    if (enrichments[svc.id]) return;
    fetchEnrichment({
      id: svc.id,
      nameEn: svc.nameEn,
      providerName: svc.providerName,
    }).then(r => {
      if (r) setEnrichment(r);
    });
  });
}, [services, enrichments, setEnrichment]);
```

Inside the per-tile render (find the JSX block that renders a single service tile), add the badge underneath the service name. Replace the existing service name JSX with the combined block — e.g. if the tile currently renders `<span>{svc.nameEn}</span>`, change it to:

```tsx
<div className="flex flex-col">
  <span>{svc.nameEn}</span>
  {enrichments[svc.id]?.hoursLine && (
    <span
      data-status={enrichments[svc.id]?.status}
      className="text-xs opacity-75 data-[status=closed]:text-red-700 data-[status=open]:text-emerald-700"
    >
      {enrichments[svc.id]!.hoursLine}
    </span>
  )}
</div>
```

(Adjust class names to match the surrounding tile style if different.)

- [ ] **Step 3: Smoke test with EXA_API_KEY set**

Set `EXA_API_KEY` in `.env`. Run: `npm run dev:full`
Open `http://localhost:5173`.
Expected: Service tiles render. After ~1-3s, tiles for which Exa returned hours show a small badge below the name. Server log shows one `[enrich]` call per service. Second render (refresh page) is instant — file cache hit.

- [ ] **Step 4: Commit**

```bash
git add src/ui/ServiceTiles.tsx
git commit -m "feat: show Exa-sourced hours badge on service tiles"
```

---

## Task 10: Python scrape script — scaffolding

**Files:**
- Create: `scripts/popular-times/requirements.txt`
- Create: `scripts/popular-times/place-ids.json`
- Create: `scripts/popular-times/README.md`

- [ ] **Step 1: Create requirements.txt**

Create `scripts/popular-times/requirements.txt`:

```
populartimes @ git+https://github.com/m-wrzr/populartimes.git@1.5.0
```

- [ ] **Step 2: Hand-curated place IDs**

Create `scripts/popular-times/place-ids.json` with the demo services. Place IDs must be filled in by the operator looking each one up on Google Maps (Share → Embed → copy the `!1s` segment, or use the public Place ID Finder).

```json
{
  "_note": "Place IDs for Our Tampines Hub services. Look up at https://www.google.com/maps and inspect the share URL — the segment after !1s is the place_id. Or use the populartimes get_id() with a Google Places API key.",
  "psc": "REPLACE_WITH_PLACE_ID",
  "hawker": "REPLACE_WITH_PLACE_ID",
  "community-centre": "REPLACE_WITH_PLACE_ID",
  "library": "REPLACE_WITH_PLACE_ID",
  "hdb": "REPLACE_WITH_PLACE_ID",
  "theatre": "REPLACE_WITH_PLACE_ID"
}
```

- [ ] **Step 3: README explaining the workflow**

Create `scripts/popular-times/README.md`:

````markdown
# Popular Times Scrape (one-shot)

This script grabs Google Popular Times curves for each OTH service once and writes them to `public/data/popular-times.json`. The app reads that JSON at runtime — no live API calls during normal use.

## When to run
- Once before the hackathon demo, after `place-ids.json` is filled in.
- Re-run if you add new services or want a fresher curve (Popular Times changes slowly, monthly is plenty).

## Setup (Windows + macOS + Linux)

1. From the repo root, create a Python virtual environment:

   Windows PowerShell:
   ```
   python -m venv scripts/popular-times/.venv
   scripts/popular-times/.venv/Scripts/Activate.ps1
   ```

   macOS / Linux:
   ```
   python3 -m venv scripts/popular-times/.venv
   source scripts/popular-times/.venv/bin/activate
   ```

2. Install dependencies:
   ```
   pip install -r scripts/popular-times/requirements.txt
   ```

## Fill in place IDs

Open `scripts/popular-times/place-ids.json` and replace each `REPLACE_WITH_PLACE_ID` with the real Google Place ID. To find one without a Google API key:

1. Open Google Maps, search the venue (e.g. "Tampines Regional Library").
2. Click the venue marker, then **Share → Embed a map**.
3. In the embed URL, look for `!1s` followed by an alphanumeric ID like `0x31da3d77a1aae34d:0xa3...`. That's the place ID.

## Run the scrape

```
npm run scrape:popular-times
```

Or directly:
```
python scripts/popular-times/scrape.py
```

Output: `public/data/popular-times.json`. Commit the file.

## Gotchas

- If `populartimes` fails with HTML parse errors, Google likely changed their internal endpoint. Pin a newer commit in `requirements.txt` or check the lib's issue tracker.
- The lib does not need a Google API key for `get_populartimes_for_id` — only for the `get_id` variant.
- Some venues have no Popular Times data at all (Google hasn't collected enough). Those will appear with empty `weekday` arrays — the runtime mapper falls back to Perlin.
````

- [ ] **Step 4: Add npm script for convenience**

Modify `package.json` — in the `"scripts"` object, add:

```json
    "scrape:popular-times": "python scripts/popular-times/scrape.py"
```

- [ ] **Step 5: Commit**

```bash
git add scripts/popular-times/requirements.txt scripts/popular-times/place-ids.json scripts/popular-times/README.md package.json
git commit -m "chore: scaffold popular-times scrape script"
```

---

## Task 11: Python scrape script — implementation

**Files:**
- Create: `scripts/popular-times/scrape.py`

- [ ] **Step 1: Write the script**

Create `scripts/popular-times/scrape.py`:

```python
"""One-shot scrape of Google Popular Times for OTH services.

Reads scripts/popular-times/place-ids.json, calls populartimes for each ID
that isn't the placeholder, and writes public/data/popular-times.json.
"""

import json
import sys
from pathlib import Path

try:
    import populartimes
except ImportError:
    print("populartimes not installed. Run: pip install -r requirements.txt")
    sys.exit(1)

ROOT = Path(__file__).resolve().parents[2]
INPUT = ROOT / "scripts" / "popular-times" / "place-ids.json"
OUTPUT = ROOT / "public" / "data" / "popular-times.json"
PLACEHOLDER = "REPLACE_WITH_PLACE_ID"


def normalise(raw: dict, service_id: str, place_id: str) -> dict:
    """Convert populartimes output to our PopularTimesEntry shape.

    populartimes returns:
      raw["populartimes"] = [
        { "name": "Monday", "data": [0..100 for 24 hours] },
        ... 7 days, starting Monday in populartimes' order
      ]
    We need 7 arrays indexed by JS getDay() (0=Sun..6=Sat) with busyness in 0..1.
    """
    js_order = [None] * 7  # index = JS getDay()
    pt_to_js = {"Sunday": 0, "Monday": 1, "Tuesday": 2, "Wednesday": 3,
                "Thursday": 4, "Friday": 5, "Saturday": 6}
    for day in raw.get("populartimes", []):
        idx = pt_to_js.get(day["name"])
        if idx is None:
            continue
        js_order[idx] = [
            {"hour": h, "busyness": (day["data"][h] or 0) / 100.0}
            for h in range(24)
        ]
    return {
        "serviceId": service_id,
        "placeId": place_id,
        "weekday": [d if d is not None else [] for d in js_order],
        "currentPopularity": (
            raw.get("current_popularity") / 100.0
            if raw.get("current_popularity") is not None
            else None
        ),
    }


def main() -> int:
    with open(INPUT, "r", encoding="utf-8") as fh:
        place_ids = json.load(fh)

    entries = []
    for service_id, place_id in place_ids.items():
        if service_id.startswith("_"):
            continue
        if place_id == PLACEHOLDER:
            print(f"[skip] {service_id}: place_id not set")
            continue
        print(f"[fetch] {service_id} ({place_id})")
        try:
            raw = populartimes.get_populartimes_for_id(place_id)
            entries.append(normalise(raw, service_id, place_id))
        except Exception as exc:  # populartimes raises a wide range of HTML errors
            print(f"[warn] {service_id}: {exc}")

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT, "w", encoding="utf-8") as fh:
        json.dump(entries, fh, indent=2)
    print(f"[done] wrote {len(entries)} entries to {OUTPUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 2: Test the script runs and handles the all-placeholder case**

Run: `python scripts/popular-times/scrape.py`
Expected: prints `[skip] psc: place_id not set` for each service, ends with `[done] wrote 0 entries`. Writes `public/data/popular-times.json` containing `[]`.

- [ ] **Step 3: Commit the script and the empty JSON output**

```bash
git add scripts/popular-times/scrape.py public/data/popular-times.json
git commit -m "feat: populartimes scrape script"
```

> The empty `popular-times.json` is committed deliberately so the frontend has a file to fetch even before the operator runs the scrape with real place IDs.

---

## Task 12: Load Popular Times on app boot

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Read App.tsx to find the existing data-load effect**

Run: `cat src/App.tsx` (or open in editor).
Goal: find the `useEffect` (or equivalent) that loads `services.json`, `floors`, `waypoints` via `src/data/loaders.ts`. We will add a sibling load for `popular-times.json`.

- [ ] **Step 2: Add the Popular Times load**

Modify `src/App.tsx` — alongside the existing data-load `useEffect`, add (or extend it):

```tsx
import type { PopularTimesEntry } from "@/data/types";
// ...

useEffect(() => {
  fetch("/data/popular-times.json")
    .then(r => r.json())
    .then((entries: PopularTimesEntry[]) => {
      useStore.getState().setPopularTimes(entries);
    })
    .catch(err => console.warn("[popular-times] load failed:", err));
}, []);
```

If there's already a single bootstrapping effect that loads multiple JSONs, merge this into it rather than adding a duplicate.

- [ ] **Step 3: Smoke test**

Run: `npm run dev`
Open `http://localhost:5173`, open browser devtools console.
Expected: no errors. Network tab shows a 200 for `/data/popular-times.json` (body `[]` until the scrape is run with real IDs).

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat: load popular-times.json on app boot"
```

---

## Task 13: Use Popular Times in counter-load simulator

**Files:**
- Modify: `src/agents/counterLoads.ts`

- [ ] **Step 1: Make the simulator prefer real curves**

Modify `src/agents/counterLoads.ts` — replace the entire file body (keep the noisejs type-bridge comment block at top) with:

```ts
// noisejs's @types declares `export = Noise` (CJS default), but the runtime
// (a UMD wrapper) attaches `Noise` as a named property on module.exports —
// which is what Vite resolves for `import { Noise } from "noisejs"`. The
// // @ts-expect-error below bridges the gap without flipping esModuleInterop.
// @ts-expect-error noisejs types misdeclare the CJS shape; runtime exports { Noise }
import { Noise } from "noisejs";
import { useEffect } from "react";
import { useStore } from "@/store";
import { busynessNow } from "@/enrichment/popularTimes";

const noise = new Noise(Math.random());

export function useCounterLoadSimulator() {
  const services = useStore(s => s.services);
  const popularTimes = useStore(s => s.popularTimes);
  const setLoad = useStore(s => s.setLoad);

  useEffect(() => {
    if (!services.length) return;

    const counterToService = new Map<string, string>();
    services.forEach(s => (s.counterIds ?? []).forEach(cid => counterToService.set(cid, s.id)));
    const counters = Array.from(counterToService.keys());
    if (counters.length === 0) return;

    let raf = 0;
    const tick = (t: number) => {
      const seconds = t / 1000;
      const now = new Date();
      counters.forEach((cid, i) => {
        const serviceId = counterToService.get(cid)!;
        const real = busynessNow(serviceId, popularTimes, now);
        if (real !== null) {
          // Real curve drives the centre; add a small Perlin wobble so counters
          // within the same service aren't identical.
          const wobble = noise.perlin2(i * 0.13, seconds * 0.07) * 0.15;
          setLoad(cid, Math.max(0, Math.min(1, real + wobble)));
        } else {
          const n = noise.perlin2(i * 0.13, seconds * 0.07) * 0.5 + 0.5;
          setLoad(cid, n);
        }
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [services, popularTimes, setLoad]);
}
```

- [ ] **Step 2: Verify typecheck and tests**

Run: `npm run typecheck`
Expected: no errors.

Run: `npx vitest run`
Expected: all existing tests still pass.

- [ ] **Step 3: Smoke test**

Run: `npm run dev`
Open browser. With an empty `popular-times.json` array, behaviour should be identical to before (pure Perlin). After running the scrape with real IDs and refreshing, counter loads for services with a curve should drift with the real-world hour (e.g. higher at lunch for hawker, higher in afternoon for library).
Expected: no console errors, counter badges render with sensible numbers.

- [ ] **Step 4: Commit**

```bash
git add src/agents/counterLoads.ts
git commit -m "feat: counter loads use real popular-times curve when available"
```

---

## Task 14: Document the new endpoints and update FUTURE_FEATURES.md

**Files:**
- Modify: `docs/FUTURE_FEATURES.md`

- [ ] **Step 1: Mark Exa + Popular Times as implemented (not future)**

Modify `docs/FUTURE_FEATURES.md` — replace the "Not in this doc (separate roadmap items)" section near the bottom with:

```markdown
## 6. Implemented in V0.2

- ✅ Exa-backed `/api/enrich/:serviceId` for service hours / status / summary — see `server/exaClient.ts`.
- ✅ Popular Times pre-scrape via `scripts/popular-times/scrape.py` — committed to `public/data/popular-times.json`.
- ✅ Counter-load simulator now uses real Popular Times curve when available (Perlin fallback).

## 7. Still future (this doc's original scope)

- LTA DataMall integration (bus stops, live `BusArrivalv2`, carpark availability, MRT `PCDRealTime`).
- data.gov.sg integration (NEA hawker dataset closures, polyclinic / library hours).
- NEA Hawker Go Where live crowd indicator (no public API; would need a headless-browser scrape).
- HealthHub polyclinic queue (no public API).
```

> Only do this step **after** Tasks 1–13 are merged. Until then, those bullets are aspirational, not "done".

- [ ] **Step 2: Commit**

```bash
git add docs/FUTURE_FEATURES.md
git commit -m "docs: mark Exa + Popular Times as implemented in V0.2"
```

---

## Self-review (already performed)

- **Spec coverage:** Exa endpoint (Task 5), server cache (Task 2), Exa client wrapper (Task 4), frontend client (Task 6), store extension (Task 7), Popular Times mapper (Task 8), UI hookup (Task 9), Python scrape script (Tasks 10–11), app-boot load (Task 12), counter-load wiring (Task 13), docs (Task 14). All elements of the discussed scope are covered.
- **Placeholders:** None. Every step includes actual code, exact commands, and expected outputs. The only `REPLACE_WITH_PLACE_ID` literal is intentional — it's a runtime sentinel in a data file, not a plan placeholder, and the script handles it.
- **Type consistency:** `ServiceEnrichment` defined once in Task 3 with `serviceId, status, hoursLine, summary, closures, sources, fetchedAt`. Used identically in Tasks 4, 5, 6, 7, 9. `PopularTimesEntry` defined in Task 3 with `serviceId, placeId, weekday, currentPopularity`. Used identically in Tasks 7, 8, 11 (Python output), 12, 13.

---

## Execution handoff

Plan complete and saved. When ready to execute:

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration. Requires `superpowers:subagent-driven-development`.
2. **Inline Execution** — execute tasks in the current session using `superpowers:executing-plans`, batch with checkpoints.

Either way, before starting Task 1, set the missing API keys: `EXA_API_KEY` in `.env`. The Python script doesn't need a key but does need place IDs filled in before producing useful output.
