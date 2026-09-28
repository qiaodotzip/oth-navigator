# Whole-floor 3D export (Plan 6B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add **Download 3D model** beside **3D** in Build. It writes one floor, or every floor stacked, as one `.glb` of named parts built from the preview's own geometry, and it replaces *Export context for Blender*.

**Architecture:**
- **Task 1** moves the few pieces the preview still builds inside React components (a room's floor and colour, wall and rail blocks, the portal, rail and strip paint) into pure functions. The components and the export then call the same code.
- **Export module.** `renderer/src/export/` writes that geometry into a glTF document with `@gltf-transform/core`, so the export is a pure function returning bytes and is tested in Node.
- **Objects.** Uploaded models are copied into the file once and instanced per object. The Objects group is last, because it needs Plan 6A's object kinds.

**Tech Stack:** TypeScript 5.9, `@gltf-transform/core` 4.5 (already a renderer dependency), three.js 0.169 (geometry only), React 18 with zustand (editor), zod (`@oth/model`), Vitest 1.6, Playwright from `my_library` (the sandbox check only).

**Spec:** `docs/design-and-plans/specs/2026-09-28-guided-setup-objects-and-export-design.md` §6 (this plan), with §5.3 and §9 for the object data. Shared names: `.superpowers/sdd/2026-09-28-plan6/interfaces.md`, "Renderer — 6B".

## Global Constraints

- **Tests** run only through `bash .superpowers/run-tests.sh vitest <paths>` and `bash .superpowers/run-tests.sh tsc <pkg dirs>`, folder-scoped. Builds take `.superpowers/test.lock` by hand. Parallel runs crashed the laptop.
- **Commits:** `git commit --only -m "…" -- <paths>`, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never `git add -A`, never bare `git stash`.
- **Screenshots** only on a sandbox copy of the dev database on a spare port, never :3000 or the main checkout's data. Playwright is required by absolute path from `C:/Users/qhuip/Repositories/my_library/node_modules/playwright`.
- **Copy style:** short, plain sentences like the existing app. No emoji. Buttons say what they do.
- **Worktree.** Work in `C:\Users\qhuip\Repositories\oth_navigation\.claude\worktrees\ux-overhaul`, on branch `ux-overhaul`. Plans 6A, 6C and 6D run in this worktree at the same time:
  - Touch only the files your task lists, and stage new files by path (`git add <path>`) before `git commit --only`. `.superpowers/` stays unstaged.
  - If git reports `index.lock`, wait and retry. Never delete it.
  - Some files are shared: `packages/renderer/src/index.ts` is append-only, and `BuildWorkspace.tsx` gets one import and one element. Before committing a shared file, run `git diff -- <file>`. If it holds lines that are not your task's, stop and tell the controller rather than commit them.
- **Heavy runs by hand.** A build (`npm run build -w @oth/editor`, `npx tsc -b packages/renderer`) or a Playwright run takes the lock by hand, from the worktree root: `until mkdir .superpowers/test.lock 2>/dev/null; do sleep 15; done`, then the command, then `rm -rf .superpowers/test.lock`.
- **Typecheck.** TypeScript 5.9 is strict, with `noUncheckedIndexedAccess`, `noUnusedLocals` and `noUnusedParameters`. Under 5.9 a `Uint8Array<ArrayBufferLike>` is not a `BlobPart`, so give `Blob` a copied `ArrayBuffer`. The editor's typecheck reads the renderer's declarations from `packages/renderer/dist`. If it reports a renderer export this plan added as missing (TS2305 or TS6305), rebuild them with the lock held: `npx tsc -b packages/renderer`.
- **The contract.** `packages/renderer/src/export/floorGlb.ts` exports `buildFloorGlb(model: MapModel, levelIds: string[], assetBytes: (assetId: string) => Promise<Uint8Array | null>): Promise<Uint8Array>`, built with `@gltf-transform/core`, never three's `GLTFExporter`. From 6A this plan uses only these names: `ObjectKind`, `ObjectKindSchema`, `model.objectKinds`, the placement's optional `assetId` and `objectKindId`, `placementModelAsset(model, placement)`, and `objectBoxGeometry(size)` in `packages/renderer/src/objectBox.ts`.
- **No new dependencies.** In particular, not `@gltf-transform/functions`: it pulls in `sharp`, a native image library, for features this plan doesn't use. Task 5 copies models between documents with core's own `Property.copy`.
- **IO.** The export reads and writes with core's `WebIO`. `NodeIO`'s constructor imports `node:fs`, which the editor's browser can't. `WebIO` only fetches for files that point outside themselves, which a `.glb` never does, so it behaves the same in Node tests.
- **The node tree** (spec §6). A scene named after the building holds one node per floor, named by its code (`L1`) and in ordinal order. Under each floor, always in this order: `Floors`, `Walls`, `Voids`, `Stops`, `Objects`, `Pathways`.
  - Every part is named after its thing: the English name, or the id when the name is blank.
  - Each part's `extras.othId` holds the id, which Blender keeps as a custom property.
- **Built from the preview's own geometry** (spec §6). The export calls `roomFloorGeometry`, `levelStructure`, `wallBlock`, `railBlock`, `portalParts`, `shaftBlocks`, `stripQuads`, `blocksGeometry`, `quadsGeometry`, `roomTints`, `roomsToDraw` and 6A's `objectBoxGeometry`. It never copies them.
- **Walls are always full height in the file** (spec §6): `wallTop(piece, heights, true)`.
- **Units, origin and axes** as today's context export (spec §6): metres, Y up, north is −Z, and the building origin at floor level.
  - One floor alone sits at y = 0, as the context export put it.
  - Several floors are each raised to their `elevationM` ("all floors are stacked at their elevations").
  - Each floor node's extras record its elevation either way.
  - The generator is `OTH map editor. <note>`, where the note is `CONTEXT_ORIGIN_NOTE` for one floor and `CONTEXT_ORIGIN_NOTE` followed by `STACKED_NOTE` for several. The copyright holds the note alone.
  - gltf-transform 4.5's writer keeps a generator set on the asset. Its reader drops it, so tests read the raw JSON with `binaryToJSON`.
- **Materials** take the preview's colours, converted from sRGB to glTF's linear space, and parts with one paint share one material.
  - Metallic is 0 and roughness 1, which are three's standard-material defaults. glTF's default metallic of 1 renders dark.
  - See-through parts blend at the preview's opacity: shafts 0.45, balustrades 0.6, strips 0.7.
  - Walls, rails, shafts, flights and strips are double-sided, as in the preview.
  - Normals are left out. Every preview piece is flat-shaded, and a loader given no normals must compute flat ones.
- **Not exported:** text labels, the entrance and stop marker poles, selection colours and the ghosted floor below.
- **File names:** `oth-<floor code>.glb` and `oth-all-floors.glb` (spec §6).

## Review Focus

1. **A whole floor, or all of them.**
   - L1 has about 200 rooms and 2,500 wall edges, and **All floors** builds every floor at once in the browser.
   - The file must stay a few MB, with one material per paint rather than one per room.
   - Pinned in Task 3 by a 400-room grid: 400 floors, 2 materials, under 3 MB.
2. **A model that won't come.** The causes: a 404, a dropped connection, a fetcher that throws, bytes that aren't a `.glb`, or a model that needs an extension (Draco).
   - The download must still happen.
   - The object falls back to its kind's box, or stays as an empty named node.
   - The file lists the object under `extras.othExport.missingModels`, and the message after the download counts it.
   - Pinned in Tasks 5, 6 and 8.
3. **Names people didn't give, or gave twice.** Unnamed rooms, pathways and portals, a name that is only spaces, and two rooms called "Toilet".
   - Every node needs a name.
   - Each node keeps its id in `extras.othId`, so Blender's "Toilet.001" still says which room it is.
   - Pinned in Task 2.
4. **Deleted things, and other floors' things.** Soft-deleted rooms, pathways, portals, placements and levels, and ids the model doesn't know, build nothing and don't throw. Pinned in Tasks 2, 3, 4 and 8.
5. **Which floors, in which order.** Floors come out lowest first, each at its elevation, whatever order they were asked for in. A floor with nothing drawn still has its six groups, and a list of no floors still writes a readable file. Pinned in Task 2.

## Hook-ins to other plans' files

| File | Task | Edit |
|---|---|---|
| `renderer/src/RoomMesh.tsx` (5D) | 1 | The floor's geometry and colour come from `levelParts.ts`. Behaviour unchanged. |
| `renderer/src/StructureMesh.tsx` (5D) | 1 | Wall and rail blocks come from `levelParts.ts`, and the rail's paint from `voids.ts`. Behaviour unchanged. |
| `renderer/src/PortalMesh.tsx` (5D) | 1 | Its colours move to `portals.ts`. Behaviour unchanged. |
| `renderer/src/Pathways.tsx` (5D) | 1 | Its height and opacity move to `pathwayStrips.ts`. Behaviour unchanged. |
| `renderer/src/{portals,voids,pathwayStrips}.ts` (5D) | 1 | Each gains exported paint constants. `portals.ts` and `pathwayStrips.ts` also gain one function each. Nothing else changes. |
| `renderer/src/index.ts` (shared) | 2 | Append `export * from "./export/floorGlb";`. |
| `editor/src/build/BuildWorkspace.tsx` (shared) | 6 | One import, and `<DownloadModelButton api={api} />` right after `<PreviewToggle … />`. |
| `editor/src/build/StepTools.tsx` | 7 | `ContextExportButton` comes out of `DressingTools`. |
| `renderer/src/contextExport.ts` | 7 | `buildContextGlb` is deleted. `CONTEXT_ORIGIN_NOTE`, `buildDetailGlb` and `detailContextRooms` stay. |
| `renderer/src/walls.ts`, `README.md` | 7 | A comment, and step 1 of the Blender round trip. |
| `renderer/src/PlacementMesh.tsx` (6A may have edited it) | 8 | The transform comes from `placementTransform`. This task runs only after 6A is merged. |

**For 6E:** `DownloadModelButton({ api, levelId? })` in `packages/editor/src/build/DownloadModel.tsx` is the wizard's Finish-step button. Pass the floor being set up as `levelId`.

## File structure

| File | Responsibility |
|---|---|
| `renderer/src/levelParts.ts` | The preview's floor, wall and rail pieces as pure functions (Task 1). |
| `renderer/src/export/gltfWrite.ts` | `GlbWriter` puts three.js geometry into a glTF document, paints it with materials from the preview's colours, and writes the file's note (Task 2). |
| `renderer/src/export/floorGlb.ts` | `buildFloorGlb`: the node tree, with one builder per group (Tasks 2, 3, 4 and 8). |
| `renderer/src/export/modelCopy.ts` | An uploaded model, copied into the file once and placed any number of times (Task 5). |
| `renderer/src/export/testing.ts` | Test-only: the two-floor fixture, `.glb` readers, and a tiny model (Tasks 2 and 5). |
| `renderer/src/placementTransform.ts` | Where a placement stands in three.js terms, for the preview and the file (Task 8). |
| `editor/src/ui/download.ts` | Saves bytes as a file (Task 6). |
| `editor/src/build/DownloadModel.tsx` | The button, its two choices, and fetching the models (Task 6). |

Deleted in Task 7: `editor/src/panels/ContextExportButton.tsx` and `buildContextGlb`.

## Order and ship point

| Group | Tasks | Notes |
|---|---|---|
| A | **1** The preview's pieces as pure functions | First. |
| B | **2** The file, its floors and its note | Needs 1. |
| C (side by side) | **3** Walls and voids · **5** A model copied into the file | 3 needs 2. 5 needs only 2's `export/testing.ts`, and the two touch different files. |
| D | **4** Stops and pathways | Needs 3: they edit the same file. |
| E | **6** Download 3D model | Needs 4 and 5, so the sandbox check sees every group but Objects. |
| F | **7** Retire *Export context for Blender* | Needs 6, so there is always an export. |
| | **— Wait for Plan 6A to be merged —** | |
| G | **8** Objects | **Needs 6A merged.** |
| | **— Ships after Task 8, with 6A —** | |

---

### Task 1: The preview's pieces as pure functions

A room's floor and colour, the wall and rail blocks, and the paint of shafts, flights, rails and strips are still worked out inside `RoomMesh`, `StructureMesh`, `PortalMesh` and `Pathways`. This task moves each into a pure function or an exported constant. The components call them with no change in behaviour, and the export (Tasks 2–4) calls the same ones. The tests pin the values the components used before, so nothing drifts.

**Files:**
- Create: `packages/renderer/src/levelParts.ts`
- Create: `packages/renderer/src/levelParts.test.ts`
- Modify: `packages/renderer/src/portals.ts` (after `SHAFT_WALL_M`)
- Modify: `packages/renderer/src/voids.ts` (after `BALUSTRADE_THICKNESS_M`)
- Modify: `packages/renderer/src/pathwayStrips.ts`
- Modify: `packages/renderer/src/RoomMesh.tsx`
- Modify: `packages/renderer/src/StructureMesh.tsx`
- Modify: `packages/renderer/src/PortalMesh.tsx`
- Modify: `packages/renderer/src/Pathways.tsx`

**Interfaces:**
- Consumes: `roomGeometry`, `SLAB_HEIGHT_M` (`geometry.ts`); `massingOf` (`massing.ts`); `wallTop`, `LOW_WALL_M` (`structure.ts`); `roomColor` (`theme.ts`); `BALUSTRADE_HEIGHT_M`, `type Rail` (`voids.ts`); `type WallPiece` (`wallPlan.ts`); `type Block` (`blocks.ts`).
- Produces:
  - `levelParts.ts`:
    - `roomFloorGeometry(room: Room, extraHoles?: Room["holes"]): THREE.ExtrudeGeometry`
    - `floorColour(kind: RoomKind, opts?: { tint?: string; selected?: boolean; ghosted?: boolean }): string`
    - `wallBlock(piece: WallPiece, heights: ReadonlyMap<string, number>, fullHeight: boolean): Block`
    - `railBlock(rail: Rail): Block`
  - `portals.ts`: `PORTAL_COLOUR = { shaft: "#7c93b5", escalator: "#8d99a6", stair: "#b9ae96" }`, `SHAFT_OPACITY = 0.45`, `flightColour(kind: PortalKind): string`.
  - `voids.ts`: `BALUSTRADE_COLOUR = "#9fb3c8"`, `BALUSTRADE_OPACITY = 0.6`.
  - `pathwayStrips.ts`: `STRIP_HEIGHT_M = SLAB_HEIGHT_M + 0.02`, `STRIP_OPACITY = 0.7`, `pathwayColour(pathway: Pathway, kinds: readonly PathwayKind[]): string`.

- [ ] **Step 1: Write the failing tests**

`packages/renderer/src/levelParts.test.ts`:

```ts
import { PathwayKindSchema, PathwaySchema, RoomSchema } from "@oth/model";
import type * as THREE from "three";
import { describe, expect, it } from "vitest";
import { SLAB_HEIGHT_M, roomGeometry } from "./geometry";
import { floorColour, railBlock, roomFloorGeometry, wallBlock } from "./levelParts";
import { DEFAULT_PATHWAY_COLOUR, STRIP_HEIGHT_M, STRIP_OPACITY, pathwayColour } from "./pathwayStrips";
import { PORTAL_COLOUR, SHAFT_OPACITY, flightColour } from "./portals";
import { LOW_WALL_M } from "./structure";
import { roomColor } from "./theme";
import { BALUSTRADE_COLOUR, BALUSTRADE_HEIGHT_M, BALUSTRADE_OPACITY } from "./voids";
import type { WallPiece } from "./wallPlan";

const sq = (x0: number, y0: number, x1: number, y1: number): Array<[number, number]> =>
  [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const hall = RoomSchema.parse({ id: "L1-hall", levelId: "oth-L1", kind: "area", footprint: sq(0, 0, 20, 10), heightM: 6, walkable: true });
const bench = RoomSchema.parse({ id: "L1-bench", levelId: "oth-L1", kind: "detail", footprint: sq(1, 1, 3, 2), heightM: 0.9 });
const round = (n: number) => Math.round(n * 1000) / 1000 + 0;

function top(geometry: THREE.BufferGeometry): number {
  geometry.computeBoundingBox();
  return geometry.boundingBox!.max.y;
}

describe("roomFloorGeometry", () => {
  it("builds a room's floor as a slab", () => {
    expect(top(roomFloorGeometry(hall))).toBeCloseTo(SLAB_HEIGHT_M);
  });

  it("builds a detail as a solid block as tall as it is", () => {
    expect(top(roomFloorGeometry(bench))).toBeCloseTo(0.9);
  });

  it("cuts the level's voids out of the slab", () => {
    const position = roomFloorGeometry(hall, [sq(4, 4, 8, 8)]).getAttribute("position");
    const corners = new Set<string>();
    for (let i = 0; i < position.count; i++) corners.add(`${round(position.getX(i))},${round(position.getZ(i))}`);
    // North is -Z, so the hole's corner (4, 4) is at z = -4.
    expect(corners).toContain("4,-4");
    expect(corners).toContain("8,-8");
  });

  it("is the room's own slab when there is nothing to cut", () => {
    expect(roomFloorGeometry(hall).getAttribute("position").count).toBe(roomGeometry(hall).getAttribute("position").count);
  });
});

describe("floorColour", () => {
  it("paints a bound room in its place's tint", () => {
    expect(floorColour("room", { tint: "#f2d59b" })).toBe("#f2d59b");
  });

  it("paints an unbound room in its kind's colour", () => {
    expect(floorColour("area")).toBe(roomColor("area"));
  });

  it("lets the selection and the ghosted floor below win over the tint, as the preview did", () => {
    expect(floorColour("room", { tint: "#f2d59b", selected: true })).toBe(roomColor("room", { selected: true }));
    expect(floorColour("room", { tint: "#f2d59b", ghosted: true })).toBe(roomColor("room", { ghosted: true }));
  });
});

describe("wallBlock and railBlock", () => {
  const heights = new Map([["L1-shop", 3.5], ["L1-cafe", 4]]);
  const piece: WallPiece = { a: [0, 0], b: [4, 0], thicknessM: 0.2, rooms: ["L1-shop", "L1-cafe"] };

  it("stands a wall 1.2 m high on the floor, on its own line", () => {
    expect(wallBlock(piece, heights, false)).toEqual({ a: [0, 0], b: [4, 0], thicknessM: 0.2, baseM: 0, topM: LOW_WALL_M });
  });

  it("stands it as tall as the taller room at full height", () => {
    expect(wallBlock(piece, heights, true).topM).toBe(4);
  });

  it("stands a balustrade 1.1 m high", () => {
    expect(railBlock({ a: [0, 0], b: [1, 0], thicknessM: 0.08, rooms: ["L1-atrium"] }))
      .toEqual({ a: [0, 0], b: [1, 0], thicknessM: 0.08, baseM: 0, topM: BALUSTRADE_HEIGHT_M });
  });
});

describe("the preview's paint, now shared with the export", () => {
  it("keeps the colours and opacities the components had", () => {
    expect(PORTAL_COLOUR).toEqual({ shaft: "#7c93b5", escalator: "#8d99a6", stair: "#b9ae96" });
    expect(SHAFT_OPACITY).toBe(0.45);
    expect(BALUSTRADE_COLOUR).toBe("#9fb3c8");
    expect(BALUSTRADE_OPACITY).toBe(0.6);
    expect(STRIP_OPACITY).toBe(0.7);
    expect(STRIP_HEIGHT_M).toBeCloseTo(SLAB_HEIGHT_M + 0.02);
  });

  it("paints escalators grey, and stairs and ramps as stone", () => {
    expect(flightColour("escalator")).toBe(PORTAL_COLOUR.escalator);
    expect(flightColour("stair")).toBe(PORTAL_COLOUR.stair);
    expect(flightColour("ramp")).toBe(PORTAL_COLOUR.stair);
  });

  it("paints a pathway in its kind's colour, or the plan's blue when it has none", () => {
    const kinds = [PathwayKindSchema.parse({ id: "pk-concourse", nameEn: "Concourse", colorHex: "#f97316" })];
    const kinded = PathwaySchema.parse({ id: "p1", levelId: "oth-L1", polyline: [[0, 0], [1, 0]], kindId: "pk-concourse" });
    const plain = PathwaySchema.parse({ id: "p2", levelId: "oth-L1", polyline: [[0, 0], [1, 0]] });
    expect(pathwayColour(kinded, kinds)).toBe("#f97316");
    expect(pathwayColour(plain, kinds)).toBe(DEFAULT_PATHWAY_COLOUR);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bash .superpowers/run-tests.sh vitest packages/renderer/src/levelParts.test.ts`
Expected: FAIL with `Failed to resolve import "./levelParts"`.

- [ ] **Step 3: Write `levelParts.ts`**

```ts
import type { Room, RoomKind } from "@oth/model";
import type * as THREE from "three";
import type { Block } from "./blocks";
import { roomGeometry } from "./geometry";
import { massingOf } from "./massing";
import { wallTop } from "./structure";
import { roomColor } from "./theme";
import { BALUSTRADE_HEIGHT_M, type Rail } from "./voids";
import type { WallPiece } from "./wallPlan";

/*
 * The pieces of one level as the preview builds them, as plain functions, so
 * the 3D export (export/floorGlb.ts) builds exactly what the preview shows
 * rather than a copy that drifts from it.
 */

const NO_HOLES: Room["holes"] = [];

/**
 * A room's floor: its slab with the level's voids cut out of it, or a
 * detail's whole solid block, since `massingOf` says a detail builds its
 * full height.
 */
export function roomFloorGeometry(room: Room, extraHoles: Room["holes"] = NO_HOLES): THREE.ExtrudeGeometry {
  return roomGeometry(
    extraHoles.length > 0 ? { ...room, holes: [...room.holes, ...extraHoles] } : room,
    massingOf(room) === "solid" ? { slabHeightM: room.heightM } : {},
  );
}

/** A floor's colour: its place's tint, unless the room is selected or on the ghosted floor below. */
export function floorColour(
  kind: RoomKind,
  opts: { tint?: string; selected?: boolean; ghosted?: boolean } = {},
): string {
  return opts.tint && !opts.selected && !opts.ghosted ? opts.tint : roomColor(kind, opts);
}

/** A wall standing on the floor: 1.2 m high, or at full height as tall as the taller room it encloses. */
export function wallBlock(piece: WallPiece, heights: ReadonlyMap<string, number>, fullHeight: boolean): Block {
  return { a: piece.a, b: piece.b, thicknessM: piece.thicknessM, baseM: 0, topM: wallTop(piece, heights, fullHeight) };
}

/** A void's balustrade standing on the floor. */
export function railBlock(rail: Rail): Block {
  return { a: rail.a, b: rail.b, thicknessM: rail.thicknessM, baseM: 0, topM: BALUSTRADE_HEIGHT_M };
}
```

- [ ] **Step 4: Move the paint into the pure modules**

In `packages/renderer/src/portals.ts`, right after the `SHAFT_WALL_M` line, add:

```ts
/** What lifts and flights are painted with, in the preview (PortalMesh) and the export. */
export const PORTAL_COLOUR = { shaft: "#7c93b5", escalator: "#8d99a6", stair: "#b9ae96" } as const;
/** A shaft is see-through, so the lift inside it shows. */
export const SHAFT_OPACITY = 0.45;

/** A flight's colour: an escalator's grey, or the stone of stairs and ramps. */
export function flightColour(kind: PortalKind): string {
  return kind === "escalator" ? PORTAL_COLOUR.escalator : PORTAL_COLOUR.stair;
}
```

In `packages/renderer/src/voids.ts`, right after the `BALUSTRADE_THICKNESS_M` line, add:

```ts
/** A grey-blue a shade off the walls, so a balustrade reads as a rail and not a wall. */
export const BALUSTRADE_COLOUR = "#9fb3c8";
/** Glass: see-through, but there. */
export const BALUSTRADE_OPACITY = 0.6;
```

In `packages/renderer/src/pathwayStrips.ts`, replace:

```ts
import { live, type MapModel, type Pathway, type PathwayKind, type Vec2 } from "@oth/model";

/** The plan's colour for a pathway with no kind (PathwayShape's default). */
export const DEFAULT_PATHWAY_COLOUR = "#38bdf8";
```

with:

```ts
import { live, type MapModel, type Pathway, type PathwayKind, type Vec2 } from "@oth/model";
import { SLAB_HEIGHT_M } from "./geometry";

/** The plan's colour for a pathway with no kind (PathwayShape's default). */
export const DEFAULT_PATHWAY_COLOUR = "#38bdf8";
/** Just above the floor slabs, so a strip is never lost in them. */
export const STRIP_HEIGHT_M = SLAB_HEIGHT_M + 0.02;
/** See-through enough to show the floor's tint under it. */
export const STRIP_OPACITY = 0.7;
```

Then replace:

```ts
function colourOf(pathway: Pathway, kinds: readonly PathwayKind[]): string {
  return kinds.find(k => k.id === pathway.kindId)?.colorHex ?? DEFAULT_PATHWAY_COLOUR;
}
```

with:

```ts
/** A pathway's colour: its kind's, or the plan's default blue. */
export function pathwayColour(pathway: Pathway, kinds: readonly PathwayKind[]): string {
  return kinds.find(k => k.id === pathway.kindId)?.colorHex ?? DEFAULT_PATHWAY_COLOUR;
}
```

and, in `pathwayStrips`, replace `const colour = colourOf(pathway, kinds);` with `const colour = pathwayColour(pathway, kinds);`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `bash .superpowers/run-tests.sh vitest packages/renderer/src/levelParts.test.ts`
Expected: PASS.

- [ ] **Step 6: Point the components at the shared pieces**

`packages/renderer/src/RoomMesh.tsx`: replace the line `import { roomGeometry } from "./geometry";` with `import { floorColour, roomFloorGeometry } from "./levelParts";`. Then replace:

```tsx
  const floor = useMemo(
    () => roomGeometry(
      extraHoles.length > 0 ? { ...room, holes: [...room.holes, ...extraHoles] } : room,
      massing === "solid" ? { slabHeightM: room.heightM } : {},
    ),
    [room, massing, extraHoles],
  );
```

with:

```tsx
  const floor = useMemo(() => roomFloorGeometry(room, extraHoles), [room, extraHoles]);
```

and replace `color={tint && !selected && !ghosted ? tint : roomColor(room.kind, { selected, ghosted })}` with `color={floorColour(room.kind, { tint, selected, ghosted })}`. `roomColor` and `wallColor` stay imported, because the walls still use them.

`packages/renderer/src/StructureMesh.tsx`: replace its imports with:

```tsx
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { blocksGeometry } from "./blocks";
import { railBlock, wallBlock } from "./levelParts";
import type { LevelStructure } from "./structure";
import { roomColor, wallColor } from "./theme";
import { BALUSTRADE_COLOUR, BALUSTRADE_OPACITY } from "./voids";
import type { WallPiece } from "./wallPlan";
```

Delete the line `const BALUSTRADE_COLOUR = "#9fb3c8";` and its comment. Replace:

```tsx
    const block = (w: WallPiece): Block => ({ ...w, baseM: 0, topM: wallTop(w, structure.heightByRoom, fullHeight) });
```

with:

```tsx
    const block = (w: WallPiece) => wallBlock(w, structure.heightByRoom, fullHeight);
```

Replace:

```tsx
  const rails = useMemo(
    () => blocksGeometry(structure.balustrades.map(r => ({ ...r, baseM: 0, topM: BALUSTRADE_HEIGHT_M }))),
    [structure],
  );
```

with:

```tsx
  const rails = useMemo(() => blocksGeometry(structure.balustrades.map(railBlock)), [structure]);
```

And in the rail's material, replace `opacity={ghosted ? 0.2 : 0.6}` with `opacity={ghosted ? 0.2 : BALUSTRADE_OPACITY}`.

`packages/renderer/src/PortalMesh.tsx`, the whole file:

```tsx
import type { MapModel } from "@oth/model";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { blocksGeometry } from "./blocks";
import { PORTAL_COLOUR, SHAFT_OPACITY, portalParts, shaftBlocks } from "./portals";

/**
 * A level's lift shafts and the flights that climb from it.
 * The file is not `Portals.tsx`: on a case-insensitive disk that and
 * `portals.ts` are one import, as `Markers.tsx` and `markers.ts` were.
 *
 * A flight's top step is level with the floor it arrives on, so where that
 * floor's slab reaches over it the two faces lie in one plane. The flights
 * are pulled forward in depth to win there, as the selected walls are.
 */
export function Portals({ model, levelId, ghosted = false }: { model: MapModel; levelId: string; ghosted?: boolean }) {
  const parts = useMemo(() => portalParts(model, levelId), [model, levelId]);
  const geometries = useMemo(() => ({
    shafts: blocksGeometry(parts.shafts.flatMap(shaftBlocks)),
    escalators: blocksGeometry(parts.flights.filter(f => f.kind === "escalator").flatMap(f => f.steps)),
    stairs: blocksGeometry(parts.flights.filter(f => f.kind !== "escalator").flatMap(f => f.steps)),
  }), [parts]);
  useEffect(() => () => Object.values(geometries).forEach(g => g.dispose()), [geometries]);

  return (
    <group>
      <mesh geometry={geometries.shafts}>
        <meshStandardMaterial color={PORTAL_COLOUR.shaft} transparent opacity={ghosted ? 0.2 : SHAFT_OPACITY} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <mesh geometry={geometries.escalators} castShadow receiveShadow>
        <meshStandardMaterial
          color={PORTAL_COLOUR.escalator} transparent={ghosted} opacity={ghosted ? 0.35 : 1} side={THREE.DoubleSide}
          polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-1}
        />
      </mesh>
      <mesh geometry={geometries.stairs} castShadow receiveShadow>
        <meshStandardMaterial
          color={PORTAL_COLOUR.stair} transparent={ghosted} opacity={ghosted ? 0.35 : 1} side={THREE.DoubleSide}
          polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-1}
        />
      </mesh>
    </group>
  );
}
```

`packages/renderer/src/Pathways.tsx`, the whole file:

```tsx
import type { MapModel } from "@oth/model";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { quadsGeometry } from "./blocks";
import { STRIP_HEIGHT_M, STRIP_OPACITY, pathwayStrips } from "./pathwayStrips";

export function Pathways({ model, levelId }: { model: MapModel; levelId: string }) {
  const strips = useMemo(
    () => pathwayStrips(model, levelId).map(s => ({ colour: s.colour, geometry: quadsGeometry(s.quads, STRIP_HEIGHT_M) })),
    [model, levelId],
  );
  useEffect(() => () => strips.forEach(s => s.geometry.dispose()), [strips]);
  return (
    <>
      {strips.map(s => (
        <mesh key={s.colour} geometry={s.geometry} receiveShadow>
          <meshStandardMaterial color={s.colour} transparent opacity={STRIP_OPACITY} side={THREE.DoubleSide} polygonOffset polygonOffsetFactor={-1} />
        </mesh>
      ))}
    </>
  );
}
```

- [ ] **Step 7: Run the renderer's tests and typecheck**

Run: `bash .superpowers/run-tests.sh vitest packages/renderer/src`
Expected: PASS, including the existing `structure`, `portals`, `pathwayStrips` and `voids` suites.

Run: `bash .superpowers/run-tests.sh tsc packages/renderer`
Expected: no errors. Nothing is left unused: `roomGeometry` in `RoomMesh`, and `Block`, `wallTop` and `BALUSTRADE_HEIGHT_M` in `StructureMesh`, are gone from the imports.

- [ ] **Step 8: Commit**

```bash
git add packages/renderer/src/levelParts.ts packages/renderer/src/levelParts.test.ts
git commit --only -m "refactor(renderer): the preview's floors, walls, rails and paint come from pure functions the export can call" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- packages/renderer/src/levelParts.ts packages/renderer/src/levelParts.test.ts packages/renderer/src/portals.ts packages/renderer/src/voids.ts packages/renderer/src/pathwayStrips.ts packages/renderer/src/RoomMesh.tsx packages/renderer/src/StructureMesh.tsx packages/renderer/src/PortalMesh.tsx packages/renderer/src/Pathways.tsx
```

---

### Task 2: The file, its floors and its note

`GlbWriter` turns three.js geometry into glTF meshes with shared, linear-colour materials. `buildFloorGlb` then lays out the scene: one node per floor, stacked when there are several, the six groups under each, and the Floors group filled.

**Files:**
- Create: `packages/renderer/src/export/gltfWrite.ts`
- Create: `packages/renderer/src/export/gltfWrite.test.ts`
- Create: `packages/renderer/src/export/floorGlb.ts`
- Create: `packages/renderer/src/export/floorGlb.test.ts`
- Create: `packages/renderer/src/export/testing.ts`
- Modify: `packages/renderer/src/index.ts` (append one line)

**Interfaces:**
- Consumes: Task 1's `roomFloorGeometry` and `floorColour`; `roomsToDraw` (`LevelGroup.tsx`); `roomTints` and `CATEGORY_TINT` (`categoryTint.ts`); `levelStructure` (`structure.ts`); `massingOf`; `modelToThree`; `CONTEXT_ORIGIN_NOTE` (`contextExport.ts`).
- Produces:
  - `gltfWrite.ts`:
    - `type Paint = { name: string; colour: string; opacity?: number; doubleSided?: boolean }`
    - `class GlbWriter` with:
      - `readonly doc: Document`
      - `material(paint: Paint): Material`
      - `geometryMesh(name: string, geometry: THREE.BufferGeometry, paint: Paint): Mesh | null`
      - `mesh(name: string, geometry: THREE.BufferGeometry, paint: Paint): Node | null`
      - `setNote(note: string, extras: Record<string, unknown>): void`
      - `write(): Promise<Uint8Array>`
  - `floorGlb.ts`:
    - `buildFloorGlb(model: MapModel, levelIds: string[], assetBytes: AssetBytes): Promise<Uint8Array>` (the contract; the parameter is `_assetBytes` until Task 8)
    - `type AssetBytes = (assetId: string) => Promise<Uint8Array | null>`
    - `FLOOR_GROUPS = ["Floors", "Walls", "Voids", "Stops", "Objects", "Pathways"] as const`, `type FloorGroup`
    - `STACKED_NOTE`, `floorExportNote(stacked: boolean): string`
    - Internal, used by Tasks 3, 4 and 8:
      - `type FloorContext = { writer; model; level; rooms; roomNames; structure; groups: Record<FloorGroup, Node> }`
      - `label(name, id)`
      - `addFloors(ctx)`
      - `floorContext(writer, scene, model, level, stacked)`
  - `testing.ts`:
    - the fixture: `floorModel`, `DELETED`, `sq`, `noModels`
    - reading a file: `readGlb`, `floorNodes`, `group(doc, floorCode, name)`, `child(node, name)`, `names(node)`
    - checking a part: `bounds(node)`, `worldVertices(node)`, `materialOf(node)`, `linear(hex)`
  - `@oth/renderer` exports everything in `floorGlb.ts`.

- [ ] **Step 1: Write the test helpers**

`packages/renderer/src/export/testing.ts`:

```ts
import { ColorUtils, WebIO, getBounds, type Document, type Material, type Node as GltfNode } from "@gltf-transform/core";
import { parseModel, type MapModel } from "@oth/model";
import type { AssetBytes } from "./floorGlb";

/*
 * Test-only: the fixture every export test builds from, and ways to read a
 * written .glb back. Nothing outside the tests imports this.
 */

export const DELETED = "2026-09-28T00:00:00.000Z";

export const sq = (x0: number, y0: number, x1: number, y1: number): Array<[number, number]> =>
  [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];

const level = (n: number, elevationM: number, heightM: number) => ({
  id: `oth-L${n}`, buildingId: "oth", code: `L${n}`, ordinal: n, nameEn: `Level ${n}`, nameZh: `${n}楼`, elevationM, heightM,
});

/**
 * Two floors and a deleted third.
 * - L1:
 *   - a hall along the south;
 *   - Starbucks (bound to a retail place) and an unnamed café side by side on its north edge;
 *   - a pathway into Starbucks, and an unnamed one in the hall;
 *   - an atrium in the hall, and a bench;
 *   - a lift, and an escalator up to L2.
 * - L2: one shop, and the lift's top stop.
 */
export const floorModel: MapModel = parseModel({
  building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
  levels: [level(1, 0, 6), level(2, 6, 5), { ...level(9, 30, 5), deletedAt: DELETED }],
  rooms: [
    { id: "L1-hall", levelId: "oth-L1", kind: "area", footprint: sq(0, -10, 20, 0), heightM: 6, walkable: true, nameEn: "Hall" },
    { id: "L1-shop", levelId: "oth-L1", kind: "room", footprint: sq(0, 0, 6, 4), heightM: 3.5, nameEn: "Starbucks" },
    { id: "L1-cafe", levelId: "oth-L1", kind: "room", footprint: sq(6, 0, 12, 4), heightM: 4 },
    { id: "L1-atrium", levelId: "oth-L1", kind: "void", footprint: sq(14, -8, 18, -4), heightM: 6, nameEn: "Atrium" },
    { id: "L1-bench", levelId: "oth-L1", kind: "detail", footprint: sq(1, -9, 3, -8), heightM: 0.9, nameEn: "Bench" },
    { id: "L1-gone", levelId: "oth-L1", kind: "room", footprint: sq(0, 10, 4, 14), heightM: 3, nameEn: "Gone", deletedAt: DELETED },
    { id: "L2-shop", levelId: "oth-L2", kind: "room", footprint: sq(0, 0, 6, 4), heightM: 3, nameEn: "Upstairs" },
  ],
  places: [{ id: "pl-sbux", nameEn: "Starbucks", category: "retail", roomId: "L1-shop" }],
  pathwayKinds: [{ id: "pk-concourse", nameEn: "Concourse", colorHex: "#f97316" }],
  pathways: [
    { id: "L1-in", levelId: "oth-L1", polyline: [[2, -5], [2, 2]], widthM: 2, nameEn: "Way in", kindId: "pk-concourse" },
    { id: "L1-east", levelId: "oth-L1", polyline: [[10, -7], [13, -7]], widthM: 1.5 },
    { id: "L1-old", levelId: "oth-L1", polyline: [[9, -5], [9, 2]], widthM: 2, deletedAt: DELETED },
  ],
  portals: [
    { id: "lift-a", kind: "lift", nameEn: "Lift A" },
    { id: "esc-1", kind: "escalator", nameEn: "Escalator 1" },
  ],
  portalEndpoints: [
    { id: "lift-a-1", portalId: "lift-a", levelId: "oth-L1", roomId: "L1-hall", point: [30, 5], footprint: sq(29, 4, 31, 6) },
    { id: "lift-a-2", portalId: "lift-a", levelId: "oth-L2", roomId: "L2-shop", point: [30, 5] },
    { id: "esc-1-1", portalId: "esc-1", levelId: "oth-L1", roomId: "L1-hall", point: [22, -8], footprint: sq(21, -9, 23, -1) },
    { id: "esc-1-2", portalId: "esc-1", levelId: "oth-L2", roomId: "L2-shop", point: [22, -2] },
  ],
});

/** For an export with no placed models to fetch. */
export const noModels: AssetBytes = async () => null;

export const readGlb = (bytes: Uint8Array): Promise<Document> => new WebIO().readBinary(bytes);

/** The file's floor nodes, in order. */
export function floorNodes(doc: Document): GltfNode[] {
  return doc.getRoot().getDefaultScene()?.listChildren() ?? [];
}

/** One floor's group ("Floors", "Walls", …). */
export function group(doc: Document, floorCode: string, name: string): GltfNode {
  const floor = floorNodes(doc).find(n => n.getName() === floorCode);
  const found = floor?.listChildren().find(n => n.getName() === name);
  if (!found) throw new Error(`No ${name} under ${floorCode}`);
  return found;
}

export const names = (node: GltfNode): string[] => node.listChildren().map(n => n.getName());

export function child(node: GltfNode, name: string): GltfNode {
  const found = node.listChildren().find(n => n.getName() === name);
  if (!found) throw new Error(`No ${name} under ${node.getName()}: ${names(node).join(", ")}`);
  return found;
}

/** World-space bounds of a node and everything under it: metres, Y up, north -Z. */
export function bounds(node: GltfNode) {
  const { min, max } = getBounds(node);
  return { minX: min[0], minY: min[1], minZ: min[2], maxX: max[0], maxY: max[1], maxZ: max[2] };
}

/** Every vertex of a node's own mesh, in world space. */
export function worldVertices(node: GltfNode): Array<[number, number, number]> {
  const m = node.getWorldMatrix();
  const out: Array<[number, number, number]> = [];
  for (const primitive of node.getMesh()?.listPrimitives() ?? []) {
    const position = primitive.getAttribute("POSITION");
    if (!position) continue;
    for (let i = 0; i < position.getCount(); i++) {
      const [x = 0, y = 0, z = 0] = position.getElement(i, [0, 0, 0]);
      out.push([
        m[0] * x + m[4] * y + m[8] * z + m[12],
        m[1] * x + m[5] * y + m[9] * z + m[13],
        m[2] * x + m[6] * y + m[10] * z + m[14],
      ]);
    }
  }
  return out;
}

export function materialOf(node: GltfNode): Material {
  const material = node.getMesh()?.listPrimitives()[0]?.getMaterial();
  if (!material) throw new Error(`${node.getName()} has no material`);
  return material;
}

/** A preview colour as the file stores it: linear, from sRGB hex. */
export function linear(hex: string): [number, number, number] {
  return ColorUtils.hexToFactor<[number, number, number]>(Number.parseInt(hex.slice(1), 16), [0, 0, 0]);
}
```

- [ ] **Step 2: Write the failing tests**

`packages/renderer/src/export/gltfWrite.test.ts`:

```ts
import { WebIO } from "@gltf-transform/core";
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { blocksGeometry } from "../blocks";
import { GlbWriter } from "./gltfWrite";
import { linear } from "./testing";

describe("GlbWriter", () => {
  it("writes nothing for an empty geometry, which glTF can't hold", () => {
    expect(new GlbWriter().mesh("nothing", blocksGeometry([]), { name: "wall", colour: "#cdc0a3" })).toBeNull();
  });

  it("gives parts with one paint one material, in glTF's linear colour and not metallic", () => {
    const writer = new GlbWriter();
    const wall = writer.material({ name: "wall", colour: "#cdc0a3", doubleSided: true });
    expect(writer.material({ name: "wall", colour: "#cdc0a3", doubleSided: true })).toBe(wall);
    const [r, g, b, alpha] = wall.getBaseColorFactor();
    const want = linear("#cdc0a3");
    expect(r).toBeCloseTo(want[0], 6);
    expect(g).toBeCloseTo(want[1], 6);
    expect(b).toBeCloseTo(want[2], 6);
    expect(alpha).toBe(1);
    expect(wall.getAlphaMode()).toBe("OPAQUE");
    expect(wall.getMetallicFactor()).toBe(0);
    expect(wall.getDoubleSided()).toBe(true);
  });

  it("blends a see-through paint", () => {
    const glass = new GlbWriter().material({ name: "balustrade", colour: "#9fb3c8", opacity: 0.6 });
    expect(glass.getAlphaMode()).toBe("BLEND");
    expect(glass.getAlpha()).toBeCloseTo(0.6);
  });

  it("keeps an indexed geometry's indices, and writes a readable .glb", async () => {
    const writer = new GlbWriter();
    writer.doc.createScene("s").addChild(writer.mesh("box", new THREE.BoxGeometry(1, 2, 3), { name: "box", colour: "#ffffff" })!);
    const back = await new WebIO().readBinary(await writer.write());
    const primitive = back.getRoot().listMeshes()[0]!.listPrimitives()[0]!;
    expect(primitive.getIndices()?.getCount()).toBe(36);
    expect(primitive.getAttribute("POSITION")?.getMax([0, 0, 0])).toEqual([0.5, 1, 1.5]);
  });

  it("says in the file what made it and where its origin is", async () => {
    const writer = new GlbWriter();
    writer.setNote("Origin here.", { floors: ["L1"] });
    const { json } = await new WebIO().binaryToJSON(await writer.write());
    expect(json.asset.generator).toBe("OTH map editor. Origin here.");
    expect(json.asset.copyright).toBe("Origin here.");
    expect(json.extras).toEqual({ othExport: { note: "Origin here.", floors: ["L1"] } });
  });
});
```

`packages/renderer/src/export/floorGlb.test.ts`:

```ts
import { WebIO, type Material } from "@gltf-transform/core";
import { LevelSchema, PlacementSchema, RoomSchema, type MapModel } from "@oth/model";
import { describe, expect, it } from "vitest";
import { CATEGORY_TINT } from "../categoryTint";
import { CONTEXT_ORIGIN_NOTE } from "../contextExport";
import { SLAB_HEIGHT_M } from "../geometry";
import { roomColor } from "../theme";
import { FLOOR_GROUPS, STACKED_NOTE, buildFloorGlb } from "./floorGlb";
import {
  bounds, child, floorModel, floorNodes, group, linear, materialOf, names, noModels, readGlb, sq, worldVertices,
} from "./testing";

const exported = async (model: MapModel, levelIds: string[]) => readGlb(await buildFloorGlb(model, levelIds, noModels));
const round = (n: number) => Math.round(n * 1000) / 1000 + 0;

function expectColour(material: Material, hex: string) {
  const [r, g, b] = material.getBaseColorFactor();
  const want = linear(hex);
  expect(r).toBeCloseTo(want[0], 5);
  expect(g).toBeCloseTo(want[1], 5);
  expect(b).toBeCloseTo(want[2], 5);
}

describe("buildFloorGlb — the file", () => {
  it("holds one node per floor asked for, each with the spec's six parts in order", async () => {
    const doc = await exported(floorModel, ["oth-L1"]);
    expect(floorNodes(doc).map(n => n.getName())).toEqual(["L1"]);
    expect(names(floorNodes(doc)[0]!)).toEqual(["Floors", "Walls", "Voids", "Stops", "Objects", "Pathways"]);
    expect([...FLOOR_GROUPS]).toEqual(names(floorNodes(doc)[0]!));
  });

  it("stacks every floor at its elevation, lowest first, whatever order they were asked in", async () => {
    const doc = await exported(floorModel, ["oth-L2", "oth-L1"]);
    expect(floorNodes(doc).map(n => n.getName())).toEqual(["L1", "L2"]);
    expect(floorNodes(doc).map(n => n.getTranslation())).toEqual([[0, 0, 0], [0, 6, 0]]);
    expect(bounds(child(group(doc, "L2", "Floors"), "Upstairs")).minY).toBeCloseTo(6);
  });

  it("puts a floor on its own at floor level, as the context export did, and records its elevation", async () => {
    const [floor] = floorNodes(await exported(floorModel, ["oth-L2"]));
    expect(floor!.getTranslation()).toEqual([0, 0, 0]);
    expect(floor!.getExtras()).toEqual({ othId: "oth-L2", elevationM: 6 });
  });

  it("skips a deleted floor or an id it doesn't know, and writes a readable file for no floors at all", async () => {
    expect(floorNodes(await exported(floorModel, ["oth-L9", "oth-nowhere"]))).toEqual([]);
    expect(floorNodes(await exported(floorModel, []))).toEqual([]);
  });

  it("gives a floor with nothing drawn yet its six empty parts", async () => {
    const bare = LevelSchema.parse({ id: "oth-L3", buildingId: "oth", code: "L3", ordinal: 3, nameEn: "Level 3", nameZh: "三楼", elevationM: 11, heightM: 5 });
    const [floor] = floorNodes(await exported({ ...floorModel, levels: [...floorModel.levels, bare] }, ["oth-L3"]));
    expect(names(floor!)).toEqual([...FLOOR_GROUPS]);
    expect(floor!.listChildren().every(g => g.listChildren().length === 0)).toBe(true);
  });

  it("writes the context export's origin note into the generator and the copyright", async () => {
    const one = await buildFloorGlb(floorModel, ["oth-L1"], noModels);
    const { json } = await new WebIO().binaryToJSON(one);
    expect(json.asset.generator).toBe(`OTH map editor. ${CONTEXT_ORIGIN_NOTE}`);
    expect(json.asset.copyright).toBe(CONTEXT_ORIGIN_NOTE);

    const all = await buildFloorGlb(floorModel, ["oth-L1", "oth-L2"], noModels);
    expect((await new WebIO().binaryToJSON(all)).json.asset.generator).toBe(`OTH map editor. ${CONTEXT_ORIGIN_NOTE} ${STACKED_NOTE}`);
    expect((await readGlb(all)).getRoot().getExtras()).toMatchObject({ othExport: { floors: ["L1", "L2"] } });
  });
});

describe("buildFloorGlb — Floors", () => {
  it("builds one mesh per room the preview draws, named after it, and none for a void or a deleted room", async () => {
    const floors = group(await exported(floorModel, ["oth-L1"]), "L1", "Floors");
    expect(names(floors)).toEqual(["Hall", "Starbucks", "L1-cafe", "Bench"]);
    expect(child(floors, "L1-cafe").getExtras()).toEqual({ othId: "L1-cafe", kind: "room" });
  });

  it("lays a floor in real metres, Y up, with north toward -Z", async () => {
    const hall = bounds(child(group(await exported(floorModel, ["oth-L1"]), "L1", "Floors"), "Hall"));
    expect(hall.minX).toBeCloseTo(0);
    expect(hall.maxX).toBeCloseTo(20);
    expect(hall.minZ).toBeCloseTo(0);
    expect(hall.maxZ).toBeCloseTo(10);
    expect(hall.minY).toBeCloseTo(0);
    expect(hall.maxY).toBeCloseTo(SLAB_HEIGHT_M);
  });

  it("cuts the atrium out of the hall's slab", async () => {
    const hall = child(group(await exported(floorModel, ["oth-L1"]), "L1", "Floors"), "Hall");
    const corners = new Set(worldVertices(hall).map(([x, , z]) => `${round(x)},${round(z)}`));
    expect(corners).toContain("14,8");
    expect(corners).toContain("18,4");
  });

  it("builds a detail as a solid block as tall as it is, as the preview does", async () => {
    expect(bounds(child(group(await exported(floorModel, ["oth-L1"]), "L1", "Floors"), "Bench")).maxY).toBeCloseTo(0.9);
  });

  it("tints a bound room by its place's category, and shares one material per paint across floors", async () => {
    const doc = await exported(floorModel, ["oth-L1", "oth-L2"]);
    const starbucks = materialOf(child(group(doc, "L1", "Floors"), "Starbucks"));
    expect(starbucks.getName()).toBe("retail");
    expectColour(starbucks, CATEGORY_TINT.retail);
    const cafe = materialOf(child(group(doc, "L1", "Floors"), "L1-cafe"));
    expect(cafe.getName()).toBe("room");
    expectColour(cafe, roomColor("room"));
    expect(materialOf(child(group(doc, "L2", "Floors"), "Upstairs"))).toBe(cafe);
  });

  it("leaves out a detail's block once a model is placed on it, as the preview does", async () => {
    const dressed: MapModel = {
      ...floorModel,
      placements: [PlacementSchema.parse({ id: "pm-bench", levelId: "oth-L1", assetId: "asset-bench", roomId: "L1-bench", position: [2, -8.5, 0] })],
    };
    expect(names(group(await exported(dressed, ["oth-L1"]), "L1", "Floors"))).not.toContain("Bench");
  });

  it("names a room with no name by its id, and keeps both of two rooms with one name, each with its id", async () => {
    const toilets = ["L1-wc1", "L1-wc2"].map((id, i) =>
      RoomSchema.parse({ id, levelId: "oth-L1", kind: "room", footprint: sq(30 + i * 3, 10, 32 + i * 3, 12), heightM: 3, nameEn: "Toilet" }));
    const blank = RoomSchema.parse({ id: "L1-blank", levelId: "oth-L1", kind: "room", footprint: sq(40, 10, 42, 12), heightM: 3, nameEn: "   " });
    const floors = group(await exported({ ...floorModel, rooms: [...floorModel.rooms, ...toilets, blank] }, ["oth-L1"]), "L1", "Floors");
    expect(floors.listChildren().filter(n => n.getName() === "Toilet").map(n => n.getExtras().othId)).toEqual(["L1-wc1", "L1-wc2"]);
    expect(names(floors)).toContain("L1-blank");
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `bash .superpowers/run-tests.sh vitest packages/renderer/src/export`
Expected: FAIL with `Failed to resolve import "./gltfWrite"` and `"./floorGlb"`.

- [ ] **Step 4: Write `gltfWrite.ts`**

```ts
import {
  ColorUtils, Document, WebIO,
  type Buffer as GltfBuffer, type Material, type Mesh, type Node as GltfNode,
} from "@gltf-transform/core";
import type * as THREE from "three";

/** How a part is painted in the file. */
export type Paint = {
  /** The material's name, which Blender lists. Parts with the same paint share one material. */
  name: string;
  /** The preview's colour, as sRGB hex ("#e7ddc7"). */
  colour: string;
  /** Below 1 the material blends, as the preview's see-through parts do. */
  opacity?: number;
  /** Walls, rails, shafts, flights and strips are drawn from both sides in the preview. */
  doubleSided?: boolean;
};

/**
 * Writes three.js geometry into a glTF document with @gltf-transform, so an
 * export is a pure function returning bytes, testable without a browser.
 *
 * WebIO rather than NodeIO: NodeIO's constructor imports `node:fs`, which the
 * editor's browser can't. WebIO only fetches for files that point elsewhere,
 * which a .glb never does, so it reads and writes the same way in Node.
 *
 * Normals are left out. Every piece the preview builds is flat-shaded, and a
 * loader given no normals must compute flat ones (glTF 2.0, "Meshes"), so the
 * file shades the same and is smaller.
 */
export class GlbWriter {
  readonly doc = new Document();
  private readonly buffer: GltfBuffer;
  private readonly materials = new Map<string, Material>();

  constructor() {
    this.buffer = this.doc.createBuffer();
  }

  /**
   * One material per paint. The preview's colours are sRGB and glTF's are
   * linear, so each is converted. Metallic is 0 as in three's standard
   * material: glTF's default of 1 would render every wall dark.
   */
  material(paint: Paint): Material {
    const opacity = paint.opacity ?? 1;
    const doubleSided = paint.doubleSided ?? false;
    const key = `${paint.name}|${paint.colour}|${opacity}|${doubleSided}`;
    const known = this.materials.get(key);
    if (known) return known;
    const [r, g, b] = ColorUtils.hexToFactor<[number, number, number]>(Number.parseInt(paint.colour.slice(1), 16), [0, 0, 0]);
    const material = this.doc.createMaterial(paint.name)
      .setBaseColorFactor([r, g, b, opacity])
      .setAlphaMode(opacity < 1 ? "BLEND" : "OPAQUE")
      .setDoubleSided(doubleSided)
      .setMetallicFactor(0)
      .setRoughnessFactor(1);
    this.materials.set(key, material);
    return material;
  }

  /** The geometry as one painted mesh, or null when it has no triangle: glTF can't hold an empty mesh. */
  geometryMesh(name: string, geometry: THREE.BufferGeometry, paint: Paint): Mesh | null {
    const position = geometry.getAttribute("position");
    if (!position || position.count < 3) return null;
    const primitive = this.doc.createPrimitive()
      .setAttribute("POSITION", this.accessor(`${name} position`, new Float32Array(position.array as ArrayLike<number>), "VEC3"))
      .setMaterial(this.material(paint));
    const index = geometry.getIndex();
    if (index) primitive.setIndices(this.accessor(`${name} indices`, new Uint32Array(index.array as ArrayLike<number>), "SCALAR"));
    return this.doc.createMesh(name).addPrimitive(primitive);
  }

  /** A node holding the geometry, named; null when the geometry is empty. */
  mesh(name: string, geometry: THREE.BufferGeometry, paint: Paint): GltfNode | null {
    const mesh = this.geometryMesh(name, geometry, paint);
    return mesh ? this.doc.createNode(name).setMesh(mesh) : null;
  }

  /** What the file says about itself: the note in its generator and copyright, the rest in its extras. */
  setNote(note: string, extras: Record<string, unknown>): void {
    const asset = this.doc.getRoot().getAsset();
    asset.generator = `OTH map editor. ${note}`;
    asset.copyright = note;
    this.doc.getRoot().setExtras({ othExport: { note, ...extras } });
  }

  write(): Promise<Uint8Array> {
    return new WebIO().writeBinary(this.doc);
  }

  private accessor(name: string, array: Float32Array | Uint32Array, type: "VEC3" | "SCALAR") {
    return this.doc.createAccessor(name).setArray(array).setType(type).setBuffer(this.buffer);
  }
}
```

- [ ] **Step 5: Write `floorGlb.ts`**

```ts
import type { Node as GltfNode, Scene } from "@gltf-transform/core";
import { live, type Level, type MapModel, type Room } from "@oth/model";
import { CATEGORY_TINT, roomTints } from "../categoryTint";
import { CONTEXT_ORIGIN_NOTE } from "../contextExport";
import { modelToThree } from "../coords";
import { roomsToDraw } from "../LevelGroup";
import { floorColour, roomFloorGeometry } from "../levelParts";
import { massingOf } from "../massing";
import { levelStructure, type LevelStructure } from "../structure";
import { GlbWriter, type Paint } from "./gltfWrite";

/** A placed model's bytes, fetched through the asset URL; null when it can't be had. */
export type AssetBytes = (assetId: string) => Promise<Uint8Array | null>;

/** The parts of a floor, in the order the file lists them (spec §6). */
export const FLOOR_GROUPS = ["Floors", "Walls", "Voids", "Stops", "Objects", "Pathways"] as const;
export type FloorGroup = (typeof FLOOR_GROUPS)[number];

/** Said in the file, and after the download, when it holds more than one floor. */
export const STACKED_NOTE = "Each floor stands at its elevation above the building datum.";

/** What the file says about itself (spec §6): the context export's origin note, and the stacking when there is any. */
export function floorExportNote(stacked: boolean): string {
  return stacked ? `${CONTEXT_ORIGIN_NOTE} ${STACKED_NOTE}` : CONTEXT_ORIGIN_NOTE;
}

/** A thing's name in the file: its English name, or its id when it has none. */
function label(name: string, id: string): string {
  return name.trim() || id;
}

const TINT_CATEGORY = new Map(Object.entries(CATEGORY_TINT).map(([category, hex]) => [hex, category]));

/** Everything one floor's builders need. */
type FloorContext = {
  writer: GlbWriter;
  model: MapModel;
  level: Level;
  /** The floor's live rooms. */
  rooms: Room[];
  /** Each of those rooms' names in the file. */
  roomNames: ReadonlyMap<string, string>;
  structure: LevelStructure;
  groups: Record<FloorGroup, GltfNode>;
};

/**
 * A floor's node, raised to its elevation when the file holds several floors
 * (spec §6) and at floor level when it's alone, as the context export was,
 * with its six groups under it in the spec's order.
 */
function floorContext(writer: GlbWriter, scene: Scene, model: MapModel, level: Level, stacked: boolean): FloorContext {
  const floor = writer.doc.createNode(level.code)
    .setTranslation(stacked ? modelToThree(0, 0, level.elevationM) : [0, 0, 0])
    .setExtras({ othId: level.id, elevationM: level.elevationM });
  scene.addChild(floor);
  const groups = Object.fromEntries(FLOOR_GROUPS.map(name => {
    const node = writer.doc.createNode(name);
    floor.addChild(node);
    return [name, node];
  })) as Record<FloorGroup, GltfNode>;
  const rooms = live(model.rooms).filter(r => r.levelId === level.id);
  return {
    writer, model, level, rooms, groups,
    roomNames: new Map(rooms.map(r => [r.id, label(r.nameEn, r.id)])),
    structure: levelStructure(model, level.id),
  };
}

/** Floors: one mesh per room the preview draws, with its voids cut, tinted as the preview tints it. */
function addFloors(ctx: FloorContext): void {
  const placements = live(ctx.model.placements).filter(p => p.levelId === ctx.level.id);
  const tints = roomTints(ctx.model, ctx.level.id);
  for (const room of roomsToDraw(ctx.rooms, placements)) {
    if (massingOf(room) === "none") continue;
    const tint = tints.get(room.id);
    const paint: Paint = {
      name: (tint && TINT_CATEGORY.get(tint)) || room.kind,
      colour: floorColour(room.kind, { tint }),
    };
    const geometry = roomFloorGeometry(room, ctx.structure.holesByRoom.get(room.id));
    const node = ctx.writer.mesh(ctx.roomNames.get(room.id) ?? room.id, geometry, paint);
    if (node) ctx.groups.Floors.addChild(node.setExtras({ othId: room.id, kind: room.kind }));
  }
}

/**
 * The floors asked for, as one .glb of named parts (spec §6), built from the
 * preview's own geometry. Floors come out lowest first; ids of deleted or
 * unknown floors are skipped.
 */
export async function buildFloorGlb(
  model: MapModel,
  levelIds: string[],
  // Used by the Objects group, which comes with Plan 6A (Task 8).
  _assetBytes: AssetBytes,
): Promise<Uint8Array> {
  const wanted = new Set(levelIds);
  const levels = live(model.levels).filter(l => wanted.has(l.id)).sort((a, b) => a.ordinal - b.ordinal);
  const stacked = levels.length > 1;
  const writer = new GlbWriter();
  const scene = writer.doc.createScene(model.building.id);
  writer.doc.getRoot().setDefaultScene(scene);
  for (const level of levels) {
    const ctx = floorContext(writer, scene, model, level, stacked);
    addFloors(ctx);
  }
  writer.setNote(floorExportNote(stacked), { floors: levels.map(l => l.code) });
  return writer.write();
}
```

- [ ] **Step 6: Export it from the renderer**

Append to `packages/renderer/src/index.ts`:

```ts
// Plan 6B: the whole-floor 3D export.
export * from "./export/floorGlb";
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `bash .superpowers/run-tests.sh vitest packages/renderer/src/export`
Expected: PASS.

Run: `bash .superpowers/run-tests.sh tsc packages/renderer`
Expected: no errors.

- [ ] **Step 8: Commit**

Check `git diff -- packages/renderer/src/index.ts` shows only your two lines. Then:

```bash
git add packages/renderer/src/export/gltfWrite.ts packages/renderer/src/export/gltfWrite.test.ts packages/renderer/src/export/floorGlb.ts packages/renderer/src/export/floorGlb.test.ts packages/renderer/src/export/testing.ts
git commit --only -m "feat(renderer): buildFloorGlb writes a floor, or every floor stacked, as a .glb of named parts, starting with the floors" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- packages/renderer/src/export/gltfWrite.ts packages/renderer/src/export/gltfWrite.test.ts packages/renderer/src/export/floorGlb.ts packages/renderer/src/export/floorGlb.test.ts packages/renderer/src/export/testing.ts packages/renderer/src/index.ts
```

---

### Task 3: Walls and voids

The walls come from Plan 5D's `levelStructure`, at full height with the doors already cut. There is one mesh per room, or per pair of rooms, that the walls enclose. Each void's balustrade is its own mesh, named after the void.

**Files:**
- Modify: `packages/renderer/src/export/floorGlb.ts`
- Modify: `packages/renderer/src/export/floorGlb.test.ts` (append)

**Interfaces:**
- Consumes: Task 1's `wallBlock` and `railBlock`, and `BALUSTRADE_COLOUR` and `BALUSTRADE_OPACITY`. `blocksGeometry` and `type Block` (`blocks.ts`); `wallColor` (`theme.ts`). Task 2's `FloorContext` and `GlbWriter`.
- Produces: `addWalls(ctx: FloorContext): void` and `addVoids(ctx: FloorContext): void`, both internal.
  - Wall nodes are named with the room names joined by `" / "`, in room-id order, and carry `extras: { rooms: string[] }`.
  - Void nodes are named after the void, and carry `extras.othId`.

- [ ] **Step 1: Write the failing tests**

Add `parseModel` to the `@oth/model` import at the top of `floorGlb.test.ts`, and add these imports:

```ts
import { wallColor } from "../theme";
import { BALUSTRADE_COLOUR, BALUSTRADE_HEIGHT_M, BALUSTRADE_OPACITY, BALUSTRADE_THICKNESS_M } from "../voids";
```

(`roomColor` is already imported from `../theme`: make it `import { roomColor, wallColor } from "../theme";`.) Then append:

```ts
describe("buildFloorGlb — Walls", () => {
  it("builds the preview's walls: one mesh per room, and one per pair of rooms that share a wall", async () => {
    const walls = group(await exported(floorModel, ["oth-L1"]), "L1", "Walls");
    expect(names(walls).sort()).toEqual(["L1-cafe", "L1-cafe / Starbucks", "Starbucks"]);
    expect(child(walls, "L1-cafe / Starbucks").getExtras()).toEqual({ rooms: ["L1-cafe", "L1-shop"] });
  });

  it("stands every wall at full height: its room's, or the taller of the two", async () => {
    const walls = group(await exported(floorModel, ["oth-L1"]), "L1", "Walls");
    expect(bounds(child(walls, "Starbucks")).minY).toBeCloseTo(0);
    expect(bounds(child(walls, "Starbucks")).maxY).toBeCloseTo(3.5);
    expect(bounds(child(walls, "L1-cafe / Starbucks")).maxY).toBeCloseTo(4);
  });

  it("cuts the door where the pathway goes in: the shop's front stops at 1 m and starts again at 3 m", async () => {
    const shop = child(group(await exported(floorModel, ["oth-L1"]), "L1", "Walls"), "Starbucks");
    // The front runs along y = 0, which is z = 0, and the wall is 0.15 m thick.
    const front = worldVertices(shop).filter(([, , z]) => Math.abs(z) < 0.1).map(([x]) => x);
    expect(front.some(x => Math.abs(x - 1) < 1e-3)).toBe(true);
    expect(front.some(x => Math.abs(x - 3) < 1e-3)).toBe(true);
    expect(front.filter(x => x > 1.001 && x < 2.999)).toEqual([]);
  });

  it("raises a floor's walls with it when the floors are stacked", async () => {
    const upstairs = bounds(child(group(await exported(floorModel, ["oth-L1", "oth-L2"]), "L2", "Walls"), "Upstairs"));
    expect(upstairs.minY).toBeCloseTo(6);
    expect(upstairs.maxY).toBeCloseTo(9);
  });

  it("paints the walls as the preview does, seen from both sides", async () => {
    const wall = materialOf(child(group(await exported(floorModel, ["oth-L1"]), "L1", "Walls"), "Starbucks"));
    expect(wall.getName()).toBe("wall");
    expectColour(wall, wallColor("room"));
    expect(wall.getDoubleSided()).toBe(true);
  });

  it("builds a whole floor's worth, 400 shops, into one modest file with one material per paint", async () => {
    const rooms = [];
    for (let i = 0; i < 20; i++) {
      for (let j = 0; j < 20; j++) {
        rooms.push({ id: `r-${i}-${j}`, levelId: "oth-L1", kind: "room", footprint: sq(i * 5, j * 5, i * 5 + 5, j * 5 + 5), heightM: 3.5, nameEn: `Shop ${i}-${j}` });
      }
    }
    const grid = parseModel({ building: floorModel.building, levels: [floorModel.levels[0]!], rooms });
    const bytes = await buildFloorGlb(grid, ["oth-L1"], noModels);
    const doc = await readGlb(bytes);
    expect(names(group(doc, "L1", "Floors"))).toHaveLength(400);
    expect(doc.getRoot().listMaterials().map(m => m.getName()).sort()).toEqual(["room", "wall"]);
    expect(bytes.byteLength).toBeLessThan(3_000_000);
  });
});

describe("buildFloorGlb — Voids", () => {
  it("rails the atrium with a balustrade named after it, 1.1 m high around its edge", async () => {
    const voids = group(await exported(floorModel, ["oth-L1"]), "L1", "Voids");
    expect(names(voids)).toEqual(["Atrium"]);
    const half = BALUSTRADE_THICKNESS_M / 2;
    const rail = bounds(child(voids, "Atrium"));
    expect(rail.minX).toBeCloseTo(14 - half);
    expect(rail.maxX).toBeCloseTo(18 + half);
    expect(rail.minZ).toBeCloseTo(4 - half);
    expect(rail.maxZ).toBeCloseTo(8 + half);
    expect(rail.minY).toBeCloseTo(0);
    expect(rail.maxY).toBeCloseTo(BALUSTRADE_HEIGHT_M);
  });

  it("paints it as see-through glass", async () => {
    const glass = materialOf(child(group(await exported(floorModel, ["oth-L1"]), "L1", "Voids"), "Atrium"));
    expect(glass.getAlphaMode()).toBe("BLEND");
    expect(glass.getAlpha()).toBeCloseTo(BALUSTRADE_OPACITY);
    expectColour(glass, BALUSTRADE_COLOUR);
  });

  it("rails nothing on a floor with no void", async () => {
    expect(names(group(await exported(floorModel, ["oth-L2"]), "L2", "Voids"))).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bash .superpowers/run-tests.sh vitest packages/renderer/src/export/floorGlb.test.ts`
Expected: FAIL. The Walls and Voids groups are empty, so `child` throws `No Starbucks under Walls:` and `No Atrium under Voids:`.

- [ ] **Step 3: Build the walls and voids**

In `floorGlb.ts`, replace the import block with:

```ts
import type { Node as GltfNode, Scene } from "@gltf-transform/core";
import { live, type Level, type MapModel, type Room } from "@oth/model";
import { blocksGeometry, type Block } from "../blocks";
import { CATEGORY_TINT, roomTints } from "../categoryTint";
import { CONTEXT_ORIGIN_NOTE } from "../contextExport";
import { modelToThree } from "../coords";
import { roomsToDraw } from "../LevelGroup";
import { floorColour, railBlock, roomFloorGeometry, wallBlock } from "../levelParts";
import { massingOf } from "../massing";
import { levelStructure, type LevelStructure } from "../structure";
import { wallColor } from "../theme";
import { BALUSTRADE_COLOUR, BALUSTRADE_OPACITY } from "../voids";
import { GlbWriter, type Paint } from "./gltfWrite";
```

Add these above `buildFloorGlb`:

```ts
const WALL_PAINT: Paint = { name: "wall", colour: wallColor("room"), doubleSided: true };
const BALUSTRADE_PAINT: Paint = { name: "balustrade", colour: BALUSTRADE_COLOUR, opacity: BALUSTRADE_OPACITY, doubleSided: true };

/**
 * Walls: Plan 5D's merged walls with their doors cut, always at full height
 * (spec §6). One mesh per room, and one per pair of rooms sharing a wall, so
 * a modeller can hide one shop's walls.
 */
function addWalls(ctx: FloorContext): void {
  const byRooms = new Map<string, { rooms: string[]; blocks: Block[] }>();
  for (const piece of ctx.structure.walls) {
    const rooms = [...piece.rooms].sort();
    const key = rooms.join("|");
    const entry = byRooms.get(key) ?? { rooms, blocks: [] };
    entry.blocks.push(wallBlock(piece, ctx.structure.heightByRoom, true));
    byRooms.set(key, entry);
  }
  for (const { rooms, blocks } of byRooms.values()) {
    const name = rooms.map(id => ctx.roomNames.get(id) ?? id).join(" / ");
    const node = ctx.writer.mesh(name, blocksGeometry(blocks), WALL_PAINT);
    if (node) ctx.groups.Walls.addChild(node.setExtras({ rooms }));
  }
}

/** Voids: each void's balustrade, named after the void. A void that cuts no floor has none (Plan 5D). */
function addVoids(ctx: FloorContext): void {
  const byVoid = new Map<string, Block[]>();
  for (const rail of ctx.structure.balustrades) {
    const id = rail.rooms[0] ?? "void";
    byVoid.set(id, [...(byVoid.get(id) ?? []), railBlock(rail)]);
  }
  for (const [id, blocks] of byVoid) {
    const node = ctx.writer.mesh(ctx.roomNames.get(id) ?? id, blocksGeometry(blocks), BALUSTRADE_PAINT);
    if (node) ctx.groups.Voids.addChild(node.setExtras({ othId: id }));
  }
}
```

In `buildFloorGlb`, replace `addFloors(ctx);` with:

```ts
    addFloors(ctx);
    addWalls(ctx);
    addVoids(ctx);
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bash .superpowers/run-tests.sh vitest packages/renderer/src/export`
Expected: PASS. The 400-shop test takes a few seconds.

Run: `bash .superpowers/run-tests.sh tsc packages/renderer`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git commit --only -m "feat(renderer): the 3D export's walls stand full height with their doors cut, and voids get their balustrades" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- packages/renderer/src/export/floorGlb.ts packages/renderer/src/export/floorGlb.test.ts
```

---

### Task 4: Stops and pathways

Stops come from Plan 5D's `portalParts`: one node per lift shaft and one per flight, each named after its portal. Pathways are strips, one per pathway, in their kind's colour.

**Files:**
- Modify: `packages/renderer/src/export/floorGlb.ts`
- Modify: `packages/renderer/src/export/floorGlb.test.ts` (append)

**Interfaces:**
- Consumes:
  - from Task 1: `PORTAL_COLOUR`, `SHAFT_OPACITY`, `flightColour`, `STRIP_HEIGHT_M`, `STRIP_OPACITY` and `pathwayColour`;
  - existing: `portalParts` and `shaftBlocks` (`portals.ts`), `stripQuads` (`pathwayStrips.ts`), `quadsGeometry` (`blocks.ts`).
- Produces: `addStops(ctx)` and `addPathways(ctx)`, both internal.
  - Stop nodes carry `extras: { othId: portalId, kind }`.
  - Pathway nodes carry `extras: { othId, widthM }`.

- [ ] **Step 1: Write the failing tests**

Add these imports to `floorGlb.test.ts`:

```ts
import { DEFAULT_PATHWAY_COLOUR, STRIP_HEIGHT_M, STRIP_OPACITY } from "../pathwayStrips";
import { PORTAL_COLOUR, SHAFT_OPACITY } from "../portals";
```

and add `DELETED` to the `./testing` import. Then append:

```ts
describe("buildFloorGlb — Stops", () => {
  it("builds the lift's shaft on every floor it stops at, and the escalator's flight on the floor it climbs from", async () => {
    const doc = await exported(floorModel, ["oth-L1", "oth-L2"]);
    expect(names(group(doc, "L1", "Stops")).sort()).toEqual(["Escalator 1", "Lift A"]);
    expect(names(group(doc, "L2", "Stops"))).toEqual(["Lift A"]);
    expect(child(group(doc, "L1", "Stops"), "Escalator 1").getExtras()).toEqual({ othId: "esc-1", kind: "escalator" });
  });

  it("raises a shaft to the next floor, and the top floor's to its own height", async () => {
    const doc = await exported(floorModel, ["oth-L1", "oth-L2"]);
    const low = bounds(child(group(doc, "L1", "Stops"), "Lift A"));
    expect(low.minY).toBeCloseTo(0);
    expect(low.maxY).toBeCloseTo(6);
    // Half the shaft's 0.12 m glass stands outside its outline.
    expect(low.minX).toBeCloseTo(29 - 0.06);
    const top = bounds(child(group(doc, "L2", "Stops"), "Lift A"));
    expect(top.minY).toBeCloseTo(6);
    expect(top.maxY).toBeCloseTo(11);
  });

  it("climbs the escalator to the floor above, its top step level with that floor, inside its outline", async () => {
    const flight = bounds(child(group(await exported(floorModel, ["oth-L1"]), "L1", "Stops"), "Escalator 1"));
    expect(flight.maxY).toBeCloseTo(6 + SLAB_HEIGHT_M);
    expect(flight.minX).toBeGreaterThanOrEqual(21 - 1e-6);
    expect(flight.maxX).toBeLessThanOrEqual(23 + 1e-6);
  });

  it("paints the shaft see-through and the flight in the preview's colours", async () => {
    const stops = group(await exported(floorModel, ["oth-L1"]), "L1", "Stops");
    const shaft = materialOf(child(stops, "Lift A"));
    expect(shaft.getAlphaMode()).toBe("BLEND");
    expect(shaft.getAlpha()).toBeCloseTo(SHAFT_OPACITY);
    expectColour(shaft, PORTAL_COLOUR.shaft);
    const escalator = materialOf(child(stops, "Escalator 1"));
    expect(escalator.getName()).toBe("escalator");
    expectColour(escalator, PORTAL_COLOUR.escalator);
  });

  it("builds nothing for a deleted escalator", async () => {
    const gone: MapModel = { ...floorModel, portals: floorModel.portals.map(p => (p.id === "esc-1" ? { ...p, deletedAt: DELETED } : p)) };
    expect(names(group(await exported(gone, ["oth-L1"]), "L1", "Stops"))).toEqual(["Lift A"]);
  });
});

describe("buildFloorGlb — Pathways", () => {
  it("lays each live pathway as a strip, named after it or by its id", async () => {
    const pathways = group(await exported(floorModel, ["oth-L1"]), "L1", "Pathways");
    expect(names(pathways)).toEqual(["Way in", "L1-east"]);
    expect(child(pathways, "Way in").getExtras()).toEqual({ othId: "L1-in", widthM: 2 });
  });

  it("lays a strip as wide as its pathway, just above the slabs", async () => {
    const strip = bounds(child(group(await exported(floorModel, ["oth-L1"]), "L1", "Pathways"), "Way in"));
    expect(strip.minX).toBeCloseTo(1);
    expect(strip.maxX).toBeCloseTo(3);
    expect(strip.minZ).toBeCloseTo(-2);
    expect(strip.maxZ).toBeCloseTo(5);
    expect(strip.minY).toBeCloseTo(STRIP_HEIGHT_M);
    expect(strip.maxY).toBeCloseTo(STRIP_HEIGHT_M);
  });

  it("paints a strip in its kind's colour, and one with no kind in the plan's blue", async () => {
    const pathways = group(await exported(floorModel, ["oth-L1"]), "L1", "Pathways");
    const concourse = materialOf(child(pathways, "Way in"));
    expect(concourse.getName()).toBe("Concourse");
    expectColour(concourse, "#f97316");
    expect(concourse.getAlpha()).toBeCloseTo(STRIP_OPACITY);
    const plain = materialOf(child(pathways, "L1-east"));
    expect(plain.getName()).toBe("pathway");
    expectColour(plain, DEFAULT_PATHWAY_COLOUR);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bash .superpowers/run-tests.sh vitest packages/renderer/src/export/floorGlb.test.ts`
Expected: FAIL. `Stops` and `Pathways` are empty.

- [ ] **Step 3: Build the stops and pathways**

In `floorGlb.ts`, replace the import block with:

```ts
import type { Node as GltfNode, Scene } from "@gltf-transform/core";
import { live, type Level, type MapModel, type Room } from "@oth/model";
import { blocksGeometry, quadsGeometry, type Block } from "../blocks";
import { CATEGORY_TINT, roomTints } from "../categoryTint";
import { CONTEXT_ORIGIN_NOTE } from "../contextExport";
import { modelToThree } from "../coords";
import { roomsToDraw } from "../LevelGroup";
import { floorColour, railBlock, roomFloorGeometry, wallBlock } from "../levelParts";
import { massingOf } from "../massing";
import { STRIP_HEIGHT_M, STRIP_OPACITY, pathwayColour, stripQuads } from "../pathwayStrips";
import { PORTAL_COLOUR, SHAFT_OPACITY, flightColour, portalParts, shaftBlocks } from "../portals";
import { levelStructure, type LevelStructure } from "../structure";
import { wallColor } from "../theme";
import { BALUSTRADE_COLOUR, BALUSTRADE_OPACITY } from "../voids";
import { GlbWriter, type Paint } from "./gltfWrite";
```

Add these above `buildFloorGlb`:

```ts
const SHAFT_PAINT: Paint = { name: "lift shaft", colour: PORTAL_COLOUR.shaft, opacity: SHAFT_OPACITY, doubleSided: true };

/** Stops: each lift's shaft on this floor, and each flight that climbs from it, named after its portal (Plan 5D). */
function addStops(ctx: FloorContext): void {
  const portals = new Map(live(ctx.model.portals).map(p => [p.id, p]));
  const name = (portalId: string) => {
    const portal = portals.get(portalId);
    return portal ? label(portal.nameEn, portal.id) : portalId;
  };
  const { shafts, flights } = portalParts(ctx.model, ctx.level.id);
  for (const shaft of shafts) {
    const node = ctx.writer.mesh(name(shaft.portalId), blocksGeometry(shaftBlocks(shaft)), SHAFT_PAINT);
    if (node) ctx.groups.Stops.addChild(node.setExtras({ othId: shaft.portalId, kind: "lift" }));
  }
  for (const flight of flights) {
    const paint: Paint = { name: flight.kind, colour: flightColour(flight.kind), doubleSided: true };
    const node = ctx.writer.mesh(name(flight.portalId), blocksGeometry(flight.steps), paint);
    if (node) ctx.groups.Stops.addChild(node.setExtras({ othId: flight.portalId, kind: flight.kind }));
  }
}

/** Pathways: one strip per pathway, in its kind's colour, just above the slabs. */
function addPathways(ctx: FloorContext): void {
  const kinds = live(ctx.model.pathwayKinds);
  for (const pathway of live(ctx.model.pathways)) {
    if (pathway.levelId !== ctx.level.id) continue;
    const quads = stripQuads(pathway.polyline, pathway.widthM);
    if (quads.length === 0) continue;
    const kind = kinds.find(k => k.id === pathway.kindId);
    const paint: Paint = {
      name: kind ? kind.nameEn : "pathway",
      colour: pathwayColour(pathway, kinds),
      opacity: STRIP_OPACITY,
      doubleSided: true,
    };
    const node = ctx.writer.mesh(label(pathway.nameEn, pathway.id), quadsGeometry(quads, STRIP_HEIGHT_M), paint);
    if (node) ctx.groups.Pathways.addChild(node.setExtras({ othId: pathway.id, widthM: pathway.widthM }));
  }
}
```

In `buildFloorGlb`, replace `addVoids(ctx);` with:

```ts
    addVoids(ctx);
    addStops(ctx);
    addPathways(ctx);
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bash .superpowers/run-tests.sh vitest packages/renderer/src/export`
Expected: PASS.

Run: `bash .superpowers/run-tests.sh tsc packages/renderer`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git commit --only -m "feat(renderer): the 3D export builds lift shafts, escalator and stair flights, and pathway strips" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- packages/renderer/src/export/floorGlb.ts packages/renderer/src/export/floorGlb.test.ts
```

---

### Task 5: A model copied into the file

Objects show their kind's uploaded model (spec §5.3). This task reads a model's bytes and copies its scene into the export's document: nodes, meshes, materials, textures and accessors, all into the export's single buffer. The copy then places the model any number of times, with the meshes shared. Core has no `mergeDocuments` (that is in `@gltf-transform/functions`, which is ruled out), but `Property.copy` with a resolver does the same job.

**Files:**
- Create: `packages/renderer/src/export/modelCopy.ts`
- Create: `packages/renderer/src/export/modelCopy.test.ts`
- Modify: `packages/renderer/src/export/testing.ts` (append two helpers)

**Interfaces:**
- Consumes: `@gltf-transform/core` only. `testing.ts` from Task 2.
- Produces:
  - `copyModelInto(target: Document, bytes: Uint8Array): Promise<ModelTemplate | null>`, which returns null for anything it can't read or whose scene is empty.
  - `class ModelTemplate { place(): Node[] }`. The first call returns the copied roots, and later calls return fresh node trees that share the meshes.
  - `testing.ts`:
    - `triangleGlb(): Promise<Uint8Array>`: one triangle 2 m along x and 1 m up, textured, as a `body` node with a `lid` child;
    - `glbFromJson(json: object): Uint8Array`: a `.glb` with only a JSON chunk.

- [ ] **Step 1: Add the test models to `testing.ts`**

Change the first import line of `packages/renderer/src/export/testing.ts` to:

```ts
import { ColorUtils, Document, WebIO, getBounds, type Material, type Node as GltfNode } from "@gltf-transform/core";
```

(`Document` becomes a value import, since `triangleGlb` constructs one; the type uses stay valid.) Then append:

```ts
/**
 * A tiny uploaded model: one triangle 2 m along x and 1 m up, painted with a
 * texture, as a `body` node with a `lid` child using the same mesh, the way
 * Blender exports a small hierarchy.
 */
export async function triangleGlb(): Promise<Uint8Array> {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const texture = doc.createTexture("bin label").setMimeType("image/png")
    .setImage(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]));
  const material = doc.createMaterial("bin green").setBaseColorFactor([0.1, 0.5, 0.2, 1]).setBaseColorTexture(texture);
  const position = doc.createAccessor("triangle").setType("VEC3").setBuffer(buffer)
    .setArray(new Float32Array([0, 0, 0, 2, 0, 0, 0, 1, 0]));
  const mesh = doc.createMesh("bin").addPrimitive(doc.createPrimitive().setAttribute("POSITION", position).setMaterial(material));
  const body = doc.createNode("body").setMesh(mesh).addChild(doc.createNode("lid").setMesh(mesh));
  doc.getRoot().setDefaultScene(doc.createScene("bin").addChild(body));
  return new WebIO().writeBinary(doc);
}

/** A .glb holding only a JSON chunk, for files the export must turn away. */
export function glbFromJson(json: object): Uint8Array {
  const text = new TextEncoder().encode(JSON.stringify(json));
  const padded = new Uint8Array(Math.ceil(text.length / 4) * 4).fill(0x20);
  padded.set(text);
  const bytes = new Uint8Array(20 + padded.length);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x46546c67, true); // "glTF"
  view.setUint32(4, 2, true);
  view.setUint32(8, bytes.length, true);
  view.setUint32(12, padded.length, true);
  view.setUint32(16, 0x4e4f534a, true); // "JSON"
  bytes.set(padded, 20);
  return bytes;
}
```

- [ ] **Step 2: Write the failing tests**

`packages/renderer/src/export/modelCopy.test.ts`:

```ts
import { Document, WebIO } from "@gltf-transform/core";
import { describe, expect, it } from "vitest";
import { copyModelInto } from "./modelCopy";
import { glbFromJson, triangleGlb } from "./testing";

function exportDoc(): Document {
  const doc = new Document();
  doc.createBuffer();
  return doc;
}

describe("copyModelInto", () => {
  it("copies a model's nodes, mesh, material and texture into the export", async () => {
    const doc = exportDoc();
    const [body] = (await copyModelInto(doc, await triangleGlb()))!.place();
    expect(body!.getName()).toBe("body");
    expect(body!.listChildren().map(n => n.getName())).toEqual(["lid"]);
    expect(doc.getRoot().listMeshes().map(m => m.getName())).toEqual(["bin"]);
    const [material] = doc.getRoot().listMaterials();
    expect(material!.getName()).toBe("bin green");
    expect(material!.getBaseColorFactor()).toEqual([0.1, 0.5, 0.2, 1]);
    expect(material!.getBaseColorTexture()?.getImage()).toEqual(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]));
  });

  it("keeps everything in the export's one buffer, so the file still writes as a .glb", async () => {
    const doc = exportDoc();
    const scene = doc.createScene("s");
    for (const node of (await copyModelInto(doc, await triangleGlb()))!.place()) scene.addChild(node);
    expect(doc.getRoot().listBuffers()).toHaveLength(1);
    const back = await new WebIO().readBinary(await new WebIO().writeBinary(doc));
    expect(back.getRoot().listNodes().map(n => n.getName()).sort()).toEqual(["body", "lid"]);
    expect(back.getRoot().listTextures()).toHaveLength(1);
  });

  it("places one model many times with fresh nodes, sharing its mesh", async () => {
    const doc = exportDoc();
    const model = (await copyModelInto(doc, await triangleGlb()))!;
    const [first] = model.place();
    const [second] = model.place();
    expect(second).not.toBe(first);
    expect(second!.listChildren()[0]).not.toBe(first!.listChildren()[0]);
    expect(second!.getMesh()).toBe(first!.getMesh());
    expect(doc.getRoot().listMeshes()).toHaveLength(1);
    expect(doc.getRoot().listNodes()).toHaveLength(4);
  });

  it("turns away bytes that are not a glTF binary", async () => {
    expect(await copyModelInto(exportDoc(), new Uint8Array([1, 2, 3, 4]))).toBeNull();
  });

  it("turns away a model that needs an extension it can't read, such as Draco, as the upload check does", async () => {
    const draco = glbFromJson({
      asset: { version: "2.0" },
      extensionsUsed: ["KHR_draco_mesh_compression"],
      extensionsRequired: ["KHR_draco_mesh_compression"],
      scenes: [{ nodes: [] }],
      scene: 0,
    });
    expect(await copyModelInto(exportDoc(), draco)).toBeNull();
  });

  it("turns away a file with nothing in its scene", async () => {
    expect(await copyModelInto(exportDoc(), glbFromJson({ asset: { version: "2.0" }, scenes: [{ nodes: [] }], scene: 0 }))).toBeNull();
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `bash .superpowers/run-tests.sh vitest packages/renderer/src/export/modelCopy.test.ts`
Expected: FAIL with `Failed to resolve import "./modelCopy"`.

- [ ] **Step 4: Write `modelCopy.ts`**

```ts
import { Node as GltfNode, PropertyType, WebIO, type Document, type Property } from "@gltf-transform/core";

type PropertyClass<T extends Property> = new (graph: ReturnType<Document["getGraph"]>) => T;

/**
 * A fresh copy of a node tree that shares its meshes, materials and cameras.
 * `Node.clone()` can't do this: gltf-transform refuses to copy a node without
 * a resolver, because its children would end up with two parents.
 */
function cloneTree(doc: Document, node: GltfNode): GltfNode {
  const resolve = <T extends Property>(property: T): T =>
    property instanceof GltfNode ? (cloneTree(doc, property) as unknown as T) : property;
  return doc.createNode().copy(node, resolve);
}

/**
 * An uploaded model, copied into the export once. Each `place()` hands out
 * its node trees for one more object: the copies themselves the first time,
 * then fresh trees sharing the same meshes, so ten wastebins cost one model.
 */
export class ModelTemplate {
  private placed = 0;

  constructor(private readonly doc: Document, private readonly roots: readonly GltfNode[]) {}

  place(): GltfNode[] {
    this.placed += 1;
    return this.placed === 1 ? [...this.roots] : this.roots.map(root => cloneTree(this.doc, root));
  }
}

/**
 * Reads an uploaded .glb and copies its scene into `target`: its nodes, and
 * the meshes, materials, textures and accessors they use, all into the
 * target's one buffer, since a .glb may hold only one.
 *
 * It reads with no extensions registered, as the server's upload check does
 * (server/src/assets/inspect.ts). So a model needing one, such as Draco, was
 * never accepted, and is turned away here the same way. Optional extensions
 * are dropped. Null for anything it can't read or that has nothing in its scene.
 */
export async function copyModelInto(target: Document, bytes: Uint8Array): Promise<ModelTemplate | null> {
  let source: Document;
  try {
    source = await new WebIO().readBinary(bytes);
  } catch {
    return null;
  }
  const scene = source.getRoot().getDefaultScene() ?? source.getRoot().listScenes()[0];
  const nodes = scene?.listChildren() ?? [];
  if (nodes.length === 0) return null;

  const buffer = target.getRoot().listBuffers()[0] ?? target.createBuffer();
  const copies = new Map<Property, Property>();
  const resolve = <T extends Property>(property: T): T => {
    if (property.propertyType === PropertyType.BUFFER) return buffer as unknown as T;
    const known = copies.get(property);
    if (known) return known as T;
    const copy = new (property.constructor as PropertyClass<T>)(target.getGraph());
    copies.set(property, copy);
    copy.copy(property, resolve);
    return copy;
  };
  try {
    return new ModelTemplate(target, nodes.map(node => resolve(node)));
  } catch {
    return null;
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `bash .superpowers/run-tests.sh vitest packages/renderer/src/export`
Expected: PASS.

Run: `bash .superpowers/run-tests.sh tsc packages/renderer`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/renderer/src/export/modelCopy.ts packages/renderer/src/export/modelCopy.test.ts
git commit --only -m "feat(renderer): an uploaded model is copied into the 3D export once and placed any number of times" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- packages/renderer/src/export/modelCopy.ts packages/renderer/src/export/modelCopy.test.ts packages/renderer/src/export/testing.ts
```

---

### Task 6: Download 3D model

The button sits beside **3D** in Build (spec §6). It offers **This floor (L1)** and **All floors**. It fetches placed models through the existing asset URL, saves the file, and says in one line where the origin is, or how many models it couldn't fetch.

**Files:**
- Create: `packages/editor/src/ui/download.ts`
- Create: `packages/editor/src/ui/download.test.ts`
- Create: `packages/editor/src/build/DownloadModel.tsx`
- Create: `packages/editor/src/build/DownloadModel.test.tsx`
- Modify: `packages/editor/src/build/BuildWorkspace.tsx` (one import, one element)
- Modify: `packages/editor/src/build/BuildWorkspace.test.tsx` (one test)

**Interfaces:**
- Consumes: `buildFloorGlb`, `floorExportNote` and `type AssetBytes` from `@oth/renderer` (Task 2); `api.assetFileUrl`; `useEditorStore`, `Popover`, `PopoverClose`, `Button` and `toast`.
- Produces:
  - `downloadBytes(bytes: Uint8Array, filename: string, type: string): void` in `ui/download.ts`.
  - `assetFetcher(assetFileUrl: (id: string) => string, fetchImpl?: typeof fetch): { bytes: AssetBytes; missing: Set<string> }`.
  - `DownloadModelButton({ api, levelId }: { api: Api; levelId?: string })`, where `levelId` defaults to the active floor. Plan 6E's Finish step uses it.

- [ ] **Step 1: Write the failing tests**

`packages/editor/src/ui/download.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadBytes } from "./download";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("downloadBytes", () => {
  it("saves the bytes under the name given, then lets the blob go", () => {
    vi.useFakeTimers();
    const blobs: Blob[] = [];
    URL.createObjectURL = vi.fn((blob: Blob) => {
      blobs.push(blob);
      return "blob:model";
    });
    URL.revokeObjectURL = vi.fn();
    const saved: Array<{ download: string; href: string }> = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      saved.push({ download: this.download, href: this.href });
    });

    downloadBytes(new Uint8Array([1, 2, 3]), "oth-L1.glb", "model/gltf-binary");

    expect(saved).toEqual([{ download: "oth-L1.glb", href: "blob:model" }]);
    expect(blobs[0]!.type).toBe("model/gltf-binary");
    expect(blobs[0]!.size).toBe(3);
    // Kept a moment, so the browser has started saving before the blob goes.
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:model");
  });
});
```

`packages/editor/src/build/DownloadModel.test.tsx`:

```tsx
import { parseModel, type MapModel } from "@oth/model";
import { floorExportNote } from "@oth/renderer";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEditorStore } from "../state/store";
import { fakeApi } from "../testing/fakeApi";
import { useToasts } from "../ui/toast";
import { DownloadModelButton, assetFetcher } from "./DownloadModel";

/** The export itself is the renderer's, tested there; here it answers at once. */
const build = vi.hoisted(() => ({
  fn: vi.fn(async (_model: MapModel, _levelIds: string[], _assetBytes: (id: string) => Promise<Uint8Array | null>) =>
    new Uint8Array([1, 2, 3])),
}));
vi.mock("@oth/renderer", async importOriginal => ({
  ...(await importOriginal<typeof import("@oth/renderer")>()),
  buildFloorGlb: build.fn,
}));
const saved = vi.hoisted(() => ({ fn: vi.fn() }));
vi.mock("../ui/download", () => ({ downloadBytes: saved.fn }));

const model = parseModel({
  building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
  levels: [
    { id: "oth-L2", buildingId: "oth", code: "L2", ordinal: 2, nameEn: "Level 2", nameZh: "二楼", elevationM: 6, heightM: 4 },
    { id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "Level 1", nameZh: "一楼", elevationM: 0, heightM: 6 },
    { id: "oth-L9", buildingId: "oth", code: "L9", ordinal: 9, nameEn: "Level 9", nameZh: "九楼", elevationM: 40, heightM: 4, deletedAt: "2026-09-28T00:00:00.000Z" },
  ],
});

beforeEach(() => {
  build.fn.mockClear();
  saved.fn.mockClear();
  useToasts.getState().clear();
  const s = useEditorStore.getState();
  s.reset();
  s.setModel(model);
  s.setActiveLevel("oth-L1");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function choose(name: string, props: { levelId?: string } = {}) {
  render(<DownloadModelButton api={fakeApi()} {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "Download 3D model" }));
  fireEvent.click(await screen.findByRole("button", { name }));
}

const lastToast = () => useToasts.getState().toasts.at(-1);

describe("DownloadModelButton", () => {
  it("downloads the floor you're on as oth-L1.glb, and says where its origin is", async () => {
    await choose("This floor (L1)");
    await waitFor(() => expect(saved.fn).toHaveBeenCalledWith(new Uint8Array([1, 2, 3]), "oth-L1.glb", "model/gltf-binary"));
    expect(build.fn.mock.calls[0]![1]).toEqual(["oth-L1"]);
    expect(lastToast()).toMatchObject({ tone: "success", message: `Downloaded oth-L1.glb. ${floorExportNote(false)}` });
  });

  it("downloads every floor still on the map as oth-all-floors.glb, and says they're stacked", async () => {
    await choose("All floors");
    await waitFor(() => expect(saved.fn).toHaveBeenCalledWith(expect.any(Uint8Array), "oth-all-floors.glb", "model/gltf-binary"));
    expect([...build.fn.mock.calls[0]![1]].sort()).toEqual(["oth-L1", "oth-L2"]);
    expect(lastToast()?.message).toBe(`Downloaded oth-all-floors.glb. ${floorExportNote(true)}`);
  });

  it("downloads the floor it is given, for the setup wizard", async () => {
    await choose("This floor (L2)", { levelId: "oth-L2" });
    await waitFor(() => expect(saved.fn).toHaveBeenCalledWith(expect.any(Uint8Array), "oth-L2.glb", "model/gltf-binary"));
  });

  it("counts the models it couldn't fetch", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 404 })));
    build.fn.mockImplementationOnce(async (_model, _levelIds, assetBytes) => {
      await assetBytes("asset_1");
      return new Uint8Array([1]);
    });
    await choose("This floor (L1)");
    await waitFor(() => expect(lastToast()?.message)
      .toBe("Downloaded oth-L1.glb. 1 model could not be fetched, so its objects are boxes or left out."));
  });

  it("says so when the model can't be built, and saves nothing", async () => {
    build.fn.mockRejectedValueOnce(new Error("bad ring"));
    await choose("This floor (L1)");
    await waitFor(() => expect(lastToast()).toMatchObject({ tone: "error", message: "The 3D model could not be built: bad ring" }));
    expect(saved.fn).not.toHaveBeenCalled();
  });

  it("builds once, however soon it is pressed again", async () => {
    let finish: (bytes: Uint8Array) => void = () => {};
    build.fn.mockImplementationOnce(() => new Promise<Uint8Array>(resolve => {
      finish = resolve;
    }));
    await choose("This floor (L1)");
    expect((await screen.findByRole("button", { name: "Building 3D model…" })).hasAttribute("disabled")).toBe(true);
    finish(new Uint8Array([1]));
    await screen.findByRole("button", { name: "Download 3D model" });
    expect(build.fn).toHaveBeenCalledTimes(1);
  });

  it("waits for the map before it offers anything", () => {
    useEditorStore.getState().reset();
    render(<DownloadModelButton api={fakeApi()} />);
    expect(screen.getByRole("button", { name: "Download 3D model" }).hasAttribute("disabled")).toBe(true);
  });
});

describe("assetFetcher", () => {
  it("fetches a model through its asset URL, with the session", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, arrayBuffer: async () => new Uint8Array([7, 8]).buffer }));
    const { bytes, missing } = assetFetcher(id => `/api/assets/${id}/file`, fetchImpl as unknown as typeof fetch);
    expect(await bytes("asset_1")).toEqual(new Uint8Array([7, 8]));
    expect(fetchImpl).toHaveBeenCalledWith("/api/assets/asset_1/file", { credentials: "same-origin" });
    expect(missing.size).toBe(0);
  });

  it("counts a model that isn't there, and a request that fails, as missing", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 404 })
      .mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const { bytes, missing } = assetFetcher(id => `/api/assets/${id}/file`, fetchImpl as unknown as typeof fetch);
    expect(await bytes("gone")).toBeNull();
    expect(await bytes("offline")).toBeNull();
    expect([...missing]).toEqual(["gone", "offline"]);
  });
});
```

In `packages/editor/src/build/BuildWorkspace.test.tsx`, inside `describe("BuildWorkspace — the 3D preview", …)`, add:

```tsx
  it("offers Download 3D model beside 3D, with the preview off", () => {
    open("/floors/L1/build?step=rooms");
    const row = screen.getByRole("button", { name: "3D" }).parentElement!;
    expect(within(row).getByRole("button", { name: "Download 3D model" })).toBeTruthy();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bash .superpowers/run-tests.sh vitest packages/editor/src/ui/download.test.ts packages/editor/src/build/DownloadModel.test.tsx packages/editor/src/build/BuildWorkspace.test.tsx`
Expected: FAIL. `./download` and `./DownloadModel` are missing, and BuildWorkspace has no such button.

- [ ] **Step 3: Write `ui/download.ts`**

```ts
/**
 * Saves bytes as a file through the browser's download.
 *
 * Copied into a definite ArrayBuffer first: under TypeScript 5.9 a Uint8Array
 * may be backed by a SharedArrayBuffer as far as the types go, which Blob
 * rejects. The blob URL is let go a moment later rather than at once, so the
 * browser has started saving before it goes.
 */
export function downloadBytes(bytes: Uint8Array, filename: string, type: string): void {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  const url = URL.createObjectURL(new Blob([buffer], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
```

- [ ] **Step 4: Write `build/DownloadModel.tsx`**

```tsx
import { live } from "@oth/model";
import { buildFloorGlb, floorExportNote, type AssetBytes } from "@oth/renderer";
import { useState } from "react";
import type { Api } from "../api/client";
import { useEditorStore } from "../state/store";
import { Button } from "../ui/Button";
import { downloadBytes } from "../ui/download";
import { Popover, PopoverClose } from "../ui/Popover";
import { toast } from "../ui/toast";

/**
 * Fetches placed models through the asset URL, with the session. A model that
 * isn't there, or a request that fails, is null to the export and remembered
 * here, so the message after the download can say how many are missing.
 */
export function assetFetcher(
  assetFileUrl: (assetId: string) => string,
  fetchImpl: typeof fetch = fetch,
): { bytes: AssetBytes; missing: Set<string> } {
  const missing = new Set<string>();
  const bytes: AssetBytes = async assetId => {
    try {
      const res = await fetchImpl(assetFileUrl(assetId), { credentials: "same-origin" });
      if (res.ok) return new Uint8Array(await res.arrayBuffer());
    } catch {
      // Offline, or refused: the same as a model that isn't there.
    }
    missing.add(assetId);
    return null;
  };
  return { bytes, missing };
}

type Scope = "floor" | "all";

function missingNote(count: number): string {
  return count === 1
    ? "1 model could not be fetched, so its objects are boxes or left out."
    : `${count} models could not be fetched, so their objects are boxes or left out.`;
}

/**
 * Download 3D model (spec §6): the floor, or every floor stacked, as one .glb
 * of named parts, built from what the preview draws. It sits beside 3D in
 * Build, and the setup wizard's Finish step (Plan 6E) shows it for the floor
 * being set up.
 */
export function DownloadModelButton({ api, levelId }: { api: Api; levelId?: string }) {
  const model = useEditorStore(s => s.model);
  const activeLevelId = useEditorStore(s => s.activeLevelId);
  const [busy, setBusy] = useState(false);
  const floorId = levelId ?? activeLevelId;
  const level = model && floorId ? live(model.levels).find(l => l.id === floorId) ?? null : null;

  async function download(scope: Scope) {
    const current = useEditorStore.getState().model;
    if (!current || !level || busy) return;
    const levelIds = scope === "all" ? live(current.levels).map(l => l.id) : [level.id];
    const filename = scope === "all" ? "oth-all-floors.glb" : `oth-${level.code}.glb`;
    const fetcher = assetFetcher(api.assetFileUrl);
    setBusy(true);
    try {
      const bytes = await buildFloorGlb(current, levelIds, fetcher.bytes);
      downloadBytes(bytes, filename, "model/gltf-binary");
      const note = fetcher.missing.size === 0 ? floorExportNote(levelIds.length > 1) : missingNote(fetcher.missing.size);
      toast({ tone: "success", message: `Downloaded ${filename}. ${note}` });
    } catch (err) {
      toast({ tone: "error", message: `The 3D model could not be built: ${err instanceof Error ? err.message : String(err)}` });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Popover
      trigger={
        <Button size="sm" disabled={!level || busy}>
          {busy ? "Building 3D model…" : "Download 3D model"}
        </Button>
      }
    >
      <p className="mb-2 max-w-60 text-xs text-stone-600">
        Rooms, walls, voids, stops, objects and pathways as named parts, in metres. Walls are full height.
      </p>
      <div className="flex flex-col gap-1">
        {level && (
          <PopoverClose asChild>
            <Button size="sm" onClick={() => void download("floor")}>This floor ({level.code})</Button>
          </PopoverClose>
        )}
        <PopoverClose asChild>
          <Button size="sm" onClick={() => void download("all")}>All floors</Button>
        </PopoverClose>
      </div>
    </Popover>
  );
}
```

- [ ] **Step 5: Put it beside 3D**

In `packages/editor/src/build/BuildWorkspace.tsx`, add `import { DownloadModelButton } from "./DownloadModel";` after the `DraftsOnPlan` import. Then replace:

```tsx
            <PreviewToggle on={previewOn} onToggle={togglePreview} />
          </div>
```

with:

```tsx
            <PreviewToggle on={previewOn} onToggle={togglePreview} />
            <DownloadModelButton api={api} />
          </div>
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `bash .superpowers/run-tests.sh vitest packages/editor/src/ui/download.test.ts packages/editor/src/build/DownloadModel.test.tsx packages/editor/src/build/BuildWorkspace.test.tsx`
Expected: PASS.

Then typecheck. First refresh the renderer's declarations with the lock held: `npx tsc -b packages/renderer`. Then run:

Run: `bash .superpowers/run-tests.sh tsc packages/editor`
Expected: no errors.

- [ ] **Step 7: Check the file against the preview on the sandbox**

On a copy of the dev data, on :3055, never the live :3000. This step downloads both files from the real button, prints each file's node tree, renders each file with three's `GLTFLoader`, and screenshots the preview beside it. `$SCRATCH` is your session's scratchpad directory.

1. Build the editor the sandbox serves. It is a build, so take the lock by hand, from the worktree root: `until mkdir .superpowers/test.lock 2>/dev/null; do sleep 15; done`, then `npm run build -w @oth/editor`, then `rm -rf .superpowers/test.lock`.
2. Copy the data: `mkdir -p "$SCRATCH/export-check/data"`, then `cp -r C:/Users/qhuip/Repositories/oth_navigation/packages/server/data/. "$SCRATCH/export-check/data/"`.
3. From `packages/server`, start the sandbox in the background: `DATA_DIR="$SCRATCH/export-check/data" PORT=3055 npx tsx src/index.ts`. Wait until `http://localhost:3055/api/auth/people` answers.
4. Write `$SCRATCH/export-check/viewer.html`:

```html
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>html, body { margin: 0; background: #fff; }</style>
<script type="importmap">{ "imports": { "three": "/three/build/three.module.js", "three/addons/": "/three/examples/jsm/" } }</script>
</head>
<body>
<script type="module">
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
try {
  const file = new URLSearchParams(location.search).get("file");
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(1200, 800);
  // As react-three-fiber sets it for the preview.
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  document.body.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#ffffff");
  // MapScene's lights.
  scene.add(new THREE.AmbientLight(0xffffff, 0.7));
  const sun = new THREE.DirectionalLight(0xffffff, 1.1);
  sun.position.set(60, 120, 40);
  scene.add(sun);
  const gltf = await new GLTFLoader().loadAsync("/files/" + file);
  scene.add(gltf.scene);
  // MapScene's framing: centred on the floor, from the south-east and above.
  const box = new THREE.Box3().setFromObject(gltf.scene);
  const centre = box.getCenter(new THREE.Vector3());
  const span = Math.max(box.max.x - box.min.x, box.max.z - box.min.z, 10);
  const camera = new THREE.PerspectiveCamera(45, 1200 / 800, 0.1, 5000);
  camera.position.set(centre.x + span * 0.8, box.min.y + span * 0.9, centre.z + span * 0.8);
  camera.lookAt(centre.x, box.min.y, centre.z);
  renderer.render(scene, camera);
  window.rendered = true;
} catch (err) {
  window.failed = String(err);
}
</script>
</body>
</html>
```

5. Write `$SCRATCH/export-check/check.cjs`:

```js
// Downloads the 3D export from the :3055 sandbox, prints its node tree,
// renders it with three's GLTFLoader, and screenshots the preview beside it.
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("C:/Users/qhuip/Repositories/my_library/node_modules/playwright");
const { WebIO, getBounds } = require("C:/Users/qhuip/Repositories/oth_navigation/.claude/worktrees/ux-overhaul/node_modules/@gltf-transform/core");

const BASE = "http://localhost:3055";
const OUT = __dirname;
const THREE_DIR = "C:/Users/qhuip/Repositories/oth_navigation/.claude/worktrees/ux-overhaul/node_modules/three";
const FLOOR = process.argv[2] || "L1";

async function summarise(file) {
  const doc = await new WebIO().readBinary(new Uint8Array(fs.readFileSync(file)));
  for (const floor of doc.getRoot().getDefaultScene().listChildren()) {
    console.log(`${floor.getName()}, raised ${floor.getTranslation()[1]} m`);
    for (const part of floor.listChildren()) {
      const count = part.listChildren().length;
      const b = count > 0 ? getBounds(part) : null;
      const extent = b
        ? `  x ${b.min[0].toFixed(1)}..${b.max[0].toFixed(1)}  y ${b.min[1].toFixed(2)}..${b.max[1].toFixed(2)}  z ${b.min[2].toFixed(1)}..${b.max[2].toFixed(1)}`
        : "";
      console.log(`  ${part.getName()}: ${count}${extent}`);
    }
  }
  console.log("  extras:", JSON.stringify(doc.getRoot().getExtras()));
}

(async () => {
  const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, acceptDownloads: true });
  const { people } = await (await page.request.get(`${BASE}/api/auth/people`)).json();
  await page.request.post(`${BASE}/api/auth/login`, { data: { userId: people[0].id } });

  await page.goto(`${BASE}/floors/${FLOOR}/build?step=rooms`);
  const toggle = page.getByRole("button", { name: "3D", exact: true });
  await toggle.waitFor();
  if ((await toggle.getAttribute("aria-pressed")) !== "true") await toggle.click();
  for (const name of ["Full-height walls", "Larger"]) {
    const option = page.getByRole("button", { name, exact: true });
    if ((await option.getAttribute("aria-pressed")) !== "true") await option.click();
  }
  await page.waitForTimeout(4000);
  await page.getByRole("region", { name: "3D preview" }).screenshot({ path: path.join(OUT, `preview-${FLOOR}.png`) });

  const files = [[`This floor (${FLOOR})`, `oth-${FLOOR}.glb`], ["All floors", "oth-all-floors.glb"]];
  for (const [choice, file] of files) {
    await page.getByRole("button", { name: "Download 3D model" }).click();
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: choice, exact: true }).click(),
    ]);
    await download.saveAs(path.join(OUT, file));
    console.log(`${file} (saved as ${download.suggestedFilename()})`);
    await summarise(path.join(OUT, file));
  }

  const viewer = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  await viewer.route("http://glb.check/**", route => {
    const url = new URL(route.request().url());
    if (url.pathname === "/") return route.fulfill({ path: path.join(OUT, "viewer.html") });
    if (url.pathname.startsWith("/three/")) return route.fulfill({ path: path.join(THREE_DIR, url.pathname.slice("/three/".length)) });
    if (url.pathname.startsWith("/files/")) return route.fulfill({ path: path.join(OUT, url.pathname.slice("/files/".length)) });
    return route.fulfill({ status: 404, body: "" });
  });
  for (const [, file] of files) {
    await viewer.goto(`http://glb.check/?file=${file}`);
    await viewer.waitForFunction(() => window.rendered === true || Boolean(window.failed), null, { timeout: 60000 });
    const failed = await viewer.evaluate(() => window.failed);
    if (failed) throw new Error(`${file}: ${failed}`);
    await viewer.screenshot({ path: path.join(OUT, `file-${file.replace(".glb", "")}.png`) });
  }
  await browser.close();
})().catch(err => {
  console.error(err);
  process.exit(1);
});
```

6. Run it with the lock held: `until mkdir .superpowers/test.lock 2>/dev/null; do sleep 15; done`, then `node "$SCRATCH/export-check/check.cjs" L1`, then `rm -rf .superpowers/test.lock`.
7. Read the printed tree. Each floor lists its six parts in order. Walls reach each room's full height, not 1.2 m. In the all-floors file, L2 is raised by its elevation.
8. Open `preview-L1.png` beside `file-oth-L1.png` and `file-oth-all-floors.png`, and check:
   - the same rooms in the same tints;
   - full-height walls with the same doorway gaps;
   - railed voids;
   - lift shafts and escalator flights in the same places;
   - pathway strips;
   - the all-floors file stacks L2 above L1.
   The preview's labels, marker poles and ghosted floor below are expected to be missing from the file.
9. Stop only the sandbox. In PowerShell: `Get-NetTCPConnection -LocalPort 3055 -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }`.

Put the tree and any differences in the task report. Fix only bugs in this plan's code.

- [ ] **Step 8: Commit**

Check `git diff -- packages/editor/src/build/BuildWorkspace.tsx` shows only your two lines. Then:

```bash
git add packages/editor/src/ui/download.ts packages/editor/src/ui/download.test.ts packages/editor/src/build/DownloadModel.tsx packages/editor/src/build/DownloadModel.test.tsx
git commit --only -m "feat(editor): Download 3D model, beside 3D in Build, saves this floor or all floors as one .glb" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- packages/editor/src/ui/download.ts packages/editor/src/ui/download.test.ts packages/editor/src/build/DownloadModel.tsx packages/editor/src/build/DownloadModel.test.tsx packages/editor/src/build/BuildWorkspace.tsx packages/editor/src/build/BuildWorkspace.test.tsx
```

---

### Task 7: Retire *Export context for Blender*

Spec §6: the new button replaces it. The per-detail export (`DetailExportButton`, `buildDetailGlb`, `detailContextRooms`, `wallGeometry`) and `CONTEXT_ORIGIN_NOTE` stay, because the detail export and Task 2 still use them.

**Files:**
- Delete: `packages/editor/src/panels/ContextExportButton.tsx`
- Modify: `packages/editor/src/build/StepTools.tsx`
- Modify: `packages/editor/src/build/StepTools.test.tsx`
- Modify: `packages/renderer/src/contextExport.ts`
- Modify: `packages/renderer/src/contextExport.test.ts`
- Modify: `packages/renderer/src/walls.ts` (a comment)
- Modify: `README.md` (step 1 of the Blender round trip)

**Interfaces:**
- Consumes: nothing new.
- Produces: `buildContextGlb` and `ContextExportButton` no longer exist. Nothing else in the repo imports them: checked on 2026-09-28 with a search of `packages/`, `e2e/` and the README.

- [ ] **Step 1: Change the test to the new behaviour**

In `packages/editor/src/build/StepTools.test.tsx`, replace:

```tsx
  it("offers the level's context for Blender", () => {
    openModels();
    expect(screen.getByRole("button", { name: /Export context for Blender/ })).toBeTruthy();
  });
```

with:

```tsx
  it("leaves the floor's export to Download 3D model, beside 3D", () => {
    openModels();
    expect(screen.queryByRole("button", { name: /Export context for Blender/ })).toBeNull();
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bash .superpowers/run-tests.sh vitest packages/editor/src/build/StepTools.test.tsx`
Expected: FAIL. The button is still there.

- [ ] **Step 3: Take the old export out**

1. Run `git rm packages/editor/src/panels/ContextExportButton.tsx`.
2. In `packages/editor/src/build/StepTools.tsx`:
   - delete `import { ContextExportButton } from "../panels/ContextExportButton";`;
   - delete the `<ContextExportButton />` line;
   - replace the comment `/** Dressing: the level out to Blender, and the models back in. */` with `/** Dressing: the models back in from Blender. The whole floor goes out with Download 3D model, beside 3D. */`.
3. In `packages/renderer/src/contextExport.ts`:
   - delete `buildContextGlb` and its doc comment, from `/**` above `* Exports a selection of rooms as locked reference geometry for Blender or Rhino.` down to the function's closing `}`;
   - replace the `CONTEXT_ORIGIN_NOTE` comment with:

```ts
/**
 * Documented so a modeller never has to guess where the origin is. The
 * whole-floor export (export/floorGlb.ts) writes it into its file's generator
 * and copyright, and the editor repeats it after the download.
 */
```

4. In `packages/renderer/src/contextExport.test.ts`:
   - change the import to `import { buildDetailGlb, detailContextRooms } from "./contextExport";`;
   - delete the `lobby` and `shop` fixtures, which only `buildContextGlb`'s tests used;
   - delete the whole `describe("buildContextGlb", …)` block.
5. In `packages/renderer/src/walls.ts`, replace `These exist for the Blender context export, not for the visitor app` with `These exist for the Blender detail export (buildDetailGlb), not for the visitor app`.
6. In `README.md`, replace step 1 of "The Blender round trip":

```markdown
1. **Export context** in the editor writes a `.glb` of the active level — floor
   slabs and walls as locked reference geometry, in real metres, with the origin
   convention recorded inside the file so it cannot be guessed wrong later.
```

with:

```markdown
1. **Download 3D model**, beside **3D** in Build, writes a `.glb` of the floor,
   or of every floor stacked at its elevation: rooms, walls with their doors,
   voids, stops, objects and pathways as named parts, in real metres, with the
   origin convention recorded inside the file so it cannot be guessed wrong
   later. To model one detail, select it and use its **Export … for Blender**:
   a block of its size with its surroundings, centred on itself.
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bash .superpowers/run-tests.sh vitest packages/editor/src/build/StepTools.test.tsx packages/renderer/src/contextExport.test.ts`
Expected: PASS.

Run `npx tsc -b packages/renderer` with the lock held, as in Task 6. Then:

Run: `bash .superpowers/run-tests.sh tsc packages/renderer`
Run: `bash .superpowers/run-tests.sh tsc packages/editor`
Expected: no errors, and nothing left unused in `contextExport.ts` or its test.

- [ ] **Step 5: Commit**

```bash
git commit --only -m "refactor(editor,renderer): Download 3D model replaces Export context for Blender" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- packages/editor/src/panels/ContextExportButton.tsx packages/editor/src/build/StepTools.tsx packages/editor/src/build/StepTools.test.tsx packages/renderer/src/contextExport.ts packages/renderer/src/contextExport.test.ts packages/renderer/src/walls.ts README.md
```

---

### Task 8: Objects (**needs 6A merged**)

Each placement on the floor becomes one node in `Objects`, at its position, rotation and scale (spec §5.3):
- the model named by its own `assetId` or its kind's, copied in once per model (Task 5);
- or, while its kind has no model, a box of the kind's size, built once per kind;
- a model that won't come falls back to the kind's box, or leaves the node empty, and is listed in the file's extras.

**Files:**
- Create: `packages/renderer/src/placementTransform.ts`
- Create: `packages/renderer/src/placementTransform.test.ts`
- Modify: `packages/renderer/src/PlacementMesh.tsx` (and 6A's box mesh, wherever 6A draws it)
- Modify: `packages/renderer/src/export/floorGlb.ts`
- Modify: `packages/renderer/src/export/floorGlb.test.ts` (append)

**Interfaces:**
- Consumes:
  - from 6A: `ObjectKindSchema`, `type ObjectKind`, `model.objectKinds`, `Placement.objectKindId` and optional `Placement.assetId`, `placementModelAsset(model, placement): string | undefined`, and `objectBoxGeometry(size: { w: number; d: number; h: number }): THREE.BufferGeometry` (base centre at the origin);
  - from Task 5: `copyModelInto` and `ModelTemplate`;
  - from Task 2: `GlbWriter.geometryMesh`.
- Produces:
  - `placementTransform(placement: Pick<Placement, "position" | "rotationDeg" | "scale">): PlacementTransform`, where `PlacementTransform = { position: [number, number, number]; rotationY: number; scale: number }`, in `placementTransform.ts`;
  - `type MissingModel = { placementId: string; assetId: string }`, exported from `floorGlb.ts`;
  - `extras.othExport.missingModels: MissingModel[]` on the file's root;
  - object nodes carry `extras: { othId, objectKindId, assetId }`.

- [ ] **Step 1: Check 6A is in**

Run `git log --oneline -30` and check that 6A's commits are there. Then check these exist:
- `export function objectBoxGeometry` in `packages/renderer/src/objectBox.ts`;
- `placementModelAsset` and `ObjectKindSchema` exported from `@oth/model`: grep `packages/model/src/index.ts` and `packages/model/src/objects.ts`;
- `objectKinds` in `MapModelSchema`.

If any is missing, stop and tell the controller: it is 6A's contract (interfaces.md).

Also read `objectBox.ts`. If it exports the colour 6A's preview box uses, Step 5 imports that instead of `roomColor("detail")`.

- [ ] **Step 2: Write the failing tests**

`packages/renderer/src/placementTransform.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { placementTransform } from "./placementTransform";

describe("placementTransform", () => {
  it("stands a placement where the plan puts it, its height up Y and north toward -Z", () => {
    expect(placementTransform({ position: [10, -3, 0.5], rotationDeg: 0, scale: 1 }).position).toEqual([10, 0.5, 3]);
  });

  it("turns it about the vertical axis, in radians", () => {
    expect(placementTransform({ position: [0, 0, 0], rotationDeg: 90, scale: 1 }).rotationY).toBeCloseTo(Math.PI / 2);
  });

  it("keeps its scale", () => {
    expect(placementTransform({ position: [0, 0, 0], rotationDeg: 0, scale: 2.5 }).scale).toBe(2.5);
  });
});
```

In `floorGlb.test.ts`, change the `@oth/model` import to add `AssetSchema` and `ObjectKindSchema`, and add these imports:

```ts
import type { Node as GltfNode } from "@gltf-transform/core";
import { objectBoxGeometry } from "../objectBox";
```

Also add `triangleGlb` to the `./testing` import. Then append:

```ts
describe("buildFloorGlb — Objects", () => {
  const bin = ObjectKindSchema.parse({ id: "ok-bin", nameEn: "wastebin", size: { w: 0.6, d: 0.4, h: 1 } });
  const cooler = ObjectKindSchema.parse({ id: "ok-cooler", nameEn: "water cooler", size: { w: 0.5, d: 0.5, h: 1.4 }, assetId: "asset-cooler" });
  const place = (id: string, extra: Record<string, unknown>) =>
    PlacementSchema.parse({ id, levelId: "oth-L1", position: [5, -5, 0], ...extra });
  const withObjects: MapModel = {
    ...floorModel,
    objectKinds: [bin, cooler],
    assets: [AssetSchema.parse({
      id: "asset-vend", filename: "vending machine.glb", storagePath: "assets/vend.glb", checksum: "c",
      sizeBytes: 100, triangleCount: 1, bbox: { minX: 0, minY: 0, minZ: 0, maxX: 2, maxY: 1, maxZ: 0 },
    })],
    placements: [
      place("pm-bin-1", { objectKindId: "ok-bin", position: [5, -5, 0] }),
      place("pm-bin-2", { objectKindId: "ok-bin", position: [8, -5, 0] }),
      place("pm-cooler", { objectKindId: "ok-cooler", position: [10, -3, 0], rotationDeg: 90 }),
      place("pm-cooler-2", { objectKindId: "ok-cooler", position: [11, -3, 0] }),
      place("pm-own", { objectKindId: "ok-bin", assetId: "asset-fancy", position: [12, -3, 0] }),
      place("pm-vend", { assetId: "asset-vend", position: [15, -2, 0] }),
      place("pm-broken", { assetId: "asset-missing", position: [16, -2, 0] }),
      place("pm-gone", { objectKindId: "ok-bin", deletedAt: DELETED }),
      place("pm-up", { objectKindId: "ok-bin", levelId: "oth-L2" }),
    ],
  };

  async function exportWith(model: MapModel, levelIds: string[], broken: string[] = ["asset-missing"]) {
    const asked: string[] = [];
    const glb = await triangleGlb();
    const bytes = await buildFloorGlb(model, levelIds, async assetId => {
      asked.push(assetId);
      return broken.includes(assetId) ? null : glb;
    });
    return { doc: await readGlb(bytes), asked };
  }
  const byId = (objects: GltfNode, id: string) => {
    const found = objects.listChildren().find(n => n.getExtras().othId === id);
    if (!found) throw new Error(`No object ${id}`);
    return found;
  };
  const boxBounds = () => {
    const box = objectBoxGeometry(bin.size);
    box.computeBoundingBox();
    return box.boundingBox!;
  };

  it("places one node per live object on the floor, named after its kind, its model's file, or its id", async () => {
    const { doc } = await exportWith(withObjects, ["oth-L1"]);
    expect(names(group(doc, "L1", "Objects")))
      .toEqual(["wastebin", "wastebin", "water cooler", "water cooler", "wastebin", "vending machine", "pm-broken"]);
    expect(byId(group(doc, "L1", "Objects"), "pm-cooler").getExtras())
      .toEqual({ othId: "pm-cooler", objectKindId: "ok-cooler", assetId: "asset-cooler" });
  });

  it("builds a kind with no model as a box of its size, standing where the object is", async () => {
    const { doc } = await exportWith(withObjects, ["oth-L1"]);
    const got = bounds(byId(group(doc, "L1", "Objects"), "pm-bin-1"));
    const want = boxBounds();
    // The object stands at plan (5, -5), which is x = 5, z = 5.
    expect(got.minX).toBeCloseTo(5 + want.min.x);
    expect(got.maxX).toBeCloseTo(5 + want.max.x);
    expect(got.minY).toBeCloseTo(want.min.y);
    expect(got.maxY).toBeCloseTo(want.max.y);
    expect(got.minZ).toBeCloseTo(5 + want.min.z);
    expect(got.maxZ).toBeCloseTo(5 + want.max.z);
  });

  it("shares one box between the objects of one kind", async () => {
    const { doc } = await exportWith(withObjects, ["oth-L1"]);
    const objects = group(doc, "L1", "Objects");
    const box = (id: string) => byId(objects, id).listChildren()[0]!.getMesh();
    expect(box("pm-bin-2")).toBe(box("pm-bin-1"));
    expect(doc.getRoot().listMeshes().filter(m => m.getName() === "wastebin box")).toHaveLength(1);
  });

  it("builds a kind with a model from its model, turned as the object is turned", async () => {
    const { doc } = await exportWith(withObjects, ["oth-L1"]);
    const turned = bounds(byId(group(doc, "L1", "Objects"), "pm-cooler"));
    // The triangle runs 2 m along x and 1 m up. At plan (10, -3), turned 90°, it runs from z = 3 toward -z.
    expect(turned.minX).toBeCloseTo(10);
    expect(turned.maxX).toBeCloseTo(10);
    expect(turned.minZ).toBeCloseTo(1);
    expect(turned.maxZ).toBeCloseTo(3);
    expect(turned.maxY).toBeCloseTo(1);
  });

  it("uses an object's own model over its kind's box", async () => {
    const { doc } = await exportWith(withObjects, ["oth-L1"]);
    expect(names(byId(group(doc, "L1", "Objects"), "pm-own"))).toEqual(["body"]);
  });

  it("fetches and copies each model once, however many objects use it", async () => {
    const { doc, asked } = await exportWith(withObjects, ["oth-L1", "oth-L2"]);
    expect([...asked].sort()).toEqual(["asset-cooler", "asset-fancy", "asset-missing", "asset-vend"]);
    // Two coolers, one fancy bin and one vending machine: three models, not four.
    expect(doc.getRoot().listMeshes().filter(m => m.getName() === "bin")).toHaveLength(3);
  });

  it("leaves an object whose model won't come empty, and lists it in the file", async () => {
    const { doc } = await exportWith(withObjects, ["oth-L1"]);
    expect(byId(group(doc, "L1", "Objects"), "pm-broken").listChildren()).toEqual([]);
    expect(doc.getRoot().getExtras()).toMatchObject({
      othExport: { missingModels: [{ placementId: "pm-broken", assetId: "asset-missing" }] },
    });
  });

  it("falls back to the kind's box when the kind's model won't come", async () => {
    const { doc } = await exportWith(withObjects, ["oth-L1"], ["asset-cooler"]);
    expect(names(byId(group(doc, "L1", "Objects"), "pm-cooler"))).toEqual(["water cooler box"]);
  });

  it("still writes the file when fetching models fails outright", async () => {
    const bytes = await buildFloorGlb(withObjects, ["oth-L1"], async () => {
      throw new Error("offline");
    });
    expect(names(group(await readGlb(bytes), "L1", "Objects"))).toHaveLength(7);
  });

  it("stacks a floor's objects with it", async () => {
    const { doc } = await exportWith(withObjects, ["oth-L1", "oth-L2"]);
    expect(bounds(byId(group(doc, "L2", "Objects"), "pm-up")).minY).toBeCloseTo(6 + boxBounds().min.y);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `bash .superpowers/run-tests.sh vitest packages/renderer/src/placementTransform.test.ts packages/renderer/src/export/floorGlb.test.ts`
Expected: FAIL. `./placementTransform` is missing, and the Objects group is empty.

- [ ] **Step 4: Write `placementTransform.ts`, and use it in the preview**

```ts
import type { Placement } from "@oth/model";
import { modelToThree } from "./coords";

/** Where a placed model or box stands, in three.js terms. The preview and the export both use it, so they agree. */
export type PlacementTransform = { position: [number, number, number]; rotationY: number; scale: number };

/**
 * A placement's position is plan metres plus its height above the floor.
 * It turns about the vertical axis only (Plan 5's placement rule).
 */
export function placementTransform(placement: Pick<Placement, "position" | "rotationDeg" | "scale">): PlacementTransform {
  const [x, y, height] = placement.position;
  return {
    position: modelToThree(x, y, height),
    rotationY: (placement.rotationDeg * Math.PI) / 180,
    scale: placement.scale,
  };
}
```

In `packages/renderer/src/PlacementMesh.tsx`, replace the `modelToThree` import with `import { placementTransform } from "./placementTransform";`. Then replace the body of `PlacementMesh` with:

```tsx
  const { scene } = useGLTF(url);
  const t = placementTransform(placement);
  return <primitive object={scene.clone()} position={t.position} rotation={[0, t.rotationY, 0]} scale={t.scale} />;
```

If 6A has already changed these lines, or also draws a kind's box elsewhere, make the same change wherever a placement's position, rotation and scale become three.js props. The preview and the file must use one transform. Keep 6A's behaviour otherwise.

- [ ] **Step 5: Build the Objects group**

In `floorGlb.ts`, replace the import block with:

```ts
import type { Mesh, Node as GltfNode, Scene } from "@gltf-transform/core";
import { live, placementModelAsset, type Level, type MapModel, type ObjectKind, type Room } from "@oth/model";
import { blocksGeometry, quadsGeometry, type Block } from "../blocks";
import { CATEGORY_TINT, roomTints } from "../categoryTint";
import { CONTEXT_ORIGIN_NOTE } from "../contextExport";
import { modelToThree } from "../coords";
import { roomsToDraw } from "../LevelGroup";
import { floorColour, railBlock, roomFloorGeometry, wallBlock } from "../levelParts";
import { massingOf } from "../massing";
import { objectBoxGeometry } from "../objectBox";
import { STRIP_HEIGHT_M, STRIP_OPACITY, pathwayColour, stripQuads } from "../pathwayStrips";
import { placementTransform } from "../placementTransform";
import { PORTAL_COLOUR, SHAFT_OPACITY, flightColour, portalParts, shaftBlocks } from "../portals";
import { levelStructure, type LevelStructure } from "../structure";
import { roomColor, wallColor } from "../theme";
import { BALUSTRADE_COLOUR, BALUSTRADE_OPACITY } from "../voids";
import { GlbWriter, type Paint } from "./gltfWrite";
import { copyModelInto, type ModelTemplate } from "./modelCopy";
```

Add these above `buildFloorGlb`:

```ts
/**
 * A kind with no model yet is a box in a neutral colour (spec §5.3). This is
 * the colour the preview gives a detail, which is also a thing standing on
 * the floor. If 6A's objectBox.ts exports its box's colour, use that here
 * instead, so the file and the preview agree.
 */
const OBJECT_BOX_PAINT: Paint = { name: "object box", colour: roomColor("detail") };

/** An object whose model couldn't be fetched or read. The file's extras list them, so a gap explains itself later. */
export type MissingModel = { placementId: string; assetId: string };

/**
 * Each model fetched and copied into the file once, however many objects use
 * it, and each kind's box built once. A fetch that fails or throws, or bytes
 * this can't read, count as no model.
 */
class ModelShelf {
  readonly missing: MissingModel[] = [];
  private readonly models = new Map<string, Promise<ModelTemplate | null>>();
  private readonly boxes = new Map<string, Mesh | null>();

  constructor(private readonly writer: GlbWriter, private readonly assetBytes: AssetBytes) {}

  model(assetId: string): Promise<ModelTemplate | null> {
    let model = this.models.get(assetId);
    if (!model) {
      model = Promise.resolve()
        .then(() => this.assetBytes(assetId))
        .then(bytes => (bytes ? copyModelInto(this.writer.doc, bytes) : null))
        .catch(() => null);
      this.models.set(assetId, model);
    }
    return model;
  }

  box(kind: ObjectKind): Mesh | null {
    if (!this.boxes.has(kind.id)) {
      const name = `${label(kind.nameEn, kind.id)} box`;
      this.boxes.set(kind.id, this.writer.geometryMesh(name, objectBoxGeometry(kind.size), OBJECT_BOX_PAINT));
    }
    return this.boxes.get(kind.id) ?? null;
  }
}

function objectName(kind: ObjectKind | undefined, file: string | undefined, placementId: string): string {
  if (kind) return label(kind.nameEn, kind.id);
  return file?.replace(/\.glb$/i, "").trim() || placementId;
}

/**
 * Objects: one node per placement on this floor, at its position, rotation and
 * scale (spec §5.3). Under it is its own model or its kind's, or, while the
 * kind has none, a box of the kind's size.
 */
async function addObjects(ctx: FloorContext, shelf: ModelShelf): Promise<void> {
  const kinds = new Map(live(ctx.model.objectKinds).map(k => [k.id, k]));
  const files = new Map(live(ctx.model.assets).map(a => [a.id, a.filename]));
  for (const placement of live(ctx.model.placements)) {
    if (placement.levelId !== ctx.level.id) continue;
    const kind = placement.objectKindId ? kinds.get(placement.objectKindId) : undefined;
    const assetId = placementModelAsset(ctx.model, placement);
    const t = placementTransform(placement);
    const node = ctx.writer.doc.createNode(objectName(kind, assetId ? files.get(assetId) : undefined, placement.id))
      .setTranslation(t.position)
      .setRotation([0, Math.sin(t.rotationY / 2), 0, Math.cos(t.rotationY / 2)])
      .setScale([t.scale, t.scale, t.scale])
      .setExtras({ othId: placement.id, objectKindId: kind?.id ?? null, assetId: assetId ?? null });
    ctx.groups.Objects.addChild(node);

    const model = assetId ? await shelf.model(assetId) : null;
    if (assetId && !model) shelf.missing.push({ placementId: placement.id, assetId });
    if (model) {
      for (const root of model.place()) node.addChild(root);
    } else if (kind) {
      const box = shelf.box(kind);
      if (box) node.addChild(ctx.writer.doc.createNode(`${label(kind.nameEn, kind.id)} box`).setMesh(box));
    }
  }
}
```

Then replace `buildFloorGlb` with:

```ts
/**
 * The floors asked for, as one .glb of named parts (spec §6), built from the
 * preview's own geometry. Floors come out lowest first; ids of deleted or
 * unknown floors are skipped. Placed models come through `assetBytes`, once
 * each; one that can't be had never stops the file.
 */
export async function buildFloorGlb(
  model: MapModel,
  levelIds: string[],
  assetBytes: AssetBytes,
): Promise<Uint8Array> {
  const wanted = new Set(levelIds);
  const levels = live(model.levels).filter(l => wanted.has(l.id)).sort((a, b) => a.ordinal - b.ordinal);
  const stacked = levels.length > 1;
  const writer = new GlbWriter();
  const shelf = new ModelShelf(writer, assetBytes);
  const scene = writer.doc.createScene(model.building.id);
  writer.doc.getRoot().setDefaultScene(scene);
  for (const level of levels) {
    const ctx = floorContext(writer, scene, model, level, stacked);
    addFloors(ctx);
    addWalls(ctx);
    addVoids(ctx);
    addStops(ctx);
    await addObjects(ctx, shelf);
    addPathways(ctx);
  }
  writer.setNote(floorExportNote(stacked), { floors: levels.map(l => l.code), missingModels: shelf.missing });
  return writer.write();
}
```

If Step 1 found a box colour exported from `objectBox.ts`, import it and use it in `OBJECT_BOX_PAINT` in place of `roomColor("detail")`. Then drop `roomColor` from the theme import if nothing else uses it.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `bash .superpowers/run-tests.sh vitest packages/renderer/src/placementTransform.test.ts packages/renderer/src/PlacementMesh.test.ts packages/renderer/src/export`
Expected: PASS.

Run: `bash .superpowers/run-tests.sh vitest packages/renderer/src`
Expected: PASS, 6A's object tests included.

Run: `bash .superpowers/run-tests.sh tsc packages/renderer`
Expected: no errors.

- [ ] **Step 7: Check the objects on the sandbox**

Repeat Task 6 Step 7 with a fresh copy of the data and a fresh editor build. If the copy has no objects on L1, place one of each first (6A's object markers):
- one of a kind with no model, such as "wastebin";
- one of a kind with the uploaded model.

The printed tree should show `Objects` with one node per object. The file's render should show the box and the model where the preview shows them, turned the same way. Put the tree and any differences in the task report.

- [ ] **Step 8: Commit**

```bash
git add packages/renderer/src/placementTransform.ts packages/renderer/src/placementTransform.test.ts
git commit --only -m "feat(renderer): the 3D export places each object as its kind's model or its sized box" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- packages/renderer/src/placementTransform.ts packages/renderer/src/placementTransform.test.ts packages/renderer/src/PlacementMesh.tsx packages/renderer/src/export/floorGlb.ts packages/renderer/src/export/floorGlb.test.ts
```

If Step 4 changed another of 6A's files for the box's transform, add its path to both lines.

## Ship

With 6A, after Task 8:
1. The controller runs the whole suite.
2. Someone tries **Download 3D model** on the :3055 sandbox copy, for **This floor** and **All floors**, and opens the file in Blender.
3. It deploys to Railway.

Teammate note: ***Download 3D model**, beside **3D** in Build, saves the floor or every floor as one `.glb`: rooms, walls with their doors, voids, lifts and escalators, objects and pathways, as named parts in metres. It replaces Export context for Blender.*
