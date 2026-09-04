# Map Model Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `packages/model` — the pure, I/O-free heart of the OTH map: entity schemas, geometry predicates, the validation gate, navigation-grid baking, and the deterministic published-bundle builder — inside a new npm-workspaces monorepo, with the hackathon app moved to `legacy/`.

**Architecture:** One package, no build step (consumers import TypeScript source directly via workspace resolution). Zod is the single source of truth: every entity has a `Schema` and its TypeScript type is inferred from it, so runtime parsing and compile-time types can never drift. Geometry, validation, nav baking and bundling are layered on top as pure functions over a plain `MapModel` object — no database, no filesystem, no network, which is what makes this package cheap to test exhaustively. The bundle builder lives behind a separate entry point (`@oth/model/bundle`) because it needs `node:crypto` and must not be pulled into a browser bundle.

**Tech Stack:** TypeScript 5.4+ (strict), Zod 3, Vitest 1.6, npm workspaces. Node 20+.

**Spec:** [`docs/design-and-plans/specs/2026-09-04-oth-map-model-design.md`](../specs/2026-09-04-oth-map-model-design.md)

## Global Constraints

Every task's requirements implicitly include these. Values are copied verbatim from the spec.

- **Units are metres.** Plan coordinates are `(x, y)`, `x` east, `y` north, from a **single building origin** shared by all levels. No per-level frames, no Y flipping — the hackathon's `depth - y` render-time flip does not exist in this model.
- **Elevation is per-level** (`elevationM` above datum) plus `heightM` floor-to-floor. Levels are **data, not a type union** — no `FloorId = "L1" | "L2" | "L3"` anywhere.
- **Navigation grid resolution is 0.25 m**, baked at publish time, stored as a **packed bitmask** (~60 KB per level).
- **Asset budgets:** 5 MB and 150k triangles per asset, 25 MB of dressing per level. (Enforced server-side in plan 2; the schema carries the fields here.)
- **Every authored entity carries** `id`, `version` (int, optimistic locking), `updatedBy`, `updatedAt`, and `deletedAt` (soft delete — a mis-delete must be recoverable).
- **Bundle floats are rounded to 3 decimal places** (millimetre precision) and bundles must be **byte-identical for identical input**.
- **TypeScript is strict.** No `any` in committed code.
- **Tests live next to the code** as `*.test.ts`, following the existing repo convention.

---

## File Structure

Root (new):
- **Create** `package.json` — workspace root; `workspaces: ["packages/*"]`. `legacy/` is deliberately *not* a workspace so its heavy hackathon dependencies are not installed.
- **Create** `tsconfig.base.json` — strict compiler options shared by all packages.
- **Create** `vitest.config.ts` — single root config; collects `packages/*/src/**/*.test.ts`.
- **Move** the entire hackathon app into `legacy/` (src, server, scripts, public, index.html, and its config files).

`packages/model/`:
- **Create** `package.json`, `tsconfig.json` — the package manifest; two entry points (`.` and `./bundle`).
- **Create** `src/primitives.ts` — `Vec2`, `Vec3`, `Ring`, `BBox`, id/slug schemas, `VerificationSchema`.
- **Create** `src/schema/building.ts` — `BuildingSchema`, `LevelSchema`.
- **Create** `src/schema/structure.ts` — `RoomSchema`.
- **Create** `src/schema/navigation.ts` — `DoorwaySchema`, `EntranceSchema`, `PortalSchema`, `PortalEndpointSchema`, `NavHintSchema`.
- **Create** `src/schema/dressing.ts` — `AssetSchema`, `PlacementSchema`.
- **Create** `src/schema/semantics.ts` — `TenantSchema`.
- **Create** `src/schema/model.ts` — `MapModelSchema`, `parseModel`.
- **Create** `src/geometry/ring.ts` — signed area, winding, normalisation, simplicity.
- **Create** `src/geometry/segment.ts` — proper intersection, point-to-segment distance.
- **Create** `src/geometry/point.ts` — point-in-ring, point-in-polygon, bounding boxes.
- **Create** `src/validation/types.ts` — `ValidationIssue`, `ValidationReport`, `Rule`.
- **Create** `src/validation/validate.ts` — the rule runner.
- **Create** `src/validation/rules/structure.ts` — footprint and id rules.
- **Create** `src/validation/rules/references.ts` — cross-entity reference integrity.
- **Create** `src/validation/rules/reachability.ts` — unreachable walkable rooms.
- **Create** `src/validation/rules/warnings.ts` — non-blocking quality warnings.
- **Create** `src/nav/grid.ts` — `NavGrid` type, packed-bit accessors, `bakeNavGrid`.
- **Create** `src/nav/reachability.ts` — flood fill from entrances.
- **Create** `src/bundle/serialise.ts` — deterministic JSON (sorted keys, rounded floats).
- **Create** `src/bundle/build.ts` — `buildBundle`.
- **Create** `src/index.ts` — main entry (browser-safe).
- **Create** `src/bundle/index.ts` — bundle entry (uses `node:crypto`).

Each source file above gets a sibling `*.test.ts`.

---

## Task 1: Monorepo scaffold and legacy move

**Files:**
- Create: `package.json`, `tsconfig.base.json`, `vitest.config.ts`, `.gitignore` (modify)
- Create: `packages/model/package.json`, `packages/model/tsconfig.json`, `packages/model/src/index.ts`, `packages/model/src/index.test.ts`
- Move: hackathon app → `legacy/`

**Interfaces:**
- Consumes: nothing.
- Produces: a working `npm test` at the repo root that runs Vitest across `packages/*`; the `@oth/model` workspace package resolvable by name.

- [ ] **Step 1: Move the hackathon app into `legacy/`**

```bash
mkdir -p legacy
git mv src server scripts public index.html vite.config.ts tailwind.config.ts postcss.config.js tsconfig.json tsconfig.node.json package.json package-lock.json legacy/
```

Leave `docs/`, `images/`, `research/`, `README.md`, `.gitignore`, `.env.example` at the root — they describe the whole project, not the legacy app.

- [ ] **Step 2: Write the workspace root manifest**

Create `package.json`:

```json
{
  "name": "oth-navigation",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "workspaces": ["packages/*"],
  "engines": { "node": ">=20" },
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc -b"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "vitest": "^1.6.0"
  }
}
```

`legacy` is intentionally excluded from `workspaces` — it is reference code, and installing its React/three.js dependency tree on every root install would be pure cost.

- [ ] **Step 3: Write the shared TypeScript config**

Create `tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "exactOptionalPropertyTypes": false,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "noEmit": true
  }
}
```

`noUncheckedIndexedAccess` is on deliberately: this package is full of array indexing over polygon rings, and it is exactly the class of bug that silently produces `undefined` coordinates.

- [ ] **Step 4: Write the root Vitest config**

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/src/**/*.test.ts"],
    environment: "node",
  },
});
```

- [ ] **Step 5: Create the model package**

Create `packages/model/package.json`:

```json
{
  "name": "@oth/model",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./bundle": "./src/bundle/index.ts"
  },
  "dependencies": {
    "zod": "^3.23.8"
  }
}
```

There is no build step. Consumers (Vite, tsx, Vitest) all compile TypeScript themselves, so shipping source keeps the loop fast and removes a whole class of stale-build confusion.

Create `packages/model/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src"]
}
```

- [ ] **Step 6: Write the failing smoke test**

Create `packages/model/src/index.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { MODEL_PACKAGE_VERSION } from "./index";

describe("@oth/model", () => {
  it("exposes a package version", () => {
    expect(MODEL_PACKAGE_VERSION).toBe("0.1.0");
  });
});
```

- [ ] **Step 7: Run it and watch it fail**

```bash
npm install
npm test
```

Expected: FAIL — `Failed to resolve import "./index"`.

- [ ] **Step 8: Create the entry point**

Create `packages/model/src/index.ts`:

```ts
export const MODEL_PACKAGE_VERSION = "0.1.0";
```

- [ ] **Step 9: Run the test and the type-checker**

```bash
npm test
npm run typecheck
```

Expected: 1 test passing, no type errors.

- [ ] **Step 10: Ignore build noise and commit**

Add to `.gitignore`:

```
node_modules
dist
.env
.env.local
*.log
*.tsbuildinfo
```

```bash
git add -A
git commit -m "chore: npm-workspaces monorepo; move hackathon app to legacy/"
```

---

## Task 2: Shared primitives and verification

**Files:**
- Create: `packages/model/src/primitives.ts`
- Test: `packages/model/src/primitives.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `Vec2`, `Vec3`, `Ring`, `BBox` types; `Vec2Schema`, `RingSchema`, `SlugSchema`, `VerificationSchema`, `AuditFieldsSchema`; type `Verification`.

- [ ] **Step 1: Write the failing test**

Create `packages/model/src/primitives.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { live, RingSchema, SlugSchema, VerificationSchema, Vec2Schema } from "./primitives";

describe("Vec2Schema", () => {
  it("accepts a finite pair of metres", () => {
    expect(Vec2Schema.parse([1.5, -2.25])).toEqual([1.5, -2.25]);
  });

  it("rejects NaN, which would silently poison every geometry predicate", () => {
    expect(() => Vec2Schema.parse([Number.NaN, 0])).toThrow();
  });

  it("rejects a third coordinate — plan coordinates are 2D by definition", () => {
    expect(() => Vec2Schema.parse([0, 0, 0])).toThrow();
  });
});

describe("RingSchema", () => {
  it("accepts a triangle", () => {
    expect(RingSchema.parse([[0, 0], [1, 0], [0, 1]])).toHaveLength(3);
  });

  it("rejects fewer than three points", () => {
    expect(() => RingSchema.parse([[0, 0], [1, 0]])).toThrow();
  });
});

describe("SlugSchema", () => {
  it("accepts a stable human-readable id", () => {
    expect(SlugSchema.parse("L2-room-library")).toBe("L2-room-library");
  });

  it("rejects whitespace and slashes so ids are safe in bundle file paths", () => {
    expect(() => SlugSchema.parse("L2 room library")).toThrow();
    expect(() => SlugSchema.parse("L2/library")).toThrow();
  });
});

describe("VerificationSchema", () => {
  it("defaults to unverified with no evidence", () => {
    expect(VerificationSchema.parse({})).toEqual({ status: "unverified", evidence: [] });
  });

  it("accepts an on-site verification with evidence", () => {
    const v = VerificationSchema.parse({
      status: "onsite",
      evidence: ["photo:IMG_4821"],
      verifiedAt: "2026-09-04T10:00:00.000Z",
      verifiedBy: "user_1",
    });
    expect(v.status).toBe("onsite");
    expect(v.evidence).toEqual(["photo:IMG_4821"]);
  });

  it("rejects an unknown status", () => {
    expect(() => VerificationSchema.parse({ status: "probably-fine" })).toThrow();
  });
});

describe("live", () => {
  it("keeps entities with no deletedAt", () => {
    expect(live([{ id: "a" }, { id: "b" }])).toHaveLength(2);
  });

  it("drops soft-deleted entities", () => {
    const kept = live([{ id: "a" }, { id: "b", deletedAt: "2026-09-01T00:00:00.000Z" }]);
    expect(kept.map(e => e.id)).toEqual(["a"]);
  });

  it("treats an explicit null deletedAt as live", () => {
    expect(live([{ id: "a", deletedAt: null }])).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run packages/model/src/primitives.test.ts`
Expected: FAIL — cannot resolve `./primitives`.

- [ ] **Step 3: Implement the primitives**

Create `packages/model/src/primitives.ts`:

```ts
import { z } from "zod";

/** Plan coordinate in metres: x east, y north, from the single building origin. */
export type Vec2 = readonly [number, number];
/** Model-space point in metres: x east, y north, z up. */
export type Vec3 = readonly [number, number, number];
/** A closed polygon ring. The closing point is implicit — never repeat the first point. */
export type Ring = readonly Vec2[];
export type BBox = { minX: number; minY: number; maxX: number; maxY: number };

const finite = z.number().finite();

export const Vec2Schema = z.tuple([finite, finite]);
export const Vec3Schema = z.tuple([finite, finite, finite]);

export const RingSchema = z
  .array(Vec2Schema)
  .min(3, "a ring needs at least three points");

/** Ids appear in bundle file paths and URLs, so they are restricted to safe characters. */
export const SlugSchema = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/, "id must be a slug: letters, digits, hyphen, underscore");

export const VerificationStatusSchema = z.enum(["unverified", "photo", "onsite", "cad"]);

/**
 * Provenance. The hackathon shipped data traced from outdated plans with nothing
 * recording that fact; this makes staleness visible instead of silent.
 */
export const VerificationSchema = z.object({
  status: VerificationStatusSchema.default("unverified"),
  /** Opaque references — the labelling tool defines their shape in a later spec. */
  evidence: z.array(z.string()).default([]),
  verifiedAt: z.string().datetime().optional(),
  verifiedBy: z.string().optional(),
});

/** Present on every authored entity: optimistic locking, attribution, soft delete. */
export const AuditFieldsSchema = z.object({
  version: z.number().int().nonnegative().default(0),
  updatedBy: z.string().optional(),
  updatedAt: z.string().datetime().optional(),
  deletedAt: z.string().datetime().nullish(),
});

export type Verification = z.infer<typeof VerificationSchema>;
export type AuditFields = z.infer<typeof AuditFieldsSchema>;

/**
 * Drops soft-deleted entities. Every consumer — validation, nav baking, the
 * bundle builder — filters through this, so a mis-delete stays recoverable
 * without any of them having to remember the `deletedAt` convention.
 */
export function live<T extends { deletedAt?: string | null }>(items: readonly T[]): T[] {
  return items.filter(i => i.deletedAt == null);
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run packages/model/src/primitives.test.ts`
Expected: PASS — 12 tests.

- [ ] **Step 5: Export and commit**

Add to `packages/model/src/index.ts`:

```ts
export * from "./primitives";
```

```bash
git add packages/model/src/primitives.ts packages/model/src/primitives.test.ts packages/model/src/index.ts
git commit -m "feat(model): coordinate primitives, slug ids, verification and audit fields"
```

---

## Task 3: Building and level schemas

**Files:**
- Create: `packages/model/src/schema/building.ts`
- Test: `packages/model/src/schema/building.test.ts`

**Interfaces:**
- Consumes: `SlugSchema`, `AuditFieldsSchema` from `../primitives`.
- Produces: `BuildingSchema`, `LevelSchema`; types `Building`, `Level`.

- [ ] **Step 1: Write the failing test**

Create `packages/model/src/schema/building.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { BuildingSchema, LevelSchema } from "./building";

const building = {
  id: "oth",
  name: "Our Tampines Hub",
  anchorLat: 1.3531,
  anchorLng: 103.9447,
  rotationDeg: 12.5,
};

describe("BuildingSchema", () => {
  it("accepts a georeferenced building", () => {
    expect(BuildingSchema.parse(building).anchorLat).toBe(1.3531);
  });

  it("rejects an out-of-range latitude", () => {
    expect(() => BuildingSchema.parse({ ...building, anchorLat: 91 })).toThrow();
  });

  it("defaults rotation to zero when the survey angle is unknown", () => {
    const { rotationDeg: _omitted, ...rest } = building;
    expect(BuildingSchema.parse(rest).rotationDeg).toBe(0);
  });
});

describe("LevelSchema", () => {
  const level = {
    id: "oth-L2",
    buildingId: "oth",
    code: "L2",
    ordinal: 2,
    nameEn: "Level 2",
    nameZh: "二楼",
    elevationM: 6.2,
    heightM: 4.5,
  };

  it("accepts a level", () => {
    expect(LevelSchema.parse(level).code).toBe("L2");
  });

  it("accepts a negative ordinal and elevation for a basement", () => {
    const b1 = LevelSchema.parse({
      ...level,
      id: "oth-B1",
      code: "B1",
      ordinal: -1,
      elevationM: -4,
      nameEn: "Basement 1",
      nameZh: "地下一层",
    });
    expect(b1.ordinal).toBe(-1);
    expect(b1.elevationM).toBe(-4);
  });

  it("rejects a non-positive floor-to-floor height", () => {
    expect(() => LevelSchema.parse({ ...level, heightM: 0 })).toThrow();
  });
});
```

The basement test is the point of this task: levels are rows, not a `"L1" | "L2" | "L3"` union, so adding B1 must require no code change.

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run packages/model/src/schema/building.test.ts`
Expected: FAIL — cannot resolve `./building`.

- [ ] **Step 3: Implement the schemas**

Create `packages/model/src/schema/building.ts`:

```ts
import { z } from "zod";
import { AuditFieldsSchema, SlugSchema } from "../primitives";

export const BuildingSchema = AuditFieldsSchema.extend({
  id: SlugSchema,
  name: z.string().min(1),
  /**
   * Georeference. Unused today; three columns now versus a painful retrofit once
   * geometry exists. This is what makes an outdoor-GPS handoff at the entrances
   * possible later.
   */
  anchorLat: z.number().min(-90).max(90),
  anchorLng: z.number().min(-180).max(180),
  /** Building north relative to true north, degrees clockwise. */
  rotationDeg: z.number().default(0),
});

export const LevelSchema = AuditFieldsSchema.extend({
  id: SlugSchema,
  buildingId: SlugSchema,
  /** Human-facing short code, e.g. "L1", "B1". Unique within a building. */
  code: z.string().min(1).max(8),
  /** Sort order; negative for basements. */
  ordinal: z.number().int(),
  nameEn: z.string().min(1),
  nameZh: z.string().min(1),
  /** Metres above the building datum. */
  elevationM: z.number().finite(),
  /** Floor-to-floor height in metres. */
  heightM: z.number().positive(),
});

export type Building = z.infer<typeof BuildingSchema>;
export type Level = z.infer<typeof LevelSchema>;
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run packages/model/src/schema/building.test.ts`
Expected: PASS — 6 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/model/src/schema/building.ts packages/model/src/schema/building.test.ts
git commit -m "feat(model): building and level schemas with levels as data, not a union"
```

---

## Task 4: Room schema

**Files:**
- Create: `packages/model/src/schema/structure.ts`
- Test: `packages/model/src/schema/structure.test.ts`

**Interfaces:**
- Consumes: `SlugSchema`, `RingSchema`, `VerificationSchema`, `AuditFieldsSchema`.
- Produces: `RoomKindSchema`, `RoomSchema`; type `Room`.

- [ ] **Step 1: Write the failing test**

Create `packages/model/src/schema/structure.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { RoomSchema } from "./structure";

const room = {
  id: "L2-room-library",
  levelId: "oth-L2",
  kind: "room" as const,
  footprint: [[0, 0], [10, 0], [10, 8], [0, 8]],
  heightM: 3.5,
  walkable: true,
  nameEn: "Public Library",
  nameZh: "公共图书馆",
};

describe("RoomSchema", () => {
  it("accepts a room", () => {
    expect(RoomSchema.parse(room).id).toBe("L2-room-library");
  });

  it("defaults holes to empty and verification to unverified", () => {
    const parsed = RoomSchema.parse(room);
    expect(parsed.holes).toEqual([]);
    expect(parsed.verification.status).toBe("unverified");
  });

  it("accepts an atrium with a hole — the hackathon model could not express one", () => {
    const atrium = RoomSchema.parse({
      ...room,
      id: "L2-atrium-central",
      kind: "atrium",
      holes: [[[3, 3], [6, 3], [6, 5], [3, 5]]],
    });
    expect(atrium.holes).toHaveLength(1);
    expect(atrium.holes[0]).toHaveLength(4);
  });

  it("rejects an unknown kind", () => {
    expect(() => RoomSchema.parse({ ...room, kind: "shop" })).toThrow();
  });

  it("rejects a footprint with two points", () => {
    expect(() => RoomSchema.parse({ ...room, footprint: [[0, 0], [1, 1]] })).toThrow();
  });

  it("defaults walkable to false so nothing becomes routable by accident", () => {
    const { walkable: _omitted, ...rest } = room;
    expect(RoomSchema.parse(rest).walkable).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run packages/model/src/schema/structure.test.ts`
Expected: FAIL — cannot resolve `./structure`.

- [ ] **Step 3: Implement the schema**

Create `packages/model/src/schema/structure.ts`:

```ts
import { z } from "zod";
import { AuditFieldsSchema, RingSchema, SlugSchema, VerificationSchema } from "../primitives";

export const RoomKindSchema = z.enum([
  "room",
  "corridor",
  "atrium",
  "service",
  "outdoor",
  "void",
]);

export const RoomSchema = AuditFieldsSchema.extend({
  id: SlugSchema,
  levelId: SlugSchema,
  kind: RoomKindSchema,
  /** Outer boundary, metres, in building coordinates. */
  footprint: RingSchema,
  /** Interior voids — atria and lightwells. */
  holes: z.array(RingSchema).default([]),
  heightM: z.number().positive(),
  /** Part of the walkable surface. Defaults false: routability is opt-in. */
  walkable: z.boolean().default(false),
  nameEn: z.string().default(""),
  nameZh: z.string().default(""),
  verification: VerificationSchema.default({ status: "unverified", evidence: [] }),
});

export type RoomKind = z.infer<typeof RoomKindSchema>;
export type Room = z.infer<typeof RoomSchema>;
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run packages/model/src/schema/structure.test.ts`
Expected: PASS — 6 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/model/src/schema/structure.ts packages/model/src/schema/structure.test.ts
git commit -m "feat(model): room schema with holes and opt-in walkability"
```

---

## Task 5: Navigation schemas

**Files:**
- Create: `packages/model/src/schema/navigation.ts`
- Test: `packages/model/src/schema/navigation.test.ts`

**Interfaces:**
- Consumes: `SlugSchema`, `Vec2Schema`, `AuditFieldsSchema`.
- Produces: `DoorwaySchema`, `EntranceSchema`, `PortalKindSchema`, `PortalSchema`, `PortalEndpointSchema`, `NavHintSchema`; types `Doorway`, `Entrance`, `Portal`, `PortalEndpoint`, `NavHint`.

- [ ] **Step 1: Write the failing test**

Create `packages/model/src/schema/navigation.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  DoorwaySchema,
  EntranceSchema,
  NavHintSchema,
  PortalEndpointSchema,
  PortalSchema,
} from "./navigation";

describe("DoorwaySchema", () => {
  const doorway = {
    id: "L2-door-library-corridor",
    levelId: "oth-L2",
    roomA: "L2-room-library",
    roomB: "L2-corridor-north",
    segment: [[10, 3], [10, 5]],
    widthM: 2,
  };

  it("accepts a doorway between two rooms", () => {
    expect(DoorwaySchema.parse(doorway).widthM).toBe(2);
  });

  it("accepts a wide opening — a doorway models any opening, not just a door", () => {
    expect(DoorwaySchema.parse({ ...doorway, widthM: 12 }).widthM).toBe(12);
  });

  it("defaults stepFree to true — most openings are level", () => {
    expect(DoorwaySchema.parse(doorway).stepFree).toBe(true);
  });

  it("rejects a segment that is not exactly two points", () => {
    expect(() => DoorwaySchema.parse({ ...doorway, segment: [[0, 0]] })).toThrow();
  });

  it("rejects a non-positive width", () => {
    expect(() => DoorwaySchema.parse({ ...doorway, widthM: 0 })).toThrow();
  });
});

describe("EntranceSchema", () => {
  const entrance = {
    id: "L1-entrance-main",
    levelId: "oth-L1",
    roomId: "L1-atrium-town-square",
    point: [42, 3],
    nameEn: "Main Entrance",
    nameZh: "正门",
  };

  it("accepts an entrance", () => {
    expect(EntranceSchema.parse(entrance).nameEn).toBe("Main Entrance");
  });

  it("defaults isPrimary to false and stepFree to true", () => {
    const parsed = EntranceSchema.parse(entrance);
    expect(parsed.isPrimary).toBe(false);
    expect(parsed.stepFree).toBe(true);
  });
});

describe("PortalSchema", () => {
  it("accepts a lift and preserves stepFree", () => {
    const lift = PortalSchema.parse({
      id: "portal-lift-a",
      kind: "lift",
      stepFree: true,
      nameEn: "Lift A",
      nameZh: "A电梯",
    });
    expect(lift.stepFree).toBe(true);
  });

  it("defaults an escalator to not step-free", () => {
    const esc = PortalSchema.parse({
      id: "portal-esc-1",
      kind: "escalator",
      nameEn: "Escalator 1",
      nameZh: "1号扶梯",
    });
    expect(esc.stepFree).toBe(false);
  });

  it("defaults a lift to step-free", () => {
    const lift = PortalSchema.parse({
      id: "portal-lift-b",
      kind: "lift",
      nameEn: "Lift B",
      nameZh: "B电梯",
    });
    expect(lift.stepFree).toBe(true);
  });

  it("rejects an unknown portal kind", () => {
    expect(() =>
      PortalSchema.parse({ id: "p", kind: "teleporter", nameEn: "x", nameZh: "x" }),
    ).toThrow();
  });
});

describe("PortalEndpointSchema", () => {
  it("accepts an endpoint bound to a level and room", () => {
    const ep = PortalEndpointSchema.parse({
      id: "portal-lift-a-L2",
      portalId: "portal-lift-a",
      levelId: "oth-L2",
      roomId: "L2-service-lift-lobby",
      point: [12, 40],
    });
    expect(ep.portalId).toBe("portal-lift-a");
  });
});

describe("NavHintSchema", () => {
  it("accepts a forced polyline", () => {
    const hint = NavHintSchema.parse({
      id: "L2-hint-past-bakery",
      levelId: "oth-L2",
      polyline: [[0, 0], [4, 0], [4, 6]],
    });
    expect(hint.polyline).toHaveLength(3);
  });

  it("rejects a polyline with a single point", () => {
    expect(() =>
      NavHintSchema.parse({ id: "h", levelId: "oth-L2", polyline: [[0, 0]] }),
    ).toThrow();
  });
});
```

The lift/escalator default test matters: step-free routing is the accessibility feature the whole product is built around, and getting the default backwards would silently route wheelchair users onto escalators.

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run packages/model/src/schema/navigation.test.ts`
Expected: FAIL — cannot resolve `./navigation`.

- [ ] **Step 3: Implement the schemas**

Create `packages/model/src/schema/navigation.ts`:

```ts
import { z } from "zod";
import { AuditFieldsSchema, SlugSchema, Vec2Schema } from "../primitives";

const SegmentSchema = z.tuple([Vec2Schema, Vec2Schema]);

/**
 * An opening between two rooms. Room footprints are closed rings, so without
 * doorways adjacent rooms are either mutually impassable or freely passable
 * through walls. "Doorway" means any opening — a 12 m gap between a corridor and
 * an atrium is one doorway, not a wall.
 */
export const DoorwaySchema = AuditFieldsSchema.extend({
  id: SlugSchema,
  levelId: SlugSchema,
  roomA: SlugSchema,
  roomB: SlugSchema,
  /** The opening's line, on the shared boundary. */
  segment: SegmentSchema,
  widthM: z.number().positive(),
  stepFree: z.boolean().default(true),
});

/**
 * Where the building is entered from outside. First-class rather than a flag
 * because these are the roots of the reachability check and the future handoff
 * point from outdoor GPS navigation.
 */
export const EntranceSchema = AuditFieldsSchema.extend({
  id: SlugSchema,
  levelId: SlugSchema,
  roomId: SlugSchema,
  point: Vec2Schema,
  nameEn: z.string().default(""),
  nameZh: z.string().default(""),
  stepFree: z.boolean().default(true),
  isPrimary: z.boolean().default(false),
  /** Free-text opening hours; structured hours live on tenants. */
  hours: z.string().optional(),
});

export const PortalKindSchema = z.enum(["lift", "escalator", "stair", "ramp"]);

/** Connects two or more levels. Carries the accessibility step-free routing needs. */
export const PortalSchema = AuditFieldsSchema.extend({
  id: SlugSchema,
  kind: PortalKindSchema,
  stepFree: z.boolean().optional(),
  nameEn: z.string().default(""),
  nameZh: z.string().default(""),
}).transform(p => ({
  ...p,
  stepFree: p.stepFree ?? (p.kind === "lift" || p.kind === "ramp"),
}));

export const PortalEndpointSchema = AuditFieldsSchema.extend({
  id: SlugSchema,
  portalId: SlugSchema,
  levelId: SlugSchema,
  roomId: SlugSchema,
  point: Vec2Schema,
});

/** Optional hand-authored polyline forcing a route through a specific path. */
export const NavHintSchema = AuditFieldsSchema.extend({
  id: SlugSchema,
  levelId: SlugSchema,
  polyline: z.array(Vec2Schema).min(2),
});

export type Doorway = z.infer<typeof DoorwaySchema>;
export type Entrance = z.infer<typeof EntranceSchema>;
export type PortalKind = z.infer<typeof PortalKindSchema>;
export type Portal = z.infer<typeof PortalSchema>;
export type PortalEndpoint = z.infer<typeof PortalEndpointSchema>;
export type NavHint = z.infer<typeof NavHintSchema>;
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run packages/model/src/schema/navigation.test.ts`
Expected: PASS — 13 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/model/src/schema/navigation.ts packages/model/src/schema/navigation.test.ts
git commit -m "feat(model): doorway, entrance, portal and nav-hint schemas"
```

---

## Task 6: Dressing, semantics, and the aggregate model

**Files:**
- Create: `packages/model/src/schema/dressing.ts`, `packages/model/src/schema/semantics.ts`, `packages/model/src/schema/model.ts`
- Test: `packages/model/src/schema/dressing.test.ts`, `packages/model/src/schema/semantics.test.ts`, `packages/model/src/schema/model.test.ts`

**Interfaces:**
- Consumes: every schema from tasks 3–5.
- Produces: `AssetSchema`, `PlacementSchema`, `TenantSchema`, `MapModelSchema`, `parseModel(input: unknown): MapModel`; types `Asset`, `Placement`, `Tenant`, `MapModel`. **`MapModel` is the single object every later task operates on.**

- [ ] **Step 1: Write the failing dressing test**

Create `packages/model/src/schema/dressing.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { AssetSchema, PlacementSchema } from "./dressing";

describe("AssetSchema", () => {
  const asset = {
    id: "asset-library-arch",
    filename: "library-arch.glb",
    storagePath: "assets/9f2a.glb",
    checksum: "9f2a1b3c",
    sizeBytes: 1_240_000,
    triangleCount: 48_000,
    bbox: { minX: 0, minY: 0, minZ: 0, maxX: 6, maxY: 3, maxZ: 4 },
  };

  it("accepts an asset within budget", () => {
    expect(AssetSchema.parse(asset).triangleCount).toBe(48_000);
  });

  it("rejects an asset over the 5 MB budget", () => {
    expect(() => AssetSchema.parse({ ...asset, sizeBytes: 6_000_000 })).toThrow();
  });

  it("rejects an asset over the 150k triangle budget", () => {
    expect(() => AssetSchema.parse({ ...asset, triangleCount: 150_001 })).toThrow();
  });
});

describe("PlacementSchema", () => {
  const placement = {
    id: "L2-place-library-arch",
    levelId: "oth-L2",
    assetId: "asset-library-arch",
    roomId: "L2-room-library",
    position: [12, 40, 0],
  };

  it("accepts a placement and defaults rotation and scale", () => {
    const p = PlacementSchema.parse(placement);
    expect(p.rotationDeg).toBe(0);
    expect(p.scale).toBe(1);
  });

  it("rejects a non-positive scale", () => {
    expect(() => PlacementSchema.parse({ ...placement, scale: 0 })).toThrow();
  });
});
```

The budget assertions are here, in the schema, so that a mis-sized asset is rejected by the same rule in the editor, the server and the publish gate — one definition, three enforcement points.

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run packages/model/src/schema/dressing.test.ts`
Expected: FAIL — cannot resolve `./dressing`.

- [ ] **Step 3: Implement dressing**

Create `packages/model/src/schema/dressing.ts`:

```ts
import { z } from "zod";
import { AuditFieldsSchema, SlugSchema, Vec3Schema } from "../primitives";

/** Spec budgets. Enforced here so editor, server and publish share one definition. */
export const ASSET_MAX_BYTES = 5 * 1024 * 1024;
export const ASSET_MAX_TRIANGLES = 150_000;
export const LEVEL_DRESSING_MAX_BYTES = 25 * 1024 * 1024;

export const Bbox3Schema = z.object({
  minX: z.number().finite(),
  minY: z.number().finite(),
  minZ: z.number().finite(),
  maxX: z.number().finite(),
  maxY: z.number().finite(),
  maxZ: z.number().finite(),
});

export const AssetSchema = AuditFieldsSchema.extend({
  id: SlugSchema,
  filename: z.string().min(1),
  storagePath: z.string().min(1),
  checksum: z.string().min(1),
  sizeBytes: z.number().int().positive().max(ASSET_MAX_BYTES),
  triangleCount: z.number().int().nonnegative().max(ASSET_MAX_TRIANGLES),
  bbox: Bbox3Schema,
  uploadedBy: z.string().optional(),
});

/**
 * Where a dressing asset sits. Deliberately inert: nothing in routing,
 * collision or reachability reads a placement. roomId is an anchor for
 * organisation and culling only.
 */
export const PlacementSchema = AuditFieldsSchema.extend({
  id: SlugSchema,
  levelId: SlugSchema,
  assetId: SlugSchema,
  roomId: SlugSchema.optional(),
  /** [x, y, z] in model metres. */
  position: Vec3Schema,
  /** Rotation about the vertical axis only — dressing sits upright on a floor. */
  rotationDeg: z.number().default(0),
  scale: z.number().positive().default(1),
});

export type Asset = z.infer<typeof AssetSchema>;
export type Placement = z.infer<typeof PlacementSchema>;
```

- [ ] **Step 4: Run the dressing test**

Run: `npx vitest run packages/model/src/schema/dressing.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 5: Write the failing semantics test**

Create `packages/model/src/schema/semantics.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { TenantSchema } from "./semantics";

const tenant = {
  id: "tenant-nlb-library",
  levelId: "oth-L2",
  roomId: "L2-room-library",
  nameEn: "Tampines Regional Library",
  nameZh: "淡滨尼区域图书馆",
  category: "community" as const,
  sourceUrl: "https://www.nlb.gov.sg/",
};

describe("TenantSchema", () => {
  it("accepts a tenant", () => {
    expect(TenantSchema.parse(tenant).nameEn).toBe("Tampines Regional Library");
  });

  it("defaults counters to empty and verification to unverified", () => {
    const parsed = TenantSchema.parse(tenant);
    expect(parsed.counters).toEqual([]);
    expect(parsed.verification.status).toBe("unverified");
  });

  it("accepts a validity window so a closed shop can be expressed", () => {
    const closed = TenantSchema.parse({
      ...tenant,
      validFrom: "2020-01-01",
      validTo: "2026-03-31",
    });
    expect(closed.validTo).toBe("2026-03-31");
  });

  it("rejects an unknown category", () => {
    expect(() => TenantSchema.parse({ ...tenant, category: "vibes" })).toThrow();
  });

  it("rejects a source url that is not a url", () => {
    expect(() => TenantSchema.parse({ ...tenant, sourceUrl: "ask-someone" })).toThrow();
  });
});
```

- [ ] **Step 6: Run it and watch it fail**

Run: `npx vitest run packages/model/src/schema/semantics.test.ts`
Expected: FAIL — cannot resolve `./semantics`.

- [ ] **Step 7: Implement semantics**

Create `packages/model/src/schema/semantics.ts`:

```ts
import { z } from "zod";
import { AuditFieldsSchema, SlugSchema, VerificationSchema } from "../primitives";

export const TenantCategorySchema = z.enum([
  "government",
  "healthcare",
  "community",
  "retail",
  "lifestyle",
  "sports",
  "facility",
]);

const DateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

export const TenantSchema = AuditFieldsSchema.extend({
  id: SlugSchema,
  levelId: SlugSchema,
  roomId: SlugSchema,
  nameEn: z.string().min(1),
  nameZh: z.string().min(1),
  category: TenantCategorySchema,
  unitNo: z.string().optional(),
  counters: z.array(z.string()).default([]),
  accessibility: z
    .object({
      liftAccess: z.boolean().default(true),
      stepFreeRoute: z.boolean().default(true),
      notes: z.string().optional(),
    })
    .default({ liftAccess: true, stepFreeRoute: true }),
  /** Free-text for now; structured opening hours are a later concern. */
  hours: z.string().optional(),
  sourceUrl: z.string().url(),
  /** Tenants change. A map that cannot say "this closed in March" goes stale silently. */
  validFrom: DateOnly.optional(),
  validTo: DateOnly.optional(),
  verification: VerificationSchema.default({ status: "unverified", evidence: [] }),
});

export type TenantCategory = z.infer<typeof TenantCategorySchema>;
export type Tenant = z.infer<typeof TenantSchema>;
```

- [ ] **Step 8: Run the semantics test**

Run: `npx vitest run packages/model/src/schema/semantics.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 9: Write the failing aggregate test**

Create `packages/model/src/schema/model.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { emptyModel, parseModel } from "./model";

describe("emptyModel", () => {
  it("produces a model with every collection present and empty", () => {
    const m = emptyModel({
      id: "oth",
      name: "Our Tampines Hub",
      anchorLat: 1.3531,
      anchorLng: 103.9447,
    });
    expect(m.levels).toEqual([]);
    expect(m.rooms).toEqual([]);
    expect(m.doorways).toEqual([]);
    expect(m.entrances).toEqual([]);
    expect(m.portals).toEqual([]);
    expect(m.portalEndpoints).toEqual([]);
    expect(m.navHints).toEqual([]);
    expect(m.assets).toEqual([]);
    expect(m.placements).toEqual([]);
    expect(m.tenants).toEqual([]);
  });
});

describe("parseModel", () => {
  const raw = {
    building: {
      id: "oth",
      name: "Our Tampines Hub",
      anchorLat: 1.3531,
      anchorLng: 103.9447,
    },
    levels: [
      {
        id: "oth-L1",
        buildingId: "oth",
        code: "L1",
        ordinal: 1,
        nameEn: "Level 1",
        nameZh: "一楼",
        elevationM: 0,
        heightM: 6,
      },
    ],
    rooms: [
      {
        id: "L1-corridor-main",
        levelId: "oth-L1",
        kind: "corridor",
        footprint: [[0, 0], [20, 0], [20, 4], [0, 4]],
        heightM: 6,
        walkable: true,
      },
    ],
  };

  it("fills every missing collection with an empty array", () => {
    const m = parseModel(raw);
    expect(m.rooms).toHaveLength(1);
    expect(m.tenants).toEqual([]);
  });

  it("applies nested defaults through the whole tree", () => {
    const room = parseModel(raw).rooms[0];
    expect(room?.holes).toEqual([]);
    expect(room?.verification.status).toBe("unverified");
  });

  it("throws on a structurally invalid model", () => {
    expect(() => parseModel({ ...raw, levels: [{ id: "bad" }] })).toThrow();
  });
});
```

- [ ] **Step 10: Run it and watch it fail**

Run: `npx vitest run packages/model/src/schema/model.test.ts`
Expected: FAIL — cannot resolve `./model`.

- [ ] **Step 11: Implement the aggregate**

Create `packages/model/src/schema/model.ts`:

```ts
import { z } from "zod";
import { BuildingSchema, LevelSchema } from "./building";
import { AssetSchema, PlacementSchema } from "./dressing";
import {
  DoorwaySchema,
  EntranceSchema,
  NavHintSchema,
  PortalEndpointSchema,
  PortalSchema,
} from "./navigation";
import { TenantSchema } from "./semantics";
import { RoomSchema } from "./structure";

/** The whole authored model as one plain object. Every later module is a pure function of this. */
export const MapModelSchema = z.object({
  building: BuildingSchema,
  levels: z.array(LevelSchema).default([]),
  rooms: z.array(RoomSchema).default([]),
  doorways: z.array(DoorwaySchema).default([]),
  entrances: z.array(EntranceSchema).default([]),
  portals: z.array(PortalSchema).default([]),
  portalEndpoints: z.array(PortalEndpointSchema).default([]),
  navHints: z.array(NavHintSchema).default([]),
  assets: z.array(AssetSchema).default([]),
  placements: z.array(PlacementSchema).default([]),
  tenants: z.array(TenantSchema).default([]),
});

export type MapModel = z.infer<typeof MapModelSchema>;

export function parseModel(input: unknown): MapModel {
  return MapModelSchema.parse(input);
}

export function emptyModel(building: z.input<typeof BuildingSchema>): MapModel {
  return parseModel({ building });
}
```

- [ ] **Step 12: Run everything**

```bash
npm test
npm run typecheck
```

Expected: all tests pass, no type errors.

- [ ] **Step 13: Export and commit**

Add to `packages/model/src/index.ts`:

```ts
export * from "./schema/building";
export * from "./schema/structure";
export * from "./schema/navigation";
export * from "./schema/dressing";
export * from "./schema/semantics";
export * from "./schema/model";
```

```bash
git add packages/model/src/schema packages/model/src/index.ts
git commit -m "feat(model): dressing and tenant schemas, aggregate MapModel with parseModel"
```

---

## Task 7: Ring area, winding and normalisation

**Files:**
- Create: `packages/model/src/geometry/ring.ts`
- Test: `packages/model/src/geometry/ring.test.ts`

**Interfaces:**
- Consumes: `Ring`, `Vec2` from `../primitives`.
- Produces: `ringArea(ring: Ring): number` (signed, counter-clockwise positive), `ringIsClockwise(ring: Ring): boolean`, `normaliseRing(ring: Ring): Vec2[]`.

- [ ] **Step 1: Write the failing test**

Create `packages/model/src/geometry/ring.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { Ring } from "../primitives";
import { normaliseRing, ringArea, ringIsClockwise } from "./ring";

const unitSquareCCW: Ring = [[0, 0], [1, 0], [1, 1], [0, 1]];
const unitSquareCW: Ring = [[0, 0], [0, 1], [1, 1], [1, 0]];

describe("ringArea", () => {
  it("returns positive area for a counter-clockwise ring", () => {
    expect(ringArea(unitSquareCCW)).toBeCloseTo(1, 10);
  });

  it("returns negative area for a clockwise ring", () => {
    expect(ringArea(unitSquareCW)).toBeCloseTo(-1, 10);
  });

  it("computes a realistic room area in square metres", () => {
    const room: Ring = [[0, 0], [10, 0], [10, 8], [0, 8]];
    expect(ringArea(room)).toBeCloseTo(80, 10);
  });

  it("returns zero for a degenerate collinear ring", () => {
    expect(ringArea([[0, 0], [1, 0], [2, 0]])).toBeCloseTo(0, 10);
  });
});

describe("ringIsClockwise", () => {
  it("is false for counter-clockwise", () => {
    expect(ringIsClockwise(unitSquareCCW)).toBe(false);
  });

  it("is true for clockwise", () => {
    expect(ringIsClockwise(unitSquareCW)).toBe(true);
  });
});

describe("normaliseRing", () => {
  it("leaves a counter-clockwise ring alone", () => {
    expect(normaliseRing(unitSquareCCW)).toEqual([[0, 0], [1, 0], [1, 1], [0, 1]]);
  });

  it("reverses a clockwise ring to counter-clockwise", () => {
    expect(ringIsClockwise(normaliseRing(unitSquareCW))).toBe(false);
  });

  it("drops a repeated closing point — the closing edge is implicit", () => {
    const closed: Ring = [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]];
    expect(normaliseRing(closed)).toHaveLength(4);
  });

  it("is idempotent", () => {
    const once = normaliseRing(unitSquareCW);
    expect(normaliseRing(once)).toEqual(once);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run packages/model/src/geometry/ring.test.ts`
Expected: FAIL — cannot resolve `./ring`.

- [ ] **Step 3: Implement**

Create `packages/model/src/geometry/ring.ts`:

```ts
import type { Ring, Vec2 } from "../primitives";

/**
 * Signed area by the shoelace formula. Positive is counter-clockwise in plan
 * coordinates (x east, y north). Magnitude is the area in square metres.
 */
export function ringArea(ring: Ring): number {
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    if (!a || !b) continue;
    sum += a[0] * b[1] - b[0] * a[1];
  }
  return sum / 2;
}

export function ringIsClockwise(ring: Ring): boolean {
  return ringArea(ring) < 0;
}

/**
 * Canonical form: counter-clockwise, with no repeated closing point. Every
 * downstream predicate assumes this, so footprints are normalised on the way in.
 */
export function normaliseRing(ring: Ring): Vec2[] {
  let pts: Vec2[] = ring.map(p => [p[0], p[1]] as Vec2);
  const first = pts[0];
  const last = pts[pts.length - 1];
  if (pts.length > 1 && first && last && first[0] === last[0] && first[1] === last[1]) {
    pts = pts.slice(0, -1);
  }
  return ringIsClockwise(pts) ? pts.reverse() : pts;
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run packages/model/src/geometry/ring.test.ts`
Expected: PASS — 10 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/model/src/geometry/ring.ts packages/model/src/geometry/ring.test.ts
git commit -m "feat(model): signed ring area, winding and canonical normalisation"
```

---

## Task 8: Segment intersection and ring simplicity

**Files:**
- Create: `packages/model/src/geometry/segment.ts`
- Modify: `packages/model/src/geometry/ring.ts` (add `ringIsSimple`)
- Test: `packages/model/src/geometry/segment.test.ts`, `packages/model/src/geometry/ring.test.ts`

**Interfaces:**
- Consumes: `Vec2` from `../primitives`.
- Produces: `segmentsProperlyIntersect(p1, p2, q1, q2): boolean`, `distancePointToSegment(p, a, b): number`, `ringIsSimple(ring: Ring): boolean`.

- [ ] **Step 1: Write the failing segment test**

Create `packages/model/src/geometry/segment.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { Vec2 } from "../primitives";
import { distancePointToSegment, segmentsProperlyIntersect } from "./segment";

describe("segmentsProperlyIntersect", () => {
  it("detects a clean crossing", () => {
    expect(segmentsProperlyIntersect([0, 0], [2, 2], [0, 2], [2, 0])).toBe(true);
  });

  it("is false for parallel segments", () => {
    expect(segmentsProperlyIntersect([0, 0], [2, 0], [0, 1], [2, 1])).toBe(false);
  });

  it("is false when segments merely share an endpoint", () => {
    expect(segmentsProperlyIntersect([0, 0], [1, 1], [1, 1], [2, 0])).toBe(false);
  });

  it("is false for a T-touch, where an endpoint lands on the other segment", () => {
    expect(segmentsProperlyIntersect([0, 0], [2, 0], [1, 0], [1, 2])).toBe(false);
  });

  it("is false for disjoint segments", () => {
    expect(segmentsProperlyIntersect([0, 0], [1, 0], [5, 5], [6, 6])).toBe(false);
  });
});

describe("distancePointToSegment", () => {
  const a: Vec2 = [0, 0];
  const b: Vec2 = [10, 0];

  it("measures perpendicular distance to the interior of the segment", () => {
    expect(distancePointToSegment([5, 3], a, b)).toBeCloseTo(3, 10);
  });

  it("clamps to the near endpoint when the projection falls outside", () => {
    expect(distancePointToSegment([-4, 0], a, b)).toBeCloseTo(4, 10);
    expect(distancePointToSegment([14, 0], a, b)).toBeCloseTo(4, 10);
  });

  it("is zero on the segment", () => {
    expect(distancePointToSegment([5, 0], a, b)).toBeCloseTo(0, 10);
  });

  it("handles a degenerate zero-length segment as distance to the point", () => {
    expect(distancePointToSegment([3, 4], [0, 0], [0, 0])).toBeCloseTo(5, 10);
  });
});
```

The endpoint-sharing and T-touch cases are the whole point: consecutive edges of a polygon always share an endpoint, so a naive intersection test would report every valid ring as self-intersecting.

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run packages/model/src/geometry/segment.test.ts`
Expected: FAIL — cannot resolve `./segment`.

- [ ] **Step 3: Implement segments**

Create `packages/model/src/geometry/segment.ts`:

```ts
import type { Vec2 } from "../primitives";

/** Cross product of (a-o) and (b-o). Sign gives orientation. */
function cross(o: Vec2, a: Vec2, b: Vec2): number {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

/**
 * True only when the segments cross at an interior point of both. Shared
 * endpoints and T-touches are deliberately excluded: consecutive polygon edges
 * always share an endpoint, and treating that as an intersection would flag
 * every valid ring.
 */
export function segmentsProperlyIntersect(p1: Vec2, p2: Vec2, q1: Vec2, q2: Vec2): boolean {
  const d1 = cross(q1, q2, p1);
  const d2 = cross(q1, q2, p2);
  const d3 = cross(p1, p2, q1);
  const d4 = cross(p1, p2, q2);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/** Shortest distance from a point to a segment, clamped to the segment's ends. */
export function distancePointToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const vx = b[0] - a[0];
  const vy = b[1] - a[1];
  const lenSq = vx * vx + vy * vy;
  let t = 0;
  if (lenSq > 0) {
    t = ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / lenSq;
    t = Math.max(0, Math.min(1, t));
  }
  const dx = p[0] - (a[0] + t * vx);
  const dy = p[1] - (a[1] + t * vy);
  return Math.sqrt(dx * dx + dy * dy);
}
```

- [ ] **Step 4: Run the segment test**

Run: `npx vitest run packages/model/src/geometry/segment.test.ts`
Expected: PASS — 12 tests.

- [ ] **Step 5: Write the failing simplicity test**

Append to `packages/model/src/geometry/ring.test.ts`:

```ts
import { ringIsSimple } from "./ring";

describe("ringIsSimple", () => {
  it("accepts a convex square", () => {
    expect(ringIsSimple([[0, 0], [1, 0], [1, 1], [0, 1]])).toBe(true);
  });

  it("accepts a realistic L-shaped room", () => {
    expect(
      ringIsSimple([[0, 0], [10, 0], [10, 4], [4, 4], [4, 8], [0, 8]]),
    ).toBe(true);
  });

  it("rejects a bowtie", () => {
    expect(ringIsSimple([[0, 0], [2, 2], [2, 0], [0, 2]])).toBe(false);
  });

  it("rejects a ring with fewer than three points", () => {
    expect(ringIsSimple([[0, 0], [1, 1]])).toBe(false);
  });

  it("rejects a ring containing a duplicate vertex", () => {
    expect(ringIsSimple([[0, 0], [1, 0], [1, 0], [1, 1], [0, 1]])).toBe(false);
  });
});
```

- [ ] **Step 6: Run it and watch it fail**

Run: `npx vitest run packages/model/src/geometry/ring.test.ts`
Expected: FAIL — `ringIsSimple is not a function`.

- [ ] **Step 7: Implement ring simplicity**

Append to `packages/model/src/geometry/ring.ts`:

```ts
import { segmentsProperlyIntersect } from "./segment";

/**
 * A ring is simple when no two non-adjacent edges cross and no vertex repeats.
 * Self-intersecting footprints break point-in-polygon, area and rasterisation,
 * so this is a blocking validation error rather than a warning.
 */
export function ringIsSimple(ring: Ring): boolean {
  const n = ring.length;
  if (n < 3) return false;

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = ring[i];
      const b = ring[j];
      if (a && b && a[0] === b[0] && a[1] === b[1]) return false;
    }
  }

  for (let i = 0; i < n; i++) {
    const p1 = ring[i];
    const p2 = ring[(i + 1) % n];
    if (!p1 || !p2) return false;
    for (let j = i + 1; j < n; j++) {
      // Adjacent edges share an endpoint by construction; skip them.
      if (j === i + 1) continue;
      if (i === 0 && j === n - 1) continue;
      const q1 = ring[j];
      const q2 = ring[(j + 1) % n];
      if (!q1 || !q2) return false;
      if (segmentsProperlyIntersect(p1, p2, q1, q2)) return false;
    }
  }
  return true;
}
```

- [ ] **Step 8: Run the test**

Run: `npx vitest run packages/model/src/geometry/ring.test.ts`
Expected: PASS — 15 tests.

- [ ] **Step 9: Commit**

```bash
git add packages/model/src/geometry
git commit -m "feat(model): proper segment intersection, point-segment distance, ring simplicity"
```

---

## Task 9: Point containment and bounding boxes

**Files:**
- Create: `packages/model/src/geometry/point.ts`
- Test: `packages/model/src/geometry/point.test.ts`

**Interfaces:**
- Consumes: `Vec2`, `Ring`, `BBox` from `../primitives`.
- Produces: `pointInRing(p, ring): boolean`, `pointInPolygon(p, outer, holes?): boolean`, `bboxOfRing(ring): BBox`, `bboxOfRings(rings): BBox`, `bboxContains(outer, inner): boolean`, `EMPTY_BBOX`.

- [ ] **Step 1: Write the failing test**

Create `packages/model/src/geometry/point.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { Ring } from "../primitives";
import { bboxContains, bboxOfRing, bboxOfRings, pointInPolygon, pointInRing } from "./point";

const square: Ring = [[0, 0], [10, 0], [10, 10], [0, 10]];
const hole: Ring = [[4, 4], [6, 4], [6, 6], [4, 6]];

describe("pointInRing", () => {
  it("is true well inside", () => {
    expect(pointInRing([5, 5], square)).toBe(true);
  });

  it("is false well outside", () => {
    expect(pointInRing([15, 5], square)).toBe(false);
  });

  it("is false outside on the other axis", () => {
    expect(pointInRing([5, -1], square)).toBe(false);
  });

  it("handles an L-shaped room's concave notch", () => {
    const lShape: Ring = [[0, 0], [10, 0], [10, 4], [4, 4], [4, 10], [0, 10]];
    expect(pointInRing([2, 8], lShape)).toBe(true);
    expect(pointInRing([8, 8], lShape)).toBe(false);
  });
});

describe("pointInPolygon", () => {
  it("is true inside the outer ring with no holes", () => {
    expect(pointInPolygon([5, 5], square)).toBe(true);
  });

  it("is false inside a hole — an atrium void is not walkable", () => {
    expect(pointInPolygon([5, 5], square, [hole])).toBe(false);
  });

  it("is true inside the outer ring but outside the hole", () => {
    expect(pointInPolygon([1, 1], square, [hole])).toBe(true);
  });
});

describe("bboxOfRing", () => {
  it("bounds a square", () => {
    expect(bboxOfRing(square)).toEqual({ minX: 0, minY: 0, maxX: 10, maxY: 10 });
  });

  it("bounds negative coordinates", () => {
    expect(bboxOfRing([[-5, -2], [3, -2], [3, 4]])).toEqual({
      minX: -5,
      minY: -2,
      maxX: 3,
      maxY: 4,
    });
  });
});

describe("bboxOfRings", () => {
  it("unions several rings", () => {
    expect(bboxOfRings([square, [[12, 0], [14, 0], [14, 2]]])).toEqual({
      minX: 0,
      minY: 0,
      maxX: 14,
      maxY: 10,
    });
  });

  it("returns an empty bbox for no rings", () => {
    const b = bboxOfRings([]);
    expect(b.minX > b.maxX).toBe(true);
  });
});

describe("bboxContains", () => {
  it("is true when fully inside", () => {
    expect(bboxContains(bboxOfRing(square), bboxOfRing(hole))).toBe(true);
  });

  it("is false when it escapes", () => {
    expect(
      bboxContains(bboxOfRing(square), bboxOfRing([[9, 9], [12, 9], [12, 12]])),
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run packages/model/src/geometry/point.test.ts`
Expected: FAIL — cannot resolve `./point`.

- [ ] **Step 3: Implement**

Create `packages/model/src/geometry/point.ts`:

```ts
import type { BBox, Ring, Vec2 } from "../primitives";

export const EMPTY_BBOX: BBox = {
  minX: Number.POSITIVE_INFINITY,
  minY: Number.POSITIVE_INFINITY,
  maxX: Number.NEGATIVE_INFINITY,
  maxY: Number.NEGATIVE_INFINITY,
};

/** Ray casting. Behaviour exactly on an edge is unspecified and never relied upon. */
export function pointInRing(p: Vec2, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (!a || !b) continue;
    const intersects =
      a[1] > p[1] !== b[1] > p[1] &&
      p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0];
    if (intersects) inside = !inside;
  }
  return inside;
}

/** Inside the outer ring and outside every hole. */
export function pointInPolygon(p: Vec2, outer: Ring, holes: readonly Ring[] = []): boolean {
  if (!pointInRing(p, outer)) return false;
  for (const h of holes) {
    if (pointInRing(p, h)) return false;
  }
  return true;
}

export function bboxOfRing(ring: Ring): BBox {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const p of ring) {
    if (p[0] < minX) minX = p[0];
    if (p[1] < minY) minY = p[1];
    if (p[0] > maxX) maxX = p[0];
    if (p[1] > maxY) maxY = p[1];
  }
  return { minX, minY, maxX, maxY };
}

export function bboxOfRings(rings: readonly Ring[]): BBox {
  let acc = EMPTY_BBOX;
  for (const r of rings) {
    const b = bboxOfRing(r);
    acc = {
      minX: Math.min(acc.minX, b.minX),
      minY: Math.min(acc.minY, b.minY),
      maxX: Math.max(acc.maxX, b.maxX),
      maxY: Math.max(acc.maxY, b.maxY),
    };
  }
  return acc;
}

export function bboxContains(outer: BBox, inner: BBox): boolean {
  return (
    inner.minX >= outer.minX &&
    inner.minY >= outer.minY &&
    inner.maxX <= outer.maxX &&
    inner.maxY <= outer.maxY
  );
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run packages/model/src/geometry/point.test.ts`
Expected: PASS — 13 tests.

- [ ] **Step 5: Export and commit**

Add to `packages/model/src/index.ts`:

```ts
export * from "./geometry/ring";
export * from "./geometry/segment";
export * from "./geometry/point";
```

```bash
git add packages/model/src/geometry/point.ts packages/model/src/geometry/point.test.ts packages/model/src/index.ts
git commit -m "feat(model): point-in-polygon with holes and bounding-box helpers"
```

---

## Task 10: Validation framework and structure rules

**Files:**
- Create: `packages/model/src/validation/types.ts`, `packages/model/src/validation/validate.ts`, `packages/model/src/validation/rules/structure.ts`
- Test: `packages/model/src/validation/validate.test.ts`, `packages/model/src/validation/rules/structure.test.ts`

**Interfaces:**
- Consumes: `MapModel`; `ringIsSimple`, `ringArea`, `normaliseRing`.
- Produces: `ValidationIssue`, `ValidationReport`, `Rule`; `validateModel(model, rules?): ValidationReport`; `ALL_RULES`; `structureRules: Rule[]`; `MIN_ROOM_AREA_M2`.

- [ ] **Step 1: Write the failing framework test**

Create `packages/model/src/validation/validate.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { emptyModel } from "../schema/model";
import type { Rule } from "./types";
import { validateModel } from "./validate";

const model = emptyModel({
  id: "oth",
  name: "Our Tampines Hub",
  anchorLat: 1.3531,
  anchorLng: 103.9447,
});

const errorRule: Rule = () => [
  {
    severity: "error",
    code: "test.error",
    message: "boom",
    entityType: "room",
    entityId: "r1",
  },
];

const warningRule: Rule = () => [
  {
    severity: "warning",
    code: "test.warning",
    message: "meh",
    entityType: "room",
    entityId: "r2",
  },
];

describe("validateModel", () => {
  it("reports ok for a model with no issues", () => {
    const report = validateModel(model, []);
    expect(report.ok).toBe(true);
    expect(report.issues).toEqual([]);
  });

  it("counts errors and warnings separately", () => {
    const report = validateModel(model, [errorRule, warningRule]);
    expect(report.errorCount).toBe(1);
    expect(report.warningCount).toBe(1);
  });

  it("is not ok when any error is present", () => {
    expect(validateModel(model, [errorRule]).ok).toBe(false);
  });

  it("is still ok when only warnings are present — warnings never block publish", () => {
    expect(validateModel(model, [warningRule]).ok).toBe(true);
  });

  it("orders errors before warnings so the important ones surface first", () => {
    const report = validateModel(model, [warningRule, errorRule]);
    expect(report.issues[0]?.severity).toBe("error");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run packages/model/src/validation/validate.test.ts`
Expected: FAIL — cannot resolve `./validate`.

- [ ] **Step 3: Implement the framework**

Create `packages/model/src/validation/types.ts`:

```ts
import type { MapModel } from "../schema/model";

export type Severity = "error" | "warning";

export type EntityType =
  | "building"
  | "level"
  | "room"
  | "doorway"
  | "entrance"
  | "portal"
  | "portalEndpoint"
  | "navHint"
  | "asset"
  | "placement"
  | "tenant";

export type ValidationIssue = {
  severity: Severity;
  /** Stable machine-readable code, e.g. "room.footprint.selfIntersecting". */
  code: string;
  message: string;
  entityType: EntityType;
  entityId: string;
  levelId?: string;
};

export type ValidationReport = {
  issues: ValidationIssue[];
  errorCount: number;
  warningCount: number;
  /** True when there are no errors. Warnings never block publish. */
  ok: boolean;
};

export type Rule = (model: MapModel) => ValidationIssue[];
```

Create `packages/model/src/validation/validate.ts`:

```ts
import type { MapModel } from "../schema/model";
import { structureRules } from "./rules/structure";
import type { Rule, ValidationReport } from "./types";

export const ALL_RULES: Rule[] = [...structureRules];

/**
 * Runs every rule and sorts errors first. The publish gate refuses on
 * `ok === false`; the editor's validation panel shows the same report live.
 */
export function validateModel(model: MapModel, rules: Rule[] = ALL_RULES): ValidationReport {
  const issues = rules.flatMap(rule => rule(model));
  issues.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "error" ? -1 : 1));
  const errorCount = issues.filter(i => i.severity === "error").length;
  return {
    issues,
    errorCount,
    warningCount: issues.length - errorCount,
    ok: errorCount === 0,
  };
}
```

- [ ] **Step 4: Write the failing structure-rules test**

Create `packages/model/src/validation/rules/structure.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseModel } from "../../schema/model";
import { validateModel } from "../validate";
import { structureRules } from "./structure";

const building = {
  id: "oth",
  name: "Our Tampines Hub",
  anchorLat: 1.3531,
  anchorLng: 103.9447,
};

const level = {
  id: "oth-L1",
  buildingId: "oth",
  code: "L1",
  ordinal: 1,
  nameEn: "Level 1",
  nameZh: "一楼",
  elevationM: 0,
  heightM: 6,
};

function modelWithRooms(rooms: unknown[]) {
  return parseModel({ building, levels: [level], rooms });
}

const goodRoom = {
  id: "L1-room-a",
  levelId: "oth-L1",
  kind: "room",
  footprint: [[0, 0], [10, 0], [10, 8], [0, 8]],
  heightM: 3.5,
  walkable: true,
};

function codes(rooms: unknown[]) {
  return validateModel(modelWithRooms(rooms), structureRules).issues.map(i => i.code);
}

describe("structure rules", () => {
  it("accepts a valid room", () => {
    expect(codes([goodRoom])).toEqual([]);
  });

  it("rejects a self-intersecting footprint", () => {
    expect(
      codes([{ ...goodRoom, footprint: [[0, 0], [2, 2], [2, 0], [0, 2]] }]),
    ).toContain("room.footprint.selfIntersecting");
  });

  it("rejects a footprint with near-zero area", () => {
    expect(
      codes([{ ...goodRoom, footprint: [[0, 0], [0.05, 0], [0.05, 0.05]] }]),
    ).toContain("room.footprint.degenerateArea");
  });

  it("rejects a hole that is not simple", () => {
    expect(
      codes([{ ...goodRoom, holes: [[[1, 1], [3, 3], [3, 1], [1, 3]]] }]),
    ).toContain("room.hole.selfIntersecting");
  });

  it("rejects duplicate room ids", () => {
    expect(codes([goodRoom, { ...goodRoom }])).toContain("room.id.duplicate");
  });

  it("rejects a room on a level that does not exist", () => {
    expect(codes([{ ...goodRoom, levelId: "oth-L9" }])).toContain("room.levelId.missing");
  });

  it("ignores soft-deleted rooms", () => {
    expect(
      codes([
        { ...goodRoom, footprint: [[0, 0], [2, 2], [2, 0], [0, 2]], deletedAt: "2026-09-01T00:00:00.000Z" },
      ]),
    ).toEqual([]);
  });

  it("rejects duplicate level codes within a building", () => {
    const m = parseModel({
      building,
      levels: [level, { ...level, id: "oth-L1-dup" }],
      rooms: [],
    });
    const found = validateModel(m, structureRules).issues.map(i => i.code);
    expect(found).toContain("level.code.duplicate");
  });
});
```

The soft-delete test is load-bearing: deleted entities must never fail validation, or a recoverable mistake becomes a publish blocker.

- [ ] **Step 5: Run it and watch it fail**

Run: `npx vitest run packages/model/src/validation/rules/structure.test.ts`
Expected: FAIL — cannot resolve `./structure`.

- [ ] **Step 6: Implement the structure rules**

Create `packages/model/src/validation/rules/structure.ts`:

```ts
import { ringArea, ringIsSimple } from "../../geometry/ring";
import { live } from "../../primitives";
import type { Rule, ValidationIssue } from "../types";

/** Below this, a footprint is a drawing mistake rather than a room. */
export const MIN_ROOM_AREA_M2 = 0.5;

const duplicateIds: Rule = model => {
  const issues: ValidationIssue[] = [];
  const seen = new Set<string>();
  for (const room of live(model.rooms)) {
    if (seen.has(room.id)) {
      issues.push({
        severity: "error",
        code: "room.id.duplicate",
        message: `Two rooms share the id "${room.id}".`,
        entityType: "room",
        entityId: room.id,
        levelId: room.levelId,
      });
    }
    seen.add(room.id);
  }
  return issues;
};

const duplicateLevelCodes: Rule = model => {
  const issues: ValidationIssue[] = [];
  const seen = new Set<string>();
  for (const level of live(model.levels)) {
    if (seen.has(level.code)) {
      issues.push({
        severity: "error",
        code: "level.code.duplicate",
        message: `Two levels share the code "${level.code}".`,
        entityType: "level",
        entityId: level.id,
      });
    }
    seen.add(level.code);
  }
  return issues;
};

const roomFootprints: Rule = model => {
  const issues: ValidationIssue[] = [];
  const levelIds = new Set(live(model.levels).map(l => l.id));

  for (const room of live(model.rooms)) {
    if (!levelIds.has(room.levelId)) {
      issues.push({
        severity: "error",
        code: "room.levelId.missing",
        message: `Room "${room.id}" references level "${room.levelId}", which does not exist.`,
        entityType: "room",
        entityId: room.id,
      });
    }

    if (!ringIsSimple(room.footprint)) {
      issues.push({
        severity: "error",
        code: "room.footprint.selfIntersecting",
        message: `Room "${room.id}" has a self-intersecting footprint.`,
        entityType: "room",
        entityId: room.id,
        levelId: room.levelId,
      });
    } else if (Math.abs(ringArea(room.footprint)) < MIN_ROOM_AREA_M2) {
      issues.push({
        severity: "error",
        code: "room.footprint.degenerateArea",
        message: `Room "${room.id}" has an area below ${MIN_ROOM_AREA_M2} m².`,
        entityType: "room",
        entityId: room.id,
        levelId: room.levelId,
      });
    }

    for (const hole of room.holes) {
      if (!ringIsSimple(hole)) {
        issues.push({
          severity: "error",
          code: "room.hole.selfIntersecting",
          message: `Room "${room.id}" has a self-intersecting hole.`,
          entityType: "room",
          entityId: room.id,
          levelId: room.levelId,
        });
      }
    }
  }
  return issues;
};

export const structureRules: Rule[] = [duplicateIds, duplicateLevelCodes, roomFootprints];
```

- [ ] **Step 7: Run both test files**

Run: `npx vitest run packages/model/src/validation`
Expected: PASS — 13 tests.

- [ ] **Step 8: Commit**

```bash
git add packages/model/src/validation
git commit -m "feat(model): validation framework and structural footprint rules"
```

---

## Task 11: Reference-integrity rules

**Files:**
- Create: `packages/model/src/validation/rules/references.ts`
- Modify: `packages/model/src/validation/validate.ts` (add to `ALL_RULES`)
- Test: `packages/model/src/validation/rules/references.test.ts`

**Interfaces:**
- Consumes: `live` from `./structure`, `pointInPolygon`, `MapModel`.
- Produces: `referenceRules: Rule[]`.

- [ ] **Step 1: Write the failing test**

Create `packages/model/src/validation/rules/references.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseModel } from "../../schema/model";
import { validateModel } from "../validate";
import { referenceRules } from "./references";

const base = {
  building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
  levels: [
    {
      id: "oth-L1",
      buildingId: "oth",
      code: "L1",
      ordinal: 1,
      nameEn: "Level 1",
      nameZh: "一楼",
      elevationM: 0,
      heightM: 6,
    },
  ],
  rooms: [
    {
      id: "L1-room-a",
      levelId: "oth-L1",
      kind: "room",
      footprint: [[0, 0], [10, 0], [10, 10], [0, 10]],
      heightM: 3.5,
      walkable: true,
    },
    {
      id: "L1-room-b",
      levelId: "oth-L1",
      kind: "room",
      footprint: [[10, 0], [20, 0], [20, 10], [10, 10]],
      heightM: 3.5,
      walkable: true,
    },
  ],
};

function codes(extra: Record<string, unknown>) {
  return validateModel(parseModel({ ...base, ...extra }), referenceRules).issues.map(i => i.code);
}

const doorway = {
  id: "L1-door-ab",
  levelId: "oth-L1",
  roomA: "L1-room-a",
  roomB: "L1-room-b",
  segment: [[10, 4], [10, 6]],
  widthM: 2,
};

describe("reference rules", () => {
  it("accepts a well-formed doorway", () => {
    expect(codes({ doorways: [doorway] })).toEqual([]);
  });

  it("rejects a doorway referencing a missing room", () => {
    expect(codes({ doorways: [{ ...doorway, roomB: "L1-room-z" }] })).toContain(
      "doorway.room.missing",
    );
  });

  it("rejects a doorway whose rooms are on a different level", () => {
    expect(codes({ doorways: [{ ...doorway, levelId: "oth-L9" }] })).toContain(
      "doorway.levelId.missing",
    );
  });

  it("rejects a doorway joining a room to itself", () => {
    expect(codes({ doorways: [{ ...doorway, roomB: "L1-room-a" }] })).toContain(
      "doorway.room.selfJoin",
    );
  });

  it("accepts an entrance inside its room", () => {
    expect(
      codes({
        entrances: [{ id: "e1", levelId: "oth-L1", roomId: "L1-room-a", point: [5, 5] }],
      }),
    ).toEqual([]);
  });

  it("rejects an entrance whose point falls outside its room", () => {
    expect(
      codes({
        entrances: [{ id: "e1", levelId: "oth-L1", roomId: "L1-room-a", point: [50, 50] }],
      }),
    ).toContain("entrance.point.outsideRoom");
  });

  it("rejects a portal endpoint outside its room", () => {
    expect(
      codes({
        portals: [{ id: "p1", kind: "lift", nameEn: "Lift", nameZh: "电梯" }],
        portalEndpoints: [
          { id: "p1-L1", portalId: "p1", levelId: "oth-L1", roomId: "L1-room-a", point: [99, 99] },
        ],
      }),
    ).toContain("portalEndpoint.point.outsideRoom");
  });

  it("rejects a portal endpoint referencing a missing portal", () => {
    expect(
      codes({
        portalEndpoints: [
          { id: "x", portalId: "nope", levelId: "oth-L1", roomId: "L1-room-a", point: [5, 5] },
        ],
      }),
    ).toContain("portalEndpoint.portal.missing");
  });

  it("rejects a portal with only one endpoint — it connects nothing", () => {
    expect(
      codes({
        portals: [{ id: "p1", kind: "lift", nameEn: "Lift", nameZh: "电梯" }],
        portalEndpoints: [
          { id: "p1-L1", portalId: "p1", levelId: "oth-L1", roomId: "L1-room-a", point: [5, 5] },
        ],
      }),
    ).toContain("portal.endpoints.insufficient");
  });

  it("rejects a tenant referencing a missing room", () => {
    expect(
      codes({
        tenants: [
          {
            id: "t1",
            levelId: "oth-L1",
            roomId: "L1-room-z",
            nameEn: "Shop",
            nameZh: "商店",
            category: "retail",
            sourceUrl: "https://example.com/",
          },
        ],
      }),
    ).toContain("tenant.room.missing");
  });

  it("rejects a placement referencing a missing asset", () => {
    expect(
      codes({
        placements: [
          { id: "pl1", levelId: "oth-L1", assetId: "missing-asset", position: [1, 1, 0] },
        ],
      }),
    ).toContain("placement.asset.missing");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run packages/model/src/validation/rules/references.test.ts`
Expected: FAIL — cannot resolve `./references`.

- [ ] **Step 3: Implement**

Create `packages/model/src/validation/rules/references.ts`:

```ts
import { pointInPolygon } from "../../geometry/point";
import type { MapModel } from "../../schema/model";
import type { Room } from "../../schema/structure";
import type { Rule, ValidationIssue } from "../types";
import { live } from "../../primitives";

function roomIndex(model: MapModel): Map<string, Room> {
  return new Map(live(model.rooms).map(r => [r.id, r]));
}

const doorwayRefs: Rule = model => {
  const issues: ValidationIssue[] = [];
  const rooms = roomIndex(model);
  const levelIds = new Set(live(model.levels).map(l => l.id));

  for (const d of live(model.doorways)) {
    if (!levelIds.has(d.levelId)) {
      issues.push({
        severity: "error",
        code: "doorway.levelId.missing",
        message: `Doorway "${d.id}" references level "${d.levelId}", which does not exist.`,
        entityType: "doorway",
        entityId: d.id,
      });
      continue;
    }
    if (d.roomA === d.roomB) {
      issues.push({
        severity: "error",
        code: "doorway.room.selfJoin",
        message: `Doorway "${d.id}" joins room "${d.roomA}" to itself.`,
        entityType: "doorway",
        entityId: d.id,
        levelId: d.levelId,
      });
      continue;
    }
    for (const roomId of [d.roomA, d.roomB]) {
      const room = rooms.get(roomId);
      if (!room || room.levelId !== d.levelId) {
        issues.push({
          severity: "error",
          code: "doorway.room.missing",
          message: `Doorway "${d.id}" references room "${roomId}", which does not exist on level "${d.levelId}".`,
          entityType: "doorway",
          entityId: d.id,
          levelId: d.levelId,
        });
      }
    }
  }
  return issues;
};

const entranceRefs: Rule = model => {
  const issues: ValidationIssue[] = [];
  const rooms = roomIndex(model);

  for (const e of live(model.entrances)) {
    const room = rooms.get(e.roomId);
    if (!room) {
      issues.push({
        severity: "error",
        code: "entrance.room.missing",
        message: `Entrance "${e.id}" references room "${e.roomId}", which does not exist.`,
        entityType: "entrance",
        entityId: e.id,
        levelId: e.levelId,
      });
      continue;
    }
    if (!pointInPolygon(e.point, room.footprint, room.holes)) {
      issues.push({
        severity: "error",
        code: "entrance.point.outsideRoom",
        message: `Entrance "${e.id}" sits outside room "${e.roomId}".`,
        entityType: "entrance",
        entityId: e.id,
        levelId: e.levelId,
      });
    }
  }
  return issues;
};

const portalRefs: Rule = model => {
  const issues: ValidationIssue[] = [];
  const rooms = roomIndex(model);
  const portals = new Map(live(model.portals).map(p => [p.id, p]));
  const endpointsByPortal = new Map<string, number>();

  for (const ep of live(model.portalEndpoints)) {
    if (!portals.has(ep.portalId)) {
      issues.push({
        severity: "error",
        code: "portalEndpoint.portal.missing",
        message: `Endpoint "${ep.id}" references portal "${ep.portalId}", which does not exist.`,
        entityType: "portalEndpoint",
        entityId: ep.id,
        levelId: ep.levelId,
      });
      continue;
    }
    endpointsByPortal.set(ep.portalId, (endpointsByPortal.get(ep.portalId) ?? 0) + 1);

    const room = rooms.get(ep.roomId);
    if (!room) {
      issues.push({
        severity: "error",
        code: "portalEndpoint.room.missing",
        message: `Endpoint "${ep.id}" references room "${ep.roomId}", which does not exist.`,
        entityType: "portalEndpoint",
        entityId: ep.id,
        levelId: ep.levelId,
      });
    } else if (!pointInPolygon(ep.point, room.footprint, room.holes)) {
      issues.push({
        severity: "error",
        code: "portalEndpoint.point.outsideRoom",
        message: `Endpoint "${ep.id}" sits outside room "${ep.roomId}".`,
        entityType: "portalEndpoint",
        entityId: ep.id,
        levelId: ep.levelId,
      });
    }
  }

  for (const portal of live(model.portals)) {
    if ((endpointsByPortal.get(portal.id) ?? 0) < 2) {
      issues.push({
        severity: "error",
        code: "portal.endpoints.insufficient",
        message: `Portal "${portal.id}" has fewer than two endpoints, so it connects nothing.`,
        entityType: "portal",
        entityId: portal.id,
      });
    }
  }
  return issues;
};

const semanticRefs: Rule = model => {
  const issues: ValidationIssue[] = [];
  const rooms = roomIndex(model);
  const assets = new Set(live(model.assets).map(a => a.id));

  for (const t of live(model.tenants)) {
    if (!rooms.has(t.roomId)) {
      issues.push({
        severity: "error",
        code: "tenant.room.missing",
        message: `Tenant "${t.id}" references room "${t.roomId}", which does not exist.`,
        entityType: "tenant",
        entityId: t.id,
        levelId: t.levelId,
      });
    }
  }

  for (const p of live(model.placements)) {
    if (!assets.has(p.assetId)) {
      issues.push({
        severity: "error",
        code: "placement.asset.missing",
        message: `Placement "${p.id}" references asset "${p.assetId}", which does not exist.`,
        entityType: "placement",
        entityId: p.id,
        levelId: p.levelId,
      });
    }
  }
  return issues;
};

export const referenceRules: Rule[] = [doorwayRefs, entranceRefs, portalRefs, semanticRefs];
```

- [ ] **Step 4: Register the rules**

Modify `packages/model/src/validation/validate.ts`:

```ts
import { referenceRules } from "./rules/references";
import { structureRules } from "./rules/structure";

export const ALL_RULES: Rule[] = [...structureRules, ...referenceRules];
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run packages/model/src/validation`
Expected: PASS — 24 tests.

- [ ] **Step 6: Commit**

```bash
git add packages/model/src/validation
git commit -m "feat(model): cross-entity reference-integrity validation rules"
```

---

## Task 12: Navigation grid — rasterisation and wall blocking

**Files:**
- Create: `packages/model/src/nav/grid.ts`
- Test: `packages/model/src/nav/grid.test.ts`

**Interfaces:**
- Consumes: `MapModel`, `pointInPolygon`, `bboxOfRings`, `distancePointToSegment`, `live`.
- Produces: `NavGrid` type; `NAV_CELL_SIZE_M`, `WALL_HALF_THICKNESS_M`; `bakeNavGrid(model, levelId, opts?): NavGrid`; `navGridGet(grid, col, row)`, `navGridSet(grid, col, row, value)`, `worldToCell(grid, p)`, `cellCentre(grid, col, row)`, `navGridWalkableAt(grid, p)`, `navGridCellCount(grid)`.

- [ ] **Step 1: Write the failing test**

Create `packages/model/src/nav/grid.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseModel } from "../schema/model";
import { bakeNavGrid, navGridWalkableAt } from "./grid";

const building = { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 };
const level = {
  id: "oth-L1",
  buildingId: "oth",
  code: "L1",
  ordinal: 1,
  nameEn: "Level 1",
  nameZh: "一楼",
  elevationM: 0,
  heightM: 6,
};

const roomA = {
  id: "L1-room-a",
  levelId: "oth-L1",
  kind: "room",
  footprint: [[0, 0], [10, 0], [10, 10], [0, 10]],
  heightM: 3.5,
  walkable: true,
};

const roomB = {
  id: "L1-room-b",
  levelId: "oth-L1",
  kind: "room",
  footprint: [[10, 0], [20, 0], [20, 10], [10, 10]],
  heightM: 3.5,
  walkable: true,
};

function grid(rooms: unknown[]) {
  return bakeNavGrid(parseModel({ building, levels: [level], rooms }), "oth-L1");
}

describe("bakeNavGrid", () => {
  it("marks the interior of a walkable room as walkable", () => {
    expect(navGridWalkableAt(grid([roomA]), [5, 5])).toBe(true);
  });

  it("marks the area outside every room as blocked", () => {
    expect(navGridWalkableAt(grid([roomA]), [-5, 5])).toBe(false);
  });

  it("blocks a band along the room boundary — that band is the wall", () => {
    expect(navGridWalkableAt(grid([roomA]), [0.05, 5])).toBe(false);
  });

  it("keeps a point one metre inside walkable", () => {
    expect(navGridWalkableAt(grid([roomA]), [1, 5])).toBe(true);
  });

  it("does not rasterise a non-walkable room", () => {
    expect(navGridWalkableAt(grid([{ ...roomA, walkable: false }]), [5, 5])).toBe(false);
  });

  it("blocks the inside of a hole — an atrium void is not floor", () => {
    const withHole = { ...roomA, holes: [[[4, 4], [6, 4], [6, 6], [4, 6]]] };
    expect(navGridWalkableAt(grid([withHole]), [5, 5])).toBe(false);
    expect(navGridWalkableAt(grid([withHole]), [1, 1])).toBe(true);
  });

  it("separates two abutting rooms when no doorway joins them", () => {
    const g = grid([roomA, roomB]);
    expect(navGridWalkableAt(g, [9.9, 5])).toBe(false);
    expect(navGridWalkableAt(g, [10.1, 5])).toBe(false);
    expect(navGridWalkableAt(g, [5, 5])).toBe(true);
    expect(navGridWalkableAt(g, [15, 5])).toBe(true);
  });

  it("produces an empty grid for a level with no walkable rooms", () => {
    const g = grid([]);
    expect(g.cols).toBe(0);
    expect(g.rows).toBe(0);
  });

  it("uses the 0.25 m cell size from the spec", () => {
    expect(grid([roomA]).cellSizeM).toBe(0.25);
  });

  it("ignores soft-deleted rooms", () => {
    const g = grid([{ ...roomA, deletedAt: "2026-09-01T00:00:00.000Z" }]);
    expect(g.cols).toBe(0);
  });
});
```

The abutting-rooms test is the core of this task: without wall blocking, two rooms sharing an edge would be freely connected and the router would happily walk people through a wall.

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run packages/model/src/nav/grid.test.ts`
Expected: FAIL — cannot resolve `./grid`.

- [ ] **Step 3: Implement**

Create `packages/model/src/nav/grid.ts`:

```ts
import { bboxOfRings, pointInPolygon } from "../geometry/point";
import { distancePointToSegment } from "../geometry/segment";
import type { Ring, Vec2 } from "../primitives";
import type { MapModel } from "../schema/model";
import type { Room } from "../schema/structure";
import { live } from "../primitives";

/** Spec: 0.25 m resolution, baked at publish time, stored as a packed bitmask. */
export const NAV_CELL_SIZE_M = 0.25;
/** Half the assumed wall thickness. Cells within this of a boundary are blocked. */
export const WALL_HALF_THICKNESS_M = 0.15;
/** Padding around the level's extent so boundary cells always exist. */
const GRID_PAD_M = 1;

export type NavGrid = {
  levelId: string;
  /** World metres of the (0, 0) cell's lower-left corner. */
  originX: number;
  originY: number;
  cols: number;
  rows: number;
  cellSizeM: number;
  /** Packed row-major bitmask, one bit per cell. 1 = walkable. */
  bits: Uint8Array;
};

export function navGridCellCount(grid: NavGrid): number {
  return grid.cols * grid.rows;
}

function bitIndex(grid: NavGrid, col: number, row: number): number {
  return row * grid.cols + col;
}

export function navGridGet(grid: NavGrid, col: number, row: number): boolean {
  if (col < 0 || row < 0 || col >= grid.cols || row >= grid.rows) return false;
  const i = bitIndex(grid, col, row);
  const byte = grid.bits[i >> 3];
  if (byte === undefined) return false;
  return (byte & (1 << (i & 7))) !== 0;
}

export function navGridSet(grid: NavGrid, col: number, row: number, value: boolean): void {
  if (col < 0 || row < 0 || col >= grid.cols || row >= grid.rows) return;
  const i = bitIndex(grid, col, row);
  const byteIdx = i >> 3;
  const mask = 1 << (i & 7);
  const byte = grid.bits[byteIdx];
  if (byte === undefined) return;
  grid.bits[byteIdx] = value ? byte | mask : byte & ~mask;
}

export function cellCentre(grid: NavGrid, col: number, row: number): Vec2 {
  return [
    grid.originX + (col + 0.5) * grid.cellSizeM,
    grid.originY + (row + 0.5) * grid.cellSizeM,
  ];
}

export function worldToCell(grid: NavGrid, p: Vec2): { col: number; row: number } {
  return {
    col: Math.floor((p[0] - grid.originX) / grid.cellSizeM),
    row: Math.floor((p[1] - grid.originY) / grid.cellSizeM),
  };
}

export function navGridWalkableAt(grid: NavGrid, p: Vec2): boolean {
  const { col, row } = worldToCell(grid, p);
  return navGridGet(grid, col, row);
}

function emptyGrid(levelId: string, cellSizeM: number): NavGrid {
  return {
    levelId,
    originX: 0,
    originY: 0,
    cols: 0,
    rows: 0,
    cellSizeM,
    bits: new Uint8Array(0),
  };
}

/** Every edge of a room's outer ring and holes, as segments. */
function ringSegments(ring: Ring): Array<[Vec2, Vec2]> {
  const out: Array<[Vec2, Vec2]> = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    if (a && b) out.push([a, b]);
  }
  return out;
}

function roomSegments(room: Room): Array<[Vec2, Vec2]> {
  return [...ringSegments(room.footprint), ...room.holes.flatMap(ringSegments)];
}

/** Applies `fn` to every cell whose centre lies within `radius` of the segment. */
function forEachCellNearSegment(
  grid: NavGrid,
  a: Vec2,
  b: Vec2,
  radius: number,
  fn: (col: number, row: number, centre: Vec2) => void,
): void {
  const minX = Math.min(a[0], b[0]) - radius;
  const maxX = Math.max(a[0], b[0]) + radius;
  const minY = Math.min(a[1], b[1]) - radius;
  const maxY = Math.max(a[1], b[1]) + radius;
  const c0 = Math.max(0, Math.floor((minX - grid.originX) / grid.cellSizeM));
  const c1 = Math.min(grid.cols - 1, Math.ceil((maxX - grid.originX) / grid.cellSizeM));
  const r0 = Math.max(0, Math.floor((minY - grid.originY) / grid.cellSizeM));
  const r1 = Math.min(grid.rows - 1, Math.ceil((maxY - grid.originY) / grid.cellSizeM));

  for (let row = r0; row <= r1; row++) {
    for (let col = c0; col <= c1; col++) {
      const centre = cellCentre(grid, col, row);
      if (distancePointToSegment(centre, a, b) <= radius) fn(col, row, centre);
    }
  }
}

export type BakeOptions = {
  cellSizeM?: number;
  wallHalfThicknessM?: number;
};

/**
 * Rasterises one level's walkable surface.
 *
 * 1. Every cell starts blocked.
 * 2. Cells inside a walkable room (and outside its holes) become walkable.
 * 3. Cells within half a wall thickness of any room boundary are blocked again —
 *    this is what stops two abutting rooms from being freely connected.
 * 4. Doorways re-open their opening (see `carveDoorways`).
 */
export function bakeNavGrid(model: MapModel, levelId: string, opts: BakeOptions = {}): NavGrid {
  const cellSizeM = opts.cellSizeM ?? NAV_CELL_SIZE_M;
  const wallHalf = opts.wallHalfThicknessM ?? WALL_HALF_THICKNESS_M;

  const rooms = live(model.rooms).filter(r => r.levelId === levelId && r.walkable);
  if (rooms.length === 0) return emptyGrid(levelId, cellSizeM);

  const bbox = bboxOfRings(rooms.map(r => r.footprint));
  const originX = Math.floor((bbox.minX - GRID_PAD_M) / cellSizeM) * cellSizeM;
  const originY = Math.floor((bbox.minY - GRID_PAD_M) / cellSizeM) * cellSizeM;
  const cols = Math.ceil((bbox.maxX + GRID_PAD_M - originX) / cellSizeM);
  const rows = Math.ceil((bbox.maxY + GRID_PAD_M - originY) / cellSizeM);

  const grid: NavGrid = {
    levelId,
    originX,
    originY,
    cols,
    rows,
    cellSizeM,
    bits: new Uint8Array(Math.ceil((cols * rows) / 8)),
  };

  for (const room of rooms) {
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        if (navGridGet(grid, col, row)) continue;
        if (pointInPolygon(cellCentre(grid, col, row), room.footprint, room.holes)) {
          navGridSet(grid, col, row, true);
        }
      }
    }
  }

  const blockRadius = wallHalf + cellSizeM / 2;
  for (const room of rooms) {
    for (const [a, b] of roomSegments(room)) {
      forEachCellNearSegment(grid, a, b, blockRadius, (col, row) => {
        navGridSet(grid, col, row, false);
      });
    }
  }

  return grid;
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run packages/model/src/nav/grid.test.ts`
Expected: PASS — 13 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/model/src/nav
git commit -m "feat(model): bake navigation grid with wall blocking at room boundaries"
```

---

## Task 13: Doorway carving

**Files:**
- Modify: `packages/model/src/nav/grid.ts` (add `carveDoorways`, call it from `bakeNavGrid`)
- Test: `packages/model/src/nav/grid.test.ts` (append)

**Interfaces:**
- Consumes: everything from task 12.
- Produces: `bakeNavGrid` now opens doorway segments; no new exported signature.

- [ ] **Step 1: Write the failing test**

Append to `packages/model/src/nav/grid.test.ts`:

```ts
describe("bakeNavGrid — doorways", () => {
  function gridWithDoorways(rooms: unknown[], doorways: unknown[]) {
    return bakeNavGrid(parseModel({ building, levels: [level], rooms, doorways }), "oth-L1");
  }

  const doorway = {
    id: "L1-door-ab",
    levelId: "oth-L1",
    roomA: "L1-room-a",
    roomB: "L1-room-b",
    segment: [[10, 4], [10, 6]],
    widthM: 2,
  };

  it("opens the wall along the doorway segment", () => {
    const g = gridWithDoorways([roomA, roomB], [doorway]);
    expect(navGridWalkableAt(g, [10, 5])).toBe(true);
    expect(navGridWalkableAt(g, [9.9, 5])).toBe(true);
    expect(navGridWalkableAt(g, [10.1, 5])).toBe(true);
  });

  it("leaves the wall closed away from the doorway", () => {
    const g = gridWithDoorways([roomA, roomB], [doorway]);
    expect(navGridWalkableAt(g, [10, 1])).toBe(false);
    expect(navGridWalkableAt(g, [10, 9])).toBe(false);
  });

  it("opens a wide opening for open-plan boundaries", () => {
    const wide = { ...doorway, segment: [[10, 0], [10, 10]], widthM: 10 };
    const g = gridWithDoorways([roomA, roomB], [wide]);
    expect(navGridWalkableAt(g, [10, 2])).toBe(true);
    expect(navGridWalkableAt(g, [10, 8])).toBe(true);
  });

  it("does not open cells outside both of its rooms", () => {
    const g = gridWithDoorways([roomA, roomB], [doorway]);
    expect(navGridWalkableAt(g, [10, 12])).toBe(false);
  });

  it("ignores a soft-deleted doorway", () => {
    const g = gridWithDoorways(
      [roomA, roomB],
      [{ ...doorway, deletedAt: "2026-09-01T00:00:00.000Z" }],
    );
    expect(navGridWalkableAt(g, [10, 5])).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run packages/model/src/nav/grid.test.ts`
Expected: FAIL — the first doorway test reports `false`, because nothing carves the wall yet.

- [ ] **Step 3: Implement carving**

Add to `packages/model/src/nav/grid.ts`:

```ts
/**
 * Re-opens the wall band along each doorway. A doorway models any opening, so a
 * 12 m gap between a corridor and an atrium is one wide doorway rather than a
 * wall. Only cells inside one of the two joined rooms are opened, so carving can
 * never punch a hole into unmodelled space.
 */
function carveDoorways(grid: NavGrid, model: MapModel, rooms: readonly Room[]): void {
  const byId = new Map(rooms.map(r => [r.id, r]));
  const doorways = live(model.doorways).filter(d => d.levelId === grid.levelId);

  for (const d of doorways) {
    const a = byId.get(d.roomA);
    const b = byId.get(d.roomB);
    if (!a || !b) continue;
    const [s0, s1] = d.segment;
    forEachCellNearSegment(grid, s0, s1, d.widthM / 2, (col, row, centre) => {
      const insideA = pointInPolygon(centre, a.footprint, a.holes);
      const insideB = pointInPolygon(centre, b.footprint, b.holes);
      if (insideA || insideB) navGridSet(grid, col, row, true);
    });
  }
}
```

Then call it at the end of `bakeNavGrid`, immediately before `return grid;`:

```ts
  carveDoorways(grid, model, rooms);

  return grid;
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run packages/model/src/nav/grid.test.ts`
Expected: PASS — 18 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/model/src/nav/grid.ts packages/model/src/nav/grid.test.ts
git commit -m "feat(model): carve doorway openings through the baked wall band"
```

---

## Task 14: Building-wide reachability

**Files:**
- Create: `packages/model/src/nav/reachability.ts`, `packages/model/src/validation/rules/reachability.ts`
- Modify: `packages/model/src/validation/validate.ts`
- Test: `packages/model/src/nav/reachability.test.ts`

**Interfaces:**
- Consumes: `bakeNavGrid`, `navGridGet`, `worldToCell`, `cellCentre`, `pointInPolygon`, `live`.
- Produces: `floodFill(grid, seeds): Uint8Array`, `reachableAt(grid, mask, p): boolean`, `buildingReachability(model, opts?): Map<string, LevelReachability>` where `LevelReachability = { grid: NavGrid; mask: Uint8Array }`; `reachabilityRules: Rule[]`.

- [ ] **Step 1: Write the failing test**

Create `packages/model/src/nav/reachability.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseModel } from "../schema/model";
import { validateModel } from "../validation/validate";
import { reachabilityRules } from "../validation/rules/reachability";
import { buildingReachability, reachableAt } from "./reachability";

const building = { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 };

const levels = [
  { id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6 },
  { id: "oth-L2", buildingId: "oth", code: "L2", ordinal: 2, nameEn: "L2", nameZh: "二楼", elevationM: 6, heightM: 4.5 },
];

const l1Lobby = {
  id: "L1-lobby", levelId: "oth-L1", kind: "atrium",
  footprint: [[0, 0], [10, 0], [10, 10], [0, 10]], heightM: 6, walkable: true,
};
const l1Back = {
  id: "L1-back", levelId: "oth-L1", kind: "room",
  footprint: [[10, 0], [20, 0], [20, 10], [10, 10]], heightM: 6, walkable: true,
};
const l2Hall = {
  id: "L2-hall", levelId: "oth-L2", kind: "corridor",
  footprint: [[0, 0], [10, 0], [10, 10], [0, 10]], heightM: 4.5, walkable: true,
};

const entrance = { id: "e-main", levelId: "oth-L1", roomId: "L1-lobby", point: [5, 5], isPrimary: true };
const doorAB = {
  id: "d-ab", levelId: "oth-L1", roomA: "L1-lobby", roomB: "L1-back",
  segment: [[10, 4], [10, 6]], widthM: 2,
};
const lift = { id: "p-lift", kind: "lift", nameEn: "Lift", nameZh: "电梯" };
const liftEnds = [
  { id: "p-lift-L1", portalId: "p-lift", levelId: "oth-L1", roomId: "L1-lobby", point: [2, 2] },
  { id: "p-lift-L2", portalId: "p-lift", levelId: "oth-L2", roomId: "L2-hall", point: [2, 2] },
];

function model(extra: Record<string, unknown>) {
  return parseModel({ building, levels, entrances: [entrance], ...extra });
}

describe("buildingReachability", () => {
  it("reaches the entrance room", () => {
    const m = model({ rooms: [l1Lobby] });
    const r = buildingReachability(m).get("oth-L1");
    expect(r && reachableAt(r.grid, r.mask, [5, 5])).toBe(true);
  });

  it("reaches an adjoining room through a doorway", () => {
    const m = model({ rooms: [l1Lobby, l1Back], doorways: [doorAB] });
    const r = buildingReachability(m).get("oth-L1");
    expect(r && reachableAt(r.grid, r.mask, [15, 5])).toBe(true);
  });

  it("does not reach an adjoining room with no doorway", () => {
    const m = model({ rooms: [l1Lobby, l1Back] });
    const r = buildingReachability(m).get("oth-L1");
    expect(r && reachableAt(r.grid, r.mask, [15, 5])).toBe(false);
  });

  it("reaches an upper level through a lift portal", () => {
    const m = model({ rooms: [l1Lobby, l2Hall], portals: [lift], portalEndpoints: liftEnds });
    const r = buildingReachability(m).get("oth-L2");
    expect(r && reachableAt(r.grid, r.mask, [5, 5])).toBe(true);
  });

  it("does not reach an upper level with no portal", () => {
    const m = model({ rooms: [l1Lobby, l2Hall] });
    const r = buildingReachability(m).get("oth-L2");
    expect(r && reachableAt(r.grid, r.mask, [5, 5])).toBe(false);
  });
});

describe("reachability rule", () => {
  function codes(extra: Record<string, unknown>) {
    return validateModel(model(extra), reachabilityRules).issues.map(i => i.code);
  }

  it("passes when everything is reachable", () => {
    expect(codes({ rooms: [l1Lobby, l1Back], doorways: [doorAB] })).toEqual([]);
  });

  it("flags a walkable room cut off from every entrance", () => {
    expect(codes({ rooms: [l1Lobby, l1Back] })).toContain("room.unreachable");
  });

  it("flags a modelled upper level with no portal serving it", () => {
    expect(codes({ rooms: [l1Lobby, l2Hall] })).toContain("room.unreachable");
  });

  it("does not flag non-walkable rooms", () => {
    expect(codes({ rooms: [l1Lobby, { ...l1Back, walkable: false }] })).toEqual([]);
  });

  it("errors when the model has no entrance at all", () => {
    const m = parseModel({ building, levels, rooms: [l1Lobby] });
    expect(validateModel(m, reachabilityRules).issues.map(i => i.code)).toContain(
      "building.entrances.none",
    );
  });
});
```

The upper-level test is the one that earns this task: it is what catches "L5 is modelled but no lift actually serves it", which no amount of per-level checking would find.

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run packages/model/src/nav/reachability.test.ts`
Expected: FAIL — cannot resolve `./reachability`.

- [ ] **Step 3: Implement the flood fill**

Create `packages/model/src/nav/reachability.ts`:

```ts
import type { Vec2 } from "../primitives";
import type { MapModel } from "../schema/model";
import { live } from "../primitives";
import type { BakeOptions, NavGrid } from "./grid";
import { bakeNavGrid, navGridCellCount, navGridGet, worldToCell } from "./grid";

export type LevelReachability = { grid: NavGrid; mask: Uint8Array };

function maskGet(mask: Uint8Array, i: number): boolean {
  const byte = mask[i >> 3];
  return byte !== undefined && (byte & (1 << (i & 7))) !== 0;
}

function maskSet(mask: Uint8Array, i: number): void {
  const byteIdx = i >> 3;
  const byte = mask[byteIdx];
  if (byte === undefined) return;
  mask[byteIdx] = byte | (1 << (i & 7));
}

/** Four-connected flood fill over walkable cells, starting from world-space seeds. */
export function floodFill(grid: NavGrid, seeds: readonly Vec2[]): Uint8Array {
  const mask = new Uint8Array(Math.ceil(navGridCellCount(grid) / 8));
  if (grid.cols === 0 || grid.rows === 0) return mask;

  const queue: number[] = [];
  for (const seed of seeds) {
    const { col, row } = worldToCell(grid, seed);
    if (!navGridGet(grid, col, row)) continue;
    const i = row * grid.cols + col;
    if (maskGet(mask, i)) continue;
    maskSet(mask, i);
    queue.push(i);
  }

  while (queue.length > 0) {
    const i = queue.pop();
    if (i === undefined) break;
    const col = i % grid.cols;
    const row = Math.floor(i / grid.cols);
    const neighbours: Array<[number, number]> = [
      [col + 1, row],
      [col - 1, row],
      [col, row + 1],
      [col, row - 1],
    ];
    for (const [nc, nr] of neighbours) {
      if (nc < 0 || nr < 0 || nc >= grid.cols || nr >= grid.rows) continue;
      if (!navGridGet(grid, nc, nr)) continue;
      const ni = nr * grid.cols + nc;
      if (maskGet(mask, ni)) continue;
      maskSet(mask, ni);
      queue.push(ni);
    }
  }
  return mask;
}

export function reachableAt(grid: NavGrid, mask: Uint8Array, p: Vec2): boolean {
  const { col, row } = worldToCell(grid, p);
  if (col < 0 || row < 0 || col >= grid.cols || row >= grid.rows) return false;
  return maskGet(mask, row * grid.cols + col);
}

/**
 * Whole-building reachability. Floods every level from its current seeds, then
 * propagates across portals whose endpoint has become reachable, and repeats
 * until nothing new is reached. This is what catches a modelled upper level that
 * no lift or stair actually serves.
 */
export function buildingReachability(
  model: MapModel,
  opts: BakeOptions = {},
): Map<string, LevelReachability> {
  const levels = live(model.levels);
  const grids = new Map<string, NavGrid>();
  for (const level of levels) {
    grids.set(level.id, bakeNavGrid(model, level.id, opts));
  }

  const seeds = new Map<string, Vec2[]>();
  for (const level of levels) seeds.set(level.id, []);
  for (const entrance of live(model.entrances)) {
    seeds.get(entrance.levelId)?.push(entrance.point);
  }

  const endpoints = live(model.portalEndpoints);
  const result = new Map<string, LevelReachability>();

  for (let pass = 0; pass <= levels.length; pass++) {
    let grew = false;

    for (const level of levels) {
      const grid = grids.get(level.id);
      if (!grid) continue;
      result.set(level.id, { grid, mask: floodFill(grid, seeds.get(level.id) ?? []) });
    }

    for (const ep of endpoints) {
      const from = result.get(ep.levelId);
      if (!from || !reachableAt(from.grid, from.mask, ep.point)) continue;
      for (const other of endpoints) {
        if (other.portalId !== ep.portalId || other.id === ep.id) continue;
        const list = seeds.get(other.levelId);
        if (!list) continue;
        const already = list.some(p => p[0] === other.point[0] && p[1] === other.point[1]);
        if (!already) {
          list.push(other.point);
          grew = true;
        }
      }
    }

    if (!grew) break;
  }

  return result;
}
```

- [ ] **Step 4: Implement the rule**

Create `packages/model/src/validation/rules/reachability.ts`:

```ts
import { pointInPolygon } from "../../geometry/point";
import { cellCentre, navGridGet } from "../../nav/grid";
import { buildingReachability } from "../../nav/reachability";
import type { Rule, ValidationIssue } from "../types";
import { live } from "../../primitives";

const reachable: Rule = model => {
  const rooms = live(model.rooms).filter(r => r.walkable);
  if (rooms.length === 0) return [];

  if (live(model.entrances).length === 0) {
    return [
      {
        severity: "error",
        code: "building.entrances.none",
        message: "The model has walkable rooms but no entrance, so nothing is reachable.",
        entityType: "building",
        entityId: model.building.id,
      },
    ];
  }

  const byLevel = buildingReachability(model);
  const issues: ValidationIssue[] = [];

  for (const room of rooms) {
    const level = byLevel.get(room.levelId);
    if (!level) continue;
    const { grid, mask } = level;

    let anyReachable = false;
    for (let row = 0; row < grid.rows && !anyReachable; row++) {
      for (let col = 0; col < grid.cols; col++) {
        if (!navGridGet(grid, col, row)) continue;
        const centre = cellCentre(grid, col, row);
        if (!pointInPolygon(centre, room.footprint, room.holes)) continue;
        const i = row * grid.cols + col;
        const byte = mask[i >> 3];
        if (byte !== undefined && (byte & (1 << (i & 7))) !== 0) {
          anyReachable = true;
          break;
        }
      }
    }

    if (!anyReachable) {
      issues.push({
        severity: "error",
        code: "room.unreachable",
        message: `Room "${room.id}" is walkable but cannot be reached from any entrance. Check for a missing doorway or portal.`,
        entityType: "room",
        entityId: room.id,
        levelId: room.levelId,
      });
    }
  }
  return issues;
};

export const reachabilityRules: Rule[] = [reachable];
```

- [ ] **Step 5: Register the rules**

Modify `packages/model/src/validation/validate.ts` so `ALL_RULES` reads:

```ts
export const ALL_RULES: Rule[] = [...structureRules, ...referenceRules, ...reachabilityRules];
```

with the matching import:

```ts
import { reachabilityRules } from "./rules/reachability";
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run packages/model/src/nav packages/model/src/validation`
Expected: PASS — all reachability and validation tests.

- [ ] **Step 7: Commit**

```bash
git add packages/model/src/nav packages/model/src/validation
git commit -m "feat(model): building-wide reachability across portals + unreachable-room rule"
```

---

## Task 15: Quality warnings

**Files:**
- Create: `packages/model/src/validation/rules/warnings.ts`
- Modify: `packages/model/src/validation/validate.ts`
- Test: `packages/model/src/validation/rules/warnings.test.ts`

**Interfaces:**
- Consumes: `live`, `bboxOfRing`, `bboxContains`, `MapModel`.
- Produces: `warningRules: Rule[]`.

- [ ] **Step 1: Write the failing test**

Create `packages/model/src/validation/rules/warnings.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseModel } from "../../schema/model";
import { validateModel } from "../validate";
import { warningRules } from "./warnings";

const building = { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 };
const level = {
  id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1,
  nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6,
};
const room = {
  id: "L1-room-a", levelId: "oth-L1", kind: "room",
  footprint: [[0, 0], [10, 0], [10, 10], [0, 10]],
  heightM: 3.5, walkable: true, nameEn: "Room A", nameZh: "A室",
};

function report(extra: Record<string, unknown>) {
  return validateModel(parseModel({ building, levels: [level], rooms: [room], ...extra }), warningRules);
}

describe("warning rules", () => {
  it("produces no warnings for a tidy model", () => {
    expect(report({ portals: [], entrances: [] }).issues.map(i => i.code)).not.toContain(
      "room.name.missing",
    );
  });

  it("never blocks publish — every issue is a warning", () => {
    const r = report({ rooms: [{ ...room, nameEn: "", nameZh: "" }] });
    expect(r.errorCount).toBe(0);
    expect(r.ok).toBe(true);
  });

  it("warns about an unnamed room", () => {
    expect(
      report({ rooms: [{ ...room, nameEn: "", nameZh: "" }] }).issues.map(i => i.code),
    ).toContain("room.name.missing");
  });

  it("warns about an unverified tenant", () => {
    expect(
      report({
        tenants: [
          {
            id: "t1", levelId: "oth-L1", roomId: "L1-room-a",
            nameEn: "Shop", nameZh: "商店", category: "retail",
            sourceUrl: "https://example.com/",
          },
        ],
      }).issues.map(i => i.code),
    ).toContain("tenant.unverified");
  });

  it("does not warn about a verified tenant", () => {
    expect(
      report({
        tenants: [
          {
            id: "t1", levelId: "oth-L1", roomId: "L1-room-a",
            nameEn: "Shop", nameZh: "商店", category: "retail",
            sourceUrl: "https://example.com/",
            verification: { status: "onsite", evidence: ["photo:1"] },
          },
        ],
      }).issues.map(i => i.code),
    ).not.toContain("tenant.unverified");
  });

  it("warns when a level has no portal serving it", () => {
    expect(report({}).issues.map(i => i.code)).toContain("level.portals.none");
  });

  it("warns when a placement escapes its anchor room", () => {
    expect(
      report({
        assets: [
          {
            id: "a1", filename: "x.glb", storagePath: "assets/x.glb", checksum: "x",
            sizeBytes: 1000, triangleCount: 100,
            bbox: { minX: -1, minY: -1, minZ: 0, maxX: 1, maxY: 1, maxZ: 2 },
          },
        ],
        placements: [
          { id: "pl1", levelId: "oth-L1", assetId: "a1", roomId: "L1-room-a", position: [50, 50, 0] },
        ],
      }).issues.map(i => i.code),
    ).toContain("placement.outsideAnchorRoom");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run packages/model/src/validation/rules/warnings.test.ts`
Expected: FAIL — cannot resolve `./warnings`.

- [ ] **Step 3: Implement**

Create `packages/model/src/validation/rules/warnings.ts`:

```ts
import { bboxContains, bboxOfRing } from "../../geometry/point";
import type { Rule, ValidationIssue } from "../types";
import { live } from "../../primitives";

/** Warnings surface quality problems without blocking a publish. */
const unnamedRooms: Rule = model =>
  live(model.rooms)
    .filter(r => r.nameEn.trim() === "" && r.nameZh.trim() === "")
    .map<ValidationIssue>(r => ({
      severity: "warning",
      code: "room.name.missing",
      message: `Room "${r.id}" has no name in either language.`,
      entityType: "room",
      entityId: r.id,
      levelId: r.levelId,
    }));

const unverifiedTenants: Rule = model =>
  live(model.tenants)
    .filter(t => t.verification.status === "unverified")
    .map<ValidationIssue>(t => ({
      severity: "warning",
      code: "tenant.unverified",
      message: `Tenant "${t.nameEn}" has never been verified against the real building.`,
      entityType: "tenant",
      entityId: t.id,
      levelId: t.levelId,
    }));

const levelsWithoutPortals: Rule = model => {
  const served = new Set(live(model.portalEndpoints).map(ep => ep.levelId));
  return live(model.levels)
    .filter(l => !served.has(l.id))
    .map<ValidationIssue>(l => ({
      severity: "warning",
      code: "level.portals.none",
      message: `Level "${l.code}" has no lift, stair or escalator endpoint.`,
      entityType: "level",
      entityId: l.id,
      levelId: l.id,
    }));
};

const placementsOutsideAnchor: Rule = model => {
  const rooms = new Map(live(model.rooms).map(r => [r.id, r]));
  const assets = new Map(live(model.assets).map(a => [a.id, a]));
  const issues: ValidationIssue[] = [];

  for (const p of live(model.placements)) {
    if (!p.roomId) continue;
    const room = rooms.get(p.roomId);
    const asset = assets.get(p.assetId);
    if (!room || !asset) continue;

    const placed = {
      minX: p.position[0] + asset.bbox.minX * p.scale,
      minY: p.position[1] + asset.bbox.minY * p.scale,
      maxX: p.position[0] + asset.bbox.maxX * p.scale,
      maxY: p.position[1] + asset.bbox.maxY * p.scale,
    };

    if (!bboxContains(bboxOfRing(room.footprint), placed)) {
      issues.push({
        severity: "warning",
        code: "placement.outsideAnchorRoom",
        message: `Placement "${p.id}" extends outside its anchor room "${p.roomId}".`,
        entityType: "placement",
        entityId: p.id,
        levelId: p.levelId,
      });
    }
  }
  return issues;
};

export const warningRules: Rule[] = [
  unnamedRooms,
  unverifiedTenants,
  levelsWithoutPortals,
  placementsOutsideAnchor,
];
```

Note this uses the asset's XY bounding box only — placements are rotated about the vertical axis, so the footprint check ignores Z deliberately.

- [ ] **Step 4: Register and export**

Modify `packages/model/src/validation/validate.ts`:

```ts
import { warningRules } from "./rules/warnings";

export const ALL_RULES: Rule[] = [
  ...structureRules,
  ...referenceRules,
  ...reachabilityRules,
  ...warningRules,
];
```

Add to `packages/model/src/index.ts`:

```ts
export * from "./validation/types";
export * from "./validation/validate";
export * from "./nav/grid";
export * from "./nav/reachability";
```

- [ ] **Step 5: Run everything**

```bash
npm test
npm run typecheck
```

Expected: all tests pass, no type errors.

- [ ] **Step 6: Commit**

```bash
git add packages/model/src
git commit -m "feat(model): non-blocking quality warnings for names, verification, portals, placements"
```

---

## Task 16: Deterministic bundle builder

**Files:**
- Create: `packages/model/src/bundle/serialise.ts`, `packages/model/src/bundle/build.ts`, `packages/model/src/bundle/index.ts`
- Test: `packages/model/src/bundle/serialise.test.ts`, `packages/model/src/bundle/build.test.ts`

**Interfaces:**
- Consumes: `MapModel`, `validateModel`, `bakeNavGrid`, `live`.
- Produces: `stableStringify(value): string`, `round3(n): number`; `BundleFile = { path: string; contents: string }`; `buildBundle(model, meta): BundleFile[]`; `BundleMeta = { version: string; createdAt: string; createdBy: string; notes?: string }`.

- [ ] **Step 1: Write the failing serialisation test**

Create `packages/model/src/bundle/serialise.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { round3, stableStringify } from "./serialise";

describe("round3", () => {
  it("rounds to millimetre precision", () => {
    expect(round3(1.23456)).toBe(1.235);
  });

  it("leaves integers alone", () => {
    expect(round3(42)).toBe(42);
  });

  it("does not produce negative zero", () => {
    expect(Object.is(round3(-0.0001), 0)).toBe(true);
  });
});

describe("stableStringify", () => {
  it("sorts object keys so key insertion order cannot change the bytes", () => {
    expect(stableStringify({ b: 1, a: 2 })).toBe(stableStringify({ a: 2, b: 1 }));
  });

  it("preserves array order, which is meaningful for rings", () => {
    expect(stableStringify([3, 1, 2])).toBe("[3,1,2]");
  });

  it("rounds nested floats", () => {
    expect(stableStringify({ p: [1.23456, 2.99999] })).toBe('{"p":[1.235,3]}');
  });

  it("handles null and nested objects", () => {
    expect(stableStringify({ z: null, a: { y: 1, x: 2 } })).toBe('{"a":{"x":2,"y":1},"z":null}');
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run packages/model/src/bundle/serialise.test.ts`
Expected: FAIL — cannot resolve `./serialise`.

- [ ] **Step 3: Implement serialisation**

Create `packages/model/src/bundle/serialise.ts`:

```ts
/** Millimetre precision. Bundles must not churn on floating-point noise. */
export function round3(n: number): number {
  const r = Math.round(n * 1000) / 1000;
  return r === 0 ? 0 : r;
}

/**
 * JSON with sorted object keys and rounded floats. Two models that differ only
 * in key insertion order or in the twelfth decimal place produce byte-identical
 * bundles, which is what makes published versions comparable and cacheable.
 */
export function stableStringify(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "number") return JSON.stringify(round3(value));
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
  }
  return "null";
}
```

- [ ] **Step 4: Run the serialisation test**

Run: `npx vitest run packages/model/src/bundle/serialise.test.ts`
Expected: PASS — 7 tests.

- [ ] **Step 5: Write the failing build test**

Create `packages/model/src/bundle/build.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseModel } from "../schema/model";
import { buildBundle } from "./build";

const meta = {
  version: "2026-09-04T12-00-00",
  createdAt: "2026-09-04T12:00:00.000Z",
  createdBy: "user_1",
};

const model = parseModel({
  building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
  levels: [
    { id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6 },
  ],
  rooms: [
    {
      id: "L1-lobby", levelId: "oth-L1", kind: "atrium",
      footprint: [[0, 0], [10, 0], [10, 10], [0, 10]],
      heightM: 6, walkable: true, nameEn: "Lobby", nameZh: "大堂",
    },
  ],
  entrances: [{ id: "e-main", levelId: "oth-L1", roomId: "L1-lobby", point: [5, 5] }],
});

function paths(files: { path: string }[]) {
  return files.map(f => f.path).sort();
}

describe("buildBundle", () => {
  it("emits the documented file set", () => {
    expect(paths(buildBundle(model, meta))).toEqual([
      "building.json",
      "levels/L1.json",
      "manifest.json",
      "nav.json",
      "placements.json",
    ]);
  });

  it("is byte-identical across repeated builds", () => {
    const a = buildBundle(model, meta);
    const b = buildBundle(model, meta);
    expect(a.map(f => f.contents)).toEqual(b.map(f => f.contents));
  });

  it("records a checksum for every non-manifest file", () => {
    const files = buildBundle(model, meta);
    const manifest = JSON.parse(files.find(f => f.path === "manifest.json")?.contents ?? "{}");
    expect(Object.keys(manifest.checksums).sort()).toEqual([
      "building.json",
      "levels/L1.json",
      "nav.json",
      "placements.json",
    ]);
  });

  it("carries the publish metadata into the manifest", () => {
    const files = buildBundle(model, meta);
    const manifest = JSON.parse(files.find(f => f.path === "manifest.json")?.contents ?? "{}");
    expect(manifest.version).toBe(meta.version);
    expect(manifest.createdBy).toBe("user_1");
  });

  it("bakes a navigation grid per level into nav.json", () => {
    const files = buildBundle(model, meta);
    const nav = JSON.parse(files.find(f => f.path === "nav.json")?.contents ?? "{}");
    expect(nav.grids).toHaveLength(1);
    expect(nav.grids[0].levelId).toBe("oth-L1");
    expect(nav.grids[0].cellSizeM).toBe(0.25);
    expect(typeof nav.grids[0].bits).toBe("string");
  });

  it("refuses to build a model that fails validation", () => {
    const broken = parseModel({
      building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
      levels: [
        { id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6 },
      ],
      rooms: [
        {
          id: "bad", levelId: "oth-L1", kind: "room",
          footprint: [[0, 0], [2, 2], [2, 0], [0, 2]],
          heightM: 3, walkable: true,
        },
      ],
      entrances: [{ id: "e", levelId: "oth-L1", roomId: "bad", point: [1, 1] }],
    });
    expect(() => buildBundle(broken, meta)).toThrow(/validation/i);
  });

  it("omits soft-deleted entities from the published bundle", () => {
    const withDeleted = parseModel({
      building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
      levels: [
        { id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6 },
      ],
      rooms: [
        {
          id: "L1-lobby", levelId: "oth-L1", kind: "atrium",
          footprint: [[0, 0], [10, 0], [10, 10], [0, 10]],
          heightM: 6, walkable: true, nameEn: "Lobby", nameZh: "大堂",
        },
        {
          id: "L1-old", levelId: "oth-L1", kind: "room",
          footprint: [[20, 20], [30, 20], [30, 30], [20, 30]],
          heightM: 6, walkable: true, deletedAt: "2026-09-01T00:00:00.000Z",
        },
      ],
      entrances: [{ id: "e-main", levelId: "oth-L1", roomId: "L1-lobby", point: [5, 5] }],
    });
    const files = buildBundle(withDeleted, meta);
    const l1 = files.find(f => f.path === "levels/L1.json")?.contents ?? "";
    expect(l1).not.toContain("L1-old");
  });
});
```

- [ ] **Step 6: Run it and watch it fail**

Run: `npx vitest run packages/model/src/bundle/build.test.ts`
Expected: FAIL — cannot resolve `./build`.

- [ ] **Step 7: Implement the builder**

Create `packages/model/src/bundle/build.ts`:

```ts
import { createHash } from "node:crypto";
import { bakeNavGrid } from "../nav/grid";
import type { MapModel } from "../schema/model";
import { live } from "../primitives";
import { validateModel } from "../validation/validate";
import { stableStringify } from "./serialise";

export type BundleFile = { path: string; contents: string };

export type BundleMeta = {
  version: string;
  createdAt: string;
  createdBy: string;
  notes?: string;
};

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function byId<T extends { id: string }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * Snapshots a model into the immutable published bundle.
 *
 * Throws if validation reports any error — the publish gate refuses to ship a
 * broken model rather than letting a visitor-facing app render it. Soft-deleted
 * entities never reach the bundle.
 */
export function buildBundle(model: MapModel, meta: BundleMeta): BundleFile[] {
  const report = validateModel(model);
  if (!report.ok) {
    const first = report.issues.find(i => i.severity === "error");
    throw new Error(
      `Refusing to publish: validation failed with ${report.errorCount} error(s). First: ${first?.code} — ${first?.message}`,
    );
  }

  const levels = byId(live(model.levels));
  const files: BundleFile[] = [];

  files.push({
    path: "building.json",
    contents: stableStringify({
      building: model.building,
      levels,
    }),
  });

  for (const level of levels) {
    files.push({
      path: `levels/${level.code}.json`,
      contents: stableStringify({
        levelId: level.id,
        code: level.code,
        rooms: byId(live(model.rooms).filter(r => r.levelId === level.id)),
        doorways: byId(live(model.doorways).filter(d => d.levelId === level.id)),
        entrances: byId(live(model.entrances).filter(e => e.levelId === level.id)),
        tenants: byId(live(model.tenants).filter(t => t.levelId === level.id)),
      }),
    });
  }

  files.push({
    path: "nav.json",
    contents: stableStringify({
      portals: byId(live(model.portals)),
      portalEndpoints: byId(live(model.portalEndpoints)),
      navHints: byId(live(model.navHints)),
      grids: levels.map(level => {
        const grid = bakeNavGrid(model, level.id);
        return {
          levelId: grid.levelId,
          originX: grid.originX,
          originY: grid.originY,
          cols: grid.cols,
          rows: grid.rows,
          cellSizeM: grid.cellSizeM,
          /** Packed bitmask, base64. ~60 KB per level at OTH's footprint. */
          bits: Buffer.from(grid.bits).toString("base64"),
        };
      }),
    }),
  });

  files.push({
    path: "placements.json",
    contents: stableStringify({
      assets: byId(live(model.assets)),
      placements: byId(live(model.placements)),
    }),
  });

  const checksums: Record<string, string> = {};
  for (const f of files) checksums[f.path] = sha256(f.contents);

  files.push({
    path: "manifest.json",
    contents: stableStringify({
      version: meta.version,
      createdAt: meta.createdAt,
      createdBy: meta.createdBy,
      notes: meta.notes ?? "",
      warningCount: report.warningCount,
      files: files.map(f => f.path).sort(),
      checksums,
    }),
  });

  return files;
}
```

- [ ] **Step 8: Add the bundle entry point**

Create `packages/model/src/bundle/index.ts`:

```ts
export * from "./serialise";
export * from "./build";
```

This is a separate entry (`@oth/model/bundle`) because `build.ts` imports `node:crypto`. Keeping it out of the main entry means the editor and viewer can import `@oth/model` in a browser without pulling a Node builtin into the bundle.

**On `assets/<hash>.glb`:** the spec's bundle layout includes the binary assets, but `buildBundle` deliberately returns text files only. The `.glb` files live on the server's volume and are content-addressed there already; copying them into a bundle is a filesystem operation, which is exactly what this package must not do. The server's publish endpoint (plan 2) writes these text files and copies the referenced assets alongside them. `placements.json` carries the asset records, so the set to copy is derivable from the bundle itself.

- [ ] **Step 9: Run everything**

```bash
npm test
npm run typecheck
```

Expected: all tests pass, no type errors.

- [ ] **Step 10: Commit**

```bash
git add packages/model/src/bundle
git commit -m "feat(model): deterministic published-bundle builder gated on validation"
```

---

## Done criteria

Plan 1 is complete when:

- `npm test` passes at the repo root with every task's tests green.
- `npm run typecheck` is clean under `strict` and `noUncheckedIndexedAccess`.
- `@oth/model` exports schemas, geometry, validation, and nav baking from `.`, and the bundle builder from `./bundle`.
- The hackathon app lives in `legacy/` and the root is a clean workspace.

Plan 2 (server) is written against these exact signatures once they exist.
