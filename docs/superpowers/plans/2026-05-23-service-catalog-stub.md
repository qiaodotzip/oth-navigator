# Service Catalog Stub + Demo Journey Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a stub backend that serves a categorized catalog of OTH government/healthcare/community services with building info (`GET /api/services`), plus a button-activated demo that plays back a backend-supplied multi-stop journey stop-by-stop.

**Architecture:** Extend `Service` with `category`/`routable`/`displayFloor` (floorId/roomId become optional — only routable L1/L2 services carry them). A pure `getCatalog()` reads `services.json` and powers two thin Hono routes (`/api/services`, `/api/demo-journey`). The frontend loads the catalog via the endpoint (static fallback), shows non-routable services as "coming soon", and a journey layer in the store drives the existing `buildRoute` once per stop with manual advance.

**Tech Stack:** Hono + Node (server), React 18 + Zustand + R3F (frontend), Vitest. Vite proxies `/api` → `:3000` (already configured).

**Spec:** `docs/superpowers/specs/2026-05-23-oth-service-catalog-stub-design.md`

---

## File Structure

### Create
| Path | Responsibility |
|---|---|
| `server/serviceCatalog.ts` | Pure catalog loader/filter (`getCatalog`) + `DEMO_JOURNEY` constant. No Hono types. |
| `server/serviceCatalog.test.ts` | Vitest for `getCatalog` filters. |
| `src/data/serviceCatalog.integrity.test.ts` | Asserts catalog invariants (routable ⟺ real polygon). |
| `src/routing/serviceLocation.test.ts` | Vitest for the extracted `serviceLocation` helper. |

### Modify
| Path | Change |
|---|---|
| `src/data/types.ts` | Add `ServiceCategory`; extend `Service`; add `JourneyStop`/`Journey`. |
| `src/routing/buildRoute.ts` | Guard optional `floorId`; extract+export `serviceLocation`. |
| `public/data/services.json` | Add category/routable/displayFloor to all; reclassify community-centre (L4 non-routable); add new services. |
| `server/index.ts` | Add `GET /api/services` and `GET /api/demo-journey`. |
| `src/data/loaders.ts` | `loadServices()` fetches `/api/services` with static fallback; wire into `loadDataBundle`. |
| `src/ui/ServiceTiles.tsx` | Render non-routable tiles as disabled "coming soon" with `displayFloor` badge. |
| `src/store.ts` | Add `activeJourney` + `startJourney`/`advanceJourney`/`endJourney`. |
| `src/App.tsx` | Extract `runRoute(svc, start)`; guard non-routable picks; journey orchestration effect; pass `onStartDemoJourney`. |
| `src/ui/PromptPanel.tsx` | "Demo journey" button; journey progress; "Next stop"/"Finish" on arrival. |
| `src/ui/SuccessCard.tsx` | Suppress while a journey is active. |

---

## Task 1: Types + buildRoute guard

**Files:**
- Modify: `src/data/types.ts`
- Modify: `src/routing/buildRoute.ts`

- [ ] **Step 1: Extend the Service type and add journey types**

In `src/data/types.ts`, replace the existing `Service` type with:

```ts
export type ServiceCategory =
  | "government"
  | "healthcare"
  | "community"
  | "retail"
  | "lifestyle";

export type Service = {
  id: string;
  nameEn: string;
  nameZh: string;
  providerName: string;
  category: ServiceCategory;
  /** true iff on a modeled floor (L1/L2) with a roomId that maps to a polygon */
  routable: boolean;
  /** real human floor label for display, e.g. "L1".."L8" */
  displayFloor: string;
  floorId?: FloorId;
  roomId?: string;
  counterIds?: string[];
  accessibility: {
    liftAccess: boolean;
    stepFreeRoute: boolean;
    notes?: string;
  };
  sourceUrl: string;
  iconKey: string;
};
```

Then append the journey types at the end of the file:

```ts
export type JourneyStop = {
  serviceId: string;
  order: number;
  reason?: { en: string; zh: string };
};

export type Journey = {
  id: string;
  stops: JourneyStop[];
};
```

- [ ] **Step 2: Guard the now-optional floorId in buildRoute**

In `src/routing/buildRoute.ts`, the function reads `service.floorId`/`service.roomId`. Add a guard at the very top of `buildRoute` (immediately after the opening `{`):

```ts
  if (!service.floorId) return null;
```

This keeps `floorById.get(service.floorId)` type-safe and means non-routable services (no `floorId`) yield no route.

- [ ] **Step 3: Verify typecheck passes**

Run: `npm run typecheck`
Expected: no errors. (`service.roomId` is already used as an optional `destRoom?: string`, so no further changes needed.)

- [ ] **Step 4: Run existing tests**

Run: `npx vitest run`
Expected: all existing tests pass (12 tests).

- [ ] **Step 5: Commit**

```bash
git add src/data/types.ts src/routing/buildRoute.ts
git commit -m "feat: add category/routable/displayFloor + Journey types"
```

---

## Task 2: Extract `serviceLocation` helper (TDD)

The journey layer needs each stop's location to chain legs (stop N+1 starts where stop N ended). `buildRoute` already computes this internally as the destination polygon center — extract it so both can share it.

**Files:**
- Modify: `src/routing/buildRoute.ts`
- Create: `src/routing/serviceLocation.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/routing/serviceLocation.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { Floor, Service } from "@/data/types";
import { serviceLocation } from "./buildRoute";

const floor: Floor = {
  id: "L1",
  bounds: { width: 200, depth: 200 },
  polygons: [
    {
      id: "L1-room-test",
      type: "room",
      heightMeters: 3,
      points: [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
      ],
    },
  ],
};

function svc(overrides: Partial<Service>): Service {
  return {
    id: "x",
    nameEn: "X",
    nameZh: "X",
    providerName: "P",
    category: "government",
    routable: true,
    displayFloor: "L1",
    floorId: "L1",
    roomId: "L1-room-test",
    accessibility: { liftAccess: true, stepFreeRoute: true },
    sourceUrl: "https://example.com",
    iconKey: "info",
    ...overrides,
  };
}

describe("serviceLocation", () => {
  it("returns the polygon center for a routable service", () => {
    const loc = serviceLocation(svc({}), [floor]);
    expect(loc).toEqual({ floorId: "L1", point: [5, 5] });
  });

  it("returns null when service has no floorId (non-routable)", () => {
    expect(serviceLocation(svc({ floorId: undefined, roomId: undefined }), [floor])).toBeNull();
  });

  it("returns null when the room polygon does not exist", () => {
    expect(serviceLocation(svc({ roomId: "nope" }), [floor])).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/routing/serviceLocation.test.ts`
Expected: FAIL — `serviceLocation` is not exported.

- [ ] **Step 3: Extract and export `serviceLocation`, refactor buildRoute to use it**

In `src/routing/buildRoute.ts`, add the exported helper (after the existing `polygonCenter` function):

```ts
/** The routable location of a service: the center of its room polygon. */
export function serviceLocation(
  service: Service,
  floors: Floor[],
): { floorId: FloorId; point: Pt } | null {
  if (!service.floorId || !service.roomId) return null;
  const floor = floors.find(f => f.id === service.floorId);
  if (!floor) return null;
  const poly = floor.polygons.find(p => p.id === service.roomId);
  if (!poly) return null;
  return { floorId: service.floorId, point: polygonCenter(poly.points) };
}
```

Then refactor the destination computation inside `buildRoute`. Replace these lines:

```ts
  const destFloor = floorById.get(service.floorId);
  if (!destFloor) return null;
  const roomPoly = destFloor.polygons.find(p => p.id === service.roomId);
  const dest = roomPoly ? polygonCenter(roomPoly.points) : start.point;
```

with:

```ts
  const destFloor = floorById.get(service.floorId);
  if (!destFloor) return null;
  const loc = serviceLocation(service, floors);
  const dest = loc ? loc.point : start.point;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/routing/serviceLocation.test.ts src/routing/selectRoute.test.ts`
Expected: PASS (new serviceLocation tests + existing routing tests).

- [ ] **Step 5: Commit**

```bash
git add src/routing/buildRoute.ts src/routing/serviceLocation.test.ts
git commit -m "feat: extract serviceLocation helper for journey leg chaining"
```

---

## Task 3: Extend `services.json` catalog data

**Files:**
- Modify: `public/data/services.json`

- [ ] **Step 1: Replace the catalog with the categorized, expanded set**

Replace the entire contents of `public/data/services.json` with:

```json
[
  {
    "id": "psc",
    "nameEn": "Public Service Centre",
    "nameZh": "公共服务中心",
    "providerName": "People's Association (PSC / ServiceSG / e2i)",
    "category": "government",
    "routable": true,
    "displayFloor": "L1",
    "floorId": "L1",
    "roomId": "L1-room-psc",
    "counterIds": ["psc-1", "psc-2", "psc-3"],
    "accessibility": { "liftAccess": true, "stepFreeRoute": true, "notes": "L1, step-free from main entrance" },
    "sourceUrl": "https://www.pa.gov.sg/our-network/our-tampines-hub/festive-mall-directory/",
    "iconKey": "info"
  },
  {
    "id": "servicesg",
    "nameEn": "ServiceSG Centre",
    "nameZh": "新加坡政府服务中心",
    "providerName": "Public Service Division",
    "category": "government",
    "routable": true,
    "displayFloor": "L1",
    "floorId": "L1",
    "roomId": "L1-room-psc",
    "counterIds": ["servicesg-1", "servicesg-2"],
    "accessibility": { "liftAccess": true, "stepFreeRoute": true, "notes": "#01-21, one-stop government services concierge" },
    "sourceUrl": "https://www.psd.gov.sg/servicesg/",
    "iconKey": "info"
  },
  {
    "id": "cpf",
    "nameEn": "CPF Services (via ServiceSG)",
    "nameZh": "公积金服务",
    "providerName": "Central Provident Fund Board",
    "category": "government",
    "routable": true,
    "displayFloor": "L1",
    "floorId": "L1",
    "roomId": "L1-room-psc",
    "counterIds": ["cpf-1"],
    "accessibility": { "liftAccess": true, "stepFreeRoute": true, "notes": "CPF transactions handled at ServiceSG #01-21" },
    "sourceUrl": "https://www.cpf.gov.sg/member/contact-us/visit-us",
    "iconKey": "receipt"
  },
  {
    "id": "hdb",
    "nameEn": "HDB Branch Office",
    "nameZh": "建屋发展局分行",
    "providerName": "Housing & Development Board",
    "category": "government",
    "routable": true,
    "displayFloor": "L2",
    "floorId": "L2",
    "roomId": "L2-room-hdb-office",
    "counterIds": ["hdb-1", "hdb-2", "hdb-3"],
    "accessibility": { "liftAccess": true, "stepFreeRoute": true, "notes": "Lift access from L1 main entrance" },
    "sourceUrl": "https://www.pa.gov.sg/our-network/our-tampines-hub/festive-mall-directory/",
    "iconKey": "receipt"
  },
  {
    "id": "library",
    "nameEn": "Tampines Regional Library",
    "nameZh": "淡滨尼区域图书馆",
    "providerName": "National Library Board",
    "category": "community",
    "routable": true,
    "displayFloor": "L2",
    "floorId": "L2",
    "roomId": "L2-room-library",
    "counterIds": ["lib-1", "lib-2"],
    "accessibility": { "liftAccess": true, "stepFreeRoute": true, "notes": "Multi-storey library entrance on L2, lifts available" },
    "sourceUrl": "https://www.pa.gov.sg/our-network/our-tampines-hub/festive-mall-directory/",
    "iconKey": "book"
  },
  {
    "id": "theatre",
    "nameEn": "Festive Arts Theatre",
    "nameZh": "节日艺术剧院",
    "providerName": "People's Association",
    "category": "lifestyle",
    "routable": true,
    "displayFloor": "L2",
    "floorId": "L2",
    "roomId": "L2-room-theatre",
    "counterIds": ["theatre-info"],
    "accessibility": { "liftAccess": true, "stepFreeRoute": true, "notes": "Theatre on L2 with step-free access" },
    "sourceUrl": "https://www.pa.gov.sg/our-network/our-tampines-hub/hub-info/",
    "iconKey": "info"
  },
  {
    "id": "hawker",
    "nameEn": "Hawker Centre",
    "nameZh": "小贩中心",
    "providerName": "OTH Hawker Centre",
    "category": "retail",
    "routable": true,
    "displayFloor": "L1",
    "floorId": "L1",
    "roomId": "L1-room-hawker",
    "counterIds": ["hawker-info"],
    "accessibility": { "liftAccess": true, "stepFreeRoute": true, "notes": "Stalls #01-31 to #01-73" },
    "sourceUrl": "https://www.pa.gov.sg/our-network/our-tampines-hub/hub-info/",
    "iconKey": "shop"
  },
  {
    "id": "community-centre",
    "nameEn": "Our Tampines Hub CC",
    "nameZh": "淡滨尼天地民众俱乐部",
    "providerName": "People's Association",
    "category": "community",
    "routable": false,
    "displayFloor": "L4",
    "counterIds": ["cc-1"],
    "accessibility": { "liftAccess": true, "stepFreeRoute": true, "notes": "Community Club on Level 4" },
    "sourceUrl": "https://www.onepa.gov.sg/cc/our-tampines-hub",
    "iconKey": "info"
  },
  {
    "id": "family-medicine-clinic",
    "nameEn": "Tampines Family Medicine Clinic",
    "nameZh": "淡滨尼家庭医学诊所",
    "providerName": "SingHealth / Changi General Hospital",
    "category": "healthcare",
    "routable": false,
    "displayFloor": "L3",
    "accessibility": { "liftAccess": true, "stepFreeRoute": true, "notes": "#03-34, multi-doctor general practice" },
    "sourceUrl": "https://www.cgh.com.sg/community-care/community-health-services/fmc",
    "iconKey": "info"
  },
  {
    "id": "family-nexus",
    "nameEn": "Family Nexus @ OTH",
    "nameZh": "家庭联系站",
    "providerName": "SingHealth",
    "category": "healthcare",
    "routable": false,
    "displayFloor": "L3",
    "accessibility": { "liftAccess": true, "stepFreeRoute": true, "notes": "Co-located community health and social services" },
    "sourceUrl": "https://www.singhealth.com.sg/community-care/connect-with-our-place-based-care-team/family-nexus/our-tampines-hub",
    "iconKey": "info"
  },
  {
    "id": "family-service-centre",
    "nameEn": "Family Service Centre",
    "nameZh": "家庭服务中心",
    "providerName": "Ministry of Social and Family Development",
    "category": "community",
    "routable": false,
    "displayFloor": "L3",
    "accessibility": { "liftAccess": true, "stepFreeRoute": true, "notes": "Social services support" },
    "sourceUrl": "https://www.msf.gov.sg/",
    "iconKey": "info"
  },
  {
    "id": "active-ageing",
    "nameEn": "Active Ageing Centre",
    "nameZh": "乐龄活动中心",
    "providerName": "People's Association",
    "category": "community",
    "routable": false,
    "displayFloor": "L4",
    "accessibility": { "liftAccess": true, "stepFreeRoute": true, "notes": "Senior-focused programmes on Level 4" },
    "sourceUrl": "https://www.onepa.gov.sg/cc/our-tampines-hub",
    "iconKey": "info"
  }
]
```

- [ ] **Step 2: Verify it is valid JSON**

Run: `node -e "console.log(require('./public/data/services.json').length, 'services')"`
Expected: prints `12 services`.

- [ ] **Step 3: Commit**

```bash
git add public/data/services.json
git commit -m "data: categorized catalog with routable flags + coming-soon services"
```

---

## Task 4: Catalog integrity test (TDD)

**Files:**
- Create: `src/data/serviceCatalog.integrity.test.ts`

- [ ] **Step 1: Write the test**

Create `src/data/serviceCatalog.integrity.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Floor, Service } from "./types";

const root = process.cwd();
const services = JSON.parse(
  readFileSync(path.join(root, "public/data/services.json"), "utf8"),
) as Service[];
const floors: Record<string, Floor> = {
  L1: JSON.parse(readFileSync(path.join(root, "public/data/floors/L1.json"), "utf8")),
  L2: JSON.parse(readFileSync(path.join(root, "public/data/floors/L2.json"), "utf8")),
};

describe("service catalog integrity", () => {
  it("every service has a category and a sourceUrl", () => {
    for (const s of services) {
      expect(s.category, `${s.id} category`).toBeTruthy();
      expect(s.sourceUrl, `${s.id} sourceUrl`).toMatch(/^https?:\/\//);
      expect(s.displayFloor, `${s.id} displayFloor`).toBeTruthy();
    }
  });

  it("routable services resolve to a real polygon on their floor", () => {
    for (const s of services.filter(s => s.routable)) {
      expect(s.floorId, `${s.id} floorId`).toBeTruthy();
      expect(s.roomId, `${s.id} roomId`).toBeTruthy();
      const floor = floors[s.floorId!];
      expect(floor, `${s.id} floor ${s.floorId} loaded`).toBeTruthy();
      const poly = floor.polygons.find(p => p.id === s.roomId);
      expect(poly, `${s.id} roomId ${s.roomId} exists as polygon`).toBeTruthy();
    }
  });

  it("non-routable services omit floorId/roomId", () => {
    for (const s of services.filter(s => !s.routable)) {
      expect(s.floorId, `${s.id} floorId should be absent`).toBeUndefined();
      expect(s.roomId, `${s.id} roomId should be absent`).toBeUndefined();
    }
  });
});
```

- [ ] **Step 2: Run the test**

Run: `npx vitest run src/data/serviceCatalog.integrity.test.ts`
Expected: PASS — 3 tests. (If any routable service points at a missing polygon, this fails loudly — that's the guard working.)

- [ ] **Step 3: Commit**

```bash
git add src/data/serviceCatalog.integrity.test.ts
git commit -m "test: catalog integrity guard (routable iff real polygon)"
```

---

## Task 5: `getCatalog` builder (TDD)

**Files:**
- Create: `server/serviceCatalog.ts`
- Create: `server/serviceCatalog.test.ts`

- [ ] **Step 1: Write the failing test**

Create `server/serviceCatalog.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { getCatalog } from "./serviceCatalog";

describe("getCatalog", () => {
  it("returns the full catalog with no filter", () => {
    const all = getCatalog();
    expect(all.length).toBeGreaterThanOrEqual(12);
  });

  it("filters by a single category", () => {
    const gov = getCatalog({ category: ["government"] });
    expect(gov.length).toBeGreaterThan(0);
    expect(gov.every(s => s.category === "government")).toBe(true);
  });

  it("ORs multiple categories", () => {
    const set = getCatalog({ category: ["healthcare", "community"] });
    expect(set.every(s => s.category === "healthcare" || s.category === "community")).toBe(true);
    expect(set.some(s => s.category === "healthcare")).toBe(true);
    expect(set.some(s => s.category === "community")).toBe(true);
  });

  it("ANDs floor with category (floor applies to routable services)", () => {
    const govL1 = getCatalog({ category: ["government"], floor: "L1" });
    expect(govL1.every(s => s.category === "government" && s.floorId === "L1")).toBe(true);
  });

  it("returns empty for an unknown category", () => {
    // @ts-expect-error testing runtime tolerance of an unknown value
    expect(getCatalog({ category: ["nope"] })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/serviceCatalog.test.ts`
Expected: FAIL — module `./serviceCatalog` not found.

- [ ] **Step 3: Implement `getCatalog`**

Create `server/serviceCatalog.ts`:

```ts
import { readFileSync } from "node:fs";
import path from "node:path";
import type { FloorId, Journey, Service, ServiceCategory } from "../src/data/types";

const CATALOG_PATH = path.resolve(process.cwd(), "public/data/services.json");

let cache: Service[] | null = null;
function loadCatalog(): Service[] {
  if (cache) return cache;
  cache = JSON.parse(readFileSync(CATALOG_PATH, "utf8")) as Service[];
  return cache;
}

export function getCatalog(filter?: {
  category?: ServiceCategory[];
  floor?: FloorId;
}): Service[] {
  let list = loadCatalog();
  if (filter?.category && filter.category.length > 0) {
    const set = new Set(filter.category);
    list = list.filter(s => set.has(s.category));
  }
  if (filter?.floor) {
    list = list.filter(s => s.floorId === filter.floor);
  }
  return list;
}

/** Hand-ordered demo journey, simulating a backend-supplied multi-stop chain. */
export const DEMO_JOURNEY: Journey = {
  id: "demo-1",
  stops: [
    {
      serviceId: "servicesg",
      order: 0,
      reason: { en: "Renew your documents", zh: "更新您的证件" },
    },
    {
      serviceId: "library",
      order: 1,
      reason: { en: "Pick up your reserved books", zh: "领取预订的书籍" },
    },
    {
      serviceId: "theatre",
      order: 2,
      reason: { en: "Collect your show tickets", zh: "领取演出门票" },
    },
  ],
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/serviceCatalog.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add server/serviceCatalog.ts server/serviceCatalog.test.ts
git commit -m "feat: getCatalog filter + DEMO_JOURNEY constant"
```

---

## Task 6: `/api/services` and `/api/demo-journey` routes

**Files:**
- Modify: `server/index.ts`

- [ ] **Step 1: Import the catalog helpers**

In `server/index.ts`, add after the existing imports:

```ts
import { getCatalog, DEMO_JOURNEY } from "./serviceCatalog";
import type { FloorId, ServiceCategory } from "../src/data/types";
```

- [ ] **Step 2: Add the routes**

In `server/index.ts`, add after the `/api/narrate` handler (before the `NODE_ENV === "production"` block):

```ts
app.get("/api/services", c => {
  const categoryParam = c.req.query("category");
  const floorParam = c.req.query("floor");
  try {
    const category = categoryParam
      ? (categoryParam.split(",").map(s => s.trim()) as ServiceCategory[])
      : undefined;
    const floor = floorParam ? (floorParam as FloorId) : undefined;
    return c.json(getCatalog({ category, floor }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[services] catalog error:", msg);
    return c.json({ error: msg }, 500);
  }
});

app.get("/api/demo-journey", c => c.json(DEMO_JOURNEY));
```

- [ ] **Step 3: Smoke-test the endpoints**

Start the server: `npm run dev:server` (in one terminal).
In another terminal:

Run: `curl -s "http://localhost:3000/api/services?category=government" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).map(s=>s.id).join(',')))"`
Expected: `psc,servicesg,cpf,hdb` (the government services).

Run: `curl -s http://localhost:3000/api/demo-journey | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).stops.map(s=>s.serviceId).join(' -> ')))"`
Expected: `servicesg -> library -> theatre`.

Stop the server (Ctrl+C).

- [ ] **Step 4: Commit**

```bash
git add server/index.ts
git commit -m "feat: GET /api/services and /api/demo-journey routes"
```

---

## Task 7: Load catalog via endpoint with static fallback

**Files:**
- Modify: `src/data/loaders.ts`

- [ ] **Step 1: Add `loadServices` and use it in the bundle**

In `src/data/loaders.ts`, add this function above `loadDataBundle`:

```ts
/** Fetch the catalog from the stub backend, falling back to the static file. */
async function loadServices(): Promise<Service[]> {
  try {
    const r = await fetch("/api/services");
    if (r.ok) return (await r.json()) as Service[];
  } catch {
    /* fall through to static */
  }
  return fetch("/data/services.json").then(r => r.json() as Promise<Service[]>);
}
```

Then, inside `loadDataBundle`, replace this line in the `Promise.all` array:

```ts
    fetch("/data/services.json").then(r => r.json() as Promise<Service[]>),
```

with:

```ts
    loadServices(),
```

- [ ] **Step 2: Verify typecheck and tests**

Run: `npm run typecheck && npx vitest run`
Expected: no type errors; all tests pass.

- [ ] **Step 3: Smoke test in the app**

Run: `npm run dev:full`, open `http://localhost:5173`.
Expected: tiles render (catalog now served from `/api/services`). Stop server when confirmed.

- [ ] **Step 4: Commit**

```bash
git add src/data/loaders.ts
git commit -m "feat: load catalog from /api/services with static fallback"
```

---

## Task 8: "Coming soon" tiles for non-routable services

**Files:**
- Modify: `src/ui/ServiceTiles.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Render non-routable tiles as disabled with a floor badge**

Replace the contents of `src/ui/ServiceTiles.tsx` with:

```tsx
import { useStore } from "@/store";
import { ServiceIcon } from "./iconMap";

export function ServiceTiles({ onPick }: { onPick: (serviceId: string) => void }) {
  const services = useStore(s => s.services);
  const language = useStore(s => s.language);
  return (
    <div className="grid grid-cols-2 gap-3 p-4">
      {services.map(s => {
        const comingSoon = !s.routable;
        return (
          <button
            key={s.id}
            onClick={() => !comingSoon && onPick(s.id)}
            disabled={comingSoon}
            className={
              "relative flex flex-col items-center justify-center gap-2 py-4 rounded-2xl bg-white shadow-sm border border-neutral-200 transition " +
              (comingSoon ? "opacity-50 cursor-not-allowed" : "active:scale-95")
            }
          >
            <ServiceIcon iconKey={s.iconKey} size={32} />
            <span className="text-sm font-semibold text-oth-ink text-center">
              {language === "en" ? s.nameEn : s.nameZh}
            </span>
            {comingSoon && (
              <span className="text-[10px] font-semibold text-amber-700 bg-amber-100 rounded-full px-2 py-0.5">
                {language === "en"
                  ? `${s.displayFloor} · soon`
                  : `${s.displayFloor} · 即将推出`}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Defensive guard in onPickService**

In `src/App.tsx`, inside `onPickService`, after `const svc = services.find(...)` and the existing `if (!svc) return;`, add:

```ts
      if (!svc.routable) return;
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Smoke test**

Run: `npm run dev:full`, open the app.
Expected: healthcare/community services on L3/L4 (e.g. "Our Tampines Hub CC", "Tampines Family Medicine Clinic") show greyed-out with an "L4 · soon" / "L3 · soon" badge and aren't clickable. Routable ones still route. Stop server.

- [ ] **Step 5: Commit**

```bash
git add src/ui/ServiceTiles.tsx src/App.tsx
git commit -m "feat: coming-soon tiles for non-routable services"
```

---

## Task 9: Journey store layer (TDD)

**Files:**
- Modify: `src/store.ts`

- [ ] **Step 1: Write a failing test for the store slice**

Create `src/store.journey.test.ts`:

```ts
import { describe, expect, it, beforeEach } from "vitest";
import { useStore } from "./store";
import type { Journey } from "@/data/types";

const journey: Journey = {
  id: "t1",
  stops: [
    { serviceId: "servicesg", order: 0 },
    { serviceId: "library", order: 1 },
  ],
};

describe("journey store", () => {
  beforeEach(() => useStore.getState().endJourney());

  it("startJourney sets the journey at index 0", () => {
    useStore.getState().startJourney(journey);
    expect(useStore.getState().activeJourney).toEqual({ journey, currentStopIndex: 0 });
  });

  it("advanceJourney increments the stop index", () => {
    useStore.getState().startJourney(journey);
    useStore.getState().advanceJourney();
    expect(useStore.getState().activeJourney?.currentStopIndex).toBe(1);
  });

  it("endJourney clears the journey", () => {
    useStore.getState().startJourney(journey);
    useStore.getState().endJourney();
    expect(useStore.getState().activeJourney).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/store.journey.test.ts`
Expected: FAIL — `startJourney` is not a function.

- [ ] **Step 3: Add the journey slice to the store**

In `src/store.ts`, extend the imports to include `Journey`:

```ts
import type {
  AccessibilityProfile,
  Floor,
  FloorId,
  Journey,
  Language,
  PopularTimesEntry,
  Pt,
  RouteVariant,
  Service,
} from "@/data/types";
```

Add to the `State` type (alongside the other fields):

```ts
  activeJourney: { journey: Journey; currentStopIndex: number } | null;
  startJourney: (j: Journey) => void;
  advanceJourney: () => void;
  endJourney: () => void;
```

Add to the initial state object:

```ts
  activeJourney: null,
```

Add the setters (alongside the others):

```ts
  startJourney: j => set({ activeJourney: { journey: j, currentStopIndex: 0 } }),
  advanceJourney: () =>
    set(s =>
      s.activeJourney
        ? { activeJourney: { ...s.activeJourney, currentStopIndex: s.activeJourney.currentStopIndex + 1 } }
        : {},
    ),
  endJourney: () => set({ activeJourney: null }),
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/store.journey.test.ts`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/store.ts src/store.journey.test.ts
git commit -m "feat: journey store slice (start/advance/end)"
```

---

## Task 10: App journey orchestration

Drive `buildRoute` once per stop, chaining each leg's start to the previous stop's location.

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Extract a `runRoute` helper from onPickService**

In `src/App.tsx`, import `serviceLocation`:

```ts
import { buildRoute, DEFAULT_START, serviceLocation } from "@/routing/buildRoute";
```

Add a `runRoute` callback inside the component (above `onPickService`). It builds + starts a route and fetches narration — the shared body that both single picks and journey stops use:

```tsx
  const runRoute = useCallback(
    async (svc: Service, start: { floorId: FloorId; point: Pt }) => {
      const floors = useStore.getState().floors;
      const variant = buildRoute(start, svc, profile, floors);
      if (!variant) return;
      setActiveFloor(variant.steps[0].floorId);
      startRoute(variant);
      let narr = getCached(svc.id, profile);
      if (!narr) {
        try {
          narr = await fetchNarration({
            query: svc.nameEn,
            profile,
            services: [svc],
            segmentKeys: variant.steps.map(s => s.segmentKey),
          });
          setCached(svc.id, profile, narr);
        } catch (e) {
          console.warn("[App] fetchNarration failed:", e);
          return;
        }
      }
      setSegments(narr.segments);
    },
    [profile, startRoute, setActiveFloor],
  );
```

Add the required imports for the types if not present:

```ts
import type { FloorId, NarrationSegment, PopularTimesEntry, Pt, Service } from "@/data/types";
```

Then simplify `onPickService` to use it:

```tsx
  const onPickService = useCallback(
    async (serviceId: string) => {
      const svc = services.find(s => s.id === serviceId);
      if (!svc) return;
      if (!svc.routable) return;
      const start = useStore.getState().userLocation ?? DEFAULT_START;
      await runRoute(svc, start);
    },
    [services, runRoute],
  );
```

- [ ] **Step 2: Add the journey orchestration effect**

In `src/App.tsx`, add `const activeJourney = useStore(s => s.activeJourney);` with the other store selectors, then add this effect (after `onPickService`):

```tsx
  // When the active journey's stop index changes, route to that stop. Stop 0
  // starts from the user's location; later stops start from the previous stop.
  useEffect(() => {
    if (!activeJourney) return;
    const { journey, currentStopIndex } = activeJourney;
    const stop = journey.stops[currentStopIndex];
    if (!stop) return;
    const svc = services.find(s => s.id === stop.serviceId);
    if (!svc || !svc.routable) return;

    const floors = useStore.getState().floors;
    let start = useStore.getState().userLocation ?? DEFAULT_START;
    if (currentStopIndex > 0) {
      const prev = journey.stops[currentStopIndex - 1];
      const prevSvc = services.find(s => s.id === prev.serviceId);
      const loc = prevSvc ? serviceLocation(prevSvc, floors) : null;
      if (loc) start = loc;
    }
    void runRoute(svc, start);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeJourney?.currentStopIndex, activeJourney, services, runRoute]);
```

- [ ] **Step 3: Add the demo-journey starter and pass it to PromptPanel**

In `src/App.tsx`, add a callback (near the other handlers):

```tsx
  const onStartDemoJourney = useCallback(async () => {
    try {
      const journey = await fetch("/api/demo-journey").then(r => r.json());
      useStore.getState().startJourney(journey);
    } catch (e) {
      console.warn("[App] demo journey fetch failed:", e);
    }
  }, []);
```

Then update the `<PromptPanel ... />` usage to pass it:

```tsx
          <PromptPanel
            narrationText={narrationText}
            onPickService={onPickService}
            onNext={onNext}
            onStartDemoJourney={onStartDemoJourney}
          />
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: PromptPanel will report a missing prop type — that's fixed in Task 11. If you run before Task 11, expect one error on the `onStartDemoJourney` prop. Proceed to Task 11, then re-typecheck.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx
git commit -m "feat: journey orchestration — route per stop with chained legs"
```

---

## Task 11: PromptPanel — demo button, progress, next-stop/finish

**Files:**
- Modify: `src/ui/PromptPanel.tsx`
- Modify: `src/ui/SuccessCard.tsx`

- [ ] **Step 1: Suppress SuccessCard during a journey**

In `src/ui/SuccessCard.tsx`, add after the existing `const language = ...` selector:

```tsx
  const activeJourney = useStore(s => s.activeJourney);
```

and change the early-return guard from `if (!activeRoute) return null;` to:

```tsx
  if (!activeRoute) return null;
  if (activeJourney) return null; // journey UI handled by PromptPanel
```

- [ ] **Step 2: Add the prop and journey controls to PromptPanel**

In `src/ui/PromptPanel.tsx`, update the props signature:

```tsx
export function PromptPanel({
  narrationText,
  onPickService,
  onNext,
  onStartDemoJourney,
}: {
  narrationText: string;
  onPickService: (id: string) => void;
  onNext: () => void;
  onStartDemoJourney: () => void;
}) {
```

Add journey state selectors after the existing `useStore` calls:

```tsx
  const activeJourney = useStore(s => s.activeJourney);
  const advanceJourney = useStore(s => s.advanceJourney);
  const endJourney = useStore(s => s.endJourney);
```

Replace the no-route branch to include the demo button above the tiles:

```tsx
  if (!route) {
    return (
      <div className="h-full bg-oth-paper border-t border-neutral-300 overflow-hidden flex flex-col">
        <button
          onClick={onStartDemoJourney}
          className="mx-4 mt-4 py-2 rounded-xl bg-oth-ink text-white text-sm font-semibold active:scale-95 transition"
        >
          {language === "zh" ? "▶ 演示行程" : "▶ Demo journey"}
        </button>
        <div className="flex-1 overflow-auto">
          <ServiceTiles onPick={onPickService} />
        </div>
      </div>
    );
  }
```

- [ ] **Step 3: Add a journey progress banner**

In `src/ui/PromptPanel.tsx`, compute journey display values after `const isLast = ...`:

```tsx
  const jStopIdx = activeJourney?.currentStopIndex ?? -1;
  const jTotal = activeJourney?.journey.stops.length ?? 0;
  const inJourney = !!activeJourney;
  const isLastStop = inJourney && jStopIdx >= jTotal - 1;
```

Add the banner immediately inside the route view's outer `<div ...>`, before the existing "Step N of M" header block:

```tsx
      {inJourney && (
        <div className="mb-2 flex items-center justify-between rounded-lg bg-oth-ink/5 px-2 py-1">
          <span className="text-[11px] font-semibold text-oth-ink">
            {language === "zh" ? "行程" : "Journey"} · {jStopIdx + 1}/{jTotal}
          </span>
          <span className="text-[11px] text-neutral-600 truncate ml-2">{svcName}</span>
        </div>
      )}
```

- [ ] **Step 4: Swap the arrival button for journey controls**

In `src/ui/PromptPanel.tsx`, replace the `isLast ? (...) : (...)` arrival button block with:

```tsx
        {isLast ? (
          inJourney && !isLastStop ? (
            <button
              onClick={advanceJourney}
              className="w-full py-3 rounded-2xl bg-oth-primary text-white font-semibold flex items-center justify-center gap-2 active:scale-95 transition"
            >
              {language === "zh" ? "下一站" : "Next stop"}
              <ArrowRight size={20} weight="bold" />
            </button>
          ) : inJourney && isLastStop ? (
            <button
              onClick={() => {
                endJourney();
                endRoute();
              }}
              className="w-full py-3 rounded-2xl bg-green-600 text-white font-semibold flex items-center justify-center gap-2 active:scale-95 transition"
            >
              <Check size={20} weight="bold" />
              {language === "zh" ? "完成行程" : "Finish journey"}
            </button>
          ) : (
            <button
              onClick={endRoute}
              className="w-full py-3 rounded-2xl bg-green-600 text-white font-semibold flex items-center justify-center gap-2 active:scale-95 transition"
            >
              <Check size={20} weight="bold" />
              Arrived
            </button>
          )
        ) : (
          <button
            onClick={onNext}
            className="w-full py-3 rounded-2xl bg-oth-primary text-white font-semibold flex items-center justify-center gap-2 active:scale-95 transition"
          >
            {language === "zh" ? "我到了，下一步" : "I'm here, what's next"}
            <ArrowRight size={20} weight="bold" />
          </button>
        )}
```

- [ ] **Step 5: Typecheck and run tests**

Run: `npm run typecheck && npx vitest run`
Expected: no type errors; all tests pass.

- [ ] **Step 6: End-to-end smoke test**

Run: `npm run dev:full`, open the app.
- Tap **"▶ Demo journey"**. Route to ServiceSG (L1) begins; banner shows "Journey · 1/3".
- Tap through waypoints to arrival → button shows **"Next stop"**. Tap it → routes to Library (L2), banner "Journey · 2/3", floor switches to L2.
- Arrive → "Next stop" → Theatre (L2), banner "3/3".
- Arrive → button shows **"Finish journey"** → tapping clears the journey back to tiles.
Expected: no console errors; floor changes happen; SuccessCard does not pop during the journey.

- [ ] **Step 7: Commit**

```bash
git add src/ui/PromptPanel.tsx src/ui/SuccessCard.tsx
git commit -m "feat: demo journey UI — button, progress banner, stop-by-stop advance"
```

---

## Self-Review

**Spec coverage:**
- §4 architecture (catalog endpoint + static fallback) → Tasks 5, 6, 7 ✓
- §5 data shape (category/routable/displayFloor, optional floorId/roomId, Journey types) → Tasks 1, 3 ✓
- §6 endpoint contract (category OR, floor AND, unknown → []) → Tasks 5, 6 ✓
- §7 catalog contents (routable L1/L2 + coming-soon L3/L4, community-centre reclassified) → Task 3 ✓
- §9 error handling (500 + client fallback) → Tasks 6, 7 ✓
- §10 testing (catalog filter + integrity) → Tasks 4, 5 ✓
- §11 demo journey harness (mock endpoint, types, store, flow, reuse buildRoute) → Tasks 5, 6, 9, 10, 11 ✓
- §11 community-centre coming-soon tile → Task 8 ✓

**Placeholder scan:** No TBD/TODO. Every code step shows full code. Task 10 Step 4 intentionally notes a transient typecheck error resolved by Task 11 (PromptPanel prop) — that's a real sequencing note, not a placeholder.

**Type consistency:** `Service` fields (`category`, `routable`, `displayFloor`, optional `floorId`/`roomId`) consistent across Tasks 1, 3, 4, 5, 8. `Journey`/`JourneyStop` consistent across Tasks 1, 5, 9, 10. `serviceLocation(service, floors)` signature consistent (Tasks 2, 10). `getCatalog({category, floor})` consistent (Tasks 5, 6). Store `activeJourney`/`startJourney`/`advanceJourney`/`endJourney` consistent (Tasks 9, 10, 11).

---

## Execution Handoff

Plan complete. Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks.
2. **Inline Execution** — execute here with checkpoints.
