# Map Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `packages/renderer` (shared rendering of a `MapModel`) and `packages/editor` (the hosted authoring app) so three or four non-technical teammates can trace OTH's structure and navigation layers in a browser, see the result in 3D, and publish.

**Architecture:** Plan view is the primary authoring surface — a 2D SVG canvas over a calibrated floor-plan image — because footprint work is faster and far more accurate top-down than dragging gizmos in perspective, and because it is what a non-technical teammate can actually do. A live 3D preview sits beside it, rendered by `packages/renderer`, which the visitor app will later share so what you author is what visitors see. Everything geometric and arithmetic — the viewport transform, scale calibration, snapping, polygon editing — is a pure function in its own module, tested exhaustively; React components stay thin over that.

**Tech Stack:** React 18, Vite, TypeScript, Zustand, three.js via React Three Fiber, Tailwind. Vitest with jsdom for the editor.

**Spec:** [`docs/design-and-plans/specs/2026-09-04-oth-map-model-design.md`](../specs/2026-09-04-oth-map-model-design.md)

**Depends on:** [`2026-09-04-map-model-foundation.md`](2026-09-04-map-model-foundation.md) and [`2026-09-04-map-model-server.md`](2026-09-04-map-model-server.md), both complete. Consumes `@oth/model` and the server's API surface verbatim.

## Global Constraints

- **The model→three mapping exists exactly once**, in `packages/renderer/src/coords.ts`. Model plan coordinates are `(x, y)` metres with `y` north; three.js is `(x, elevation, -y)`. No component does this conversion itself. The hackathon spread a `depth - y` flip through its renderer and paid for it.
- **`packages/model` owns validity.** The editor never decides whether geometry is legal; it displays `ValidationReport` from the server and blocks nothing locally.
- **Every save is optimistic-locked.** Mutations send `expectedVersion`; a 409 surfaces a conflict to the user, never a silent retry or overwrite.
- **Pure logic lives outside React.** Viewport maths, calibration, snapping, and ring editing are plain functions with their own tests. A component that needs geometry imports it.
- **No editor route works without a session.** The app renders the login screen until `/api/auth/me` succeeds.
- **TypeScript strict**, tests as `*.test.ts(x)` beside the code.

---

## File Structure

`packages/renderer/`:
- `src/coords.ts` — the single model↔three mapping
- `src/geometry.ts` — room footprint → extruded `BufferGeometry`, holes included
- `src/theme.ts` — colours by room kind, light and dark
- `src/RoomMesh.tsx`, `src/LevelGroup.tsx`, `src/MapScene.tsx`
- `src/index.ts`

`packages/editor/`:
- `index.html`, `vite.config.ts`, `tailwind.config.ts`
- `src/api/client.ts` — typed wrapper over the server API
- `src/state/store.ts` — Zustand store
- `src/state/save.ts` — optimistic-locked mutation pipeline
- `src/plan/viewport.ts` — screen↔world transform
- `src/plan/calibration.ts` — pixels→metres from a drawn known dimension
- `src/plan/snapping.ts` — vertex/edge/grid snapping
- `src/plan/ring.ts` — insert/move/delete vertex on a footprint
- `src/plan/PlanCanvas.tsx` — the authoring surface
- `src/plan/Underlay.tsx` — the reference image
- `src/panels/Inspector.tsx`, `LevelSwitcher.tsx`, `ValidationPanel.tsx`, `PresenceBar.tsx`, `PublishButton.tsx`
- `src/preview/Preview3D.tsx`
- `src/auth/LoginScreen.tsx`
- `src/App.tsx`, `src/main.tsx`

---

## Task 1: Renderer package and the coordinate mapping

**Files:**
- Create: `packages/renderer/package.json`, `tsconfig.json`, `src/coords.ts`, `src/coords.test.ts`
- Modify: root `tsconfig.json`, root `vitest.config.ts`

**Interfaces:**
- Produces: `modelToThree(x, y, elevation): [number, number, number]`, `threeToModel(x, y, z): { x, y, elevation }`, `MODEL_UP_AXIS`.

- [ ] **Step 1: Create the package**

`packages/renderer/package.json`:

```json
{
  "name": "@oth/renderer",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "dependencies": {
    "@oth/model": "*",
    "@react-three/drei": "^9.114.0",
    "@react-three/fiber": "^8.17.0",
    "react": "^18.3.0",
    "three": "^0.169.0"
  },
  "devDependencies": {
    "@types/react": "^18.3.0",
    "@types/three": "^0.169.0"
  }
}
```

`packages/renderer/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src"],
  "compilerOptions": {
    "composite": true,
    "noEmit": false,
    "emitDeclarationOnly": true,
    "outDir": "dist",
    "jsx": "react-jsx",
    "lib": ["ES2022", "DOM"]
  },
  "references": [{ "path": "../model" }]
}
```

Add `{ "path": "./packages/renderer" }` to the root `tsconfig.json` references.

- [ ] **Step 2: Write the failing test**

`packages/renderer/src/coords.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { modelToThree, threeToModel } from "./coords";

describe("modelToThree", () => {
  it("maps the building origin to the three.js origin at ground level", () => {
    expect(modelToThree(0, 0, 0)).toEqual([0, 0, 0]);
  });

  it("keeps east as +x", () => {
    expect(modelToThree(10, 0, 0)).toEqual([10, 0, 0]);
  });

  it("maps north (+y) to -z, which is into the screen in three.js", () => {
    expect(modelToThree(0, 10, 0)).toEqual([0, 0, -10]);
  });

  it("maps elevation to +y, the three.js up axis", () => {
    expect(modelToThree(0, 0, 6.2)).toEqual([0, 6.2, 0]);
  });

  it("handles a realistic L2 point", () => {
    expect(modelToThree(142.29, 55.07, 6.2)).toEqual([142.29, 6.2, -55.07]);
  });
});

describe("threeToModel", () => {
  it("round-trips modelToThree", () => {
    const [x, y, z] = modelToThree(12.5, -3.25, 4);
    expect(threeToModel(x, y, z)).toEqual({ x: 12.5, y: -3.25, elevation: 4 });
  });

  it("is the inverse for the origin", () => {
    expect(threeToModel(0, 0, 0)).toEqual({ x: 0, y: 0, elevation: 0 });
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

Run: `npx vitest run packages/renderer`
Expected: FAIL — cannot resolve `./coords`.

- [ ] **Step 4: Implement**

`packages/renderer/src/coords.ts`:

```ts
/**
 * The one place model coordinates become three.js coordinates.
 *
 * The model is a plan: `(x, y)` in metres with x east and y north, plus a
 * per-level `elevation`. three.js is y-up and right-handed, so north maps to
 * -z. Getting this wrong mirrors the whole building, and the hackathon spread
 * an equivalent flip (`depth - y`) through several components and could not
 * keep its floors aligned. Every consumer calls these two functions.
 */
export const MODEL_UP_AXIS = "y" as const;

export function modelToThree(x: number, y: number, elevation: number): [number, number, number] {
  return [x, elevation, -y];
}

export function threeToModel(x: number, y: number, z: number): { x: number; y: number; elevation: number } {
  return { x, y: -z, elevation: y };
}
```

- [ ] **Step 5: Point Vitest at the new package**

The root `vitest.config.ts` already globs `packages/*/src/**/*.test.ts`. Extend it so editor tests get a DOM later:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/src/**/*.test.{ts,tsx}"],
    environment: "node",
    environmentMatchGlobs: [
      ["packages/editor/**", "jsdom"],
      ["packages/renderer/**", "jsdom"],
    ],
  },
});
```

- [ ] **Step 6: Run and commit**

```bash
npm install
npx vitest run packages/renderer
npm run typecheck
git add packages/renderer tsconfig.json vitest.config.ts package.json package-lock.json
git commit -m "feat(renderer): package scaffold and the single model-to-three coordinate mapping"
```

---

## Task 2: Room geometry with holes

**Files:**
- Create: `packages/renderer/src/geometry.ts`, `src/geometry.test.ts`

**Interfaces:**
- Consumes: `Room`, `Level` from `@oth/model`; `modelToThree`.
- Produces: `roomShape(room: Room): THREE.Shape`, `roomGeometry(room: Room, opts?: { slabHeightM?: number }): THREE.ExtrudeGeometry`, `SLAB_HEIGHT_M`.

- [ ] **Step 1: Write the failing test**

`packages/renderer/src/geometry.test.ts`:

```ts
import { RoomSchema } from "@oth/model";
import { describe, expect, it } from "vitest";
import { roomGeometry, roomShape } from "./geometry";

const square = RoomSchema.parse({
  id: "L1-lobby", levelId: "oth-L1", kind: "atrium",
  footprint: [[0, 0], [10, 0], [10, 10], [0, 10]],
  heightM: 6, walkable: true,
});

const withHole = RoomSchema.parse({
  ...square,
  id: "L1-atrium",
  holes: [[[4, 4], [6, 4], [6, 6], [4, 6]]],
});

describe("roomShape", () => {
  it("produces a closed shape with one point per footprint vertex", () => {
    expect(roomShape(square).getPoints(1)).toHaveLength(5);
  });

  it("adds a hole path for each hole", () => {
    expect(roomShape(withHole).holes).toHaveLength(1);
  });

  it("produces no holes for a room without any", () => {
    expect(roomShape(square).holes).toHaveLength(0);
  });
});

describe("roomGeometry", () => {
  it("produces a non-empty position attribute", () => {
    expect(roomGeometry(square).getAttribute("position").count).toBeGreaterThan(0);
  });

  it("spans the footprint in x", () => {
    const geo = roomGeometry(square);
    geo.computeBoundingBox();
    expect(geo.boundingBox?.min.x).toBeCloseTo(0);
    expect(geo.boundingBox?.max.x).toBeCloseTo(10);
  });

  it("maps north to -z, matching the coordinate mapping", () => {
    const geo = roomGeometry(square);
    geo.computeBoundingBox();
    expect(geo.boundingBox?.min.z).toBeCloseTo(-10);
    expect(geo.boundingBox?.max.z).toBeCloseTo(0);
  });

  it("extrudes upward by the slab height", () => {
    const geo = roomGeometry(square, { slabHeightM: 0.5 });
    geo.computeBoundingBox();
    expect(geo.boundingBox?.min.y).toBeCloseTo(0);
    expect(geo.boundingBox?.max.y).toBeCloseTo(0.5);
  });

  it("removes the hole's area from the mesh", () => {
    const solid = roomGeometry(square).getAttribute("position").count;
    const holed = roomGeometry(withHole).getAttribute("position").count;
    expect(holed).not.toBe(solid);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run packages/renderer/src/geometry.test.ts`
Expected: FAIL — cannot resolve `./geometry`.

- [ ] **Step 3: Implement**

`packages/renderer/src/geometry.ts`:

```ts
import type { Room } from "@oth/model";
import * as THREE from "three";

/** Rooms render as thin slabs; walls and volume come from the dressing layer. */
export const SLAB_HEIGHT_M = 0.12;

/**
 * Builds a three.js Shape in the XY plane. Extrusion then happens along +Z and
 * the whole thing is rotated so that model north becomes -z, which keeps the
 * mapping identical to `modelToThree` without doing the conversion per vertex.
 */
export function roomShape(room: Room): THREE.Shape {
  const shape = new THREE.Shape();
  const [first, ...rest] = room.footprint;
  if (!first) return shape;
  shape.moveTo(first[0], first[1]);
  for (const [x, y] of rest) shape.lineTo(x, y);
  shape.closePath();

  for (const hole of room.holes) {
    const path = new THREE.Path();
    const [h0, ...hRest] = hole;
    if (!h0) continue;
    path.moveTo(h0[0], h0[1]);
    for (const [x, y] of hRest) path.lineTo(x, y);
    path.closePath();
    shape.holes.push(path);
  }

  return shape;
}

export function roomGeometry(
  room: Room,
  opts: { slabHeightM?: number } = {},
): THREE.ExtrudeGeometry {
  const geometry = new THREE.ExtrudeGeometry(roomShape(room), {
    depth: opts.slabHeightM ?? SLAB_HEIGHT_M,
    bevelEnabled: false,
  });
  // Shape XY becomes model XY; rotating -90° about X sends +y (north) to -z and
  // the extrusion depth to +y (up), exactly matching modelToThree.
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run packages/renderer/src/geometry.test.ts`
Expected: PASS — 9 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/renderer/src/geometry.ts packages/renderer/src/geometry.test.ts
git commit -m "feat(renderer): extrude room footprints with hole support"
```

---

## Task 3: Theme and the scene components

**Files:**
- Create: `packages/renderer/src/theme.ts`, `src/RoomMesh.tsx`, `src/LevelGroup.tsx`, `src/MapScene.tsx`, `src/index.ts`
- Test: `packages/renderer/src/theme.test.ts`

**Interfaces:**
- Produces: `roomColor(kind, opts?): string`; components `RoomMesh`, `LevelGroup`, `MapScene`.
- `MapScene` props: `{ model: MapModel; activeLevelId: string; showLevelBelow?: boolean; selectedId?: string | null; onSelect?: (roomId: string) => void }`.

- [ ] **Step 1: Write the failing test**

`packages/renderer/src/theme.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { roomColor } from "./theme";

describe("roomColor", () => {
  it("gives every room kind a colour", () => {
    for (const kind of ["room", "corridor", "atrium", "service", "outdoor", "void"] as const) {
      expect(roomColor(kind)).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("distinguishes corridors from rooms, since that is the distinction users navigate by", () => {
    expect(roomColor("corridor")).not.toBe(roomColor("room"));
  });

  it("dims a room that is not on the active level", () => {
    expect(roomColor("room", { ghosted: true })).not.toBe(roomColor("room"));
  });

  it("highlights a selected room", () => {
    expect(roomColor("room", { selected: true })).not.toBe(roomColor("room"));
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run packages/renderer/src/theme.test.ts`
Expected: FAIL — cannot resolve `./theme`.

- [ ] **Step 3: Implement the theme**

`packages/renderer/src/theme.ts`:

```ts
import type { RoomKind } from "@oth/model";

/**
 * A restrained, legible palette. The visual target is "recognise where you are",
 * so structure reads as calm background and the dressing layer plus the route
 * carry attention. Corridors are deliberately distinct from rooms because that
 * is the distinction people navigate by.
 */
const BASE: Record<RoomKind, string> = {
  room: "#e7ddc7",
  corridor: "#cfc3a5",
  atrium: "#f0e8d6",
  service: "#d3d3cc",
  outdoor: "#cfe0c3",
  void: "#9aa0a6",
};

const SELECTED = "#f2a33c";
const GHOSTED = "#d8d8d4";

export function roomColor(
  kind: RoomKind,
  opts: { selected?: boolean; ghosted?: boolean } = {},
): string {
  if (opts.selected) return SELECTED;
  if (opts.ghosted) return GHOSTED;
  return BASE[kind];
}
```

- [ ] **Step 4: Implement the components**

`packages/renderer/src/RoomMesh.tsx`:

```tsx
import type { Room } from "@oth/model";
import { useMemo } from "react";
import { roomGeometry } from "./geometry";
import { roomColor } from "./theme";

export function RoomMesh({
  room, selected = false, ghosted = false, onSelect,
}: {
  room: Room;
  selected?: boolean;
  ghosted?: boolean;
  onSelect?: (roomId: string) => void;
}) {
  const geometry = useMemo(() => roomGeometry(room), [room]);

  return (
    <mesh
      geometry={geometry}
      castShadow
      receiveShadow
      onClick={event => {
        if (!onSelect) return;
        event.stopPropagation();
        onSelect(room.id);
      }}
    >
      <meshStandardMaterial
        color={roomColor(room.kind, { selected, ghosted })}
        transparent={ghosted}
        opacity={ghosted ? 0.35 : 1}
      />
    </mesh>
  );
}
```

`packages/renderer/src/LevelGroup.tsx`:

```tsx
import type { Level, Room } from "@oth/model";
import { modelToThree } from "./coords";
import { RoomMesh } from "./RoomMesh";

export function LevelGroup({
  level, rooms, ghosted = false, selectedId, onSelect,
}: {
  level: Level;
  rooms: Room[];
  ghosted?: boolean;
  selectedId?: string | null;
  onSelect?: (roomId: string) => void;
}) {
  // The level's elevation is applied once, here, rather than baked per room.
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
    </group>
  );
}
```

`packages/renderer/src/MapScene.tsx`:

```tsx
import type { MapModel } from "@oth/model";
import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useMemo } from "react";
import { LevelGroup } from "./LevelGroup";

export type MapSceneProps = {
  model: MapModel;
  activeLevelId: string;
  /** Ghost the level below so vertical alignment is visible while authoring. */
  showLevelBelow?: boolean;
  selectedId?: string | null;
  onSelect?: (roomId: string) => void;
};

export function MapScene({
  model, activeLevelId, showLevelBelow = true, selectedId, onSelect,
}: MapSceneProps) {
  const { active, below } = useMemo(() => {
    const ordered = [...model.levels].sort((a, b) => a.ordinal - b.ordinal);
    const index = ordered.findIndex(l => l.id === activeLevelId);
    return { active: ordered[index] ?? null, below: index > 0 ? ordered[index - 1] : null };
  }, [model.levels, activeLevelId]);

  const roomsFor = (levelId: string) => model.rooms.filter(r => r.levelId === levelId);

  return (
    <Canvas shadows camera={{ position: [80, 90, 80], fov: 45 }}>
      <ambientLight intensity={0.7} />
      <directionalLight position={[60, 120, 40]} intensity={1.1} castShadow />
      {showLevelBelow && below && (
        <LevelGroup level={below} rooms={roomsFor(below.id)} ghosted />
      )}
      {active && (
        <LevelGroup
          level={active}
          rooms={roomsFor(active.id)}
          selectedId={selectedId}
          onSelect={onSelect}
        />
      )}
      <OrbitControls makeDefault />
    </Canvas>
  );
}
```

`packages/renderer/src/index.ts`:

```ts
export * from "./coords";
export * from "./geometry";
export * from "./theme";
export * from "./RoomMesh";
export * from "./LevelGroup";
export * from "./MapScene";
```

- [ ] **Step 5: Run, typecheck and commit**

```bash
npx vitest run packages/renderer
npm run typecheck
git add packages/renderer
git commit -m "feat(renderer): room/level/scene components with a ghosted level below"
```

---

## Task 4: Editor package and the login screen

**Files:**
- Create: `packages/editor/package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `tailwind.config.ts`, `postcss.config.js`, `src/main.tsx`, `src/styles.css`, `src/api/client.ts`, `src/auth/LoginScreen.tsx`, `src/App.tsx`
- Test: `src/api/client.test.ts`

**Interfaces:**
- Produces: `api` client with `login`, `logout`, `me`, `getModel`, `validate`, `createEntity`, `updateEntity`, `deleteEntity`, `acquireLock`, `releaseLock`, `heartbeat`, `publish`; `ApiError` with `status` and `body`; `ConflictError` with `current`.

- [ ] **Step 1: Create the package**

`packages/editor/package.json`:

```json
{
  "name": "@oth/editor",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@oth/model": "*",
    "@oth/renderer": "*",
    "@react-three/drei": "^9.114.0",
    "@react-three/fiber": "^8.17.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "three": "^0.169.0",
    "zustand": "^4.5.0"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.5.0",
    "@testing-library/react": "^16.0.0",
    "@testing-library/user-event": "^14.5.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "autoprefixer": "^10.4.19",
    "jsdom": "^25.0.0",
    "postcss": "^8.4.38",
    "tailwindcss": "^3.4.0",
    "vite": "^5.4.0"
  }
}
```

`packages/editor/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src"],
  "compilerOptions": {
    "composite": true,
    "noEmit": false,
    "emitDeclarationOnly": true,
    "outDir": "dist",
    "jsx": "react-jsx",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["vite/client"]
  },
  "references": [{ "path": "../model" }, { "path": "../renderer" }]
}
```

`packages/editor/vite.config.ts`:

```ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    // The API is same-origin in production; in dev it runs separately.
    proxy: { "/api": "http://localhost:3000" },
  },
});
```

`packages/editor/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>OTH Map Editor</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`packages/editor/tailwind.config.ts`:

```ts
import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: { extend: {} },
  plugins: [],
} satisfies Config;
```

`packages/editor/postcss.config.js`:

```js
export default { plugins: { tailwindcss: {}, autoprefixer: {} } };
```

`packages/editor/src/styles.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

html, body, #root { height: 100%; }
```

Add `{ "path": "./packages/editor" }` to the root `tsconfig.json` references.

- [ ] **Step 2: Write the failing API-client test**

`packages/editor/src/api/client.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, ConflictError, createApi } from "./client";

function mockFetch(status: number, body: unknown) {
  return vi.fn(async () =>
    new Response(body === undefined ? null : JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    }),
  );
}

afterEach(() => vi.restoreAllMocks());

describe("api client", () => {
  it("posts credentials to the login route", async () => {
    const fetchImpl = mockFetch(200, { user: { id: "user_1", displayName: "Wei" } });
    const api = createApi({ fetchImpl });
    const user = await api.login("wei@example.com", "pw");
    expect(user.displayName).toBe("Wei");
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("/api/auth/login");
    expect(init?.method).toBe("POST");
  });

  it("sends cookies, since the session lives in one", async () => {
    const fetchImpl = mockFetch(200, { user: { id: "u", displayName: "W" } });
    await createApi({ fetchImpl }).login("a@b.c", "pw");
    expect(fetchImpl.mock.calls[0]![1]?.credentials).toBe("same-origin");
  });

  it("throws ApiError carrying the status", async () => {
    const api = createApi({ fetchImpl: mockFetch(401, { error: "unauthenticated" }) });
    await expect(api.me()).rejects.toBeInstanceOf(ApiError);
    await expect(api.me()).rejects.toMatchObject({ status: 401 });
  });

  it("throws ConflictError with the current state on 409", async () => {
    const current = { id: "L1-lobby", version: 3, nameEn: "Theirs" };
    const api = createApi({ fetchImpl: mockFetch(409, { error: "version conflict", current }) });
    await expect(api.updateEntity("room", "L1-lobby", 0, { nameEn: "Mine" }))
      .rejects.toMatchObject({ current });
    await expect(api.updateEntity("room", "L1-lobby", 0, { nameEn: "Mine" }))
      .rejects.toBeInstanceOf(ConflictError);
  });

  it("sends expectedVersion on an update", async () => {
    const fetchImpl = mockFetch(200, { entity: { id: "L1-lobby", version: 1 } });
    await createApi({ fetchImpl }).updateEntity("room", "L1-lobby", 0, { nameEn: "X" });
    const body = JSON.parse(String(fetchImpl.mock.calls[0]![1]?.body));
    expect(body.expectedVersion).toBe(0);
  });

  it("returns the validation report unchanged", async () => {
    const report = { issues: [], errorCount: 0, warningCount: 0, ok: true };
    const api = createApi({ fetchImpl: mockFetch(200, report) });
    expect(await api.validate()).toEqual(report);
  });

  it("surfaces a blocked publish as ApiError with the report", async () => {
    const report = { issues: [{ code: "room.unreachable" }], errorCount: 1, warningCount: 0, ok: false };
    const api = createApi({ fetchImpl: mockFetch(422, { error: "validation failed", report }) });
    await expect(api.publish()).rejects.toMatchObject({ status: 422 });
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

Run: `npx vitest run packages/editor`
Expected: FAIL — cannot resolve `./client`.

- [ ] **Step 4: Implement**

`packages/editor/src/api/client.ts`:

```ts
import type { MapModel, ValidationReport } from "@oth/model";

export class ApiError extends Error {
  constructor(public readonly status: number, public readonly body: unknown) {
    super(`api error ${status}`);
    this.name = "ApiError";
  }
}

/** A 409 is a real editorial event, not a transport failure — it gets its own type. */
export class ConflictError extends ApiError {
  constructor(public readonly current: Record<string, unknown> | null, body: unknown) {
    super(409, body);
    this.name = "ConflictError";
  }
}

export type EntityType =
  | "level" | "room" | "doorway" | "entrance"
  | "portal" | "portalEndpoint" | "navHint" | "placement" | "tenant";

export type SessionUser = { id: string; email: string; displayName: string };

export type ApiOptions = { fetchImpl?: typeof fetch; baseUrl?: string };

export function createApi(options: ApiOptions = {}) {
  const doFetch = options.fetchImpl ?? fetch;
  const base = options.baseUrl ?? "";

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await doFetch(`${base}${path}`, {
      ...init,
      // The session lives in an httpOnly cookie, so every call must carry it.
      credentials: "same-origin",
      headers: init.body instanceof FormData
        ? init.headers
        : { "content-type": "application/json", ...(init.headers ?? {}) },
    });

    if (res.status === 204) return undefined as T;

    const body = await res.json().catch(() => null);
    if (!res.ok) {
      if (res.status === 409) {
        const current = (body as { current?: Record<string, unknown> } | null)?.current ?? null;
        throw new ConflictError(current, body);
      }
      throw new ApiError(res.status, body);
    }
    return body as T;
  }

  const json = (data: unknown) => JSON.stringify(data);

  return {
    async login(email: string, password: string): Promise<SessionUser> {
      const body = await request<{ user: SessionUser }>("/api/auth/login", {
        method: "POST",
        body: json({ email, password }),
      });
      return body.user;
    },

    logout: () => request<void>("/api/auth/logout", { method: "POST" }),

    async me(): Promise<SessionUser> {
      return (await request<{ user: SessionUser }>("/api/auth/me")).user;
    },

    getModel: () => request<MapModel>("/api/model"),

    validate: () => request<ValidationReport>("/api/model/validate"),

    async createEntity(type: EntityType, data: unknown) {
      const body = await request<{ entity: Record<string, unknown> }>(`/api/entities/${type}`, {
        method: "POST",
        body: json({ data }),
      });
      return body.entity;
    },

    async updateEntity(
      type: EntityType, id: string, expectedVersion: number, data: Record<string, unknown>,
    ) {
      const body = await request<{ entity: Record<string, unknown> }>(`/api/entities/${type}/${id}`, {
        method: "PATCH",
        body: json({ expectedVersion, data }),
      });
      return body.entity;
    },

    async deleteEntity(type: EntityType, id: string, expectedVersion: number) {
      const body = await request<{ entity: Record<string, unknown> }>(`/api/entities/${type}/${id}`, {
        method: "DELETE",
        body: json({ expectedVersion }),
      });
      return body.entity;
    },

    acquireLock: (type: string, id: string) =>
      request<{ lock: unknown }>(`/api/locks/${type}/${id}`, { method: "POST" }),

    releaseLock: (type: string, id: string) =>
      request<void>(`/api/locks/${type}/${id}`, { method: "DELETE" }),

    heartbeat: (levelId: string | null) =>
      request<void>("/api/presence", { method: "POST", body: json({ levelId }) }),

    publish: (notes?: string) =>
      request<{ version: string; warningCount: number }>("/api/publish", {
        method: "POST",
        body: json({ notes }),
      }),
  };
}

export type Api = ReturnType<typeof createApi>;
```

- [ ] **Step 5: Run the test**

Run: `npx vitest run packages/editor`
Expected: PASS — 7 tests.

- [ ] **Step 6: Implement the login screen and app shell**

`packages/editor/src/auth/LoginScreen.tsx`:

```tsx
import { useState } from "react";
import type { Api, SessionUser } from "../api/client";

export function LoginScreen({ api, onSignedIn }: { api: Api; onSignedIn: (u: SessionUser) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onSignedIn(await api.login(email, password));
    } catch {
      // The server deliberately does not distinguish these, and nor do we.
      setError("Email or password is incorrect.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full items-center justify-center bg-stone-100">
      <form onSubmit={submit} className="w-80 space-y-4 rounded-lg bg-white p-6 shadow">
        <h1 className="text-lg font-semibold">OTH Map Editor</h1>
        <label className="block text-sm">
          Email
          <input
            className="mt-1 w-full rounded border px-2 py-1"
            type="email" value={email} required
            onChange={e => setEmail(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          Password
          <input
            className="mt-1 w-full rounded border px-2 py-1"
            type="password" value={password} required
            onChange={e => setPassword(e.target.value)}
          />
        </label>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <button
          type="submit" disabled={busy}
          className="w-full rounded bg-stone-800 py-1.5 text-white disabled:opacity-50"
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
```

`packages/editor/src/main.tsx`:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 7: Commit**

```bash
npm install
npx vitest run packages/editor
git add packages/editor tsconfig.json package.json package-lock.json
git commit -m "feat(editor): package scaffold, typed API client and login screen"
```

---

## Task 5: Viewport transform

**Files:**
- Create: `packages/editor/src/plan/viewport.ts`, `src/plan/viewport.test.ts`

**Interfaces:**
- Produces: `type Viewport = { originX: number; originY: number; scale: number }` (scale = pixels per metre); `worldToScreen(vp, p): [number, number]`, `screenToWorld(vp, p): [number, number]`, `panViewport(vp, dxPx, dyPx): Viewport`, `zoomViewport(vp, factor, anchorPx): Viewport`, `fitViewport(bbox, widthPx, heightPx, padPx?): Viewport`, `DEFAULT_VIEWPORT`.

- [ ] **Step 1: Write the failing test**

`packages/editor/src/plan/viewport.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  fitViewport, panViewport, screenToWorld, worldToScreen, zoomViewport, type Viewport,
} from "./viewport";

const vp: Viewport = { originX: 0, originY: 0, scale: 10 };

describe("worldToScreen", () => {
  it("puts the world origin at the viewport origin", () => {
    expect(worldToScreen(vp, [0, 0])).toEqual([0, 0]);
  });

  it("scales metres to pixels", () => {
    expect(worldToScreen(vp, [3, 0])).toEqual([30, 0]);
  });

  it("flips y, because screen y grows downward and world y is north", () => {
    expect(worldToScreen(vp, [0, 3])).toEqual([0, -30]);
  });

  it("applies the pan origin", () => {
    expect(worldToScreen({ ...vp, originX: 5, originY: 2 }, [0, 0])).toEqual([5, 2]);
  });
});

describe("screenToWorld", () => {
  it("inverts worldToScreen", () => {
    const p: [number, number] = [12.5, -4.25];
    const [sx, sy] = worldToScreen(vp, p);
    const [wx, wy] = screenToWorld(vp, [sx, sy]);
    expect(wx).toBeCloseTo(p[0]);
    expect(wy).toBeCloseTo(p[1]);
  });

  it("inverts under a pan and zoom too", () => {
    const moved = zoomViewport(panViewport(vp, 40, -15), 2, [100, 100]);
    const [sx, sy] = worldToScreen(moved, [7, -3]);
    const [wx, wy] = screenToWorld(moved, [sx, sy]);
    expect(wx).toBeCloseTo(7);
    expect(wy).toBeCloseTo(-3);
  });
});

describe("panViewport", () => {
  it("shifts the origin by the pixel delta", () => {
    expect(panViewport(vp, 10, -4)).toEqual({ originX: 10, originY: -4, scale: 10 });
  });
});

describe("zoomViewport", () => {
  it("multiplies the scale", () => {
    expect(zoomViewport(vp, 2, [0, 0]).scale).toBe(20);
  });

  it("keeps the world point under the anchor fixed", () => {
    const anchor: [number, number] = [123, 77];
    const before = screenToWorld(vp, anchor);
    const after = screenToWorld(zoomViewport(vp, 2.5, anchor), anchor);
    expect(after[0]).toBeCloseTo(before[0]);
    expect(after[1]).toBeCloseTo(before[1]);
  });

  it("clamps to a sane range so the canvas cannot be zoomed into uselessness", () => {
    expect(zoomViewport(vp, 1e9, [0, 0]).scale).toBeLessThanOrEqual(500);
    expect(zoomViewport(vp, 1e-9, [0, 0]).scale).toBeGreaterThanOrEqual(0.1);
  });
});

describe("fitViewport", () => {
  it("fits a bounding box into the canvas", () => {
    const fitted = fitViewport({ minX: 0, minY: 0, maxX: 100, maxY: 50 }, 800, 600, 0);
    expect(fitted.scale).toBeCloseTo(8);
  });

  it("fits by the tighter axis", () => {
    const fitted = fitViewport({ minX: 0, minY: 0, maxX: 100, maxY: 100 }, 800, 400, 0);
    expect(fitted.scale).toBeCloseTo(4);
  });

  it("centres the box", () => {
    const box = { minX: 0, minY: 0, maxX: 100, maxY: 50 };
    const fitted = fitViewport(box, 800, 600, 0);
    const [cx, cy] = worldToScreen(fitted, [50, 25]);
    expect(cx).toBeCloseTo(400);
    expect(cy).toBeCloseTo(300);
  });

  it("falls back to a usable viewport for an empty box", () => {
    const fitted = fitViewport({ minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }, 800, 600);
    expect(Number.isFinite(fitted.scale)).toBe(true);
    expect(fitted.scale).toBeGreaterThan(0);
  });
});
```

The zoom-anchor test is the one that matters: zooming toward the cursor is the difference between a canvas that feels right and one that fights you.

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run packages/editor/src/plan/viewport.test.ts`
Expected: FAIL — cannot resolve `./viewport`.

- [ ] **Step 3: Implement**

`packages/editor/src/plan/viewport.ts`:

```ts
import type { BBox, Vec2 } from "@oth/model";

/** `scale` is pixels per metre; `origin` is where world (0,0) sits on screen. */
export type Viewport = { originX: number; originY: number; scale: number };

export const MIN_SCALE = 0.1;
export const MAX_SCALE = 500;

export const DEFAULT_VIEWPORT: Viewport = { originX: 0, originY: 0, scale: 4 };

/** World y is north; screen y grows downward, so it is negated here and only here. */
export function worldToScreen(vp: Viewport, [x, y]: Vec2): [number, number] {
  return [vp.originX + x * vp.scale, vp.originY - y * vp.scale];
}

export function screenToWorld(vp: Viewport, [sx, sy]: Vec2): [number, number] {
  return [(sx - vp.originX) / vp.scale, (vp.originY - sy) / vp.scale];
}

export function panViewport(vp: Viewport, dxPx: number, dyPx: number): Viewport {
  return { ...vp, originX: vp.originX + dxPx, originY: vp.originY + dyPx };
}

/** Zooms about `anchorPx`, so the world point under the cursor stays put. */
export function zoomViewport(vp: Viewport, factor: number, anchorPx: Vec2): Viewport {
  const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, vp.scale * factor));
  const applied = scale / vp.scale;
  return {
    scale,
    originX: anchorPx[0] - (anchorPx[0] - vp.originX) * applied,
    originY: anchorPx[1] - (anchorPx[1] - vp.originY) * applied,
  };
}

export function fitViewport(bbox: BBox, widthPx: number, heightPx: number, padPx = 40): Viewport {
  const w = bbox.maxX - bbox.minX;
  const h = bbox.maxY - bbox.minY;
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
    return { ...DEFAULT_VIEWPORT, originX: widthPx / 2, originY: heightPx / 2 };
  }

  const scale = Math.min(
    MAX_SCALE,
    Math.max(MIN_SCALE, Math.min((widthPx - padPx * 2) / w, (heightPx - padPx * 2) / h)),
  );

  const cx = (bbox.minX + bbox.maxX) / 2;
  const cy = (bbox.minY + bbox.maxY) / 2;
  return {
    scale,
    originX: widthPx / 2 - cx * scale,
    originY: heightPx / 2 + cy * scale,
  };
}
```

- [ ] **Step 4: Run and commit**

```bash
npx vitest run packages/editor/src/plan/viewport.test.ts
git add packages/editor/src/plan
git commit -m "feat(editor): plan-view viewport transform with cursor-anchored zoom"
```

---

## Task 6: Scale calibration

**Files:**
- Create: `packages/editor/src/plan/calibration.ts`, `src/plan/calibration.test.ts`

**Interfaces:**
- Produces: `type Calibration = { metresPerPixel: number; offsetX: number; offsetY: number }`; `calibrationFromMeasurement(a, b, realMetres): { metresPerPixel: number }`, `imagePointToWorld(cal, p): [number, number]`, `worldToImagePoint(cal, p): [number, number]`, `CalibrationError`.

- [ ] **Step 1: Write the failing test**

`packages/editor/src/plan/calibration.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  CalibrationError, calibrationFromMeasurement, imagePointToWorld, worldToImagePoint,
} from "./calibration";

describe("calibrationFromMeasurement", () => {
  it("derives metres per pixel from a horizontal measurement", () => {
    // 200 px drawn along something known to be 20 m.
    expect(calibrationFromMeasurement([0, 0], [200, 0], 20).metresPerPixel).toBeCloseTo(0.1);
  });

  it("uses the diagonal length, not just one axis", () => {
    // A 3-4-5 triangle: 300 px across and 400 down is a 500 px line.
    const cal = calibrationFromMeasurement([0, 0], [300, 400], 50);
    expect(cal.metresPerPixel).toBeCloseTo(0.1);
  });

  it("rejects a zero-length measurement, which would divide by zero", () => {
    expect(() => calibrationFromMeasurement([10, 10], [10, 10], 20)).toThrow(CalibrationError);
  });

  it("rejects a non-positive real distance", () => {
    expect(() => calibrationFromMeasurement([0, 0], [100, 0], 0)).toThrow(CalibrationError);
  });

  it("rejects a negative real distance", () => {
    expect(() => calibrationFromMeasurement([0, 0], [100, 0], -5)).toThrow(CalibrationError);
  });
});

describe("imagePointToWorld", () => {
  const cal = { metresPerPixel: 0.1, offsetX: 0, offsetY: 0 };

  it("scales pixels to metres", () => {
    expect(imagePointToWorld(cal, [200, 0])).toEqual([20, 0]);
  });

  it("flips y, because image y grows downward and world y is north", () => {
    expect(imagePointToWorld(cal, [0, 200])).toEqual([0, -20]);
  });

  it("applies the offset so the image can be placed anywhere on the building datum", () => {
    expect(imagePointToWorld({ ...cal, offsetX: 5, offsetY: 3 }, [0, 0])).toEqual([5, 3]);
  });

  it("round-trips with worldToImagePoint", () => {
    const c = { metresPerPixel: 0.07, offsetX: 12, offsetY: -4 };
    const [ix, iy] = worldToImagePoint(c, [42.5, 17.25]);
    const [wx, wy] = imagePointToWorld(c, [ix, iy]);
    expect(wx).toBeCloseTo(42.5);
    expect(wy).toBeCloseTo(17.25);
  });
});
```

This is the cheapest accuracy win available. The hackathon eyeballed its scale — `depthM = 148.47`, with a comment admitting the guess — and every polygon it traced inherited that error.

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run packages/editor/src/plan/calibration.test.ts`
Expected: FAIL — cannot resolve `./calibration`.

- [ ] **Step 3: Implement**

`packages/editor/src/plan/calibration.ts`:

```ts
import type { Vec2 } from "@oth/model";

export class CalibrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CalibrationError";
  }
}

/**
 * Places a floor-plan image on the building datum.
 *
 * `metresPerPixel` comes from the user drawing a line along something whose real
 * length they know — a corridor width, a grid spacing, a scale bar. Guessing it
 * instead is how the hackathon's geometry ended up wrong at every scale.
 */
export type Calibration = {
  metresPerPixel: number;
  /** World metres of the image's top-left pixel. */
  offsetX: number;
  offsetY: number;
};

export function calibrationFromMeasurement(
  a: Vec2, b: Vec2, realMetres: number,
): { metresPerPixel: number } {
  if (!(realMetres > 0)) {
    throw new CalibrationError("the real distance must be greater than zero");
  }
  const pixels = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (pixels === 0) {
    throw new CalibrationError("draw a line with some length before entering a distance");
  }
  return { metresPerPixel: realMetres / pixels };
}

export function imagePointToWorld(cal: Calibration, [px, py]: Vec2): [number, number] {
  return [
    cal.offsetX + px * cal.metresPerPixel,
    cal.offsetY - py * cal.metresPerPixel,
  ];
}

export function worldToImagePoint(cal: Calibration, [wx, wy]: Vec2): [number, number] {
  return [
    (wx - cal.offsetX) / cal.metresPerPixel,
    (cal.offsetY - wy) / cal.metresPerPixel,
  ];
}
```

- [ ] **Step 4: Run and commit**

```bash
npx vitest run packages/editor/src/plan/calibration.test.ts
git add packages/editor/src/plan/calibration.ts packages/editor/src/plan/calibration.test.ts
git commit -m "feat(editor): scale calibration from a drawn known dimension"
```

---

## Task 7: Snapping

**Files:**
- Create: `packages/editor/src/plan/snapping.ts`, `src/plan/snapping.test.ts`

**Interfaces:**
- Produces: `type SnapTarget = { point: Vec2; kind: "vertex" | "edge" | "grid" | "none" }`; `snapPoint(world, candidates, opts): SnapTarget` where `opts = { toleranceM: number; gridM?: number }` and `candidates: { rings: Ring[] }`.

- [ ] **Step 1: Write the failing test**

`packages/editor/src/plan/snapping.test.ts`:

```ts
import type { Ring } from "@oth/model";
import { describe, expect, it } from "vitest";
import { snapPoint } from "./snapping";

const square: Ring = [[0, 0], [10, 0], [10, 10], [0, 10]];
const opts = { toleranceM: 0.5, gridM: 1 };

describe("snapPoint", () => {
  it("snaps to a nearby vertex", () => {
    const s = snapPoint([10.2, 0.1], { rings: [square] }, opts);
    expect(s.kind).toBe("vertex");
    expect(s.point).toEqual([10, 0]);
  });

  it("prefers a vertex over an edge when both are in range", () => {
    // Near the corner: the edge is also within tolerance, but the vertex wins.
    expect(snapPoint([0.1, 0.1], { rings: [square] }, opts).kind).toBe("vertex");
  });

  it("snaps to a point on an edge when no vertex is close", () => {
    const s = snapPoint([5, 0.2], { rings: [square] }, opts);
    expect(s.kind).toBe("edge");
    expect(s.point[0]).toBeCloseTo(5);
    expect(s.point[1]).toBeCloseTo(0);
  });

  it("falls back to the grid when nothing else is close", () => {
    const s = snapPoint([3.1, 6.9], { rings: [] }, opts);
    expect(s.kind).toBe("grid");
    expect(s.point).toEqual([3, 7]);
  });

  it("returns the point unchanged when the grid is disabled and nothing is near", () => {
    const s = snapPoint([3.1, 6.9], { rings: [] }, { toleranceM: 0.5 });
    expect(s.kind).toBe("none");
    expect(s.point).toEqual([3.1, 6.9]);
  });

  it("respects the tolerance", () => {
    expect(snapPoint([12, 0], { rings: [square] }, { toleranceM: 0.5 }).kind).toBe("none");
  });

  it("snaps across several rings", () => {
    const other: Ring = [[20, 20], [30, 20], [30, 30]];
    expect(snapPoint([20.1, 20.1], { rings: [square, other] }, opts).point).toEqual([20, 20]);
  });
});
```

Vertex-over-edge precedence is the point: when tracing a room that abuts an existing one, you almost always mean the corner.

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run packages/editor/src/plan/snapping.test.ts`
Expected: FAIL — cannot resolve `./snapping`.

- [ ] **Step 3: Implement**

`packages/editor/src/plan/snapping.ts`:

```ts
import type { Ring, Vec2 } from "@oth/model";

export type SnapKind = "vertex" | "edge" | "grid" | "none";
export type SnapTarget = { point: Vec2; kind: SnapKind };

export type SnapOptions = { toleranceM: number; gridM?: number };
export type SnapCandidates = { rings: readonly Ring[] };

function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

/** Closest point on segment ab to p, clamped to the segment. */
function closestOnSegment(p: Vec2, a: Vec2, b: Vec2): Vec2 {
  const vx = b[0] - a[0];
  const vy = b[1] - a[1];
  const lenSq = vx * vx + vy * vy;
  if (lenSq === 0) return a;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / lenSq));
  return [a[0] + t * vx, a[1] + t * vy];
}

/**
 * Vertex beats edge beats grid.
 *
 * The precedence is deliberate: when you trace a room against one that already
 * exists, you nearly always mean its corner, and a shared corner is what lets
 * two footprints abut exactly rather than leaving a sliver the nav bake would
 * turn into a phantom wall.
 */
export function snapPoint(
  world: Vec2, candidates: SnapCandidates, opts: SnapOptions,
): SnapTarget {
  let best: { point: Vec2; d: number } | null = null;

  for (const ring of candidates.rings) {
    for (const vertex of ring) {
      const d = distance(world, vertex);
      if (d <= opts.toleranceM && (!best || d < best.d)) best = { point: vertex, d };
    }
  }
  if (best) return { point: best.point, kind: "vertex" };

  for (const ring of candidates.rings) {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      if (!a || !b) continue;
      const p = closestOnSegment(world, a, b);
      const d = distance(world, p);
      if (d <= opts.toleranceM && (!best || d < best.d)) best = { point: p, d };
    }
  }
  if (best) return { point: best.point, kind: "edge" };

  if (opts.gridM && opts.gridM > 0) {
    return {
      point: [
        Math.round(world[0] / opts.gridM) * opts.gridM,
        Math.round(world[1] / opts.gridM) * opts.gridM,
      ],
      kind: "grid",
    };
  }

  return { point: world, kind: "none" };
}
```

- [ ] **Step 4: Run and commit**

```bash
npx vitest run packages/editor/src/plan/snapping.test.ts
git add packages/editor/src/plan/snapping.ts packages/editor/src/plan/snapping.test.ts
git commit -m "feat(editor): vertex/edge/grid snapping with vertex precedence"
```

---

## Task 8: Ring editing operations

**Files:**
- Create: `packages/editor/src/plan/ring.ts`, `src/plan/ring.test.ts`

**Interfaces:**
- Produces: `moveVertex(ring, index, to): Ring`, `insertVertex(ring, afterIndex, point): Ring`, `deleteVertex(ring, index): Ring`, `nearestEdgeIndex(ring, p): number`, `MIN_RING_LENGTH`.

- [ ] **Step 1: Write the failing test**

`packages/editor/src/plan/ring.test.ts`:

```ts
import type { Ring } from "@oth/model";
import { describe, expect, it } from "vitest";
import { deleteVertex, insertVertex, moveVertex, nearestEdgeIndex } from "./ring";

const square: Ring = [[0, 0], [10, 0], [10, 10], [0, 10]];

describe("moveVertex", () => {
  it("moves the named vertex", () => {
    expect(moveVertex(square, 1, [12, 1])[1]).toEqual([12, 1]);
  });

  it("leaves the other vertices alone", () => {
    const moved = moveVertex(square, 1, [12, 1]);
    expect(moved[0]).toEqual([0, 0]);
    expect(moved[3]).toEqual([0, 10]);
  });

  it("does not mutate the input", () => {
    moveVertex(square, 0, [99, 99]);
    expect(square[0]).toEqual([0, 0]);
  });

  it("ignores an out-of-range index rather than corrupting the ring", () => {
    expect(moveVertex(square, 9, [1, 1])).toEqual(square);
  });
});

describe("insertVertex", () => {
  it("inserts after the given edge", () => {
    const r = insertVertex(square, 0, [5, 0]);
    expect(r).toHaveLength(5);
    expect(r[1]).toEqual([5, 0]);
  });

  it("inserts after the last edge, wrapping to the end", () => {
    const r = insertVertex(square, 3, [0, 5]);
    expect(r).toHaveLength(5);
    expect(r[4]).toEqual([0, 5]);
  });
});

describe("deleteVertex", () => {
  it("removes the vertex", () => {
    const r = deleteVertex(square, 2);
    expect(r).toHaveLength(3);
    expect(r).not.toContainEqual([10, 10]);
  });

  it("refuses to go below three points, which would stop being a ring", () => {
    const triangle: Ring = [[0, 0], [1, 0], [0, 1]];
    expect(deleteVertex(triangle, 0)).toEqual(triangle);
  });
});

describe("nearestEdgeIndex", () => {
  it("finds the bottom edge", () => {
    expect(nearestEdgeIndex(square, [5, 0.1])).toBe(0);
  });

  it("finds the closing edge, which wraps from last to first", () => {
    expect(nearestEdgeIndex(square, [0.1, 5])).toBe(3);
  });

  it("returns -1 for a ring too short to have edges", () => {
    expect(nearestEdgeIndex([[0, 0]], [1, 1])).toBe(-1);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run packages/editor/src/plan/ring.test.ts`
Expected: FAIL — cannot resolve `./ring`.

- [ ] **Step 3: Implement**

`packages/editor/src/plan/ring.ts`:

```ts
import type { Ring, Vec2 } from "@oth/model";

/** Below three points it is no longer a ring, and the model would reject it. */
export const MIN_RING_LENGTH = 3;

export function moveVertex(ring: Ring, index: number, to: Vec2): Ring {
  if (index < 0 || index >= ring.length) return ring;
  const next = ring.slice();
  next[index] = to;
  return next;
}

/** Inserts a point into the edge running from `afterIndex` to the next vertex. */
export function insertVertex(ring: Ring, afterIndex: number, point: Vec2): Ring {
  const next = ring.slice();
  next.splice(afterIndex + 1, 0, point);
  return next;
}

export function deleteVertex(ring: Ring, index: number): Ring {
  if (ring.length <= MIN_RING_LENGTH) return ring;
  if (index < 0 || index >= ring.length) return ring;
  const next = ring.slice();
  next.splice(index, 1);
  return next;
}

function distanceToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const vx = b[0] - a[0];
  const vy = b[1] - a[1];
  const lenSq = vx * vx + vy * vy;
  const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / lenSq));
  return Math.hypot(p[0] - (a[0] + t * vx), p[1] - (a[1] + t * vy));
}

/** Index of the edge whose start vertex is returned; -1 when the ring has no edges. */
export function nearestEdgeIndex(ring: Ring, p: Vec2): number {
  if (ring.length < 2) return -1;
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    if (!a || !b) continue;
    const d = distanceToSegment(p, a, b);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}
```

- [ ] **Step 4: Run and commit**

```bash
npx vitest run packages/editor/src/plan/ring.test.ts
git add packages/editor/src/plan/ring.ts packages/editor/src/plan/ring.test.ts
git commit -m "feat(editor): immutable ring vertex operations with a minimum-length guard"
```

---

## Task 9: The editor store

**Files:**
- Create: `packages/editor/src/state/store.ts`, `src/state/store.test.ts`

**Interfaces:**
- Produces: `useEditorStore` (Zustand) with state `{ user, model, report, activeLevelId, selection, tool, draft, viewport, conflict, presence, status }` and actions `setUser`, `setModel`, `setReport`, `setActiveLevel`, `select`, `setTool`, `beginDraft`, `pushDraftPoint`, `clearDraft`, `setViewport`, `setConflict`, `setPresence`, `setStatus`; selectors `roomsOnActiveLevel(state)`, `activeLevel(state)`, `ringsOnActiveLevel(state)`.

- [ ] **Step 1: Write the failing test**

`packages/editor/src/state/store.test.ts`:

```ts
import { parseModel } from "@oth/model";
import { beforeEach, describe, expect, it } from "vitest";
import { activeLevel, ringsOnActiveLevel, roomsOnActiveLevel, useEditorStore } from "./store";

const model = parseModel({
  building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
  levels: [
    { id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6 },
    { id: "oth-L2", buildingId: "oth", code: "L2", ordinal: 2, nameEn: "L2", nameZh: "二楼", elevationM: 6, heightM: 4.5 },
  ],
  rooms: [
    { id: "L1-a", levelId: "oth-L1", kind: "room", footprint: [[0, 0], [5, 0], [5, 5]], heightM: 3, walkable: true },
    { id: "L2-a", levelId: "oth-L2", kind: "room", footprint: [[0, 0], [4, 0], [4, 4]], heightM: 3, walkable: true },
  ],
});

beforeEach(() => useEditorStore.getState().reset());

describe("editor store", () => {
  it("starts with no model and no user", () => {
    const s = useEditorStore.getState();
    expect(s.model).toBeNull();
    expect(s.user).toBeNull();
  });

  it("selects the lowest level automatically when a model loads", () => {
    useEditorStore.getState().setModel(model);
    expect(useEditorStore.getState().activeLevelId).toBe("oth-L1");
  });

  it("keeps the active level across a model refresh if it still exists", () => {
    const store = useEditorStore.getState();
    store.setModel(model);
    store.setActiveLevel("oth-L2");
    store.setModel(model);
    expect(useEditorStore.getState().activeLevelId).toBe("oth-L2");
  });

  it("filters rooms to the active level", () => {
    useEditorStore.getState().setModel(model);
    expect(roomsOnActiveLevel(useEditorStore.getState()).map(r => r.id)).toEqual(["L1-a"]);
  });

  it("exposes the active level object", () => {
    useEditorStore.getState().setModel(model);
    expect(activeLevel(useEditorStore.getState())?.code).toBe("L1");
  });

  it("collects footprints on the active level for snapping", () => {
    useEditorStore.getState().setModel(model);
    expect(ringsOnActiveLevel(useEditorStore.getState())).toEqual([[[0, 0], [5, 0], [5, 5]]]);
  });

  it("clears the selection when the level changes", () => {
    const store = useEditorStore.getState();
    store.setModel(model);
    store.select({ type: "room", id: "L1-a" });
    store.setActiveLevel("oth-L2");
    expect(useEditorStore.getState().selection).toBeNull();
  });

  it("accumulates draft points while drawing", () => {
    const store = useEditorStore.getState();
    store.setTool("draw-room");
    store.beginDraft();
    store.pushDraftPoint([1, 1]);
    store.pushDraftPoint([2, 2]);
    expect(useEditorStore.getState().draft).toEqual([[1, 1], [2, 2]]);
  });

  it("discards the draft when the tool changes, so a half-drawn room cannot leak", () => {
    const store = useEditorStore.getState();
    store.setTool("draw-room");
    store.beginDraft();
    store.pushDraftPoint([1, 1]);
    store.setTool("select");
    expect(useEditorStore.getState().draft).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run packages/editor/src/state`
Expected: FAIL — cannot resolve `./store`.

- [ ] **Step 3: Implement**

`packages/editor/src/state/store.ts`:

```ts
import type { MapModel, Level, Ring, Room, ValidationReport, Vec2 } from "@oth/model";
import { create } from "zustand";
import type { SessionUser } from "../api/client";
import { DEFAULT_VIEWPORT, type Viewport } from "../plan/viewport";

export type Tool =
  | "select"
  | "draw-room"
  | "draw-doorway"
  | "place-entrance"
  | "place-portal"
  | "calibrate";

export type Selection = { type: "room" | "doorway" | "entrance" | "portalEndpoint"; id: string } | null;

export type Conflict = { entityType: string; entityId: string; current: Record<string, unknown> | null } | null;

export type PresenceEntry = { userId: string; displayName: string; levelId: string | null };

export type EditorState = {
  user: SessionUser | null;
  model: MapModel | null;
  report: ValidationReport | null;
  activeLevelId: string | null;
  selection: Selection;
  tool: Tool;
  /** Points placed so far by a drawing tool, in world metres. */
  draft: Vec2[] | null;
  viewport: Viewport;
  conflict: Conflict;
  presence: PresenceEntry[];
  status: string | null;

  setUser: (u: SessionUser | null) => void;
  setModel: (m: MapModel) => void;
  setReport: (r: ValidationReport | null) => void;
  setActiveLevel: (id: string) => void;
  select: (s: Selection) => void;
  setTool: (t: Tool) => void;
  beginDraft: () => void;
  pushDraftPoint: (p: Vec2) => void;
  clearDraft: () => void;
  setViewport: (v: Viewport) => void;
  setConflict: (c: Conflict) => void;
  setPresence: (p: PresenceEntry[]) => void;
  setStatus: (s: string | null) => void;
  reset: () => void;
};

function lowestLevelId(model: MapModel): string | null {
  const ordered = [...model.levels].sort((a, b) => a.ordinal - b.ordinal);
  return ordered[0]?.id ?? null;
}

const initial = {
  user: null,
  model: null,
  report: null,
  activeLevelId: null,
  selection: null,
  tool: "select" as Tool,
  draft: null,
  viewport: DEFAULT_VIEWPORT,
  conflict: null,
  presence: [],
  status: null,
};

export const useEditorStore = create<EditorState>((set, get) => ({
  ...initial,

  setUser: user => set({ user }),

  setModel: model =>
    set(state => {
      // Keep the level you were working on across a refresh; only fall back if it vanished.
      const stillThere = state.activeLevelId && model.levels.some(l => l.id === state.activeLevelId);
      return { model, activeLevelId: stillThere ? state.activeLevelId : lowestLevelId(model) };
    }),

  setReport: report => set({ report }),

  // Changing level clears the selection: a selected room on another floor is a confusing state.
  setActiveLevel: id => set({ activeLevelId: id, selection: null, draft: null }),

  select: selection => set({ selection }),

  // A half-drawn shape must never survive a tool change.
  setTool: tool => set({ tool, draft: null }),

  beginDraft: () => set({ draft: [] }),
  pushDraftPoint: p => set(state => ({ draft: [...(state.draft ?? []), p] })),
  clearDraft: () => set({ draft: null }),

  setViewport: viewport => set({ viewport }),
  setConflict: conflict => set({ conflict }),
  setPresence: presence => set({ presence }),
  setStatus: status => set({ status }),

  reset: () => set(initial),
}));

export function activeLevel(state: EditorState): Level | null {
  if (!state.model || !state.activeLevelId) return null;
  return state.model.levels.find(l => l.id === state.activeLevelId) ?? null;
}

export function roomsOnActiveLevel(state: EditorState): Room[] {
  if (!state.model || !state.activeLevelId) return [];
  return state.model.rooms.filter(r => r.levelId === state.activeLevelId);
}

export function ringsOnActiveLevel(state: EditorState): Ring[] {
  return roomsOnActiveLevel(state).map(r => r.footprint);
}
```

- [ ] **Step 4: Run and commit**

```bash
npx vitest run packages/editor/src/state
git add packages/editor/src/state
git commit -m "feat(editor): Zustand store with level-scoped selection and drawing drafts"
```

---

## Task 10: The save pipeline

**Files:**
- Create: `packages/editor/src/state/save.ts`, `src/state/save.test.ts`

**Interfaces:**
- Consumes: `Api`, `ConflictError`, `useEditorStore`.
- Produces: `createSaver(api): { create, update, remove, refresh }` where each returns `Promise<boolean>` (false when a conflict was raised), and refresh reloads model + report.

- [ ] **Step 1: Write the failing test**

`packages/editor/src/state/save.test.ts`:

```ts
import { parseModel } from "@oth/model";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConflictError } from "../api/client";
import { createSaver } from "./save";
import { useEditorStore } from "./store";

const model = parseModel({
  building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
  levels: [{ id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6 }],
});

const report = { issues: [], errorCount: 0, warningCount: 0, ok: true };

function fakeApi(overrides: Record<string, unknown> = {}) {
  return {
    getModel: vi.fn(async () => model),
    validate: vi.fn(async () => report),
    createEntity: vi.fn(async () => ({ id: "new", version: 0 })),
    updateEntity: vi.fn(async () => ({ id: "L1-a", version: 1 })),
    deleteEntity: vi.fn(async () => ({ id: "L1-a", version: 1 })),
    ...overrides,
  } as never;
}

beforeEach(() => useEditorStore.getState().reset());

describe("saver", () => {
  it("refresh loads the model and the validation report together", async () => {
    const api = fakeApi();
    await createSaver(api).refresh();
    expect(useEditorStore.getState().model).toEqual(model);
    expect(useEditorStore.getState().report).toEqual(report);
  });

  it("create refreshes so the canvas shows what the server accepted", async () => {
    const api = fakeApi();
    await createSaver(api).create("room", { id: "x" });
    expect((api as unknown as { getModel: { mock: { calls: unknown[] } } }).getModel.mock.calls).toHaveLength(1);
  });

  it("update returns true on success", async () => {
    expect(await createSaver(fakeApi()).update("room", "L1-a", 0, { nameEn: "X" })).toBe(true);
  });

  it("raises a conflict into the store instead of throwing", async () => {
    const current = { id: "L1-a", version: 3, nameEn: "Theirs" };
    const api = fakeApi({
      updateEntity: vi.fn(async () => { throw new ConflictError(current, null); }),
    });
    expect(await createSaver(api).update("room", "L1-a", 0, { nameEn: "Mine" })).toBe(false);
    expect(useEditorStore.getState().conflict).toEqual({
      entityType: "room", entityId: "L1-a", current,
    });
  });

  it("does not retry a conflicted write — the user decides", async () => {
    const updateEntity = vi.fn(async () => { throw new ConflictError(null, null); });
    await createSaver(fakeApi({ updateEntity })).update("room", "L1-a", 0, {});
    expect(updateEntity).toHaveBeenCalledTimes(1);
  });

  it("surfaces an unexpected failure as a status message rather than crashing", async () => {
    const api = fakeApi({ updateEntity: vi.fn(async () => { throw new Error("network down"); }) });
    expect(await createSaver(api).update("room", "L1-a", 0, {})).toBe(false);
    expect(useEditorStore.getState().status).toMatch(/network down/);
  });

  it("clears a previous conflict on a successful write", async () => {
    useEditorStore.getState().setConflict({ entityType: "room", entityId: "L1-a", current: null });
    await createSaver(fakeApi()).update("room", "L1-a", 0, {});
    expect(useEditorStore.getState().conflict).toBeNull();
  });
});
```

Not retrying a conflict is the load-bearing behaviour. An automatic retry with the fresh version is exactly the silent overwrite the whole optimistic-locking scheme exists to prevent.

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run packages/editor/src/state/save.test.ts`
Expected: FAIL — cannot resolve `./save`.

- [ ] **Step 3: Implement**

`packages/editor/src/state/save.ts`:

```ts
import type { Api, EntityType } from "../api/client";
import { ConflictError } from "../api/client";
import { useEditorStore } from "./store";

/**
 * Every mutation goes through here so three rules hold everywhere:
 *
 * 1. A 409 becomes a conflict in the store, never an automatic retry. Retrying
 *    with the fresh version is precisely the silent overwrite optimistic
 *    locking exists to prevent — the user has to see what someone else did.
 * 2. A successful write refreshes model and report together, so the canvas
 *    always shows what the server actually accepted rather than a local guess.
 * 3. Nothing throws at the call site; callers get a boolean.
 */
export function createSaver(api: Api) {
  const store = useEditorStore;

  async function refresh(): Promise<void> {
    const [model, report] = await Promise.all([api.getModel(), api.validate()]);
    store.getState().setModel(model);
    store.getState().setReport(report);
  }

  async function guard(
    entityType: string, entityId: string, run: () => Promise<unknown>,
  ): Promise<boolean> {
    try {
      await run();
      store.getState().setConflict(null);
      await refresh();
      return true;
    } catch (err) {
      if (err instanceof ConflictError) {
        store.getState().setConflict({ entityType, entityId, current: err.current });
        return false;
      }
      store.getState().setStatus(err instanceof Error ? err.message : String(err));
      return false;
    }
  }

  return {
    refresh,

    create: (type: EntityType, data: Record<string, unknown>) =>
      guard(type, String(data.id ?? "new"), () => api.createEntity(type, data)),

    update: (type: EntityType, id: string, expectedVersion: number, data: Record<string, unknown>) =>
      guard(type, id, () => api.updateEntity(type, id, expectedVersion, data)),

    remove: (type: EntityType, id: string, expectedVersion: number) =>
      guard(type, id, () => api.deleteEntity(type, id, expectedVersion)),
  };
}

export type Saver = ReturnType<typeof createSaver>;
```

- [ ] **Step 4: Run and commit**

```bash
npx vitest run packages/editor/src/state
git add packages/editor/src/state
git commit -m "feat(editor): save pipeline that surfaces conflicts instead of retrying them"
```

---

## Task 11: The plan canvas

**Files:**
- Create: `packages/editor/src/plan/PlanCanvas.tsx`, `src/plan/Underlay.tsx`
- Test: `packages/editor/src/plan/PlanCanvas.test.tsx`

**Interfaces:**
- Produces: `PlanCanvas` props `{ width: number; height: number; onCommitRoom?: (ring: Ring) => void; onCommitDoorway?: (a: Vec2, b: Vec2) => void; onCommitPoint?: (p: Vec2) => void }`; `Underlay` props `{ src: string; calibration: Calibration; viewport: Viewport; opacity?: number }`.

- [ ] **Step 1: Write the failing test**

`packages/editor/src/plan/PlanCanvas.test.tsx`:

```tsx
import { parseModel } from "@oth/model";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useEditorStore } from "../state/store";
import { PlanCanvas } from "./PlanCanvas";

const model = parseModel({
  building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
  levels: [{ id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6 }],
  rooms: [{
    id: "L1-a", levelId: "oth-L1", kind: "room",
    footprint: [[0, 0], [10, 0], [10, 10], [0, 10]],
    heightM: 3, walkable: true, nameEn: "Room A", nameZh: "A",
  }],
});

beforeEach(() => {
  useEditorStore.getState().reset();
  useEditorStore.getState().setModel(model);
});

describe("PlanCanvas", () => {
  it("renders a polygon for each room on the active level", () => {
    render(<PlanCanvas width={800} height={600} />);
    expect(screen.getByTestId("room-L1-a")).toBeTruthy();
  });

  it("selects a room when it is clicked with the select tool", () => {
    render(<PlanCanvas width={800} height={600} />);
    fireEvent.click(screen.getByTestId("room-L1-a"));
    expect(useEditorStore.getState().selection).toEqual({ type: "room", id: "L1-a" });
  });

  it("does not select while a drawing tool is active", () => {
    useEditorStore.getState().setTool("draw-room");
    render(<PlanCanvas width={800} height={600} />);
    fireEvent.click(screen.getByTestId("room-L1-a"));
    expect(useEditorStore.getState().selection).toBeNull();
  });

  it("accumulates draft points while drawing a room", () => {
    useEditorStore.getState().setTool("draw-room");
    render(<PlanCanvas width={800} height={600} />);
    const surface = screen.getByTestId("plan-surface");
    fireEvent.click(surface, { clientX: 100, clientY: 100 });
    fireEvent.click(surface, { clientX: 200, clientY: 100 });
    expect(useEditorStore.getState().draft).toHaveLength(2);
  });

  it("commits a room on double click and clears the draft", () => {
    const onCommitRoom = vi.fn();
    useEditorStore.getState().setTool("draw-room");
    render(<PlanCanvas width={800} height={600} onCommitRoom={onCommitRoom} />);
    const surface = screen.getByTestId("plan-surface");
    fireEvent.click(surface, { clientX: 100, clientY: 100 });
    fireEvent.click(surface, { clientX: 200, clientY: 100 });
    fireEvent.click(surface, { clientX: 200, clientY: 200 });
    fireEvent.doubleClick(surface);
    expect(onCommitRoom).toHaveBeenCalledTimes(1);
    expect(onCommitRoom.mock.calls[0]![0]).toHaveLength(3);
    expect(useEditorStore.getState().draft).toBeNull();
  });

  it("refuses to commit a ring with fewer than three points", () => {
    const onCommitRoom = vi.fn();
    useEditorStore.getState().setTool("draw-room");
    render(<PlanCanvas width={800} height={600} onCommitRoom={onCommitRoom} />);
    const surface = screen.getByTestId("plan-surface");
    fireEvent.click(surface, { clientX: 100, clientY: 100 });
    fireEvent.doubleClick(surface);
    expect(onCommitRoom).not.toHaveBeenCalled();
  });

  it("zooms on wheel", () => {
    render(<PlanCanvas width={800} height={600} />);
    const before = useEditorStore.getState().viewport.scale;
    fireEvent.wheel(screen.getByTestId("plan-surface"), { deltaY: -100, clientX: 400, clientY: 300 });
    expect(useEditorStore.getState().viewport.scale).not.toBe(before);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run packages/editor/src/plan/PlanCanvas.test.tsx`
Expected: FAIL — cannot resolve `./PlanCanvas`.

- [ ] **Step 3: Add the jsdom test setup**

`packages/editor/src/testing/setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
```

Add to the root `vitest.config.ts` test block:

```ts
    setupFiles: ["packages/editor/src/testing/setup.ts"],
```

- [ ] **Step 4: Implement the underlay**

`packages/editor/src/plan/Underlay.tsx`:

```tsx
import type { Calibration } from "./calibration";
import { worldToScreen, type Viewport } from "./viewport";

/**
 * The reference floor plan, positioned by its calibration rather than eyeballed.
 * Rendered inside the same SVG as the geometry so it pans and zooms with it.
 */
export function Underlay({
  src, calibration, viewport, widthPx, heightPx, opacity = 0.6,
}: {
  src: string;
  calibration: Calibration;
  viewport: Viewport;
  widthPx: number;
  heightPx: number;
  opacity?: number;
}) {
  // The image's top-left pixel sits at the calibration offset in world space.
  const [x, y] = worldToScreen(viewport, [calibration.offsetX, calibration.offsetY]);
  const scale = calibration.metresPerPixel * viewport.scale;

  return (
    <image
      href={src}
      x={x}
      y={y}
      width={widthPx * scale}
      height={heightPx * scale}
      opacity={opacity}
      style={{ pointerEvents: "none" }}
    />
  );
}
```

- [ ] **Step 5: Implement the canvas**

`packages/editor/src/plan/PlanCanvas.tsx`:

```tsx
import type { Ring, Vec2 } from "@oth/model";
import { useRef } from "react";
import { roomColor } from "@oth/renderer";
import { ringsOnActiveLevel, roomsOnActiveLevel, useEditorStore } from "../state/store";
import { snapPoint } from "./snapping";
import { screenToWorld, worldToScreen, zoomViewport, panViewport } from "./viewport";

const SNAP_TOLERANCE_PX = 10;
const GRID_M = 0.25;

export type PlanCanvasProps = {
  width: number;
  height: number;
  onCommitRoom?: (ring: Ring) => void;
  onCommitDoorway?: (a: Vec2, b: Vec2) => void;
  onCommitPoint?: (p: Vec2) => void;
};

export function PlanCanvas({
  width, height, onCommitRoom, onCommitDoorway, onCommitPoint,
}: PlanCanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const state = useEditorStore();
  const rooms = roomsOnActiveLevel(state);
  const rings = ringsOnActiveLevel(state);

  function pointerWorld(event: { clientX: number; clientY: number }): Vec2 {
    const rect = svgRef.current?.getBoundingClientRect();
    const sx = event.clientX - (rect?.left ?? 0);
    const sy = event.clientY - (rect?.top ?? 0);
    const world = screenToWorld(state.viewport, [sx, sy]);
    // Tolerance is expressed in pixels so snapping feels the same at every zoom.
    return snapPoint(world, { rings }, {
      toleranceM: SNAP_TOLERANCE_PX / state.viewport.scale,
      gridM: GRID_M,
    }).point;
  }

  function onSurfaceClick(event: React.MouseEvent) {
    if (state.tool === "select") return;

    const p = pointerWorld(event);

    if (state.tool === "draw-room" || state.tool === "draw-doorway") {
      if (!state.draft) state.beginDraft();
      state.pushDraftPoint(p);
      return;
    }

    if (state.tool === "place-entrance" || state.tool === "place-portal") {
      onCommitPoint?.(p);
    }
  }

  function onSurfaceDoubleClick() {
    const draft = state.draft;
    if (!draft) return;

    if (state.tool === "draw-room") {
      // Below three points it is not a ring, and the model would reject it.
      if (draft.length >= 3) onCommitRoom?.(draft);
    }
    if (state.tool === "draw-doorway" && draft.length >= 2) {
      onCommitDoorway?.(draft[0]!, draft[draft.length - 1]!);
    }
    state.clearDraft();
  }

  function onWheel(event: React.WheelEvent) {
    const rect = svgRef.current?.getBoundingClientRect();
    const anchor: Vec2 = [event.clientX - (rect?.left ?? 0), event.clientY - (rect?.top ?? 0)];
    state.setViewport(zoomViewport(state.viewport, event.deltaY < 0 ? 1.1 : 1 / 1.1, anchor));
  }

  function ringPoints(ring: Ring): string {
    return ring.map(p => worldToScreen(state.viewport, p).join(",")).join(" ");
  }

  return (
    <svg
      ref={svgRef}
      data-testid="plan-canvas"
      width={width}
      height={height}
      className="bg-stone-50"
      onWheel={onWheel}
    >
      <rect
        data-testid="plan-surface"
        x={0} y={0} width={width} height={height}
        fill="transparent"
        onClick={onSurfaceClick}
        onDoubleClick={onSurfaceDoubleClick}
      />

      {rooms.map(room => (
        <polygon
          key={room.id}
          data-testid={`room-${room.id}`}
          points={ringPoints(room.footprint)}
          fill={roomColor(room.kind, { selected: state.selection?.id === room.id })}
          stroke="#57534e"
          strokeWidth={1}
          onClick={event => {
            // Drawing tools own the surface; clicking a room must not steal the point.
            if (state.tool !== "select") return;
            event.stopPropagation();
            state.select({ type: "room", id: room.id });
          }}
        />
      ))}

      {state.draft && state.draft.length > 0 && (
        <polyline
          data-testid="draft"
          points={ringPoints(state.draft)}
          fill="rgba(242,163,60,0.2)"
          stroke="#f2a33c"
          strokeWidth={2}
        />
      )}
    </svg>
  );
}
```

- [ ] **Step 6: Run and commit**

```bash
npx vitest run packages/editor
git add packages/editor
git commit -m "feat(editor): pan/zoom plan canvas with snapped drawing and room selection"
```

---

## Task 12: Panels and app integration

**Files:**
- Create: `src/panels/LevelSwitcher.tsx`, `Inspector.tsx`, `ValidationPanel.tsx`, `ConflictBanner.tsx`, `PublishButton.tsx`, `Toolbar.tsx`
- Modify: `src/App.tsx`
- Test: `src/panels/ValidationPanel.test.tsx`, `src/panels/ConflictBanner.test.tsx`, `src/App.test.tsx`

**Interfaces:**
- Produces: the assembled editor. `App` renders `LoginScreen` until `api.me()` succeeds, then the workspace.

- [ ] **Step 1: Write the failing tests**

`packages/editor/src/panels/ValidationPanel.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useEditorStore } from "../state/store";
import { ValidationPanel } from "./ValidationPanel";

beforeEach(() => useEditorStore.getState().reset());

describe("ValidationPanel", () => {
  it("says the model is clean when there are no issues", () => {
    useEditorStore.getState().setReport({ issues: [], errorCount: 0, warningCount: 0, ok: true });
    render(<ValidationPanel />);
    expect(screen.getByText(/no problems/i)).toBeTruthy();
  });

  it("lists errors with their message", () => {
    useEditorStore.getState().setReport({
      issues: [{
        severity: "error", code: "room.unreachable",
        message: 'Room "L1-a" cannot be reached from any entrance.',
        entityType: "room", entityId: "L1-a",
      }],
      errorCount: 1, warningCount: 0, ok: false,
    });
    render(<ValidationPanel />);
    expect(screen.getByText(/cannot be reached/i)).toBeTruthy();
  });

  it("shows that errors block publishing", () => {
    useEditorStore.getState().setReport({
      issues: [{ severity: "error", code: "x", message: "bad", entityType: "room", entityId: "a" }],
      errorCount: 1, warningCount: 0, ok: false,
    });
    render(<ValidationPanel />);
    expect(screen.getByText(/blocks publishing/i)).toBeTruthy();
  });

  it("shows warnings without claiming they block anything", () => {
    useEditorStore.getState().setReport({
      issues: [{ severity: "warning", code: "room.name.missing", message: "no name", entityType: "room", entityId: "a" }],
      errorCount: 0, warningCount: 1, ok: true,
    });
    render(<ValidationPanel />);
    expect(screen.queryByText(/blocks publishing/i)).toBeNull();
  });
});
```

`packages/editor/src/panels/ConflictBanner.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useEditorStore } from "../state/store";
import { ConflictBanner } from "./ConflictBanner";

beforeEach(() => useEditorStore.getState().reset());

describe("ConflictBanner", () => {
  it("renders nothing when there is no conflict", () => {
    const { container } = render(<ConflictBanner onReload={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it("names who holds the newer version", () => {
    useEditorStore.getState().setConflict({
      entityType: "room", entityId: "L1-a",
      current: { updatedBy: "user_2", version: 3 },
    });
    render(<ConflictBanner onReload={vi.fn()} />);
    expect(screen.getByText(/L1-a/)).toBeTruthy();
  });

  it("offers to reload rather than silently overwriting", () => {
    const onReload = vi.fn();
    useEditorStore.getState().setConflict({ entityType: "room", entityId: "L1-a", current: null });
    render(<ConflictBanner onReload={onReload} />);
    fireEvent.click(screen.getByRole("button", { name: /reload/i }));
    expect(onReload).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run and watch them fail**

Run: `npx vitest run packages/editor/src/panels`
Expected: FAIL — modules do not resolve.

- [ ] **Step 3: Implement the panels**

`packages/editor/src/panels/ValidationPanel.tsx`:

```tsx
import { useEditorStore } from "../state/store";

export function ValidationPanel() {
  const report = useEditorStore(s => s.report);
  const select = useEditorStore(s => s.select);
  if (!report) return null;

  if (report.issues.length === 0) {
    return <p className="p-3 text-sm text-stone-600">No problems found.</p>;
  }

  return (
    <div className="space-y-2 p-3 text-sm">
      {report.errorCount > 0 && (
        <p className="font-medium text-red-700">
          {report.errorCount} error{report.errorCount === 1 ? "" : "s"} — this blocks publishing.
        </p>
      )}
      {report.warningCount > 0 && (
        <p className="text-amber-700">
          {report.warningCount} warning{report.warningCount === 1 ? "" : "s"}.
        </p>
      )}
      <ul className="space-y-1">
        {report.issues.map((issue, i) => (
          <li key={`${issue.code}-${issue.entityId}-${i}`}>
            <button
              className="text-left hover:underline"
              onClick={() => {
                if (issue.entityType === "room") select({ type: "room", id: issue.entityId });
              }}
            >
              <span className={issue.severity === "error" ? "text-red-700" : "text-amber-700"}>
                {issue.severity === "error" ? "✕" : "!"}
              </span>{" "}
              {issue.message}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

`packages/editor/src/panels/ConflictBanner.tsx`:

```tsx
import { useEditorStore } from "../state/store";

/**
 * A conflict is an editorial event, not an error to swallow. Someone else saved
 * this entity first; the only honest options are to look at their version or to
 * discard yours, so those are the only two offered.
 */
export function ConflictBanner({ onReload }: { onReload: () => void }) {
  const conflict = useEditorStore(s => s.conflict);
  const setConflict = useEditorStore(s => s.setConflict);
  if (!conflict) return null;

  return (
    <div role="alert" className="flex items-center gap-3 bg-amber-100 px-4 py-2 text-sm text-amber-900">
      <span>
        Someone else saved <strong>{conflict.entityId}</strong> while you were editing it.
        Your change was not applied.
      </span>
      <button
        className="rounded bg-amber-800 px-2 py-1 text-white"
        onClick={() => {
          setConflict(null);
          onReload();
        }}
      >
        Reload their version
      </button>
    </div>
  );
}
```

`packages/editor/src/panels/LevelSwitcher.tsx`:

```tsx
import { useEditorStore } from "../state/store";

export function LevelSwitcher() {
  const model = useEditorStore(s => s.model);
  const activeLevelId = useEditorStore(s => s.activeLevelId);
  const setActiveLevel = useEditorStore(s => s.setActiveLevel);
  if (!model) return null;

  // Highest first, so the list reads like the building looks.
  const ordered = [...model.levels].sort((a, b) => b.ordinal - a.ordinal);

  return (
    <div className="flex flex-col gap-1 p-2">
      {ordered.map(level => (
        <button
          key={level.id}
          onClick={() => setActiveLevel(level.id)}
          className={`rounded px-2 py-1 text-sm ${
            level.id === activeLevelId ? "bg-stone-800 text-white" : "bg-white hover:bg-stone-200"
          }`}
        >
          {level.code}
        </button>
      ))}
    </div>
  );
}
```

`packages/editor/src/panels/Toolbar.tsx`:

```tsx
import { useEditorStore, type Tool } from "../state/store";

const TOOLS: { id: Tool; label: string }[] = [
  { id: "select", label: "Select" },
  { id: "draw-room", label: "Draw room" },
  { id: "draw-doorway", label: "Doorway" },
  { id: "place-entrance", label: "Entrance" },
  { id: "place-portal", label: "Portal" },
];

export function Toolbar() {
  const tool = useEditorStore(s => s.tool);
  const setTool = useEditorStore(s => s.setTool);

  return (
    <div className="flex gap-1 border-b bg-white p-2">
      {TOOLS.map(t => (
        <button
          key={t.id}
          onClick={() => setTool(t.id)}
          className={`rounded px-3 py-1 text-sm ${
            tool === t.id ? "bg-stone-800 text-white" : "hover:bg-stone-200"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
```

`packages/editor/src/panels/Inspector.tsx`:

```tsx
import { roomsOnActiveLevel, useEditorStore } from "../state/store";

export function Inspector({ onRename }: { onRename: (id: string, version: number, nameEn: string) => void }) {
  const state = useEditorStore();
  const selection = state.selection;
  if (!selection || selection.type !== "room") {
    return <p className="p-3 text-sm text-stone-500">Nothing selected.</p>;
  }

  const room = roomsOnActiveLevel(state).find(r => r.id === selection.id);
  if (!room) return null;

  return (
    <div className="space-y-3 p-3 text-sm">
      <div>
        <div className="text-xs uppercase tracking-wide text-stone-500">Room</div>
        <div className="font-mono text-xs">{room.id}</div>
      </div>
      <label className="block">
        Name
        <input
          className="mt-1 w-full rounded border px-2 py-1"
          defaultValue={room.nameEn}
          onBlur={e => onRename(room.id, room.version, e.target.value)}
        />
      </label>
      <div className="text-xs text-stone-500">
        {room.kind} · {room.walkable ? "walkable" : "not walkable"} · v{room.version}
      </div>
      <div className="text-xs text-stone-500">
        Verification: {room.verification.status}
      </div>
    </div>
  );
}
```

`packages/editor/src/panels/PublishButton.tsx`:

```tsx
import { useState } from "react";
import type { Api } from "../api/client";
import { useEditorStore } from "../state/store";

export function PublishButton({ api }: { api: Api }) {
  const report = useEditorStore(s => s.report);
  const setStatus = useEditorStore(s => s.setStatus);
  const [busy, setBusy] = useState(false);

  // The server refuses anyway; disabling here just explains why before the click.
  const blocked = !report || !report.ok;

  return (
    <button
      disabled={blocked || busy}
      title={blocked ? "Fix the validation errors first" : "Publish a new version"}
      className="rounded bg-emerald-700 px-3 py-1 text-sm text-white disabled:opacity-40"
      onClick={async () => {
        setBusy(true);
        try {
          const result = await api.publish();
          setStatus(`Published ${result.version} (${result.warningCount} warnings).`);
        } catch (err) {
          setStatus(err instanceof Error ? err.message : String(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? "Publishing…" : "Publish"}
    </button>
  );
}
```

- [ ] **Step 4: Assemble the app**

`packages/editor/src/App.tsx`:

```tsx
import { useEffect, useMemo, useState } from "react";
import { MapScene } from "@oth/renderer";
import { createApi } from "./api/client";
import { LoginScreen } from "./auth/LoginScreen";
import { ConflictBanner } from "./panels/ConflictBanner";
import { Inspector } from "./panels/Inspector";
import { LevelSwitcher } from "./panels/LevelSwitcher";
import { PublishButton } from "./panels/PublishButton";
import { Toolbar } from "./panels/Toolbar";
import { ValidationPanel } from "./panels/ValidationPanel";
import { PlanCanvas } from "./plan/PlanCanvas";
import { createSaver } from "./state/save";
import { useEditorStore } from "./state/store";

export function App() {
  const api = useMemo(() => createApi(), []);
  const saver = useMemo(() => createSaver(api), [api]);
  const user = useEditorStore(s => s.user);
  const setUser = useEditorStore(s => s.setUser);
  const model = useEditorStore(s => s.model);
  const activeLevelId = useEditorStore(s => s.activeLevelId);
  const status = useEditorStore(s => s.status);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    api.me().then(setUser).catch(() => setUser(null)).finally(() => setChecked(true));
  }, [api, setUser]);

  useEffect(() => {
    if (user) void saver.refresh();
  }, [user, saver]);

  if (!checked) return <div className="p-6 text-sm text-stone-500">Loading…</div>;
  if (!user) return <LoginScreen api={api} onSignedIn={setUser} />;

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b bg-white px-4 py-2">
        <h1 className="text-sm font-semibold">OTH Map Editor</h1>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-stone-500">{user.displayName}</span>
          <PublishButton api={api} />
        </div>
      </header>

      <ConflictBanner onReload={() => void saver.refresh()} />
      <Toolbar />

      <div className="flex min-h-0 flex-1">
        <aside className="w-16 border-r bg-stone-100"><LevelSwitcher /></aside>

        <main className="min-w-0 flex-1">
          <PlanCanvas
            width={900}
            height={700}
            onCommitRoom={ring => {
              if (!activeLevelId) return;
              void saver.create("room", {
                id: `${activeLevelId}-room-${Date.now()}`,
                levelId: activeLevelId,
                kind: "room",
                footprint: ring,
                heightM: 3.5,
                walkable: true,
              });
            }}
          />
        </main>

        <aside className="w-80 border-l bg-white">
          <div className="flex h-1/2 flex-col border-b">
            <h2 className="border-b px-3 py-2 text-xs font-semibold uppercase tracking-wide">Preview</h2>
            <div className="min-h-0 flex-1">
              {model && activeLevelId && <MapScene model={model} activeLevelId={activeLevelId} />}
            </div>
          </div>
          <Inspector
            onRename={(id, version, nameEn) => void saver.update("room", id, version, { nameEn })}
          />
          <ValidationPanel />
        </aside>
      </div>

      {status && <footer className="border-t bg-stone-100 px-4 py-1 text-xs">{status}</footer>}
    </div>
  );
}
```

- [ ] **Step 5: Run everything, typecheck and commit**

```bash
npm test
npm run typecheck
git add packages/editor
git commit -m "feat(editor): toolbar, level switcher, inspector, validation and publish panels"
```

---

## Done criteria

- `npm test` green across model, server, renderer and editor.
- `npm run typecheck` clean.
- The editor builds (`npm run build --workspace @oth/editor`).
- A signed-in user can: pick a level, trace a room with snapping, see it in the 3D preview, see validation update, and publish when the model is clean.
- A concurrent edit produces a conflict banner, never a silent overwrite.

## Deferred to plan 4

Deliberately not built here, so this plan produces a working authoring loop rather than a half-finished everything:

- The dressing layer: asset library, upload UI, 3D placement gizmo.
- Blender **context export** — a region as a locked reference `.glb`.
- DXF/DWG import for when OTH supplies vector CAD.
- Reference-image upload and the calibration UI (the maths exists and is tested; the interface for drawing the measurement does not).
- Vertex-level editing of an existing footprint (the ring operations exist and are tested; the drag handles do not).
- Presence and lock indicators in the UI (the API and store fields exist).
