# Details and the Dressing Round Trip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A drawn *detail* polygon that briefs a modeller with real dimensions, anchors the mesh they build, and checks that it fits.

**Architecture:** A detail is a fifth `RoomKind`, so it inherits the polygon tool, vertex editing, layers, selection, locking and the exporter unchanged; what differs is meaning, and meaning is what `kind` carries. The one new piece of geometry is an export translated so the detail's centroid sits at the origin, with the same offset handed back as the placement's position — which is what makes the mesh land where it was modelled and still be reusable elsewhere.

**Tech Stack:** TypeScript, Zod, @gltf-transform, React, three.js / R3F, Vitest. No new dependencies.

**Spec:** [`docs/design-and-plans/specs/2026-09-05-details-and-dressing-design.md`](../specs/2026-09-05-details-and-dressing-design.md)

> **Status:** complete, 2026-09-05.
> One thing the plan under-specified: Dressing had deliberately been a
> section with no status dot, so giving it a step needed the section to keep
> `status: null` while still carrying the step's tool, count and warnings.

## Global Constraints

- **A detail is never walkable and never a destination.** It contributes no cells to the nav grid and raises no access or name warnings.
- **Details do not block navigation** in this work. `bakeNavGrid` filters to `walkable` rooms, so this holds with no code — do not "fix" it.
- **The detail export is centred on the detail; the level export is not.** A placement's `position` is the offset its export used: `[0,0,0]` for a level context mesh, the detail centroid for a detail mesh.
- Context margin around a detail: **10 m**. Default detail height: **1.2 m**.
- Run `npm run typecheck` as its own step and read it **before** committing.
- Stage explicit paths. Never `git add -A` — `docs/OTH_Project_Plan.*` and `docs/figures/` are the user's and must stay untracked.

---

## File Structure

| File | Responsibility |
|---|---|
| `packages/model/src/schema/structure.ts` | `RoomKind` gains `detail` |
| `packages/model/src/geometry/ring.ts` | `ringCentroid` — area-weighted, not a vertex average |
| `packages/model/src/validation/rules/warnings.ts` | details exempt from the name warning; `detail.undressed` |
| `packages/renderer/src/theme.ts` | the detail colour |
| `packages/renderer/src/contextExport.ts` | `detailContextRooms`, `buildDetailGlb` |
| `packages/renderer/src/LevelGroup.tsx` | a dressed detail draws no placeholder |
| `packages/editor/src/flow/newSpace.ts` | one `newSpace(kind, …)` keyed by a defaults table |
| `packages/editor/src/plan/PlanCanvas.tsx` | one `onCommitSpace(kind, ring)` for all three space tools |
| `packages/editor/src/panels/DetailExportButton.tsx` | export the selected detail |
| `packages/editor/src/panels/Inspector.tsx` | height, which a detail needs and a room quietly wanted |

---

## Task 1: The `detail` kind

**Files:**
- Modify: `packages/model/src/schema/structure.ts`, `packages/model/src/validation/rules/warnings.ts`, `packages/renderer/src/theme.ts`
- Test: `packages/model/src/validation/rules/warnings.test.ts`, `packages/model/src/validation/rules/access.test.ts`, `packages/model/src/nav/grid.test.ts`

**Interfaces:**
- Produces: `RoomKind` gains `"detail"`. Everything downstream that switches on kind must handle it.

- [x] **Step 1: Write the failing tests**

Append to `packages/model/src/validation/rules/warnings.test.ts`:

```ts
describe("details", () => {
  const detail = {
    id: "L1-seats", levelId: "oth-L1", kind: "detail",
    footprint: [[0, 0], [4, 0], [4, 2], [0, 2]],
    heightM: 1.2, walkable: false,
  };

  it("needs no name, since 'seating block 3' is not a place you go", () => {
    const codes = validateModel(
      parseModel({ building, levels: [level], rooms: [detail] }), warningRules,
    ).issues.map(i => i.code);
    expect(codes).not.toContain("room.name.missing");
  });
});
```

Append to `packages/model/src/validation/rules/access.test.ts`, inside `describe("room access")`:

```ts
  it("says nothing about a detail, which nobody routes to", () => {
    const d = { ...shop, id: "L1-detail", kind: "detail", walkable: false };
    expect(codes({ rooms: [d] })).not.toContain("room.noAccess");
  });
```

Append to `packages/model/src/nav/grid.test.ts`, inside the top-level describe for the bake:

```ts
  it("gives a detail no cells, walkable or blocked", () => {
    // A vending machine is furniture. Blocking routes on approximate geometry
    // is a worse failure than a route that clips a bench.
    const area = {
      id: "L1-sq", levelId: "oth-L1", kind: "area",
      footprint: [[0, 0], [20, 0], [20, 20], [0, 20]], heightM: 6, walkable: true,
    };
    const detail = {
      id: "L1-vend", levelId: "oth-L1", kind: "detail",
      footprint: [[8, 8], [12, 8], [12, 12], [8, 12]], heightM: 1.9, walkable: false,
    };
    const g = bakeNavGrid(parseModel({ building, levels: [level], rooms: [area, detail] }), "oth-L1");
    expect(navGridWalkableAt(g, [10, 10])).toBe(true);
  });
```

- [x] **Step 2: Run them and watch them fail**

Run: `npx vitest run packages/model`
Expected: FAIL — `"detail"` is not a member of the `RoomKind` enum, so `parseModel` throws.

- [x] **Step 3: Add the kind**

In `packages/model/src/schema/structure.ts`, inside `RoomKindSchema`, after `"area"`:

```ts
  /**
   * Furniture, not architecture: a bounded thing standing on a floor —
   * seating, planters, a bank of vending machines, a charging point. Drawn to
   * brief a modeller and to anchor the mesh they build.
   */
  "detail",
```

- [x] **Step 4: Exempt details from the name warning**

In `packages/model/src/validation/rules/warnings.ts`, in `unnamedRooms`:

```ts
const unnamedRooms: Rule = model =>
  live(model.rooms)
    // A detail is not somewhere you go, so it needs no name to be announced by.
    .filter(r => r.kind !== "detail")
    .filter(r => r.nameEn.trim() === "" && r.nameZh.trim() === "")
```

- [x] **Step 5: Give it a colour**

In `packages/renderer/src/theme.ts`, in `BASE`. `Record<RoomKind, string>` means omitting it fails to compile:

```ts
  // Reads as an object on a floor rather than a piece of floor.
  detail: "#c8bfa8",
```

- [x] **Step 6: Run and commit**

```bash
npx vitest run packages/model packages/renderer
npm run typecheck
git add packages/model/src/schema/structure.ts packages/model/src/validation/rules/warnings.ts packages/model/src/validation/rules/warnings.test.ts packages/model/src/validation/rules/access.test.ts packages/model/src/nav/grid.test.ts packages/renderer/src/theme.ts
git commit -m "feat(model): a detail is a fifth kind of space"
```

---

## Task 2: The centred detail export

**Files:**
- Modify: `packages/model/src/geometry/ring.ts`, `packages/renderer/src/contextExport.ts`
- Test: `packages/model/src/geometry/ring.test.ts`, `packages/renderer/src/contextExport.test.ts`

**Interfaces:**
- Consumes: `RoomKind` gains `detail` (Task 1).
- Produces:
  - `ringCentroid(ring: Ring): Vec2`
  - `detailContextRooms(detail: Room, rooms: readonly Room[], marginM?: number): Room[]`
  - `buildDetailGlb(detail: Room, context: readonly Room[], level: Level): Promise<{ bytes: Uint8Array; offset: Vec2 }>`
  - `DETAIL_ORIGIN_NOTE: string`

- [x] **Step 1: Write the failing centroid test**

Append to `packages/model/src/geometry/ring.test.ts`:

```ts
describe("ringCentroid", () => {
  it("finds the middle of a square", () => {
    expect(ringCentroid([[0, 0], [4, 0], [4, 4], [0, 4]])).toEqual([2, 2]);
  });

  it("is area-weighted, not a vertex average", () => {
    // Extra vertices bunched along one edge would drag a vertex average toward
    // them; a footprint traced by hand has exactly that shape.
    const square: Ring = [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [4, 4], [0, 4]];
    const [cx] = ringCentroid(square);
    expect(cx).toBeCloseTo(2, 6);
  });

  it("does not care which way the ring winds", () => {
    const cw = ringCentroid([[0, 0], [0, 4], [4, 4], [4, 0]]);
    expect(cw).toEqual([2, 2]);
  });

  it("falls back to the vertex average for a degenerate ring of no area", () => {
    expect(ringCentroid([[0, 0], [2, 0], [4, 0]])).toEqual([2, 0]);
  });
});
```

- [x] **Step 2: Run it and watch it fail**

Run: `npx vitest run packages/model/src/geometry/ring.test.ts`
Expected: FAIL — `ringCentroid is not a function`.

- [x] **Step 3: Implement the centroid**

Append to `packages/model/src/geometry/ring.ts`:

```ts
/**
 * The area-weighted centroid of a ring.
 *
 * Not the average of the vertices: a hand-traced footprint often has several
 * points bunched along one edge, and a vertex average would be dragged toward
 * them. A ring with no area — every point collinear — has no meaningful
 * centroid, so the vertex average is the honest fallback.
 */
export function ringCentroid(ring: Ring): Vec2 {
  let twiceArea = 0;
  let x = 0;
  let y = 0;

  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    const cross = a[0] * b[1] - b[0] * a[1];
    twiceArea += cross;
    x += (a[0] + b[0]) * cross;
    y += (a[1] + b[1]) * cross;
  }

  if (twiceArea === 0) {
    const n = ring.length;
    return [
      ring.reduce((s, p) => s + p[0], 0) / n,
      ring.reduce((s, p) => s + p[1], 0) / n,
    ];
  }

  return [x / (3 * twiceArea), y / (3 * twiceArea)];
}
```

`Vec2` is already imported in this file via `Ring`; add it to the type import if not.

- [x] **Step 4: Run it and see it pass**

Run: `npx vitest run packages/model/src/geometry/ring.test.ts`
Expected: PASS.

- [x] **Step 5: Write the failing export tests**

Append to `packages/renderer/src/contextExport.test.ts`:

```ts
describe("buildDetailGlb", () => {
  const level = { id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1,
    nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6 };

  const detail = parseModel({
    building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
    levels: [level],
    rooms: [
      { id: "L1-vend", levelId: "oth-L1", kind: "detail",
        footprint: [[141, 87], [145, 87], [145, 89], [141, 89]],
        heightM: 1.9, walkable: false },
      { id: "L1-near", levelId: "oth-L1", kind: "room",
        footprint: [[130, 80], [150, 80], [150, 86], [130, 86]],
        heightM: 3.5, walkable: false },
      { id: "L1-far", levelId: "oth-L1", kind: "room",
        footprint: [[400, 400], [420, 400], [420, 420], [400, 420]],
        heightM: 3.5, walkable: false },
    ],
  });

  const pick = (id: string) => detail.rooms.find(r => r.id === id)!;

  it("reports the offset it used, which is the detail's centroid", async () => {
    const { offset } = await buildDetailGlb(pick("L1-vend"), [], level);
    expect(offset[0]).toBeCloseTo(143, 6);
    expect(offset[1]).toBeCloseTo(88, 6);
  });

  it("puts the detail's centroid at the origin", async () => {
    const { bytes } = await buildDetailGlb(pick("L1-vend"), [], level);
    const box = bboxOfGlb(bytes);
    // The block is 4 m x 2 m about its centre, so it straddles the origin.
    expect(box.minX).toBeCloseTo(-2, 3);
    expect(box.maxX).toBeCloseTo(2, 3);
  });

  it("moves the context by the same offset, so it still surrounds the detail", async () => {
    const { bytes } = await buildDetailGlb(pick("L1-vend"), [pick("L1-near")], level);
    const box = bboxOfGlb(bytes);
    // The neighbour runs to y = 86, one metre south of the detail's edge at 87.
    // In three coordinates north is -Z, so "south of" means a larger Z.
    expect(box.maxZ).toBeCloseTo(88 - 80, 3);
  });

  it("says in the file where the origin is, so it explains itself later", async () => {
    const { bytes } = await buildDetailGlb(pick("L1-vend"), [], level);
    const doc = await new NodeIO().readBinary(bytes);
    const extras = doc.getRoot().getExtras() as { othDetail?: { offset: number[] } };
    expect(extras.othDetail?.offset).toEqual([143, 88]);
    expect(doc.getRoot().getAsset().copyright).toContain("centroid");
  });
});

describe("detailContextRooms", () => {
  it("takes neighbours within the margin and leaves the rest", () => {
    const rooms = detailRooms();
    const near = detailContextRooms(rooms.detail, rooms.all, 10).map(r => r.id);
    expect(near).toContain("L1-near");
    expect(near).not.toContain("L1-far");
  });

  it("never includes the detail itself", () => {
    const rooms = detailRooms();
    expect(detailContextRooms(rooms.detail, rooms.all, 10).map(r => r.id)).not.toContain("L1-vend");
  });

  it("takes only rooms on the detail's own level", () => {
    const rooms = detailRooms();
    const upstairs = { ...rooms.all[1]!, id: "L2-near", levelId: "oth-L2" };
    expect(detailContextRooms(rooms.detail, [...rooms.all, upstairs], 10).map(r => r.id))
      .not.toContain("L2-near");
  });
});
```

Add the two helpers at the top of the file, beside the existing ones:

```ts
/** Reads the world-space bounds straight back out of a written .glb. */
function bboxOfGlb(bytes: Uint8Array) {
  // Implemented in Step 7 alongside the exporter; see that step for the body.
}
```

- [x] **Step 6: Run and watch it fail**

Run: `npx vitest run packages/renderer`
Expected: FAIL — `buildDetailGlb is not exported`.

- [x] **Step 7: Implement the export**

In `packages/renderer/src/contextExport.ts`:

```ts
import { bboxOfRing, ringCentroid, type Room, type Vec2 } from "@oth/model";
import { modelToThree } from "./coords";
```

```ts
/** How far around a detail the surrounding geometry is worth sending. */
export const DETAIL_CONTEXT_MARGIN_M = 10;

export const DETAIL_ORIGIN_NOTE =
  "Origin is this detail's footprint centroid at floor level. Units are metres. " +
  "Y is up, north is -Z. Model inside the block; it is placed back at the same point.";

/**
 * The rooms worth sending as reference around a detail: the wall it stands
 * against, the shopfront it sits outside. Anything further is weight in the
 * file and clutter in the viewport.
 */
export function detailContextRooms(
  detail: Room,
  rooms: readonly Room[],
  marginM = DETAIL_CONTEXT_MARGIN_M,
): Room[] {
  const b = bboxOfRing(detail.footprint);
  const near = {
    minX: b.minX - marginM, minY: b.minY - marginM,
    maxX: b.maxX + marginM, maxY: b.maxY + marginM,
  };
  return rooms.filter(r => {
    if (r.id === detail.id || r.levelId !== detail.levelId) return false;
    const rb = bboxOfRing(r.footprint);
    // Overlap, not containment: a long wall counts as near even though most of
    // it is far away.
    return rb.minX <= near.maxX && rb.maxX >= near.minX
      && rb.minY <= near.maxY && rb.maxY >= near.minY;
  });
}

/**
 * Exports one detail as a dimensioned block with its surroundings, translated
 * so the detail's own centroid is the origin.
 *
 * Centred rather than left in building coordinates on purpose. A mesh authored
 * at x = 143 m can only ever be used at x = 143 m, and rotating it would spin
 * it about the building origin a hundred metres away. The offset comes back
 * with the bytes and becomes the placement's position, so the mesh returns
 * exactly where it was modelled and is still reusable anywhere else.
 */
export async function buildDetailGlb(
  detail: Room,
  context: readonly Room[],
  level: Level,
): Promise<{ bytes: Uint8Array; offset: Vec2 }> {
  const offset = ringCentroid(detail.footprint);
  const doc = new Document();
  doc.createBuffer();
  const buffer = doc.getRoot().listBuffers()[0]!;
  const scene = doc.createScene(`${detail.id}-detail`);

  doc.getRoot().getAsset().copyright = DETAIL_ORIGIN_NOTE;
  doc.getRoot().setExtras({
    othDetail: { origin: DETAIL_ORIGIN_NOTE, level: level.code, detailId: detail.id, offset },
  });

  // The whole scene moves by one offset — the block and its surroundings
  // together — so the context still sits where it really is relative to the
  // thing being modelled.
  const translation = modelToThree(-offset[0], -offset[1], 0);

  for (const room of [detail, ...context]) {
    for (const [suffix, geometry] of [
      ["floor", roomGeometry(room)],
      ["walls", wallGeometry(room)],
    ] as const) {
      scene.addChild(
        addMesh(doc, buffer, `${room.id}-${suffix}`, geometry).setTranslation(translation),
      );
    }
  }

  return { bytes: await new NodeIO().writeBinary(doc), offset };
}
```

And the test helper, in `contextExport.test.ts`:

```ts
function bboxOfGlb(bytes: Uint8Array) {
  const doc = new NodeIO().readBinarySync
    ? null
    : null;
  // Read asynchronously in the tests instead; see the async form below.
}
```

Replace that sketch with the real helper — `readBinary` is async, so the tests await it:

```ts
async function bboxOfGlb(bytes: Uint8Array) {
  const doc = await new NodeIO().readBinary(bytes);
  const box = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
  for (const node of doc.getRoot().listNodes()) {
    const [tx, , tz] = node.getTranslation();
    for (const prim of node.getMesh()?.listPrimitives() ?? []) {
      const pos = prim.getAttribute("POSITION")!;
      for (let i = 0; i < pos.getCount(); i++) {
        const v = pos.getElement(i, [0, 0, 0]) as number[];
        box.minX = Math.min(box.minX, v[0]! + tx);
        box.maxX = Math.max(box.maxX, v[0]! + tx);
        box.minZ = Math.min(box.minZ, v[2]! + tz);
        box.maxZ = Math.max(box.maxZ, v[2]! + tz);
      }
    }
  }
  return box;
}
```

Every call to it in the tests must be `await`ed.

- [x] **Step 8: Export it and run**

Add to `packages/renderer/src/index.ts`:

```ts
export { DETAIL_CONTEXT_MARGIN_M, DETAIL_ORIGIN_NOTE, buildDetailGlb, detailContextRooms } from "./contextExport";
```

Run: `npx vitest run packages/renderer` then `npm run typecheck`
Expected: PASS, clean.

- [x] **Step 9: Commit**

```bash
git add packages/model/src/geometry/ring.ts packages/model/src/geometry/ring.test.ts packages/renderer/src/contextExport.ts packages/renderer/src/contextExport.test.ts packages/renderer/src/index.ts
git commit -m "feat(renderer): export a detail as a dimensioned block at the origin"
```

---

## Task 3: Drawing details

**Files:**
- Modify: `packages/editor/src/state/store.ts`, `src/state/tools.ts`, `src/flow/newSpace.ts`, `src/flow/layers.ts`, `src/plan/PlanCanvas.tsx`, `src/App.tsx`
- Test: `src/flow/newSpace.test.ts`, `src/flow/layers.test.ts`, `src/plan/PlanCanvas.test.tsx`, `src/state/tools.test.ts`

**Interfaces:**
- Consumes: `RoomKind` gains `detail` (Task 1).
- Produces:
  - `SpaceKind = "area" | "room" | "detail"`, `newSpace(kind, levelId, footprint, now?)`
  - `PlanCanvasProps.onCommitSpace?: (kind: SpaceKind, ring: Ring) => void` — **replaces** `onCommitRoom` and `onCommitArea`.
  - `LayerEntityType` gains `"detail"`.

- [x] **Step 1: Write the failing tests**

Replace the body of `packages/editor/src/flow/newSpace.test.ts` with:

```ts
import { PathwaySchema, RoomSchema, type Ring } from "@oth/model";
import { describe, expect, it } from "vitest";
import { newPathway, newSpace } from "./newSpace";

const ring: Ring = [[0, 0], [10, 0], [10, 10], [0, 10]];

describe("what the drawing tools commit", () => {
  it("makes the area tool produce walkable open floor", () => {
    expect(newSpace("area", "oth-L1", ring)).toMatchObject({ kind: "area", walkable: true });
  });

  it("makes the room tool produce a destination you do not route through", () => {
    expect(newSpace("room", "oth-L1", ring)).toMatchObject({ kind: "room", walkable: false });
  });

  it("makes the detail tool produce furniture, low and not walkable", () => {
    expect(newSpace("detail", "oth-L1", ring)).toMatchObject({ kind: "detail", walkable: false });
    expect(newSpace("detail", "oth-L1", ring).heightM).toBe(1.2);
  });

  it("gives a pathway the default width, so nobody is asked for one", () => {
    expect(newPathway("oth-L1", [[0, 0], [10, 0]]).widthM).toBe(2.4);
  });

  it("produces payloads the model accepts as they are", () => {
    for (const kind of ["area", "room", "detail"] as const) {
      expect(() => RoomSchema.parse(newSpace(kind, "oth-L1", ring))).not.toThrow();
    }
    expect(() => PathwaySchema.parse(newPathway("oth-L1", [[0, 0], [10, 0]]))).not.toThrow();
  });

  it("keeps ids apart across kinds and across draws", () => {
    expect(newSpace("room", "oth-L1", ring, 1).id).not.toBe(newSpace("room", "oth-L1", ring, 2).id);
    expect(newSpace("area", "oth-L1", ring, 1).id).not.toBe(newSpace("room", "oth-L1", ring, 1).id);
  });
});
```

In `packages/editor/src/plan/PlanCanvas.test.tsx`, replace the two existing commit assertions that use `onCommitArea` / `onCommitRoom` with `onCommitSpace`, and add:

```ts
  it("commits a detail with the detail kind", () => {
    const onCommitSpace = vi.fn();
    useEditorStore.getState().setTool("draw-detail");
    render(<PlanCanvas width={800} height={600} onCommitSpace={onCommitSpace} />);
    const surface = screen.getByTestId("plan-surface");
    fireEvent.click(surface, { clientX: 100, clientY: 100 });
    fireEvent.click(surface, { clientX: 200, clientY: 100 });
    fireEvent.click(surface, { clientX: 200, clientY: 200 });
    fireEvent.doubleClick(surface);
    expect(onCommitSpace.mock.calls[0]![0]).toBe("detail");
  });

  it("paints a detail above the rooms and pathways it sits on", () => {
    useEditorStore.getState().setModel(
      parseModel({
        building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
        levels: [{ id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6 }],
        rooms: [
          { id: "L1-sq", levelId: "oth-L1", kind: "area", footprint: [[0, 0], [20, 0], [20, 20], [0, 20]], heightM: 6, walkable: true },
          { id: "L1-vend", levelId: "oth-L1", kind: "detail", footprint: [[8, 8], [12, 8], [12, 12], [8, 12]], heightM: 1.9, walkable: false },
        ],
      }),
    );
    render(<PlanCanvas width={800} height={600} />);
    const area = screen.getByTestId("room-L1-sq");
    const detail = screen.getByTestId("room-L1-vend");
    expect(area.compareDocumentPosition(detail) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
```

Append to `packages/editor/src/flow/layers.test.ts`:

```ts
  it("lists details in their own group, since they are dressing not structure", () => {
    const m = parseModel({
      building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
      levels: [{ id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6 }],
      rooms: [{ id: "L1-vend", levelId: "oth-L1", kind: "detail", footprint: [[0, 0], [4, 0], [4, 2]], heightM: 1.9, walkable: false }],
    });
    const g = Object.fromEntries(levelLayers(m, "oth-L1").map(x => [x.type, x]));
    expect(g.detail?.items.map(i => i.id)).toEqual(["L1-vend"]);
    expect(g.room?.items).toEqual([]);
  });
```

- [x] **Step 2: Run and watch them fail**

Run: `npx vitest run packages/editor`
Expected: FAIL — `newSpace` is not exported, `"draw-detail"` is not a `Tool`, there is no `detail` layer group.

- [x] **Step 3: One payload builder keyed by kind**

Replace the three builders in `packages/editor/src/flow/newSpace.ts`:

```ts
import { DEFAULT_PATHWAY_WIDTH_M, type Ring, type Vec2 } from "@oth/model";

/** The kinds of space a drawing tool commits. */
export type SpaceKind = "area" | "room" | "detail";

/**
 * What each tool commits, in one table.
 *
 * The tool decides kind, height and walkability, so nobody has to know the
 * walkable checkbox exists — which is why area, room and detail are separate
 * tools rather than one tool and a form.
 */
const DEFAULTS: Record<SpaceKind, { heightM: number; walkable: boolean }> = {
  // Open floor you cross freely.
  area: { heightM: 5, walkable: true },
  // Somewhere you arrive, not somewhere you route through.
  room: { heightM: 3.5, walkable: false },
  // Furniture. The height is a brief for a modeller, so it is editable after.
  detail: { heightM: 1.2, walkable: false },
};

export function newSpace(kind: SpaceKind, levelId: string, footprint: Ring, now = Date.now()) {
  return { id: `${levelId}-${kind}-${now}`, levelId, kind, footprint, ...DEFAULTS[kind] };
}

export function newPathway(levelId: string, polyline: Vec2[], now = Date.now()) {
  return { id: `${levelId}-path-${now}`, levelId, polyline, widthM: DEFAULT_PATHWAY_WIDTH_M };
}
```

- [x] **Step 4: Add the tool**

In `packages/editor/src/state/store.ts`, add `"draw-detail"` to `Tool` after `"draw-room"`. In `packages/editor/src/state/tools.ts` add `"draw-detail": "Draw detail"` to `TOOL_LABELS` and `"draw-detail"` to `TOOLBAR_TOOLS` after `"draw-pathway"`.

- [x] **Step 5: One commit callback in the canvas**

In `PlanCanvas.tsx`, replace `onCommitRoom` and `onCommitArea` with:

```tsx
  onCommitSpace?: (kind: SpaceKind, ring: Ring) => void;
```

In `commitDraft`:

```tsx
    // Below three points it is not a ring, and the model would reject it.
    if (draft.length >= 3) {
      if (state.tool === "draw-room") onCommitSpace?.("room", draft);
      if (state.tool === "draw-area") onCommitSpace?.("area", draft);
      if (state.tool === "draw-detail") onCommitSpace?.("detail", draft);
    }
```

Add `"draw-detail"` to the tool list in `onSurfaceClick` that begins a draft.

Split the room rendering so details paint last — a detail stands *on* a floor rather than being one:

```tsx
        {rooms.filter(r => r.kind !== "detail").map(room => renderRoom(room))}
```

then, after the pathways block:

```tsx
        {/* Details sit on top of the floor and the pathways that cross it. */}
        {rooms.filter(r => r.kind === "detail").map(room => renderRoom(room))}
```

with the existing `<polygon>` extracted to a local `renderRoom(room: Room)` returning the same JSX unchanged, keyed by `room.id`.

- [x] **Step 6: Hint and layers**

In `DrawingHint.tsx` add to `WHAT`: `"draw-detail": "Drawing a detail"`, and to `howTo`:

```tsx
  if (tool === "draw-detail") {
    return pointCount < 3
      ? `${pointCount} of at least 3 corners of the thing itself.`
      : "Click the first corner again to close, or double-click.";
  }
```

In `packages/editor/src/flow/layers.ts` add `"detail"` to `LayerEntityType`, `detail: "Details"` to `GROUP_LABELS` after `room`, keep `layerEntityType` mapping it (a detail is a room entity, like an area):

```ts
export function layerEntityType(type: LayerEntityType): Exclude<LayerEntityType, "area" | "detail"> {
  return type === "area" || type === "detail" ? "room" : type;
}
```

and group by kind:

```ts
    const type: LayerEntityType =
      r.kind === "area" ? "area" : r.kind === "detail" ? "detail" : "room";
```

- [x] **Step 7: Wire the App**

Replace the two commit props on `PlanCanvas` in `App.tsx` with one:

```tsx
            onCommitSpace={(kind, ring) => {
              if (activeLevelId) void saver.create("room", newSpace(kind, activeLevelId, ring));
            }}
```

- [x] **Step 8: Run and commit**

```bash
npx vitest run packages/editor
npm run typecheck
git add packages/editor/src
git commit -m "feat(editor): draw details, painted on top of the floor they stand on"
```

---

## Task 4: The round trip in the editor

**Files:**
- Create: `packages/editor/src/panels/DetailExportButton.tsx`, `src/panels/DetailExportButton.test.tsx`
- Modify: `packages/editor/src/panels/Inspector.tsx`, `src/App.tsx`, `src/flow/sections.ts`
- Test: `packages/editor/src/panels/Inspector.test.tsx`

**Interfaces:**
- Consumes: `buildDetailGlb`, `detailContextRooms` (Task 2); the `detail` kind and layer group (Tasks 1, 3).
- Produces: `DetailExportButton` — no props; reads the selection from the store.

- [x] **Step 1: Write the failing tests**

`packages/editor/src/panels/DetailExportButton.test.tsx`:

```tsx
import { parseModel } from "@oth/model";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useEditorStore } from "../state/store";
import { DetailExportButton } from "./DetailExportButton";

const model = parseModel({
  building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
  levels: [{ id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6 }],
  rooms: [
    { id: "L1-vend", levelId: "oth-L1", kind: "detail", footprint: [[0, 0], [4, 0], [4, 2], [0, 2]], heightM: 1.9, walkable: false },
    { id: "L1-shop", levelId: "oth-L1", kind: "room", footprint: [[0, 4], [10, 4], [10, 10], [0, 10]], heightM: 3.5, walkable: false },
  ],
});

beforeEach(() => {
  useEditorStore.getState().reset();
  useEditorStore.getState().setModel(model);
});

describe("DetailExportButton", () => {
  it("is disabled until a detail is selected", () => {
    render(<DetailExportButton />);
    expect(screen.getByRole("button").hasAttribute("disabled")).toBe(true);
  });

  it("stays disabled for a room, which exports with the level instead", () => {
    useEditorStore.getState().select({ type: "room", id: "L1-shop" });
    render(<DetailExportButton />);
    expect(screen.getByRole("button").hasAttribute("disabled")).toBe(true);
  });

  it("is enabled for a selected detail", () => {
    useEditorStore.getState().select({ type: "room", id: "L1-vend" });
    render(<DetailExportButton />);
    expect(screen.getByRole("button").hasAttribute("disabled")).toBe(false);
  });

  it("says which detail it will export, so nothing is exported by accident", () => {
    useEditorStore.getState().select({ type: "room", id: "L1-vend" });
    render(<DetailExportButton />);
    expect(screen.getByRole("button").textContent).toContain("L1-vend");
  });
});
```

Append to `packages/editor/src/panels/Inspector.test.tsx` (create it if absent, following `LayersPanel.test.tsx` for setup):

```tsx
  it("edits the height, which is the brief for a detail", () => {
    useEditorStore.getState().select({ type: "room", id: "L1-vend" });
    const onResize = vi.fn();
    render(<Inspector onRename={vi.fn()} onResize={onResize} />);
    const input = screen.getByLabelText("Height (m)");
    fireEvent.change(input, { target: { value: "1.9" } });
    fireEvent.blur(input);
    expect(onResize).toHaveBeenCalledWith("L1-vend", 0, 1.9);
  });

  it("ignores a height that is not a positive number", () => {
    useEditorStore.getState().select({ type: "room", id: "L1-vend" });
    const onResize = vi.fn();
    render(<Inspector onRename={vi.fn()} onResize={onResize} />);
    const input = screen.getByLabelText("Height (m)");
    fireEvent.change(input, { target: { value: "0" } });
    fireEvent.blur(input);
    expect(onResize).not.toHaveBeenCalled();
  });
```

- [x] **Step 2: Run and watch them fail**

Run: `npx vitest run packages/editor/src/panels`
Expected: FAIL — no `DetailExportButton` module, `Inspector` takes no `onResize`.

- [x] **Step 3: The export button**

`packages/editor/src/panels/DetailExportButton.tsx`:

```tsx
import { DETAIL_ORIGIN_NOTE, buildDetailGlb, detailContextRooms } from "@oth/renderer";
import { activeLevel, roomsOnActiveLevel, useEditorStore } from "../state/store";

/**
 * Exports the selected detail as a dimensioned block with its surroundings,
 * centred on itself. The modeller builds inside the block; the mesh comes back
 * to the same point because the placement carries the same offset.
 */
export function DetailExportButton() {
  const state = useEditorStore();
  const level = activeLevel(state);
  const rooms = roomsOnActiveLevel(state);
  const detail =
    state.selection?.type === "room"
      ? rooms.find(r => r.id === state.selection?.id && r.kind === "detail") ?? null
      : null;

  return (
    <button
      disabled={!level || !detail}
      title={DETAIL_ORIGIN_NOTE}
      className="w-full rounded border px-2 py-1 text-sm disabled:opacity-40"
      onClick={async () => {
        if (!level || !detail) return;
        const { bytes, offset } = await buildDetailGlb(
          detail, detailContextRooms(detail, rooms), level,
        );
        // Copy into a definite ArrayBuffer: a Uint8Array may be backed by a
        // SharedArrayBuffer as far as the types are concerned, which Blob rejects.
        const buf = new ArrayBuffer(bytes.byteLength);
        new Uint8Array(buf).set(bytes);
        const url = URL.createObjectURL(new Blob([buf], { type: "model/gltf-binary" }));
        const a = document.createElement("a");
        a.href = url;
        a.download = `oth-${detail.id}.glb`;
        a.click();
        URL.revokeObjectURL(url);
        state.setStatus(
          `Exported ${detail.id}, centred on (${offset[0].toFixed(2)}, ${offset[1].toFixed(2)}). ${DETAIL_ORIGIN_NOTE}`,
        );
      }}
    >
      {detail ? `Export ${detail.id} for Blender` : "Select a detail to export"}
    </button>
  );
}
```

- [x] **Step 4: The height field**

In `Inspector.tsx`, add the prop and the input:

```tsx
export function Inspector({
  onRename, onResize,
}: {
  onRename: (id: string, version: number, nameEn: string) => void;
  onResize: (id: string, version: number, heightM: number) => void;
}) {
```

```tsx
      <label className="block">
        Height (m)
        <input
          aria-label="Height (m)"
          type="number"
          min={0.1}
          step={0.1}
          className="mt-1 w-full rounded border px-2 py-1"
          defaultValue={room.heightM}
          onBlur={e => {
            const next = Number(e.target.value);
            // For a detail this is the brief a modeller works to, so a typo
            // that silently saved zero would be worse than ignoring it.
            if (Number.isFinite(next) && next > 0 && next !== room.heightM) {
              onResize(room.id, room.version, next);
            }
          }}
        />
      </label>
```

- [x] **Step 5: Place on the detail**

In `App.tsx`, pass `onResize` to the `Inspector`:

```tsx
                  onResize={(id, version, heightM) =>
                    void saver.update("room", id, version, { heightM })
                  }
```

Add `<DetailExportButton />` to the `dressing` section beside `<ContextExportButton />`, and make the asset placement anchor-aware:

```tsx
                    onPlace={assetId => {
                      const state = useEditorStore.getState();
                      const selection = state.selection;
                      if (!activeLevelId || !selection || selection.type !== "room") {
                        state.setStatus("Select a room or detail first.");
                        return;
                      }
                      const anchor = state.model?.rooms.find(r => r.id === selection.id);
                      // The position is the offset the export used: zero for a
                      // level context mesh, the centroid for a detail mesh,
                      // which is what brings it back where it was modelled.
                      const position: [number, number, number] =
                        anchor?.kind === "detail"
                          ? [...ringCentroid(anchor.footprint), 0]
                          : [0, 0, 0];
                      void saver.create("placement", {
                        id: `${activeLevelId}-place-${Date.now()}`,
                        levelId: activeLevelId,
                        assetId,
                        roomId: selection.id,
                        position,
                      });
                    }}
```

- [x] **Step 6: Rename the section**

In `packages/editor/src/flow/sections.ts` the dressing label stays "Dressing"; no change. Confirm the detail tool reaches the dressing section by adding it to the dressing entry in `StepsPanel`'s content — details are drawn from the toolbar, and the Dressing section holds the export and upload buttons.

- [x] **Step 7: Run and commit**

```bash
npx vitest run packages/editor
npm run typecheck
git add packages/editor/src
git commit -m "feat(editor): export a detail, model it, place it back where it was drawn"
```

---

## Task 5: Undressed details

**Files:**
- Modify: `packages/model/src/validation/rules/warnings.ts`, `packages/editor/src/flow/checklist.ts`, `packages/renderer/src/LevelGroup.tsx`
- Test: `packages/model/src/validation/rules/warnings.test.ts`, `packages/renderer/src/LevelGroup.test.tsx`

**Interfaces:**
- Produces: validation code `detail.undressed`, owned by the `dressing` section.

- [x] **Step 1: Write the failing tests**

Append to `packages/model/src/validation/rules/warnings.test.ts`:

```ts
  it("warns that a detail has nothing modelled on it yet", () => {
    const codes = validateModel(
      parseModel({ building, levels: [level], rooms: [detail] }), warningRules,
    ).issues.map(i => i.code);
    expect(codes).toContain("detail.undressed");
  });

  it("says nothing once a placement anchors to it", () => {
    const model = parseModel({
      building, levels: [level], rooms: [detail],
      assets: [{ id: "asset_1", filename: "v.glb", storagePath: "a", checksum: "c",
        sizeBytes: 10, triangleCount: 5,
        bbox: { minX: 0, minY: 0, minZ: 0, maxX: 1, maxY: 1, maxZ: 1 } }],
      placements: [{ id: "pl_1", levelId: "oth-L1", assetId: "asset_1",
        roomId: "L1-seats", position: [2, 1, 0] }],
    });
    expect(validateModel(model, warningRules).issues.map(i => i.code))
      .not.toContain("detail.undressed");
  });

  it("never blocks a publish, since drawing extents first is a way to work", () => {
    const report = validateModel(
      parseModel({ building, levels: [level], rooms: [detail] }), warningRules,
    );
    expect(report.errorCount).toBe(0);
  });
```

Create `packages/renderer/src/LevelGroup.test.tsx` following the editor's jsdom setup, asserting the placeholder rule through a pure helper rather than through R3F:

```ts
import { describe, expect, it } from "vitest";
import { roomsToDraw } from "./LevelGroup";

// … fixtures: an area, an undressed detail, a dressed detail …

describe("roomsToDraw", () => {
  it("draws an undressed detail as its placeholder block", () => {
    expect(roomsToDraw(rooms, []).map(r => r.id)).toContain("L1-vend");
  });

  it("stops drawing the block once a mesh is placed on it", () => {
    // Otherwise the placeholder sits inside the vending machines.
    expect(roomsToDraw(rooms, [placementOnVend]).map(r => r.id)).not.toContain("L1-vend");
  });

  it("keeps drawing rooms and areas, which are never replaced by dressing", () => {
    expect(roomsToDraw(rooms, [placementOnShop]).map(r => r.id)).toContain("L1-shop");
  });
});
```

- [x] **Step 2: Run and watch them fail**

Run: `npx vitest run packages/model packages/renderer`
Expected: FAIL — no `detail.undressed`, no `roomsToDraw`.

- [x] **Step 3: The warning**

In `packages/model/src/validation/rules/warnings.ts`:

```ts
/**
 * A detail with nothing modelled on it yet. A warning, never an error: drawing
 * the extents of a whole floor before any modelling starts is a legitimate way
 * to work, and blocking publish on it would punish exactly that.
 */
const undressedDetails: Rule = model => {
  const anchored = new Set(live(model.placements).map(p => p.roomId));
  return live(model.rooms)
    .filter(r => r.kind === "detail" && !anchored.has(r.id))
    .map<ValidationIssue>(r => ({
      severity: "warning",
      code: "detail.undressed",
      message: `Detail "${r.nameEn || r.id}" has no model placed on it yet.`,
      entityType: "room",
      entityId: r.id,
      levelId: r.levelId,
    }));
};
```

Add it to `warningRules`.

- [x] **Step 4: Route it to the dressing section**

In `packages/editor/src/flow/checklist.ts`, `stepForCode`:

```ts
  if (code.startsWith("detail.") || code.startsWith("placement.")) return "dressing";
```

`"dressing"` is a `SectionId` but not a `StepId`, so add a `dressing` step to `StepId` and to `MEMBERS.dressing` in `sections.ts` with `tools: ["draw-detail"]`, `status` done once every detail on the level has a placement, and `detail` reading `"3 details, 1 undressed"`. Follow the shape of the `connect` step exactly.

- [x] **Step 5: The placeholder rule**

In `packages/renderer/src/LevelGroup.tsx`:

```ts
/**
 * Which rooms draw geometry of their own.
 *
 * A detail's block is a placeholder for a mesh that does not exist yet. Once
 * one is placed on it the block would sit inside the vending machines, so it
 * stops being drawn.
 */
export function roomsToDraw(rooms: readonly Room[], placements: readonly Placement[]): Room[] {
  const dressed = new Set(placements.map(p => p.roomId));
  return rooms.filter(r => r.kind !== "detail" || !dressed.has(r.id));
}
```

and use it: `{roomsToDraw(rooms, placements).map(room => (<RoomMesh … />))}`.

- [x] **Step 6: Run everything and commit**

```bash
npm test
npm run typecheck
npm run build
git add packages/model/src packages/renderer/src packages/editor/src
git commit -m "feat: warn about an undressed detail, and drop its placeholder once dressed"
```

---

## Done criteria

- `npm test` green, `npm run typecheck` clean, editor builds.
- Drawing with the detail tool produces a non-walkable `detail` at 1.2 m, and nobody is asked about walkability.
- A detail contributes no cells to the nav grid, walkable or blocked.
- A detail exported, opened, and placed back at the reported offset occupies its original footprint in building coordinates.
- The context in a detail export sits where it really is relative to the detail.
- A mesh larger than its detail raises `placement.outsideAnchorRoom`.
- An undressed detail warns and never blocks a publish; its placeholder block disappears once a mesh is placed on it.

## Self-review

**Spec coverage.** §4 kind and exclusions → Task 1. §5 centred export, context margin, offset in extras, placement position → Tasks 2 and 4. §6 plan paint order and the 3D placeholder → Tasks 3 and 5. §7 the reused fit check → covered by the existing rule, asserted in Done criteria; `detail.undressed` → Task 5. §8 toolbar, dressing, layers, inspector height → Tasks 3 and 4.

**Placeholders.** Step 5 of Task 2 sketches `bboxOfGlb` before giving its real body two steps later; the sketch is marked and superseded. Task 5 Step 4 describes the dressing step by reference to `connect` rather than repeating it — acceptable because the shape is in the same file, but the implementer should read `connect` before writing it.

**Type consistency.** `newSpace(kind, levelId, footprint, now?)` in Task 3 is what Task 3 Step 7 calls. `buildDetailGlb` returns `{ bytes, offset }` in Task 2 and is destructured that way in Task 4. `layerEntityType` narrows to `Exclude<LayerEntityType, "area" | "detail">`, which stays assignable to both `EntityType` and `Selection["type"]` — the compile check in `App.tsx` still holds.
