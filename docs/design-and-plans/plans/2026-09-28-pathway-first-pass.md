# Pathway first pass (Plan 6D) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Claude Code a read-only tool, `suggest_paths(floor)`, that proposes a first pass of a floor's pathways from its walkable areas: centre lines with widths, straight links from every doorway, stop and entrance to the nearest line, and a list of what could not be joined, with why.

**Architecture:** Pure TypeScript in a new server folder, `packages/server/src/paths/`, one step per file: the walkable surface painted into a 0.25 m grid (`raster.ts`), the distance to its edge (`distance.ts`), Zhang–Suen thinning (`thin.ts`), the skeleton as a graph with short spurs pruned (`graph.ts`), Douglas–Peucker (`simplify.ts`), and the links (`connect.ts`). `suggest.ts` composes them as `suggestPaths`, the shared contract's function. A thin MCP tool in `mcp/tools/paths.ts` reads the model and replies with the result. A debug SVG and a by-hand test show the result on the real L1 and L2.

**Tech Stack:** TypeScript, zod (`@oth/model`), Hono with the MCP SDK and Drizzle on PGlite (server), Vitest 1.6. No new dependency. `sharp`, already the server's, is used only by the by-hand real-floor test to turn the SVG into a PNG.

**Spec:** `docs/design-and-plans/specs/2026-09-28-guided-setup-objects-and-export-design.md` §7.3 (with §4.1 step 7, §7.1 `draw_paths`, §7.2, §7.4, §10, §11 and §12 as context), at commit 17b31e7. Shared names: `.superpowers/sdd/2026-09-28-plan6/interfaces.md`, "Server — pathway first pass".

## Global Constraints

- **Tests** run only through `bash .superpowers/run-tests.sh vitest <paths>` and `bash .superpowers/run-tests.sh tsc <pkg dirs>`, folder-scoped. Builds take `.superpowers/test.lock` by hand. Parallel runs crashed the laptop.
- **Commits:** `git commit --only -m "…" -- <paths>`, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never `git add -A`, never bare `git stash`.
- **Copy style:** short, plain sentences like the existing app. No emoji. Buttons say what they do. (Here: the tool's description and the unconnected reasons.)
- **Run commands from the worktree root**, `C:\Users\qhuip\Repositories\oth_navigation\.claude\worktrees\ux-overhaul`. A new file is staged by path (`git add <path>`) before `git commit --only`, which refuses paths git does not know.
- **The contract's names, verbatim** (interfaces.md): the module `packages/server/src/paths/suggest.ts`; `suggestPaths(model: MapModel, levelId: string): PathSuggestion`; `PathSuggestion = { lines: { polyline: Vec2[]; widthM: number }[]; links: { from: { type: "doorway"|"stop"|"entrance"; id: string }; segment: [Vec2, Vec2] }[]; unconnected: { type: "doorway"|"stop"|"entrance"; id: string; reason: string }[] }`; the MCP tool `suggest_paths(floor)` in `packages/server/src/mcp/tools/paths.ts`, wired where the other tool files are registered. "Pure TypeScript, no native dependencies."
- **Spec §7.3's numbers, verbatim:** "Rasterise it at 0.25 m, take the distance transform, and thin it to a one-pixel skeleton." "Prune spurs shorter than 2 m. Vectorise it to polylines, and simplify them (Douglas–Peucker, 0.3 m)." Connect "every doorway's midpoint, every stop's footprint centre, and every entrance to the nearest skeleton point; with a straight segment that stays inside the walkable surface; if none does, list it as *unconnected*." "Width: twice the median distance-to-edge along the line, clamped to 1.2–6 m." "Runtime target: under 2 s for L1 on Railway."
- **Read-only.** Spec §7.2: `suggest_paths(floor)` is "Read-only". §7.4: "The new tools read and write nothing outside the floor they are given." The tool saves nothing and writes no audit row. Spec §7.4: "The existing per-token limits cover the new tools": it counts as a read, and there is no cache or limit of its own.
- **No polygon union.** None exists in the codebase (`@oth/model` has `pointInPolygon`, `ringCentroid`, `bboxOfRing` and `distancePointToSegment`, and nothing that clips). The surface is a union by construction: every walkable room is painted into the same grid.
- **`@oth/model` is not edited.** All new code is in the server.
- **Shared files** get only the lines listed under "Shared files" below. Plan 6C's setup tools are likely to edit the same files; both sets of lines stand side by side.
- **Real data only from a copy.** The real-floor check reads a model dumped from a scratch copy of the main checkout's `packages/server/data/dev-db`, never that directory itself, and never the :3000 server (the running server owns the PGlite writer).

## Review Focus

1. **Rooms drawn on top of a walkable zone.** On L1, 80 rooms that are not walkable stand inside walkable zones: 54 in the Hawker Centre's rectangle, 19 in the Stadium's, 5 in the Town Square's. The spec's plain union runs pathways through toilets, changing rooms and stalls; it did, in a scratch run. A person expects the paths to go round them. Pinned in Task 1 ("cuts out what stands on the surface…") and Task 5 ("goes round a shop standing in a hall").
2. **Walkable rooms apart by the drawing's wall.** On L1, 17 pairs of walkable areas stand less than 0.5 m apart (and 6 more touch), the partition traced from both sides. Painted as they are, the surface breaks at each and so do the lines. A person expects one surface and one line across. Pinned in Task 1 ("bridges the drawing's wall…") and Task 5 ("the same L drawn as two rooms 0.3 m apart").
3. **Slivers between neighbouring shops.** Cutting the shops out of a zone leaves the 0.2–0.4 m gaps between them as strips of "walkable" floor, each thinning to a spur or a loop. A person expects no path down a wall. Pinned in Task 1 ("drops the sliver…").
4. **A doorway on its wall line.** A doorway's midpoint is on the boundary between its two rooms: on the surface's rim, or up to 0.4 m off it across the drawing's wall. A person expects it joined, not listed as off the floor. Pinned in Task 4 ("reaches across the drawing's wall…") and Task 5 ("joins a doorway on the wall…").
5. **A room drawn at the wrong scale, or a stray point far away.** The raster grows with the surface's extent: a room 2 km off makes a 64-million-cell grid and a gigabyte of distance transform, which could take down the one Railway instance. A person expects a plain refusal that says why. Pinned in Task 1 ("refuses a surface over a kilometre square…") and Task 6 ("says why when a room far off…").

## Where this plan goes past §7.3's words

Each of these came from L1's real data, in a scratch run of this plan's code.

| Spec says | This plan does | Why |
|---|---|---|
| "the union of walkable rooms (areas and opened stop spaces)" | the union, with gaps under 0.5 m bridged (a one-cell morphological closing) | Review Focus 2. Plan 5D merges walls across 0.4 m for the same reason. |
| — | less every void and every room that is not walkable, except details | Review Focus 1. A detail (seating, a planter) is furniture: as holes, L1's 14 details inside walkable areas would each add a loop. |
| — | then less every strip under 0.75 m wide (a one-cell opening) | Review Focus 3. A pathway is at least 1.2 m. |
| "thin it to a one-pixel skeleton" | Zhang–Suen, then the corner pixels it leaves on 45° runs taken off | Those corners have three neighbours and read as forks. The loop test in Task 2 fails without this step. |
| "to the nearest skeleton point" | the nearest point on the simplified lines that a straight segment reaches, within 50 m | A link ends on a line Claude will draw, not on a pixel 0.3 m off it. Past 50 m, a link is a path of its own. |
| "stays inside the walkable surface" | the first 0.6 m from a doorway, stop or entrance may be off it | Review Focus 4. |
| "Prune spurs shorter than 2 m" | shortest first; a fork left with two edges joins them | Of two short prongs at a corridor's end, the longer stays as the line's end, and the corridor keeps its length. |
| — | refuses a surface over 16 million cells (a kilometre square) | Review Focus 5. |
| — | longest line first; points to the centimetre, widths to 0.1 m | Claude reads the spine first, and the reply stays small. |

## What a scratch run of this plan's code gave

The code in Tasks 1–5 and 7 ran on 2026-09-28 in a scratch copy, with this plan's tests under a small stand-in for vitest's `describe`, `it` and `expect` (not vitest itself). All 57 checks passed, and the code typechecks under the repo's compiler settings (strict, `noUncheckedIndexedAccess`, no unused names). Task 6 needs the server and was not run.

On the model dumped at 21:30 on 2026-09-28 (`scratchpad/final5d/model.json`):
- **L1:** 190 lines, 0 links, 0 unconnected, 222 ms on the first call in a process and 115 ms warm. The raster is 859 × 923 cells.
- **L2:** 3 lines (its three walkable areas), 24–50 ms.
- **L1 has no doorways, entrances or stops yet**, so its links and unconnected lists are empty until step 5 of the wizard makes stops. With one made-up doorway per shop (129), the same run gave 70 links and 59 unconnected (shops with no walkable area beside them) and took 374 ms.
- 190 lines is busy, as spec §12 expects of a concourse full of rooms: the Hawker Centre's aisles between stalls, and paths round every room in the West Concourse. The spec's mitigation is Claude's review in `draw_paths`.

## Shared files

| File | Task | Edit |
|---|---|---|
| `packages/server/src/mcp/tools/read.ts` | 6 | `export` on `const FLOOR` and on `function levelFor`. Nothing else. If 6C has already exported them, leave them. |
| `packages/server/src/mcp/limits.ts` | 6 | `"suggest_paths"` added to `READ_TOOLS`. |
| `packages/server/src/mcp/server.ts` | 6 | One import and one `registerPathTools(server, ctx);` line. |

## File structure

All new, all Plan 6D's:

| File | Responsibility |
|---|---|
| `packages/server/src/paths/raster.ts` | `Raster`, `walkableRaster`: the walkable surface at 0.25 m; cell lookups; the size guard. |
| `packages/server/src/paths/distance.ts` | `distanceToEdge`: exact Euclidean distance transform (Felzenszwalb–Huttenlocher). |
| `packages/server/src/paths/thin.ts` | `thin`: Zhang–Suen on the surface's rim, then the corner step. |
| `packages/server/src/paths/graph.ts` | `skeletonGraph`, `pruneSpurs`, `polylineLength`: pixels to nodes and edges. |
| `packages/server/src/paths/simplify.ts` | `simplify`: Douglas–Peucker. |
| `packages/server/src/paths/connect.ts` | `linkTargets`, `connect`, `clearLine`, `REASONS`: joining doorways, stops and entrances. |
| `packages/server/src/paths/suggest.ts` | `suggestPaths`, `PathSuggestion`, `lineWidth`: the contract's function. |
| `packages/server/src/paths/debugSvg.ts` | `suggestionSvg`: a picture of a suggestion over the floor's rooms, for people. |
| `packages/server/src/paths/testing.ts` | Test-only model builders (`floor`, `rect`, `doorway`). Not a test file, like `mcp/testing.ts`. |
| `packages/server/src/mcp/tools/paths.ts` | `registerPathTools`: the `suggest_paths` tool. |

Each code file has its own `*.test.ts` beside it, and `paths/real.test.ts` is the by-hand check on the real floors.

## Order and parallel groups

| Group | Tasks | Notes |
|---|---|---|
| A | **1** The walkable surface | Everything else reads its `Raster`. |
| B (parallel) | **2** Distance and thinning · **4** Joining doorways, stops and entrances | Disjoint files. Both need only Task 1. |
| C | **3** From skeleton to lines | Needs 2 (its tests thin real shapes). |
| D | **5** `suggestPaths` | Needs 2, 3 and 4. |
| E (parallel) | **6** The `suggest_paths` tool · **7** The real floors | Both need 5. Disjoint files. |

---

### Task 1: The walkable surface

**Files:**
- Create: `packages/server/src/paths/testing.ts`
- Create: `packages/server/src/paths/raster.ts`
- Test: `packages/server/src/paths/raster.test.ts`

**Interfaces:**
- Consumes: `live`, `MapModel`, `Ring`, `Room`, `Vec2`, `RoomKind`, `parseModel` from `@oth/model`.
- Produces, in `raster.ts`:
  - `CELL_M = 0.25`, `BRIDGE_CELLS = 1`, `SLIVER_CELLS = 1`, `MAX_CELLS = 16_000_000`;
  - `type Raster = { originX: number; originY: number; cols: number; rows: number; cellM: number; cells: Uint8Array }`. Cell `(col, row)` is `cells[row * cols + col]`, 1 where walkable. A floor with no walkable room gives `cols = rows = 0`.
  - `class SurfaceTooLarge extends Error`, thrown by `walkableRaster` past `MAX_CELLS`;
  - `walkableRaster(model: MapModel, levelId: string, cellM?: number): Raster`, which always leaves at least 4 cells of background all round;
  - `cellIndex(r: Raster, p: Vec2): number` (-1 off the raster), `cellCentre(r: Raster, index: number): Vec2`, `walkableAt(r: Raster, p: Vec2): boolean`.
- Produces, in `testing.ts`: `LEVEL = "oth-L1"`; `type Pt = [number, number]`; `rect(x0, y0, x1, y1): Pt[]`; `type TestRoom = { id?; footprint: Pt[]; holes?: Pt[][]; kind?: RoomKind; walkable?: boolean; levelId?: string; deletedAt?: string }`; `floor(rooms: TestRoom[], extra?: Record<string, unknown>): MapModel` (floors L1 and L2; rooms default to walkable areas on L1); `doorway(id: string, segment: [Vec2, Vec2])`, a doorway on L1.

- [ ] **Step 1: Write the test helper**

`packages/server/src/paths/testing.ts`:

```ts
import { parseModel, type MapModel, type RoomKind, type Vec2 } from "@oth/model";

/** The floor every paths test draws on. */
export const LEVEL = "oth-L1";

export type Pt = [number, number];

export function rect(x0: number, y0: number, x1: number, y1: number): Pt[] {
  return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
}

export type TestRoom = {
  id?: string;
  footprint: Pt[];
  holes?: Pt[][];
  kind?: RoomKind;
  walkable?: boolean;
  levelId?: string;
  deletedAt?: string;
};

/**
 * A building with floors L1 and L2, and the rooms given: walkable areas on L1
 * unless a room says otherwise. `extra` adds doorways, entrances, portals and
 * stops as the model defines them.
 */
export function floor(rooms: TestRoom[], extra: Record<string, unknown> = {}): MapModel {
  return parseModel({
    building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
    levels: [
      { id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "Level 1", nameZh: "一楼", elevationM: 0, heightM: 6 },
      { id: "oth-L2", buildingId: "oth", code: "L2", ordinal: 2, nameEn: "Level 2", nameZh: "二楼", elevationM: 6, heightM: 4 },
    ],
    rooms: rooms.map((r, i) => ({
      id: r.id ?? `room-${i}`,
      levelId: r.levelId ?? LEVEL,
      kind: r.kind ?? "area",
      walkable: r.walkable ?? true,
      heightM: 4,
      footprint: r.footprint,
      holes: r.holes ?? [],
      deletedAt: r.deletedAt,
    })),
    ...extra,
  });
}

/** A doorway on L1 across `segment`, between two rooms the test need not draw. */
export function doorway(id: string, segment: [Vec2, Vec2]) {
  return { id, levelId: LEVEL, roomA: "room-a", roomB: "room-b", segment, widthM: 2 };
}
```

- [ ] **Step 2: Write the failing test**

`packages/server/src/paths/raster.test.ts`:

```ts
import type { Vec2 } from "@oth/model";
import { describe, expect, it } from "vitest";
import { cellCentre, cellIndex, SurfaceTooLarge, walkableAt, walkableRaster, type Raster } from "./raster";
import { floor, LEVEL, rect } from "./testing";

const at = (r: Raster, x: number, y: number) => walkableAt(r, [x, y]);
const cellCount = (r: Raster) => r.cells.reduce((sum, v) => sum + v, 0);
const areaM2 = (r: Raster) => cellCount(r) * r.cellM * r.cellM;

/** How many walkable cells can be reached from `from` through their sides. */
function reach(r: Raster, from: Vec2): number {
  const start = cellIndex(r, from);
  const seen = new Uint8Array(r.cells.length);
  const stack = [start];
  seen[start] = 1;
  let count = 0;
  while (stack.length > 0) {
    const i = stack.pop()!;
    count++;
    for (const j of [i - 1, i + 1, i - r.cols, i + r.cols]) {
      if (r.cells[j] && !seen[j]) {
        seen[j] = 1;
        stack.push(j);
      }
    }
  }
  return count;
}

describe("walkableRaster", () => {
  it("covers a walkable room at 0.25 m, cell by cell centre, and nothing else", () => {
    const r = walkableRaster(floor([{ footprint: rect(0, 0, 10, 4) }]), LEVEL);
    expect(r.cellM).toBe(0.25);
    expect(areaM2(r)).toBeCloseTo(40);
    expect(at(r, 5, 2)).toBe(true);
    expect(at(r, 0.1, 0.1)).toBe(true);
    expect(at(r, -0.1, 2)).toBe(false);
    expect(at(r, 10.1, 2)).toBe(false);
  });

  it("leaves a room's holes out", () => {
    const r = walkableRaster(floor([{ footprint: rect(0, 0, 10, 10), holes: [rect(4, 4, 6, 6)] }]), LEVEL);
    expect(at(r, 5, 5)).toBe(false);
    expect(areaM2(r)).toBeCloseTo(96);
  });

  it("makes one surface of rooms that overlap or abut: the union, with no clipping", () => {
    const r = walkableRaster(floor([
      { footprint: rect(0, 0, 10, 4) },
      { footprint: rect(8, 0, 20, 4) },
      { footprint: rect(20, 0, 24, 4) },
    ]), LEVEL);
    expect(areaM2(r)).toBeCloseTo(96);
    expect(reach(r, [1, 1])).toBe(cellCount(r));
  });

  it("bridges the drawing's wall between two walkable rooms, up to 0.5 m, and no wider", () => {
    const joined = walkableRaster(floor([{ footprint: rect(0, 0, 10, 4) }, { footprint: rect(10.3, 0, 20, 4) }]), LEVEL);
    expect(at(joined, 10.15, 2)).toBe(true);
    expect(reach(joined, [1, 1])).toBe(cellCount(joined));
    const apart = walkableRaster(floor([{ footprint: rect(0, 0, 10, 4) }, { footprint: rect(11, 0, 20, 4) }]), LEVEL);
    expect(at(apart, 10.5, 2)).toBe(false);
  });

  it("cuts out what stands on the surface and is not walked on: a room, a service space, a void", () => {
    const r = walkableRaster(floor([
      { footprint: rect(0, 0, 30, 10) },
      { footprint: rect(2, 2, 6, 6), kind: "room", walkable: false },
      { footprint: rect(10, 2, 14, 6), kind: "service", walkable: false },
      { footprint: rect(18, 2, 22, 6), kind: "void" },
    ]), LEVEL);
    expect(at(r, 4, 4)).toBe(false);
    expect(at(r, 12, 4)).toBe(false);
    expect(at(r, 20, 4)).toBe(false);
    expect(at(r, 8, 4)).toBe(true);
    expect(at(r, 26, 8)).toBe(true);
  });

  it("walks straight over details: furniture is not a hole", () => {
    const r = walkableRaster(floor([
      { footprint: rect(0, 0, 10, 10) },
      { footprint: rect(4, 4, 6, 6), kind: "detail", walkable: false },
    ]), LEVEL);
    expect(at(r, 5, 5)).toBe(true);
  });

  it("drops the sliver left between two shops standing on a walkable hall", () => {
    // The shops are 0.4 m apart: the drawing's wall between them, not a way through.
    const r = walkableRaster(floor([
      { footprint: rect(0, 0, 20, 12) },
      { footprint: rect(4, 4, 10, 12), kind: "room", walkable: false },
      { footprint: rect(10.4, 4, 16, 12), kind: "room", walkable: false },
    ]), LEVEL);
    expect(at(r, 10.2, 8)).toBe(false);
    expect(at(r, 10.2, 2)).toBe(true);
  });

  it("reads only this floor's live rooms, and only the walkable ones", () => {
    const r = walkableRaster(floor([
      { footprint: rect(0, 0, 10, 4) },
      { footprint: rect(20, 0, 30, 4), levelId: "oth-L2" },
      { footprint: rect(40, 0, 50, 4), deletedAt: "2026-09-28T10:00:00.000Z" },
      { footprint: rect(60, 0, 70, 4), walkable: false },
    ]), LEVEL);
    expect(areaM2(r)).toBeCloseTo(40);
    expect([at(r, 25, 2), at(r, 45, 2), at(r, 65, 2)]).toEqual([false, false, false]);
  });

  it("is empty for a floor with no walkable room", () => {
    const r = walkableRaster(floor([{ footprint: rect(0, 0, 10, 4), walkable: false }]), LEVEL);
    expect([r.cols, r.rows, r.cells.length]).toEqual([0, 0, 0]);
  });

  it("refuses a surface over a kilometre square rather than fill the server's memory", () => {
    const stray = floor([{ footprint: rect(0, 0, 10, 4) }, { footprint: rect(2000, 2000, 2010, 2004) }]);
    expect(() => walkableRaster(stray, LEVEL)).toThrow(SurfaceTooLarge);
    expect(() => walkableRaster(stray, LEVEL)).toThrow(/span 2010 by 2004 m/);
  });

  it("keeps a margin all round, so no walkable cell is on the raster's edge", () => {
    const r = walkableRaster(floor([{ footprint: rect(-3.1, 7.2, 12.9, 11) }]), LEVEL);
    let onEdge = 0;
    for (let col = 0; col < r.cols; col++) onEdge += r.cells[col]! + r.cells[(r.rows - 1) * r.cols + col]!;
    for (let row = 0; row < r.rows; row++) onEdge += r.cells[row * r.cols]! + r.cells[row * r.cols + r.cols - 1]!;
    expect(onEdge).toBe(0);
  });
});

describe("cellIndex and cellCentre", () => {
  it("agree with each other, and say -1 off the raster", () => {
    const r = walkableRaster(floor([{ footprint: rect(0, 0, 10, 4) }]), LEVEL);
    expect(cellCentre(r, cellIndex(r, [3.1, 2.2]))).toEqual([3.125, 2.125]);
    expect(cellIndex(r, [-100, 0])).toBe(-1);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `bash .superpowers/run-tests.sh vitest packages/server/src/paths/raster.test.ts`
Expected: FAIL, `Failed to resolve import "./raster"`.

- [ ] **Step 4: Write `raster.ts`**

`packages/server/src/paths/raster.ts`:

```ts
import { live, type MapModel, type Ring, type Room, type Vec2 } from "@oth/model";

/** Spec §7.3: the surface is rasterised at 0.25 m, the nav grid's own cell. */
export const CELL_M = 0.25;

/**
 * Walkable rooms whose outlines stand apart by less than two cells (0.5 m) are
 * one surface: the gap is the drawing's wall line, traced from both sides.
 * Plan 5D merges walls across 0.4 m for the same reason. A closing by one cell
 * bridges a gap of up to two cells.
 */
export const BRIDGE_CELLS = 1;

/**
 * Once the rooms standing on the surface are cut out, the gaps between
 * neighbouring shops are left as slivers no one walks. An opening by one cell
 * drops every strip under three cells (0.75 m) wide; a pathway is at least
 * 1.2 m.
 */
export const SLIVER_CELLS = 1;

/** Background all round, wider than the closing, so no surface cell is on the raster's edge. */
const PAD_CELLS = 4;

/**
 * A kilometre square at 0.25 m. L1 is 213 × 229 m. A surface bigger than this
 * is a room drawn at the wrong scale or a stray point far from the rest, and
 * rasterising it would take the server's memory.
 */
export const MAX_CELLS = 16_000_000;

export class SurfaceTooLarge extends Error {
  constructor(widthM: number, heightM: number) {
    super(`Its walkable areas span ${Math.round(widthM)} by ${Math.round(heightM)} m, more than one pass can take. ` +
      "A room is probably drawn at the wrong scale, or far from the rest.");
    this.name = "SurfaceTooLarge";
  }
}

/**
 * A floor's walkable surface on a grid. Cell (col, row) covers the square
 * from (originX + col·cellM, originY + row·cellM), and it is walkable when its
 * centre is: the rule `pointInPolygon` and the nav grid use.
 */
export type Raster = {
  originX: number;
  originY: number;
  cols: number;
  rows: number;
  cellM: number;
  /** Row-major, 1 where walkable. */
  cells: Uint8Array;
};

/** A floor with no walkable room. */
function emptyRaster(cellM = CELL_M): Raster {
  return { originX: 0, originY: 0, cols: 0, rows: 0, cellM, cells: new Uint8Array(0) };
}

export function cellCentre(r: Raster, index: number): Vec2 {
  const col = index % r.cols;
  const row = (index - col) / r.cols;
  return [r.originX + (col + 0.5) * r.cellM, r.originY + (row + 0.5) * r.cellM];
}

/** The cell holding `p`, or -1 off the raster. */
export function cellIndex(r: Raster, p: Vec2): number {
  const col = Math.floor((p[0] - r.originX) / r.cellM);
  const row = Math.floor((p[1] - r.originY) / r.cellM);
  if (col < 0 || row < 0 || col >= r.cols || row >= r.rows) return -1;
  return row * r.cols + col;
}

export function walkableAt(r: Raster, p: Vec2): boolean {
  const i = cellIndex(r, p);
  return i >= 0 && r.cells[i] === 1;
}

/** Where the horizontal line at `y` crosses the ring, west to east. */
function crossings(ring: Ring, y: number): number[] {
  const xs: number[] = [];
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!;
    const b = ring[j]!;
    if (a[1] > y !== b[1] > y) xs.push(a[0] + ((y - a[1]) * (b[0] - a[0])) / (b[1] - a[1]));
  }
  return xs.sort((p, q) => p - q);
}

/** Sets `row[col]` to `value` for every column whose centre is between a pair of crossings. */
function spans(r: Raster, xs: readonly number[], row: Uint8Array, value: 0 | 1): void {
  for (let k = 0; k + 1 < xs.length; k += 2) {
    const from = Math.max(0, Math.ceil((xs[k]! - r.originX) / r.cellM - 0.5));
    const to = Math.min(r.cols - 1, Math.ceil((xs[k + 1]! - r.originX) / r.cellM - 0.5) - 1);
    for (let col = from; col <= to; col++) row[col] = value;
  }
}

/**
 * Writes `value` into every cell whose centre is inside `outline` and outside
 * each of `holes`, one row at a time.
 */
function paint(r: Raster, outline: Ring, holes: readonly Ring[], value: 0 | 1): void {
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of outline) {
    minY = Math.min(minY, p[1]);
    maxY = Math.max(maxY, p[1]);
  }
  const first = Math.max(0, Math.floor((minY - r.originY) / r.cellM));
  const last = Math.min(r.rows - 1, Math.ceil((maxY - r.originY) / r.cellM));
  const inside = new Uint8Array(r.cols);
  for (let row = first; row <= last; row++) {
    const y = r.originY + (row + 0.5) * r.cellM;
    inside.fill(0);
    spans(r, crossings(outline, y), inside, 1);
    for (const hole of holes) spans(r, crossings(hole, y), inside, 0);
    const base = row * r.cols;
    for (let col = 0; col < r.cols; col++) if (inside[col]) r.cells[base + col] = value;
  }
}

/** Every cell within `radius` cells (a square) of a set one, set. */
function dilate(cells: Uint8Array, cols: number, rows: number, radius: number): Uint8Array {
  const across = new Uint8Array(cells.length);
  for (let row = 0; row < rows; row++) {
    const base = row * cols;
    for (let col = 0; col < cols; col++) {
      if (!cells[base + col]) continue;
      const to = Math.min(cols - 1, col + radius);
      for (let c = Math.max(0, col - radius); c <= to; c++) across[base + c] = 1;
    }
  }
  const out = new Uint8Array(cells.length);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (!across[row * cols + col]) continue;
      const to = Math.min(rows - 1, row + radius);
      for (let r = Math.max(0, row - radius); r <= to; r++) out[r * cols + col] = 1;
    }
  }
  return out;
}

const invert = (cells: Uint8Array): Uint8Array => cells.map(v => 1 - v);

/**
 * A morphological closing: grow the surface by `radius` cells, then shrink
 * it back. Gaps and notches up to twice `radius` wide fill; nothing else moves.
 */
function closeGaps(r: Raster, radius: number): Raster {
  if (radius <= 0 || r.cells.length === 0) return r;
  const grown = dilate(r.cells, r.cols, r.rows, radius);
  return { ...r, cells: invert(dilate(invert(grown), r.cols, r.rows, radius)) };
}

/**
 * A morphological opening: shrink the surface by `radius` cells, then grow it
 * back. Strips narrower than 2·radius + 1 cells go; the rest is unchanged
 * but for its sharpest corners.
 */
function openSlivers(r: Raster, radius: number): Raster {
  if (radius <= 0 || r.cells.length === 0) return r;
  const shrunk = invert(dilate(invert(r.cells), r.cols, r.rows, radius));
  return { ...r, cells: dilate(shrunk, r.cols, r.rows, radius) };
}

/**
 * What stands on the surface and is not walked on: a void, and any room or
 * back-of-house space not marked walkable. L1's Stadium and Hawker Centre are
 * walkable zones with 73 rooms drawn inside them; without this, paths would
 * run through toilets and stalls. Details are furniture and do not block:
 * as holes, each would put a loop in the network.
 */
function blocks(room: Room): boolean {
  return room.kind === "void" || (!room.walkable && room.kind !== "detail");
}

/**
 * Spec §7.3 step 1: one floor's walkable surface. That is the union of its
 * walkable rooms (areas, and the spaces opened for lift and stair stops, which
 * become walkable areas), with gaps under 0.5 m between them bridged, less
 * every room standing on it that is not walked on, less the slivers that
 * leaves.
 *
 * There is no polygon union in the codebase and none is needed: each room is
 * painted into the same grid, so rooms that overlap or abut are one surface by
 * construction.
 */
export function walkableRaster(model: MapModel, levelId: string, cellM = CELL_M): Raster {
  const rooms = live(model.rooms).filter(room => room.levelId === levelId);
  const walkable = rooms.filter(room => room.walkable && room.kind !== "void");
  if (walkable.length === 0) return emptyRaster(cellM);

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const room of walkable) {
    for (const [x, y] of room.footprint) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  const col0 = Math.floor(minX / cellM) - PAD_CELLS;
  const row0 = Math.floor(minY / cellM) - PAD_CELLS;
  const cols = Math.ceil(maxX / cellM) + PAD_CELLS - col0;
  const rows = Math.ceil(maxY / cellM) + PAD_CELLS - row0;
  if (cols * rows > MAX_CELLS) throw new SurfaceTooLarge(maxX - minX, maxY - minY);
  const raster: Raster = {
    originX: col0 * cellM, originY: row0 * cellM, cols, rows, cellM, cells: new Uint8Array(cols * rows),
  };

  for (const room of walkable) paint(raster, room.footprint, room.holes, 1);
  const surface = closeGaps(raster, BRIDGE_CELLS);
  for (const room of rooms) if (blocks(room)) paint(surface, room.footprint, room.holes, 0);
  return openSlivers(surface, SLIVER_CELLS);
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `bash .superpowers/run-tests.sh vitest packages/server/src/paths/raster.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 6: Typecheck**

Run: `bash .superpowers/run-tests.sh tsc packages/server`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add packages/server/src/paths/testing.ts packages/server/src/paths/raster.ts packages/server/src/paths/raster.test.ts
git commit --only -m "feat(server): a floor's walkable surface as a 0.25 m raster (Plan 6D)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- packages/server/src/paths/testing.ts packages/server/src/paths/raster.ts packages/server/src/paths/raster.test.ts
```

---

### Task 2: Distance to the edge, and thinning to a skeleton

**Files:**
- Create: `packages/server/src/paths/distance.ts`
- Create: `packages/server/src/paths/thin.ts`
- Test: `packages/server/src/paths/distance.test.ts`
- Test: `packages/server/src/paths/thin.test.ts`

**Interfaces:**
- Consumes (Task 1): `Raster`, `walkableRaster`, `cellIndex`, `cellCentre`; test helpers `floor`, `LEVEL`, `rect`, `Pt`.
- Produces:
  - `distanceToEdge(r: Raster): Float32Array`: per cell, metres from its centre to the surface's edge, 0 off the surface.
  - `thin(r: Raster): Uint8Array`: the same length as `r.cells`, 1 on the skeleton. It never changes `r`. It relies on `walkableRaster`'s margin (no set cell on the grid's outer ring).

- [ ] **Step 1: Write the failing tests**

`packages/server/src/paths/distance.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { distanceToEdge } from "./distance";
import { cellIndex, walkableRaster } from "./raster";
import { floor, LEVEL, rect } from "./testing";

describe("distanceToEdge", () => {
  it("measures from each cell's centre to the nearest edge, and is 0 off the surface", () => {
    const r = walkableRaster(floor([{ footprint: rect(0, 0, 20, 4) }]), LEVEL);
    const d = distanceToEdge(r);
    expect(d[cellIndex(r, [10, 0.1])]!).toBeCloseTo(0.125, 5);
    expect(d[cellIndex(r, [10, 1.1])]!).toBeCloseTo(1.125, 5);
    expect(d[cellIndex(r, [10, 1.9])]!).toBeCloseTo(1.875, 5);
    expect(d[cellIndex(r, [10, 2.1])]!).toBeCloseTo(1.875, 5);
    expect(d[cellIndex(r, [10, -0.5])]!).toBe(0);
  });

  it("is straight-line distance, not a count of steps", () => {
    // Diagonally off a hole's corner: 3 cells across and 3 up from the nearest
    // cell in the hole, which is √18 cells, not 3 (chessboard) or 6 (city block).
    const r = walkableRaster(floor([{ footprint: rect(0, 0, 10, 10), holes: [rect(4, 4, 6, 6)] }]), LEVEL);
    const d = distanceToEdge(r);
    expect(d[cellIndex(r, [3.4, 3.4])]!).toBeCloseTo((Math.sqrt(18) - 0.5) * 0.25, 5);
  });
});
```

`packages/server/src/paths/thin.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { cellCentre, walkableRaster, type Raster } from "./raster";
import { thin } from "./thin";
import { floor, LEVEL, rect, type Pt } from "./testing";

/** Each skeleton pixel's count of set neighbours, by pixel. */
function degrees(img: Uint8Array, r: Raster): Map<number, number> {
  const around = [-r.cols - 1, -r.cols, -r.cols + 1, -1, 1, r.cols - 1, r.cols, r.cols + 1];
  const out = new Map<number, number>();
  for (let i = 0; i < img.length; i++) if (img[i]) out.set(i, around.filter(o => img[i + o]).length);
  return out;
}

describe("thin", () => {
  it("thins a corridor to one line of pixels down its middle", () => {
    const r = walkableRaster(floor([{ footprint: rect(0, 0, 20, 4) }]), LEVEL);
    const skeleton = thin(r);
    const d = degrees(skeleton, r);
    expect(d.size).toBe(64);
    for (const [i, n] of d) {
      expect(Math.abs(cellCentre(r, i)[1] - 2)).toBeLessThan(0.2);
      expect(n).toBeLessThanOrEqual(2);
    }
    expect([...d.values()].filter(n => n === 1)).toHaveLength(2);
  });

  // Zhang and Suen alone leaves a corner pixel wherever this loop turns 45°,
  // which reads as a fork: this is the test that pins the corner step.
  it("keeps the loop round a hole, with every pixel on it having two neighbours", () => {
    const r = walkableRaster(floor([{ footprint: rect(0, 0, 30, 20), holes: [rect(10, 7, 20, 13)] }]), LEVEL);
    const d = degrees(thin(r), r);
    expect(d.size).toBeGreaterThan(200);
    expect([...d.values()].every(n => n === 2)).toBe(true);
  });

  it("thins a diagonal corridor to one line with two ends and no fork", () => {
    // 3 m wide, running north-east for 28 m.
    const h = 1.5 / Math.SQRT2;
    const footprint: Pt[] = [[-h, h], [h, -h], [20 + h, 20 - h], [20 - h, 20 + h]];
    const r = walkableRaster(floor([{ footprint }]), LEVEL);
    const d = degrees(thin(r), r);
    expect([...d.values()].filter(n => n >= 3)).toEqual([]);
    expect([...d.values()].filter(n => n === 1)).toHaveLength(2);
  });

  it("does not change the raster it is given", () => {
    const r = walkableRaster(floor([{ footprint: rect(0, 0, 20, 4) }]), LEVEL);
    const before = r.cells.slice();
    thin(r);
    expect(r.cells).toEqual(before);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bash .superpowers/run-tests.sh vitest packages/server/src/paths/distance.test.ts packages/server/src/paths/thin.test.ts`
Expected: FAIL, `Failed to resolve import "./distance"` and `"./thin"`.

- [ ] **Step 3: Write `distance.ts`**

`packages/server/src/paths/distance.ts`:

```ts
import type { Raster } from "./raster";

/** Far enough to stand for "no edge yet", and still exact in doubles when two are subtracted. */
const FAR = 1e20;

/**
 * Felzenszwalb and Huttenlocher's squared distance transform along one line
 * of the grid, in place: the lower envelope of a parabola rooted at each cell.
 * `f`, `v` and `z` are scratch, as long as the line (`z` one longer).
 */
function transformLine(
  grid: Float64Array, offset: number, stride: number, length: number,
  f: Float64Array, v: Int32Array, z: Float64Array,
): void {
  v[0] = 0;
  z[0] = -FAR;
  z[1] = FAR;
  f[0] = grid[offset]!;
  for (let q = 1, k = 0; q < length; q++) {
    f[q] = grid[offset + q * stride]!;
    let s: number;
    do {
      const r = v[k]!;
      // f[q] - f[r] first: two FARs cancel exactly instead of losing q² to rounding.
      s = (f[q]! - f[r]! + q * q - r * r) / (q - r) / 2;
    } while (s <= z[k]! && --k > -1);
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = FAR;
  }
  for (let q = 0, k = 0; q < length; q++) {
    while (z[k + 1]! < q) k++;
    const r = v[k]!;
    grid[offset + q * stride] = f[r]! + (q - r) * (q - r);
  }
}

/**
 * Spec §7.3 step 2: for every cell, metres from its centre to the edge of the
 * walkable surface, and 0 off it.
 *
 * Exact Euclidean distance to the nearest cell off the surface, less half a
 * cell, since the edge runs midway between the two centres. A cell on the
 * surface's rim is therefore 0.125 m from its edge.
 */
export function distanceToEdge(r: Raster): Float32Array {
  const n = r.cols * r.rows;
  const grid = new Float64Array(n);
  for (let i = 0; i < n; i++) grid[i] = r.cells[i] ? FAR : 0;
  const longest = Math.max(r.cols, r.rows);
  const f = new Float64Array(longest);
  const v = new Int32Array(longest);
  const z = new Float64Array(longest + 1);
  for (let col = 0; col < r.cols; col++) transformLine(grid, col, r.cols, r.rows, f, v, z);
  for (let row = 0; row < r.rows; row++) transformLine(grid, row * r.cols, 1, r.cols, f, v, z);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) if (r.cells[i]) out[i] = (Math.sqrt(grid[i]!) - 0.5) * r.cellM;
  return out;
}
```

- [ ] **Step 4: Write `thin.ts`**

`packages/server/src/paths/thin.ts`:

```ts
import type { Raster } from "./raster";

/**
 * A pixel's eight neighbours as (dx, dy) in grid steps, clockwise from the row
 * before: Zhang and Suen's P2…P9, bit k of `neighbourMask` for position k.
 * Which way the grid's rows run on the plan makes no difference to the result.
 */
const RING: ReadonlyArray<readonly [number, number]> = [
  [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1],
];

/**
 * The eight neighbours of pixel `i` as a bit mask, in RING's order. The
 * caller keeps every set pixel off the grid's outer ring (walkableRaster
 * pads it), so no index wraps to the next row.
 */
function neighbourMask(img: Uint8Array, i: number, cols: number): number {
  return (img[i - cols] ? 1 : 0) | (img[i - cols + 1] ? 2 : 0) | (img[i + 1] ? 4 : 0) | (img[i + cols + 1] ? 8 : 0)
    | (img[i + cols] ? 16 : 0) | (img[i + cols - 1] ? 32 : 0) | (img[i - 1] ? 64 : 0) | (img[i - cols - 1] ? 128 : 0);
}

const bit = (mask: number, k: number) => (mask >> k) & 1;

/** The two sub-iterations' rules, looked up by neighbour mask. */
function zhangSuenRules(): [Uint8Array, Uint8Array] {
  const first = new Uint8Array(256);
  const second = new Uint8Array(256);
  for (let m = 0; m < 256; m++) {
    let set = 0;
    let rises = 0;
    for (let k = 0; k < 8; k++) {
      set += bit(m, k);
      if (!bit(m, k) && bit(m, (k + 1) % 8)) rises++;
    }
    if (set < 2 || set > 6 || rises !== 1) continue;
    const [p2, p4, p6, p8] = [bit(m, 0), bit(m, 2), bit(m, 4), bit(m, 6)];
    if (p2 * p4 * p6 === 0 && p4 * p6 * p8 === 0) first[m] = 1;
    if (p2 * p4 * p8 === 0 && p2 * p6 * p8 === 0) second[m] = 1;
  }
  return [first, second];
}

/** The groups of ring positions `ks` in which each touches another of its group. */
function groups(ks: readonly number[], touching: (a: number, b: number) => boolean): number[][] {
  const out: number[][] = [];
  const seen = new Set<number>();
  for (const k of ks) {
    if (seen.has(k)) continue;
    seen.add(k);
    const group = [k];
    for (let g = 0; g < group.length; g++) {
      for (const j of ks) {
        if (!seen.has(j) && touching(group[g]!, j)) {
          seen.add(j);
          group.push(j);
        }
      }
    }
    out.push(group);
  }
  return out;
}

/**
 * Pixels that can go without changing the shape's topology, and that do not
 * end a line: the set neighbours are one 8-connected group, and the unset ones
 * beside the pixel's four sides one 4-connected group. This is what takes the
 * redundant corner off each step of a staircase, which would otherwise read
 * as a fork.
 */
function removableRule(): Uint8Array {
  const apart = (a: number, b: number) => [Math.abs(RING[a]![0] - RING[b]![0]), Math.abs(RING[a]![1] - RING[b]![1])];
  const touches8 = (a: number, b: number) => Math.max(...apart(a, b)) === 1;
  const touches4 = (a: number, b: number) => apart(a, b).reduce((s, d) => s + d, 0) === 1;
  const rule = new Uint8Array(256);
  for (let m = 0; m < 256; m++) {
    const on: number[] = [];
    const off: number[] = [];
    for (let k = 0; k < 8; k++) (bit(m, k) ? on : off).push(k);
    const lines = groups(on, touches8).length;
    // The even positions are the pixel's own sides.
    const gaps = groups(off, touches4).filter(g => g.some(k => k % 2 === 0)).length;
    if (on.length >= 2 && lines === 1 && gaps === 1) rule[m] = 1;
  }
  return rule;
}

const [FIRST, SECOND] = zhangSuenRules();
const REMOVABLE = removableRule();

/**
 * Spec §7.3 step 2: the surface thinned to a line one pixel wide, with its
 * forks, loops and ends where they are.
 *
 * Zhang and Suen's two sub-iterations, but each one only looks at pixels on
 * the rim: a pixel it may delete always has an unset side neighbour, so the
 * rim is all there is to test. The rim moves inward as pixels go, which keeps
 * L1 under a tenth of a second. Then the corners Zhang and Suen leave on
 * diagonal runs come off.
 */
export function thin(r: Raster): Uint8Array {
  const { cols } = r;
  const img = r.cells.slice();
  let rim: number[] = [];
  for (let i = 0; i < img.length; i++) {
    if (img[i] && (!img[i - cols] || !img[i + 1] || !img[i + cols] || !img[i - 1])) rim.push(i);
  }
  const queued = new Int32Array(img.length);
  let pass = 0;
  for (let removed = true; removed; ) {
    removed = false;
    for (const rule of [FIRST, SECOND]) {
      const doomed = rim.filter(i => rule[neighbourMask(img, i, cols)] === 1);
      if (doomed.length === 0) continue;
      removed = true;
      for (const i of doomed) img[i] = 0;
      pass++;
      const next: number[] = [];
      const queue = (i: number) => {
        if (img[i] && queued[i] !== pass) {
          queued[i] = pass;
          next.push(i);
        }
      };
      for (const i of rim) queue(i);
      for (const i of doomed) {
        queue(i - cols);
        queue(i + 1);
        queue(i + cols);
        queue(i - 1);
      }
      rim = next;
    }
  }

  const on: number[] = [];
  for (let i = 0; i < img.length; i++) if (img[i]) on.push(i);
  for (let removed = true; removed; ) {
    removed = false;
    for (const i of on) {
      if (img[i] && REMOVABLE[neighbourMask(img, i, cols)] === 1) {
        img[i] = 0;
        removed = true;
      }
    }
  }
  return img;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `bash .superpowers/run-tests.sh vitest packages/server/src/paths/distance.test.ts packages/server/src/paths/thin.test.ts`
Expected: PASS, 6 tests.

If the loop test fails with some pixels of three neighbours, the corner step is not running or `removableRule` differs from the above: compare it line by line before changing the test.

- [ ] **Step 6: Typecheck**

Run: `bash .superpowers/run-tests.sh tsc packages/server`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add packages/server/src/paths/distance.ts packages/server/src/paths/distance.test.ts packages/server/src/paths/thin.ts packages/server/src/paths/thin.test.ts
git commit --only -m "feat(server): distance to the edge and a one-pixel skeleton of the walkable surface (Plan 6D)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- packages/server/src/paths/distance.ts packages/server/src/paths/distance.test.ts packages/server/src/paths/thin.ts packages/server/src/paths/thin.test.ts
```

---

### Task 3: From skeleton to lines

**Files:**
- Create: `packages/server/src/paths/graph.ts`
- Create: `packages/server/src/paths/simplify.ts`
- Test: `packages/server/src/paths/graph.test.ts`
- Test: `packages/server/src/paths/simplify.test.ts`

**Interfaces:**
- Consumes (Task 1): `Raster`, `cellCentre`, `walkableRaster`; helpers `floor`, `LEVEL`, `rect`, `TestRoom`. (Task 2): `thin`. From `@oth/model`: `distancePointToSegment`, `Vec2`.
- Produces:
  - `type SkeletonEdge = { a: number; b: number; points: Vec2[]; lengthM: number }`. `points` run from node `a`'s point to node `b`'s through every pixel centre between. A loop is an edge with `a === b`.
  - `type SkeletonGraph = { nodes: Vec2[]; edges: SkeletonEdge[] }`.
  - `skeletonGraph(skeleton: Uint8Array, r: Raster): SkeletonGraph`.
  - `pruneSpurs(graph: SkeletonGraph, minM: number): SkeletonGraph`.
  - `polylineLength(points: readonly Vec2[]): number`.
  - `simplify(points: readonly Vec2[], toleranceM: number): Vec2[]`.

- [ ] **Step 1: Write the failing tests**

`packages/server/src/paths/graph.test.ts`:

```ts
import type { Vec2 } from "@oth/model";
import { describe, expect, it } from "vitest";
import { pruneSpurs, skeletonGraph, type SkeletonEdge, type SkeletonGraph } from "./graph";
import { walkableRaster } from "./raster";
import { thin } from "./thin";
import { floor, LEVEL, rect, type TestRoom } from "./testing";

function graphOf(rooms: TestRoom[]): SkeletonGraph {
  const r = walkableRaster(floor(rooms), LEVEL);
  return skeletonGraph(thin(r), r);
}

/** A 24 × 4 m corridor with a 2 m wide opening `depth` deep off its north side at x 11–13. */
const withAlcove = (depth: number): TestRoom[] => [{
  footprint: [[0, 0], [24, 0], [24, 4], [13, 4], [13, 4 + depth], [11, 4 + depth], [11, 4], [0, 4]],
}];

/** A graph drawn by hand: node i at points[i], and an edge per pair, straight. */
function drawn(points: Vec2[], pairs: Array<[number, number, number]>): SkeletonGraph {
  const edges: SkeletonEdge[] = pairs.map(([a, b, lengthM]) => ({ a, b, points: [points[a]!, points[b]!], lengthM }));
  return { nodes: points, edges };
}

describe("skeletonGraph", () => {
  it("makes a corridor one edge between its two ends", () => {
    const { edges } = graphOf([{ footprint: rect(0, 0, 20, 4) }]);
    expect(edges).toHaveLength(1);
    expect(edges[0]!.a).not.toBe(edges[0]!.b);
    expect(edges[0]!.lengthM).toBeCloseTo(15.75, 1);
  });

  it("makes a T three edges that meet at one node", () => {
    const { edges } = graphOf(withAlcove(5));
    expect(edges).toHaveLength(3);
    const ends = edges.flatMap(e => [e.a, e.b]);
    const fork = ends.find(n => ends.filter(m => m === n).length === 3);
    expect(fork).toBeDefined();
  });

  it("makes a loop with no fork on it one edge from a node back to itself", () => {
    const { edges } = graphOf([{ footprint: rect(0, 0, 30, 20), holes: [rect(10, 7, 20, 13)] }]);
    expect(edges).toHaveLength(1);
    expect(edges[0]!.a).toBe(edges[0]!.b);
    expect(edges[0]!.points[0]).toEqual(edges[0]!.points.at(-1));
  });

  it("gives a room too small to thin into a line a node and no edge", () => {
    const g = graphOf([{ footprint: rect(0, 0, 0.75, 0.75) }]);
    expect([g.nodes.length, g.edges.length]).toEqual([1, 0]);
  });
});

describe("pruneSpurs", () => {
  it("drops a spur shorter than 2 m and joins the line through where it was", () => {
    const raw = graphOf(withAlcove(1));
    expect(raw.edges).toHaveLength(3);
    const { edges } = pruneSpurs(raw, 2);
    expect(edges).toHaveLength(1);
    expect(edges[0]!.lengthM).toBeGreaterThan(19);
  });

  it("keeps a spur 2 m long or more", () => {
    expect(pruneSpurs(graphOf(withAlcove(1.5)), 2).edges).toHaveLength(3);
  });

  it("drops the shorter of two prongs first, so the line keeps its length", () => {
    // A line from (0,0) to a fork at (10,0), with prongs of 1 m and 1.5 m beyond.
    const g = drawn([[0, 0], [10, 0], [10, 1], [11.5, 0]], [[0, 1, 10], [1, 2, 1], [1, 3, 1.5]]);
    const { edges } = pruneSpurs(g, 2);
    expect(edges).toHaveLength(1);
    expect(edges[0]!.lengthM).toBe(11.5);
    expect(edges[0]!.points).toEqual([[0, 0], [10, 0], [11.5, 0]]);
  });

  it("drops a small loop hanging off a fork", () => {
    const g: SkeletonGraph = {
      nodes: [[0, 0], [10, 0], [20, 0]],
      edges: [
        { a: 0, b: 1, points: [[0, 0], [10, 0]], lengthM: 10 },
        { a: 1, b: 2, points: [[10, 0], [20, 0]], lengthM: 10 },
        { a: 1, b: 1, points: [[10, 0], [10.5, 0.5], [10, 1], [10, 0]], lengthM: 1.7 },
      ],
    };
    const { edges } = pruneSpurs(g, 2);
    expect(edges).toHaveLength(1);
    expect(edges[0]!.lengthM).toBe(20);
  });

  it("never prunes a piece standing on its own, however short", () => {
    expect(pruneSpurs(drawn([[0, 0], [1, 0]], [[0, 1, 1]]), 2).edges).toHaveLength(1);
  });
});
```

`packages/server/src/paths/simplify.test.ts`:

```ts
import type { Vec2 } from "@oth/model";
import { describe, expect, it } from "vitest";
import { simplify } from "./simplify";

describe("simplify", () => {
  it("straightens a run of pixel centres that wanders less than the tolerance", () => {
    const run: Vec2[] = Array.from({ length: 41 }, (_, i) => [i * 0.25, i % 2 === 0 ? 0 : 0.125]);
    expect(simplify(run, 0.3)).toEqual([[0, 0], [10, 0]]);
  });

  it("keeps a corner", () => {
    const bend: Vec2[] = [[0, 0], [5, 0], [10, 0], [10, 5], [10, 10]];
    expect(simplify(bend, 0.3)).toEqual([[0, 0], [10, 0], [10, 10]]);
  });

  it("keeps a bump past the tolerance and drops one inside it", () => {
    expect(simplify([[0, 0], [5, 0.4], [10, 0]], 0.3)).toEqual([[0, 0], [5, 0.4], [10, 0]]);
    expect(simplify([[0, 0], [5, 0.2], [10, 0]], 0.3)).toEqual([[0, 0], [10, 0]]);
  });

  it("keeps a loop's corners, and its closing point", () => {
    const square: Vec2[] = [[0, 0], [5, 0], [10, 0], [10, 5], [10, 10], [5, 10], [0, 10], [0, 5], [0, 0]];
    expect(simplify(square, 0.3)).toEqual([[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]);
  });

  it("gives back two points or fewer as they are", () => {
    expect(simplify([[1, 2], [3, 4]], 0.3)).toEqual([[1, 2], [3, 4]]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bash .superpowers/run-tests.sh vitest packages/server/src/paths/graph.test.ts packages/server/src/paths/simplify.test.ts`
Expected: FAIL, `Failed to resolve import "./graph"` and `"./simplify"`.

- [ ] **Step 3: Write `graph.ts`**

`packages/server/src/paths/graph.ts`:

```ts
import type { Vec2 } from "@oth/model";
import { cellCentre, type Raster } from "./raster";

/**
 * One run of the skeleton between two nodes (a fork or an end), or from a
 * node round a loop back to itself. `points` run from node `a`'s point to
 * node `b`'s, through the centre of every pixel between.
 */
export type SkeletonEdge = { a: number; b: number; points: Vec2[]; lengthM: number };
export type SkeletonGraph = { nodes: Vec2[]; edges: SkeletonEdge[] };

export function polylineLength(points: readonly Vec2[]): number {
  let sum = 0;
  for (let i = 0; i + 1 < points.length; i++) {
    sum += Math.hypot(points[i + 1]![0] - points[i]![0], points[i + 1]![1] - points[i]![1]);
  }
  return sum;
}

/**
 * Spec §7.3 step 3, vectorising: the one-pixel skeleton as a graph.
 *
 * A pixel with one neighbour ends a line and one with three or more is a
 * fork. Forks come as small clusters of touching pixels, and each cluster is
 * one node at its middle, so the lines that meet there meet at one point.
 * A loop with no fork on it gets a node where it is first found.
 */
export function skeletonGraph(skeleton: Uint8Array, r: Raster): SkeletonGraph {
  const { cols } = r;
  const around = [-cols, -cols + 1, 1, cols + 1, cols, cols - 1, -1, -cols - 1];
  const on: number[] = [];
  for (let i = 0; i < skeleton.length; i++) if (skeleton[i]) on.push(i);
  const degree = new Uint8Array(skeleton.length);
  for (const i of on) {
    let d = 0;
    for (const o of around) if (skeleton[i + o]) d++;
    degree[i] = d;
  }

  const nodeOf = new Int32Array(skeleton.length).fill(-1);
  const nodes: Vec2[] = [];
  const members: number[][] = [];
  const addNode = (pixels: number[]): number => {
    const id = nodes.length;
    let x = 0;
    let y = 0;
    for (const p of pixels) {
      nodeOf[p] = id;
      const [cx, cy] = cellCentre(r, p);
      x += cx;
      y += cy;
    }
    nodes.push([x / pixels.length, y / pixels.length]);
    members.push(pixels);
    return id;
  };

  for (const i of on) {
    if (degree[i] === 2 || nodeOf[i] !== -1) continue;
    if (degree[i]! < 3) {
      addNode([i]);
      continue;
    }
    const cluster = [i];
    for (let k = 0; k < cluster.length; k++) {
      for (const o of around) {
        const j = cluster[k]! + o;
        if (skeleton[j] && degree[j]! >= 3 && nodeOf[j] === -1 && !cluster.includes(j)) cluster.push(j);
      }
    }
    addNode(cluster);
  }

  const used = new Uint8Array(skeleton.length);
  const edges: SkeletonEdge[] = [];
  const walk = (from: number, start: number, first: number): void => {
    const points: Vec2[] = [nodes[from]!];
    let prev = start;
    let cur = first;
    while (nodeOf[cur] === -1) {
      used[cur] = 1;
      points.push(cellCentre(r, cur));
      // A pixel between nodes has exactly two neighbours: where the walk came from, and on.
      const next = around.map(o => cur + o).find(j => j !== prev && skeleton[j] === 1);
      if (next === undefined) break;
      prev = cur;
      cur = next;
    }
    const to = nodeOf[cur]!;
    points.push(nodes[to]!);
    edges.push({ a: from, b: to, points, lengthM: polylineLength(points) });
  };

  const joined = new Set<string>();
  const forks = nodes.length;
  for (let id = 0; id < forks; id++) {
    for (const s of members[id]!) {
      for (const o of around) {
        const j = s + o;
        if (!skeleton[j]) continue;
        const other = nodeOf[j]!;
        if (other === id) continue;
        if (other !== -1) {
          // Two nodes side by side: one short edge, however many pixel pairs touch.
          const key = id < other ? `${id}:${other}` : `${other}:${id}`;
          if (joined.has(key)) continue;
          joined.add(key);
          const points = [nodes[id]!, nodes[other]!];
          edges.push({ a: id, b: other, points, lengthM: polylineLength(points) });
        } else if (!used[j]) {
          walk(id, s, j);
        }
      }
    }
  }

  for (const i of on) {
    if (nodeOf[i] !== -1 || used[i]) continue;
    const id = addNode([i]);
    const first = around.map(o => i + o).find(j => skeleton[j] === 1);
    if (first !== undefined) walk(id, i, first);
  }
  return { nodes, edges };
}

/** Joins the two edges at every node that has exactly two, so a line runs on through it. */
function joinThrough(edges: SkeletonEdge[]): SkeletonEdge[] {
  let out = edges;
  for (;;) {
    const ends = new Map<number, SkeletonEdge[]>();
    for (const e of out) {
      ends.set(e.a, [...(ends.get(e.a) ?? []), e]);
      ends.set(e.b, [...(ends.get(e.b) ?? []), e]);
    }
    let joinedOne = false;
    for (const [node, at] of ends) {
      const [e, f] = at;
      // A loop's own node has its one edge twice: nothing to join.
      if (at.length !== 2 || !e || !f || e === f) continue;
      const into = e.b === node ? e.points : [...e.points].reverse();
      const onward = f.a === node ? f.points : [...f.points].reverse();
      const joined: SkeletonEdge = {
        a: e.b === node ? e.a : e.b,
        b: f.a === node ? f.b : f.a,
        points: [...into, ...onward.slice(1)],
        lengthM: e.lengthM + f.lengthM,
      };
      out = [...out.filter(x => x !== e && x !== f), joined];
      joinedOne = true;
      break;
    }
    if (!joinedOne) return out;
  }
}

/**
 * Spec §7.3 step 3: spurs shorter than `minM` come off, shortest first.
 *
 * A spur runs from a fork to an end. Once one comes off, a fork left with two
 * edges joins them into one line, so of two short prongs at a corridor's end
 * the longer stays as the line's end, and the corridor keeps its length.
 * A small loop hanging off a fork counts as a spur too. A piece standing on
 * its own is never pruned, however short: it is all there is of that area.
 */
export function pruneSpurs(graph: SkeletonGraph, minM: number): SkeletonGraph {
  let edges = joinThrough(graph.edges);
  for (;;) {
    const degree = new Map<number, number>();
    for (const e of edges) {
      degree.set(e.a, (degree.get(e.a) ?? 0) + 1);
      degree.set(e.b, (degree.get(e.b) ?? 0) + 1);
    }
    const deg = (n: number) => degree.get(n) ?? 0;
    let shortest: SkeletonEdge | null = null;
    for (const e of edges) {
      if (e.lengthM >= minM) continue;
      const spur = e.a === e.b
        ? deg(e.a) > 2
        : (deg(e.a) === 1 && deg(e.b) >= 3) || (deg(e.b) === 1 && deg(e.a) >= 3);
      if (spur && (!shortest || e.lengthM < shortest.lengthM)) shortest = e;
    }
    if (!shortest) return { nodes: graph.nodes, edges };
    const gone = shortest;
    edges = joinThrough(edges.filter(e => e !== gone));
  }
}
```

- [ ] **Step 4: Write `simplify.ts`**

`packages/server/src/paths/simplify.ts`:

```ts
import { distancePointToSegment, type Vec2 } from "@oth/model";

/**
 * Douglas–Peucker: keeps the ends, and every point further than `toleranceM`
 * from the line between the points kept either side of it. A loop, whose
 * ends are the same point, keeps its farthest point first and works out
 * from there.
 */
export function simplify(points: readonly Vec2[], toleranceM: number): Vec2[] {
  if (points.length <= 2) return points.slice();
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [from, to] = stack.pop()!;
    let far = -1;
    let farthest = toleranceM;
    for (let i = from + 1; i < to; i++) {
      const d = distancePointToSegment(points[i]!, points[from]!, points[to]!);
      if (d > farthest) {
        farthest = d;
        far = i;
      }
    }
    if (far !== -1) {
      keep[far] = 1;
      stack.push([from, far], [far, to]);
    }
  }
  return points.filter((_, i) => keep[i] === 1);
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `bash .superpowers/run-tests.sh vitest packages/server/src/paths/graph.test.ts packages/server/src/paths/simplify.test.ts`
Expected: PASS, 14 tests.

- [ ] **Step 6: Typecheck**

Run: `bash .superpowers/run-tests.sh tsc packages/server`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add packages/server/src/paths/graph.ts packages/server/src/paths/graph.test.ts packages/server/src/paths/simplify.ts packages/server/src/paths/simplify.test.ts
git commit --only -m "feat(server): the skeleton as lines, with spurs under 2 m pruned and Douglas-Peucker at 0.3 m (Plan 6D)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- packages/server/src/paths/graph.ts packages/server/src/paths/graph.test.ts packages/server/src/paths/simplify.ts packages/server/src/paths/simplify.test.ts
```

---

### Task 4: Joining doorways, stops and entrances

**Files:**
- Create: `packages/server/src/paths/connect.ts`
- Test: `packages/server/src/paths/connect.test.ts`

**Interfaces:**
- Consumes (Task 1): `Raster`, `walkableAt`, `walkableRaster`; helpers `doorway`, `floor`, `LEVEL`, `rect`. From `@oth/model`: `live`, `ringCentroid`, `MapModel`, `Vec2`.
- Produces:
  - `type TargetType = "doorway" | "stop" | "entrance"`;
  - `type Target = { type: TargetType; id: string; point: Vec2 }`;
  - `type Link = { from: { type: TargetType; id: string }; segment: [Vec2, Vec2] }` and `type Unconnected = { type: TargetType; id: string; reason: string }`, the same shapes as `PathSuggestion`'s `links` and `unconnected` items;
  - `SLACK_M = 0.6`, `MAX_LINK_M = 50`;
  - `REASONS = { noSurface, offSurface, noLine, blocked }`, the four reason strings;
  - `linkTargets(model: MapModel, levelId: string): Target[]`: live doorways (midpoint), then stops (`portalEndpoints`: footprint centroid, else `point`), then entrances (`point`), each group by id;
  - `clearLine(r: Raster, a: Vec2, b: Vec2, slackM: number): boolean`;
  - `connect(r: Raster, lines: readonly (readonly Vec2[])[], targets: readonly Target[]): { links: Link[]; unconnected: Unconnected[] }`.

- [ ] **Step 1: Write the failing test**

`packages/server/src/paths/connect.test.ts`:

```ts
import type { Vec2 } from "@oth/model";
import { describe, expect, it } from "vitest";
import { connect, linkTargets, REASONS, type Target } from "./connect";
import { walkableRaster } from "./raster";
import { doorway, floor, LEVEL, rect } from "./testing";

const corridor = walkableRaster(floor([{ footprint: rect(0, 0, 20, 4) }]), LEVEL);
/** The corridor's centre line, as the skeleton would give it. */
const middle: Vec2[] = [[2, 2], [18, 2]];
const entrance = (id: string, point: Vec2): Target => ({ type: "entrance", id, point });

describe("linkTargets", () => {
  it("takes each doorway's midpoint, each stop's footprint centre or point, and each entrance, on this floor", () => {
    const model = floor([], {
      doorways: [
        doorway("door-b", [[9, 4], [11, 4]]),
        doorway("door-a", [[0, 1], [0, 3]]),
        { ...doorway("door-gone", [[5, 4], [6, 4]]), deletedAt: "2026-09-28T10:00:00.000Z" },
        { ...doorway("door-up", [[5, 4], [6, 4]]), levelId: "oth-L2" },
      ],
      portals: [{ id: "lift-1", kind: "lift" }],
      portalEndpoints: [
        { id: "stop-shaft", portalId: "lift-1", levelId: LEVEL, roomId: "room-a", point: [0, 0], footprint: rect(16, 1, 18, 3) },
        { id: "stop-point", portalId: "lift-1", levelId: LEVEL, roomId: "room-a", point: [5, 5] },
      ],
      entrances: [{ id: "gate-4", levelId: LEVEL, roomId: "room-a", point: [1, 2] }],
    });
    expect(linkTargets(model, LEVEL)).toEqual([
      { type: "doorway", id: "door-a", point: [0, 2] },
      { type: "doorway", id: "door-b", point: [10, 4] },
      { type: "stop", id: "stop-point", point: [5, 5] },
      { type: "stop", id: "stop-shaft", point: [17, 2] },
      { type: "entrance", id: "gate-4", point: [1, 2] },
    ]);
  });
});

describe("connect", () => {
  it("joins a doorway on the corridor's wall straight across to the line", () => {
    const { links, unconnected } = connect(corridor, [middle], [{ type: "doorway", id: "door-1", point: [10, 4] }]);
    expect(links).toEqual([{ from: { type: "doorway", id: "door-1" }, segment: [[10, 4], [10, 2]] }]);
    expect(unconnected).toEqual([]);
  });

  it("reaches across the drawing's wall to a doorway just off the surface", () => {
    const { links } = connect(corridor, [middle], [{ type: "doorway", id: "door-1", point: [10, 4.4] }]);
    expect(links).toEqual([{ from: { type: "doorway", id: "door-1" }, segment: [[10, 4.4], [10, 2]] }]);
  });

  it("lists a doorway off the walkable surface as unconnected", () => {
    const { links, unconnected } = connect(corridor, [middle], [{ type: "doorway", id: "door-9", point: [50, 50] }]);
    expect(links).toEqual([]);
    expect(unconnected).toEqual([{ type: "doorway", id: "door-9", reason: REASONS.offSurface }]);
  });

  it("takes the nearest point it can reach in a straight line, not the nearest point", () => {
    // Two corridors with a 1 m wall between them, joined at the east end.
    const u = walkableRaster(floor([{ footprint: rect(0, 0, 20, 4) }, { footprint: rect(0, 5, 20, 9) }, { footprint: rect(20, 0, 24, 9) }]), LEVEL);
    const south: Vec2[] = [[2, 1], [22, 1]];
    const north: Vec2[] = [[2, 5.5], [22, 5.5]];
    const { links } = connect(u, [south, north], [entrance("gate-1", [10, 3.9])]);
    expect(links).toEqual([{ from: { type: "entrance", id: "gate-1" }, segment: [[10, 3.9], [10, 1]] }]);
  });

  it("lists what no straight line can reach without leaving the surface", () => {
    const apart = walkableRaster(floor([{ footprint: rect(0, 0, 20, 4) }, { footprint: rect(30, 0, 34, 4) }]), LEVEL);
    const { unconnected } = connect(apart, [middle], [entrance("gate-2", [32, 2])]);
    expect(unconnected).toEqual([{ type: "entrance", id: "gate-2", reason: REASONS.blocked }]);
  });

  it("joins nothing to a line more than 50 m away", () => {
    const long = walkableRaster(floor([{ footprint: rect(0, 0, 100, 4) }]), LEVEL);
    const { unconnected } = connect(long, [[[80, 2], [98, 2]]], [entrance("gate-3", [10, 2])]);
    expect(unconnected).toEqual([{ type: "entrance", id: "gate-3", reason: REASONS.noLine }]);
  });

  it("says a floor with no walkable area has nothing to join", () => {
    const empty = walkableRaster(floor([]), LEVEL);
    const { unconnected } = connect(empty, [], [entrance("gate-4", [1, 1])]);
    expect(unconnected).toEqual([{ type: "entrance", id: "gate-4", reason: REASONS.noSurface }]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bash .superpowers/run-tests.sh vitest packages/server/src/paths/connect.test.ts`
Expected: FAIL, `Failed to resolve import "./connect"`.

- [ ] **Step 3: Write `connect.ts`**

`packages/server/src/paths/connect.ts`:

```ts
import { live, ringCentroid, type MapModel, type Vec2 } from "@oth/model";
import { walkableAt, type Raster } from "./raster";

export type TargetType = "doorway" | "stop" | "entrance";
/** What spec §7.3 step 4 joins to the lines: where it is, and what it is. */
export type Target = { type: TargetType; id: string; point: Vec2 };
export type Link = { from: { type: TargetType; id: string }; segment: [Vec2, Vec2] };
export type Unconnected = { type: TargetType; id: string; reason: string };

/**
 * A doorway lies on the wall line between its two rooms, so its middle is on
 * the surface's rim or just off it, across the drawing's wall. A link may
 * leave the surface for this far from where it starts.
 */
export const SLACK_M = 0.6;
/** Nothing further from a line than this is joined to it: that is a path of its own. */
export const MAX_LINK_M = 50;
/** How closely a line is sampled for the nearest point a link can reach. */
const SAMPLE_M = 0.5;

export const REASONS = {
  noSurface: "This floor has no walkable area yet.",
  offSurface: "It is not on or beside a walkable area.",
  noLine: `No path was proposed within ${MAX_LINK_M} m of it.`,
  blocked: "No straight line from it to a proposed path stays on the walkable area.",
} as const;

const byId = <T extends { id: string }>(xs: T[]): T[] => xs.sort((p, q) => p.id.localeCompare(q.id));

/**
 * Every doorway's midpoint, every stop's footprint centre (its point when it
 * has no footprint), and every entrance on the floor, in that order.
 */
export function linkTargets(model: MapModel, levelId: string): Target[] {
  const doorways = byId(live(model.doorways).filter(d => d.levelId === levelId)).map((d): Target => ({
    type: "doorway", id: d.id,
    point: [(d.segment[0][0] + d.segment[1][0]) / 2, (d.segment[0][1] + d.segment[1][1]) / 2],
  }));
  const stops = byId(live(model.portalEndpoints).filter(e => e.levelId === levelId)).map((e): Target => ({
    type: "stop", id: e.id, point: e.footprint ? ringCentroid(e.footprint) : e.point,
  }));
  const entrances = byId(live(model.entrances).filter(e => e.levelId === levelId)).map((e): Target => ({
    type: "entrance", id: e.id, point: e.point,
  }));
  return [...doorways, ...stops, ...entrances];
}

/** Whether a walkable cell's centre is within `slackM` of `p`. */
function besideSurface(r: Raster, p: Vec2, slackM: number): boolean {
  if (walkableAt(r, p)) return true;
  const reach = Math.ceil(slackM / r.cellM);
  const col = Math.floor((p[0] - r.originX) / r.cellM);
  const row = Math.floor((p[1] - r.originY) / r.cellM);
  for (let dy = -reach; dy <= reach; dy++) {
    for (let dx = -reach; dx <= reach; dx++) {
      const c = col + dx;
      const w = row + dy;
      if (c < 0 || w < 0 || c >= r.cols || w >= r.rows || !r.cells[w * r.cols + c]) continue;
      const x = r.originX + (c + 0.5) * r.cellM;
      const y = r.originY + (w + 0.5) * r.cellM;
      if (Math.hypot(x - p[0], y - p[1]) <= slackM) return true;
    }
  }
  return false;
}

/**
 * Whether the straight line from `a` to `b` stays on the walkable surface,
 * sampled every half cell, past the first `slackM` from `a`.
 */
export function clearLine(r: Raster, a: Vec2, b: Vec2, slackM: number): boolean {
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const steps = Math.max(1, Math.ceil(length / (r.cellM / 2)));
  for (let k = 0; k <= steps; k++) {
    const t = k / steps;
    if (t * length <= slackM) continue;
    if (!walkableAt(r, [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])) return false;
  }
  return true;
}

/** The foot of `p` on segment a–b. */
function closestOn(p: Vec2, a: Vec2, b: Vec2): Vec2 {
  const vx = b[0] - a[0];
  const vy = b[1] - a[1];
  const lengthSq = vx * vx + vy * vy;
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / lengthSq));
  return [a[0] + t * vx, a[1] + t * vy];
}

/** Points on the lines within MAX_LINK_M of `p`, nearest first: each segment's foot of `p`, and a point every half metre. */
function pointsNear(p: Vec2, lines: readonly (readonly Vec2[])[]): Vec2[] {
  const found: Array<{ q: Vec2; d: number }> = [];
  const add = (q: Vec2) => {
    const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (d <= MAX_LINK_M) found.push({ q, d });
  };
  for (const line of lines) {
    for (let i = 0; i + 1 < line.length; i++) {
      const a = line[i]!;
      const b = line[i + 1]!;
      add(closestOn(p, a, b));
      const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / SAMPLE_M));
      for (let k = 0; k <= n; k++) add([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
    }
  }
  return found.sort((x, y) => x.d - y.d).map(f => f.q);
}

/**
 * Spec §7.3 step 4: each target joined to the nearest point on a line that a
 * straight segment can reach without leaving the walkable surface, or listed
 * as unconnected with the reason.
 */
export function connect(
  r: Raster, lines: readonly (readonly Vec2[])[], targets: readonly Target[],
): { links: Link[]; unconnected: Unconnected[] } {
  const links: Link[] = [];
  const unconnected: Unconnected[] = [];
  for (const t of targets) {
    const from = { type: t.type, id: t.id };
    const reason = r.cols === 0
      ? REASONS.noSurface
      : !besideSurface(r, t.point, SLACK_M) ? REASONS.offSurface : null;
    if (reason) {
      unconnected.push({ ...from, reason });
      continue;
    }
    const near = pointsNear(t.point, lines);
    const to = near.find(q => clearLine(r, t.point, q, SLACK_M));
    if (to) links.push({ from, segment: [t.point, to] });
    else unconnected.push({ ...from, reason: near.length === 0 ? REASONS.noLine : REASONS.blocked });
  }
  return { links, unconnected };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bash .superpowers/run-tests.sh vitest packages/server/src/paths/connect.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Typecheck**

Run: `bash .superpowers/run-tests.sh tsc packages/server`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/paths/connect.ts packages/server/src/paths/connect.test.ts
git commit --only -m "feat(server): join doorways, stops and entrances to the proposed lines, or say why not (Plan 6D)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- packages/server/src/paths/connect.ts packages/server/src/paths/connect.test.ts
```

---

### Task 5: `suggestPaths`

**Files:**
- Create: `packages/server/src/paths/suggest.ts`
- Test: `packages/server/src/paths/suggest.test.ts`

**Interfaces:**
- Consumes (Task 1): `walkableRaster`, `cellIndex`, `Raster`, and the helpers `doorway`, `floor`, `LEVEL`, `rect`, `Pt`, `TestRoom`. (Task 2): `distanceToEdge`, `thin`. (Task 3): `skeletonGraph`, `pruneSpurs`, `simplify`. (Task 4): `connect`, `linkTargets`, `REASONS`.
- Produces:
  - `SPUR_M = 2`, `SIMPLIFY_M = 0.3`, `MIN_WIDTH_M = 1.2`, `MAX_WIDTH_M = 6`;
  - `type PathSuggestion`, verbatim from interfaces.md (see Global Constraints);
  - `lineWidth(points: readonly Vec2[], r: Raster, toEdge: Float32Array): number`;
  - `suggestPaths(model: MapModel, levelId: string): PathSuggestion`. Pure and read-only. Lines come longest first, points rounded to 0.01 m, widths to 0.1 m. It throws `SurfaceTooLarge` (Task 1) past a kilometre square.

- [ ] **Step 1: Write the failing test**

`packages/server/src/paths/suggest.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { REASONS } from "./connect";
import { MAX_WIDTH_M, MIN_WIDTH_M, suggestPaths } from "./suggest";
import { doorway, floor, LEVEL, rect, type Pt, type TestRoom } from "./testing";

const suggest = (rooms: TestRoom[], extra: Record<string, unknown> = {}) => suggestPaths(floor(rooms, extra), LEVEL);

describe("suggestPaths on the spec's shapes (§11)", () => {
  it("gives a straight corridor one straight line down its middle, as wide as the corridor", () => {
    const { lines } = suggest([{ footprint: rect(0, 0, 20, 4) }]);
    expect(lines).toHaveLength(1);
    const [line] = lines;
    expect(line!.polyline).toHaveLength(2);
    for (const [, y] of line!.polyline) expect(Math.abs(y - 2)).toBeLessThan(0.2);
    const xs = line!.polyline.map(p => p[0]).sort((a, b) => a - b);
    expect(xs[0]!).toBeLessThan(3);
    expect(xs[1]!).toBeGreaterThan(17);
    expect(line!.widthM).toBeGreaterThanOrEqual(3.7);
    expect(line!.widthM).toBeLessThanOrEqual(4.1);
  });

  it("gives an L one line with one bend", () => {
    const { lines } = suggest([{ footprint: [[0, 0], [20, 0], [20, 20], [16, 20], [16, 4], [0, 4]] }]);
    expect(lines).toHaveLength(1);
    expect(lines[0]!.polyline).toHaveLength(3);
  });

  it("gives the same L drawn as two rooms 0.3 m apart the same one line", () => {
    const { lines } = suggest([{ footprint: rect(0, 0, 20, 4) }, { footprint: rect(16, 4.3, 20, 20) }]);
    expect(lines).toHaveLength(1);
    expect(lines[0]!.polyline).toHaveLength(3);
  });

  it("gives a concourse with a hole a loop round the hole", () => {
    const { lines } = suggest([{ footprint: rect(0, 0, 30, 20), holes: [rect(10, 7, 20, 13)] }]);
    expect(lines).toHaveLength(1);
    const loop = lines[0]!.polyline;
    expect(loop[0]).toEqual(loop.at(-1));
    expect(loop.length).toBeGreaterThanOrEqual(5);
  });

  it("goes round a shop standing in a hall, not through it", () => {
    const { lines } = suggest([{ footprint: rect(0, 0, 30, 20) }, { footprint: rect(10, 7, 20, 13), kind: "room", walkable: false }]);
    expect(lines).toHaveLength(1);
    const loop = lines[0]!.polyline;
    expect(loop[0]).toEqual(loop.at(-1));
  });

  it("prunes a dead-end spur shorter than 2 m, and keeps a side corridor", () => {
    const alcove = (depth: number): Pt[] => [[0, 0], [24, 0], [24, 4], [13, 4], [13, 4 + depth], [11, 4 + depth], [11, 4], [0, 4]];
    expect(suggest([{ footprint: alcove(1) }]).lines).toHaveLength(1);
    expect(suggest([{ footprint: alcove(5) }]).lines).toHaveLength(3);
  });

  it("gives a diagonal corridor one line", () => {
    const h = 1.5 / Math.SQRT2;
    const { lines } = suggest([{ footprint: [[-h, h], [h, -h], [20 + h, 20 - h], [20 - h, 20 + h]] }]);
    expect(lines).toHaveLength(1);
    expect(lines[0]!.polyline).toHaveLength(2);
  });

  it("joins a doorway on the wall, and lists a doorway off the surface as unconnected", () => {
    const { links, unconnected } = suggest([{ footprint: rect(0, 0, 20, 4) }], {
      doorways: [doorway("door-shop", [[9, 4], [11, 4]]), doorway("door-far", [[50, 50], [52, 50]])],
    });
    expect(links).toHaveLength(1);
    expect(links[0]!.from).toEqual({ type: "doorway", id: "door-shop" });
    expect(links[0]!.segment[0]).toEqual([10, 4]);
    expect(links[0]!.segment[1][0]).toBeCloseTo(10, 1);
    expect(Math.abs(links[0]!.segment[1][1] - 2)).toBeLessThan(0.2);
    expect(unconnected).toEqual([{ type: "doorway", id: "door-far", reason: REASONS.offSurface }]);
  });
});

describe("suggestPaths", () => {
  it("clamps widths to 1.2–6 m", () => {
    expect(suggest([{ footprint: rect(0, 0, 20, 1) }]).lines.map(l => l.widthM)).toEqual([MIN_WIDTH_M]);
    expect(suggest([{ footprint: rect(0, 0, 40, 20) }]).lines.map(l => l.widthM)).toEqual([MAX_WIDTH_M]);
  });

  it("gives a floor with no walkable area no lines, and says why nothing is joined", () => {
    const s = suggest([{ footprint: rect(0, 0, 20, 4), walkable: false }], { doorways: [doorway("door-1", [[9, 4], [11, 4]])] });
    expect(s).toEqual({ lines: [], links: [], unconnected: [{ type: "doorway", id: "door-1", reason: REASONS.noSurface }] });
  });

  it("puts the longest line first and rounds to the centimetre", () => {
    const { lines } = suggest([{ footprint: [[0, 0], [24, 0], [24, 4], [13, 4], [13, 9], [11, 9], [11, 4], [0, 4]] }]);
    const lengths = lines.map(l => Math.hypot(l.polyline[1]![0] - l.polyline[0]![0], l.polyline[1]![1] - l.polyline[0]![1]));
    expect(lengths).toEqual([...lengths].sort((a, b) => b - a));
    for (const p of lines.flatMap(l => l.polyline)) {
      expect(Math.round(p[0] * 100) / 100).toBe(p[0]);
      expect(Math.round(p[1] * 100) / 100).toBe(p[1]);
    }
  });

  it("does a floor the size of L1 with 36 courtyards in well under 2 s", () => {
    const holes: Pt[][] = [];
    for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) holes.push(rect(10 + i * 32, 10 + j * 35, 30 + i * 32, 30 + j * 35));
    const started = performance.now();
    const { lines } = suggest([{ footprint: rect(0, 0, 200, 220), holes }]);
    expect(performance.now() - started).toBeLessThan(2000);
    expect(lines.length).toBeGreaterThan(36);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bash .superpowers/run-tests.sh vitest packages/server/src/paths/suggest.test.ts`
Expected: FAIL, `Failed to resolve import "./suggest"`.

- [ ] **Step 3: Write `suggest.ts`**

`packages/server/src/paths/suggest.ts`:

```ts
import type { MapModel, Vec2 } from "@oth/model";
import { connect, linkTargets } from "./connect";
import { distanceToEdge } from "./distance";
import { pruneSpurs, skeletonGraph } from "./graph";
import { cellIndex, walkableRaster, type Raster } from "./raster";
import { simplify } from "./simplify";
import { thin } from "./thin";

/** Spec §7.3 step 3. */
export const SPUR_M = 2;
export const SIMPLIFY_M = 0.3;
/** Spec §7.3 step 5. */
export const MIN_WIDTH_M = 1.2;
export const MAX_WIDTH_M = 6;

/** The shared interface contract's type, verbatim. */
export type PathSuggestion = {
  lines: { polyline: Vec2[]; widthM: number }[];
  links: { from: { type: "doorway" | "stop" | "entrance"; id: string }; segment: [Vec2, Vec2] }[];
  unconnected: { type: "doorway" | "stop" | "entrance"; id: string; reason: string }[];
};

/** Spec §7.3 step 5: twice the median distance to the edge along the line, clamped. */
export function lineWidth(points: readonly Vec2[], r: Raster, toEdge: Float32Array): number {
  const d = points.map(p => {
    const i = cellIndex(r, p);
    return i < 0 ? 0 : toEdge[i]!;
  }).sort((x, y) => x - y);
  const mid = d.length >> 1;
  const median = d.length % 2 === 1 ? d[mid]! : (d[mid - 1]! + d[mid]!) / 2;
  return Math.min(MAX_WIDTH_M, Math.max(MIN_WIDTH_M, 2 * median));
}

const cm = (v: number) => Math.round(v * 100) / 100;
const at = (p: Vec2): Vec2 => [cm(p[0]), cm(p[1])];

/**
 * Spec §7.3: a first pass of one floor's pathways, from its walkable surface.
 * Read-only and pure: the floor is rasterised, thinned to its skeleton, pruned,
 * vectorised and simplified, and every doorway, stop and entrance is joined to
 * the result or listed with why not. Longest line first; coordinates to the
 * centimetre and widths to 0.1 m, since the plan is traced no finer.
 *
 * Throws SurfaceTooLarge when the floor's walkable areas span more than a
 * kilometre square.
 */
export function suggestPaths(model: MapModel, levelId: string): PathSuggestion {
  const raster = walkableRaster(model, levelId);
  const targets = linkTargets(model, levelId);
  let lines: PathSuggestion["lines"] = [];
  if (raster.cols > 0) {
    const toEdge = distanceToEdge(raster);
    const { edges } = pruneSpurs(skeletonGraph(thin(raster), raster), SPUR_M);
    lines = edges
      .filter(e => e.lengthM > 0)
      .sort((p, q) => q.lengthM - p.lengthM)
      .map(e => ({ polyline: simplify(e.points, SIMPLIFY_M).map(at), widthM: Math.round(lineWidth(e.points, raster, toEdge) * 10) / 10 }));
  }
  const { links, unconnected } = connect(raster, lines.map(l => l.polyline), targets);
  return {
    lines,
    links: links.map(l => ({ from: l.from, segment: [at(l.segment[0]), at(l.segment[1])] })),
    unconnected,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bash .superpowers/run-tests.sh vitest packages/server/src/paths/suggest.test.ts`
Expected: PASS, 12 tests. The L1-sized test took about 90 ms in the scratch run.

- [ ] **Step 5: Run the whole folder**

Run: `bash .superpowers/run-tests.sh vitest packages/server/src/paths`
Expected: PASS, 52 tests in 7 files.

- [ ] **Step 6: Typecheck**

Run: `bash .superpowers/run-tests.sh tsc packages/server`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add packages/server/src/paths/suggest.ts packages/server/src/paths/suggest.test.ts
git commit --only -m "feat(server): suggestPaths, a first pass of a floor's pathways from its walkable areas (Plan 6D)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- packages/server/src/paths/suggest.ts packages/server/src/paths/suggest.test.ts
```

---

### Task 6: The `suggest_paths` tool

**Files:**
- Create: `packages/server/src/mcp/tools/paths.ts`
- Test: `packages/server/src/mcp/tools/paths.test.ts`
- Modify: `packages/server/src/mcp/tools/read.ts` (two `export` keywords)
- Modify: `packages/server/src/mcp/limits.ts` (`READ_TOOLS`)
- Modify: `packages/server/src/mcp/server.ts` (register the tool)

**Interfaces:**
- Consumes (Task 5): `suggestPaths`. (Task 1): `SurfaceTooLarge`. From the server: `assembleModel`, `runTool`, `replyJson`, `Refusal`, `ToolContext`, `READ_ONLY`; `mcpFixture`, `call`, `createEntity`, `PresenceTracker`, `callKinds`, and the `auditLog` and `pathways` tables in tests.
- Produces:
  - in `read.ts`: `export const FLOOR` (the floor argument's zod schema) and `export function levelFor(ctx: ToolContext, model: MapModel, floor: string): Level`, which refuses an unknown floor and marks presence;
  - `registerPathTools(server: McpServer, ctx: ToolContext): void` in `mcp/tools/paths.ts`;
  - the MCP tool `suggest_paths`, input `{ floor: string }` (a code in any case, or an id), reply JSON `{ floor: string } & PathSuggestion`, annotated read-only;
  - `READ_TOOLS` includes `"suggest_paths"`, so it counts as a read.

- [ ] **Step 1: Write the failing test**

`packages/server/src/mcp/tools/paths.test.ts`:

```ts
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { beforeEach, describe, expect, it } from "vitest";
import { auditLog, pathways } from "../../db/schema";
import { createEntity } from "../../entities/repository";
import { PresenceTracker } from "../../presence/service";
import { callKinds } from "../limits";
import { call, mcpFixture, type McpFixture } from "../testing";

let f: McpFixture;
let client: Client;
let presence: PresenceTracker;

beforeEach(async () => {
  presence = new PresenceTracker();
  f = await mcpFixture({ deps: { presence } });
  const by = f.wei.id;
  await createEntity(f.db, "room", {
    id: "L1-corridor", levelId: "oth-L1", kind: "area", walkable: true, heightM: 4, nameEn: "Corridor",
    footprint: [[0, 0], [20, 0], [20, 4], [0, 4]],
  }, by);
  await createEntity(f.db, "doorway", {
    id: "L1-door-shop", levelId: "oth-L1", roomA: "L1-corridor", roomB: "L1-shop", segment: [[9, 4], [11, 4]], widthM: 2,
  }, by);
  await createEntity(f.db, "entrance", { id: "L1-gate-4", levelId: "oth-L1", roomId: "L1-plaza", point: [60, 60], nameEn: "Gate 4" }, by);
  client = await f.connect();
});

describe("suggest_paths", () => {
  it("proposes a floor's lines, joins its doorways, and lists what it could not join", async () => {
    const { text, isError } = await call(client, "suggest_paths", { floor: "L1" });
    expect(isError).toBe(false);
    expect(JSON.parse(text)).toEqual({
      floor: "L1",
      lines: [{ polyline: [[2.13, 1.88], [17.88, 1.88]], widthM: 3.8 }],
      links: [{ from: { type: "doorway", id: "L1-door-shop" }, segment: [[10, 4], [10, 1.88]] }],
      unconnected: [{ type: "entrance", id: "L1-gate-4", reason: "It is not on or beside a walkable area." }],
    });
  });

  it("saves nothing, takes the floor's code in any case, and shows Wei's Claude on that floor", async () => {
    const audited = (await f.db.select().from(auditLog)).length;
    expect((await call(client, "suggest_paths", { floor: "l1" })).isError).toBe(false);
    expect(await f.db.select().from(pathways)).toEqual([]);
    expect(await f.db.select().from(auditLog)).toHaveLength(audited);
    expect(presence.list()).toContainEqual(expect.objectContaining({ displayName: "Wei (Claude)", levelId: "oth-L1" }));
  });

  it("gives a floor with no walkable area no lines", async () => {
    expect(JSON.parse((await call(client, "suggest_paths", { floor: "L2" })).text)).toEqual({
      floor: "L2", lines: [], links: [], unconnected: [],
    });
  });

  it("refuses a floor that does not exist", async () => {
    expect(await call(client, "suggest_paths", { floor: "L9" })).toMatchObject({
      isError: true, text: "There is no floor L9. list_floors gives every floor.",
    });
  });

  it("says why when a room far off makes the floor too big for one pass", async () => {
    await createEntity(f.db, "room", {
      id: "L1-stray", levelId: "oth-L1", kind: "area", walkable: true, heightM: 4,
      footprint: [[2000, 2000], [2010, 2000], [2010, 2004], [2000, 2004]],
    }, f.wei.id);
    const { text, isError } = await call(client, "suggest_paths", { floor: "L1" });
    expect(isError).toBe(true);
    expect(text).toMatch(/^Nothing suggested for L1\. Its walkable areas span 2010 by 2004 m/);
  });

  it("is a read: marked read-only, and counted against the token's reads", async () => {
    const { tools } = await client.listTools();
    expect(tools.find(t => t.name === "suggest_paths")?.annotations?.readOnlyHint).toBe(true);
    expect(callKinds({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "suggest_paths", arguments: { floor: "L1" } } }))
      .toEqual(["read"]);
  });
});
```

The first test's numbers are the scratch run's output for this corridor: the skeleton ends 2.13 m in from each end, half a corridor's width, and the even-width corridor's middle row of cells is at y = 1.875.

- [ ] **Step 2: Run the test to verify it fails**

Run: `bash .superpowers/run-tests.sh vitest packages/server/src/mcp/tools/paths.test.ts`
Expected: FAIL. The tool is not listed, so calls come back as errors (`Tool suggest_paths not found`) and the read-only check finds no tool.

- [ ] **Step 3: Export the floor argument and the floor lookup from `read.ts`**

In `packages/server/src/mcp/tools/read.ts`, change:

```ts
const FLOOR = z.string().min(1).max(40).describe('A floor\'s code, such as "L1", or its id, such as "oth-L1".');
```

to:

```ts
export const FLOOR = z.string().min(1).max(40).describe('A floor\'s code, such as "L1", or its id, such as "oth-L1".');
```

and:

```ts
function levelFor(ctx: ToolContext, model: MapModel, floor: string) {
```

to:

```ts
export function levelFor(ctx: ToolContext, model: MapModel, floor: string) {
```

Nothing else in the file changes. If Plan 6C has already exported them, leave them as they are.

- [ ] **Step 4: Write the tool**

`packages/server/src/mcp/tools/paths.ts`:

```ts
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { assembleModel } from "../../model/assemble";
import { SurfaceTooLarge } from "../../paths/raster";
import { suggestPaths } from "../../paths/suggest";
import type { ToolContext } from "../context";
import { Refusal, replyJson, runTool } from "../results";
import { FLOOR, READ_ONLY, levelFor } from "./read";

/** Spec §7.3: the pathway first pass, for the draw_paths step (§4.1 step 7). */
export function registerPathTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool("suggest_paths", {
    title: "Suggest pathways",
    description:
      "A first pass of one floor's pathways, worked out from its walkable areas. lines are centre lines in metres, " +
      "each with a width. links join each doorway, lift or stair stop and entrance to the nearest line with a straight " +
      "segment. unconnected lists the ones that could not be joined, and why. Nothing is saved: check it over " +
      "view_plan, then create the pathways you agree with (type pathway, with polyline and widthM).",
    inputSchema: { floor: FLOOR },
    annotations: READ_ONLY,
  }, ({ floor }) => runTool(ctx, async () => {
    const model = await assembleModel(ctx.db);
    const level = levelFor(ctx, model, floor);
    try {
      return replyJson({ floor: level.code, ...suggestPaths(model, level.id) });
    } catch (err) {
      if (err instanceof SurfaceTooLarge) throw new Refusal(`Nothing suggested for ${level.code}. ${err.message}`);
      throw err;
    }
  }));
}
```

- [ ] **Step 5: Count it as a read**

In `packages/server/src/mcp/limits.ts`, change:

```ts
export const READ_TOOLS: ReadonlySet<string> = new Set([
  "list_floors", "get_floor", "get", "check_floor", "list_frames", "view_frame", "view_plan",
]);
```

to:

```ts
export const READ_TOOLS: ReadonlySet<string> = new Set([
  "list_floors", "get_floor", "get", "check_floor", "list_frames", "view_frame", "view_plan",
  "suggest_paths",
]);
```

If Plan 6C has added its read tools here already, add `"suggest_paths"` beside them.

- [ ] **Step 6: Register it**

In `packages/server/src/mcp/server.ts`, add the import beside the other tool files':

```ts
import { registerPathTools } from "./tools/paths";
```

and in `buildMcpServer`, after `registerEditTools(server, ctx);`:

```ts
  registerPathTools(server, ctx);
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `bash .superpowers/run-tests.sh vitest packages/server/src/mcp`
Expected: PASS, including `tools/paths.test.ts` (6 tests) and `security.test.ts`'s "marks delete and publish destructive, reads read-only, and no other write either", which fails if `suggest_paths` is annotated read-only but missing from `READ_TOOLS`.

- [ ] **Step 8: Typecheck**

Run: `bash .superpowers/run-tests.sh tsc packages/server`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add packages/server/src/mcp/tools/paths.ts packages/server/src/mcp/tools/paths.test.ts
git commit --only -m "feat(server): suggest_paths, Claude's read-only first pass of a floor's pathways (Plan 6D)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- packages/server/src/mcp/tools/paths.ts packages/server/src/mcp/tools/paths.test.ts packages/server/src/mcp/tools/read.ts packages/server/src/mcp/limits.ts packages/server/src/mcp/server.ts
```

---

### Task 7: The real floors, and a picture for the reviewer

**Files:**
- Create: `packages/server/src/paths/debugSvg.ts`
- Test: `packages/server/src/paths/debugSvg.test.ts`
- Test (by hand only): `packages/server/src/paths/real.test.ts`
- Scratch, not committed: `C:/Users/qhuip/AppData/Local/Temp/claude/C--Users-qhuip-Repositories-oth-navigation/93f7627a-6919-479a-9608-fc0736467df9/scratchpad/p6d/dump.mts`, the copied database and the model it dumps. Below, `$P6D` stands for that `p6d` folder.

**Interfaces:**
- Consumes (Task 5): `suggestPaths`, `PathSuggestion`, `MIN_WIDTH_M`, `MAX_WIDTH_M`. (Task 4): `linkTargets`. (Task 1): `walkableRaster`, `walkableAt`; helpers `doorway`, `floor`, `LEVEL`, `rect`. From the server: `createDevDb`, `assembleModel`; `sharp`.
- Produces: `suggestionSvg(model: MapModel, levelId: string, s: PathSuggestion): string`, a picture with north up, 4 px per metre. It is for people checking the pass; nothing in the app calls it.

- [ ] **Step 1: Write the failing test**

`packages/server/src/paths/debugSvg.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { suggestionSvg } from "./debugSvg";
import { suggestPaths } from "./suggest";
import { doorway, floor, LEVEL, rect } from "./testing";

const count = (svg: string, tag: string) => (svg.match(new RegExp(`<${tag} `, "g")) ?? []).length;

describe("suggestionSvg", () => {
  it("draws each room, each line as a band and a centre line, each link, and a ring at each unconnected target", () => {
    const model = floor([{ footprint: rect(0, 0, 20, 4) }, { footprint: rect(30, 0, 34, 4), kind: "room", walkable: false }], {
      doorways: [doorway("door-1", [[9, 4], [11, 4]]), doorway("door-far", [[10, 50], [12, 50]])],
    });
    const svg = suggestionSvg(model, LEVEL, suggestPaths(model, LEVEL));
    expect(svg.startsWith("<svg ")).toBe(true);
    expect(svg).toMatch(/Lines: 1\. Links: 1\. Unconnected: 1\./);
    expect(count(svg, "path")).toBe(2);
    expect(count(svg, "polyline")).toBe(3);
    expect(count(svg, "circle")).toBe(1);
  });

  it("puts north at the top", () => {
    const model = floor([{ footprint: rect(0, 0, 20, 4) }], { doorways: [doorway("door-far", [[10, 50], [12, 50]])] });
    const svg = suggestionSvg(model, LEVEL, suggestPaths(model, LEVEL));
    const ringY = Number(/<circle cx="[\d.]+" cy="([\d.]+)"/.exec(svg)![1]);
    const lineY = Number(/<polyline points="[\d.]+,([\d.]+)/.exec(svg)![1]);
    expect(ringY).toBeLessThan(lineY);
  });

  it("says so when there is nothing on the floor", () => {
    expect(suggestionSvg(floor([]), LEVEL, { lines: [], links: [], unconnected: [] })).toMatch(/Nothing on this floor\./);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bash .superpowers/run-tests.sh vitest packages/server/src/paths/debugSvg.test.ts`
Expected: FAIL, `Failed to resolve import "./debugSvg"`.

- [ ] **Step 3: Write `debugSvg.ts`**

`packages/server/src/paths/debugSvg.ts`:

```ts
import { live, type MapModel, type Ring, type Vec2 } from "@oth/model";
import { linkTargets } from "./connect";
import type { PathSuggestion } from "./suggest";

/** Pixels per metre: L1's 213 × 229 m comes out about 850 × 920 px. */
const SCALE = 4;
const MARGIN_M = 5;

/**
 * A picture of a suggestion over the floor's rooms, for a person to judge by
 * eye: walkable rooms grey, other rooms outlined, voids pink, each line as a
 * band as wide as its width with its centre line in blue, links in green, and
 * each unconnected doorway, stop or entrance as a red ring. North is up.
 */
export function suggestionSvg(model: MapModel, levelId: string, s: PathSuggestion): string {
  const rooms = live(model.rooms).filter(r => r.levelId === levelId);
  const targets = linkTargets(model, levelId);
  const all = [...rooms.flatMap(r => r.footprint), ...s.lines.flatMap(l => l.polyline), ...targets.map(t => t.point)];
  if (all.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="40"><rect width="240" height="40" fill="#ffffff"/>`
      + `<text x="8" y="25" font-family="sans-serif" font-size="14">Nothing on this floor.</text></svg>`;
  }
  const minX = Math.min(...all.map(p => p[0])) - MARGIN_M;
  const maxX = Math.max(...all.map(p => p[0])) + MARGIN_M;
  const minY = Math.min(...all.map(p => p[1])) - MARGIN_M;
  const maxY = Math.max(...all.map(p => p[1])) + MARGIN_M;
  const x = (p: Vec2) => ((p[0] - minX) * SCALE).toFixed(1);
  const y = (p: Vec2) => ((maxY - p[1]) * SCALE).toFixed(1);
  const pts = (ps: readonly Vec2[]) => ps.map(p => `${x(p)},${y(p)}`).join(" ");
  const ring = (r: Ring) => `M${pts(r)}Z`;

  const parts: string[] = [];
  for (const room of rooms) {
    const style = room.kind === "void"
      ? `fill="#fecdd3" stroke="#e11d48"`
      : room.walkable ? `fill="#e5e7eb" stroke="#9ca3af"` : `fill="none" stroke="#9ca3af"`;
    parts.push(`<path d="${[room.footprint, ...room.holes].map(ring).join(" ")}" fill-rule="evenodd" ${style} stroke-width="1"/>`);
  }
  for (const line of s.lines) {
    parts.push(`<polyline points="${pts(line.polyline)}" fill="none" stroke="#2563eb" stroke-opacity="0.25" stroke-width="${(line.widthM * SCALE).toFixed(1)}" stroke-linejoin="round"/>`);
    parts.push(`<polyline points="${pts(line.polyline)}" fill="none" stroke="#1d4ed8" stroke-width="2"/>`);
  }
  for (const link of s.links) {
    parts.push(`<polyline points="${pts(link.segment)}" fill="none" stroke="#16a34a" stroke-width="2" stroke-dasharray="4 3"/>`);
  }
  const where = new Map(targets.map(t => [`${t.type}:${t.id}`, t.point]));
  for (const u of s.unconnected) {
    const p = where.get(`${u.type}:${u.id}`);
    if (p) parts.push(`<circle cx="${x(p)}" cy="${y(p)}" r="6" fill="none" stroke="#dc2626" stroke-width="2"/>`);
  }
  const width = Math.ceil((maxX - minX) * SCALE);
  const height = Math.ceil((maxY - minY) * SCALE);
  const title = `Lines: ${s.lines.length}. Links: ${s.links.length}. Unconnected: ${s.unconnected.length}.`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height + 24}" viewBox="0 -24 ${width} ${height + 24}">`
    + `<rect x="0" y="-24" width="${width}" height="${height + 24}" fill="#ffffff"/>`
    + `<text x="8" y="-8" font-family="sans-serif" font-size="14">${title}</text>`
    + parts.join("") + `</svg>`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bash .superpowers/run-tests.sh vitest packages/server/src/paths/debugSvg.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Write the by-hand real-floor test**

`packages/server/src/paths/real.test.ts`:

```ts
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseModel } from "@oth/model";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { suggestionSvg } from "./debugSvg";
import { walkableAt, walkableRaster } from "./raster";
import { MAX_WIDTH_M, MIN_WIDTH_M, suggestPaths } from "./suggest";

/**
 * By hand only: suggestPaths on the real floors, from a model dumped off a
 * scratch copy of the dev database (Plan 6D, Task 7 says how). It never runs
 * in the suite, since the data never enters the repo.
 *
 *   OTH_MODEL_JSON=<scratch>/model.json OTH_PATHS_OUT=<scratch> \
 *     bash .superpowers/run-tests.sh vitest packages/server/src/paths/real.test.ts
 */
const modelPath = process.env.OTH_MODEL_JSON;
const outDir = process.env.OTH_PATHS_OUT;

describe.skipIf(!modelPath)("suggestPaths on the real floors", () => {
  for (const code of ["L1", "L2"]) {
    it(`proposes ${code}'s paths in under 2 s, every line on the walkable surface`, async () => {
      const model = parseModel(JSON.parse(await readFile(modelPath!, "utf8")));
      const level = model.levels.find(l => l.code === code)!;
      const started = performance.now();
      const s = suggestPaths(model, level.id);
      const ms = performance.now() - started;
      console.log(`${code}: ${s.lines.length} lines, ${s.links.length} links, ${s.unconnected.length} unconnected, ${Math.round(ms)} ms`);
      if (outDir) {
        const svg = suggestionSvg(model, level.id, s);
        await writeFile(join(outDir, `paths-${code}.svg`), svg);
        await sharp(Buffer.from(svg)).png().toFile(join(outDir, `paths-${code}.png`));
      }
      expect(ms).toBeLessThan(2000);
      expect(s.lines.length).toBeGreaterThan(0);
      const surface = walkableRaster(model, level.id);
      const off = s.lines.flatMap(l => l.polyline).filter(p => !walkableAt(surface, p));
      expect(off).toEqual([]);
      for (const line of s.lines) {
        expect(line.widthM).toBeGreaterThanOrEqual(MIN_WIDTH_M);
        expect(line.widthM).toBeLessThanOrEqual(MAX_WIDTH_M);
      }
    });
  }
});
```

Run: `bash .superpowers/run-tests.sh vitest packages/server/src/paths/real.test.ts`
Expected: the suite is skipped (no `OTH_MODEL_JSON`), and nothing fails.

- [ ] **Step 6: Get a real model from a scratch copy of the dev database**

Copy the main checkout's database into the scratchpad. Its source is only read. Run these as separate plain commands:

```bash
mkdir -p "C:/Users/qhuip/AppData/Local/Temp/claude/C--Users-qhuip-Repositories-oth-navigation/93f7627a-6919-479a-9608-fc0736467df9/scratchpad/p6d/data"
```

```bash
cp -r "C:/Users/qhuip/Repositories/oth_navigation/packages/server/data/dev-db" "C:/Users/qhuip/AppData/Local/Temp/claude/C--Users-qhuip-Repositories-oth-navigation/93f7627a-6919-479a-9608-fc0736467df9/scratchpad/p6d/data/dev-db"
```

Save `$P6D/dump.mts`. It follows the 5D review's `scratchpad/final5d/dump.mts`. `createDevDb` opens `<dir>/dev-db` and migrates the copy to this branch's migrations; the main checkout's files are untouched.

```ts
// Dumps the assembled model of the scratch copy of the dev database, for Plan 6D's real-floor check.
import { writeFileSync } from "node:fs";
import { createDevDb } from "file:///C:/Users/qhuip/Repositories/oth_navigation/.claude/worktrees/ux-overhaul/packages/server/src/db/dev.ts";
import { assembleModel } from "file:///C:/Users/qhuip/Repositories/oth_navigation/.claude/worktrees/ux-overhaul/packages/server/src/model/assemble.ts";

const dir = "C:/Users/qhuip/AppData/Local/Temp/claude/C--Users-qhuip-Repositories-oth-navigation/93f7627a-6919-479a-9608-fc0736467df9/scratchpad/p6d";
const db = await createDevDb(`${dir}/data`);
const model = await assembleModel(db);
writeFileSync(`${dir}/model.json`, JSON.stringify(model));
const on = (list: Array<{ levelId: string }>, id: string) => list.filter(x => x.levelId === id).length;
for (const level of model.levels) {
  console.log(`${level.code}: ${on(model.rooms, level.id)} rooms, ${on(model.doorways, level.id)} doorways, ` +
    `${on(model.entrances, level.id)} entrances, ${on(model.portalEndpoints, level.id)} stops`);
}
process.exit(0);
```

Run it from the worktree root:

```bash
npx tsx "C:/Users/qhuip/AppData/Local/Temp/claude/C--Users-qhuip-Repositories-oth-navigation/93f7627a-6919-479a-9608-fc0736467df9/scratchpad/p6d/dump.mts"
```

Expected: one line per floor, with L1 at about 228 rooms and L2 at about 14, and `$P6D/model.json` written. If PGlite refuses to open the copy, delete the copy's `.s.PGSQL.5432.lock.out` file (never the original's) and run it again.

- [ ] **Step 7: Run the real-floor check and look at the picture**

```bash
OTH_MODEL_JSON="C:/Users/qhuip/AppData/Local/Temp/claude/C--Users-qhuip-Repositories-oth-navigation/93f7627a-6919-479a-9608-fc0736467df9/scratchpad/p6d/model.json" OTH_PATHS_OUT="C:/Users/qhuip/AppData/Local/Temp/claude/C--Users-qhuip-Repositories-oth-navigation/93f7627a-6919-479a-9608-fc0736467df9/scratchpad/p6d" bash .superpowers/run-tests.sh vitest packages/server/src/paths/real.test.ts
```

Expected: PASS, 2 tests, printing one line per floor. On the 21:30 dump the scratch run printed `L1: 190 lines, 0 links, 0 unconnected` in 116–222 ms, and `L2: 3 lines, 0 links, 0 unconnected` in 24–50 ms. A fresher copy can differ; if L1 has doorways, entrances or stops by now, links and unconnected will not be 0.

Then open `$P6D/paths-L1.png` and `$P6D/paths-L2.png` (the Read tool shows a PNG) and check by eye:
- the lines stay inside grey areas and go round the rooms drawn inside the Hawker Centre, Stadium and Town Square zones;
- the West Concourse has a connected network down its length;
- no line runs down the thin gap between two neighbouring shops.

If `off` is not empty, print those points and find them on the picture before changing any code: a fork's node is the mean of its pixels, and on an odd shape it could fall just off the surface.

- [ ] **Step 8: Record the result**

Put in your report: the two printed lines, the paths of the two PNGs, and one sentence each on what the pictures show. The reviewer looks at `paths-L1.png` itself.

- [ ] **Step 9: Typecheck**

Run: `bash .superpowers/run-tests.sh tsc packages/server`
Expected: no errors.

- [ ] **Step 10: Commit**

Only the three repo files. The scratch database, model and pictures stay in the scratchpad.

```bash
git add packages/server/src/paths/debugSvg.ts packages/server/src/paths/debugSvg.test.ts packages/server/src/paths/real.test.ts
git commit --only -m "test(server): suggestPaths on the real L1 and L2, with a picture for the reviewer (Plan 6D)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- packages/server/src/paths/debugSvg.ts packages/server/src/paths/debugSvg.test.ts packages/server/src/paths/real.test.ts
```

---

## Spec coverage

| Spec | Where |
|---|---|
| §7.3 step 1, the walkable surface | Task 1 |
| §7.3 step 2, 0.25 m raster, distance transform, one-pixel skeleton | Tasks 1 and 2 |
| §7.3 step 3, spurs under 2 m, vectorise, Douglas–Peucker 0.3 m | Task 3 |
| §7.3 step 4, doorways, stops and entrances joined by straight segments inside the surface, or unconnected | Task 4 |
| §7.3 step 5, width twice the median distance, 1.2–6 m | Task 5 (`lineWidth`) |
| §7.3 step 6, lines, links and the unconnected list | Task 5 (`suggestPaths`) and Task 6 (the reply) |
| §7.3 runtime, under 2 s for L1 | Task 5 (an L1-sized floor) and Task 7 (the real L1) |
| §7.2, `suggest_paths(floor)`, read-only | Task 6 |
| §7.4, limits and scope | Task 6 (`READ_TOOLS`; it reads one floor and writes nothing) |
| §10, "its tests on L1 and L2" | Task 7 |
| §11, "a corridor, an L, a concourse with a hole … and L1's real areas" | Tasks 5 and 7 |

## Delivery

No migration and no UI. It can ship on its own once the controller has run the whole suite. Plan 6C's `draw_paths` prompt names `suggest_paths`, and its prompt test checks the name against the registered tools, so 6C's prompt test needs this plan merged first.

Teammate note: *Claude Code can now ask for a first pass of a floor's pathways (`suggest_paths`). It proposes lines and saves nothing.*
