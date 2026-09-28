# Plan 5A — Seeing the survey in the map — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Answer "how do I know this building is the Starbucks?" on screen. Rooms carry their place's name on the plan and in the 3D preview. Clicking a room shows the place and the photo that proves it. A Places tab lists every confirmed place on the floor, with what is still missing.

**Architecture:** This part needs no server change. The model gains two pure geometry functions: `labelPoint`, the pole of inaccessibility, and `labelSpan`, how wide and tall a label centred there can be. The renderer gains the fit rule (`fitLabel`), a 3D label layer built on drei's `Html`, and a `children` slot on `MapScene`. A new `editor/src/places/` folder holds the pure functions for labels, evidence and checklist rows, plus the place card and the Places tab. `PlanCanvas` gains an `overlays` slot that the plan's labels mount through. Parts B and D use the same two slots later.

**Tech Stack:** TypeScript (strict, `noUncheckedIndexedAccess`), React 18, zustand, Tailwind 3, react-three-fiber 8, `@react-three/drei` 9.122 (`Html`, already a dependency), three 0.169, Vitest 1.6 (node for model and renderer, jsdom for the editor).

**Spec:** [`docs/design-and-plans/specs/2026-09-28-map-fidelity-and-agent-access-design.md`](../specs/2026-09-28-map-fidelity-and-agent-access-design.md). Read §4 (Part A) and §8 (Delivery) first. This plan covers §4 in full.

## Global Constraints

- Work in the worktree `C:\Users\qhuip\Repositories\oth_navigation\.claude\worktrees\ux-overhaul` on branch `ux-overhaul`. Never `cd` to the main checkout, and never use `git stash`.
- **Plan 3 is finishing in this worktree.** Task 12 has committed (`c3a2cb1`): `FloorWorkspace` hosts `BuildWorkspace`, and `App.tsx`, the old panels and `flow/sections.ts` are gone. Never import or recreate any of them.
  - Task 11's fix round is still editing `build/BuildWorkspace.tsx` and `build/BuildWorkspace.test.tsx`. It adds a `select(null)` and an error boundary around `PreviewPanel`.
  - **Tasks 4 and 8 edit those two files. Start them only after that fix round has committed, and re-read both files first.** The snippets below anchor on code that the fix round does not touch. If an anchor has moved, keep the intent and fit the edit to the file as it now stands.
- **Parts B, C and D are running in parallel.**
  - Shared files: `packages/model/src/index.ts` and `packages/renderer/src/index.ts`. Append your own lines only.
  - Part B mounts its draft layer through the `overlays` slot, and Part D mounts its layers through the `children` slot. So neither slot may change shape after Tasks 2 and 4 commit.
  - This part touches no server file, no `db/schema.ts`, no `drizzle/`, no `api/client.ts` and no `testing/fakeApi.ts`.
- The second builder's files are theirs. Do not edit `packages/server/src/cli/planL1.ts`, `packages/renderer/src/{massing,shell,theme}.ts`, or `renderer/{LevelGroup,RoomMesh}.tsx`, which are Part D's.
- Stage by path, and commit with `git commit --only -m "…" -- <paths>`. Never run `git add -A` or `git add .`, because `.superpowers/` is untracked. If git reports `index.lock`, wait and retry, and never delete the lock.
- **Tests run one folder or file at a time, throttled, from the worktree root:**
  `timeout 300 npx vitest run <folder-or-file> --poolOptions.threads.maxThreads=2 --poolOptions.threads.minThreads=1`
  - Never run the whole suite. The controller runs it at checkpoints.
  - Leave no vitest process running.
- Typecheck with `npx tsc -b packages/<pkg>`: model, renderer or editor.
- No new dependencies. `@react-three/drei`'s `Html` is already installed (9.122.0).
- Copy follows the overhaul's rules:
  - second person, sentence case, and loading text that ends with `…`;
  - colour is never the only signal (✓, the word *proposed*, dashed versus solid);
  - 13 px is the smallest text anywhere.
- Colours are the tokens in `packages/editor/tailwind.config.ts`.
  - SVG attributes and the renderer's inline styles cannot use Tailwind names. Their hex values are written once, in `LABEL_COLOURS` (Task 2).
  - **Renderer components use inline styles only.** Tailwind builds its CSS from the editor's own files, so a class in `packages/renderer` produces no CSS.
- Comments explain *why*, in the repo's voice. Every test file sits beside the file it tests.
- Commit messages are `type(scope): summary` with an explanatory body, and end with exactly `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **A place bound to a room that has since been deleted.** Deleting a room never unbinds its place, and Bind places never offered such a place again. The Places tab must show it as *Room gone* with **Bind it**, and **Bind it** must land on a picker that lists it. Pinned in Task 6 (`placeRows`, `rowAction`) and Task 8 (`BindPlaces`, `BindTools`).
2. **Two places bound to one room**, such as a duplicate that Review never merged. The label and the card must name the confirmed one, then the first by name, and the card must say what else is bound there. Pinned in Task 3 (`placesByRoom`, `roomLabels`) and Task 5 (the card).
3. **A frame in the bin, deleted footage, or footage filed under no floor, or under another floor.** None of these may be the best frame. **Open in Survey** must go to the footage's own floor, and must not be offered where Survey cannot show the frame. Pinned in Task 3 (`bestEvidence`, `surveyLink`) and Task 5.
4. **L1's extracted footprints:** slivers, zero-area rings, rings that cross themselves, and rooms with holes. `labelPoint` must return promptly, inside the room wherever the room has an inside, and the fit rule must hide what cannot fit rather than overflow. Pinned in Task 1 and Task 2.
5. **A stale report.** Survey and Review save without validating, so *Photos disagree* can be old, or missing. The Places tab checks again as it opens, and a report that a save brought meanwhile wins. Pinned in Task 6 (`recheck`) and Task 7.

---

## Tasks, order and parallelism

| Task | Touches Plan 3's `build/`, `floor/` or `PlanCanvas`? | Needs first | Runs beside |
|---|---|---|---|
| 1. `labelPoint` and `labelSpan` (model) | no | — | 2 |
| 2. The fit rule, 3D labels and `MapScene`'s `children` slot (renderer) | no | — | 1 |
| 3. Room labels and evidence (pure, `editor/src/places/`) | no | 1, 2 | — |
| 4. Labels on the plan and in 3D (the `overlays` slot, mounted in Build) | **yes**, after Task 11's fix round | 3 | 5, 6 |
| 5. The place card, in the Build inspector | **yes** (`SelectionInspector`) | 3 | 4, 6 |
| **✂ Shippable after Task 5.** The team can see names on the plan and in 3D, and clicking a room shows its place and photo. | | | |
| 6. The checklist's rows and a fresh report (pure) | no | 3 | 4, 5 |
| 7. The Places tab | **yes** (`floor/FloorWorkspace.tsx`) | 5, 6 | 8 |
| 8. Links that land: `?place=`, *Room gone* rebinding, and the Floors card line | **yes** (`BuildWorkspace`, `BindPlaces`) | 4, 6 | 7 |

The file sets of tasks that run side by side are disjoint:

- Task 4 touches `plan/` and `BuildWorkspace*`.
- Task 5 touches `places/{BoxedFrame,PlaceCard}*` and `SelectionInspector*`.
- Task 6 touches `places/rows*` and `state/recheck*`.
- Task 7 touches `route*`, `shell/*`, `floor/`, `places/PlacesWorkspace*` and `shell/Workspace.test.tsx`.
- Task 8 touches `BuildWorkspace*`, `BindPlaces*`, `home/FloorCard.tsx` and `home/FloorsHome.test.tsx`.

## File map

```
packages/model/src/geometry/label.ts                     CREATE  1  labelPoint, labelSpan
packages/model/src/geometry/label.test.ts                CREATE  1
packages/model/src/index.ts                              MODIFY  1  (append one export)
packages/renderer/src/labelFit.ts                        CREATE  2  RoomLabel, fitLabel, labelExtra, pixelsPerMetreAt, sceneLabelsToShow, LABEL_COLOURS, LABEL_FONT_PX
packages/renderer/src/labelFit.test.ts                   CREATE  2
packages/renderer/src/RoomLabels.tsx                     CREATE  2  SceneRoomLabels
packages/renderer/src/MapScene.tsx                       MODIFY  2  children slot
packages/renderer/src/index.ts                           MODIFY  2  (append two exports)
packages/editor/src/places/labels.ts                     CREATE  3  placesByRoom, roomLabels
packages/editor/src/places/labels.test.ts                CREATE  3
packages/editor/src/places/evidence.ts                   CREATE  3  bestEvidence, frameWindow, imageWidthFor, surveyLink, statusLine
packages/editor/src/places/evidence.test.ts              CREATE  3
packages/editor/src/plan/PlanCanvas.tsx                  MODIFY  4  overlays slot
packages/editor/src/plan/PlanCanvas.test.tsx             MODIFY  4
packages/editor/src/plan/RoomLabels.tsx                  CREATE  4  PlanRoomLabels
packages/editor/src/plan/RoomLabels.test.tsx             CREATE  4
packages/editor/src/build/BuildWorkspace.tsx             MODIFY  4 (labels), 8 (?place=, shared recheck)
packages/editor/src/build/BuildWorkspace.test.tsx        MODIFY  4, 8
packages/editor/src/places/BoxedFrame.tsx                CREATE  5
packages/editor/src/places/PlaceCard.tsx                 CREATE  5
packages/editor/src/places/PlaceCard.test.tsx            CREATE  5
packages/editor/src/build/SelectionInspector.tsx         MODIFY  5
packages/editor/src/build/SelectionInspector.test.tsx    MODIFY  5
packages/editor/src/places/rows.ts                       CREATE  6  placeRows, placesSummary, rowAction, whereText, filters, onMapLine
packages/editor/src/places/rows.test.ts                  CREATE  6
packages/editor/src/state/recheck.ts                     CREATE  6
packages/editor/src/state/recheck.test.ts                CREATE  6
packages/editor/src/route.ts                             MODIFY  7  FloorTab gains "places"
packages/editor/src/route.test.tsx                       MODIFY  7
packages/editor/src/shell/FloorTabs.tsx                  MODIFY  7
packages/editor/src/shell/Header.test.tsx                MODIFY  7
packages/editor/src/shell/Workspace.test.tsx             MODIFY  7
packages/editor/src/floor/FloorWorkspace.tsx             MODIFY  7
packages/editor/src/places/PlacesWorkspace.tsx           CREATE  7
packages/editor/src/places/PlacesWorkspace.test.tsx      CREATE  7
packages/editor/src/build/BindPlaces.tsx                 MODIFY  8
packages/editor/src/build/BindPlaces.test.tsx            MODIFY  8
packages/editor/src/home/FloorCard.tsx                   MODIFY  8
packages/editor/src/home/FloorsHome.test.tsx             MODIFY  8
```

## Decisions this plan makes where the spec is silent

- **Spec names.**
  - `labelPoint(ring, holes)` returns `{ point, distance }`. A second function, `labelSpan`, gives the widest and tallest a label *centred on that point* can be, because truncating "to the room's width" needs the width at the label. The whole line through the point would overstate it at the crook of an L.
  - The spec names two files `RoomLabels.tsx`. They export `PlanRoomLabels` (editor) and `SceneRoomLabels` (renderer), so that `BuildWorkspace` can import both.
- **"Confirmed by Wei, 27 Sep"** is read from the shown frame's tag.
  - A place records no confirmer, and binding overwrites its `updatedBy`.
  - A tag's last write is its confirmation: Accept in Review, or the tag typed in Survey.
  - A later box edit changes it. That is accepted.
- **The filters overlap.**
  - *On the map* means bound to a live room on this floor.
  - *Gaps* means any gap.
  - A bound place with no confirmed photo is in both. The heading counts *On the map*.
- **Walkway places** (`pathwayKindId`) are left out of the checklist. They are built as paths and never bound, as Bind places and the Bind step's done rule already treat them.
- **Show on map** and **Bind it** both land on Build's **Bind places** step (`step=bind`).
  - **Show on map** also carries `select=room:<id>`, on the room's own floor.
  - **Bind it** carries `place=<id>`. `BuildWorkspace` reads it once, then takes it out of the address.
- **The word "proposed"** in labels is sky-700 (`#0369a1`). The `proposed` token (`#0284c7`) is under 4.5:1 as 13 px text on white, as Ruling 13 found for the Review pill.
- **Labels cover every live room on the active floor.** The fit rule hides the ones that can't fit, such as columns and small details, at the zooms where they can't fit.

---

### Task 1: `labelPoint` and `labelSpan`

**Files:**
- Create: `packages/model/src/geometry/label.ts`
- Create: `packages/model/src/geometry/label.test.ts`
- Modify: `packages/model/src/index.ts` (append one line)

**Interfaces:**
- Consumes: `bboxOfRing`, `pointInPolygon` from `./point`; `ringCentroid` from `./ring`; `distancePointToSegment` from `./segment`; `Ring`, `Vec2` from `../primitives`.
- Produces:
  - `export type LabelPoint = { point: Vec2; distance: number }`
  - `export type LabelSpan = { width: number; height: number }`
  - `export function labelPoint(outer: Ring, holes?: readonly Ring[], precision?: number): LabelPoint`
  - `export function labelSpan(point: Vec2, outer: Ring, holes?: readonly Ring[]): LabelSpan`
  - All four are exported from `@oth/model`.

- [ ] **Step 1: Write the failing test**

`packages/model/src/geometry/label.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { Ring } from "../primitives";
import { labelPoint, labelSpan } from "./label";
import { pointInPolygon, pointInRing } from "./point";
import { ringCentroid } from "./ring";

const square: Ring = [[0, 0], [10, 0], [10, 10], [0, 10]];
/** An L one metre wide: its centroid falls in the crook, outside it. */
const thinL: Ring = [[0, 0], [10, 0], [10, 1], [1, 1], [1, 10], [0, 10]];
const hole: Ring = [[3, 3], [7, 3], [7, 7], [3, 7]];

describe("labelPoint", () => {
  it("finds the middle of a square, as far from every wall as it can be", () => {
    const { point, distance } = labelPoint(square);
    expect(point[0]).toBeCloseTo(5, 1);
    expect(point[1]).toBeCloseTo(5, 1);
    expect(distance).toBeCloseTo(5, 1);
  });

  it("stays inside an L-shaped unit, where the centroid does not", () => {
    expect(pointInRing(ringCentroid(thinL), thinL)).toBe(false);
    const { point, distance } = labelPoint(thinL);
    expect(pointInRing(point, thinL)).toBe(true);
    // The widest circle that fits is 0.586 m in radius, across the corner;
    // the answer is within the 0.1 m asked for.
    expect(distance).toBeGreaterThan(0.48);
    expect(distance).toBeLessThanOrEqual(0.59);
  });

  it("keeps out of a room's holes", () => {
    const { point, distance } = labelPoint(square, [hole]);
    expect(pointInPolygon(point, square, [hole])).toBe(true);
    // The deepest points are in the corners, 1.76 m from both walls and the hole's corner.
    expect(distance).toBeGreaterThan(1.65);
  });

  it("gives the same answer whichever way the ring runs", () => {
    const reversed = [...thinL].reverse();
    expect(labelPoint(reversed).distance).toBeCloseTo(labelPoint(thinL).distance, 5);
  });

  it("finishes on a sliver a thousand times longer than it is wide", () => {
    const sliver: Ring = [[0, 0], [1000, 0], [1000, 0.02], [0, 0.02]];
    const { point, distance } = labelPoint(sliver);
    expect(pointInRing(point, sliver)).toBe(true);
    expect(distance).toBeCloseTo(0.01, 2);
  });

  it("answers a ring with no area without throwing: nothing fits there", () => {
    const { point, distance } = labelPoint([[0, 0], [1, 0], [2, 0]]);
    expect(point.every(Number.isFinite)).toBe(true);
    expect(distance).toBe(0);
  });

  it("answers a ring that crosses itself without hanging", () => {
    const bowtie: Ring = [[0, 0], [10, 10], [10, 0], [0, 10]];
    expect(labelPoint(bowtie).point.every(Number.isFinite)).toBe(true);
  });
});

describe("labelSpan", () => {
  it("measures a square across and up through its middle", () => {
    expect(labelSpan([5, 5], square)).toEqual({ width: 10, height: 10 });
  });

  it("measures only the arm of an L that the point is in", () => {
    expect(labelSpan([5, 0.5], thinL)).toEqual({ width: 10, height: 1 });
  });

  it("measures what a centred label can use, not the whole line through the point", () => {
    // In the crook of the L: 0.5 m to the left wall, 9.5 m to the right.
    expect(labelSpan([0.5, 0.5], thinL)).toEqual({ width: 1, height: 1 });
    expect(labelSpan([2, 5], square)).toEqual({ width: 4, height: 10 });
  });

  it("stops at a hole", () => {
    expect(labelSpan([1.5, 5], square, [hole])).toEqual({ width: 3, height: 10 });
  });

  it("is zero outside the shape", () => {
    expect(labelSpan([20, 5], square)).toEqual({ width: 0, height: 0 });
  });
});
```

- [ ] **Step 2: Run the test to verify that it fails**

Run: `timeout 300 npx vitest run packages/model/src/geometry/label.test.ts --poolOptions.threads.maxThreads=2 --poolOptions.threads.minThreads=1`
Expected: FAIL with `Failed to resolve import "./label"`.

- [ ] **Step 3: Write the implementation**

`packages/model/src/geometry/label.ts`:

```ts
import type { Ring, Vec2 } from "../primitives";
import { bboxOfRing, pointInPolygon } from "./point";
import { ringCentroid } from "./ring";
import { distancePointToSegment } from "./segment";

export type LabelPoint = {
  /** The point deepest inside the shape: its pole of inaccessibility. */
  point: Vec2;
  /** How far that point is from the nearest edge, in metres: the radius of the widest circle that fits. */
  distance: number;
};

export type LabelSpan = { width: number; height: number };

/**
 * Cells examined before settling for the best found so far. A traced room
 * needs a few hundred; the cap is for footprints no room should have, which
 * the extractor can still produce.
 */
const MAX_CELLS = 4000;
/** At most this many starting cells along a room's length. */
const MAX_CELLS_PER_SIDE = 64;

type Cell = { x: number; y: number; h: number; d: number; max: number };

function edgeDistance(p: Vec2, rings: readonly Ring[]): number {
  let min = Number.POSITIVE_INFINITY;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      min = Math.min(min, distancePointToSegment(p, ring[j]!, ring[i]!));
    }
  }
  return min;
}

/** A square cell of half-width `h`: its centre's signed distance, and the most any point in it could have. */
function makeCell(x: number, y: number, h: number, outer: Ring, holes: readonly Ring[]): Cell {
  const p: Vec2 = [x, y];
  const d = edgeDistance(p, [outer, ...holes]) * (pointInPolygon(p, outer, holes) ? 1 : -1);
  return { x, y, h, d, max: d + h * Math.SQRT2 };
}

function swap(cells: Cell[], i: number, j: number): void {
  const t = cells[i]!;
  cells[i] = cells[j]!;
  cells[j] = t;
}

/** A max-heap on `max`: the cell that could still hold the deepest point comes out first. */
class CellQueue {
  private readonly cells: Cell[] = [];

  get size(): number {
    return this.cells.length;
  }

  push(cell: Cell): void {
    const a = this.cells;
    a.push(cell);
    let i = a.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (a[parent]!.max >= a[i]!.max) break;
      swap(a, parent, i);
      i = parent;
    }
  }

  pop(): Cell | undefined {
    const a = this.cells;
    const top = a[0];
    const last = a.pop();
    if (a.length > 0 && last) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l]!.max > a[m]!.max) m = l;
        if (r < a.length && a[r]!.max > a[m]!.max) m = r;
        if (m === i) break;
        swap(a, i, m);
        i = m;
      }
    }
    return top;
  }
}

/**
 * Where a room's name goes: the point deepest inside it (Mapbox's polylabel).
 *
 * Not the centroid, which falls outside an L-shaped unit and on the wall of a
 * U. The plane is cut into square cells, and the cell that could still hold a
 * deeper point is always split next, until none can beat the best by more
 * than `precision` metres.
 */
export function labelPoint(outer: Ring, holes: readonly Ring[] = [], precision = 0.1): LabelPoint {
  const box = bboxOfRing(outer);
  const width = box.maxX - box.minX;
  const height = box.maxY - box.minY;
  const centroid = ringCentroid(outer);
  // A line or a point has no inside; its centroid is as good as anywhere.
  if (!(Math.min(width, height) > 0)) return { point: centroid, distance: 0 };

  // Cells as wide as the room is narrow, but no more than 64 along its
  // length: a sliver a thousand times longer than it is wide must not start
  // from a thousand cells.
  const size = Math.max(Math.min(width, height), Math.max(width, height) / MAX_CELLS_PER_SIDE);
  const h = size / 2;
  const queue = new CellQueue();
  for (let x = box.minX; x < box.maxX; x += size) {
    for (let y = box.minY; y < box.maxY; y += size) queue.push(makeCell(x + h, y + h, h, outer, holes));
  }

  // The centroid is right for most rooms; the box's middle is a second guess
  // for the ones where it is not.
  let best = makeCell(centroid[0], centroid[1], 0, outer, holes);
  const middle = makeCell(box.minX + width / 2, box.minY + height / 2, 0, outer, holes);
  if (middle.d > best.d) best = middle;

  for (let examined = 0; queue.size > 0 && examined < MAX_CELLS; examined++) {
    const cell = queue.pop()!;
    if (cell.d > best.d) best = cell;
    // The heap hands out the most promising cell first, so once it cannot
    // beat the best by more than the precision, none left can either.
    if (cell.max - best.d <= precision) break;
    const q = cell.h / 2;
    queue.push(makeCell(cell.x - q, cell.y - q, q, outer, holes));
    queue.push(makeCell(cell.x + q, cell.y - q, q, outer, holes));
    queue.push(makeCell(cell.x - q, cell.y + q, q, outer, holes));
    queue.push(makeCell(cell.x + q, cell.y + q, q, outer, holes));
  }
  return { point: [best.x, best.y], distance: Math.max(0, best.d) };
}

/**
 * How long a line centred on `p`, along `axis`, can be while staying inside
 * the rings: twice the distance to the nearer edge it would cross. Labels are
 * centred on their point, so a whole chord would overstate the room. At the
 * crook of an L, the arm running away from the point cannot hold the half of
 * the label on the other side.
 */
function centredChord(p: Vec2, rings: readonly Ring[], axis: 0 | 1): number {
  const across = axis === 0 ? 1 : 0;
  let below = Number.NEGATIVE_INFINITY;
  let above = Number.POSITIVE_INFINITY;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[j]!;
      const b = ring[i]!;
      // Half-open, as in ray casting: an edge touching the line at a vertex counts once.
      if (a[across] > p[across] === b[across] > p[across]) continue;
      const t = (p[across] - a[across]) / (b[across] - a[across]);
      const at = a[axis] + t * (b[axis] - a[axis]);
      if (at <= p[axis]) below = Math.max(below, at);
      else above = Math.min(above, at);
    }
  }
  return Number.isFinite(below) && Number.isFinite(above) ? 2 * Math.min(p[axis] - below, above - p[axis]) : 0;
}

/**
 * How much room a label centred on a point has: the widest and the tallest it
 * can be while staying inside the shape. A name is cut to the width, and
 * hidden when the height cannot take a line of text.
 */
export function labelSpan(point: Vec2, outer: Ring, holes: readonly Ring[] = []): LabelSpan {
  const rings = [outer, ...holes];
  return { width: centredChord(point, rings, 0), height: centredChord(point, rings, 1) };
}
```

Append to `packages/model/src/index.ts`, after `export * from "./geometry/point";`:

```ts
export * from "./geometry/label";
```

- [ ] **Step 4: Run the tests and typecheck**

Run: `timeout 300 npx vitest run packages/model/src/geometry --poolOptions.threads.maxThreads=2 --poolOptions.threads.minThreads=1`
Expected: PASS, and the existing ring, point and segment tests still pass.

Run: `npx tsc -b packages/model`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git commit --only -m "feat(model): labelPoint finds where a room's name goes, labelSpan how much room it has

The centroid of an L-shaped unit lands outside it. labelPoint is the pole of
inaccessibility (polylabel): the point deepest inside, with holes kept out,
capped so an extracted sliver or a ring that crosses itself still returns at
once. labelSpan measures how wide and tall a label centred there can be,
which is what the fit rule cuts names to.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- packages/model/src/geometry/label.ts packages/model/src/geometry/label.test.ts packages/model/src/index.ts
```

---

### Task 2: The fit rule, 3D labels, and `MapScene`'s `children` slot

**Files:**
- Create: `packages/renderer/src/labelFit.ts`
- Create: `packages/renderer/src/labelFit.test.ts`
- Create: `packages/renderer/src/RoomLabels.tsx`
- Modify: `packages/renderer/src/MapScene.tsx` (props type and the JSX inside `<Canvas>`)
- Modify: `packages/renderer/src/index.ts` (append two lines)

**Interfaces:**
- Consumes: `modelToThree` from `./coords`; `Vec2` from `@oth/model`; `Html` from `@react-three/drei`; `useFrame`, `useThree` from `@react-three/fiber`.
- Produces (all exported from `@oth/renderer`):
  - `export type LabelTone = "confirmed" | "proposed" | "drawing"`
  - `export type RoomLabel = { roomId: string; name: string; tone: LabelTone; at: Vec2; widthM: number; heightM: number; liftM: number }`
  - `export type ShownLabel = { roomId: string; text: string; tone: LabelTone; position: [number, number, number] }`
  - `export type SceneView = { camera: readonly [number, number, number]; fovDeg: number; heightPx: number; elevationM: number; inView?: (p: readonly [number, number, number]) => boolean }`
  - `export const LABEL_FONT_PX = 13`
  - `export const LABEL_COLOURS: { name; confirmed; proposed; drawing }` (hex strings)
  - `export function labelExtra(tone: LabelTone): number`
  - `export function fitLabel(name: string, extraChars: number, widthPx: number, heightPx: number, fontPx?: number): string | null`
  - `export function pixelsPerMetreAt(distanceM: number, fovDeg: number, viewportHeightPx: number): number`
  - `export function sceneLabelsToShow(labels: readonly RoomLabel[], view: SceneView): ShownLabel[]`
  - `export function SceneRoomLabels(props: { labels: readonly RoomLabel[]; elevationM: number }): JSX.Element`
  - `MapSceneProps` gains `children?: ReactNode`, rendered inside the canvas after the active level. **This is the slot Part D mounts through. Do not change its shape.**

- [ ] **Step 1: Write the failing test**

`packages/renderer/src/labelFit.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { fitLabel, labelExtra, pixelsPerMetreAt, sceneLabelsToShow, type RoomLabel } from "./labelFit";

describe("fitLabel", () => {
  it("shows the whole name where it fits, with room for its ✓", () => {
    expect(fitLabel("Starbucks", labelExtra("confirmed"), 100, 40)).toBe("Starbucks");
  });

  it("cuts a name short to the room's width, with an ellipsis", () => {
    expect(fitLabel("Starbucks", labelExtra("confirmed"), 60, 40)).toBe("Sta…");
  });

  it("does not leave a space before the ellipsis", () => {
    expect(fitLabel("Anchor Books", 0, 75, 40)).toBe("Anchor…");
  });

  it("hides a name when fewer than three letters would fit", () => {
    expect(fitLabel("Starbucks", labelExtra("confirmed"), 40, 40)).toBeNull();
  });

  it("hides a name in a room too shallow for a line of text", () => {
    expect(fitLabel("Starbucks", 0, 500, 10)).toBeNull();
  });

  it("hides a blank name", () => {
    expect(fitLabel("   ", 0, 500, 40)).toBeNull();
  });

  it("counts the word proposed against the width", () => {
    // Eleven characters fit in 100 px: the name alone, but not " proposed" after it.
    expect(fitLabel("Starbucks", labelExtra("drawing"), 100, 40)).toBe("Starbucks");
    expect(fitLabel("Starbucks", labelExtra("proposed"), 100, 40)).toBeNull();
  });
});

describe("pixelsPerMetreAt", () => {
  it("is the viewport's height over the height the view spans at that distance", () => {
    expect(pixelsPerMetreAt(1, 90, 200)).toBeCloseTo(100);
    expect(pixelsPerMetreAt(2, 90, 200)).toBeCloseTo(50);
  });
});

describe("sceneLabelsToShow", () => {
  const star: RoomLabel = { roomId: "L1-shop", name: "Starbucks", tone: "confirmed", at: [0, 0], widthM: 10, heightM: 10, liftM: 3 };
  const from = (height: number) => ({ camera: [0, height, 0] as const, fovDeg: 45, heightPx: 256, elevationM: 0 });

  it("shows a label near the camera whole, at the top of its room, with north as -z", () => {
    const moved: RoomLabel = { ...star, at: [5, 8] };
    expect(sceneLabelsToShow([moved], { camera: [5, 23, -8], fovDeg: 45, heightPx: 256, elevationM: 0 })).toEqual([
      { roomId: "L1-shop", text: "Starbucks", tone: "confirmed", position: [5, 3, -8] },
    ]);
  });

  it("cuts it short further away, and hides it further still", () => {
    expect(sceneLabelsToShow([star], from(54.5))[0]?.text).toBe("Sta…");
    expect(sceneLabelsToShow([star], from(203))).toEqual([]);
  });

  it("lifts labels by the floor's elevation", () => {
    expect(sceneLabelsToShow([star], { ...from(29), elevationM: 6 })[0]?.position).toEqual([0, 9, 0]);
  });

  it("mounts nothing the camera cannot see", () => {
    expect(sceneLabelsToShow([star], { ...from(23), inView: () => false })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify that it fails**

Run: `timeout 300 npx vitest run packages/renderer/src/labelFit.test.ts --poolOptions.threads.maxThreads=2 --poolOptions.threads.minThreads=1`
Expected: FAIL with `Failed to resolve import "./labelFit"`.

- [ ] **Step 3: Write `labelFit.ts`**

`packages/renderer/src/labelFit.ts`:

```ts
import type { Vec2 } from "@oth/model";
import { modelToThree } from "./coords";

/** How a room's label reads: its place, confirmed or still proposed, or the drawing's own name. */
export type LabelTone = "confirmed" | "proposed" | "drawing";

/**
 * One room's label, worked out once per model. How much of it shows is
 * decided per view, by `fitLabel`, on the plan and in 3D alike.
 */
export type RoomLabel = {
  roomId: string;
  name: string;
  tone: LabelTone;
  /** The room's pole of inaccessibility, in plan metres. */
  at: Vec2;
  /** The widest and tallest a label centred on `at` can be inside the room, in metres (`labelSpan`). */
  widthM: number;
  heightM: number;
  /** How far above its floor the label floats in 3D: the top of the room, which is what the camera sees. */
  liftM: number;
};

export type ShownLabel = { roomId: string; text: string; tone: LabelTone; position: [number, number, number] };

export type SceneView = {
  camera: readonly [number, number, number];
  fovDeg: number;
  heightPx: number;
  elevationM: number;
  /** Whether a point is in the camera's view. Labels outside it are not mounted. */
  inView?: (position: readonly [number, number, number]) => boolean;
};

/** 13 px: the smallest text anywhere in the app. */
export const LABEL_FONT_PX = 13;

/**
 * The label colours, written once in hex because SVG attributes and the
 * renderer's inline styles cannot use Tailwind's names.
 */
export const LABEL_COLOURS = {
  /** A place's name: stone-900. */
  name: "#1c1917",
  /** The ✓ of a confirmed place: the confirmed token. */
  confirmed: "#047857",
  /** "proposed": sky-700, one step darker than the proposed token, which is under 4.5:1 as 13 px text on white. */
  proposed: "#0369a1",
  /** The drawing's own name: stone-500, grey, and still 4.8:1 on the white halo. */
  drawing: "#78716c",
} as const;

/** An average character of Inter at weight 500, as a fraction of its size. Generous, so a label that "fits" does. */
const CHAR_EM = 0.6;
/** The line box a label needs vertically, as a fraction of its size. */
const LINE_EM = 1.3;
/** The share of a room's width a label may use, so it keeps clear of the walls. */
const MARGIN = 0.9;
/** Fewer letters than this before the ellipsis is noise, not a name. */
const MIN_LETTERS = 3;

/** What a label adds to its name, in characters: "✓ " before a confirmed one, " proposed" after a proposed one. */
export function labelExtra(tone: LabelTone): number {
  return tone === "confirmed" ? 2 : tone === "proposed" ? 9 : 0;
}

/**
 * The name as it fits across a room at this zoom (spec §4): whole, cut short
 * with an ellipsis, or null when it cannot be shown at all — too few letters
 * would fit, or the room is too shallow for a line. This is what keeps L1's
 * 193 rooms from turning into a wall of text.
 */
export function fitLabel(
  name: string, extraChars: number, widthPx: number, heightPx: number, fontPx = LABEL_FONT_PX,
): string | null {
  if (name.trim() === "" || heightPx < fontPx * LINE_EM) return null;
  const fits = Math.floor((widthPx * MARGIN) / (fontPx * CHAR_EM)) - extraChars;
  if (fits >= name.length) return name;
  if (fits < MIN_LETTERS + 1) return null;
  return `${name.slice(0, fits - 1).trimEnd()}…`;
}

/** How many screen pixels a metre covers at this distance from a perspective camera. */
export function pixelsPerMetreAt(distanceM: number, fovDeg: number, viewportHeightPx: number): number {
  if (!(distanceM > 0)) return Number.POSITIVE_INFINITY;
  return viewportHeightPx / (2 * distanceM * Math.tan((fovDeg * Math.PI) / 360));
}

/**
 * The labels worth mounting in 3D for this camera: in view, and fitting their
 * room at the scale the room is seen at, which is the plan's fit rule applied
 * by camera distance.
 */
export function sceneLabelsToShow(labels: readonly RoomLabel[], view: SceneView): ShownLabel[] {
  const shown: ShownLabel[] = [];
  for (const label of labels) {
    const position = modelToThree(label.at[0], label.at[1], view.elevationM + label.liftM);
    if (view.inView && !view.inView(position)) continue;
    const distance = Math.hypot(
      position[0] - view.camera[0], position[1] - view.camera[1], position[2] - view.camera[2],
    );
    const perMetre = pixelsPerMetreAt(distance, view.fovDeg, view.heightPx);
    const text = fitLabel(label.name, labelExtra(label.tone), label.widthM * perMetre, label.heightM * perMetre);
    if (text) shown.push({ roomId: label.roomId, text, tone: label.tone, position });
  }
  return shown;
}
```

- [ ] **Step 4: Run the test to verify that it passes**

Run: `timeout 300 npx vitest run packages/renderer/src/labelFit.test.ts --poolOptions.threads.maxThreads=2 --poolOptions.threads.minThreads=1`
Expected: PASS.

- [ ] **Step 5: Write `SceneRoomLabels`, the `children` slot, and the exports**

`packages/renderer/src/RoomLabels.tsx`:

```tsx
import { Html } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Frustum, Matrix4, PerspectiveCamera, Vector3 } from "three";
import { LABEL_COLOURS, LABEL_FONT_PX, sceneLabelsToShow, type RoomLabel, type ShownLabel } from "./labelFit";

/**
 * Inline styles, not Tailwind: the editor's stylesheet is built from the
 * editor's own files and never sees these.
 */
const PILL: CSSProperties = {
  font: `500 ${LABEL_FONT_PX}px "Inter Variable", Inter, system-ui, sans-serif`,
  whiteSpace: "nowrap",
  background: "rgba(255, 255, 255, 0.85)",
  borderRadius: 4,
  padding: "0 4px",
  color: LABEL_COLOURS.name,
};

/**
 * The active floor's room names in the 3D preview (spec §4), drawn as HTML
 * over the canvas by drei's `Html`. Only the labels in view, and fitting
 * their room at the camera's distance, are mounted, which is about 200 at
 * most on L1 and far fewer at any one time.
 */
export function SceneRoomLabels({ labels, elevationM }: { labels: readonly RoomLabel[]; elevationM: number }) {
  const invalidate = useThree(state => state.invalidate);
  const [shown, setShown] = useState<ShownLabel[]>([]);
  const shownKey = useRef("");
  const probe = useMemo(() => ({ frustum: new Frustum(), matrix: new Matrix4(), point: new Vector3() }), []);

  // The scene renders on demand. New labels with the camera still, or a new
  // set just mounted, would otherwise wait for someone to touch the view.
  useEffect(() => {
    invalidate();
  }, [labels, elevationM, shown, invalidate]);

  useFrame(({ camera, size }) => {
    camera.updateMatrixWorld();
    probe.matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    probe.frustum.setFromProjectionMatrix(probe.matrix);
    const next = sceneLabelsToShow(labels, {
      camera: [camera.position.x, camera.position.y, camera.position.z],
      fovDeg: camera instanceof PerspectiveCamera ? camera.fov : 45,
      heightPx: size.height,
      elevationM,
      inView: ([x, y, z]) => probe.frustum.containsPoint(probe.point.set(x, y, z)),
    });
    // Set only on a change. Setting it every frame would keep the demand loop
    // awake for as long as the preview is open.
    const key = next.map(l => `${l.roomId}:${l.text}`).join("|");
    if (key !== shownKey.current) {
      shownKey.current = key;
      setShown(next);
    }
  });

  return (
    <>
      {shown.map(label => (
        // zIndexRange keeps labels under the app's own popovers and toasts;
        // drei's default reaches 16,777,271. No pointer events, so a click
        // lands on the room beneath and selects it.
        <Html key={label.roomId} position={label.position} center zIndexRange={[10, 0]} style={{ pointerEvents: "none" }}>
          <span style={PILL}>
            {label.tone === "confirmed" && <span style={{ color: LABEL_COLOURS.confirmed }}>✓ </span>}
            <span style={{ color: label.tone === "drawing" ? LABEL_COLOURS.drawing : LABEL_COLOURS.name }}>{label.text}</span>
            {label.tone === "proposed" && <em style={{ color: LABEL_COLOURS.proposed }}> proposed</em>}
          </span>
        </Html>
      ))}
    </>
  );
}
```

In `packages/renderer/src/MapScene.tsx`:

- Change the React import to `import { useMemo, type ReactNode } from "react";`.
- Add to `MapSceneProps`, after `assetUrl`:

```ts
  /**
   * More of the scene, drawn with the active level: room labels, and the
   * layers later parts add. Rendered inside the canvas, so three.js elements
   * and drei's helpers work here.
   */
  children?: ReactNode;
```

- Add `children` to the destructured props: `model, activeLevelId, showLevelBelow = true, selectedId, onSelect, assetUrl, children,`.
- Render it after the active `LevelGroup` block and before `<OrbitControls …/>`:

```tsx
      {children}
```

Append to `packages/renderer/src/index.ts`:

```ts
export * from "./labelFit";
export * from "./RoomLabels";
```

- [ ] **Step 6: Run the renderer's tests and typecheck**

Run: `timeout 300 npx vitest run packages/renderer --poolOptions.threads.maxThreads=2 --poolOptions.threads.minThreads=1`
Expected: PASS.

Run: `npx tsc -b packages/renderer`
Expected: no errors.

`SceneRoomLabels` needs WebGL, so no unit test covers it. `sceneLabelsToShow` holds its logic and is tested above. Task 4 checks that Build hands it the labels, and the sandbox check at the end looks at it running.

- [ ] **Step 7: Commit**

```bash
git commit --only -m "feat(renderer): room labels in 3D, and a children slot on MapScene

fitLabel is the one fit rule for labels on the plan and in 3D: a name shows
whole, cut to the room's width, or not at all. In 3D the scale comes from the
camera's distance, and only labels in view are mounted, through drei's Html,
under the app's own overlays. MapScene takes children, so later layers mount
without editing it again.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- packages/renderer/src/labelFit.ts packages/renderer/src/labelFit.test.ts packages/renderer/src/RoomLabels.tsx packages/renderer/src/MapScene.tsx packages/renderer/src/index.ts
```

---

### Task 3: Room labels and evidence (pure)

**Files:**
- Create: `packages/editor/src/places/labels.ts`
- Create: `packages/editor/src/places/labels.test.ts`
- Create: `packages/editor/src/places/evidence.ts`
- Create: `packages/editor/src/places/evidence.test.ts`

**Interfaces:**
- Consumes:
  - `labelPoint`, `labelSpan`, `live`, `MapModel`, `Place`, `Room`, `Box`, `Keyframe`, `Sighting` from `@oth/model` (Task 1);
  - `RoomLabel` type from `@oth/renderer` (Task 2);
  - `href` from `../route`;
  - `TeamMember` type from `../api/client`.
- Produces:
  - `places/labels.ts`:
    - `export function placesByRoom(model: MapModel): Map<string, Place[]>`. Each room's live places, confirmed first, then by name.
    - `export function roomLabels(model: MapModel, levelId: string): RoomLabel[]`
  - `places/evidence.ts`:
    - `export type Evidence = { sighting: Sighting; frame: Keyframe }`
    - `export function bestEvidence(model: MapModel, placeId: string): Evidence[]`. Best first, one per frame.
    - `export type FrameWindow = { x: number; y: number; size: number }`
    - `export function frameWindow(box: Box | undefined): FrameWindow`
    - `export function imageWidthFor(displayPx: number, box: Box | undefined): number`. Returns one of 240, 320 or 1600.
    - `export function surveyLink(model: MapModel, frame: Keyframe): string | null`
    - `export function statusLine(place: Place, shown: Evidence | undefined, team: readonly TeamMember[]): string`

- [ ] **Step 1: Write the failing tests**

`packages/editor/src/places/labels.test.ts`:

```ts
import { parseModel } from "@oth/model";
import { describe, expect, it } from "vitest";
import { placesByRoom, roomLabels } from "./labels";

const iso = "2026-09-20T00:00:00.000Z";
const sq = (x: number): [number, number][] => [[x, 0], [x + 10, 0], [x + 10, 10], [x, 10]];

const model = parseModel({
  building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
  levels: [
    { id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6 },
    { id: "oth-L2", buildingId: "oth", code: "L2", ordinal: 2, nameEn: "L2", nameZh: "二楼", elevationM: 6, heightM: 4 },
  ],
  rooms: [
    { id: "L1-shop", levelId: "oth-L1", kind: "room", footprint: sq(0), heightM: 4, nameEn: "Shop" },
    { id: "L1-claim", levelId: "oth-L1", kind: "room", footprint: sq(20), heightM: 4 },
    { id: "L1-dup", levelId: "oth-L1", kind: "room", footprint: sq(40), heightM: 4 },
    { id: "L1-named", levelId: "oth-L1", kind: "room", footprint: sq(60), heightM: 4, nameEn: "Unit 7" },
    { id: "L1-blank", levelId: "oth-L1", kind: "room", footprint: sq(80), heightM: 4, nameEn: "   " },
    { id: "L1-old", levelId: "oth-L1", kind: "room", footprint: sq(100), heightM: 4, nameEn: "Old", deletedAt: iso },
    {
      id: "L1-ell", levelId: "oth-L1", kind: "area", heightM: 5, nameEn: "Plaza",
      footprint: [[0, 20], [10, 20], [10, 21], [1, 21], [1, 30], [0, 30]],
    },
    { id: "L2-a", levelId: "oth-L2", kind: "room", footprint: sq(0), heightM: 3, nameEn: "Upstairs" },
  ],
  places: [
    { id: "pl_star", nameEn: "Starbucks", category: "retail", roomId: "L1-shop" },
    { id: "pl_tea", nameEn: "iTea", category: "retail", roomId: "L1-claim", status: "proposed" },
    // Two on one room: the confirmed one names it, even though "Aardvark" sorts first.
    { id: "pl_a", nameEn: "Aardvark", category: "retail", roomId: "L1-dup", status: "proposed" },
    { id: "pl_z", nameEn: "Zest", category: "retail", roomId: "L1-dup" },
    { id: "pl_y", nameEn: "Yolk", category: "retail", roomId: "L1-dup" },
    // Deleted: its room falls back to the drawing's name.
    { id: "pl_gone", nameEn: "Gone", category: "retail", roomId: "L1-named", deletedAt: iso },
  ],
});

describe("placesByRoom", () => {
  it("lists each room's live places, confirmed first, then by name", () => {
    expect(placesByRoom(model).get("L1-dup")?.map(p => p.id)).toEqual(["pl_y", "pl_z", "pl_a"]);
    expect(placesByRoom(model).has("L1-named")).toBe(false);
  });
});

describe("roomLabels", () => {
  const labels = roomLabels(model, "oth-L1");
  const byRoom = new Map(labels.map(l => [l.roomId, l]));

  it("names a bound room by its place: confirmed, or proposed", () => {
    expect(byRoom.get("L1-shop")).toMatchObject({ name: "Starbucks", tone: "confirmed" });
    expect(byRoom.get("L1-claim")).toMatchObject({ name: "iTea", tone: "proposed" });
  });

  it("names a room with two places by the confirmed one, first by name", () => {
    expect(byRoom.get("L1-dup")).toMatchObject({ name: "Yolk", tone: "confirmed" });
  });

  it("falls back to the drawing's own name, and to nothing without one", () => {
    expect(byRoom.get("L1-named")).toMatchObject({ name: "Unit 7", tone: "drawing" });
    expect(byRoom.has("L1-blank")).toBe(false);
  });

  it("labels only this floor's live rooms", () => {
    expect(byRoom.has("L1-old")).toBe(false);
    expect(byRoom.has("L2-a")).toBe(false);
  });

  it("anchors a label inside an L-shaped area, with only the room a centred label has there", () => {
    const ell = byRoom.get("L1-ell")!;
    // Inside the L's one-metre arms, not at its centroid in the crook.
    expect(ell.at[0] <= 1 || ell.at[1] <= 21).toBe(true);
    // About a metre, one way or both: never the arm's full ten.
    expect(Math.min(ell.widthM, ell.heightM)).toBeGreaterThan(0.9);
    expect(Math.min(ell.widthM, ell.heightM)).toBeLessThan(1.3);
    expect(ell.liftM).toBe(5);
  });
});
```

`packages/editor/src/places/evidence.test.ts`:

```ts
import { parseModel, type Place } from "@oth/model";
import { describe, expect, it } from "vitest";
import { bestEvidence, frameWindow, imageWidthFor, statusLine, surveyLink } from "./evidence";

const iso = "2026-09-20T00:00:00.000Z";
const frame = (id: string, captureId = "cap_1", extra = {}) =>
  ({ id, captureId, imageId: id, widthPx: 640, heightPx: 480, ...extra });

const model = parseModel({
  building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
  levels: [
    { id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6 },
    { id: "oth-L2", buildingId: "oth", code: "L2", ordinal: 2, nameEn: "L2", nameZh: "二楼", elevationM: 6, heightM: 4 },
  ],
  captures: [
    { id: "cap_1", kind: "video", filename: "l1.mp4", levelId: "oth-L1" },
    { id: "cap_l2", kind: "video", filename: "l2.mp4", levelId: "oth-L2" },
    { id: "cap_loose", kind: "photos", filename: "phone" },
    { id: "cap_gone", kind: "video", filename: "old.mp4", levelId: "oth-L1", deletedAt: iso },
  ],
  keyframes: [
    frame("kf_1"), frame("kf_2"), frame("kf_3"), frame("kf_4"), frame("kf_5"),
    frame("kf_bin", "cap_1", { deletedAt: iso }),
    frame("kf_gonecap", "cap_gone"),
    frame("kf_l2", "cap_l2"),
    frame("kf_loose", "cap_loose"),
  ],
  places: [
    { id: "p", nameEn: "Starbucks", category: "retail", levelId: "oth-L1" },
    { id: "q", nameEn: "Other", category: "retail", levelId: "oth-L1" },
  ],
  sightings: [
    { id: "s_small", placeId: "p", keyframeId: "kf_1", box: { x: 0.1, y: 0.1, w: 0.1, h: 0.1 } },
    { id: "s_big", placeId: "p", keyframeId: "kf_2", box: { x: 0.1, y: 0.1, w: 0.3, h: 0.2 } },
    { id: "s_whole", placeId: "p", keyframeId: "kf_3" },
    { id: "s_claim", placeId: "p", keyframeId: "kf_4", box: { x: 0, y: 0, w: 0.5, h: 0.5 }, status: "proposed" },
    { id: "s_binned", placeId: "p", keyframeId: "kf_bin", box: { x: 0, y: 0, w: 0.9, h: 0.9 } },
    { id: "s_gonecap", placeId: "p", keyframeId: "kf_gonecap" },
    // A second tag on kf_2, worse than s_big: one entry per frame, by its best tag.
    { id: "s_dup", placeId: "p", keyframeId: "kf_2", status: "proposed" },
    { id: "s_deleted", placeId: "p", keyframeId: "kf_5", deletedAt: iso },
    { id: "s_other", placeId: "q", keyframeId: "kf_1", box: { x: 0, y: 0, w: 0.8, h: 0.8 } },
  ],
});

describe("bestEvidence", () => {
  it("puts confirmed tags with the largest box first, then other confirmed tags, then claims", () => {
    expect(bestEvidence(model, "p").map(e => e.sighting.id)).toEqual(["s_big", "s_small", "s_whole", "s_claim"]);
  });

  it("never offers a frame in the bin, deleted footage, or a deleted tag", () => {
    const frames = bestEvidence(model, "p").map(e => e.frame.id);
    for (const gone of ["kf_bin", "kf_gonecap", "kf_5"]) expect(frames).not.toContain(gone);
  });

  it("is empty for a place nobody filmed", () => {
    expect(bestEvidence(model, "nobody")).toEqual([]);
  });
});

describe("frameWindow", () => {
  it("shows the whole frame when there is no box", () => {
    expect(frameWindow(undefined)).toEqual({ x: 0, y: 0, size: 1 });
  });

  it("centres a small box in 40% of the frame", () => {
    const w = frameWindow({ x: 0.45, y: 0.45, w: 0.1, h: 0.1 });
    expect(w.size).toBeCloseTo(0.4);
    expect(w.x).toBeCloseTo(0.3);
    expect(w.y).toBeCloseTo(0.3);
  });

  it("keeps the window inside the frame for a box at its edge", () => {
    const w = frameWindow({ x: 0.95, y: 0, w: 0.05, h: 0.05 });
    expect(w.x).toBeCloseTo(0.6);
    expect(w.y).toBe(0);
  });

  it("shows the box with as much again around it, up to the whole frame", () => {
    expect(frameWindow({ x: 0.2, y: 0.2, w: 0.3, h: 0.1 }).size).toBeCloseTo(0.6);
    expect(frameWindow({ x: 0, y: 0, w: 0.6, h: 0.6 })).toEqual({ x: 0, y: 0, size: 1 });
  });
});

describe("imageWidthFor", () => {
  it("asks for the smallest width the server keeps that is wide enough", () => {
    expect(imageWidthFor(224, undefined)).toBe(240);
    expect(imageWidthFor(300, undefined)).toBe(320);
    // A 40% window shown 224 px wide needs 560 px of frame.
    expect(imageWidthFor(224, { x: 0.45, y: 0.45, w: 0.1, h: 0.1 })).toBe(1600);
    expect(imageWidthFor(5000, undefined)).toBe(1600);
  });
});

describe("surveyLink", () => {
  const kf = (id: string) => model.keyframes.find(k => k.id === id)!;

  it("opens the frame in its footage, on the floor that footage is filed under", () => {
    expect(surveyLink(model, kf("kf_1"))).toBe("/floors/L1/survey?capture=cap_1&frame=kf_1");
    expect(surveyLink(model, kf("kf_l2"))).toBe("/floors/L2/survey?capture=cap_l2&frame=kf_l2");
  });

  it("offers nothing for footage filed under no floor, which Survey cannot show", () => {
    expect(surveyLink(model, kf("kf_loose"))).toBeNull();
  });
});

describe("statusLine", () => {
  const team = [{ id: "u_wei", displayName: "Wei Kang" }];
  const place = model.places[0]!;
  const tagged = (sighting: Partial<(typeof model.sightings)[number]>) => ({
    frame: model.keyframes[0]!,
    sighting: { ...model.sightings[0]!, ...sighting },
  });
  // Built from local parts, so it is 27 Sep wherever the test runs.
  const on27 = new Date(2026, 8, 27, 12).toISOString();

  it("says who confirmed the photo shown, and when", () => {
    expect(statusLine(place, tagged({ updatedBy: "u_wei", updatedAt: on27 }), team)).toBe("Confirmed by Wei Kang, 27 Sep");
  });

  it("leaves out a name it does not know, such as the importer's", () => {
    expect(statusLine(place, tagged({ updatedBy: "system", updatedAt: on27 }), team)).toBe("Confirmed, 27 Sep");
    expect(statusLine(place, tagged({}), team)).toBe("Confirmed");
  });

  it("says a place still proposed is waiting in Review", () => {
    const claim: Place = { ...place, status: "proposed" };
    expect(statusLine(claim, tagged({}), team)).toBe("Proposed, waiting in Review");
  });

  it("says when the photo shown is only a claim", () => {
    expect(statusLine(place, tagged({ status: "proposed" }), team)).toBe("Confirmed, but this photo's tag is still proposed");
  });

  it("still says confirmed with no photo", () => {
    expect(statusLine(place, undefined, team)).toBe("Confirmed");
  });
});
```

- [ ] **Step 2: Run the tests to verify that they fail**

Run: `timeout 300 npx vitest run packages/editor/src/places --poolOptions.threads.maxThreads=2 --poolOptions.threads.minThreads=1`
Expected: FAIL with `Failed to resolve import "./labels"` and `"./evidence"`.

- [ ] **Step 3: Write `labels.ts`**

`packages/editor/src/places/labels.ts`:

```ts
import { labelPoint, labelSpan, live, type MapModel, type Place, type Room, type Vec2 } from "@oth/model";
import type { RoomLabel } from "@oth/renderer";

type Anchor = { at: Vec2; widthM: number; heightM: number };

/**
 * Keyed by the room itself. Every save replaces the model, but an untouched
 * room keeps its object, so L1's 193 rooms are not all worked out again for
 * each save. An edited room is a new object, so it is never read stale.
 */
const anchors = new WeakMap<Room, Anchor>();

function anchorOf(room: Room): Anchor {
  let anchor = anchors.get(room);
  if (!anchor) {
    const { point } = labelPoint(room.footprint, room.holes);
    const span = labelSpan(point, room.footprint, room.holes);
    anchor = { at: point, widthM: span.width, heightM: span.height };
    anchors.set(room, anchor);
  }
  return anchor;
}

/**
 * The live places bound to each room: confirmed first, then by name, so the
 * first is the one the room is shown as. More than one is a duplicate that
 * Review never merged, and the place card says so.
 */
export function placesByRoom(model: MapModel): Map<string, Place[]> {
  const byRoom = new Map<string, Place[]>();
  for (const place of live(model.places)) {
    if (!place.roomId) continue;
    byRoom.set(place.roomId, [...(byRoom.get(place.roomId) ?? []), place]);
  }
  for (const list of byRoom.values()) {
    list.sort(
      (a, b) => Number(b.status === "confirmed") - Number(a.status === "confirmed") || a.nameEn.localeCompare(b.nameEn),
    );
  }
  return byRoom;
}

/**
 * What each room on a floor is called on the plan and in 3D (spec §4). A room
 * bound to a place shows the place's name, with ✓ once confirmed and *proposed*
 * until then; an unbound room shows the drawing's name, in grey. A room with
 * neither has no label.
 */
export function roomLabels(model: MapModel, levelId: string): RoomLabel[] {
  const byRoom = placesByRoom(model);
  const labels: RoomLabel[] = [];
  for (const room of live(model.rooms)) {
    if (room.levelId !== levelId) continue;
    const place = byRoom.get(room.id)?.[0];
    const name = place ? place.nameEn : room.nameEn.trim();
    if (!name) continue;
    const tone = place ? (place.status === "confirmed" ? "confirmed" : "proposed") : "drawing";
    labels.push({ roomId: room.id, name, tone, ...anchorOf(room), liftM: room.heightM });
  }
  return labels;
}
```

- [ ] **Step 4: Write `evidence.ts`**

`packages/editor/src/places/evidence.ts`:

```ts
import { live, type Box, type Keyframe, type MapModel, type Place, type Sighting } from "@oth/model";
import type { TeamMember } from "../api/client";
import { href } from "../route";

/** One frame a place was seen in, by its best tag there. */
export type Evidence = { sighting: Sighting; frame: Keyframe };

/** The part of a frame to show, as fractions of it: the same on both axes, so the picture keeps the frame's shape. */
export type FrameWindow = { x: number; y: number; size: number };

/** Never less than 40% of the frame, so there is always some shopfront around the sign. */
const MIN_WINDOW = 0.4;

/** The widths the server keeps a frame at (`server/src/images/thumbnail.ts`). */
const SERVED_WIDTHS = [240, 320, 1600] as const;

/** "Sep", not Intl's en-GB "Sept" on newer ICU; the same reason as the Floors home's dates. */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const area = (box: Box | undefined) => (box ? box.w * box.h : 0);

/** A confirmed tag with a box, then any confirmed tag, then a claim with a box, then any claim. */
function rank(s: Sighting): number {
  return (s.status === "confirmed" ? 0 : 2) + (s.box ? 0 : 1);
}

function better(a: Sighting, b: Sighting): number {
  return rank(a) - rank(b) || area(b.box) - area(a.box) || a.id.localeCompare(b.id);
}

/**
 * Every frame a place was seen in, best first (spec §4). A confirmed tag with
 * a box comes first, the largest box leading, since that is where the sign is
 * easiest to read; any other tag follows. A frame in the bin, or from deleted
 * footage, is no evidence. There is one entry per frame, by its best tag there.
 */
export function bestEvidence(model: MapModel, placeId: string): Evidence[] {
  const captures = new Set(live(model.captures).map(c => c.id));
  const frames = new Map(live(model.keyframes).filter(k => captures.has(k.captureId)).map(k => [k.id, k]));
  const byFrame = new Map<string, Evidence>();
  for (const sighting of live(model.sightings)) {
    if (sighting.placeId !== placeId) continue;
    const frame = frames.get(sighting.keyframeId);
    if (!frame) continue;
    const held = byFrame.get(frame.id);
    if (!held || better(sighting, held.sighting) < 0) byFrame.set(frame.id, { sighting, frame });
  }
  return [...byFrame.values()].sort((a, b) => better(a.sighting, b.sighting));
}

/**
 * What to show of a frame so its sign can be read at card size: the box with
 * as much again around it, never less than 40% of the frame, and kept inside
 * it. Without a box, the whole frame.
 */
export function frameWindow(box: Box | undefined): FrameWindow {
  if (!box) return { x: 0, y: 0, size: 1 };
  const size = Math.min(1, Math.max(MIN_WINDOW, box.w * 2, box.h * 2));
  const clamp = (v: number) => Math.min(1 - size, Math.max(0, v));
  return { x: clamp(box.x + box.w / 2 - size / 2), y: clamp(box.y + box.h / 2 - size / 2), size };
}

/** The frame width to ask for, so a window of it shown `displayPx` wide is sharp. */
export function imageWidthFor(displayPx: number, box: Box | undefined): number {
  const needed = displayPx / frameWindow(box).size;
  return SERVED_WIDTHS.find(w => w >= needed) ?? 1600;
}

/**
 * Where Open in Survey goes: the frame, in its footage, on the floor that the
 * footage is filed under, which can be another floor's when a shop is seen
 * through a void. It is null for footage filed under no floor, because Survey
 * lists only a floor's own footage.
 */
export function surveyLink(model: MapModel, frame: Keyframe): string | null {
  const capture = live(model.captures).find(c => c.id === frame.captureId);
  const level = capture?.levelId ? live(model.levels).find(l => l.id === capture.levelId) : undefined;
  if (!capture || !level) return null;
  return href({ name: "floor", code: level.code, tab: "survey", params: { capture: capture.id, frame: frame.id } });
}

/**
 * "Confirmed by Wei Kang, 27 Sep" for the photo shown. A place records no
 * confirmer, and binding it rewrites its `updatedBy`. A tag's last write is
 * its confirmation: Accept in Review, or the tag typed in Survey. (A later
 * box edit moves it, which is fair: that person looked too.)
 */
export function statusLine(place: Place, shown: Evidence | undefined, team: readonly TeamMember[]): string {
  if (place.status === "proposed") return "Proposed, waiting in Review";
  if (!shown) return "Confirmed";
  const tag = shown.sighting;
  if (tag.status === "proposed") return "Confirmed, but this photo's tag is still proposed";
  const who = team.find(m => m.id === tag.updatedBy)?.displayName;
  const date = tag.updatedAt ? new Date(tag.updatedAt) : null;
  const when = date && !Number.isNaN(date.getTime()) ? `${date.getDate()} ${MONTHS[date.getMonth()]}` : null;
  return `Confirmed${who ? ` by ${who}` : ""}${when ? `, ${when}` : ""}`;
}
```

- [ ] **Step 5: Run the tests and typecheck**

Run: `timeout 300 npx vitest run packages/editor/src/places --poolOptions.threads.maxThreads=2 --poolOptions.threads.minThreads=1`
Expected: PASS.

Run: `npx tsc -b packages/editor`
Expected: no errors in `places/`. If it fails only in files that Plan 3 is still editing, wait for Plan 3's commit and run it again. Never fix Plan 3's files.

- [ ] **Step 6: Commit**

```bash
git commit --only -m "feat(editor): what each room is called, and the photos that prove it

roomLabels names each room on a floor by its bound place (confirmed first,
then by name), or else by the drawing's name, anchored at its pole of
inaccessibility; anchors are kept per room so a save does not redo all 193.
bestEvidence orders a place's frames for the card: confirmed tags with the
largest box first, nothing from the bin. surveyLink opens a frame on its
footage's own floor, and statusLine says who confirmed the photo shown.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- packages/editor/src/places/labels.ts packages/editor/src/places/labels.test.ts packages/editor/src/places/evidence.ts packages/editor/src/places/evidence.test.ts
```

---

### Task 4: Labels on the plan and in 3D

**Start only after Plan 3's Task 11 fix round has committed. Re-read `BuildWorkspace.tsx` and `BuildWorkspace.test.tsx` first.**

**Files:**
- Modify: `packages/editor/src/plan/PlanCanvas.tsx` (props type, the destructuring, and one line in the SVG)
- Modify: `packages/editor/src/plan/PlanCanvas.test.tsx` (one test)
- Create: `packages/editor/src/plan/RoomLabels.tsx`
- Create: `packages/editor/src/plan/RoomLabels.test.tsx`
- Modify: `packages/editor/src/build/BuildWorkspace.tsx`
- Modify: `packages/editor/src/build/BuildWorkspace.test.tsx`

**Interfaces:**
- Consumes:
  - `fitLabel`, `labelExtra`, `LABEL_COLOURS`, `LABEL_FONT_PX`, `SceneRoomLabels`, `type RoomLabel` from `@oth/renderer` (Task 2);
  - `roomLabels` from `../places/labels` (Task 3);
  - `worldToScreen` from `./viewport`.
- Produces:
  - `PlanCanvasProps.overlays?: ReactNode`. SVG children drawn over the spaces, pathways and details, and under the vertex handles and markers. They read the viewport from `useEditorStore` and set their own pointer events. **This is the slot Part B's draft layer mounts through. Do not change its shape.**
  - `export function PlanRoomLabels(props: { labels: readonly RoomLabel[] }): JSX.Element` in `plan/RoomLabels.tsx`. It renders `<g data-testid="room-labels">` with one `<text data-testid="room-label-<roomId>">` for each label that fits.

- [ ] **Step 1: Write the failing tests**

`packages/editor/src/plan/RoomLabels.test.tsx`:

```tsx
import type { RoomLabel } from "@oth/renderer";
import { LABEL_COLOURS } from "@oth/renderer";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useEditorStore } from "../state/store";
import { PlanRoomLabels } from "./RoomLabels";

const labels: RoomLabel[] = [
  { roomId: "a", name: "Starbucks", tone: "confirmed", at: [5, 5], widthM: 10, heightM: 10, liftM: 3 },
  { roomId: "b", name: "Anchor Books", tone: "proposed", at: [25, 5], widthM: 10, heightM: 10, liftM: 3 },
  { roomId: "c", name: "Shop", tone: "drawing", at: [45, 5], widthM: 10, heightM: 10, liftM: 3 },
];

function show(scale: number) {
  useEditorStore.getState().setViewport({ originX: 0, originY: 500, scale });
  render(<svg><PlanRoomLabels labels={labels} /></svg>);
}

const label = (id: string) => screen.queryByTestId(`room-label-${id}`);

beforeEach(() => useEditorStore.getState().reset());

describe("PlanRoomLabels", () => {
  it("names each room where it fits: ✓ for confirmed, proposed spelled out, the drawing's name in grey", () => {
    show(20);
    expect(label("a")?.textContent).toBe("✓ Starbucks");
    expect(label("b")?.textContent).toBe("Anchor Books proposed");
    expect(label("c")?.textContent).toBe("Shop");
    expect(label("c")?.getAttribute("fill")).toBe(LABEL_COLOURS.drawing);
  });

  it("sits each label at its point on screen", () => {
    show(20);
    expect(label("a")?.getAttribute("x")).toBe("100");
    expect(label("a")?.getAttribute("y")).toBe("400");
  });

  it("cuts names short, and leaves out those that cannot fit, as you zoom out", () => {
    show(6);
    expect(label("a")?.textContent).toBe("✓ Sta…");
    expect(label("b")).toBeNull();
    expect(label("c")?.textContent).toBe("Shop");
  });

  it("shows nothing when zoomed out too far for a line of text", () => {
    show(1);
    expect(screen.getByTestId("room-labels").childElementCount).toBe(0);
  });

  it("lets clicks through to the rooms beneath", () => {
    show(20);
    expect(screen.getByTestId("room-labels").getAttribute("pointer-events")).toBe("none");
  });
});
```

Add to `packages/editor/src/plan/PlanCanvas.test.tsx`, inside `describe("PlanCanvas", …)`:

```tsx
  it("draws overlays inside the plan, over the rooms", () => {
    render(<PlanCanvas width={800} height={600} overlays={<g data-testid="overlay" />} />);
    const overlay = screen.getByTestId("overlay");
    expect(screen.getByTestId("plan-canvas").contains(overlay)).toBe(true);
    // In SVG, what comes later in the document is painted on top.
    expect(screen.getByTestId("room-L1-a").compareDocumentPosition(overlay) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
```

In `packages/editor/src/build/BuildWorkspace.test.tsx`:

- Make the `@oth/renderer` mock record what the scene is given. Replace the `scene` hoist and the mock (keep whatever else the fix round added to the file):

```tsx
const scene = vi.hoisted(() => ({ fails: false, children: null as unknown }));
vi.mock("@oth/renderer", async importOriginal => ({
  ...(await importOriginal<typeof import("@oth/renderer")>()),
  MapScene: (props: { children?: unknown }) => {
    if (scene.fails) throw new Error("Could not load /api/assets/asset_1/file: 404");
    // What the page hands the scene to draw with the level: its labels.
    scene.children = props.children;
    return null;
  },
}));
```

- In `beforeEach`, next to `scene.fails = false;`, add `scene.children = null;`.
- Add `import type { ReactElement } from "react";` and `import type { RoomLabel } from "@oth/renderer";`.
- Add this block:

```tsx
describe("BuildWorkspace — labels", () => {
  it("names the rooms on the plan: the drawing's name, and nothing for a room with none", () => {
    open("/floors/L1/build?step=rooms");
    measure();
    expect(screen.getByTestId("room-label-L1-hall").textContent).toBe("Hall");
    expect(screen.queryByTestId("room-label-L1-a")).toBeNull();
  });

  it("names a bound room by its place, with ✓ once confirmed", () => {
    open("/floors/L1/build?step=rooms");
    measure();
    act(() => useEditorStore.getState().setModel({ ...model, places: [{ ...model.places[0]!, roomId: "L1-a" }] }));
    expect(screen.getByTestId("room-label-L1-a").textContent).toBe("✓ Festive Mall");
  });

  it("hands the 3D preview the same labels, at the floor's own height", () => {
    localStorage.setItem("oth.build.preview", "on");
    open("/floors/L1/build?step=rooms");
    const given = scene.children as ReactElement<{ labels: RoomLabel[]; elevationM: number }>;
    expect(given.props.labels.map(l => l.roomId)).toEqual(["L1-hall"]);
    expect(given.props.elevationM).toBe(0);
  });
});
```

(After `measure()` the canvas fits L1, 40 × 20 m, into 1000 × 700 px at 23 px/m. "Hall", 30 m wide, fits, and so does "✓ Festive Mall" in L1-a, 10 m wide.)

- [ ] **Step 2: Run the tests to verify that they fail**

Run: `timeout 300 npx vitest run packages/editor/src/plan packages/editor/src/build/BuildWorkspace.test.tsx --poolOptions.threads.maxThreads=2 --poolOptions.threads.minThreads=1`
Expected: FAIL. `./RoomLabels` does not resolve, `overlays` is not rendered, and no `room-label-*` is in Build.

- [ ] **Step 3: Write `PlanRoomLabels`**

`packages/editor/src/plan/RoomLabels.tsx`:

```tsx
import { fitLabel, labelExtra, LABEL_COLOURS, LABEL_FONT_PX, type RoomLabel } from "@oth/renderer";
import { useEditorStore } from "../state/store";
import { worldToScreen } from "./viewport";

/**
 * Every room's name on the plan (spec §4). A label sits at the point deepest
 * inside its room, cut to the room's width at this zoom, and is left out where
 * not even a short name fits, so L1's 193 rooms read as a map rather than a
 * wall of text. A white halo keeps it legible over the drawing and the
 * room's wash. Clicks go through to the room beneath.
 */
export function PlanRoomLabels({ labels }: { labels: readonly RoomLabel[] }) {
  const viewport = useEditorStore(s => s.viewport);
  return (
    <g data-testid="room-labels" pointerEvents="none" fontSize={LABEL_FONT_PX} fontWeight={500}>
      {labels.map(label => {
        const text = fitLabel(label.name, labelExtra(label.tone), label.widthM * viewport.scale, label.heightM * viewport.scale);
        if (!text) return null;
        const [x, y] = worldToScreen(viewport, label.at);
        return (
          <text
            key={label.roomId}
            data-testid={`room-label-${label.roomId}`}
            x={x}
            y={y}
            textAnchor="middle"
            dominantBaseline="central"
            fill={label.tone === "drawing" ? LABEL_COLOURS.drawing : LABEL_COLOURS.name}
            stroke="#ffffff"
            strokeWidth={3}
            strokeLinejoin="round"
            paintOrder="stroke"
          >
            {label.tone === "confirmed" && <tspan fill={LABEL_COLOURS.confirmed}>✓ </tspan>}
            {text}
            {label.tone === "proposed" && <tspan fill={LABEL_COLOURS.proposed} fontStyle="italic"> proposed</tspan>}
          </text>
        );
      })}
    </g>
  );
}
```

- [ ] **Step 4: Add the `overlays` slot to `PlanCanvas`**

In `packages/editor/src/plan/PlanCanvas.tsx`:

- Change the React import to `import { useEffect, useRef, useState, type ReactNode } from "react";`.
- Add to `PlanCanvasProps`, after `showHint`:

```ts
  /**
   * SVG drawn over the spaces, pathways and details, and under the corner
   * handles and markers: room labels, and the layers later parts add. Each
   * overlay reads the viewport from the store, as the canvas does, and sets
   * its own pointer events. A label lets clicks through to the room beneath.
   */
  overlays?: ReactNode;
```

- Add `overlays,` to the destructured props, after `showHint = true,`.
- In the SVG, directly after `{rooms.filter(r => r.kind === "detail").map(renderRoom)}`, add:

```tsx
        {overlays}
```

- [ ] **Step 5: Mount the labels in `BuildWorkspace`**

In `packages/editor/src/build/BuildWorkspace.tsx`:

- Change `import { MapScene } from "@oth/renderer";` to `import { MapScene, SceneRoomLabels } from "@oth/renderer";`.
- Add `import { roomLabels } from "../places/labels";` and `import { PlanRoomLabels } from "../plan/RoomLabels";`.
- After the `done` memo, add:

```tsx
  // One set of labels for the plan and the preview, so the two never disagree about a name.
  const labels = useMemo(() => (model && levelId ? roomLabels(model, levelId) : []), [model, levelId]);
  const elevationM = model?.levels.find(l => l.id === levelId)?.elevationM ?? 0;
```

- On `<PlanCanvas …>`, add the prop:

```tsx
              overlays={<PlanRoomLabels labels={labels} />}
```

- Give `<MapScene …/>` its labels as children, so it is no longer self-closing:

```tsx
              <MapScene
                model={model}
                activeLevelId={levelId}
                assetUrl={api.assetFileUrl}
                selectedId={selection?.type === "room" ? selection.id : null}
                onSelect={id => useEditorStore.getState().select({ type: "room", id })}
              >
                <SceneRoomLabels labels={labels} elevationM={elevationM} />
              </MapScene>
```

Keep whatever wrapper the fix round put around `PreviewPanel` or `MapScene`, such as the error boundary. Only the `MapScene` element changes.

- [ ] **Step 6: Run the tests and typecheck**

Run: `timeout 300 npx vitest run packages/editor/src/plan packages/editor/src/build --poolOptions.threads.maxThreads=2 --poolOptions.threads.minThreads=1`
Expected: PASS, and the existing PlanCanvas and BuildWorkspace tests still pass.

Run: `npx tsc -b packages/editor`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git commit --only -m "feat(editor): rooms carry their names on the plan and in the 3D preview

PlanCanvas takes overlays, SVG drawn over the spaces and under the handles,
and Build mounts the room labels through it: the place's name with a check
once confirmed, 'proposed' until then, else the drawing's name in grey, cut
to fit or left out at this zoom. The 3D preview is handed the same labels as
MapScene children, so both views name a room the same way.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- packages/editor/src/plan/PlanCanvas.tsx packages/editor/src/plan/PlanCanvas.test.tsx packages/editor/src/plan/RoomLabels.tsx packages/editor/src/plan/RoomLabels.test.tsx packages/editor/src/build/BuildWorkspace.tsx packages/editor/src/build/BuildWorkspace.test.tsx
```

---

### Task 5: The place card, in the Build inspector

**Files:**
- Create: `packages/editor/src/places/BoxedFrame.tsx`
- Create: `packages/editor/src/places/PlaceCard.tsx`
- Create: `packages/editor/src/places/PlaceCard.test.tsx`
- Modify: `packages/editor/src/build/SelectionInspector.tsx` (the `room` case, and imports)
- Modify: `packages/editor/src/build/SelectionInspector.test.tsx` (four tests)

**Interfaces:**
- Consumes:
  - `placesByRoom` from `./labels` (Task 3);
  - `bestEvidence`, `frameWindow`, `imageWidthFor`, `surveyLink`, `statusLine`, `type Evidence` from `./evidence` (Task 3);
  - `followLink`, `setParams` from `../route`;
  - `Button` from `../ui/Button`;
  - `useEditorStore`, which provides `model` and `team`.
- Produces:
  - `export function BoxedFrame(props: { src: string; frame: Pick<Keyframe, "widthPx" | "heightPx">; box: Box | undefined; tone: "confirmed" | "proposed"; alt: string; className?: string }): JSX.Element`. It renders the frame zoomed to `frameWindow(box)`, with the box as `data-testid="frame-box"`. Task 7 reuses it for thumbnails.
  - `export function PlaceCard(props: { api: Pick<Api, "keyframeFileUrl">; room: Room; onBindOne?: () => void }): JSX.Element | null`. It renders `<section aria-label="Surveyed place">`.

- [ ] **Step 1: Write the failing tests**

`packages/editor/src/places/PlaceCard.test.tsx`:

```tsx
import { parseModel } from "@oth/model";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useEditorStore } from "../state/store";
import { fakeApi } from "../testing/fakeApi";
import { PlaceCard } from "./PlaceCard";

const sq = (x: number): [number, number][] => [[x, 0], [x + 10, 0], [x + 10, 10], [x, 10]];
const frame = (id: string, captureId = "cap_1") => ({ id, captureId, imageId: id, widthPx: 3840, heightPx: 2160 });
// Built from local parts, so it is 27 Sep wherever the test runs.
const on27 = new Date(2026, 8, 27, 12).toISOString();

const model = parseModel({
  building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
  levels: [{ id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6 }],
  rooms: [
    { id: "L1-shop", levelId: "oth-L1", kind: "room", footprint: sq(0), heightM: 4, nameEn: "Shop" },
    { id: "L1-dup", levelId: "oth-L1", kind: "room", footprint: sq(20), heightM: 4 },
    { id: "L1-claim", levelId: "oth-L1", kind: "room", footprint: sq(40), heightM: 4 },
    { id: "L1-empty", levelId: "oth-L1", kind: "room", footprint: sq(60), heightM: 4 },
  ],
  captures: [
    { id: "cap_1", kind: "video", filename: "l1.mp4", levelId: "oth-L1" },
    { id: "cap_loose", kind: "photos", filename: "phone" },
  ],
  keyframes: [frame("kf_1"), frame("kf_2"), frame("kf_3"), frame("kf_loose", "cap_loose")],
  places: [
    { id: "pl_star", nameEn: "Starbucks", category: "retail", levelId: "oth-L1", roomId: "L1-shop" },
    { id: "pl_tea", nameEn: "iTea", category: "retail", levelId: "oth-L1", roomId: "L1-dup", status: "proposed" },
    { id: "pl_kiosk", nameEn: "Kiosk", category: "retail", levelId: "oth-L1", roomId: "L1-dup" },
    { id: "pl_claim", nameEn: "Mystery", category: "retail", levelId: "oth-L1", roomId: "L1-claim", status: "proposed" },
  ],
  sightings: [
    { id: "s_big", placeId: "pl_star", keyframeId: "kf_2", box: { x: 0.4, y: 0.4, w: 0.2, h: 0.1 }, updatedBy: "u_wei", updatedAt: on27 },
    { id: "s_small", placeId: "pl_star", keyframeId: "kf_1", box: { x: 0.1, y: 0.1, w: 0.05, h: 0.05 } },
    { id: "s_whole", placeId: "pl_star", keyframeId: "kf_3" },
    { id: "s_kiosk", placeId: "pl_kiosk", keyframeId: "kf_loose" },
  ],
});

function show(roomId: string, onBindOne?: () => void) {
  const room = model.rooms.find(r => r.id === roomId)!;
  render(<PlaceCard api={fakeApi()} room={room} onBindOne={onBindOne} />);
  return within(screen.getByRole("region", { name: "Surveyed place" }));
}

beforeEach(() => {
  useEditorStore.getState().reset();
  useEditorStore.getState().setModel(model);
  useEditorStore.getState().setTeam([{ id: "u_wei", displayName: "Wei Kang" }]);
});

describe("PlaceCard", () => {
  it("names the room's place and who confirmed its best photo", () => {
    const card = show("L1-shop");
    expect(card.getByRole("heading", { name: "Starbucks" })).toBeTruthy();
    expect(card.getByText("retail")).toBeTruthy();
    expect(card.getByText(/Confirmed by Wei Kang, 27 Sep/)).toBeTruthy();
  });

  it("shows the best photo large enough to read the sign, with its box drawn", () => {
    const card = show("L1-shop");
    expect(card.getByRole("img", { name: "Starbucks, as filmed" }).getAttribute("src")).toBe("/api/keyframes/kf_2/file?w=1600");
    // Zoomed to a 40% window around the box, so the box fills the middle.
    const box = card.getByTestId("frame-box");
    expect(box.style.left).toBe("25%");
    expect(box.style.top).toBe("37.5%");
    expect(box.style.width).toBe("50%");
  });

  it("steps through the place's other frames", () => {
    const card = show("L1-shop");
    expect(card.getByText("Seen in 3 frames")).toBeTruthy();
    expect(card.getByText("1 of 3")).toBeTruthy();
    expect((card.getByRole("button", { name: "Previous frame" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(card.getByRole("button", { name: "Next frame" }));
    expect(card.getByText("2 of 3")).toBeTruthy();
    expect(card.getByRole("img", { name: "Starbucks, as filmed" }).getAttribute("src")).toBe("/api/keyframes/kf_1/file?w=1600");
  });

  it("opens the frame shown in Survey", () => {
    const card = show("L1-shop");
    expect(card.getByRole("link", { name: "Open in Survey" }).getAttribute("href")).toBe("/floors/L1/survey?capture=cap_1&frame=kf_2");
  });

  it("names a room with two places by the confirmed one, and says what else is bound there", () => {
    const card = show("L1-dup");
    expect(card.getByRole("heading", { name: "Kiosk" })).toBeTruthy();
    expect(card.getByText("Also bound to this room: iTea")).toBeTruthy();
    // Kiosk was filmed on footage filed under no floor, which Survey cannot show.
    expect(card.queryByRole("link", { name: "Open in Survey" })).toBeNull();
  });

  it("says when the place is still a claim, and when there is no photo", () => {
    const card = show("L1-claim");
    expect(card.getByText("Proposed, waiting in Review")).toBeTruthy();
    expect(card.getByText("There is no photo of this place yet.")).toBeTruthy();
  });

  it("offers Bind one for a room with no place", () => {
    const onBindOne = vi.fn();
    const card = show("L1-empty", onBindOne);
    expect(card.getByText(/No surveyed place is bound to this room/)).toBeTruthy();
    fireEvent.click(card.getByRole("button", { name: "Bind one" }));
    expect(onBindOne).toHaveBeenCalled();
  });

  it("points below instead where the binding list is already on screen", () => {
    const card = show("L1-empty");
    expect(card.queryByRole("button", { name: "Bind one" })).toBeNull();
    expect(card.getByText(/Choose it below/)).toBeTruthy();
  });
});
```

Add to `packages/editor/src/build/SelectionInspector.test.tsx`, inside `describe("SelectionInspector", …)`:

```tsx
  it("puts the surveyed place card above a room's own details", () => {
    setup({ type: "room", id: "L1-a" });
    const card = screen.getByRole("region", { name: "Surveyed place" });
    expect(card.textContent).toContain("No surveyed place is bound to this room.");
    expect(card.compareDocumentPosition(screen.getByLabelText("Name")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("sends Bind one to the Bind places step", () => {
    window.history.replaceState({}, "", "/floors/L1/build?step=rooms");
    setup({ type: "room", id: "L1-a" }, "rooms");
    fireEvent.click(screen.getByRole("button", { name: "Bind one" }));
    expect(new URLSearchParams(window.location.search).get("step")).toBe("bind");
  });

  it("does not offer Bind one on Bind places, where the list is just below", () => {
    setup({ type: "room", id: "L1-a" }, "bind");
    expect(screen.queryByRole("button", { name: "Bind one" })).toBeNull();
  });

  it("shows no place card for a detail", () => {
    setup({ type: "room", id: "L1-d" }, "dressing");
    expect(screen.queryByRole("region", { name: "Surveyed place" })).toBeNull();
  });
```

- [ ] **Step 2: Run the tests to verify that they fail**

Run: `timeout 300 npx vitest run packages/editor/src/places/PlaceCard.test.tsx packages/editor/src/build/SelectionInspector.test.tsx --poolOptions.threads.maxThreads=2 --poolOptions.threads.minThreads=1`
Expected: FAIL. `./PlaceCard` does not resolve, and there is no "Surveyed place" region.

- [ ] **Step 3: Write `BoxedFrame`**

`packages/editor/src/places/BoxedFrame.tsx`:

```tsx
import type { Box, Keyframe } from "@oth/model";
import { frameWindow } from "./evidence";

/** Percentages rounded to a hundredth, so 0.1 / 0.4 is "25%" and not "25.000000000000007%". */
const pct = (v: number) => `${Math.round(v * 10_000) / 100}%`;

/**
 * A frame zoomed so its box sits large in the middle, with the box drawn:
 * the sign readable at card size. The container keeps the frame's shape, so
 * the box's fractions line up with the picture. A proposed tag's box is
 * dashed, so colour is not the only thing that tells it apart.
 */
export function BoxedFrame({ src, frame, box, tone, alt, className = "" }: {
  src: string;
  frame: Pick<Keyframe, "widthPx" | "heightPx">;
  box: Box | undefined;
  tone: "confirmed" | "proposed";
  alt: string;
  className?: string;
}) {
  const win = frameWindow(box);
  return (
    <div
      className={`relative overflow-hidden rounded bg-stone-200 ${className}`}
      style={{ aspectRatio: `${frame.widthPx} / ${frame.heightPx}` }}
    >
      {/* max-w-none: Tailwind's reset caps an img at its container's width, which would undo the zoom. */}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        className="absolute max-w-none"
        style={{ width: pct(1 / win.size), left: pct(-win.x / win.size), top: pct(-win.y / win.size) }}
      />
      {box && (
        <div
          data-testid="frame-box"
          aria-hidden
          className={`absolute rounded-sm border-2 ${tone === "confirmed" ? "border-confirmed" : "border-dashed border-proposed"}`}
          style={{
            left: pct((box.x - win.x) / win.size),
            top: pct((box.y - win.y) / win.size),
            width: pct(box.w / win.size),
            height: pct(box.h / win.size),
          }}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Write `PlaceCard`**

`packages/editor/src/places/PlaceCard.tsx`. The full component:

```tsx
import type { Room } from "@oth/model";
import { useMemo, useState } from "react";
import type { Api } from "../api/client";
import { followLink } from "../route";
import { useEditorStore } from "../state/store";
import { Button } from "../ui/Button";
import { BoxedFrame } from "./BoxedFrame";
import { bestEvidence, imageWidthFor, statusLine, surveyLink } from "./evidence";
import { placesByRoom } from "./labels";

/** The card's picture is the inspector column's width, 296 px, at 2x. */
const CARD_PX = 592;

/**
 * The answer to "how do I know this is the Starbucks?" (spec §4): the place
 * bound to the selected room, who confirmed it, and the photo that shows it,
 * with the room's other frames a click away.
 *
 * Keyed by room where it is used, so the frame you had stepped to on one room
 * does not carry over to the next.
 */
export function PlaceCard({ api, room, onBindOne }: {
  api: Pick<Api, "keyframeFileUrl">;
  room: Room;
  /** Absent where the binding list is already on screen: on Bind places, just below. */
  onBindOne?: () => void;
}) {
  const model = useEditorStore(s => s.model);
  const team = useEditorStore(s => s.team);
  const [index, setIndex] = useState(0);
  const bound = useMemo(() => (model ? placesByRoom(model).get(room.id) ?? [] : []), [model, room.id]);
  const place = bound[0];
  const evidence = useMemo(() => (model && place ? bestEvidence(model, place.id) : []), [model, place]);

  if (!model) return null;

  if (!place) {
    return (
      <section aria-label="Surveyed place" className="border-b border-stone-200 p-3">
        <p className="text-xs text-stone-600">
          No surveyed place is bound to this room.{onBindOne ? "" : " Choose it below."}
        </p>
        {onBindOne && (
          <Button size="sm" className="mt-2" onClick={onBindOne}>
            Bind one
          </Button>
        )}
      </section>
    );
  }

  // The frames can shrink under you, when a teammate bins one, so the step is clamped.
  const at = Math.min(index, Math.max(0, evidence.length - 1));
  const shown = evidence[at];
  const link = shown ? surveyLink(model, shown.frame) : null;
  const vouched = place.status === "confirmed" && shown?.sighting.status === "confirmed";

  return (
    <section aria-label="Surveyed place" className="space-y-2 border-b border-stone-200 p-3">
      <div>
        <h3 className="text-sm font-semibold text-stone-900">{place.nameEn}</h3>
        <p className="text-xs text-stone-600">{place.category}</p>
        <p className="text-xs text-stone-700">
          {vouched && <span aria-hidden className="text-confirmed">✓ </span>}
          {statusLine(place, shown, team)}
        </p>
      </div>

      {shown ? (
        <figure>
          <BoxedFrame
            src={api.keyframeFileUrl(shown.frame.id, imageWidthFor(CARD_PX, shown.sighting.box))}
            frame={shown.frame}
            box={shown.sighting.box}
            tone={shown.sighting.status}
            alt={`${place.nameEn}, as filmed`}
          />
          <figcaption className="mt-1 flex items-center gap-2 text-xs text-stone-600">
            <span>Seen in {evidence.length} frame{evidence.length === 1 ? "" : "s"}</span>
            {evidence.length > 1 && (
              <span className="ml-auto flex items-center gap-1">
                <Button size="sm" variant="ghost" aria-label="Previous frame" disabled={at === 0} onClick={() => setIndex(at - 1)}>
                  ←
                </Button>
                <span>{at + 1} of {evidence.length}</span>
                <Button size="sm" variant="ghost" aria-label="Next frame" disabled={at === evidence.length - 1} onClick={() => setIndex(at + 1)}>
                  →
                </Button>
              </span>
            )}
          </figcaption>
        </figure>
      ) : (
        <p className="text-xs text-stone-600">There is no photo of this place yet.</p>
      )}

      {link && (
        <a href={link} onClick={followLink(link)} className="inline-block text-xs font-medium text-accent underline">
          Open in Survey
        </a>
      )}

      {bound.length > 1 && (
        <p className="text-xs text-stone-600">Also bound to this room: {bound.slice(1).map(p => p.nameEn).join(", ")}</p>
      )}
    </section>
  );
}
```

- [ ] **Step 5: Mount the card in `SelectionInspector`**

In `packages/editor/src/build/SelectionInspector.tsx`:

- Add `import { PlaceCard } from "../places/PlaceCard";` and `import { setParams } from "../route";`.
- In `inspectorFor`, in the `case "room":` branch, replace the returned fragment's opening so the card comes first:

```tsx
      case "room": {
        const room = live(m.rooms).find(r => r.id === s.id);
        if (!room) return null;
        // Only rooms and areas are surveyed: a detail is furniture, a void a hole.
        const surveyed = room.kind === "room" || room.kind === "area";
        return (
          <>
            {surveyed && (
              <PlaceCard
                key={room.id}
                api={api}
                room={room}
                // On Bind places the list is just below; elsewhere this is the way there.
                onBindOne={step === "bind" ? undefined : () => setParams({ step: "bind" })}
              />
            )}
            <Inspector
```

The rest of the branch is unchanged: the `Inspector` props, and the `step === "bind"` block with `BindPlaces`.

- [ ] **Step 6: Run the tests and typecheck**

Run: `timeout 300 npx vitest run packages/editor/src/places packages/editor/src/build/SelectionInspector.test.tsx --poolOptions.threads.maxThreads=2 --poolOptions.threads.minThreads=1`
Expected: PASS.

Run: `npx tsc -b packages/editor`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git commit --only -m "feat(editor): clicking a room shows its place and the photo that proves it

The Build inspector opens on a place card for a selected room or area: the
bound place, who confirmed the photo shown and when, the best frame zoomed to
its box so the sign can be read, the other frames a step away, and Open in
Survey. A room with no place says so and offers Bind one; a duplicate bind is
named. The 3D preview selects rooms already, so the card answers there too.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- packages/editor/src/places/BoxedFrame.tsx packages/editor/src/places/PlaceCard.tsx packages/editor/src/places/PlaceCard.test.tsx packages/editor/src/build/SelectionInspector.tsx packages/editor/src/build/SelectionInspector.test.tsx
```

> **✂ Shippable after Task 5.** The controller runs `packages/model`, `packages/renderer`, `packages/editor/src/{places,plan,build}` and the three typechecks. It then tries L1 on the :3055 sandbox (see *Shipping A* at the end), and can deploy. Tasks 6 to 8 add the Places checklist.

---

### Task 6: The checklist's rows, and a fresh report

**Files:**
- Create: `packages/editor/src/places/rows.ts`
- Create: `packages/editor/src/places/rows.test.ts`
- Create: `packages/editor/src/state/recheck.ts`
- Create: `packages/editor/src/state/recheck.test.ts`

**Interfaces:**
- Consumes:
  - `bestEvidence`, `type Evidence` from `./evidence` (Task 3);
  - `live`, `placeLevels`, `MapModel`, `Place`, `Room`, `ValidationReport` from `@oth/model`;
  - `waitingReview` from `../flow/floorProgress`;
  - `href` from `../route`;
  - `reportFailure` from `../ui/failure`.
- Produces:
  - `places/rows.ts`:
    - `export type Gap = "unbound" | "roomGone" | "otherFloor" | "noConfirmedPhoto" | "photosDisagree"`
    - `export const GAP_LABEL: Record<Gap, string>`
    - `export type PlaceRow = { place: Place; best: Evidence | null; room: Room | null; onMap: boolean; gaps: Gap[] }`
    - `export function placeRows(model: MapModel, report: ValidationReport | null, levelId: string): PlaceRow[]`
    - `export type PlacesSummary = { confirmed: number; onMap: number; gaps: number; waiting: number; unfilmedRooms: number }`
    - `export function placesSummary(model: MapModel, rows: readonly PlaceRow[], levelId: string): PlacesSummary`
    - `export type RowAction = { label: "Show on map" | "Bind it"; to: string }`
    - `export function rowAction(model: MapModel, row: PlaceRow, levelCode: string): RowAction`
    - `export function whereText(model: MapModel, row: PlaceRow): string`
    - `export const PLACES_FILTERS: readonly ["gaps", "on-map", "all"]`
    - `export type PlacesFilter`
    - `export const FILTER_LABEL: Record<PlacesFilter, string>`
    - `export function readPlacesFilter(params: Record<string, string>): PlacesFilter`
    - `export function filterRows(rows: readonly PlaceRow[], filter: PlacesFilter): PlaceRow[]`
    - `export function onMapLine(onMap: number, confirmed: number): string`
  - `state/recheck.ts`:
    - `export async function recheck(api: Pick<Api, "validate">, doing: string, heard?: () => boolean): Promise<void>`. Task 8 replaces `BuildWorkspace`'s private copy with it.

- [ ] **Step 1: Write the failing tests**

`packages/editor/src/places/rows.test.ts`:

```ts
import { parseModel, type ValidationReport } from "@oth/model";
import { describe, expect, it } from "vitest";
import {
  filterRows, onMapLine, placeRows, placesSummary, readPlacesFilter, rowAction, whereText, type PlaceRow,
} from "./rows";

const iso = "2026-09-20T00:00:00.000Z";
const sq = (x: number): [number, number][] => [[x, 0], [x + 10, 0], [x + 10, 10], [x, 10]];
const frame = (id: string, extra = {}) => ({ id, captureId: "cap_1", imageId: id, widthPx: 640, heightPx: 480, ...extra });

const model = parseModel({
  building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
  levels: [
    { id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6 },
    { id: "oth-L2", buildingId: "oth", code: "L2", ordinal: 2, nameEn: "L2", nameZh: "二楼", elevationM: 6, heightM: 4 },
  ],
  rooms: [
    { id: "L1-shop", levelId: "oth-L1", kind: "room", footprint: sq(0), heightM: 4, nameEn: "Shop" },
    { id: "L1-kiosk", levelId: "oth-L1", kind: "room", footprint: sq(20), heightM: 4 },
    { id: "L1-cafe", levelId: "oth-L1", kind: "room", footprint: sq(40), heightM: 4, nameEn: "Cafe" },
    { id: "L1-empty", levelId: "oth-L1", kind: "room", footprint: sq(60), heightM: 4, nameEn: "Unit 7" },
    { id: "L1-void", levelId: "oth-L1", kind: "void", footprint: sq(80), heightM: 4 },
    { id: "L1-old", levelId: "oth-L1", kind: "room", footprint: sq(100), heightM: 4, deletedAt: iso },
    { id: "L2-shop", levelId: "oth-L2", kind: "room", footprint: sq(0), heightM: 4, nameEn: "Upstairs" },
  ],
  captures: [{ id: "cap_1", kind: "video", filename: "l1.mp4", levelId: "oth-L1" }],
  keyframes: [frame("kf_1"), frame("kf_2"), frame("kf_bin", { deletedAt: iso })],
  places: [
    { id: "pl_star", nameEn: "Starbucks", category: "retail", levelId: "oth-L1", roomId: "L1-shop" },
    { id: "pl_books", nameEn: "Anchor Books", category: "retail", levelId: "oth-L1" },
    { id: "pl_gone", nameEn: "Gone Shop", category: "retail", levelId: "oth-L1", roomId: "L1-old" },
    { id: "pl_up", nameEn: "Up There", category: "retail", levelId: "oth-L1", roomId: "L2-shop" },
    { id: "pl_kiosk", nameEn: "Kiosk", category: "retail", levelId: "oth-L1", roomId: "L1-kiosk" },
    { id: "pl_cafe", nameEn: "Toast Box", category: "retail", levelId: "oth-L1", roomId: "L1-cafe" },
    { id: "pl_claim", nameEn: "iTea", category: "retail", levelId: "oth-L1", status: "proposed" },
    { id: "pl_walk", nameEn: "Covered link", category: "facility", levelId: "oth-L1", pathwayKindId: "pk-1" },
    { id: "pl_l2", nameEn: "Gym", category: "sports", levelId: "oth-L2", roomId: "L2-shop" },
    { id: "pl_del", nameEn: "Deleted", category: "retail", levelId: "oth-L1", deletedAt: iso },
  ],
  sightings: [
    { id: "s_star", placeId: "pl_star", keyframeId: "kf_1", box: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 } },
    { id: "s_books", placeId: "pl_books", keyframeId: "kf_1" },
    { id: "s_gone", placeId: "pl_gone", keyframeId: "kf_2" },
    { id: "s_up", placeId: "pl_up", keyframeId: "kf_2" },
    // A claim, and a confirmed tag on a frame in the bin: no confirmed photo.
    { id: "s_kiosk_claim", placeId: "pl_kiosk", keyframeId: "kf_2", status: "proposed" },
    { id: "s_kiosk_bin", placeId: "pl_kiosk", keyframeId: "kf_bin" },
    { id: "s_cafe", placeId: "pl_cafe", keyframeId: "kf_1" },
  ],
});

const report: ValidationReport = {
  issues: [{
    severity: "warning", code: "place.adjacencyBroken", entityType: "place", entityId: "pl_cafe", levelId: "oth-L1",
    message: '"Toast Box" and "Starbucks" appear in the same photo, but the rooms they are bound to are 52 m apart.',
  }],
  errorCount: 0,
  warningCount: 1,
  ok: true,
};

const rows = placeRows(model, report, "oth-L1");
const row = (id: string) => rows.find(r => r.place.id === id)!;

describe("placeRows", () => {
  it("lists this floor's confirmed places, gaps first, then by name, with every gap named", () => {
    expect(rows.map(r => [r.place.id, r.gaps])).toEqual([
      ["pl_books", ["unbound"]],
      ["pl_gone", ["roomGone"]],
      ["pl_kiosk", ["noConfirmedPhoto"]],
      ["pl_cafe", ["photosDisagree"]],
      ["pl_up", ["otherFloor"]],
      ["pl_star", []],
    ]);
  });

  it("leaves out proposals, walkways, other floors' places and deleted ones", () => {
    const ids = rows.map(r => r.place.id);
    for (const out of ["pl_claim", "pl_walk", "pl_l2", "pl_del"]) expect(ids).not.toContain(out);
  });

  it("counts a place on the map only when its room is live and on this floor", () => {
    expect(rows.filter(r => r.onMap).map(r => r.place.id).sort()).toEqual(["pl_cafe", "pl_kiosk", "pl_star"]);
    expect(row("pl_gone").room).toBeNull();
    expect(row("pl_up").room?.id).toBe("L2-shop");
  });

  it("shows each place by its best frame, never one from the bin", () => {
    expect(row("pl_star").best?.sighting.id).toBe("s_star");
    expect(row("pl_kiosk").best?.sighting.id).toBe("s_kiosk_claim");
  });

  it("reads 'photos disagree' from the report, and only from it", () => {
    expect(placeRows(model, null, "oth-L1").find(r => r.place.id === "pl_cafe")!.gaps).toEqual([]);
  });
});

describe("placesSummary", () => {
  it("counts the heading, the filters, Review's queue and the rooms nobody filmed", () => {
    expect(placesSummary(model, rows, "oth-L1")).toEqual({
      confirmed: 6, onMap: 3, gaps: 5, waiting: 1,
      // Unit 7. A void is not surveyed, and a deleted room is not counted.
      unfilmedRooms: 1,
    });
  });
});

describe("rowAction", () => {
  it("shows a bound place's room on the map, on that room's own floor", () => {
    expect(rowAction(model, row("pl_star"), "L1")).toEqual({ label: "Show on map", to: "/floors/L1/build?select=room%3AL1-shop&step=bind" });
    expect(rowAction(model, row("pl_up"), "L1")).toEqual({ label: "Show on map", to: "/floors/L2/build?select=room%3AL2-shop&step=bind" });
  });

  it("sends a place with no room, or whose room is gone, to Bind places with it picked", () => {
    expect(rowAction(model, row("pl_books"), "L1")).toEqual({ label: "Bind it", to: "/floors/L1/build?place=pl_books&step=bind" });
    expect(rowAction(model, row("pl_gone"), "L1")).toEqual({ label: "Bind it", to: "/floors/L1/build?place=pl_gone&step=bind" });
  });
});

describe("whereText", () => {
  it("says where each place is on the map", () => {
    expect(whereText(model, row("pl_star"))).toBe("Starbucks → Shop (L1-shop)");
    expect(whereText(model, row("pl_kiosk"))).toBe("Kiosk → Unnamed room (L1-kiosk)");
    expect(whereText(model, row("pl_up"))).toBe("Up There → Upstairs (L2-shop) on L2");
    expect(whereText(model, row("pl_gone"))).toBe("Gone Shop → a room since deleted (L1-old)");
    expect(whereText(model, row("pl_books"))).toBe("Anchor Books → no room yet");
  });
});

describe("filters", () => {
  it("reads the filter leniently, gaps by default", () => {
    expect(readPlacesFilter({})).toBe("gaps");
    expect(readPlacesFilter({ filter: "all" })).toBe("all");
    expect(readPlacesFilter({ filter: "bogus" })).toBe("gaps");
  });

  it("filters to gaps, to what is on the map, or to all; the first two can overlap", () => {
    const ids = (r: PlaceRow[]) => r.map(x => x.place.id);
    expect(ids(filterRows(rows, "gaps"))).toHaveLength(5);
    expect(ids(filterRows(rows, "on-map"))).toEqual(["pl_kiosk", "pl_cafe", "pl_star"]);
    expect(filterRows(rows, "all")).toHaveLength(6);
  });
});

describe("onMapLine", () => {
  it("says how much of the survey has reached the map", () => {
    expect(onMapLine(28, 30)).toBe("28 of 30 confirmed places are on the map");
    expect(onMapLine(1, 1)).toBe("1 of 1 confirmed place is on the map");
  });
});
```

`packages/editor/src/state/recheck.test.ts`:

```ts
import type { ValidationReport } from "@oth/model";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useToasts } from "../ui/toast";
import { recheck } from "./recheck";
import { useEditorStore } from "./store";

const report = (warningCount: number): ValidationReport => ({ issues: [], errorCount: 0, warningCount, ok: true });

beforeEach(() => {
  useEditorStore.getState().reset();
  useToasts.getState().clear();
});

describe("recheck", () => {
  it("puts the fresh report in the store", async () => {
    await recheck({ validate: vi.fn().mockResolvedValue(report(3)) }, "check the places again");
    expect(useEditorStore.getState().report).toEqual(report(3));
  });

  it("keeps a report a save brought meanwhile, which is newer", async () => {
    let answer!: (r: ValidationReport) => void;
    const validate = vi.fn(() => new Promise<ValidationReport>(resolve => { answer = resolve; }));
    const pending = recheck({ validate }, "check the places again");
    useEditorStore.getState().setReport(report(5));
    answer(report(3));
    await pending;
    expect(useEditorStore.getState().report).toEqual(report(5));
  });

  it("says what it was doing when it fails, and offers Retry", async () => {
    const validate = vi.fn().mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValue(report(1));
    await recheck({ validate }, "check the places again");
    const [failed] = useToasts.getState().toasts;
    expect(failed?.message).toBe("Couldn't check the places again. Check your connection, then retry.");
    await failed?.action?.run();
    expect(useEditorStore.getState().report).toEqual(report(1));
  });

  it("says nothing once nobody is listening", async () => {
    await recheck({ validate: vi.fn().mockRejectedValue(new TypeError("Failed to fetch")) }, "check the places again", () => false);
    expect(useToasts.getState().toasts).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify that they fail**

Run: `timeout 300 npx vitest run packages/editor/src/places/rows.test.ts packages/editor/src/state/recheck.test.ts --poolOptions.threads.maxThreads=2 --poolOptions.threads.minThreads=1`
Expected: FAIL. `./rows` and `./recheck` do not resolve.

- [ ] **Step 3: Write `rows.ts`**

`packages/editor/src/places/rows.ts`:

```ts
import { live, placeLevels, type MapModel, type Place, type Room, type ValidationReport } from "@oth/model";
import { waitingReview } from "../flow/floorProgress";
import { href } from "../route";
import { bestEvidence, type Evidence } from "./evidence";

/** What stands between a confirmed place and the map (spec §4). */
export type Gap = "unbound" | "roomGone" | "otherFloor" | "noConfirmedPhoto" | "photosDisagree";

export const GAP_LABEL: Record<Gap, string> = {
  unbound: "Not on the map",
  roomGone: "Room gone",
  otherFloor: "On another floor",
  noConfirmedPhoto: "No confirmed photo",
  photosDisagree: "Photos disagree",
};

export type PlaceRow = {
  place: Place;
  /** Its best frame, for the thumbnail. */
  best: Evidence | null;
  /** The live room it is bound to, on whichever floor that is. */
  room: Room | null;
  /** Bound to a live room on this floor. */
  onMap: boolean;
  gaps: Gap[];
};

/**
 * One row per confirmed place on a floor: the Places checklist (spec §4).
 *
 * A proposal is a claim until Review decides it, so it is counted, not
 * listed. A walkway is built as a path and never bound, so it is neither.
 * *Photos disagree* comes from the report, so the caller should hand over a
 * fresh one (see `recheck`).
 */
export function placeRows(model: MapModel, report: ValidationReport | null, levelId: string): PlaceRow[] {
  const floors = placeLevels(model);
  const rooms = new Map(live(model.rooms).map(r => [r.id, r]));
  const disagree = new Set(
    (report?.issues ?? []).filter(i => i.code === "place.adjacencyBroken").map(i => i.entityId),
  );

  const rows = live(model.places)
    .filter(p => p.status === "confirmed" && !p.pathwayKindId && floors.get(p.id) === levelId)
    .map<PlaceRow>(place => {
      const evidence = bestEvidence(model, place.id);
      // Deleting a room leaves its place pointing at it: that is "Room gone", not "Not on the map".
      const room = place.roomId ? rooms.get(place.roomId) ?? null : null;
      const gaps: Gap[] = [];
      if (!place.roomId) gaps.push("unbound");
      else if (!room) gaps.push("roomGone");
      else if (room.levelId !== levelId) gaps.push("otherFloor");
      if (!evidence.some(e => e.sighting.status === "confirmed")) gaps.push("noConfirmedPhoto");
      if (disagree.has(place.id)) gaps.push("photosDisagree");
      return { place, best: evidence[0] ?? null, room, onMap: room?.levelId === levelId, gaps };
    });

  return rows.sort(
    (a, b) => Number(b.gaps.length > 0) - Number(a.gaps.length > 0) || a.place.nameEn.localeCompare(b.place.nameEn),
  );
}

export type PlacesSummary = {
  confirmed: number;
  onMap: number;
  gaps: number;
  /** Proposals on this floor, waiting in Review. */
  waiting: number;
  /** The other direction: rooms and areas no surveyed place is bound to. */
  unfilmedRooms: number;
};

export function placesSummary(model: MapModel, rows: readonly PlaceRow[], levelId: string): PlacesSummary {
  // Any live place counts, a proposal too, as validation's room.unsurveyed does.
  const bound = new Set(live(model.places).map(p => p.roomId).filter(Boolean));
  return {
    confirmed: rows.length,
    onMap: rows.filter(r => r.onMap).length,
    gaps: rows.filter(r => r.gaps.length > 0).length,
    waiting: waitingReview(model, levelId),
    unfilmedRooms: live(model.rooms).filter(
      r => r.levelId === levelId && (r.kind === "room" || r.kind === "area") && !bound.has(r.id),
    ).length,
  };
}

export type RowAction = { label: "Show on map" | "Bind it"; to: string };

/**
 * A row's one action. A place with a live room goes to Build with that room
 * selected, which opens its card, on the room's own floor. A place with none,
 * or whose room is gone, goes to Bind places with it picked, as the to-do
 * list does.
 */
export function rowAction(model: MapModel, row: PlaceRow, levelCode: string): RowAction {
  const bind = (code: string, params: Record<string, string>) =>
    href({ name: "floor", code, tab: "build", params: { step: "bind", ...params } });
  if (row.room) {
    const roomLevelId = row.room.levelId;
    const code = live(model.levels).find(l => l.id === roomLevelId)?.code ?? levelCode;
    return { label: "Show on map", to: bind(code, { select: `room:${row.room.id}` }) };
  }
  return { label: "Bind it", to: bind(levelCode, { place: row.place.id }) };
}

/** "Starbucks → Shop (L1-shop-12)": where a place is on the map, in words. */
export function whereText(model: MapModel, row: PlaceRow): string {
  const name = row.place.nameEn;
  if (row.room) {
    const roomLevelId = row.room.levelId;
    const room = `${row.room.nameEn.trim() || "Unnamed room"} (${row.room.id})`;
    if (row.onMap) return `${name} → ${room}`;
    const code = live(model.levels).find(l => l.id === roomLevelId)?.code ?? "another floor";
    return `${name} → ${room} on ${code}`;
  }
  if (row.place.roomId) return `${name} → a room since deleted (${row.place.roomId})`;
  return `${name} → no room yet`;
}

export const PLACES_FILTERS = ["gaps", "on-map", "all"] as const;
export type PlacesFilter = (typeof PLACES_FILTERS)[number];
export const FILTER_LABEL: Record<PlacesFilter, string> = { gaps: "Gaps", "on-map": "On the map", all: "All" };

/** The address, read leniently: anything unknown is Gaps, the to-do view. */
export function readPlacesFilter(params: Record<string, string>): PlacesFilter {
  return (PLACES_FILTERS as readonly string[]).includes(params.filter ?? "") ? (params.filter as PlacesFilter) : "gaps";
}

/** Gaps and On the map can overlap: a bound place with no confirmed photo is in both. */
export function filterRows(rows: readonly PlaceRow[], filter: PlacesFilter): PlaceRow[] {
  if (filter === "gaps") return rows.filter(r => r.gaps.length > 0);
  if (filter === "on-map") return rows.filter(r => r.onMap);
  return [...rows];
}

/** The Places heading, which the Floors home card repeats. */
export function onMapLine(onMap: number, confirmed: number): string {
  return `${onMap} of ${confirmed} confirmed ${confirmed === 1 ? "place is" : "places are"} on the map`;
}
```

- [ ] **Step 4: Write `recheck.ts`**

`packages/editor/src/state/recheck.ts`:

```ts
import type { ValidationReport } from "@oth/model";
import type { Api } from "../api/client";
import { reportFailure } from "../ui/failure";
import { useEditorStore } from "./store";

/**
 * Checks the map again, for the screens that read the report: Build's to-do
 * list, and the Places checklist.
 *
 * Survey and Review save without validating, because nothing they write can
 * block Publish. So the report can be older than a place tagged since. Only
 * the report is fetched: the map itself is already here.
 *
 * `doing` finishes "Couldn't …" in the failure toast. A failure is said only
 * while `heard()`: StrictMode mounts twice in development, and two identical
 * toasts would read as two failures.
 */
export async function recheck(
  api: Pick<Api, "validate">, doing: string, heard: () => boolean = () => true,
): Promise<void> {
  const before = useEditorStore.getState().report;
  let report: ValidationReport;
  try {
    report = await api.validate();
  } catch (err) {
    if (heard()) reportFailure(err, { doing, retry: () => recheck(api, doing) });
    return;
  }
  // A save that landed meanwhile brought a report of its own, from after it: keep that one.
  if (useEditorStore.getState().report === before) useEditorStore.getState().setReport(report);
}
```

- [ ] **Step 5: Run the tests and typecheck**

Run: `timeout 300 npx vitest run packages/editor/src/places packages/editor/src/state --poolOptions.threads.maxThreads=2 --poolOptions.threads.minThreads=1`
Expected: PASS.

Run: `npx tsc -b packages/editor`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git commit --only -m "feat(editor): the Places checklist's rows, and a report checked afresh

placeRows lists a floor's confirmed places with every gap: not on the map,
room gone, on another floor, no confirmed photo, photos disagree. A proposal
is counted for Review, not listed; a walkway is never bound, so it is left
out. rowAction and whereText say where each place is and what to do. recheck
is Build's report refresh, made shared so Places can check the map as it
opens: Survey and Review never validate.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- packages/editor/src/places/rows.ts packages/editor/src/places/rows.test.ts packages/editor/src/state/recheck.ts packages/editor/src/state/recheck.test.ts
```

---

### Task 7: The Places tab

**Files:**
- Modify: `packages/editor/src/route.ts:37-38`
- Modify: `packages/editor/src/route.test.tsx` (one test)
- Modify: `packages/editor/src/shell/FloorTabs.tsx:6`
- Modify: `packages/editor/src/shell/Header.test.tsx` (one assertion)
- Modify: `packages/editor/src/shell/Workspace.test.tsx` (one test)
- Modify: `packages/editor/src/floor/FloorWorkspace.tsx` (one branch, and an import)
- Create: `packages/editor/src/places/PlacesWorkspace.tsx`
- Create: `packages/editor/src/places/PlacesWorkspace.test.tsx`

**Interfaces:**
- Consumes:
  - everything in `./rows` (Task 6);
  - `recheck` from `../state/recheck` (Task 6);
  - `BoxedFrame` from `./BoxedFrame` (Task 5);
  - `imageWidthFor` from `./evidence` (Task 3);
  - `Chip` from `../ui/Chip`;
  - `followLink`, `href`, `setParams` from `../route`.
- Produces:
  - `FloorTab = "survey" | "review" | "build" | "places"`, and `FLOOR_TABS` gains `"places"`, last.
  - `export function PlacesWorkspace(props: { api: Api; level: Level; params: Record<string, string> }): JSX.Element`

- [ ] **Step 1: Write the failing tests**

`packages/editor/src/places/PlacesWorkspace.test.tsx`:

```tsx
import { parseModel, type ValidationReport } from "@oth/model";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCurrentRoute } from "../route";
import { useEditorStore } from "../state/store";
import { fakeApi } from "../testing/fakeApi";
import { PlacesWorkspace } from "./PlacesWorkspace";

const sq = (x: number): [number, number][] => [[x, 0], [x + 10, 0], [x + 10, 10], [x, 10]];
const frame = (id: string) => ({ id, captureId: "cap_1", imageId: id, widthPx: 640, heightPx: 480 });

const model = parseModel({
  building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
  levels: [
    { id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6 },
    { id: "oth-L2", buildingId: "oth", code: "L2", ordinal: 2, nameEn: "L2", nameZh: "二楼", elevationM: 6, heightM: 4 },
  ],
  rooms: [
    { id: "L1-shop", levelId: "oth-L1", kind: "room", footprint: sq(0), heightM: 4, nameEn: "Shop" },
    { id: "L1-cafe", levelId: "oth-L1", kind: "room", footprint: sq(20), heightM: 4, nameEn: "Cafe" },
    { id: "L1-empty", levelId: "oth-L1", kind: "room", footprint: sq(40), heightM: 4, nameEn: "Unit 7" },
  ],
  captures: [{ id: "cap_1", kind: "video", filename: "l1.mp4", levelId: "oth-L1" }],
  keyframes: [frame("kf_1"), frame("kf_2")],
  places: [
    { id: "pl_star", nameEn: "Starbucks", category: "retail", levelId: "oth-L1", roomId: "L1-shop" },
    { id: "pl_books", nameEn: "Anchor Books", category: "retail", levelId: "oth-L1" },
    { id: "pl_cafe", nameEn: "Toast Box", category: "retail", levelId: "oth-L1", roomId: "L1-cafe" },
    { id: "pl_tea", nameEn: "iTea", category: "retail", levelId: "oth-L1", status: "proposed" },
  ],
  sightings: [
    { id: "s1", placeId: "pl_star", keyframeId: "kf_1", box: { x: 0.45, y: 0.45, w: 0.1, h: 0.1 } },
    { id: "s2", placeId: "pl_books", keyframeId: "kf_2" },
    { id: "s3", placeId: "pl_cafe", keyframeId: "kf_1" },
    { id: "s4", placeId: "pl_tea", keyframeId: "kf_2", status: "proposed" },
  ],
});

const report: ValidationReport = {
  issues: [{
    severity: "warning", code: "place.adjacencyBroken", entityType: "place", entityId: "pl_cafe", levelId: "oth-L1",
    message: '"Toast Box" and "Starbucks" appear in the same photo, but the rooms they are bound to are 52 m apart.',
  }],
  errorCount: 0,
  warningCount: 1,
  ok: true,
};

function at(path: string, validate = vi.fn().mockResolvedValue(report)) {
  window.history.replaceState({}, "", path);
  const api = fakeApi({ validate });
  function Harness() {
    const route = useCurrentRoute();
    const level = useEditorStore(s => s.model)?.levels.find(l => route.name === "floor" && l.code === route.code);
    return route.name === "floor" && level ? <PlacesWorkspace api={api} level={level} params={route.params} /> : null;
  }
  render(<Harness />);
  return { api };
}

const rowIds = () => screen.queryAllByTestId(/^place-row-/).map(el => el.getAttribute("data-testid"));
const chip = (name: RegExp) => within(screen.getByRole("group", { name: "Show places" })).getByRole("button", { name });

beforeEach(() => {
  useEditorStore.getState().reset();
  useEditorStore.getState().setModel(model);
});

describe("PlacesWorkspace", () => {
  it("says how many confirmed places are on the map, what waits in Review, and which rooms nobody filmed", () => {
    at("/floors/L1/places");
    expect(screen.getByRole("heading", { name: "2 of 3 confirmed places are on the map" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "1 waiting in Review →" }).getAttribute("href")).toBe("/floors/L1/review");
    expect(screen.getByRole("link", { name: "Rooms nobody filmed: 1" }).getAttribute("href")).toBe("/floors/L1/build?step=bind");
  });

  it("checks the map again as it opens, so photos that disagree are current", async () => {
    const { api } = at("/floors/L1/places");
    expect(await screen.findByText("Photos disagree")).toBeTruthy();
    expect(api.validate).toHaveBeenCalledTimes(1);
  });

  it("lists the gaps first, each with what to do about it", async () => {
    at("/floors/L1/places");
    await screen.findByText("Photos disagree");
    expect(rowIds()).toEqual(["place-row-pl_books", "place-row-pl_cafe"]);
    const books = within(screen.getByTestId("place-row-pl_books"));
    expect(books.getByText("Not on the map")).toBeTruthy();
    expect(books.getByText("Anchor Books → no room yet")).toBeTruthy();
    expect(books.getByRole("link", { name: "Bind it: Anchor Books" }).getAttribute("href"))
      .toBe("/floors/L1/build?place=pl_books&step=bind");
  });

  it("counts each filter, and shows everything under All", async () => {
    at("/floors/L1/places");
    await screen.findByText("Photos disagree");
    expect(chip(/^Gaps/).textContent).toContain("2");
    expect(chip(/^On the map/).textContent).toContain("2");
    expect(chip(/^All/).textContent).toContain("3");
    fireEvent.click(chip(/^All/));
    expect(new URLSearchParams(window.location.search).get("filter")).toBe("all");
    const star = within(screen.getByTestId("place-row-pl_star"));
    expect(star.getByText("Starbucks → Shop (L1-shop)")).toBeTruthy();
    expect(star.getByRole("link", { name: "Show on map: Starbucks" }).getAttribute("href"))
      .toBe("/floors/L1/build?select=room%3AL1-shop&step=bind");
  });

  it("shows each place by its frame, zoomed to its box", () => {
    at("/floors/L1/places?filter=all");
    const star = screen.getByTestId("place-row-pl_star");
    expect(star.querySelector("img")?.getAttribute("src")).toBe("/api/keyframes/kf_1/file?w=1600");
    expect(within(star).getByTestId("frame-box")).toBeTruthy();
  });

  it("says so when nothing is missing", async () => {
    // Anchor Books bound, and a report in which no photos disagree.
    useEditorStore.getState().setModel({
      ...model, places: model.places.map(p => (p.id === "pl_books" ? { ...p, roomId: "L1-empty" } : p)),
    });
    const { api } = at("/floors/L1/places", vi.fn().mockResolvedValue({ issues: [], errorCount: 0, warningCount: 0, ok: true }));
    await waitFor(() => expect(api.validate).toHaveBeenCalled());
    expect(screen.getByText(/^No gaps/)).toBeTruthy();
    expect(rowIds()).toEqual([]);
  });

  it("says a floor has no confirmed places yet", () => {
    at("/floors/L2/places");
    expect(screen.getByRole("heading", { name: "No confirmed places on L2 yet" })).toBeTruthy();
  });
});
```

Add to `packages/editor/src/route.test.tsx`, inside `describe("parseRoute", …)`:

```tsx
  it("reads the Places tab and its filter", () => {
    expect(parseRoute("/floors/L1/places", "?filter=all")).toEqual({
      name: "floor", code: "L1", tab: "places", params: { filter: "all" },
    });
  });
```

In `packages/editor/src/shell/Header.test.tsx`, at the end of the test "shows the floor's tabs, the current one marked, with what is waiting in Review", add:

```tsx
    expect(tabs.getByRole("link", { name: "Places" }).getAttribute("href")).toBe("/floors/L1/places");
```

Add to `packages/editor/src/shell/Workspace.test.tsx`, inside `describe("Workspace", …)`:

```tsx
  it("shows the Places tab", async () => {
    at("/floors/L1/places");
    // sampleModel: L1's one place is still a proposal.
    expect(await screen.findByRole("heading", { name: "No confirmed places on L1 yet" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "1 waiting in Review →" })).toBeTruthy();
  });
```

- [ ] **Step 2: Run the tests to verify that they fail**

Run: `timeout 300 npx vitest run packages/editor/src/places/PlacesWorkspace.test.tsx packages/editor/src/route.test.tsx packages/editor/src/shell --poolOptions.threads.maxThreads=2 --poolOptions.threads.minThreads=1`
Expected: FAIL. `./PlacesWorkspace` does not resolve, `places` parses as `tab: null`, and there is no Places link.

- [ ] **Step 3: Add the tab**

In `packages/editor/src/route.ts`, replace lines 37–38:

```ts
export type FloorTab = "survey" | "review" | "build" | "places";
/** Places reads across Review and Build, so it is a tab of its own, not a view under either (spec §4). */
export const FLOOR_TABS: readonly FloorTab[] = ["survey", "review", "build", "places"];
```

In `packages/editor/src/shell/FloorTabs.tsx`, line 6:

```ts
const LABELS: Record<FloorTab, string> = { survey: "Survey", review: "Review", build: "Build", places: "Places" };
```

In `packages/editor/src/floor/FloorWorkspace.tsx`, add `import { PlacesWorkspace } from "../places/PlacesWorkspace";`. Directly after the `route.tab === "review"` branch, add:

```tsx
  if (route.tab === "places") {
    return <PlacesWorkspace api={api} level={level} params={route.params} />;
  }
```

- [ ] **Step 4: Write `PlacesWorkspace`**

`packages/editor/src/places/PlacesWorkspace.tsx`:

```tsx
import type { Level, MapModel } from "@oth/model";
import { useEffect, useMemo } from "react";
import type { Api } from "../api/client";
import { followLink, href, setParams } from "../route";
import { recheck } from "../state/recheck";
import { useEditorStore } from "../state/store";
import { Chip } from "../ui/Chip";
import { BoxedFrame } from "./BoxedFrame";
import { imageWidthFor } from "./evidence";
import {
  FILTER_LABEL, GAP_LABEL, PLACES_FILTERS, filterRows, onMapLine, placeRows, placesSummary, readPlacesFilter,
  rowAction, whereText, type PlaceRow, type PlacesFilter,
} from "./rows";

/** Thumbnails are 112 px wide, at 2x. */
const THUMB_PX = 224;

const EMPTY: Record<PlacesFilter, string> = {
  gaps: "No gaps: every confirmed place here is on the map, with a confirmed photo.",
  "on-map": "None of this floor's confirmed places is on the map yet. Bind them on Build's Bind places step.",
  all: "No confirmed places here yet. Places are confirmed in Review.",
};

/**
 * The checklist of every confirmed place on a floor (spec §4): is each on the
 * map, and what is missing if not. It reads across Review and Build, so it is
 * a tab of its own. Proposals are counted, not listed, because they are
 * claims until Review decides them.
 */
export function PlacesWorkspace({ api, level, params }: { api: Api; level: Level; params: Record<string, string> }) {
  const model = useEditorStore(s => s.model);
  const report = useEditorStore(s => s.report);
  const filter = readPlacesFilter(params);
  const rows = useMemo(() => (model ? placeRows(model, report, level.id) : []), [model, report, level.id]);
  const summary = useMemo(() => (model ? placesSummary(model, rows, level.id) : null), [model, rows, level.id]);

  // Survey and Review save without validating, so "Photos disagree" can be
  // older than the last tag. Checked once per visit.
  useEffect(() => {
    let mounted = true;
    void recheck(api, "check the places again", () => mounted);
    return () => {
      mounted = false;
    };
  }, [api]);

  if (!model || !summary) return <p className="p-8 text-sm text-stone-500">Loading the places…</p>;

  const shown = filterRows(rows, filter);
  const counts: Record<PlacesFilter, number> = { gaps: summary.gaps, "on-map": summary.onMap, all: summary.confirmed };
  const review = href({ name: "floor", code: level.code, tab: "review", params: {} });
  const bindStep = href({ name: "floor", code: level.code, tab: "build", params: { step: "bind" } });

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-6">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold">
          {summary.confirmed === 0 ? `No confirmed places on ${level.code} yet` : onMapLine(summary.onMap, summary.confirmed)}
        </h1>
        <p className="flex flex-wrap gap-x-4 text-xs text-stone-600">
          {summary.waiting > 0 && (
            <a href={review} onClick={followLink(review)} className="underline">{summary.waiting} waiting in Review →</a>
          )}
          {summary.unfilmedRooms > 0 && (
            <a href={bindStep} onClick={followLink(bindStep)} className="underline">Rooms nobody filmed: {summary.unfilmedRooms}</a>
          )}
        </p>
      </header>

      <div role="group" aria-label="Show places" className="flex gap-2">
        {PLACES_FILTERS.map(f => (
          <Chip key={f} selected={f === filter} count={counts[f]} onClick={() => setParams({ filter: f })}>
            {FILTER_LABEL[f]}
          </Chip>
        ))}
      </div>

      {shown.length > 0 ? (
        <ul aria-label="Confirmed places" className="divide-y divide-stone-200 rounded border border-stone-200 bg-white">
          {shown.map(row => <PlaceRowItem key={row.place.id} api={api} model={model} row={row} levelCode={level.code} />)}
        </ul>
      ) : (
        <p className="text-sm text-stone-600">{summary.confirmed === 0 ? EMPTY.all : EMPTY[filter]}</p>
      )}
    </div>
  );
}

function PlaceRowItem({ api, model, row, levelCode }: { api: Api; model: MapModel; row: PlaceRow; levelCode: string }) {
  const action = rowAction(model, row, levelCode);
  return (
    <li data-testid={`place-row-${row.place.id}`} className="flex items-center gap-3 p-2">
      {row.best ? (
        <BoxedFrame
          className="w-28 shrink-0"
          src={api.keyframeFileUrl(row.best.frame.id, imageWidthFor(THUMB_PX, row.best.sighting.box))}
          frame={row.best.frame}
          box={row.best.sighting.box}
          tone={row.best.sighting.status}
          alt=""
        />
      ) : (
        <span className="flex h-16 w-28 shrink-0 items-center justify-center rounded bg-stone-100 text-xs text-stone-600">No photo</span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-stone-900">
          {row.place.nameEn} <span className="text-xs font-normal text-stone-500">{row.place.category}</span>
        </p>
        <p className="truncate text-xs text-stone-600">{whereText(model, row)}</p>
        {row.gaps.length > 0 && (
          <ul aria-label="Gaps" className="mt-1 flex flex-wrap gap-1">
            {row.gaps.map(gap => (
              <li key={gap} className="rounded-full border border-stone-300 bg-stone-100 px-2 text-xs text-stone-800">
                {GAP_LABEL[gap]}
              </li>
            ))}
          </ul>
        )}
      </div>
      <a
        href={action.to}
        onClick={followLink(action.to)}
        className="shrink-0 rounded border border-stone-300 bg-white px-2.5 py-1 text-xs font-medium hover:bg-stone-100"
      >
        {action.label}
        <span className="sr-only">: {row.place.nameEn}</span>
      </a>
    </li>
  );
}
```

- [ ] **Step 5: Run the tests and typecheck**

Run: `timeout 300 npx vitest run packages/editor/src/places packages/editor/src/route.test.tsx packages/editor/src/shell packages/editor/src/flow/floors.test.ts --poolOptions.threads.maxThreads=2 --poolOptions.threads.minThreads=1`
Expected: PASS.

Run: `npx tsc -b packages/editor`
Expected: no errors. `Record<FloorTab, …>` in `FloorTabs` is the one place that must list the new tab, and Step 3 did.

- [ ] **Step 6: Commit**

```bash
git commit --only -m "feat(editor): a Places tab that checks every confirmed place reached the map

Survey · Review · Build · Places. The heading says how many of the floor's
confirmed places are on the map; each row shows the place by its frame, where
it is, what is missing, and Show on map or Bind it. Gaps is the default view.
Proposals are counted as waiting in Review, and rooms nobody filmed as the
other direction. It checks the map again as it opens, since Survey and Review
never validate.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- packages/editor/src/route.ts packages/editor/src/route.test.tsx packages/editor/src/shell/FloorTabs.tsx packages/editor/src/shell/Header.test.tsx packages/editor/src/shell/Workspace.test.tsx packages/editor/src/floor/FloorWorkspace.tsx packages/editor/src/places/PlacesWorkspace.tsx packages/editor/src/places/PlacesWorkspace.test.tsx
```

---

### Task 8: Links that land, *Room gone* rebinding, and the Floors card line

**Start after Task 4 has committed. Re-read `BuildWorkspace.tsx` and `BuildWorkspace.test.tsx` first.**

**Files:**
- Modify: `packages/editor/src/build/BuildWorkspace.tsx`
- Modify: `packages/editor/src/build/BuildWorkspace.test.tsx` (one test)
- Modify: `packages/editor/src/build/BindPlaces.tsx`
- Modify: `packages/editor/src/build/BindPlaces.test.tsx` (two tests)
- Modify: `packages/editor/src/home/FloorCard.tsx`
- Modify: `packages/editor/src/home/FloorsHome.test.tsx` (one test)

**Interfaces:**
- Consumes: `recheck` from `../state/recheck` (Task 6); `placeRows`, `onMapLine` from `../places/rows` (Task 6); `setParams` from `../route`.
- Produces:
  - `BuildWorkspace` honours `?place=<placeId>`. The place is put in hand, as choosing its to-do item does, and the parameter is then taken out of the address.
  - `BindPlaces` and `BindTools` treat a place whose room is deleted as unbound.
  - `FloorCard` shows `onMapLine(…)` when the floor has confirmed places.

- [ ] **Step 1: Write the failing tests**

Add to `packages/editor/src/build/BuildWorkspace.test.tsx`, inside `describe("BuildWorkspace — links", …)`:

```tsx
  it("picks the place a link from Places names, as its to-do item would, then takes it out of the address", async () => {
    open("/floors/L1/build?step=bind&place=pl_1");
    await waitFor(() =>
      expect(screen.getByRole("region", { name: "Bind places guide" }).textContent).toMatch(/click the room where you see Festive Mall/i));
    await waitFor(() => expect(param("place")).toBeNull());
  });
```

Add to `packages/editor/src/build/BindPlaces.test.tsx`, inside `describe("BindPlaces", …)`:

```tsx
  it("offers again a place whose room has since been deleted", () => {
    const orphaned = parseModel({
      ...base,
      rooms: [...base.rooms, { id: "L1-gone", levelId: "oth-L1", kind: "room", footprint: square(40), heightM: 3.5, deletedAt: "2026-09-20T00:00:00.000Z" }],
      places: [{ id: "pl_orphan", nameEn: "Orphan", category: "retail", levelId: "oth-L1", roomId: "L1-gone" }],
    });
    setup({ m: orphaned });
    expect(names(screen.getByRole("list", { name: "On L1" }))).toEqual(["Bind to Orphan"]);
  });
```

Add a new `describe` block at the end of the same file:

```tsx
describe("BindTools", () => {
  it("asks for a room for a place whose room has since been deleted", () => {
    useEditorStore.getState().setModel(parseModel({
      ...base,
      rooms: [...base.rooms, { id: "L1-gone", levelId: "oth-L1", kind: "room", footprint: square(40), heightM: 3.5, deletedAt: "2026-09-20T00:00:00.000Z" }],
      places: [{ id: "pl_orphan", nameEn: "Orphan", category: "retail", levelId: "oth-L1", roomId: "L1-gone" }],
    }));
    render(<BindTools api={fakeApi()} pendingPlaceId="pl_orphan" onCancel={vi.fn()} />);
    expect(screen.getByRole("status").textContent).toMatch(/Click the room where you see Orphan/);
  });
});
```

(If the file already has a `describe("BindTools", …)`, add the `it` to it instead.)

Add to `packages/editor/src/home/FloorsHome.test.tsx`, inside `describe("FloorsHome", …)`. Also add `import { parseModel } from "@oth/model";`:

```tsx
  it("says how many of a floor's confirmed places are on the map", () => {
    useEditorStore.getState().setModel(parseModel({
      ...sampleModel,
      rooms: [{ id: "L1-a", levelId: "oth-L1", kind: "room", footprint: [[0, 0], [10, 0], [10, 10], [0, 10]], heightM: 3 }],
      places: [
        { id: "pl_a", nameEn: "Starbucks", category: "retail", levelId: "oth-L1", roomId: "L1-a" },
        { id: "pl_b", nameEn: "Anchor Books", category: "retail", levelId: "oth-L1" },
      ],
      sightings: [],
    }));
    render(<FloorsHome api={fakeApi()} saver={fakeSaver()} />);
    const [l1, l2] = screen.getAllByRole("article");
    expect(within(l1!).getByText("1 of 2 confirmed places are on the map")).toBeTruthy();
    expect(within(l2!).queryByText(/confirmed place/)).toBeNull();
  });
```

- [ ] **Step 2: Run the tests to verify that they fail**

Run: `timeout 300 npx vitest run packages/editor/src/build/BuildWorkspace.test.tsx packages/editor/src/build/BindPlaces.test.tsx packages/editor/src/home --poolOptions.threads.maxThreads=2 --poolOptions.threads.minThreads=1`
Expected: FAIL.
- The guide does not name Festive Mall, and `place` stays in the address.
- Orphan is not listed.
- BindTools shows its fallback line.
- There is no "on the map" line.

- [ ] **Step 3: `BuildWorkspace`: read `?place=` once, and use the shared `recheck`**

In `packages/editor/src/build/BuildWorkspace.tsx`:

- Delete the private `async function recheck(api: Api, heard …)` and its doc comment. Also remove the `ValidationReport` import from `@oth/model`, and the `reportFailure` import, if nothing else in the file uses them. Add `import { recheck } from "../state/recheck";`.
- Change the mount effect's call to pass the words its toast has always used:

```tsx
    void recheck(api, "refresh the to-do list", () => mounted);
```

- After the effect that writes a missing `?step=` into the address, add:

```tsx
  // A link from the Places tab's "Bind it": that place in hand, as choosing
  // its to-do item does. Read once, then taken out of the address, so the
  // address never goes on naming a place already bound.
  const placeParam = route.params.place ?? "";
  useEffect(() => {
    if (!placeParam) return;
    setPendingPlaceId(placeParam);
    setParams({ place: null });
  }, [placeParam]);
```

The existing test "says so once when that check fails, and offers to try it again" pins the toast's words: *Couldn't refresh the to-do list. Check your connection, then retry.*

- [ ] **Step 4: `BindPlaces`: a place whose room is gone is waiting again**

In `packages/editor/src/build/BindPlaces.tsx`, in `BindPlaces`, replace the `open` line:

```tsx
  // Deleting a room leaves its place pointing at it, so a place whose room is
  // gone is waiting for one again, as the Places tab says ("Room gone").
  const liveRooms = new Set(live(model.rooms).map(r => r.id));
  const open = live(model.places).filter(
    p => p.status === "confirmed" && !p.pathwayKindId && !(p.roomId && liveRooms.has(p.roomId)),
  );
```

Keep the comment above it ("Confirmed units nothing has claimed …").

In `announceBind`, update the comment above the place's undo step. Only the words change, not the code:

```tsx
      // Only places with no live room are offered, so it had none worth
      // restoring; an explicit null clears a floor it did not have either.
```

In `BindTools`, replace the guard:

```tsx
  const place = pendingPlaceId ? live(model?.places ?? []).find(p => p.id === pendingPlaceId) : undefined;
  // One bound after all, by a Retry that went through late, say, already has
  // its room. A room since deleted does not count.
  const hasRoom = Boolean(place?.roomId && live(model?.rooms ?? []).some(r => r.id === place.roomId));
  if (!model || !place || hasRoom) {
```

The rest of `BindTools` is unchanged.

- [ ] **Step 5: `FloorCard`: the line from the Places heading**

In `packages/editor/src/home/FloorCard.tsx`:

- Add `import { useMemo } from "react";`, `import { onMapLine, placeRows } from "../places/rows";` and `import { useEditorStore } from "../state/store";`.
- Inside `FloorCard`, before `return`:

```tsx
  const model = useEditorStore(s => s.model);
  // The Places tab's heading, repeated here (spec §4). No report is needed:
  // being on the map is about rooms, not about photos that disagree.
  const places = useMemo(() => (model ? placeRows(model, null, level.id) : []), [model, level.id]);
  const onMap = places.filter(r => r.onMap).length;
```

- Between the Build `<Bar …/>` and the next-step `<p>`, add:

```tsx
      {places.length > 0 && <p className="text-xs text-stone-600">{onMapLine(onMap, places.length)}</p>}
```

- [ ] **Step 6: Run the tests and typecheck**

Run: `timeout 300 npx vitest run packages/editor/src/build packages/editor/src/home packages/editor/src/places --poolOptions.threads.maxThreads=2 --poolOptions.threads.minThreads=1`
Expected: PASS, and every existing BuildWorkspace and BindPlaces test still passes.

Run: `npx tsc -b packages/editor`
Expected: no errors, and no unused imports left in `BuildWorkspace.tsx`.

- [ ] **Step 7: Commit**

```bash
git commit --only -m "feat(editor): Places' links land, a room's deletion no longer strands its place

Build reads ?place= from the Places tab's Bind it once, putting that place in
hand as its to-do item would. Bind places offers again a place whose room was
deleted, which it never did: deleting a room leaves its place pointing at it.
The Floors home card repeats the Places heading. Build's report refresh is now
the shared recheck.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- packages/editor/src/build/BuildWorkspace.tsx packages/editor/src/build/BuildWorkspace.test.tsx packages/editor/src/build/BindPlaces.tsx packages/editor/src/build/BindPlaces.test.tsx packages/editor/src/home/FloorCard.tsx packages/editor/src/home/FloorsHome.test.tsx
```

---

## Shipping A (the controller, after Task 5, and again after Task 8)

This is not an implementation task. Spec §8 ends each part with this checklist.

1. **Run the tests and typechecks.**
   - Run each folder throttled: `packages/model/src/geometry`, `packages/renderer`, and `packages/editor/src/{places,plan,build,state,shell,home,floor}` with `route.test.tsx`.
   - Run `npx tsc -b packages/model packages/renderer packages/editor`.
   - Run the whole suite once, as the controller's checkpoint.
2. **Check on the sandbox.** Use a :3055 copy of the dev DB, never :3000 (see the `oth-ux-audit-sandbox` memory).
   - **L1, Build.**
     - Names show on the plan, with ✓ on bound confirmed places and grey drawing names.
     - Zooming out thins them, and no label overlaps a neighbour at the default fit.
   - **Click a bound room.**
     - The card shows the place, "Confirmed by …", and a readable sign with its box.
     - ← → steps through the frames.
     - **Open in Survey** opens that frame.
   - **Turn on 3D.**
     - The active floor's names float on the rooms.
     - Orbiting thins and restores them.
     - A label never covers a toast or a dialog.
     - Clicking a room through a label selects it.
   - **After Task 8, the Places tab on L1.**
     - The heading counts against the 30 confirmed places.
     - The *165 waiting in Review →* line.
     - **Show on map** lands on the room with its card open.
     - **Bind it** lands on Bind places with the place in hand.
3. **Deploy to Railway.** Add one line to the teammate note: *Names on the map, click a room to see its photo, and a Places tab listing what is missing.*
