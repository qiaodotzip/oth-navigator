# Pathways and Space Kinds Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace room-adjacency navigation with an explicitly drawn pathway network, split "room" into the kinds of space OTH actually has, and remove the nav bake's O(rooms × cells) ceiling while we are in there.

**Architecture:** A pathway is walkable surface asserted directly — a centre line with a width — and it carves the nav grid *last* and *unconditionally*, so nothing a wall rule does can close a route a human drew. Doorways keep working and keep their restriction to the two rooms they join; they simply stop being the primitive you are forced to use. Everything geometric stays a pure function in `@oth/model` with its own tests.

**Tech Stack:** TypeScript, Zod, Drizzle, React, Vitest. No new dependencies.

**Spec:** [`docs/design-and-plans/specs/2026-09-05-pathways-and-space-kinds-design.md`](../specs/2026-09-05-pathways-and-space-kinds-design.md)

## Global Constraints

- **Pathways carve unconditionally**, after wall blocking and after doorways. A doorway may only open cells inside the two rooms it joins; a pathway opens every cell within half its width, wherever it is.
- **Bake order is: areas open → walls close → doorways carve → pathways carve.** Pathways last.
- **`RoomKind` is `room | area | service | void`.** `corridor`, `atrium` and `outdoor` are gone; a corridor is a pathway now.
- **A shop is a room with a retail tenant**, not a kind. Occupancy stays in the semantics layer.
- **Default pathway width is 2.4 m**, roughly a two-person corridor.
- **`room.noAccess` is a warning, not an error** — on an approximate floorplan, blocking publish on it would mean a rough plan could never be published.
- **Room access radius is 3 m.**
- **Doorways stay** in the model, the bake and the tests.
- **The bake optimisation must not change behaviour** — same model in, byte-identical grid out.
- **TypeScript strict**, tests beside the code, Vitest.

---

## File Structure

`packages/model/`:
- modify `src/schema/structure.ts` — `RoomKindSchema`
- modify `src/schema/navigation.ts` — `PathwaySchema`
- modify `src/schema/model.ts` — `pathways` collection
- modify `src/nav/grid.ts` — pathway carving, per-room bbox scan
- create `src/validation/rules/access.ts` — the three new rules
- modify `src/validation/rules/reachability.ts` — areas, not every walkable room
- modify `src/validation/validate.ts` — register

`packages/server/`:
- modify `src/db/schema.ts` — `pathways` table
- modify `src/entities/registry.ts` — register the type
- modify `src/model/assemble.ts` — include pathways

`packages/editor/`:
- modify `src/state/store.ts` — `draw-area`, `draw-pathway` tools
- modify `src/plan/PlanCanvas.tsx` — render and commit pathways
- create `src/plan/PathwayShape.tsx` — a pathway drawn at its real width
- modify `src/flow/checklist.ts` — pathways step
- modify `src/flow/layers.ts` — Areas / Rooms / Pathways groups
- modify `src/panels/Toolbar.tsx`, `src/App.tsx`

`packages/renderer/`:
- modify `src/theme.ts` — colours for the new kinds

---

## Task 1: Space kinds

**Files:**
- Modify: `packages/model/src/schema/structure.ts`, `packages/renderer/src/theme.ts`
- Test: `packages/model/src/schema/structure.test.ts`, `packages/renderer/src/theme.test.ts`, and every test using a removed kind

**Interfaces:**
- Produces: `RoomKindSchema = z.enum(["room", "area", "service", "void"])`; `RoomKind` narrows accordingly.

- [ ] **Step 1: Write the failing test**

Replace the kind tests in `packages/model/src/schema/structure.test.ts`:

```ts
  it("accepts the four spatial kinds", () => {
    for (const kind of ["room", "area", "service", "void"] as const) {
      expect(RoomSchema.parse({ ...room, kind }).kind).toBe(kind);
    }
  });

  it("rejects corridor, which is a pathway now", () => {
    expect(() => RoomSchema.parse({ ...room, kind: "corridor" })).toThrow();
  });

  it("rejects atrium and outdoor, which fold into area", () => {
    expect(() => RoomSchema.parse({ ...room, kind: "atrium" })).toThrow();
    expect(() => RoomSchema.parse({ ...room, kind: "outdoor" })).toThrow();
  });

  it("rejects shop, which is a tenant category rather than a kind", () => {
    expect(() => RoomSchema.parse({ ...room, kind: "shop" })).toThrow();
  });
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run packages/model/src/schema/structure.test.ts`
Expected: FAIL — `"area"` is rejected and `"corridor"` is accepted.

- [ ] **Step 3: Change the enum**

In `packages/model/src/schema/structure.ts`:

```ts
/**
 * The spatial character of a space, not what it is used for.
 *
 * A shop is a `room` with a retail tenant — occupancy belongs to the semantics
 * layer, and making it a kind here would invite `kiosk`, `restaurant` and no
 * principle for stopping. `corridor` is gone because a corridor is a pathway.
 */
export const RoomKindSchema = z.enum([
  /** Enclosed, entered from outside itself: meeting room, studio, shop unit. */
  "room",
  /** Open space you cross freely: town square, event space, stadium floor. */
  "area",
  /** Back of house, not public. */
  "service",
  /** A hole — lightwell, atrium opening. */
  "void",
]);
```

- [ ] **Step 4: Update the renderer's palette**

`packages/renderer/src/theme.ts` keys a `Record<RoomKind, string>`, so the compiler will name the gap. Replace `BASE`:

```ts
const BASE: Record<RoomKind, string> = {
  // A destination reads as a solid block; an area reads as open floor you cross.
  room: "#e7ddc7",
  area: "#f0e8d6",
  service: "#d3d3cc",
  void: "#9aa0a6",
};
```

and the theme test's loop:

```ts
    for (const kind of ["room", "area", "service", "void"] as const) {
```

with the distinction test rewritten, since corridors no longer exist:

```ts
  it("distinguishes an area from a room, since one is crossed and one is entered", () => {
    expect(roomColor("area")).not.toBe(roomColor("room"));
  });
```

- [ ] **Step 5: Fix every other call site**

`corridor` and `atrium` and `outdoor` appear in 18 files, almost all tests. They are all fixtures, so the mapping is mechanical:

```bash
grep -rl '"corridor"\|"atrium"\|"outdoor"' packages/*/src --include=*.ts --include=*.tsx \
  | xargs sed -i 's/"corridor"/"area"/g; s/"atrium"/"area"/g; s/"outdoor"/"area"/g'
```

Then check the seed, which is not a test:

```bash
grep -rn '"corridor"\|"atrium"\|"outdoor"' packages/server/src/cli/ || echo "seed is clean"
```

- [ ] **Step 6: Run everything**

```bash
npm run typecheck
npx vitest run
```

Expected: PASS. The typecheck is the real gate here — `Record<RoomKind, …>` and every `kind:` literal are checked.

- [ ] **Step 7: Commit**

```bash
git add packages/model packages/renderer packages/editor packages/server
git commit -m "feat(model): space kinds become room, area, service, void"
```

---

## Task 2: The pathway entity

**Files:**
- Modify: `packages/model/src/schema/navigation.ts`, `src/schema/model.ts`
- Test: `packages/model/src/schema/navigation.test.ts`, `src/schema/model.test.ts`

**Interfaces:**
- Produces: `PathwaySchema`, `Pathway`, `DEFAULT_PATHWAY_WIDTH_M`; `MapModel` gains `pathways: Pathway[]`.

- [ ] **Step 1: Write the failing test**

Append to `packages/model/src/schema/navigation.test.ts`:

```ts
import { DEFAULT_PATHWAY_WIDTH_M, PathwaySchema } from "./navigation";

describe("PathwaySchema", () => {
  const pathway = {
    id: "L1-path-main",
    levelId: "oth-L1",
    polyline: [[0, 0], [20, 0], [20, 15]],
  };

  it("accepts a centre line", () => {
    expect(PathwaySchema.parse(pathway).polyline).toHaveLength(3);
  });

  it("defaults to a two-person corridor width", () => {
    expect(PathwaySchema.parse(pathway).widthM).toBe(DEFAULT_PATHWAY_WIDTH_M);
    expect(DEFAULT_PATHWAY_WIDTH_M).toBe(2.4);
  });

  it("accepts an explicit width", () => {
    expect(PathwaySchema.parse({ ...pathway, widthM: 6 }).widthM).toBe(6);
  });

  it("defaults to step-free, since most of a hub is level", () => {
    expect(PathwaySchema.parse(pathway).stepFree).toBe(true);
  });

  it("rejects a single point, which is not a path", () => {
    expect(() => PathwaySchema.parse({ ...pathway, polyline: [[0, 0]] })).toThrow();
  });

  it("rejects a non-positive width", () => {
    expect(() => PathwaySchema.parse({ ...pathway, widthM: 0 })).toThrow();
  });
});
```

Append to `packages/model/src/schema/model.test.ts`, inside the `emptyModel` test's assertions:

```ts
    expect(m.pathways).toEqual([]);
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run packages/model/src/schema`
Expected: FAIL — `PathwaySchema` is not exported.

- [ ] **Step 3: Implement**

Append to `packages/model/src/schema/navigation.ts`:

```ts
/** Roughly a two-person corridor. */
export const DEFAULT_PATHWAY_WIDTH_M = 2.4;

/**
 * Walkable surface asserted directly: the centre line of somewhere people walk,
 * with a width.
 *
 * Unlike a doorway, which only connects two rooms whose footprints abut, a
 * pathway is correct by construction — a line down the middle of a corridor is
 * right no matter how wrong the traced footprints around it are. That is the
 * whole point on an approximate floorplan.
 */
export const PathwaySchema = AuditFieldsSchema.extend({
  id: SlugSchema,
  levelId: SlugSchema,
  polyline: z.array(Vec2Schema).min(2),
  widthM: z.number().positive().default(DEFAULT_PATHWAY_WIDTH_M),
  stepFree: z.boolean().default(true),
});

export type Pathway = z.infer<typeof PathwaySchema>;
```

In `packages/model/src/schema/model.ts`, import `PathwaySchema` alongside the other navigation schemas and add to `MapModelSchema` after `navHints`:

```ts
  pathways: z.array(PathwaySchema).default([]),
```

- [ ] **Step 4: Run and commit**

```bash
npx vitest run packages/model
npm run typecheck
git add packages/model
git commit -m "feat(model): pathway entity — walkable surface asserted directly"
```

---

## Task 3: Pathways on the server

**Files:**
- Modify: `packages/server/src/db/schema.ts`, `src/entities/registry.ts`, `src/model/assemble.ts`
- Test: `packages/server/src/model/assemble.test.ts`, `src/entities/routes.test.ts`

**Interfaces:**
- Produces: `pathways` Drizzle table; `"pathway"` in `ENTITY_TYPES`; `assembleModel` returns pathways.

- [ ] **Step 1: Write the failing test**

Append to `packages/server/src/model/assemble.test.ts`:

```ts
describe("pathways", () => {
  it("assembles pathways for the model", async () => {
    await createEntity(db, "room", lobby, "user_1");
    await createEntity(db, "pathway", {
      id: "L1-path", levelId: "oth-L1", polyline: [[0, 0], [10, 0]],
    }, "user_1");
    const model = await assembleModel(db);
    expect(model.pathways).toHaveLength(1);
    expect(model.pathways[0]?.widthM).toBe(2.4);
  });

  it("omits a soft-deleted pathway", async () => {
    await createEntity(db, "pathway", {
      id: "L1-path", levelId: "oth-L1", polyline: [[0, 0], [10, 0]],
    }, "user_1");
    await softDeleteEntity(db, "pathway", "L1-path", 0, "user_1");
    expect((await assembleModel(db)).pathways).toHaveLength(0);
  });
});
```

Append to `packages/server/src/entities/routes.test.ts`:

```ts
  it("creates a pathway through the generic entity route", async () => {
    const res = await post("/api/entities/pathway", {
      data: { id: "L1-path", levelId: "oth-L1", polyline: [[0, 0], [10, 0], [10, 8]] },
    });
    expect(res.status).toBe(201);
  });

  it("422s a pathway with a single point", async () => {
    const res = await post("/api/entities/pathway", {
      data: { id: "L1-bad", levelId: "oth-L1", polyline: [[0, 0]] },
    });
    expect(res.status).toBe(422);
  });
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run packages/server/src/model packages/server/src/entities`
Expected: FAIL — `"pathway"` is not a known entity type.

- [ ] **Step 3: Add the table**

Append to `packages/server/src/db/schema.ts`:

```ts
/**
 * Walkable surface drawn by hand. See navigation.ts in @oth/model for why this
 * exists rather than deriving walkability from room adjacency.
 */
export const pathways = pgTable("pathways", {
  id: text("id").primaryKey(),
  levelId: text("level_id").notNull(),
  polyline: jsonb("polyline").$type<[number, number][]>().notNull(),
  widthM: doublePrecision("width_m").notNull().default(2.4),
  stepFree: boolean("step_free").notNull().default(true),
  ...auditColumns,
}, t => ({ levelIdx: index("pathways_level_idx").on(t.levelId) }));
```

- [ ] **Step 4: Register the entity type**

In `packages/server/src/entities/registry.ts`, add `"pathway"` to `ENTITY_TYPES` after `"navHint"`, import `PathwaySchema` from `@oth/model`, and add to `entityRegistry`:

```ts
  pathway: { table: schema.pathways as EntityTable, schema: PathwaySchema },
```

- [ ] **Step 5: Assemble them**

In `packages/server/src/model/assemble.ts`, add after `navHints`:

```ts
    pathways: await liveRows(db, schema.pathways as EntityTable),
```

- [ ] **Step 6: Generate the migration, run, commit**

```bash
npm run db:generate --workspace @oth/server
npx vitest run packages/server
npm run typecheck
git add packages/server
git commit -m "feat(server): pathways table, entity type and assembly"
```

---

## Task 4: Pathway carving

**Files:**
- Modify: `packages/model/src/nav/grid.ts`
- Test: `packages/model/src/nav/grid.test.ts`

**Interfaces:**
- Consumes: `forEachCellNearSegment`, `navGridSet` (already private to `grid.ts`).
- Produces: `bakeNavGrid` now carves pathways last; the grid's extent includes them.

- [ ] **Step 1: Write the failing test**

Append to `packages/model/src/nav/grid.test.ts`:

```ts
describe("bakeNavGrid — pathways", () => {
  function gridWith(rooms: unknown[], pathways: unknown[], doorways: unknown[] = []) {
    return bakeNavGrid(
      parseModel({ building, levels: [level], rooms, doorways, pathways }),
      "oth-L1",
    );
  }

  const path = { id: "L1-path", levelId: "oth-L1", polyline: [[5, 5], [15, 5]], widthM: 2 };

  it("opens the cells along its centre line", () => {
    const g = gridWith([roomA, roomB], [path]);
    expect(navGridWalkableAt(g, [10, 5])).toBe(true);
  });

  it("carves straight through a wall between two rooms, with no doorway", () => {
    // This is the whole point: a doorway needs the footprints to abut exactly,
    // and a pathway does not.
    const g = gridWith([roomA, roomB], [path]);
    expect(navGridWalkableAt(g, [10, 5])).toBe(true);
    expect(navGridWalkableAt(g, [9.9, 5])).toBe(true);
    expect(navGridWalkableAt(g, [10.1, 5])).toBe(true);
  });

  it("opens cells outside every room, unlike a doorway", () => {
    const outside = { ...path, polyline: [[-8, 5], [-2, 5]] };
    expect(navGridWalkableAt(gridWith([roomA], [outside]), [-5, 5])).toBe(true);
  });

  it("respects its width", () => {
    const wide = { ...path, widthM: 6 };
    const g = gridWith([roomA, roomB], [wide]);
    expect(navGridWalkableAt(g, [10, 7.5])).toBe(true);
    expect(navGridWalkableAt(gridWith([roomA, roomB], [path]), [10, 7.5])).toBe(false);
  });

  it("wins over the wall band, because it is carved last", () => {
    // A wall would otherwise close these cells; the human drew a path there.
    const alongWall = { ...path, polyline: [[10, 0], [10, 10]], widthM: 1 };
    expect(navGridWalkableAt(gridWith([roomA, roomB], [alongWall]), [10, 2])).toBe(true);
  });

  it("extends the grid to cover a pathway outside the rooms", () => {
    const far = { ...path, polyline: [[40, 5], [60, 5]] };
    expect(navGridWalkableAt(gridWith([roomA], [far]), [50, 5])).toBe(true);
  });

  it("bakes a level that has only a pathway and no rooms at all", () => {
    const g = gridWith([], [path]);
    expect(g.cols).toBeGreaterThan(0);
    expect(navGridWalkableAt(g, [10, 5])).toBe(true);
  });

  it("ignores a soft-deleted pathway", () => {
    const g = gridWith([roomA], [{ ...path, deletedAt: "2026-09-01T00:00:00.000Z" }]);
    expect(navGridWalkableAt(g, [10, 5])).toBe(false);
  });

  it("ignores a pathway on another level", () => {
    const g = gridWith([roomA], [{ ...path, levelId: "oth-L9" }]);
    expect(navGridWalkableAt(g, [10, 5])).toBe(false);
  });
});
```

The "only a pathway and no rooms" case matters: it is the state a level is in the moment someone starts drawing, and the old bake returned an empty grid whenever there were no walkable rooms.

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run packages/model/src/nav/grid.test.ts`
Expected: FAIL — pathways are not baked, and a level with no walkable rooms returns an empty grid.

- [ ] **Step 3: Implement**

In `packages/model/src/nav/grid.ts`, add the carve function after `carveDoorways`:

```ts
/**
 * Opens every cell within half a pathway's width, wherever it is.
 *
 * Deliberately unrestricted, unlike `carveDoorways`, which may only open cells
 * inside the two rooms it joins. That restriction is exactly what makes a
 * doorway depend on footprints abutting exactly; a pathway is a human asserting
 * that people walk here, and it is carved last so no wall rule can override it.
 */
function carvePathways(grid: NavGrid, model: MapModel): void {
  for (const p of live(model.pathways).filter(p => p.levelId === grid.levelId)) {
    for (let i = 0; i + 1 < p.polyline.length; i++) {
      const a = p.polyline[i];
      const b = p.polyline[i + 1];
      if (!a || !b) continue;
      forEachCellNearSegment(grid, a, b, p.widthM / 2, (col, row) => {
        navGridSet(grid, col, row, true);
      });
    }
  }
}
```

Then change `bakeNavGrid` so the extent covers pathways and a pathway-only level still bakes. Replace the early return and bbox computation:

```ts
  const rooms = live(model.rooms).filter(r => r.levelId === levelId && r.walkable);
  const pathways = live(model.pathways).filter(p => p.levelId === levelId);
  // A level being drawn often has a pathway before it has any area.
  if (rooms.length === 0 && pathways.length === 0) return emptyGrid(levelId, cellSizeM);

  const rings: Ring[] = [
    ...rooms.map(r => r.footprint),
    // A polyline is not a ring, but bboxOfRings only reads coordinates, and a
    // pathway's extent still has to be inside the grid.
    ...pathways.map(p => p.polyline),
  ];
  const bbox = bboxOfRings(rings);
```

and pad the extent by the widest pathway so a wide path near the edge is not clipped:

```ts
  const widestM = pathways.reduce((w, p) => Math.max(w, p.widthM), 0);
  const pad = GRID_PAD_M + widestM / 2;
  const originX = Math.floor((bbox.minX - pad) / cellSizeM) * cellSizeM;
  const originY = Math.floor((bbox.minY - pad) / cellSizeM) * cellSizeM;
  const cols = Math.ceil((bbox.maxX + pad - originX) / cellSizeM);
  const rows = Math.ceil((bbox.maxY + pad - originY) / cellSizeM);
```

Finally, carve pathways last, replacing the tail of `bakeNavGrid`:

```ts
  carveDoorways(grid, model, rooms);
  // Last, and unconditional: nothing a wall rule did may close a route a human
  // asserted.
  carvePathways(grid, model);

  return grid;
```

- [ ] **Step 4: Run and commit**

```bash
npx vitest run packages/model
npm run typecheck
git add packages/model/src/nav
git commit -m "feat(model): pathways carve the nav grid last and unconditionally"
```

---

## Task 5: Remove the bake's O(rooms × cells) ceiling

**Files:**
- Modify: `packages/model/src/nav/grid.ts`
- Test: `packages/model/src/nav/grid.test.ts`

**Interfaces:**
- No signature changes. `bakeNavGrid` must produce an identical grid.

- [ ] **Step 1: Write the failing test**

This is a refactor, so the test is a behaviour lock plus a cost bound. Append to `grid.test.ts`:

```ts
describe("bakeNavGrid — cost", () => {
  function bigModel(roomCount: number) {
    const rooms = Array.from({ length: roomCount }, (_, i) => ({
      id: `L1-r${i}`, levelId: "oth-L1", kind: "room",
      // Spread along a 200 m frontage, as shop units are.
      footprint: [[i * 6, 0], [i * 6 + 5, 0], [i * 6 + 5, 8], [i * 6, 8]],
      heightM: 3, walkable: true,
    }));
    return parseModel({ building, levels: [level], rooms });
  }

  it("stays under a second for a floor's worth of rooms", () => {
    // Thirty units across 180 m is an ordinary OTH frontage. The old bake
    // scanned every cell of the whole grid once per room.
    const model = bigModel(30);
    const t0 = performance.now();
    bakeNavGrid(model, "oth-L1");
    expect(performance.now() - t0).toBeLessThan(1000);
  });

  it("keeps every unit's interior open", () => {
    // The optimisation changes which cells we visit, never which end up open.
    // Asserted from the geometry so the lock does not depend on the code.
    const g = bakeNavGrid(bigModel(6), "oth-L1");
    for (let i = 0; i < 6; i++) {
      expect(navGridWalkableAt(g, [i * 6 + 2.5, 4])).toBe(true);
    }
  });

  it("keeps the gaps between units closed", () => {
    // Units span x = i*6 .. i*6+5, so x = i*6+5.5 is the gap between them.
    const g = bakeNavGrid(bigModel(6), "oth-L1");
    for (let i = 0; i < 5; i++) {
      expect(navGridWalkableAt(g, [i * 6 + 5.5, 4])).toBe(false);
    }
  });
});
```

Note what the second test does **not** do: re-count the same grid and compare it
to itself. The lock has to be independent of the implementation, so it asserts
cells whose state follows from the geometry alone.

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run packages/model/src/nav/grid.test.ts`
Expected: FAIL on the cost test — thirty rooms across a 180 m frontage builds a grid of roughly 730 × 40 cells, scanned once per room.

- [ ] **Step 3: Implement**

In `bakeNavGrid`, replace the rasterisation loop. It currently walks the entire grid for every room:

```ts
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
```

with a scan bounded by each room's own extent:

```ts
  for (const room of rooms) {
    // Only the cells the room could possibly cover. The whole-grid scan made
    // baking O(rooms x cells) — about half a million point-in-polygon tests per
    // room on a hub-sized floor, on every save.
    const rb = bboxOfRings([room.footprint]);
    const c0 = Math.max(0, Math.floor((rb.minX - originX) / cellSizeM));
    const c1 = Math.min(cols - 1, Math.ceil((rb.maxX - originX) / cellSizeM));
    const r0 = Math.max(0, Math.floor((rb.minY - originY) / cellSizeM));
    const r1 = Math.min(rows - 1, Math.ceil((rb.maxY - originY) / cellSizeM));

    for (let row = r0; row <= r1; row++) {
      for (let col = c0; col <= c1; col++) {
        if (navGridGet(grid, col, row)) continue;
        if (pointInPolygon(cellCentre(grid, col, row), room.footprint, room.holes)) {
          navGridSet(grid, col, row, true);
        }
      }
    }
  }
```

- [ ] **Step 4: Run and commit**

```bash
npx vitest run packages/model/src/nav
npm run typecheck
git add packages/model/src/nav
git commit -m "perf(model): bake each room over its own bbox, not the whole grid"
```

---

## Task 6: Access and reachability rules

**Files:**
- Create: `packages/model/src/validation/rules/access.ts`, `src/validation/rules/access.test.ts`
- Modify: `src/validation/rules/reachability.ts`, `src/validation/validate.ts`

**Interfaces:**
- Produces: `accessRules: Rule[]`, `ROOM_ACCESS_M`.
- Also widens `EntityType` in `src/validation/types.ts` with `"pathway"`, so a pathway issue can name itself honestly.
- `reachability.ts` now reports `area.unreachable` for walkable spaces; `room.unreachable` is gone.

- [ ] **Step 1: Write the failing test**

`packages/model/src/validation/rules/access.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseModel } from "../../schema/model";
import { validateModel } from "../validate";
import { accessRules } from "./access";

const building = { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 };
const level = {
  id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1,
  nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6,
};

/** A shop unit fronting y = 0. */
const shop = {
  id: "L1-shop", levelId: "oth-L1", kind: "room",
  footprint: [[10, 0], [20, 0], [20, 8], [10, 8]],
  heightM: 3, walkable: false, nameEn: "Shop", nameZh: "商店",
};

function codes(extra: Record<string, unknown>) {
  return validateModel(parseModel({ building, levels: [level], ...extra }), accessRules)
    .issues.map(i => i.code);
}

describe("room access", () => {
  it("warns when no pathway comes near a destination room", () => {
    expect(codes({ rooms: [shop] })).toContain("room.noAccess");
  });

  it("is satisfied by a pathway running along the shop front", () => {
    const path = { id: "p", levelId: "oth-L1", polyline: [[0, -1], [30, -1]] };
    expect(codes({ rooms: [shop], pathways: [path] })).not.toContain("room.noAccess");
  });

  it("is satisfied by a pathway that enters the room", () => {
    const path = { id: "p", levelId: "oth-L1", polyline: [[15, 2], [15, 6]] };
    expect(codes({ rooms: [shop], pathways: [path] })).not.toContain("room.noAccess");
  });

  it("is not satisfied by a pathway further than the access radius", () => {
    const path = { id: "p", levelId: "oth-L1", polyline: [[0, -20], [30, -20]] };
    expect(codes({ rooms: [shop], pathways: [path] })).toContain("room.noAccess");
  });

  it("warns rather than errors, so a rough floorplan can still publish", () => {
    const report = validateModel(parseModel({ building, levels: [level], rooms: [shop] }), accessRules);
    expect(report.errorCount).toBe(0);
    expect(report.ok).toBe(true);
  });

  it("ignores a pathway on another level", () => {
    const path = { id: "p", levelId: "oth-L9", polyline: [[0, -1], [30, -1]] };
    expect(codes({ rooms: [shop], pathways: [path] })).toContain("room.noAccess");
  });

  it("says nothing about an area, which is judged by reachability instead", () => {
    const area = { ...shop, id: "L1-area", kind: "area", walkable: true };
    expect(codes({ rooms: [area] })).not.toContain("room.noAccess");
  });

  it("says nothing about a void", () => {
    const hole = { ...shop, id: "L1-void", kind: "void" };
    expect(codes({ rooms: [hole] })).not.toContain("room.noAccess");
  });
});

describe("pathway connectivity", () => {
  const area = {
    id: "L1-plaza", levelId: "oth-L1", kind: "area",
    footprint: [[0, 0], [20, 0], [20, 20], [0, 20]],
    heightM: 6, walkable: true, nameEn: "Plaza", nameZh: "广场",
  };
  const entrance = { id: "e1", levelId: "oth-L1", roomId: "L1-plaza", point: [10, 10] };

  it("errors on a pathway nothing can reach", () => {
    const stranded = { id: "p", levelId: "oth-L1", polyline: [[200, 200], [210, 200]] };
    expect(codes({ rooms: [area], entrances: [entrance], pathways: [stranded] }))
      .toContain("pathway.disconnected");
  });

  it("accepts a pathway joined to a reachable area", () => {
    const joined = { id: "p", levelId: "oth-L1", polyline: [[10, 10], [10, 30]] };
    expect(codes({ rooms: [area], entrances: [entrance], pathways: [joined] }))
      .not.toContain("pathway.disconnected");
  });

  it("says nothing when the model has no entrance yet", () => {
    // Everything is unreachable before an entrance exists; that is the
    // entrance step's problem, not every pathway's.
    const p = { id: "p", levelId: "oth-L1", polyline: [[0, 0], [10, 0]] };
    expect(codes({ rooms: [area], pathways: [p] })).not.toContain("pathway.disconnected");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run packages/model/src/validation/rules/access.test.ts`
Expected: FAIL — cannot resolve `./access`.

- [ ] **Step 3: Implement**

`packages/model/src/validation/rules/access.ts`:

```ts
import { distancePointToSegment } from "../../geometry/segment";
import { navGridGet } from "../../nav/grid";
import { buildingReachability } from "../../nav/reachability";
import { live } from "../../primitives";
import type { Vec2 } from "../../primitives";
import type { Rule, ValidationIssue } from "../types";

/** How near a pathway must pass for a destination to count as served. */
export const ROOM_ACCESS_M = 3;

function nearestPathwayDistance(
  polylines: readonly (readonly Vec2[])[], point: Vec2,
): number {
  let best = Infinity;
  for (const line of polylines) {
    for (let i = 0; i + 1 < line.length; i++) {
      const a = line[i];
      const b = line[i + 1];
      if (!a || !b) continue;
      best = Math.min(best, distancePointToSegment(point, a, b));
    }
  }
  return best;
}

/**
 * A destination room is served if a pathway passes near it.
 *
 * A warning rather than an error on purpose: on an approximate floorplan
 * "does this path reach the shop front" is inherently fuzzy, and blocking
 * publish on it would mean a rough plan could never be published at all.
 */
const roomAccess: Rule = model => {
  const issues: ValidationIssue[] = [];
  const rooms = live(model.rooms).filter(r => r.kind === "room" || r.kind === "service");
  const byLevel = new Map<string, Vec2[][]>();
  for (const p of live(model.pathways)) {
    byLevel.set(p.levelId, [...(byLevel.get(p.levelId) ?? []), [...p.polyline]]);
  }

  for (const room of rooms) {
    const lines = byLevel.get(room.levelId) ?? [];
    // Measured from every footprint vertex: a path along one edge serves it.
    const nearest = Math.min(
      ...room.footprint.map(v => nearestPathwayDistance(lines, v)),
    );
    if (nearest > ROOM_ACCESS_M) {
      issues.push({
        severity: "warning",
        code: "room.noAccess",
        message: `No pathway passes within ${ROOM_ACCESS_M} m of "${room.nameEn || room.id}", so nobody can reach it.`,
        entityType: "room",
        entityId: room.id,
        levelId: room.levelId,
      });
    }
  }
  return issues;
};

/** A pathway nothing can reach leads nowhere and is almost certainly a mistake. */
const pathwayConnectivity: Rule = model => {
  const pathways = live(model.pathways);
  // Before an entrance exists everything is unreachable; that is the entrance
  // step's problem, not every pathway's.
  if (pathways.length === 0 || live(model.entrances).length === 0) return [];

  const byLevel = buildingReachability(model);
  const issues: ValidationIssue[] = [];

  for (const p of pathways) {
    const level = byLevel.get(p.levelId);
    if (!level) continue;
    const { grid, mask } = level;

    const reachable = p.polyline.some(point => {
      const col = Math.floor((point[0] - grid.originX) / grid.cellSizeM);
      const row = Math.floor((point[1] - grid.originY) / grid.cellSizeM);
      if (!navGridGet(grid, col, row)) return false;
      const i = row * grid.cols + col;
      const byte = mask[i >> 3];
      return byte !== undefined && (byte & (1 << (i & 7))) !== 0;
    });

    if (!reachable) {
      issues.push({
        severity: "error",
        code: "pathway.disconnected",
        message: `Pathway "${p.id}" cannot be reached from any entrance, so it leads nowhere.`,
        entityType: "pathway",
        entityId: p.id,
        levelId: p.levelId,
      });
    }
  }
  return issues;
};

export const accessRules: Rule[] = [roomAccess, pathwayConnectivity];
```

- [ ] **Step 3a: Let an issue name a pathway**

`ValidationIssue.entityType` is a closed union, so a pathway issue currently has
nothing honest to call itself. In `packages/model/src/validation/types.ts` add
`"pathway"` to `EntityType`, after `"navHint"`.

- [ ] **Step 4: Rename the reachability rule to areas**

In `packages/model/src/validation/rules/reachability.ts`, the rule already filters on `walkable`, which now means areas. Change the code and message so they say so:

```ts
        code: "area.unreachable",
        message: `Area "${room.id}" cannot be reached from any entrance. Check for a missing pathway or portal.`,
```

and the no-entrance message:

```ts
        message: "The model has walkable areas but no entrance, so nothing is reachable.",
```

Update `packages/model/src/nav/reachability.test.ts` accordingly: `room.unreachable` becomes `area.unreachable`, and the fixtures' `kind` values become `area` where they are walkable.

- [ ] **Step 5: Register the rules**

In `packages/model/src/validation/validate.ts`:

```ts
import { accessRules } from "./rules/access";
```

```ts
export const ALL_RULES: Rule[] = [
  ...structureRules,
  ...referenceRules,
  ...reachabilityRules,
  ...accessRules,
  ...warningRules,
];
```

- [ ] **Step 6: Run and commit**

```bash
npx vitest run packages/model
npm run typecheck
git add packages/model/src/validation packages/model/src/nav
git commit -m "feat(model): room access warning, pathway connectivity error, areas not rooms"
```

---

## Task 7: Drawing pathways in the editor

**Files:**
- Create: `packages/editor/src/plan/PathwayShape.tsx`
- Modify: `src/state/store.ts`, `src/plan/PlanCanvas.tsx`, `src/plan/DrawingHint.tsx`, `src/App.tsx`
- Test: `packages/editor/src/plan/PlanCanvas.test.tsx`

**Interfaces:**
- `Tool` gains `"draw-area"` and `"draw-pathway"`; `"draw-doorway"` stays.
- `PlanCanvasProps` gains `onCommitPathway?: (polyline: Vec2[]) => void`.
- Produces: `PathwayShape` props `{ polyline: Vec2[]; widthM: number; viewport: Viewport; selected?: boolean }`.

- [ ] **Step 1: Write the failing test**

Append to `packages/editor/src/plan/PlanCanvas.test.tsx`:

```tsx
describe("pathways", () => {
  it("renders a pathway at its real width", () => {
    useEditorStore.getState().setModel(
      parseModel({
        building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
        levels: [{ id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6 }],
        pathways: [{ id: "L1-p", levelId: "oth-L1", polyline: [[0, 0], [20, 0]], widthM: 4 }],
      }),
    );
    render(<PlanCanvas width={800} height={600} />);
    const el = screen.getByTestId("pathway-L1-p");
    // Stroke width is the pathway's real width in screen pixels.
    const scale = useEditorStore.getState().viewport.scale;
    expect(Number(el.getAttribute("stroke-width"))).toBeCloseTo(4 * scale, 1);
  });

  it("commits a pathway as a polyline, not a closed ring", () => {
    const onCommitPathway = vi.fn();
    useEditorStore.getState().setTool("draw-pathway");
    render(<PlanCanvas width={800} height={600} onCommitPathway={onCommitPathway} />);
    const surface = screen.getByTestId("plan-surface");
    fireEvent.click(surface, { clientX: 100, clientY: 100 });
    fireEvent.click(surface, { clientX: 200, clientY: 100 });
    fireEvent.doubleClick(surface);
    expect(onCommitPathway).toHaveBeenCalledTimes(1);
    expect(onCommitPathway.mock.calls[0]![0]).toHaveLength(2);
  });

  it("needs only two points, unlike a room", () => {
    const onCommitPathway = vi.fn();
    const onCommitRoom = vi.fn();
    useEditorStore.getState().setTool("draw-pathway");
    render(<PlanCanvas width={800} height={600} onCommitPathway={onCommitPathway} onCommitRoom={onCommitRoom} />);
    const surface = screen.getByTestId("plan-surface");
    fireEvent.click(surface, { clientX: 100, clientY: 100 });
    fireEvent.click(surface, { clientX: 200, clientY: 100 });
    fireEvent.doubleClick(surface);
    expect(onCommitPathway).toHaveBeenCalled();
    expect(onCommitRoom).not.toHaveBeenCalled();
  });

  it("refuses a pathway of one point", () => {
    const onCommitPathway = vi.fn();
    useEditorStore.getState().setTool("draw-pathway");
    render(<PlanCanvas width={800} height={600} onCommitPathway={onCommitPathway} />);
    fireEvent.click(screen.getByTestId("plan-surface"), { clientX: 100, clientY: 100 });
    fireEvent.doubleClick(screen.getByTestId("plan-surface"));
    expect(onCommitPathway).not.toHaveBeenCalled();
  });

  it("explains the pathway tool in the hint", () => {
    useEditorStore.getState().setTool("draw-pathway");
    render(<PlanCanvas width={800} height={600} />);
    expect(screen.getByTestId("drawing-hint").textContent).toMatch(/walk/i);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run packages/editor/src/plan/PlanCanvas.test.tsx`
Expected: FAIL — `"draw-pathway"` is not a Tool.

- [ ] **Step 3: Add the tools**

In `packages/editor/src/state/store.ts`:

```ts
export type Tool =
  | "select"
  | "draw-area"
  | "draw-room"
  | "draw-pathway"
  | "draw-doorway"
  | "place-entrance"
  | "place-portal"
  | "calibrate";
```

- [ ] **Step 4: Implement the shape**

`packages/editor/src/plan/PathwayShape.tsx`:

```tsx
import type { Vec2 } from "@oth/model";
import { worldToScreen, type Viewport } from "./viewport";

/**
 * A pathway drawn at its real width, so you can see whether it actually reaches
 * a shop front rather than guessing from a hairline.
 */
export function PathwayShape({
  id, polyline, widthM, viewport, selected = false,
}: {
  id: string;
  polyline: readonly Vec2[];
  widthM: number;
  viewport: Viewport;
  selected?: boolean;
}) {
  const points = polyline.map(p => worldToScreen(viewport, p).join(",")).join(" ");
  return (
    <polyline
      data-testid={`pathway-${id}`}
      points={points}
      fill="none"
      stroke={selected ? "#f2a33c" : "#38bdf8"}
      strokeOpacity={0.45}
      strokeWidth={widthM * viewport.scale}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
}
```

- [ ] **Step 5: Render and commit them in the canvas**

In `PlanCanvas.tsx` add the prop:

```tsx
  onCommitPathway?: (polyline: Vec2[]) => void;
```

extend `commitDraft`:

```tsx
    // A pathway is a line, so two points is enough; a room needs three.
    if (state.tool === "draw-pathway" && draft.length >= 2) onCommitPathway?.(draft);
```

treat `draw-pathway` and `draw-area` like the other polyline tools in `onSurfaceClick`:

```tsx
    if (
      state.tool === "draw-room" ||
      state.tool === "draw-area" ||
      state.tool === "draw-pathway" ||
      state.tool === "draw-doorway"
    ) {
      if (!state.draft) state.beginDraft();
      state.pushDraftPoint(p);
      return;
    }
```

route the area tool to the room commit:

```tsx
    if (state.tool === "draw-area" && draft.length >= 3) onCommitArea?.(draft);
```

with the matching prop `onCommitArea?: (ring: Ring) => void;`, and render pathways beneath the rooms:

```tsx
        {state.model?.pathways
          .filter(p => p.levelId === state.activeLevelId)
          .map(p => (
            <PathwayShape
              key={p.id}
              id={p.id}
              polyline={p.polyline}
              widthM={p.widthM}
              viewport={state.viewport}
              selected={state.selection?.id === p.id}
            />
          ))}
```

- [ ] **Step 6: Teach the hint about the new tools**

In `DrawingHint.tsx`, extend `WHAT`:

```tsx
  "draw-area": "Drawing an open area",
  "draw-pathway": "Drawing a pathway",
```

and `howTo`:

```tsx
  if (tool === "draw-pathway") {
    return pointCount < 2
      ? "Click along the middle of where people walk."
      : "Keep clicking, then double-click to finish. Backspace undoes.";
  }
  if (tool === "draw-area") {
    return pointCount < 3
      ? `${pointCount} of at least 3 corners of the open space.`
      : "Click the first corner again to close, or double-click.";
  }
```

- [ ] **Step 7: Wire the App**

In `App.tsx`, add to `PlanCanvas`:

```tsx
            onCommitArea={ring => {
              if (!activeLevelId) return;
              void saver.create("room", {
                id: `${activeLevelId}-area-${Date.now()}`,
                levelId: activeLevelId,
                kind: "area",
                footprint: ring,
                heightM: 5,
                // Set from the tool, so nobody has to know the checkbox exists.
                walkable: true,
              });
            }}
            onCommitPathway={polyline => {
              if (!activeLevelId) return;
              void saver.create("pathway", {
                id: `${activeLevelId}-path-${Date.now()}`,
                levelId: activeLevelId,
                polyline,
              });
            }}
```

and change the existing `onCommitRoom` so a room is a destination:

```tsx
                kind: "room",
                footprint: ring,
                heightM: 3.5,
                // A room is somewhere you arrive, not somewhere you route through.
                walkable: false,
```

- [ ] **Step 8: Run and commit**

```bash
npx vitest run packages/editor
npm run typecheck
git add packages/editor
git commit -m "feat(editor): draw pathways and areas, rendered at real width"
```

---

## Task 8: Flow, layers and toolbar

**Files:**
- Modify: `packages/editor/src/flow/checklist.ts`, `src/flow/layers.ts`, `src/flow/sections.ts`, `src/panels/Toolbar.tsx`
- Test: `src/flow/checklist.test.ts`, `src/flow/layers.test.ts`

**Interfaces:**
- `StepId` `"connect"` keeps its name but becomes the pathways step.
- `LayerEntityType` gains `"pathway"`; rooms and areas become separate groups.

- [ ] **Step 1: Write the failing test**

Append to `packages/editor/src/flow/checklist.test.ts`:

```ts
describe("the pathways step", () => {
  const area = { ...room, id: "L1-area", kind: "area" };
  const path = { id: "L1-p", levelId: "oth-L1", polyline: [[0, 0], [10, 0]] };

  it("counts pathways rather than doorways", () => {
    const m = model({ rooms: [area], pathways: [path] });
    expect(steps({ model: m, levelId: "oth-L1", image: null, report: emptyReport }).connect?.detail)
      .toBe("1 pathway");
  });

  it("is not done until a pathway exists", () => {
    const m = model({ rooms: [area, { ...area, id: "L1-b" }] });
    expect(steps({ model: m, levelId: "oth-L1", image: null, report: emptyReport }).connect?.status)
      .toBe("todo");
  });

  it("is done once a pathway exists and nothing is unreachable", () => {
    const m = model({ rooms: [area, { ...area, id: "L1-b" }], pathways: [path] });
    expect(steps({ model: m, levelId: "oth-L1", image: null, report: emptyReport }).connect?.status)
      .toBe("done");
  });

  it("uses the pathway tool", () => {
    const m = model({ rooms: [area] });
    expect(steps({ model: m, levelId: "oth-L1", image: null, report: emptyReport }).connect?.tool)
      .toBe("draw-pathway");
  });

  it("owns the pathway and area validation codes", () => {
    expect(stepForCode("pathway.disconnected")).toBe("connect");
    expect(stepForCode("area.unreachable")).toBe("connect");
  });

  it("files a room access warning under pathways, since a pathway is the fix", () => {
    expect(stepForCode("room.noAccess")).toBe("connect");
  });
});
```

Append to `packages/editor/src/flow/layers.test.ts`:

```ts
describe("areas and pathways", () => {
  it("separates areas from rooms, since they are drawn with different tools", () => {
    const g = levelLayers(model, "oth-L1");
    expect(g.map(x => x.type)).toContain("area");
    expect(g.map(x => x.type)).toContain("pathway");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run packages/editor/src/flow`
Expected: FAIL — the step still counts doorways and there is no `pathway` layer group.

- [ ] **Step 3: Rework the step**

In `packages/editor/src/flow/checklist.ts`, replace the doorway count with pathways:

```ts
  const pathways = model && levelId ? model.pathways.filter(p => p.levelId === levelId) : [];
```

```ts
    {
      id: "connect",
      label: "Draw pathways",
      // Pathways are what make anything reachable now; doorways are a leftover
      // primitive that no longer drives the flow.
      // A lone space needs no pathway — an entrance inside it is enough. More
      // than one, and something has to join them.
      status:
        rooms.length > 0 && unreachable.length === 0 && (rooms.length === 1 || pathways.length > 0)
          ? "done"
          : "todo",
      detail:
        unreachable.length > 0
          ? `${plural(unreachable.length, "space")} unreachable`
          : plural(pathways.length, "pathway"),
      tool: "draw-pathway",
      issues: issuesFor("connect"),
    },
```

and route the new codes in `stepForCode`:

```ts
  if (code === "area.unreachable" || code === "room.noAccess") return "connect";
  if (code.startsWith("pathway.") || code.startsWith("doorway.")) return "connect";
```

with the old `room.unreachable` line removed, and `unreachable` recomputed against the new code:

```ts
  const unreachable = issuesFor("connect").filter(i => i.code === "area.unreachable");
```

- [ ] **Step 4: Split the layer groups**

In `packages/editor/src/flow/layers.ts`, widen the type and labels:

```ts
export type LayerEntityType =
  | "area" | "room" | "pathway" | "doorway" | "entrance" | "portalEndpoint" | "placement";
```

```ts
const GROUP_LABELS: Record<LayerEntityType, string> = {
  area: "Areas",
  room: "Rooms",
  pathway: "Pathways",
  doorway: "Doorways",
  entrance: "Entrances",
  portalEndpoint: "Lifts & stairs",
  placement: "Dressing",
};
```

Split rooms by kind, and add pathways:

```ts
  for (const r of model.rooms.filter(x => x.levelId === levelId)) {
    // Areas and rooms are drawn with different tools and read differently on
    // the canvas, so they list separately.
    const type: LayerEntityType = r.kind === "area" ? "area" : "room";
    byType.get(type)!.push({
      type, id: r.id, label: r.nameEn || r.id, version: r.version, renamable: true,
    });
  }

  for (const p of model.pathways.filter(x => x.levelId === levelId)) {
    byType.get("pathway")!.push({
      type: "pathway",
      id: p.id,
      label: `${p.polyline.length} points · ${p.widthM} m wide`,
      version: p.version,
      renamable: false,
    });
  }
```

Note `LayerItem.type` feeds `saver.update`/`saver.remove`, which take an `EntityType`. `"area"` is not one — map it back in `App.tsx`:

```ts
  const entityTypeFor = (item: LayerItem): EntityType =>
    item.type === "area" ? "room" : (item.type as EntityType);

  const renameLayer = (item: LayerItem, nameEn: string) =>
    void saver.update(entityTypeFor(item), item.id, item.version, { nameEn });

  const deleteLayer = (item: LayerItem) =>
    void saver.remove(entityTypeFor(item), item.id, item.version);
```

- [ ] **Step 5: Update the toolbar and the section label**

`packages/editor/src/panels/Toolbar.tsx`:

```tsx
const TOOLS: { id: Tool; label: string }[] = [
  { id: "select", label: "Select" },
  { id: "draw-area", label: "Draw area" },
  { id: "draw-room", label: "Draw room" },
  { id: "draw-pathway", label: "Draw pathway" },
  { id: "place-entrance", label: "Entrance" },
  { id: "place-portal", label: "Portal" },
  // Doorway stays reachable — still right for a genuinely walled corridor —
  // but it is no longer part of the guided sequence.
  { id: "draw-doorway", label: "Doorway" },
];
```

In `packages/editor/src/flow/sections.ts`, rename the section:

```ts
  connect: "Pathways",
```

and the rooms section, which now covers both:

```ts
  rooms: "Areas & rooms",
```

- [ ] **Step 6: Run everything and commit**

```bash
npm test
npm run typecheck
npm run build
git add packages/editor
git commit -m "feat(editor): pathways step, separate area and room layers, doorway leaves the flow"
```

---

## Done criteria

- `npm test` green, `npm run typecheck` clean, editor builds.
- A pathway drawn across a wall connects the spaces either side, with no doorway.
- A level with a pathway and no rooms still bakes a usable grid.
- Thirty rooms across a 180 m frontage bake in well under a second.
- Drawing with the area tool produces a walkable `area`; the room tool produces a non-walkable `room`; neither asks the user about walkability.
- The guided flow reads Floorplan → Areas & rooms → Pathways → Entrances → Lifts & stairs → Dressing.
