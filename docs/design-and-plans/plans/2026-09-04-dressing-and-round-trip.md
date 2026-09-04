# Dressing Layer and Blender Round Trip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete approach A — give the modelling teammate a clean round trip (export a region as locked reference geometry, model it elsewhere, upload one `.glb`, place it), render placed assets, and import DXF when OTH supplies vector CAD.

**Architecture:** Context export is built with `@gltf-transform/core` on top of the *already tested* `roomGeometry`, not with three.js `GLTFExporter`. That choice matters: gltf-transform runs headless, so the export is a pure function returning bytes and can be tested in Node without a WebGL context or a browser. The DXF parser is likewise a pure text-to-rings function. Everything hard is testable; the React parts stay thin.

**Tech Stack:** `@gltf-transform/core`, three.js, React, Vitest.

**Spec:** [`docs/design-and-plans/specs/2026-09-04-oth-map-model-design.md`](../specs/2026-09-04-oth-map-model-design.md) §8, §9.

**Depends on:** plans 1–3, all complete. The server's `POST /api/assets` and the `placement` entity type already exist and are tested.

## Global Constraints

- **The dressing layer stays inert.** Nothing added here may feed routing, reachability, or the nav bake. A placement is a transform and nothing more.
- **Exported context is reference only.** It carries room ids in node names so a human can orient, and is never re-imported as structure — the editor has no path that turns a `.glb` back into a footprint.
- **The export origin is documented and stable**: the building origin at the level's elevation, metres, y-up. A teammate must be able to model against it without guessing.
- **Budgets come from `@oth/model`** (`ASSET_MAX_BYTES`, `ASSET_MAX_TRIANGLES`), never re-declared.
- **DXF import creates ordinary rooms** through the same validated `createEntity` path as hand-tracing. No special case, no bypass.
- **TypeScript strict**, tests beside the code.

---

## File Structure

`packages/renderer/`:
- `src/walls.ts` — vertical wall strips along a footprint
- `src/contextExport.ts` — rooms + level → `.glb` bytes
- `src/PlacementMesh.tsx` — a placed asset
- modify `src/MapScene.tsx` — render placements

`packages/editor/`:
- `src/dxf/parse.ts` — DXF text → polylines
- `src/dxf/toRooms.ts` — polylines → room payloads
- `src/panels/AssetLibrary.tsx` — list, upload, choose
- `src/panels/PlacementInspector.tsx` — transform fields
- `src/panels/ContextExportButton.tsx`
- `src/panels/DxfImportButton.tsx`
- modify `src/api/client.ts` — `listAssets`, `uploadAsset`
- modify `src/state/store.ts` — `assets`, `selectedAssetId`

---

## Task 1: Wall geometry

**Files:**
- Create: `packages/renderer/src/walls.ts`, `src/walls.test.ts`

**Interfaces:**
- Consumes: `Room` from `@oth/model`.
- Produces: `wallGeometry(room: Room, heightM?: number): THREE.BufferGeometry`.

- [ ] **Step 1: Write the failing test**

`packages/renderer/src/walls.test.ts`:

```ts
import { RoomSchema } from "@oth/model";
import { describe, expect, it } from "vitest";
import { wallGeometry } from "./walls";

const square = RoomSchema.parse({
  id: "L1-lobby", levelId: "oth-L1", kind: "atrium",
  footprint: [[0, 0], [10, 0], [10, 10], [0, 10]],
  heightM: 4, walkable: true,
});

const withHole = RoomSchema.parse({
  ...square, id: "L1-atrium", holes: [[[4, 4], [6, 4], [6, 6], [4, 6]]],
});

describe("wallGeometry", () => {
  it("builds two triangles per footprint edge", () => {
    // 4 edges x 2 triangles x 3 vertices
    expect(wallGeometry(square).getAttribute("position").count).toBe(24);
  });

  it("includes hole edges, so an atrium void has a wall too", () => {
    expect(wallGeometry(withHole).getAttribute("position").count).toBe(48);
  });

  it("rises from the floor to the room height", () => {
    const geo = wallGeometry(square);
    geo.computeBoundingBox();
    expect(geo.boundingBox?.min.y).toBeCloseTo(0);
    expect(geo.boundingBox?.max.y).toBeCloseTo(4);
  });

  it("honours an explicit height override", () => {
    const geo = wallGeometry(square, 2.5);
    geo.computeBoundingBox();
    expect(geo.boundingBox?.max.y).toBeCloseTo(2.5);
  });

  it("maps north to -z, matching the coordinate mapping", () => {
    const geo = wallGeometry(square);
    geo.computeBoundingBox();
    expect(geo.boundingBox?.min.z).toBeCloseTo(-10);
    expect(geo.boundingBox?.max.z).toBeCloseTo(0);
  });

  it("produces an empty geometry for a degenerate footprint", () => {
    const degenerate = { ...square, footprint: [[0, 0], [0, 0], [0, 0]] } as typeof square;
    expect(wallGeometry(degenerate).getAttribute("position").count).toBe(18);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run packages/renderer/src/walls.test.ts`
Expected: FAIL — cannot resolve `./walls`.

- [ ] **Step 3: Implement**

`packages/renderer/src/walls.ts`:

```ts
import type { Ring, Room } from "@oth/model";
import * as THREE from "three";
import { modelToThree } from "./coords";

/**
 * Vertical strips along every boundary edge, floor to ceiling.
 *
 * These exist for the Blender context export, not for the visitor app — a
 * teammate modelling a shopfront needs to see where the walls are. They are
 * reference geometry and are never part of the structural model.
 */
export function wallGeometry(room: Room, heightM?: number): THREE.BufferGeometry {
  const h = heightM ?? room.heightM;
  const positions: number[] = [];

  const addEdge = (ax: number, ay: number, bx: number, by: number) => {
    const [x0, , z0] = modelToThree(ax, ay, 0);
    const [x1, , z1] = modelToThree(bx, by, 0);
    // Two triangles forming the quad (a-low, b-low, b-high, a-high).
    positions.push(
      x0, 0, z0, x1, 0, z1, x1, h, z1,
      x0, 0, z0, x1, h, z1, x0, h, z0,
    );
  };

  const addRing = (ring: Ring) => {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      if (a && b) addEdge(a[0], a[1], b[0], b[1]);
    }
  };

  addRing(room.footprint);
  for (const hole of room.holes) addRing(hole);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}
```

- [ ] **Step 4: Run and commit**

```bash
npx vitest run packages/renderer/src/walls.test.ts
git add packages/renderer/src/walls.ts packages/renderer/src/walls.test.ts
git commit -m "feat(renderer): wall strips along footprint and hole edges for context export"
```

---

## Task 2: Context export

**Files:**
- Create: `packages/renderer/src/contextExport.ts`, `src/contextExport.test.ts`
- Modify: `packages/renderer/package.json` (add `@gltf-transform/core`), `src/index.ts`

**Interfaces:**
- Produces: `buildContextGlb(rooms: Room[], level: Level): Promise<Uint8Array>`, `CONTEXT_ORIGIN_NOTE`.

- [ ] **Step 1: Add the dependency**

```bash
npm install --save --workspace @oth/renderer @gltf-transform/core@^4
```

`@gltf-transform/core` rather than three.js `GLTFExporter` deliberately: it runs headless, so the export is a pure function returning bytes and can be tested in Node without a WebGL context.

- [ ] **Step 2: Write the failing test**

`packages/renderer/src/contextExport.test.ts`:

```ts
import { NodeIO } from "@gltf-transform/core";
import { LevelSchema, RoomSchema } from "@oth/model";
import { describe, expect, it } from "vitest";
import { buildContextGlb } from "./contextExport";

const level = LevelSchema.parse({
  id: "oth-L2", buildingId: "oth", code: "L2", ordinal: 2,
  nameEn: "Level 2", nameZh: "二楼", elevationM: 6, heightM: 4.5,
});

const lobby = RoomSchema.parse({
  id: "L2-lobby", levelId: "oth-L2", kind: "atrium",
  footprint: [[0, 0], [10, 0], [10, 10], [0, 10]],
  heightM: 4.5, walkable: true, nameEn: "Lobby", nameZh: "大堂",
});

const shop = RoomSchema.parse({
  id: "L2-shop", levelId: "oth-L2", kind: "room",
  footprint: [[10, 0], [20, 0], [20, 10], [10, 10]],
  heightM: 4.5, walkable: true, nameEn: "Shop", nameZh: "商店",
});

async function read(bytes: Uint8Array) {
  return new NodeIO().readBinary(bytes);
}

describe("buildContextGlb", () => {
  it("produces a readable glTF 2.0 binary", async () => {
    const doc = await read(await buildContextGlb([lobby], level));
    expect(doc.getRoot().listScenes()).toHaveLength(1);
  });

  it("emits a floor and a wall mesh per room", async () => {
    const doc = await read(await buildContextGlb([lobby, shop], level));
    expect(doc.getRoot().listMeshes()).toHaveLength(4);
  });

  it("names nodes after room ids so a modeller can orient", async () => {
    const doc = await read(await buildContextGlb([lobby, shop], level));
    const names = doc.getRoot().listNodes().map(n => n.getName());
    expect(names).toContain("L2-lobby-floor");
    expect(names).toContain("L2-lobby-walls");
    expect(names).toContain("L2-shop-floor");
  });

  it("places geometry at the building origin, not the level elevation", async () => {
    // The modeller works in the level's own frame; elevation is the app's business.
    const doc = await read(await buildContextGlb([lobby], level));
    const node = doc.getRoot().listNodes().find(n => n.getName() === "L2-lobby-floor");
    expect(node?.getTranslation()).toEqual([0, 0, 0]);
  });

  it("keeps real metres, so the modeller can measure against it", async () => {
    const doc = await read(await buildContextGlb([lobby], level));
    const mesh = doc.getRoot().listMeshes().find(m => m.getName() === "L2-lobby-floor");
    const position = mesh?.listPrimitives()[0]?.getAttribute("POSITION");
    expect(position?.getMax([0, 0, 0])[0]).toBeCloseTo(10, 2);
  });

  it("returns bytes for an empty selection rather than throwing", async () => {
    const bytes = await buildContextGlb([], level);
    expect(bytes.byteLength).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

Run: `npx vitest run packages/renderer/src/contextExport.test.ts`
Expected: FAIL — cannot resolve `./contextExport`.

- [ ] **Step 4: Implement**

`packages/renderer/src/contextExport.ts`:

```ts
import { Document, NodeIO, type Accessor } from "@gltf-transform/core";
import type { Level, Room } from "@oth/model";
import type * as THREE from "three";
import { roomGeometry } from "./geometry";
import { wallGeometry } from "./walls";

/**
 * Documented so a modeller never has to guess where the origin is.
 * Restated in the editor's export dialog and in the exported asset name.
 */
export const CONTEXT_ORIGIN_NOTE =
  "Origin is the building origin at floor level. Units are metres. Y is up, north is -Z.";

function addMesh(
  doc: Document, buffer: ReturnType<Document["createBuffer"]>,
  name: string, geometry: THREE.BufferGeometry,
) {
  const position = geometry.getAttribute("position");
  const array = new Float32Array(position.array as ArrayLike<number>);

  const accessor: Accessor = doc.createAccessor(`${name}-position`)
    .setArray(array)
    .setType("VEC3")
    .setBuffer(buffer);

  const prim = doc.createPrimitive().setAttribute("POSITION", accessor);

  const index = geometry.getIndex();
  if (index) {
    const indices = doc.createAccessor(`${name}-indices`)
      .setArray(new Uint32Array(index.array as ArrayLike<number>))
      .setType("SCALAR")
      .setBuffer(buffer);
    prim.setIndices(indices);
  }

  const mesh = doc.createMesh(name).addPrimitive(prim);
  return doc.createNode(name).setMesh(mesh);
}

/**
 * Exports a selection of rooms as locked reference geometry for Blender or Rhino.
 *
 * Built with @gltf-transform rather than three.js GLTFExporter so it is a pure
 * function returning bytes: no WebGL context, no browser, and therefore testable.
 *
 * Deliberately one-way. Nothing in the editor turns a .glb back into a
 * footprint — the structural layer is authored in plan view and only there.
 */
export async function buildContextGlb(rooms: Room[], level: Level): Promise<Uint8Array> {
  const doc = new Document();
  doc.createBuffer();
  const buffer = doc.getRoot().listBuffers()[0]!;
  const scene = doc.createScene(`${level.code}-context`);

  doc.getRoot().getAsset().generator = `oth-editor context export — ${CONTEXT_ORIGIN_NOTE}`;

  for (const room of rooms) {
    scene.addChild(addMesh(doc, buffer, `${room.id}-floor`, roomGeometry(room)));
    scene.addChild(addMesh(doc, buffer, `${room.id}-walls`, wallGeometry(room)));
  }

  return new NodeIO().writeBinary(doc);
}
```

Add to `packages/renderer/src/index.ts`:

```ts
export * from "./walls";
export * from "./contextExport";
```

- [ ] **Step 5: Run and commit**

```bash
npx vitest run packages/renderer
npm run typecheck
git add packages/renderer package.json package-lock.json
git commit -m "feat(renderer): headless glTF context export for the Blender round trip"
```

---

## Task 3: Placement rendering

**Files:**
- Create: `packages/renderer/src/PlacementMesh.tsx`
- Modify: `packages/renderer/src/MapScene.tsx`, `src/LevelGroup.tsx`, `src/index.ts`

**Interfaces:**
- Produces: `PlacementMesh` props `{ placement: Placement; url: string }`; `MapSceneProps` gains `assetUrl?: (assetId: string) => string`.

- [ ] **Step 1: Implement the placed asset**

`packages/renderer/src/PlacementMesh.tsx`:

```tsx
import type { Placement } from "@oth/model";
import { useGLTF } from "@react-three/drei";
import { modelToThree } from "./coords";

/**
 * A dressing asset in the scene.
 *
 * Deliberately inert: this renders and nothing else. No collision, no
 * contribution to the nav bake, no effect on reachability. A broken or
 * mis-scaled upload can only ever look wrong.
 */
export function PlacementMesh({ placement, url }: { placement: Placement; url: string }) {
  const { scene } = useGLTF(url);
  const [x, y, z] = modelToThree(placement.position[0], placement.position[1], placement.position[2]);

  return (
    <primitive
      object={scene.clone()}
      position={[x, y, z]}
      rotation={[0, (placement.rotationDeg * Math.PI) / 180, 0]}
      scale={placement.scale}
    />
  );
}
```

- [ ] **Step 2: Render placements on the active level**

In `LevelGroup.tsx`, accept and render them:

```tsx
import type { Level, Placement, Room } from "@oth/model";
import { Suspense } from "react";
import { modelToThree } from "./coords";
import { PlacementMesh } from "./PlacementMesh";
import { RoomMesh } from "./RoomMesh";

export function LevelGroup({
  level, rooms, placements = [], assetUrl, ghosted = false, selectedId, onSelect,
}: {
  level: Level;
  rooms: Room[];
  placements?: Placement[];
  assetUrl?: (assetId: string) => string;
  ghosted?: boolean;
  selectedId?: string | null;
  onSelect?: (roomId: string) => void;
}) {
  const [x, y, z] = modelToThree(0, 0, level.elevationM);

  return (
    <group position={[x, y, z]}>
      {rooms.map(room => (
        <RoomMesh
          key={room.id}
          room={room}
          ghosted={ghosted}
          selected={selectedId === room.id}
          onSelect={ghosted ? undefined : onSelect}
        />
      ))}
      {!ghosted && assetUrl && placements.map(p => (
        // One asset failing to load must not blank the level.
        <Suspense key={p.id} fallback={null}>
          <PlacementMesh placement={p} url={assetUrl(p.assetId)} />
        </Suspense>
      ))}
    </group>
  );
}
```

In `MapScene.tsx`, add `assetUrl` to the props and pass the active level's placements:

```tsx
export type MapSceneProps = {
  model: MapModel;
  activeLevelId: string;
  showLevelBelow?: boolean;
  selectedId?: string | null;
  onSelect?: (roomId: string) => void;
  /** Resolves an asset id to a URL the renderer can fetch. */
  assetUrl?: (assetId: string) => string;
};
```

and inside the active `LevelGroup`:

```tsx
          placements={model.placements.filter(p => p.levelId === active.id)}
          assetUrl={assetUrl}
```

Export `PlacementMesh` from `src/index.ts`.

- [ ] **Step 3: Typecheck and commit**

```bash
npm run typecheck
npx vitest run packages/renderer
git add packages/renderer
git commit -m "feat(renderer): render placed dressing assets, suspended per placement"
```

---

## Task 4: Asset API in the editor client

**Files:**
- Modify: `packages/editor/src/api/client.ts`, `src/api/client.test.ts`

**Interfaces:**
- Produces: `listAssets(): Promise<AssetRecord[]>`, `uploadAsset(file: File): Promise<AssetRecord>`, `assetFileUrl(id): string`; `AssetRecord` type.

- [ ] **Step 1: Write the failing test**

Append to `packages/editor/src/api/client.test.ts`:

```ts
describe("assets", () => {
  it("lists assets", async () => {
    const fetchImpl = mockFetch(200, { items: [{ id: "asset_1", filename: "arch.glb" }] });
    const assets = await createApi({ fetchImpl }).listAssets();
    expect(assets[0]?.filename).toBe("arch.glb");
  });

  it("uploads as multipart and does not force a JSON content-type", async () => {
    const fetchImpl = mockFetch(201, { asset: { id: "asset_1", filename: "arch.glb" } });
    const file = new File([new Uint8Array([1, 2, 3])], "arch.glb");
    await createApi({ fetchImpl }).uploadAsset(file);
    const init = fetchImpl.mock.calls[0]![1]!;
    expect(init.body).toBeInstanceOf(FormData);
    // Setting content-type manually would break the multipart boundary.
    expect(init.headers).toBeUndefined();
  });

  it("builds a stable file url", () => {
    expect(createApi().assetFileUrl("asset_1")).toBe("/api/assets/asset_1/file");
  });
});
```

The content-type assertion is load-bearing: setting it by hand strips the multipart boundary and the upload silently fails to parse server-side.

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run packages/editor/src/api`
Expected: FAIL — `listAssets is not a function`.

- [ ] **Step 3: Implement**

Add to `packages/editor/src/api/client.ts`:

```ts
export type AssetRecord = {
  id: string;
  filename: string;
  checksum: string;
  sizeBytes: number;
  triangleCount: number;
  bbox: { minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number };
};
```

and inside the returned object:

```ts
    async listAssets(): Promise<AssetRecord[]> {
      return (await request<{ items: AssetRecord[] }>("/api/assets")).items;
    },

    async uploadAsset(file: File): Promise<AssetRecord> {
      const form = new FormData();
      form.append("file", file);
      // No content-type header: the browser must set the multipart boundary.
      const body = await request<{ asset: AssetRecord }>("/api/assets", {
        method: "POST",
        body: form,
      });
      return body.asset;
    },

    assetFileUrl: (id: string) => `${base}/api/assets/${id}/file`,
```

- [ ] **Step 4: Run and commit**

```bash
npx vitest run packages/editor/src/api
git add packages/editor/src/api
git commit -m "feat(editor): asset list, multipart upload and file url in the API client"
```

---

## Task 5: DXF polyline parser

**Files:**
- Create: `packages/editor/src/dxf/parse.ts`, `src/dxf/parse.test.ts`

**Interfaces:**
- Produces: `parseDxfPolylines(text: string): DxfPolyline[]` where `DxfPolyline = { layer: string; points: Vec2[]; closed: boolean }`.

- [ ] **Step 1: Write the failing test**

`packages/editor/src/dxf/parse.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseDxfPolylines } from "./parse";

/** DXF is pairs of lines: a group code, then its value. */
function dxf(...pairs: [number | string, string | number][]): string {
  return pairs.map(([code, value]) => `${code}\n${value}`).join("\n") + "\n";
}

const oneSquare = dxf(
  [0, "SECTION"], [2, "ENTITIES"],
  [0, "LWPOLYLINE"], [8, "A-WALL"], [70, 1],
  [10, 0], [20, 0],
  [10, 10], [20, 0],
  [10, 10], [20, 8],
  [10, 0], [20, 8],
  [0, "ENDSEC"], [0, "EOF"],
);

describe("parseDxfPolylines", () => {
  it("reads a closed LWPOLYLINE", () => {
    const polys = parseDxfPolylines(oneSquare);
    expect(polys).toHaveLength(1);
    expect(polys[0]?.points).toEqual([[0, 0], [10, 0], [10, 8], [0, 8]]);
    expect(polys[0]?.closed).toBe(true);
  });

  it("records the layer, which is how CAD separates walls from furniture", () => {
    expect(parseDxfPolylines(oneSquare)[0]?.layer).toBe("A-WALL");
  });

  it("marks an unflagged polyline as open", () => {
    const open = dxf(
      [0, "LWPOLYLINE"], [8, "L"], [10, 0], [20, 0], [10, 5], [20, 0], [0, "EOF"],
    );
    expect(parseDxfPolylines(open)[0]?.closed).toBe(false);
  });

  it("reads several polylines", () => {
    const two = dxf(
      [0, "LWPOLYLINE"], [8, "A"], [70, 1], [10, 0], [20, 0], [10, 1], [20, 0], [10, 1], [20, 1],
      [0, "LWPOLYLINE"], [8, "B"], [70, 1], [10, 5], [20, 5], [10, 6], [20, 5], [10, 6], [20, 6],
      [0, "EOF"],
    );
    expect(parseDxfPolylines(two).map(p => p.layer)).toEqual(["A", "B"]);
  });

  it("reads legacy POLYLINE/VERTEX pairs too", () => {
    const legacy = dxf(
      [0, "POLYLINE"], [8, "OLD"], [70, 1],
      [0, "VERTEX"], [10, 1], [20, 2],
      [0, "VERTEX"], [10, 3], [20, 4],
      [0, "VERTEX"], [10, 5], [20, 6],
      [0, "SEQEND"], [0, "EOF"],
    );
    const polys = parseDxfPolylines(legacy);
    expect(polys[0]?.points).toEqual([[1, 2], [3, 4], [5, 6]]);
  });

  it("ignores entities that are not polylines", () => {
    const mixed = dxf(
      [0, "LINE"], [8, "X"], [10, 0], [20, 0],
      [0, "CIRCLE"], [8, "Y"], [10, 5], [20, 5],
      [0, "EOF"],
    );
    expect(parseDxfPolylines(mixed)).toEqual([]);
  });

  it("drops polylines with fewer than three points, which cannot be rooms", () => {
    const tooShort = dxf([0, "LWPOLYLINE"], [8, "A"], [10, 0], [20, 0], [10, 1], [20, 1], [0, "EOF"]);
    expect(parseDxfPolylines(tooShort)).toEqual([]);
  });

  it("tolerates CRLF line endings, which AutoCAD writes", () => {
    expect(parseDxfPolylines(oneSquare.replace(/\n/g, "\r\n"))).toHaveLength(1);
  });

  it("returns nothing for an empty file rather than throwing", () => {
    expect(parseDxfPolylines("")).toEqual([]);
  });
});
```

CRLF matters: AutoCAD writes DXF with Windows line endings, and a parser that splits on `\n` alone leaves a `\r` on every value, so every coordinate becomes `NaN`.

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run packages/editor/src/dxf`
Expected: FAIL — cannot resolve `./parse`.

- [ ] **Step 3: Implement**

`packages/editor/src/dxf/parse.ts`:

```ts
import type { Vec2 } from "@oth/model";

export type DxfPolyline = { layer: string; points: Vec2[]; closed: boolean };

type Pair = { code: number; value: string };

/** DXF is a flat list of (group code, value) pairs, one per line each. */
function readPairs(text: string): Pair[] {
  // AutoCAD writes CRLF; splitting on \n alone leaves \r on every value and
  // turns every coordinate into NaN.
  const lines = text.split(/\r\n|\r|\n/);
  const pairs: Pair[] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = Number.parseInt((lines[i] ?? "").trim(), 10);
    if (Number.isNaN(code)) continue;
    pairs.push({ code, value: (lines[i + 1] ?? "").trim() });
  }
  return pairs;
}

const MIN_POINTS = 3;

/**
 * Extracts closed and open polylines. Handles both LWPOLYLINE (modern, vertices
 * inline) and POLYLINE/VERTEX (legacy, vertices as following entities), because
 * exports from older CAD seats still use the latter.
 */
export function parseDxfPolylines(text: string): DxfPolyline[] {
  const pairs = readPairs(text);
  const out: DxfPolyline[] = [];

  let current: DxfPolyline | null = null;
  let inLegacy = false;
  let pendingX: number | null = null;

  const flush = () => {
    if (current && current.points.length >= MIN_POINTS) out.push(current);
    current = null;
    inLegacy = false;
    pendingX = null;
  };

  for (const { code, value } of pairs) {
    if (code === 0) {
      if (value === "LWPOLYLINE") {
        flush();
        current = { layer: "", points: [], closed: false };
      } else if (value === "POLYLINE") {
        flush();
        current = { layer: "", points: [], closed: false };
        inLegacy = true;
      } else if (value === "VERTEX" && inLegacy) {
        pendingX = null;
      } else {
        // Any other entity ends the one being read.
        flush();
      }
      continue;
    }

    if (!current) continue;

    if (code === 8) current.layer = value;
    else if (code === 70) current.closed = (Number.parseInt(value, 10) & 1) === 1;
    else if (code === 10) pendingX = Number.parseFloat(value);
    else if (code === 20 && pendingX !== null) {
      const y = Number.parseFloat(value);
      if (Number.isFinite(pendingX) && Number.isFinite(y)) current.points.push([pendingX, y]);
      pendingX = null;
    }
  }

  flush();
  return out;
}
```

- [ ] **Step 4: Run and commit**

```bash
npx vitest run packages/editor/src/dxf
git add packages/editor/src/dxf
git commit -m "feat(editor): DXF polyline parser handling LWPOLYLINE, legacy POLYLINE and CRLF"
```

---

## Task 6: DXF polylines to room payloads

**Files:**
- Create: `packages/editor/src/dxf/toRooms.ts`, `src/dxf/toRooms.test.ts`

**Interfaces:**
- Produces: `polylinesToRooms(polys, opts): RoomDraft[]` where `opts = { levelId, unitsToMetres?, layers?, kind? }` and `RoomDraft` is the payload `createEntity("room", …)` accepts.

- [ ] **Step 1: Write the failing test**

`packages/editor/src/dxf/toRooms.test.ts`:

```ts
import { RoomSchema } from "@oth/model";
import { describe, expect, it } from "vitest";
import { polylinesToRooms } from "./toRooms";

const square = { layer: "A-WALL", closed: true, points: [[0, 0], [10, 0], [10, 8], [0, 8]] as [number, number][] };
const other = { layer: "FURNITURE", closed: true, points: [[0, 0], [1, 0], [1, 1]] as [number, number][] };

describe("polylinesToRooms", () => {
  it("produces payloads the model schema accepts", () => {
    const [room] = polylinesToRooms([square], { levelId: "oth-L1" });
    expect(() => RoomSchema.parse(room)).not.toThrow();
  });

  it("scales drawing units to metres — CAD is usually in millimetres", () => {
    const [room] = polylinesToRooms([square], { levelId: "oth-L1", unitsToMetres: 0.001 });
    expect(room?.footprint[1]).toEqual([0.01, 0]);
  });

  it("defaults to a 1:1 unit scale", () => {
    const [room] = polylinesToRooms([square], { levelId: "oth-L1" });
    expect(room?.footprint[1]).toEqual([10, 0]);
  });

  it("filters to the chosen layers, so furniture does not become rooms", () => {
    const rooms = polylinesToRooms([square, other], { levelId: "oth-L1", layers: ["A-WALL"] });
    expect(rooms).toHaveLength(1);
  });

  it("skips open polylines, which are not room outlines", () => {
    expect(polylinesToRooms([{ ...square, closed: false }], { levelId: "oth-L1" })).toEqual([]);
  });

  it("generates unique ids scoped to the level", () => {
    const rooms = polylinesToRooms([square, { ...square, layer: "A-WALL" }], { levelId: "oth-L1" });
    expect(rooms[0]?.id).not.toBe(rooms[1]?.id);
    expect(rooms[0]?.id.startsWith("oth-L1-")).toBe(true);
  });

  it("marks imported rooms as CAD-verified, which is their actual provenance", () => {
    const [room] = polylinesToRooms([square], { levelId: "oth-L1" });
    expect(room?.verification?.status).toBe("cad");
  });

  it("does not mark them walkable, because that is a routing decision a human makes", () => {
    const [room] = polylinesToRooms([square], { levelId: "oth-L1" });
    expect(room?.walkable).toBe(false);
  });
});
```

The last two are the point of this task. Provenance is `cad` because that is honestly where the geometry came from; walkability stays off because whether a space is part of the walkable surface is a routing judgement, not something a CAD layer can tell you.

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run packages/editor/src/dxf/toRooms.test.ts`
Expected: FAIL — cannot resolve `./toRooms`.

- [ ] **Step 3: Implement**

`packages/editor/src/dxf/toRooms.ts`:

```ts
import type { Vec2 } from "@oth/model";
import type { DxfPolyline } from "./parse";

export type RoomDraft = {
  id: string;
  levelId: string;
  kind: string;
  footprint: Vec2[];
  heightM: number;
  walkable: boolean;
  nameEn: string;
  nameZh: string;
  verification: { status: string; evidence: string[] };
};

export type ToRoomsOptions = {
  levelId: string;
  /** CAD is commonly in millimetres; 0.001 converts. Defaults to 1:1. */
  unitsToMetres?: number;
  /** Only import these layers. Omitted means every layer. */
  layers?: string[];
  kind?: string;
  heightM?: number;
};

export function polylinesToRooms(
  polys: readonly DxfPolyline[], opts: ToRoomsOptions,
): RoomDraft[] {
  const scale = opts.unitsToMetres ?? 1;
  const allowed = opts.layers ? new Set(opts.layers) : null;

  return polys
    // An open polyline is a line, a duct, a dimension — not a room outline.
    .filter(p => p.closed && (!allowed || allowed.has(p.layer)))
    .map((p, index) => ({
      id: `${opts.levelId}-dxf-${index}-${p.layer.replace(/[^A-Za-z0-9_-]/g, "") || "layer"}`,
      levelId: opts.levelId,
      kind: opts.kind ?? "room",
      footprint: p.points.map(([x, y]) => [x * scale, y * scale] as Vec2),
      heightM: opts.heightM ?? 3.5,
      // Walkability is a routing judgement a human makes, not something a CAD
      // layer name can tell us. Imported rooms start non-walkable.
      walkable: false,
      nameEn: "",
      nameZh: "",
      // The geometry genuinely came from a drawing; record that.
      verification: { status: "cad", evidence: [`dxf:layer:${p.layer}`] },
    }));
}
```

- [ ] **Step 4: Run and commit**

```bash
npx vitest run packages/editor/src/dxf
npm run typecheck
git add packages/editor/src/dxf
git commit -m "feat(editor): DXF polylines to room drafts with cad provenance, walkability off"
```

---

## Task 7: Asset library and placement UI

**Files:**
- Create: `packages/editor/src/panels/AssetLibrary.tsx`, `src/panels/ContextExportButton.tsx`, `src/panels/DxfImportButton.tsx`
- Modify: `src/state/store.ts`, `src/App.tsx`
- Test: `src/panels/AssetLibrary.test.tsx`

**Interfaces:**
- Store gains `assets: AssetRecord[]`, `selectedAssetId: string | null`, `setAssets`, `selectAsset`.
- `AssetLibrary` props `{ api: Api; onPlace: (assetId: string) => void }`.

- [ ] **Step 1: Extend the store**

In `src/state/store.ts` add to the state type, the initial object, and the creator:

```ts
  assets: AssetRecord[];
  selectedAssetId: string | null;
  setAssets: (a: AssetRecord[]) => void;
  selectAsset: (id: string | null) => void;
```

```ts
  assets: [],
  selectedAssetId: null,
```

```ts
  setAssets: assets => set({ assets }),
  selectAsset: selectedAssetId => set({ selectedAssetId }),
```

with `import type { AssetRecord } from "../api/client";`.

- [ ] **Step 2: Write the failing test**

`packages/editor/src/panels/AssetLibrary.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useEditorStore } from "../state/store";
import { AssetLibrary } from "./AssetLibrary";

const asset = {
  id: "asset_1", filename: "library-arch.glb", checksum: "abc",
  sizeBytes: 1024, triangleCount: 4200,
  bbox: { minX: 0, minY: 0, minZ: 0, maxX: 2, maxY: 2, maxZ: 3 },
};

function api(overrides: Record<string, unknown> = {}) {
  return {
    listAssets: vi.fn(async () => [asset]),
    uploadAsset: vi.fn(async () => asset),
    ...overrides,
  } as never;
}

beforeEach(() => useEditorStore.getState().reset());

describe("AssetLibrary", () => {
  it("lists assets with their triangle count", async () => {
    render(<AssetLibrary api={api()} onPlace={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("library-arch.glb")).toBeTruthy());
    expect(screen.getByText(/4,?200/)).toBeTruthy();
  });

  it("selects an asset when clicked", async () => {
    render(<AssetLibrary api={api()} onPlace={vi.fn()} />);
    await waitFor(() => screen.getByText("library-arch.glb"));
    fireEvent.click(screen.getByText("library-arch.glb"));
    expect(useEditorStore.getState().selectedAssetId).toBe("asset_1");
  });

  it("reports an upload rejected for a budget breach", async () => {
    const failing = api({
      uploadAsset: vi.fn(async () => { throw new Error("asset exceeds the 150000 triangle budget"); }),
    });
    render(<AssetLibrary api={failing} onPlace={vi.fn()} />);
    await waitFor(() => screen.getByText("library-arch.glb"));
    const input = screen.getByLabelText(/upload/i) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File([new Uint8Array([1])], "big.glb")] } });
    await waitFor(() => expect(useEditorStore.getState().status).toMatch(/triangle budget/));
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

Run: `npx vitest run packages/editor/src/panels/AssetLibrary.test.tsx`
Expected: FAIL — cannot resolve `./AssetLibrary`.

- [ ] **Step 4: Implement**

`packages/editor/src/panels/AssetLibrary.tsx`:

```tsx
import { useEffect, useRef } from "react";
import type { Api } from "../api/client";
import { useEditorStore } from "../state/store";

export function AssetLibrary({ api, onPlace }: { api: Api; onPlace: (assetId: string) => void }) {
  const assets = useEditorStore(s => s.assets);
  const selectedAssetId = useEditorStore(s => s.selectedAssetId);
  const setAssets = useEditorStore(s => s.setAssets);
  const selectAsset = useEditorStore(s => s.selectAsset);
  const setStatus = useEditorStore(s => s.setStatus);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.listAssets().then(setAssets).catch(() => setAssets([]));
  }, [api, setAssets]);

  async function upload(file: File) {
    try {
      const created = await api.uploadAsset(file);
      setStatus(`Uploaded ${created.filename}.`);
      setAssets(await api.listAssets());
    } catch (err) {
      // Budget rejections arrive here; show the server's own words.
      setStatus(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="space-y-2 p-3 text-sm">
      <label className="block cursor-pointer text-xs text-stone-600">
        Upload a .glb
        <input
          ref={inputRef}
          aria-label="Upload a .glb"
          type="file"
          accept=".glb,model/gltf-binary"
          className="mt-1 block w-full text-xs"
          onChange={e => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
          }}
        />
      </label>

      <ul className="space-y-1">
        {assets.map(a => (
          <li key={a.id}>
            <button
              onClick={() => selectAsset(a.id)}
              className={`w-full rounded px-2 py-1 text-left ${
                selectedAssetId === a.id ? "bg-stone-800 text-white" : "hover:bg-stone-100"
              }`}
            >
              <div>{a.filename}</div>
              <div className="text-xs opacity-70">
                {a.triangleCount.toLocaleString()} tris · {Math.round(a.sizeBytes / 1024)} KB
              </div>
            </button>
          </li>
        ))}
      </ul>

      <button
        disabled={!selectedAssetId}
        onClick={() => selectedAssetId && onPlace(selectedAssetId)}
        className="w-full rounded bg-stone-800 py-1 text-white disabled:opacity-40"
      >
        Place in selected room
      </button>
    </div>
  );
}
```

- [ ] **Step 5: Implement the export and import buttons**

`packages/editor/src/panels/ContextExportButton.tsx`:

```tsx
import { buildContextGlb, CONTEXT_ORIGIN_NOTE } from "@oth/renderer";
import { activeLevel, roomsOnActiveLevel, useEditorStore } from "../state/store";

/**
 * Exports the active level as locked reference geometry. The modeller opens
 * this in Blender or Rhino, models inside it, and uploads only their new mesh.
 */
export function ContextExportButton() {
  const state = useEditorStore();
  const level = activeLevel(state);
  const rooms = roomsOnActiveLevel(state);
  const setStatus = useEditorStore(s => s.setStatus);

  return (
    <button
      disabled={!level || rooms.length === 0}
      title={CONTEXT_ORIGIN_NOTE}
      className="w-full rounded border px-2 py-1 text-sm disabled:opacity-40"
      onClick={async () => {
        if (!level) return;
        const bytes = await buildContextGlb(rooms, level);
        const url = URL.createObjectURL(new Blob([bytes], { type: "model/gltf-binary" }));
        const a = document.createElement("a");
        a.href = url;
        a.download = `oth-${level.code}-context.glb`;
        a.click();
        URL.revokeObjectURL(url);
        setStatus(`Exported ${rooms.length} rooms. ${CONTEXT_ORIGIN_NOTE}`);
      }}
    >
      Export context for Blender
    </button>
  );
}
```

`packages/editor/src/panels/DxfImportButton.tsx`:

```tsx
import { parseDxfPolylines } from "../dxf/parse";
import { polylinesToRooms } from "../dxf/toRooms";
import type { Saver } from "../state/save";
import { useEditorStore } from "../state/store";

export function DxfImportButton({ saver }: { saver: Saver }) {
  const activeLevelId = useEditorStore(s => s.activeLevelId);
  const setStatus = useEditorStore(s => s.setStatus);

  return (
    <label className="block cursor-pointer rounded border px-2 py-1 text-sm">
      Import DXF
      <input
        aria-label="Import DXF"
        type="file"
        accept=".dxf"
        className="hidden"
        onChange={async e => {
          const file = e.target.files?.[0];
          if (!file || !activeLevelId) return;
          const polys = parseDxfPolylines(await file.text());
          // Millimetres is the common CAD unit; the operator can correct scale
          // afterwards by re-importing, since nothing is walkable yet.
          const drafts = polylinesToRooms(polys, { levelId: activeLevelId, unitsToMetres: 0.001 });
          let created = 0;
          for (const draft of drafts) {
            if (await saver.create("room", draft)) created++;
          }
          setStatus(`Imported ${created} of ${polys.length} polylines from ${file.name}.`);
        }}
      />
    </label>
  );
}
```

- [ ] **Step 6: Wire them into `App.tsx`**

Add to the right-hand sidebar, below the inspector:

```tsx
import { AssetLibrary } from "./panels/AssetLibrary";
import { ContextExportButton } from "./panels/ContextExportButton";
import { DxfImportButton } from "./panels/DxfImportButton";
```

```tsx
            <div className="space-y-2 border-t p-3">
              <ContextExportButton />
              <DxfImportButton saver={saver} />
            </div>
            <AssetLibrary
              api={api}
              onPlace={assetId => {
                const selection = useEditorStore.getState().selection;
                if (!activeLevelId || !selection || selection.type !== "room") {
                  useEditorStore.getState().setStatus("Select a room first.");
                  return;
                }
                void saver.create("placement", {
                  id: `${activeLevelId}-place-${Date.now()}`,
                  levelId: activeLevelId,
                  assetId,
                  roomId: selection.id,
                  position: [0, 0, 0],
                });
              }}
            />
```

and pass the asset URL resolver to the preview:

```tsx
              {model && activeLevelId && (
                <MapScene model={model} activeLevelId={activeLevelId} assetUrl={api.assetFileUrl} />
              )}
```

- [ ] **Step 7: Run everything, typecheck, build and commit**

```bash
npm test
npm run typecheck
npm run build --workspace @oth/editor
git add packages/editor
git commit -m "feat(editor): asset library, context export and DXF import"
```

---

## Done criteria — and with it, approach A

- `npm test` green across all four packages; `npm run typecheck` clean; the editor builds.
- A teammate can export the active level as a `.glb` whose origin and units are documented, model against it, upload the result, and place it in a room.
- An uploaded asset over budget is refused with the server's own message.
- A DXF import creates rooms with `cad` provenance and walkability off.
- Placed assets render in the preview and still contribute nothing to routing.

At that point all four layers of the spec exist end to end: structure and navigation authored in plan view, dressing round-tripped through Blender, semantics on rooms, and an immutable validated publish.

## Still deferred

Named so nobody assumes otherwise:

- Vertex drag handles for editing an existing footprint (the ring operations are built and tested; the UI is not).
- The reference-image upload and calibration interface (the maths is built and tested).
- Presence and lock indicators in the UI (the API and store fields exist).
- Draco/meshopt compression on upload.
- The photo/video labelling tool — its own spec.
- The visitor-facing app — its own project.
