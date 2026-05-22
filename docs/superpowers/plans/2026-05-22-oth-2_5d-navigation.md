# OTH 2.5D Indoor Navigation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a hackathon-ready 2.5D indoor-navigation web app for One Tampines Hub L1+L2 with a geometric guide agent that walks step-free or default routes to demo services while bilingual narration plays.

**Architecture:** Single-page React + Vite app rendering extruded SVG floor plans in React Three Fiber. Hand-authored waypoint JSON drives the guide agent's path. A serverless OpenAI proxy returns the service ID + bilingual narration segments. Simulated counter loads (Perlin noise) influence which counter the route picker selects. No backend DB, no auth.

**Tech Stack:**
- React 18 + Vite + TypeScript + Tailwind CSS
- React Three Fiber + `@react-three/drei` + three.js
- Web Speech API (TTS narration + STT voice input)
- `openai` SDK behind a Vercel serverless function (`/api/narrate`)
- `noisejs` for Perlin-noise counter loads
- Phosphor icons
- Vercel for deployment (`vercel dev` for local API emulation)

**Reference spec:** `docs/superpowers/specs/2026-05-22-oth-2_5d-navigation-design.md`

**Parallelism note:** Phase 1 (asset pipeline — research + tracing) is mostly **non-code** and can be done by the same engineer in parallel with Phase 2-3 (rendering and agents). Phase 5 (routing + narration) cannot start until Phase 1 tasks 5, 7, 8, 10, 11 are complete. The plan lists tasks linearly; cross-references call out when later tasks depend on earlier ones.

---

## Phase 0 — Project setup

### Task 1: Initialize the project skeleton

**Files:**
- Create: `package.json`
- Create: `vite.config.ts`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `index.html`
- Create: `src/main.tsx`
- Create: `src/App.tsx`
- Create: `.gitignore`

- [ ] **Step 1: Initialize git in the repo root**

Run (PowerShell):
```powershell
git init
git branch -M main
```

Expected: `Initialized empty Git repository in ...`

- [ ] **Step 2: Write `package.json`**

```json
{
  "name": "oth-2_5d-navigation",
  "private": true,
  "version": "0.0.1",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit",
    "vercel-dev": "vercel dev"
  },
  "dependencies": {
    "@react-three/drei": "^9.108.0",
    "@react-three/fiber": "^8.16.0",
    "noisejs": "^2.1.0",
    "openai": "^4.55.0",
    "phosphor-react": "^1.4.1",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "three": "^0.165.0",
    "zustand": "^4.5.0"
  },
  "devDependencies": {
    "@types/noisejs": "^2.1.4",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@types/three": "^0.165.0",
    "@vitejs/plugin-react": "^4.3.0",
    "autoprefixer": "^10.4.19",
    "postcss": "^8.4.38",
    "tailwindcss": "^3.4.0",
    "typescript": "^5.4.0",
    "vite": "^5.3.0",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 3: Write `vite.config.ts`**

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": "http://localhost:3000",
    },
  },
  test: {
    globals: true,
    environment: "node",
  },
});
```

- [ ] **Step 4: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] }
  },
  "include": ["src", "scripts", "api"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

- [ ] **Step 5: Write `tsconfig.node.json`**

```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true,
    "strict": true
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 6: Write `index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>OTH Navigator</title>
  </head>
  <body class="bg-neutral-900">
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 7: Write `src/main.tsx`**

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

- [ ] **Step 8: Write `src/App.tsx`**

```tsx
export default function App() {
  return (
    <div className="grid min-h-screen place-items-center text-neutral-100">
      <p>OTH Navigator — scaffolded.</p>
    </div>
  );
}
```

- [ ] **Step 9: Write `.gitignore`**

```
node_modules
dist
.env
.env.local
.vercel
*.log
.DS_Store
```

- [ ] **Step 10: Install + run**

Run:
```powershell
npm install
npm run dev
```

Expected: dev server starts on `http://localhost:5173`, page shows "OTH Navigator — scaffolded." Stop with Ctrl-C.

- [ ] **Step 11: Commit**

```powershell
git add .
git commit -m "feat: scaffold Vite + React + TS skeleton"
```

---

### Task 2: Add Tailwind CSS

**Files:**
- Create: `postcss.config.js`
- Create: `tailwind.config.ts`
- Create: `src/index.css`

- [ ] **Step 1: Write `postcss.config.js`**

```js
export default {
  plugins: { tailwindcss: {}, autoprefixer: {} },
};
```

- [ ] **Step 2: Write `tailwind.config.ts`**

```ts
import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["system-ui", "ui-sans-serif", "sans-serif"],
      },
      colors: {
        oth: {
          primary: "#0066B3",
          warm: "#F2A33C",
          ink: "#1A1F2A",
          paper: "#F8F6F0",
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
```

- [ ] **Step 3: Write `src/index.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

html, body, #root { height: 100%; }
body { font-family: theme("fontFamily.sans"); }
```

- [ ] **Step 4: Run dev server, verify styles apply**

Run:
```powershell
npm run dev
```

Open `http://localhost:5173`. Expected: background is dark (`bg-neutral-900`), text is white. Stop server.

- [ ] **Step 5: Commit**

```powershell
git add postcss.config.js tailwind.config.ts src/index.css
git commit -m "feat: add Tailwind CSS"
```

---

### Task 3: Vertical phone-shaped layout shell

**Files:**
- Modify: `src/App.tsx`
- Create: `src/ui/PhoneFrame.tsx`

- [ ] **Step 1: Write `src/ui/PhoneFrame.tsx`**

```tsx
import { ReactNode } from "react";

export function PhoneFrame({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen place-items-center bg-neutral-900 p-4">
      <div
        className="relative overflow-hidden rounded-[2.5rem] bg-oth-paper shadow-2xl"
        style={{ width: 390, height: 844 }}
      >
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Replace `src/App.tsx`**

```tsx
import { PhoneFrame } from "@/ui/PhoneFrame";

export default function App() {
  return (
    <PhoneFrame>
      <div className="flex h-full flex-col">
        <div className="h-[8%] bg-oth-primary text-white grid place-items-center">TopBar</div>
        <div className="h-[60%] bg-neutral-200 grid place-items-center text-neutral-700">WorldView</div>
        <div className="h-[32%] bg-oth-paper border-t border-neutral-300 grid place-items-center text-neutral-700">PromptPanel</div>
      </div>
    </PhoneFrame>
  );
}
```

- [ ] **Step 3: Run dev server, verify phone frame**

Run:
```powershell
npm run dev
```

Expected: a vertical phone-shaped frame centred on a dark page, with three coloured horizontal zones (blue top, grey middle, paper bottom). Stop server.

- [ ] **Step 4: Commit**

```powershell
git add src/App.tsx src/ui/PhoneFrame.tsx
git commit -m "feat: phone-shaped layout shell with three zones"
```

---

### Task 4: Three.js smoke test

**Files:**
- Modify: `src/App.tsx`
- Create: `src/world/Scene.tsx`

- [ ] **Step 1: Write `src/world/Scene.tsx`**

```tsx
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";

export function Scene() {
  return (
    <Canvas camera={{ position: [10, 10, 10], fov: 50 }}>
      <ambientLight intensity={0.6} />
      <directionalLight position={[10, 10, 5]} intensity={1} />
      <mesh>
        <boxGeometry args={[3, 1, 3]} />
        <meshStandardMaterial color="#F2A33C" />
      </mesh>
      <gridHelper args={[20, 20, "#666", "#444"]} />
      <OrbitControls />
    </Canvas>
  );
}
```

- [ ] **Step 2: Wire `<Scene>` into the WorldView zone in `src/App.tsx`**

```tsx
import { PhoneFrame } from "@/ui/PhoneFrame";
import { Scene } from "@/world/Scene";

export default function App() {
  return (
    <PhoneFrame>
      <div className="flex h-full flex-col">
        <div className="h-[8%] bg-oth-primary text-white grid place-items-center">TopBar</div>
        <div className="h-[60%] relative">
          <Scene />
        </div>
        <div className="h-[32%] bg-oth-paper border-t border-neutral-300 grid place-items-center text-neutral-700">PromptPanel</div>
      </div>
    </PhoneFrame>
  );
}
```

- [ ] **Step 3: Verify**

Run:
```powershell
npm run dev
```

Expected: an orange box on a grid in the middle zone of the phone frame. You can drag to orbit. Stop server.

- [ ] **Step 4: Commit**

```powershell
git add src/App.tsx src/world/Scene.tsx
git commit -m "feat: R3F smoke test with cube + grid"
```

---

## Phase 1 — Asset pipeline (parallel-friendly with Phases 2-3)

### Task 5: Mine `othhubguide2020.pdf` for the service directory

**Files:**
- Create: `research/oth-services-from-pdf.md`

- [ ] **Step 1: Open `images/othhubguide2020.pdf` in any PDF reader**

- [ ] **Step 2: For every service/shop entry on L1 and L2 spotted in the PDF, capture in `research/oth-services-from-pdf.md`**

Use this exact format per entry:

```markdown
## <Service or shop name>

- **Floor:** L1 | L2
- **Unit number:** e.g. #01-21 (verbatim from PDF)
- **Zone:** e.g. "main atrium", "near library" — any contextual locator
- **Service type:** library | polyclinic | sports | food | retail | govt | community
- **Hours:** as printed; if missing, write "not listed"
- **Source page:** <PDF page number>
- **Verbatim quote:** <copy the line from the PDF that contains this entry>
```

- [ ] **Step 3: Commit**

```powershell
git add research/oth-services-from-pdf.md
git commit -m "docs: extract L1/L2 services from OTH hub guide PDF"
```

---

### Task 6: Cross-reference with PA tenants directory and OTH website

**Files:**
- Create: `research/services-merged.md`
- Create: `research/gaps.md`

- [ ] **Step 1: Open the PA tenants directory PDF in browser**

URL: `https://www.pa.gov.sg/files/Our%20Network/Our%20Tampines%20Hub/OTH%20Tenants%20Directory%20List.pdf`

- [ ] **Step 2: For each PDF-sourced entry from Task 5, add any updates from the live PA directory or `https://tampines-hub.com/shops` into `research/services-merged.md`**

Use this format:

```markdown
## <Service name>

- **Floor / Unit:** <floor>, <unit number>
- **Provider:** <agency or shop operator>
- **Accessibility notes:** <e.g., "lift access via West Lobby"; if unknown, write "unverified">
- **Source(s):** <list every URL or filename used to verify this entry>
- **Last verified:** 2026-05-22
```

- [ ] **Step 3: Write `research/gaps.md` listing every entry where you couldn't verify location, accessibility, or hours**

```markdown
# Verification gaps

> Anything in this file is **not safe to ship** without a phone call or on-site visit.

- **<Service name>** — missing: <floor | unit | accessibility | hours>; tried: <sources you checked>
```

- [ ] **Step 4: Commit**

```powershell
git add research/services-merged.md research/gaps.md
git commit -m "docs: merge OTH services data and log verification gaps"
```

---

### Task 7: Trace L1 floor plan to SVG

**Files:**
- Create: `assets/floors/L1.svg`

- [ ] **Step 1: Install Inkscape**

If not installed: download from `https://inkscape.org/release/`.

- [ ] **Step 2: Open `images/1st-Storey_Updated_300DPI-3000x2121.jpg` in Inkscape**

- [ ] **Step 3: Run `Path → Trace Bitmap` (Shift+Alt+B)**

Settings:
- Mode: "Edge detection"
- Threshold: 0.45 (tune until walls are clear)
- Click "Apply", then close the dialog.

Expected: an SVG path layer appears over the bitmap.

- [ ] **Step 4: Delete the original bitmap layer; keep only the traced paths**

- [ ] **Step 5: Use the Node tool (N) to break the trace into individual polygons per room/corridor**

Aim for ~20-40 polygons total on L1. Each room/corridor/atrium is one polygon. Ignore furniture detail.

- [ ] **Step 6: Assign a stable `id` to every polygon via the XML editor (Ctrl+Shift+X)**

ID format: `L1-room-<short-name>` (e.g., `L1-room-customer-service`, `L1-corridor-east`, `L1-atrium`, `L1-lift-A`).

- [ ] **Step 7: Save as `assets/floors/L1.svg` (Inkscape SVG format, NOT plain SVG)**

- [ ] **Step 8: Commit**

```powershell
git add assets/floors/L1.svg
git commit -m "assets: trace L1 floor plan with stable polygon IDs"
```

---

### Task 8: Trace L2 floor plan to SVG

Same as Task 7 but for L2.

**Files:**
- Create: `assets/floors/L2.svg`

- [ ] **Step 1: Open `images/2nd-Storey_Updated_300DPI-3000x2121.jpg` in Inkscape**

- [ ] **Step 2-7: Repeat Task 7 steps 3-7, using ID prefix `L2-`**

- [ ] **Step 8: Commit**

```powershell
git add assets/floors/L2.svg
git commit -m "assets: trace L2 floor plan with stable polygon IDs"
```

---

### Task 9: Build the SVG-to-polygons conversion script

**Files:**
- Create: `scripts/svg-to-polygons.ts`
- Create: `scripts/svg-to-polygons.test.ts`

- [ ] **Step 1: Install script-time deps**

Run:
```powershell
npm install --save-dev svgson tsx
```

- [ ] **Step 2: Write failing test `scripts/svg-to-polygons.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { extractPolygons } from "./svg-to-polygons";

const fakeSvg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
    <path id="L1-room-test" d="M 10 10 L 30 10 L 30 30 L 10 30 Z" />
    <path id="L1-corridor-east" d="M 40 10 L 60 10 L 60 30 L 40 30 Z" />
  </svg>
`;

describe("extractPolygons", () => {
  it("extracts polygons keyed by id with type derived from id prefix", async () => {
    const result = await extractPolygons(fakeSvg, "L1", 100, 100);

    expect(result.polygons).toHaveLength(2);
    expect(result.polygons[0].id).toBe("L1-room-test");
    expect(result.polygons[0].type).toBe("room");
    expect(result.polygons[1].type).toBe("corridor");
    expect(result.polygons[0].points.length).toBeGreaterThanOrEqual(3);
  });
});
```

- [ ] **Step 3: Run test (expect FAIL — module missing)**

Run:
```powershell
npx vitest run scripts/svg-to-polygons.test.ts
```

Expected: `Cannot find module './svg-to-polygons'`.

- [ ] **Step 4: Write `scripts/svg-to-polygons.ts`**

```ts
import { parse } from "svgson";
import { readFile, writeFile } from "node:fs/promises";

type PolygonType = "room" | "corridor" | "landmark" | "void";
type Polygon = {
  id: string;
  points: [number, number][];
  heightMeters: number;
  type: PolygonType;
};

const HEIGHT_BY_TYPE: Record<PolygonType, number> = {
  room: 3.5,
  corridor: 3.5,
  landmark: 4.5,
  void: 0.1,
};

function typeFromId(id: string): PolygonType {
  if (id.includes("-corridor-")) return "corridor";
  if (id.includes("-landmark-")) return "landmark";
  if (id.includes("-void-")) return "void";
  return "room";
}

function parsePathD(d: string): [number, number][] {
  const points: [number, number][] = [];
  const tokens = d.replace(/,/g, " ").split(/\s+/).filter(Boolean);
  let i = 0;
  let cx = 0;
  let cy = 0;
  while (i < tokens.length) {
    const t = tokens[i];
    if (t === "M" || t === "L") {
      cx = parseFloat(tokens[i + 1]);
      cy = parseFloat(tokens[i + 2]);
      points.push([cx, cy]);
      i += 3;
    } else if (t === "Z" || t === "z") {
      i += 1;
    } else if (!isNaN(parseFloat(t))) {
      cx = parseFloat(t);
      cy = parseFloat(tokens[i + 1]);
      points.push([cx, cy]);
      i += 2;
    } else {
      i += 1;
    }
  }
  return points;
}

export async function extractPolygons(
  svgString: string,
  floorId: string,
  metresWidth: number,
  metresDepth: number,
) {
  const parsed = await parse(svgString);
  const svgWidth = parseFloat(parsed.attributes.width ?? "1000");
  const svgHeight = parseFloat(parsed.attributes.height ?? "1000");
  const scaleX = metresWidth / svgWidth;
  const scaleY = metresDepth / svgHeight;

  const polygons: Polygon[] = [];
  const walk = (node: any) => {
    if (node.name === "path" && node.attributes?.id?.startsWith(`${floorId}-`)) {
      const id = node.attributes.id;
      const raw = parsePathD(node.attributes.d ?? "");
      const points = raw.map(
        ([x, y]) => [x * scaleX, y * scaleY] as [number, number],
      );
      if (points.length >= 3) {
        polygons.push({
          id,
          points,
          heightMeters: HEIGHT_BY_TYPE[typeFromId(id)],
          type: typeFromId(id),
        });
      }
    }
    (node.children ?? []).forEach(walk);
  };
  walk(parsed);

  return {
    id: floorId,
    bounds: { width: metresWidth, depth: metresDepth },
    polygons,
  };
}

async function main() {
  const [, , svgPath, floorId, widthStr, depthStr, outPath] = process.argv;
  if (!svgPath) {
    console.error(
      "Usage: tsx scripts/svg-to-polygons.ts <svg> <floorId> <widthM> <depthM> <out>",
    );
    process.exit(1);
  }
  const svg = await readFile(svgPath, "utf8");
  const result = await extractPolygons(
    svg,
    floorId,
    parseFloat(widthStr),
    parseFloat(depthStr),
  );
  await writeFile(outPath, JSON.stringify(result, null, 2));
  console.log(`Wrote ${result.polygons.length} polygons to ${outPath}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
```

- [ ] **Step 5: Run test (expect PASS)**

Run:
```powershell
npx vitest run scripts/svg-to-polygons.test.ts
```

Expected: 1 passed.

- [ ] **Step 6: Commit**

```powershell
git add scripts/svg-to-polygons.ts scripts/svg-to-polygons.test.ts package.json package-lock.json
git commit -m "feat: SVG-to-polygons conversion script with tests"
```

---

### Task 10: Generate `floors/L1.json` and `floors/L2.json`

**Files:**
- Create: `public/data/floors/L1.json`
- Create: `public/data/floors/L2.json`

> **Note on dimensions:** OTH's L1 footprint is roughly **210m × 130m**. Use those metres for both floors unless tracing reveals otherwise.

- [ ] **Step 1: Generate L1 JSON**

Run:
```powershell
npx tsx scripts/svg-to-polygons.ts assets/floors/L1.svg L1 210 130 public/data/floors/L1.json
```

Expected: `Wrote N polygons to public/data/floors/L1.json` where N matches what you traced (20-40 typical).

- [ ] **Step 2: Generate L2 JSON**

Run:
```powershell
npx tsx scripts/svg-to-polygons.ts assets/floors/L2.svg L2 210 130 public/data/floors/L2.json
```

- [ ] **Step 3: Sanity-check both JSON files manually**

Open both files. Verify every polygon has a valid `id`, ≥3 points, sensible `heightMeters` (3.5 for rooms/corridors).

- [ ] **Step 4: Commit**

```powershell
git add public/data/floors/L1.json public/data/floors/L2.json
git commit -m "data: generated floor polygon JSON for L1 and L2"
```

---

### Task 11: Author `services.json`

**Files:**
- Create: `public/data/services.json`

- [ ] **Step 1: Pick 4-6 demo services from `research/services-merged.md`**

Required: at least one service per floor; at least one with a step-free route, one without; at least one multi-counter service for the load-aware route picker.

Strong defaults: Customer Service (L1), Regional Library (L2), Polyclinic registration (if in OTH; verify from research), Sports facility booking (L1), e-service lobby (L1), ActiveSG counter (L1).

- [ ] **Step 2: Write `public/data/services.json` using these exact fields**

```json
[
  {
    "id": "customer-service",
    "nameEn": "Customer Service",
    "nameZh": "顾客服务台",
    "providerName": "People's Association",
    "floorId": "L1",
    "roomId": "L1-room-customer-service",
    "counterIds": ["cs-1", "cs-2", "cs-3"],
    "accessibility": {
      "liftAccess": true,
      "stepFreeRoute": true,
      "notes": ""
    },
    "sourceUrl": "https://www.pa.gov.sg/our-network/our-tampines-hub/hub-info/",
    "iconKey": "info"
  },
  {
    "id": "regional-library",
    "nameEn": "Regional Library Counter",
    "nameZh": "区域图书馆服务台",
    "providerName": "National Library Board",
    "floorId": "L2",
    "roomId": "L2-room-library",
    "counterIds": ["lib-1", "lib-2"],
    "accessibility": {
      "liftAccess": true,
      "stepFreeRoute": true,
      "notes": ""
    },
    "sourceUrl": "https://www.nlb.gov.sg/main/visit-us/our-libraries-and-locations/libraries/tampines-regional-library",
    "iconKey": "book"
  }
]
```

Add 2-4 more entries following the same shape. Every `sourceUrl` must be a real URL from `services-merged.md` — no blanks, no placeholders.

- [ ] **Step 3: Commit**

```powershell
git add public/data/services.json
git commit -m "data: author services.json with sourced demo services"
```

---

## Phase 2 — Core rendering

### Task 12: Shared TypeScript types

**Files:**
- Create: `src/data/types.ts`

- [ ] **Step 1: Write `src/data/types.ts`**

```ts
export type FloorId = "L1" | "L2";
export type PolygonType = "room" | "corridor" | "landmark" | "void";
export type AccessibilityProfile = "default" | "stepFree";
export type Language = "en" | "zh";

export type Polygon = {
  id: string;
  points: [number, number][];
  heightMeters: number;
  type: PolygonType;
  label?: { en: string; zh: string };
};

export type Floor = {
  id: FloorId;
  bounds: { width: number; depth: number };
  polygons: Polygon[];
};

export type Service = {
  id: string;
  nameEn: string;
  nameZh: string;
  providerName: string;
  floorId: FloorId;
  roomId: string;
  counterIds?: string[];
  accessibility: {
    liftAccess: boolean;
    stepFreeRoute: boolean;
    notes?: string;
  };
  sourceUrl: string;
  iconKey: string;
};

export type Waypoint = {
  floorId: FloorId;
  point: [number, number];
  decisionPoint: boolean;
  segmentKey: string;
};

export type RouteVariant = {
  serviceId: string;
  profile: AccessibilityProfile;
  counterId?: string;
  steps: Waypoint[];
};

export type CounterLoad = {
  counterId: string;
  load: number;
};

export type NarrationSegment = {
  key: string;
  en: string;
  zh: string;
};

export type NarrationResponse = {
  serviceId: string;
  segments: NarrationSegment[];
};
```

- [ ] **Step 2: Commit**

```powershell
git add src/data/types.ts
git commit -m "feat: shared TypeScript types"
```

---

### Task 13: Data loaders with boot-time validation

**Files:**
- Create: `src/data/loaders.ts`
- Create: `src/data/validate.ts`
- Create: `src/data/validate.test.ts`

- [ ] **Step 1: Write failing test `src/data/validate.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { validateBundle } from "./validate";
import type { Floor, Service, RouteVariant } from "./types";

const validFloor: Floor = {
  id: "L1",
  bounds: { width: 210, depth: 130 },
  polygons: [
    { id: "L1-room-x", points: [[0, 0], [1, 0], [1, 1]], heightMeters: 3.5, type: "room" },
  ],
};
const validService: Service = {
  id: "svc-x",
  nameEn: "X",
  nameZh: "X",
  providerName: "Y",
  floorId: "L1",
  roomId: "L1-room-x",
  accessibility: { liftAccess: true, stepFreeRoute: true },
  sourceUrl: "https://example.com",
  iconKey: "info",
};
const validRoute: RouteVariant = {
  serviceId: "svc-x",
  profile: "default",
  steps: [
    { floorId: "L1", point: [0, 0], decisionPoint: false, segmentKey: "start" },
    { floorId: "L1", point: [0.5, 0.5], decisionPoint: false, segmentKey: "end" },
  ],
};

describe("validateBundle", () => {
  it("passes valid bundle", () => {
    const result = validateBundle([validFloor], [validService], [validRoute]);
    expect(result.errors).toHaveLength(0);
  });

  it("flags service with unknown roomId", () => {
    const bad = { ...validService, roomId: "L1-room-missing" };
    const result = validateBundle([validFloor], [bad], []);
    expect(result.errors.some(e => e.includes("L1-room-missing"))).toBe(true);
  });

  it("flags route whose serviceId is not in catalog", () => {
    const orphan: RouteVariant = { ...validRoute, serviceId: "ghost" };
    const result = validateBundle([validFloor], [validService], [orphan]);
    expect(result.errors.some(e => e.includes("ghost"))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test (expect FAIL — module missing)**

Run:
```powershell
npx vitest run src/data/validate.test.ts
```

- [ ] **Step 3: Write `src/data/validate.ts`**

```ts
import type { Floor, Service, RouteVariant } from "./types";

export function validateBundle(
  floors: Floor[],
  services: Service[],
  routes: RouteVariant[],
) {
  const errors: string[] = [];
  const polygonIds = new Set(
    floors.flatMap(f => f.polygons.map(p => p.id)),
  );
  const serviceIds = new Set(services.map(s => s.id));

  for (const s of services) {
    if (!polygonIds.has(s.roomId)) {
      errors.push(`service "${s.id}" references unknown roomId "${s.roomId}"`);
    }
    if (!s.sourceUrl?.startsWith("http")) {
      errors.push(`service "${s.id}" has no valid sourceUrl`);
    }
  }

  for (const r of routes) {
    if (!serviceIds.has(r.serviceId)) {
      errors.push(`route references unknown serviceId "${r.serviceId}"`);
    }
    if (r.steps.length < 2) {
      errors.push(`route for "${r.serviceId}" has fewer than 2 waypoints`);
    }
  }

  return { errors };
}
```

- [ ] **Step 4: Run test (expect PASS)**

Run:
```powershell
npx vitest run src/data/validate.test.ts
```

Expected: 3 passed.

- [ ] **Step 5: Write `src/data/loaders.ts`**

```ts
import type { Floor, Service, RouteVariant } from "./types";
import { validateBundle } from "./validate";

export async function loadDataBundle() {
  const [L1, L2, services, routesRaw] = await Promise.all([
    fetch("/data/floors/L1.json").then(r => r.json() as Promise<Floor>),
    fetch("/data/floors/L2.json").then(r => r.json() as Promise<Floor>),
    fetch("/data/services.json").then(r => r.json() as Promise<Service[]>),
    fetch("/data/waypoints.json")
      .then(r => (r.ok ? r.json() : []))
      .then(j => j as RouteVariant[]),
  ]);

  const floors = [L1, L2];
  const { errors } = validateBundle(floors, services, routesRaw);
  if (errors.length) {
    console.warn("[validateBundle] errors:\n" + errors.join("\n"));
  }
  return { floors, services, routes: routesRaw, errors };
}
```

- [ ] **Step 6: Commit**

```powershell
git add src/data/loaders.ts src/data/validate.ts src/data/validate.test.ts
git commit -m "feat: data loaders + boot-time validation"
```

---

### Task 14: Render extruded floor polygons

**Files:**
- Create: `src/world/Floor.tsx`
- Modify: `src/world/Scene.tsx`

- [ ] **Step 1: Write `src/world/Floor.tsx`**

```tsx
import { useMemo } from "react";
import * as THREE from "three";
import type { Floor as FloorData, Polygon } from "@/data/types";

function polygonToShape(p: Polygon): THREE.Shape {
  const shape = new THREE.Shape();
  const [x0, y0] = p.points[0];
  shape.moveTo(x0, y0);
  for (let i = 1; i < p.points.length; i++) {
    shape.lineTo(p.points[i][0], p.points[i][1]);
  }
  shape.closePath();
  return shape;
}

const COLORS: Record<Polygon["type"], string> = {
  room: "#E6DCC4",
  corridor: "#D6CBB0",
  landmark: "#F2A33C",
  void: "#A0A0A0",
};

export function Floor({ data, yOffset = 0 }: { data: FloorData; yOffset?: number }) {
  const meshes = useMemo(
    () =>
      data.polygons.map(p => {
        const shape = polygonToShape(p);
        const geometry = new THREE.ExtrudeGeometry(shape, {
          depth: p.heightMeters,
          bevelEnabled: false,
        });
        geometry.rotateX(-Math.PI / 2);
        return { id: p.id, geometry, color: COLORS[p.type] };
      }),
    [data],
  );

  return (
    <group position={[-data.bounds.width / 2, yOffset, -data.bounds.depth / 2]}>
      {meshes.map(m => (
        <mesh key={m.id} geometry={m.geometry} castShadow receiveShadow>
          <meshStandardMaterial color={m.color} />
        </mesh>
      ))}
    </group>
  );
}
```

- [ ] **Step 2: Update `src/world/Scene.tsx` to load + render floors**

```tsx
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useEffect, useState } from "react";
import { Floor } from "./Floor";
import { loadDataBundle } from "@/data/loaders";
import type { Floor as FloorData } from "@/data/types";

export function Scene() {
  const [floors, setFloors] = useState<FloorData[]>([]);

  useEffect(() => {
    loadDataBundle().then(b => setFloors(b.floors));
  }, []);

  return (
    <Canvas shadows camera={{ position: [120, 180, 120], fov: 35 }}>
      <ambientLight intensity={0.5} />
      <directionalLight
        position={[80, 200, 60]}
        intensity={1}
        castShadow
        shadow-mapSize={[2048, 2048]}
      />
      {floors[0] && <Floor data={floors[0]} yOffset={0} />}
      {floors[1] && <Floor data={floors[1]} yOffset={5} />}
      <OrbitControls />
    </Canvas>
  );
}
```

- [ ] **Step 3: Verify**

Run:
```powershell
npm run dev
```

Open `http://localhost:5173`. Expected: extruded floor polygons visible — beige rooms, slightly darker corridors. Two floors stacked with a 5m gap. Drag to orbit. Stop server.

If nothing shows, check console for missing `data/floors/L1.json`. The `public/` folder serves `/data/...` automatically.

- [ ] **Step 4: Commit**

```powershell
git add src/world/Floor.tsx src/world/Scene.tsx
git commit -m "feat: render extruded floor polygons in R3F"
```

---

### Task 15: App-wide state with Zustand

**Files:**
- Create: `src/store.ts`

- [ ] **Step 1: Write `src/store.ts`**

```ts
import { create } from "zustand";
import type {
  AccessibilityProfile,
  CounterLoad,
  Floor,
  FloorId,
  Language,
  RouteVariant,
  Service,
} from "@/data/types";

type ActiveRoute = {
  variant: RouteVariant;
  startedAt: number;
  currentWaypointIndex: number;
};

type State = {
  language: Language;
  profile: AccessibilityProfile;
  activeFloor: FloorId;
  floors: Floor[];
  services: Service[];
  routes: RouteVariant[];
  counterLoads: Record<string, number>;
  activeRoute: ActiveRoute | null;

  setLanguage: (l: Language) => void;
  setProfile: (p: AccessibilityProfile) => void;
  setActiveFloor: (f: FloorId) => void;
  setBundle: (data: { floors: Floor[]; services: Service[]; routes: RouteVariant[] }) => void;
  setLoad: (counterId: string, load: number) => void;
  startRoute: (v: RouteVariant) => void;
  advanceRoute: () => void;
  endRoute: () => void;
};

export const useStore = create<State>(set => ({
  language: "en",
  profile: "default",
  activeFloor: "L1",
  floors: [],
  services: [],
  routes: [],
  counterLoads: {},
  activeRoute: null,

  setLanguage: l => set({ language: l }),
  setProfile: p => set({ profile: p }),
  setActiveFloor: f => set({ activeFloor: f }),
  setBundle: ({ floors, services, routes }) => set({ floors, services, routes }),
  setLoad: (counterId, load) =>
    set(s => ({ counterLoads: { ...s.counterLoads, [counterId]: load } })),
  startRoute: v =>
    set({ activeRoute: { variant: v, startedAt: Date.now(), currentWaypointIndex: 0 } }),
  advanceRoute: () =>
    set(s =>
      s.activeRoute
        ? {
            activeRoute: {
              ...s.activeRoute,
              currentWaypointIndex: s.activeRoute.currentWaypointIndex + 1,
            },
          }
        : {},
    ),
  endRoute: () => set({ activeRoute: null }),
}));
```

- [ ] **Step 2: Commit**

```powershell
git add src/store.ts
git commit -m "feat: zustand store for global app state"
```

---

### Task 16: Floor selector + active-floor filtering

**Files:**
- Modify: `src/world/Scene.tsx`
- Create: `src/ui/FloorSelector.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Modify `src/world/Scene.tsx` to render only the active floor**

```tsx
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useEffect } from "react";
import { Floor } from "./Floor";
import { loadDataBundle } from "@/data/loaders";
import { useStore } from "@/store";

export function Scene() {
  const { floors, activeFloor, setBundle } = useStore();

  useEffect(() => {
    loadDataBundle().then(setBundle);
  }, [setBundle]);

  const active = floors.find(f => f.id === activeFloor);

  return (
    <Canvas shadows camera={{ position: [0, 180, 80], fov: 35 }}>
      <ambientLight intensity={0.6} />
      <directionalLight
        position={[80, 200, 60]}
        intensity={1}
        castShadow
        shadow-mapSize={[2048, 2048]}
      />
      {active && <Floor data={active} />}
      <OrbitControls maxPolarAngle={Math.PI / 2.2} />
    </Canvas>
  );
}
```

- [ ] **Step 2: Write `src/ui/FloorSelector.tsx`**

```tsx
import { useStore } from "@/store";

const FLOORS = ["L1", "L2"] as const;

export function FloorSelector() {
  const { activeFloor, setActiveFloor } = useStore();
  return (
    <div className="absolute right-2 top-2 flex flex-col gap-1">
      {FLOORS.map(f => (
        <button
          key={f}
          onClick={() => setActiveFloor(f)}
          className={`w-10 h-10 rounded-full font-semibold text-sm ${
            activeFloor === f
              ? "bg-oth-primary text-white"
              : "bg-white/80 text-oth-ink"
          }`}
        >
          {f}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Mount the FloorSelector inside the WorldView in `src/App.tsx`**

```tsx
import { PhoneFrame } from "@/ui/PhoneFrame";
import { Scene } from "@/world/Scene";
import { FloorSelector } from "@/ui/FloorSelector";

export default function App() {
  return (
    <PhoneFrame>
      <div className="flex h-full flex-col">
        <div className="h-[8%] bg-oth-primary text-white grid place-items-center">TopBar</div>
        <div className="h-[60%] relative">
          <Scene />
          <FloorSelector />
        </div>
        <div className="h-[32%] bg-oth-paper border-t border-neutral-300 grid place-items-center text-neutral-700">PromptPanel</div>
      </div>
    </PhoneFrame>
  );
}
```

- [ ] **Step 4: Verify**

Run `npm run dev`. Tap L1/L2 buttons; the active floor should swap. Stop server.

- [ ] **Step 5: Commit**

```powershell
git add src/world/Scene.tsx src/ui/FloorSelector.tsx src/App.tsx
git commit -m "feat: floor selector toggles active floor"
```

---

### Task 17: Camera rig — top-down ↔ zoom-in tweens

**Files:**
- Create: `src/world/CameraRig.tsx`
- Modify: `src/world/Scene.tsx`

- [ ] **Step 1: Write `src/world/CameraRig.tsx`**

```tsx
import { useFrame, useThree } from "@react-three/fiber";
import { useRef, useEffect } from "react";
import * as THREE from "three";
import { useStore } from "@/store";

const TOPDOWN = { pos: new THREE.Vector3(0, 180, 80), look: new THREE.Vector3(0, 0, 0) };

export function CameraRig() {
  const { camera } = useThree();
  const targetPos = useRef(TOPDOWN.pos.clone());
  const targetLook = useRef(TOPDOWN.look.clone());
  const lookProxy = useRef(new THREE.Vector3());
  const route = useStore(s => s.activeRoute);
  const floors = useStore(s => s.floors);
  const activeFloor = useStore(s => s.activeFloor);

  useEffect(() => {
    if (!route) {
      targetPos.current.copy(TOPDOWN.pos);
      targetLook.current.copy(TOPDOWN.look);
      return;
    }
    const wp = route.variant.steps[route.currentWaypointIndex];
    if (!wp) return;
    const floor = floors.find(f => f.id === wp.floorId);
    if (!floor) return;
    const x = wp.point[0] - floor.bounds.width / 2;
    const z = wp.point[1] - floor.bounds.depth / 2;
    if (wp.decisionPoint) {
      targetPos.current.set(x + 18, 28, z + 18);
      targetLook.current.set(x, 2, z);
    } else {
      targetPos.current.set(0, 180, 80);
      targetLook.current.copy(TOPDOWN.look);
    }
  }, [route, floors, activeFloor]);

  useFrame((_, dt) => {
    const lerpRate = 1 - Math.pow(0.001, dt);
    camera.position.lerp(targetPos.current, lerpRate);
    lookProxy.current.lerp(targetLook.current, lerpRate);
    camera.lookAt(lookProxy.current);
  });

  return null;
}
```

- [ ] **Step 2: Mount `<CameraRig />` in `Scene.tsx` and remove `<OrbitControls />`**

```tsx
import { Canvas } from "@react-three/fiber";
import { useEffect } from "react";
import { Floor } from "./Floor";
import { CameraRig } from "./CameraRig";
import { loadDataBundle } from "@/data/loaders";
import { useStore } from "@/store";

export function Scene() {
  const { floors, activeFloor, setBundle } = useStore();

  useEffect(() => {
    loadDataBundle().then(setBundle);
  }, [setBundle]);

  const active = floors.find(f => f.id === activeFloor);

  return (
    <Canvas shadows camera={{ position: [0, 180, 80], fov: 35 }}>
      <ambientLight intensity={0.6} />
      <directionalLight
        position={[80, 200, 60]}
        intensity={1}
        castShadow
        shadow-mapSize={[2048, 2048]}
      />
      {active && <Floor data={active} />}
      <CameraRig />
    </Canvas>
  );
}
```

- [ ] **Step 3: Verify**

Run `npm run dev`. With no active route the camera should sit in top-down position over the active floor. (Zoom-in behaviour will be tested once routes exist.) Stop server.

- [ ] **Step 4: Commit**

```powershell
git add src/world/CameraRig.tsx src/world/Scene.tsx
git commit -m "feat: camera rig with top-down and zoom-in targets"
```

---

## Phase 3 — Agents

### Task 18: Guide agent geometric primitive

**Files:**
- Create: `src/agents/GuideAgent.tsx`
- Modify: `src/world/Scene.tsx`

- [ ] **Step 1: Write `src/agents/GuideAgent.tsx`**

```tsx
import { useRef } from "react";
import * as THREE from "three";

export type GuidePose = { x: number; z: number; yawRad: number; bobPhase: number };

export function GuideAgent({ pose }: { pose: GuidePose }) {
  const group = useRef<THREE.Group>(null!);

  return (
    <group
      ref={group}
      position={[pose.x, 0, pose.z]}
      rotation={[0, pose.yawRad, 0]}
    >
      {/* body */}
      <mesh position={[0, 0.8, 0]} castShadow>
        <boxGeometry args={[1, 1.6, 0.6]} />
        <meshStandardMaterial color="#0066B3" />
      </mesh>
      {/* head */}
      <mesh position={[0, 1.95, 0]} castShadow>
        <sphereGeometry args={[0.35, 24, 24]} />
        <meshStandardMaterial color="#F2A33C" />
      </mesh>
    </group>
  );
}
```

- [ ] **Step 2: Mount a stub guide agent in `Scene.tsx` for visual verification**

Add inside `<Canvas>`, after `<Floor>`:
```tsx
<GuideAgent pose={{ x: 0, z: 0, yawRad: 0, bobPhase: 0 }} />
```

Import: `import { GuideAgent } from "@/agents/GuideAgent";`

- [ ] **Step 3: Verify**

Run `npm run dev`. Expected: a small blue rectangle with an orange sphere on top sits at the centre of the active floor. Stop server.

- [ ] **Step 4: Commit**

```powershell
git add src/agents/GuideAgent.tsx src/world/Scene.tsx
git commit -m "feat: guide agent primitive (rectangle body + sphere head)"
```

---

### Task 19: Waypoint walker — smooth easing + tilt-into-turns

**Files:**
- Create: `src/agents/useWaypointWalk.ts`
- Modify: `src/world/Scene.tsx`

- [ ] **Step 1: Write `src/agents/useWaypointWalk.ts`**

```ts
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import type { Floor, Waypoint } from "@/data/types";
import { useStore } from "@/store";

const SPEED_MPS = 4;

function easeInOut(t: number) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

export function useWaypointWalk(floors: Floor[]) {
  const segT = useRef(0);
  const pose = useRef({ x: 0, z: 0, yawRad: 0, bobPhase: 0 });
  const lastYaw = useRef(0);

  useFrame((_, dt) => {
    const route = useStore.getState().activeRoute;
    if (!route) return;
    const steps = route.variant.steps;
    const i = route.currentWaypointIndex;
    if (i >= steps.length - 1) return;
    const a = steps[i];
    const b = steps[i + 1];
    const floor = floors.find(f => f.id === a.floorId);
    if (!floor) return;
    const ax = a.point[0] - floor.bounds.width / 2;
    const az = a.point[1] - floor.bounds.depth / 2;
    const bx = b.point[0] - floor.bounds.width / 2;
    const bz = b.point[1] - floor.bounds.depth / 2;
    const dx = bx - ax;
    const dz = bz - az;
    const segLen = Math.hypot(dx, dz);
    if (segLen < 0.0001) return;

    segT.current += (SPEED_MPS * dt) / segLen;
    const t = Math.min(1, segT.current);
    const e = easeInOut(t);
    pose.current.x = ax + dx * e;
    pose.current.z = az + dz * e;
    pose.current.bobPhase += dt * 6;
    const targetYaw = Math.atan2(dx, dz);
    lastYaw.current += (targetYaw - lastYaw.current) * Math.min(1, dt * 6);
    pose.current.yawRad = lastYaw.current + Math.sin(pose.current.bobPhase) * 0.03;

    if (t >= 1) {
      segT.current = 0;
      useStore.getState().advanceRoute();
    }
  });

  return pose;
}
```

- [ ] **Step 2: Use the hook in `Scene.tsx` to drive `<GuideAgent>`**

Replace the stub `<GuideAgent>` line with:

```tsx
{useStore.getState().activeRoute && (
  <WalkingGuide floors={floors} />
)}
```

Add a tiny wrapper component at the bottom of `Scene.tsx`:

```tsx
function WalkingGuide({ floors }: { floors: import("@/data/types").Floor[] }) {
  const pose = useWaypointWalk(floors);
  // Need to read pose ref each frame — use a frame-driven Group
  const groupRef = useRef<THREE.Group>(null!);
  useFrame(() => {
    if (!groupRef.current) return;
    groupRef.current.position.set(pose.current.x, 0, pose.current.z);
    groupRef.current.rotation.y = pose.current.yawRad;
  });
  return (
    <group ref={groupRef}>
      <GuideAgent pose={{ x: 0, z: 0, yawRad: 0, bobPhase: 0 }} />
    </group>
  );
}
```

Imports to add at the top of `Scene.tsx`:
```tsx
import { useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { useWaypointWalk } from "@/agents/useWaypointWalk";
```

- [ ] **Step 3: Commit**

```powershell
git add src/agents/useWaypointWalk.ts src/world/Scene.tsx
git commit -m "feat: waypoint walker with easing, bob, tilt-into-turns"
```

---

### Task 20: Footstep breadcrumb

**Files:**
- Create: `src/agents/FootstepBreadcrumb.tsx`
- Modify: `src/world/Scene.tsx`

- [ ] **Step 1: Write `src/agents/FootstepBreadcrumb.tsx`**

```tsx
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";

const MAX_PRINTS = 16;
const LIFETIME_MS = 800;

type Print = { pos: THREE.Vector3; born: number };

export function FootstepBreadcrumb({
  poseRef,
}: {
  poseRef: React.MutableRefObject<{ x: number; z: number; yawRad: number; bobPhase: number }>;
}) {
  const prints = useRef<Print[]>([]);
  const lastSpawn = useRef(0);
  const groupRef = useRef<THREE.Group>(null!);

  useFrame(({ clock }) => {
    const now = clock.elapsedTime * 1000;
    if (now - lastSpawn.current > 250) {
      prints.current.push({
        pos: new THREE.Vector3(poseRef.current.x, 0.05, poseRef.current.z),
        born: now,
      });
      if (prints.current.length > MAX_PRINTS) prints.current.shift();
      lastSpawn.current = now;
    }
    if (!groupRef.current) return;
    groupRef.current.clear();
    for (const p of prints.current) {
      const age = now - p.born;
      if (age > LIFETIME_MS) continue;
      const opacity = 1 - age / LIFETIME_MS;
      const mesh = new THREE.Mesh(
        new THREE.CircleGeometry(0.2, 8),
        new THREE.MeshBasicMaterial({
          color: "#0066B3",
          transparent: true,
          opacity: opacity * 0.6,
        }),
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.copy(p.pos);
      groupRef.current.add(mesh);
    }
  });

  return <group ref={groupRef} />;
}
```

- [ ] **Step 2: Add `<FootstepBreadcrumb>` next to the guide in `Scene.tsx`**

Modify `WalkingGuide` so it returns both:

```tsx
function WalkingGuide({ floors }: { floors: import("@/data/types").Floor[] }) {
  const pose = useWaypointWalk(floors);
  const groupRef = useRef<THREE.Group>(null!);
  useFrame(() => {
    if (!groupRef.current) return;
    groupRef.current.position.set(pose.current.x, 0, pose.current.z);
    groupRef.current.rotation.y = pose.current.yawRad;
  });
  return (
    <>
      <FootstepBreadcrumb poseRef={pose} />
      <group ref={groupRef}>
        <GuideAgent pose={{ x: 0, z: 0, yawRad: 0, bobPhase: 0 }} />
      </group>
    </>
  );
}
```

Add import: `import { FootstepBreadcrumb } from "@/agents/FootstepBreadcrumb";`

- [ ] **Step 3: Commit**

```powershell
git add src/agents/FootstepBreadcrumb.tsx src/world/Scene.tsx
git commit -m "feat: footstep breadcrumb behind the guide agent"
```

---

### Task 21: Analytics agents — top-down dots that wander

**Files:**
- Create: `src/agents/AnalyticsAgent.tsx`
- Create: `src/agents/wanderLoops.ts`
- Modify: `src/world/Scene.tsx`

- [ ] **Step 1: Write `src/agents/wanderLoops.ts`**

```ts
import type { FloorId } from "@/data/types";

export type WanderLoop = {
  floorId: FloorId;
  color: string;
  points: [number, number][];
};

// Hard-coded for the demo. Tune these to follow the corridors in your traced SVG.
export const WANDER_LOOPS: WanderLoop[] = [
  {
    floorId: "L1",
    color: "#F2A33C",
    points: [[20, 20], [60, 20], [60, 60], [20, 60]],
  },
  {
    floorId: "L1",
    color: "#0066B3",
    points: [[100, 30], [160, 30], [160, 90], [100, 90]],
  },
  {
    floorId: "L2",
    color: "#4CAF50",
    points: [[30, 30], [120, 30], [120, 100], [30, 100]],
  },
];
```

> Tune these point arrays once you've seen your traced floors — they should sit inside real corridors.

- [ ] **Step 2: Write `src/agents/AnalyticsAgent.tsx`**

```tsx
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import type { Floor } from "@/data/types";
import type { WanderLoop } from "./wanderLoops";

export function AnalyticsAgent({
  loop,
  floor,
  speed,
  phase,
}: {
  loop: WanderLoop;
  floor: Floor;
  speed: number;
  phase: number;
}) {
  const t = useRef(phase);
  const ref = useRef<THREE.Mesh>(null!);
  const offsets = useMemo(() => {
    const arr: number[] = [0];
    for (let i = 1; i < loop.points.length; i++) {
      const [px, py] = loop.points[i - 1];
      const [qx, qy] = loop.points[i];
      arr.push(arr[i - 1] + Math.hypot(qx - px, qy - py));
    }
    const last = loop.points[loop.points.length - 1];
    const first = loop.points[0];
    arr.push(arr[arr.length - 1] + Math.hypot(first[0] - last[0], first[1] - last[1]));
    return arr;
  }, [loop]);

  useFrame((_, dt) => {
    t.current += speed * dt;
    const totalLen = offsets[offsets.length - 1];
    const u = ((t.current % totalLen) + totalLen) % totalLen;
    let segIdx = 0;
    while (segIdx < offsets.length - 1 && offsets[segIdx + 1] < u) segIdx++;
    const segStart = offsets[segIdx];
    const segEnd = offsets[segIdx + 1];
    const segT = (u - segStart) / Math.max(0.001, segEnd - segStart);
    const p = loop.points[segIdx % loop.points.length];
    const q = loop.points[(segIdx + 1) % loop.points.length];
    const x = p[0] + (q[0] - p[0]) * segT - floor.bounds.width / 2;
    const z = p[1] + (q[1] - p[1]) * segT - floor.bounds.depth / 2;
    if (ref.current) ref.current.position.set(x, 0.1, z);
  });

  return (
    <mesh ref={ref}>
      <circleGeometry args={[0.5, 16]} />
      <meshBasicMaterial color={loop.color} />
      <primitive attach="rotation" object={new THREE.Euler(-Math.PI / 2, 0, 0)} />
    </mesh>
  );
}
```

- [ ] **Step 3: Mount analytics agents in `Scene.tsx` for the active floor**

In the JSX of `Scene`, after `<Floor>`, add:

```tsx
{active &&
  WANDER_LOOPS.filter(l => l.floorId === active.id).flatMap((loop, li) =>
    Array.from({ length: 4 }).map((_, ai) => (
      <AnalyticsAgent
        key={`${li}-${ai}`}
        loop={loop}
        floor={active}
        speed={2 + ai * 0.5}
        phase={ai * 20}
      />
    )),
  )}
```

Imports:
```tsx
import { AnalyticsAgent } from "@/agents/AnalyticsAgent";
import { WANDER_LOOPS } from "@/agents/wanderLoops";
```

- [ ] **Step 4: Verify**

Run `npm run dev`. Expected: ~8 coloured dots moving around the corridors. Stop.

- [ ] **Step 5: Commit**

```powershell
git add src/agents/AnalyticsAgent.tsx src/agents/wanderLoops.ts src/world/Scene.tsx
git commit -m "feat: analytics agents wander along hard-coded loops"
```

---

### Task 22: Counter loads driven by Perlin noise

**Files:**
- Create: `src/agents/counterLoads.ts`
- Modify: `src/world/Scene.tsx`

- [ ] **Step 1: Write `src/agents/counterLoads.ts`**

```ts
import { Noise } from "noisejs";
import { useEffect } from "react";
import { useStore } from "@/store";

const noise = new Noise(Math.random());

export function useCounterLoadSimulator() {
  const services = useStore(s => s.services);
  const setLoad = useStore(s => s.setLoad);
  useEffect(() => {
    if (!services.length) return;
    const counters = services.flatMap(s => s.counterIds ?? []);
    let raf = 0;
    const tick = (t: number) => {
      const seconds = t / 1000;
      counters.forEach((cid, i) => {
        const n = noise.perlin2(i * 0.13, seconds * 0.07) * 0.5 + 0.5;
        setLoad(cid, n);
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [services, setLoad]);
}
```

- [ ] **Step 2: Mount the simulator in `Scene.tsx`**

At the top of the `Scene` function body, after the existing `useEffect`:

```tsx
useCounterLoadSimulator();
```

Import: `import { useCounterLoadSimulator } from "@/agents/counterLoads";`

- [ ] **Step 3: Commit**

```powershell
git add src/agents/counterLoads.ts src/world/Scene.tsx
git commit -m "feat: per-counter Perlin-noise load simulator"
```

---

## Phase 4 — UI

### Task 23: TopBar (language, step-free, voice button)

**Files:**
- Create: `src/ui/TopBar.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Write `src/ui/TopBar.tsx`**

```tsx
import { useStore } from "@/store";
import { Microphone, PersonSimpleWalk, GlobeHemisphereWest } from "phosphor-react";

export function TopBar({ onVoiceTap }: { onVoiceTap: () => void }) {
  const { language, profile, setLanguage, setProfile } = useStore();
  return (
    <div className="flex items-center justify-between px-3 py-2 bg-oth-primary text-white">
      <button
        onClick={() => setLanguage(language === "en" ? "zh" : "en")}
        className="flex items-center gap-1 px-2 py-1 rounded bg-white/15"
        aria-label="Toggle language"
      >
        <GlobeHemisphereWest size={20} weight="bold" />
        <span className="text-sm font-semibold">{language === "en" ? "EN" : "中"}</span>
      </button>
      <button
        onClick={() => setProfile(profile === "default" ? "stepFree" : "default")}
        className={`flex items-center gap-1 px-2 py-1 rounded ${
          profile === "stepFree" ? "bg-oth-warm text-oth-ink" : "bg-white/15"
        }`}
        aria-label="Toggle step-free routing"
      >
        <PersonSimpleWalk size={20} weight="bold" />
        <span className="text-xs font-semibold">Step-free</span>
      </button>
      <button
        onClick={onVoiceTap}
        className="p-2 rounded-full bg-white/15"
        aria-label="Voice input"
      >
        <Microphone size={22} weight="bold" />
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Wire into `App.tsx` (replace the placeholder TopBar)**

```tsx
import { PhoneFrame } from "@/ui/PhoneFrame";
import { Scene } from "@/world/Scene";
import { FloorSelector } from "@/ui/FloorSelector";
import { TopBar } from "@/ui/TopBar";

export default function App() {
  return (
    <PhoneFrame>
      <div className="flex h-full flex-col">
        <div className="h-[8%]">
          <TopBar onVoiceTap={() => console.log("TODO: voice")} />
        </div>
        <div className="h-[60%] relative">
          <Scene />
          <FloorSelector />
        </div>
        <div className="h-[32%] bg-oth-paper border-t border-neutral-300 grid place-items-center text-neutral-700">
          PromptPanel
        </div>
      </div>
    </PhoneFrame>
  );
}
```

- [ ] **Step 3: Verify**

Run `npm run dev`. Toggle language and step-free; they should change visually. Voice button logs to console. Stop.

- [ ] **Step 4: Commit**

```powershell
git add src/ui/TopBar.tsx src/App.tsx
git commit -m "feat: TopBar with language, step-free, voice controls"
```

---

### Task 24: Service tiles grid

**Files:**
- Create: `src/ui/ServiceTiles.tsx`
- Create: `src/ui/iconMap.tsx`

- [ ] **Step 1: Write `src/ui/iconMap.tsx`**

```tsx
import { Book, Hospital, Info, Soccer, Receipt, Storefront, IconProps } from "phosphor-react";
import { ComponentType } from "react";

export const ICONS: Record<string, ComponentType<IconProps>> = {
  info: Info,
  book: Book,
  hospital: Hospital,
  soccer: Soccer,
  receipt: Receipt,
  shop: Storefront,
};

export function ServiceIcon({ iconKey, size = 32 }: { iconKey: string; size?: number }) {
  const Cmp = ICONS[iconKey] ?? Info;
  return <Cmp size={size} weight="duotone" />;
}
```

- [ ] **Step 2: Write `src/ui/ServiceTiles.tsx`**

```tsx
import { useStore } from "@/store";
import { ServiceIcon } from "./iconMap";

export function ServiceTiles({ onPick }: { onPick: (serviceId: string) => void }) {
  const { services, language } = useStore();
  return (
    <div className="grid grid-cols-2 gap-3 p-4">
      {services.map(s => (
        <button
          key={s.id}
          onClick={() => onPick(s.id)}
          className="flex flex-col items-center justify-center gap-2 py-4 rounded-2xl bg-white shadow-sm border border-neutral-200 active:scale-95 transition"
        >
          <ServiceIcon iconKey={s.iconKey} size={32} />
          <span className="text-sm font-semibold text-oth-ink text-center">
            {language === "en" ? s.nameEn : s.nameZh}
          </span>
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```powershell
git add src/ui/ServiceTiles.tsx src/ui/iconMap.tsx
git commit -m "feat: service tiles grid"
```

---

### Task 25: PromptPanel with mode switching

**Files:**
- Create: `src/ui/PromptPanel.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Write `src/ui/PromptPanel.tsx`**

```tsx
import { useStore } from "@/store";
import { ServiceTiles } from "./ServiceTiles";

export function PromptPanel({
  narrationText,
  onPickService,
}: {
  narrationText: string;
  onPickService: (id: string) => void;
}) {
  const route = useStore(s => s.activeRoute);
  return (
    <div className="h-full bg-oth-paper border-t border-neutral-300 overflow-hidden">
      {!route ? (
        <ServiceTiles onPick={onPickService} />
      ) : (
        <div className="p-4 h-full flex flex-col">
          <p className="text-xs uppercase tracking-wider text-neutral-500 mb-2">
            Guiding you now
          </p>
          <p className="text-lg font-semibold text-oth-ink leading-snug">
            {narrationText || "…"}
          </p>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Wire into `App.tsx`**

```tsx
import { useState } from "react";
import { PhoneFrame } from "@/ui/PhoneFrame";
import { Scene } from "@/world/Scene";
import { FloorSelector } from "@/ui/FloorSelector";
import { TopBar } from "@/ui/TopBar";
import { PromptPanel } from "@/ui/PromptPanel";

export default function App() {
  const [narration, setNarration] = useState("");
  return (
    <PhoneFrame>
      <div className="flex h-full flex-col">
        <div className="h-[8%]">
          <TopBar onVoiceTap={() => console.log("TODO: voice")} />
        </div>
        <div className="h-[60%] relative">
          <Scene />
          <FloorSelector />
        </div>
        <div className="h-[32%]">
          <PromptPanel
            narrationText={narration}
            onPickService={id => console.log("TODO: pick", id, setNarration)}
          />
        </div>
      </div>
    </PhoneFrame>
  );
}
```

- [ ] **Step 3: Commit**

```powershell
git add src/ui/PromptPanel.tsx src/App.tsx
git commit -m "feat: prompt panel with tile/narration modes"
```

---

## Phase 5 — Routing + Narration

### Task 26: Waypoint editor at `/dev/waypoints`

**Files:**
- Create: `src/dev/WaypointEditor.tsx`
- Modify: `src/App.tsx`

> This internal tool helps you author waypoint arrays by clicking on the rendered floor. It does NOT need to be polished.

- [ ] **Step 1: Write `src/dev/WaypointEditor.tsx`**

```tsx
import { useEffect, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Floor } from "@/world/Floor";
import { loadDataBundle } from "@/data/loaders";
import type { Floor as FloorData } from "@/data/types";

export function WaypointEditor() {
  const [floors, setFloors] = useState<FloorData[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [points, setPoints] = useState<[number, number][]>([]);

  useEffect(() => {
    loadDataBundle().then(b => setFloors(b.floors));
  }, []);
  const active = floors[activeIdx];

  return (
    <div className="grid grid-cols-2 h-screen">
      <div className="relative">
        <Canvas
          camera={{ position: [0, 200, 0], fov: 35 }}
          onPointerMissed={() => {}}
          onClick={e => {
            if (!active) return;
            const [px, , pz] = (e as any).point ?? [0, 0, 0];
            const x = px + active.bounds.width / 2;
            const z = pz + active.bounds.depth / 2;
            setPoints(p => [...p, [Math.round(x * 10) / 10, Math.round(z * 10) / 10]]);
          }}
        >
          <ambientLight intensity={0.7} />
          <directionalLight position={[80, 200, 60]} intensity={1} />
          {active && <Floor data={active} />}
        </Canvas>
      </div>
      <div className="p-4 overflow-auto bg-neutral-100">
        <div className="flex gap-2 mb-3">
          {floors.map((f, i) => (
            <button
              key={f.id}
              onClick={() => setActiveIdx(i)}
              className={`px-3 py-1 rounded ${
                activeIdx === i ? "bg-oth-primary text-white" : "bg-white"
              }`}
            >
              {f.id}
            </button>
          ))}
          <button
            onClick={() => setPoints([])}
            className="ml-auto px-3 py-1 rounded bg-red-500 text-white"
          >
            Clear
          </button>
        </div>
        <pre className="text-xs whitespace-pre-wrap break-all bg-white p-3 rounded">
{JSON.stringify(points, null, 2)}
        </pre>
        <p className="text-xs mt-3 text-neutral-600">
          Click on the floor to add a waypoint. Copy the JSON into{" "}
          <code>public/data/waypoints.json</code>.
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Route to the editor when URL hash is `#waypoints`**

In `src/App.tsx`, at the very top of the component:

```tsx
import { WaypointEditor } from "@/dev/WaypointEditor";
// ...
export default function App() {
  if (typeof window !== "undefined" && window.location.hash === "#waypoints") {
    return <WaypointEditor />;
  }
  // ...rest unchanged
}
```

- [ ] **Step 3: Verify the editor**

Run `npm run dev` and open `http://localhost:5173/#waypoints`. Click on the floor; coordinates appear in the right pane. Switch L1/L2; same behaviour. Stop server.

- [ ] **Step 4: Commit**

```powershell
git add src/dev/WaypointEditor.tsx src/App.tsx
git commit -m "feat: dev-only waypoint editor at #waypoints"
```

---

### Task 27: Author waypoint variants for demo services

**Files:**
- Create: `public/data/waypoints.json`

- [ ] **Step 1: Open `http://localhost:5173/#waypoints`**

- [ ] **Step 2: For each demo service in `services.json`, author one default + one step-free route**

For each route:

1. Click on the floor along the corridor path from the main entrance to the service room.
2. Aim for 5-10 waypoints; clicking at every turn is enough.
3. Add a `decisionPoint: true` flag for ~2 waypoints per route (at the first major turn and at lifts/escalators) when you transcribe.
4. Add a `segmentKey` string for each waypoint: `start`, `entrance`, `turn-1`, `lift`, `arrived`, etc.

- [ ] **Step 3: Copy the editor JSON into `public/data/waypoints.json` formatted as `RouteVariant[]`**

```json
[
  {
    "serviceId": "customer-service",
    "profile": "default",
    "counterId": "cs-1",
    "steps": [
      { "floorId": "L1", "point": [40, 100], "decisionPoint": false, "segmentKey": "start" },
      { "floorId": "L1", "point": [80, 100], "decisionPoint": true,  "segmentKey": "lobby-turn" },
      { "floorId": "L1", "point": [80, 60],  "decisionPoint": false, "segmentKey": "approach" },
      { "floorId": "L1", "point": [100, 60], "decisionPoint": false, "segmentKey": "arrived" }
    ]
  },
  {
    "serviceId": "customer-service",
    "profile": "stepFree",
    "counterId": "cs-2",
    "steps": [
      { "floorId": "L1", "point": [40, 100], "decisionPoint": false, "segmentKey": "start" },
      { "floorId": "L1", "point": [40, 80],  "decisionPoint": true,  "segmentKey": "lift" },
      { "floorId": "L1", "point": [60, 80],  "decisionPoint": false, "segmentKey": "approach" },
      { "floorId": "L1", "point": [100, 60], "decisionPoint": false, "segmentKey": "arrived" }
    ]
  }
]
```

Repeat for every service in `services.json`. Multi-counter services get one route variant per counter (different `counterId`, mostly-similar steps).

- [ ] **Step 4: Reload the dev server and verify validation passes**

Run `npm run dev`, open the console. Expect no `[validateBundle] errors:` log line.

- [ ] **Step 5: Commit**

```powershell
git add public/data/waypoints.json
git commit -m "data: author waypoint variants for demo services"
```

---

### Task 28: Accessibility + load-aware route picker

**Files:**
- Create: `src/routing/selectRoute.ts`
- Create: `src/routing/selectRoute.test.ts`

- [ ] **Step 1: Write failing test `src/routing/selectRoute.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { selectRoute } from "./selectRoute";
import type { RouteVariant } from "@/data/types";

const routes: RouteVariant[] = [
  {
    serviceId: "x",
    profile: "default",
    counterId: "x-1",
    steps: [{ floorId: "L1", point: [0, 0], decisionPoint: false, segmentKey: "a" }],
  },
  {
    serviceId: "x",
    profile: "default",
    counterId: "x-2",
    steps: [{ floorId: "L1", point: [0, 0], decisionPoint: false, segmentKey: "a" }],
  },
  {
    serviceId: "x",
    profile: "stepFree",
    counterId: "x-1",
    steps: [{ floorId: "L1", point: [0, 0], decisionPoint: false, segmentKey: "a" }],
  },
];

describe("selectRoute", () => {
  it("returns null when nothing matches", () => {
    expect(selectRoute("y", "default", {}, routes)).toBeNull();
  });

  it("filters by profile", () => {
    const r = selectRoute("x", "stepFree", {}, routes);
    expect(r?.counterId).toBe("x-1");
    expect(r?.profile).toBe("stepFree");
  });

  it("picks the lowest-loaded counter among matching variants", () => {
    const r = selectRoute("x", "default", { "x-1": 0.9, "x-2": 0.1 }, routes);
    expect(r?.counterId).toBe("x-2");
  });
});
```

- [ ] **Step 2: Run test (expect FAIL)**

Run: `npx vitest run src/routing/selectRoute.test.ts`

- [ ] **Step 3: Write `src/routing/selectRoute.ts`**

```ts
import type { AccessibilityProfile, RouteVariant } from "@/data/types";

export function selectRoute(
  serviceId: string,
  profile: AccessibilityProfile,
  loads: Record<string, number>,
  routes: RouteVariant[],
): RouteVariant | null {
  const matches = routes.filter(
    r => r.serviceId === serviceId && r.profile === profile,
  );
  if (matches.length === 0) {
    if (profile === "stepFree") return selectRoute(serviceId, "default", loads, routes);
    return null;
  }
  if (matches.length === 1) return matches[0];
  let best = matches[0];
  let bestLoad = loads[best.counterId ?? ""] ?? 0;
  for (const r of matches.slice(1)) {
    const l = loads[r.counterId ?? ""] ?? 0;
    if (l < bestLoad) {
      best = r;
      bestLoad = l;
    }
  }
  return best;
}
```

- [ ] **Step 4: Run test (expect PASS)**

Run: `npx vitest run src/routing/selectRoute.test.ts`

Expected: 3 passed.

- [ ] **Step 5: Commit**

```powershell
git add src/routing/selectRoute.ts src/routing/selectRoute.test.ts
git commit -m "feat: route picker (accessibility + load-aware)"
```

---

### Task 29: OpenAI proxy serverless function

**Files:**
- Create: `api/narrate.ts`
- Create: `.env.example`

- [ ] **Step 1: Write `.env.example`**

```
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o
```

- [ ] **Step 2: Create your local `.env.local` file (not committed)**

```
OPENAI_API_KEY=<your real key>
OPENAI_MODEL=gpt-4o
```

- [ ] **Step 3: Write `api/narrate.ts`**

```ts
import OpenAI from "openai";

const SYSTEM_PROMPT = `You are a wayfinding assistant inside One Tampines Hub (OTH) in Singapore.
You help elderly visitors find counters. Tone: warm, concise, Singapore-English-aware.
RULES:
- Pick the single best service from the catalog for the user's query.
- Produce a short narration with one segment per "segmentKey" found in the route waypoints.
- Provide narration in both English (en) and Mandarin (zh) for every segment.
- Never claim step-free routing for a service flagged stepFreeRoute=false.
- If the service genuinely lacks step-free access, say so plainly in the relevant segment.
- Do not invent services or locations.`;

const SCHEMA = {
  name: "narration",
  strict: true,
  schema: {
    type: "object",
    required: ["serviceId", "segments"],
    additionalProperties: false,
    properties: {
      serviceId: { type: "string" },
      segments: {
        type: "array",
        items: {
          type: "object",
          required: ["key", "en", "zh"],
          additionalProperties: false,
          properties: {
            key: { type: "string" },
            en: { type: "string" },
            zh: { type: "string" },
          },
        },
      },
    },
  },
};

export const config = { runtime: "nodejs" };

export default async function handler(req: Request) {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
  const { query, profile, services, segmentKeys } = await req.json();
  if (!query || !services) return new Response("missing fields", { status: 400 });

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
  try {
    const completion = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL ?? "gpt-4o",
      response_format: { type: "json_schema", json_schema: SCHEMA },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: JSON.stringify({
            query,
            profile,
            services,
            segmentKeys,
          }),
        },
      ],
    });
    const text = completion.choices[0]?.message?.content ?? "{}";
    return new Response(text, {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: String(err?.message ?? err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
```

- [ ] **Step 4: Set up Vercel dev locally**

Run:
```powershell
npm install -g vercel
vercel link
```

When prompted, accept the defaults (create a new Vercel project linked to this folder).

Run:
```powershell
vercel env add OPENAI_API_KEY development
vercel env add OPENAI_MODEL development
vercel env pull .env.local
```

- [ ] **Step 5: Start dev with `vercel dev` (replaces `npm run dev`)**

Run:
```powershell
vercel dev
```

Expected: both Vite and the function are served on `http://localhost:3000`. The Vite proxy in `vite.config.ts` now matches.

Smoke-test the endpoint:
```powershell
curl -X POST http://localhost:3000/api/narrate -H "Content-Type: application/json" -d "{\"query\":\"library\",\"profile\":\"default\",\"services\":[{\"id\":\"regional-library\",\"nameEn\":\"Library\"}],\"segmentKeys\":[\"start\",\"arrived\"]}"
```

Expected: JSON response with `serviceId` and `segments` arrays containing `en` + `zh` strings.

- [ ] **Step 6: Commit**

```powershell
git add api/narrate.ts .env.example
git commit -m "feat: OpenAI proxy serverless function for narration"
```

---

### Task 30: Narration client + memory cache

**Files:**
- Create: `src/narration/client.ts`
- Create: `src/narration/cache.ts`

- [ ] **Step 1: Write `src/narration/client.ts`**

```ts
import type { AccessibilityProfile, NarrationResponse, Service } from "@/data/types";

export async function fetchNarration(args: {
  query: string;
  profile: AccessibilityProfile;
  services: Service[];
  segmentKeys: string[];
}): Promise<NarrationResponse> {
  const res = await fetch("/api/narrate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`narrate ${res.status}`);
  return res.json();
}
```

- [ ] **Step 2: Write `src/narration/cache.ts`**

```ts
import type { NarrationResponse } from "@/data/types";

const memCache = new Map<string, NarrationResponse>();

function keyFor(serviceId: string, profile: string) {
  return `${serviceId}::${profile}`;
}

export function getCached(serviceId: string, profile: string) {
  return memCache.get(keyFor(serviceId, profile)) ?? null;
}

export function setCached(serviceId: string, profile: string, value: NarrationResponse) {
  memCache.set(keyFor(serviceId, profile), value);
}
```

- [ ] **Step 3: Commit**

```powershell
git add src/narration/client.ts src/narration/cache.ts
git commit -m "feat: narration client + in-memory cache"
```

---

### Task 31: TTS queue + playback

**Files:**
- Create: `src/narration/ttsQueue.ts`

- [ ] **Step 1: Write `src/narration/ttsQueue.ts`**

```ts
import type { Language, NarrationSegment } from "@/data/types";

type Job = { text: string; lang: Language; onStart?: () => void; onEnd?: () => void };

let queue: Job[] = [];
let speaking = false;

function langTag(l: Language) {
  return l === "zh" ? "zh-CN" : "en-US";
}

function pickVoice(lang: Language): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  const tag = langTag(lang);
  const exact = voices.find(v => v.lang === tag);
  if (exact) return exact;
  const prefix = voices.find(v => v.lang.startsWith(tag.split("-")[0]));
  return prefix ?? null;
}

function speakNext() {
  if (speaking) return;
  const job = queue.shift();
  if (!job) return;
  speaking = true;
  const utt = new SpeechSynthesisUtterance(job.text);
  utt.lang = langTag(job.lang);
  const v = pickVoice(job.lang);
  if (v) utt.voice = v;
  utt.onstart = () => job.onStart?.();
  utt.onend = () => {
    speaking = false;
    job.onEnd?.();
    speakNext();
  };
  window.speechSynthesis.speak(utt);
}

export function enqueueSegments(segments: NarrationSegment[], lang: Language, onSegmentEnd: (key: string) => void) {
  for (const seg of segments) {
    queue.push({
      text: lang === "zh" ? seg.zh : seg.en,
      lang,
      onEnd: () => onSegmentEnd(seg.key),
    });
  }
  speakNext();
}

export function cancelAll() {
  queue = [];
  window.speechSynthesis.cancel();
  speaking = false;
}
```

- [ ] **Step 2: Commit**

```powershell
git add src/narration/ttsQueue.ts
git commit -m "feat: TTS queue with voice selection and per-segment callbacks"
```

---

### Task 32: Pre-warm narration on app load

**Files:**
- Create: `src/narration/prewarm.ts`
- Modify: `src/App.tsx`

- [ ] **Step 1: Write `src/narration/prewarm.ts`**

```ts
import { fetchNarration } from "./client";
import { setCached } from "./cache";
import type { Service, AccessibilityProfile, RouteVariant } from "@/data/types";

export async function prewarmAll(
  services: Service[],
  routes: RouteVariant[],
) {
  const profiles: AccessibilityProfile[] = ["default", "stepFree"];
  await Promise.allSettled(
    services.flatMap(svc =>
      profiles.map(async profile => {
        const route = routes.find(r => r.serviceId === svc.id && r.profile === profile);
        if (!route) return;
        const segmentKeys = route.steps.map(s => s.segmentKey);
        try {
          const result = await fetchNarration({
            query: svc.nameEn,
            profile,
            services: [svc],
            segmentKeys,
          });
          setCached(svc.id, profile, result);
        } catch (e) {
          console.warn(`prewarm failed for ${svc.id}/${profile}`, e);
        }
      }),
    ),
  );
}
```

- [ ] **Step 2: Trigger prewarm in `App.tsx`**

Add inside the `App` component (after the imports, before the existing logic):

```tsx
import { useEffect } from "react";
import { useStore } from "@/store";
import { loadDataBundle } from "@/data/loaders";
import { prewarmAll } from "@/narration/prewarm";

// inside App() body, before any return:
const setBundle = useStore(s => s.setBundle);
useEffect(() => {
  loadDataBundle().then(b => {
    setBundle(b);
    prewarmAll(b.services, b.routes);
  });
}, [setBundle]);
```

> Remove the duplicate `loadDataBundle` call from `Scene.tsx` — it now happens here, once.

- [ ] **Step 3: Commit**

```powershell
git add src/narration/prewarm.ts src/App.tsx src/world/Scene.tsx
git commit -m "feat: prewarm narration for demo services on app boot"
```

---

### Task 33: Wire service-tile tap → route + narration

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Replace the placeholder `onPickService` in `App.tsx`**

```tsx
import { useState, useEffect, useCallback } from "react";
import { PhoneFrame } from "@/ui/PhoneFrame";
import { Scene } from "@/world/Scene";
import { FloorSelector } from "@/ui/FloorSelector";
import { TopBar } from "@/ui/TopBar";
import { PromptPanel } from "@/ui/PromptPanel";
import { useStore } from "@/store";
import { loadDataBundle } from "@/data/loaders";
import { prewarmAll } from "@/narration/prewarm";
import { selectRoute } from "@/routing/selectRoute";
import { fetchNarration } from "@/narration/client";
import { getCached, setCached } from "@/narration/cache";
import { enqueueSegments, cancelAll } from "@/narration/ttsQueue";
import type { NarrationSegment } from "@/data/types";
import { WaypointEditor } from "@/dev/WaypointEditor";

export default function App() {
  if (typeof window !== "undefined" && window.location.hash === "#waypoints") {
    return <WaypointEditor />;
  }

  const { setBundle, services, routes, profile, language, counterLoads, startRoute, endRoute, setActiveFloor } = useStore();
  const [narrationText, setNarrationText] = useState("");
  const [segments, setSegments] = useState<NarrationSegment[]>([]);

  useEffect(() => {
    loadDataBundle().then(b => {
      setBundle(b);
      prewarmAll(b.services, b.routes);
    });
  }, [setBundle]);

  const onPickService = useCallback(
    async (serviceId: string) => {
      const variant = selectRoute(serviceId, profile, counterLoads, routes);
      if (!variant) return;
      setActiveFloor(variant.steps[0].floorId);
      startRoute(variant);

      let narr = getCached(serviceId, profile);
      if (!narr) {
        const svc = services.find(s => s.id === serviceId);
        if (!svc) return;
        narr = await fetchNarration({
          query: svc.nameEn,
          profile,
          services: [svc],
          segmentKeys: variant.steps.map(s => s.segmentKey),
        });
        setCached(serviceId, profile, narr);
      }
      setSegments(narr.segments);
      cancelAll();
      enqueueSegments(narr.segments, language, key => {
        const seg = narr!.segments.find(s => s.key === key);
        if (seg) setNarrationText(language === "zh" ? seg.zh : seg.en);
      });
    },
    [profile, counterLoads, routes, services, language, startRoute, setActiveFloor],
  );

  useEffect(() => {
    if (!useStore.getState().activeRoute) {
      setNarrationText("");
      cancelAll();
    }
  }, [useStore(s => s.activeRoute)]);

  return (
    <PhoneFrame>
      <div className="flex h-full flex-col">
        <div className="h-[8%]">
          <TopBar onVoiceTap={() => console.log("TODO: voice")} />
        </div>
        <div className="h-[60%] relative">
          <Scene />
          <FloorSelector />
        </div>
        <div className="h-[32%]">
          <PromptPanel narrationText={narrationText} onPickService={onPickService} />
        </div>
      </div>
    </PhoneFrame>
  );
}
```

- [ ] **Step 2: Verify end-to-end**

Run `vercel dev`. Open `http://localhost:3000`. Tap any service tile. Expected: camera tracks the guide as it walks; narration text + voice plays per segment.

- [ ] **Step 3: Commit**

```powershell
git add src/App.tsx
git commit -m "feat: wire service tile to route + narration playback"
```

---

### Task 34: Voice input via Web Speech STT

**Files:**
- Create: `src/ui/useSpeechRecognition.ts`
- Modify: `src/App.tsx`

- [ ] **Step 1: Write `src/ui/useSpeechRecognition.ts`**

```ts
import { useRef, useState } from "react";

type SR = SpeechRecognition | null;

export function useSpeechRecognition() {
  const [transcript, setTranscript] = useState("");
  const [listening, setListening] = useState(false);
  const recogRef = useRef<SR>(null);

  function start(lang: "en-US" | "zh-CN") {
    const Ctor = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    if (!Ctor) return;
    const recog = new Ctor();
    recog.lang = lang;
    recog.interimResults = false;
    recog.maxAlternatives = 1;
    recog.onresult = (e: any) => setTranscript(e.results[0][0].transcript);
    recog.onend = () => setListening(false);
    recog.onerror = () => setListening(false);
    recog.start();
    recogRef.current = recog;
    setListening(true);
  }
  function stop() {
    recogRef.current?.stop();
    setListening(false);
  }

  return { transcript, listening, start, stop };
}
```

- [ ] **Step 2: Wire voice button in `App.tsx`**

Replace the `onVoiceTap` handler:

```tsx
import { useSpeechRecognition } from "@/ui/useSpeechRecognition";
// inside App():
const sr = useSpeechRecognition();
const onVoiceTap = () => {
  if (sr.listening) sr.stop();
  else sr.start(language === "zh" ? "zh-CN" : "en-US");
};
useEffect(() => {
  if (sr.transcript) {
    const lower = sr.transcript.toLowerCase();
    const match = services.find(
      s =>
        lower.includes(s.nameEn.toLowerCase()) ||
        s.nameZh.split("").every(ch => sr.transcript.includes(ch)),
    );
    if (match) onPickService(match.id);
  }
}, [sr.transcript]);
```

- [ ] **Step 3: Commit**

```powershell
git add src/ui/useSpeechRecognition.ts src/App.tsx
git commit -m "feat: voice input routes to matching service tile"
```

---

### Task 35: Language switch mid-route

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Re-enqueue remaining segments when language changes**

Add a `useEffect` watching `language` and the current route progress:

```tsx
useEffect(() => {
  const route = useStore.getState().activeRoute;
  if (!route || segments.length === 0) return;
  const remaining = segments.slice(route.currentWaypointIndex);
  cancelAll();
  enqueueSegments(remaining, language, key => {
    const seg = segments.find(s => s.key === key);
    if (seg) setNarrationText(language === "zh" ? seg.zh : seg.en);
  });
}, [language]);
```

- [ ] **Step 2: Commit**

```powershell
git add src/App.tsx
git commit -m "feat: language toggle mid-route re-enqueues remaining narration"
```

---

### Task 36: Success card on arrival

**Files:**
- Create: `src/ui/SuccessCard.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Write `src/ui/SuccessCard.tsx`**

```tsx
import { useStore } from "@/store";
import { CheckCircle, X } from "phosphor-react";

export function SuccessCard({
  onDismiss,
}: {
  onDismiss: () => void;
}) {
  const { services, activeRoute, counterLoads, language } = useStore();
  if (!activeRoute) return null;
  const finished =
    activeRoute.currentWaypointIndex >= activeRoute.variant.steps.length - 1;
  if (!finished) return null;
  const svc = services.find(s => s.id === activeRoute.variant.serviceId);
  if (!svc) return null;
  const counterId = activeRoute.variant.counterId;
  const load = counterId ? Math.round((counterLoads[counterId] ?? 0) * 10) : null;

  return (
    <div className="absolute inset-x-3 bottom-3 rounded-2xl bg-oth-primary text-white shadow-xl p-4 z-10">
      <div className="flex items-start gap-3">
        <CheckCircle size={28} weight="fill" />
        <div className="flex-1">
          <p className="text-sm opacity-80">
            {language === "en" ? "You've arrived" : "您已到达"}
          </p>
          <p className="text-lg font-semibold">
            {language === "en" ? svc.nameEn : svc.nameZh}
          </p>
          {load !== null && (
            <p className="text-xs opacity-80 mt-1">
              {language === "en"
                ? `Counter ${counterId} — about ${load} people waiting`
                : `${counterId} 柜台 — 大约 ${load} 人在等候`}
            </p>
          )}
        </div>
        <button onClick={onDismiss} aria-label="Close">
          <X size={20} weight="bold" />
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Mount `<SuccessCard>` inside the WorldView container in `App.tsx`**

```tsx
import { SuccessCard } from "@/ui/SuccessCard";
// inside the WorldView div:
<SuccessCard onDismiss={endRoute} />
```

(`endRoute` already destructured from the store earlier.)

- [ ] **Step 3: Commit**

```powershell
git add src/ui/SuccessCard.tsx src/App.tsx
git commit -m "feat: success card on arrival with counter load"
```

---

## Phase 6 — Demo polish + gates

### Task 37: Counter load badges over counters

**Files:**
- Create: `src/world/CounterBadge.tsx`
- Modify: `src/world/Scene.tsx`

- [ ] **Step 1: Write `src/world/CounterBadge.tsx`**

```tsx
import { Html } from "@react-three/drei";
import { useStore } from "@/store";
import type { Service, Floor } from "@/data/types";

export function CounterBadges({ floor }: { floor: Floor }) {
  const { services, counterLoads } = useStore();
  const onFloor = services.filter((s: Service) => s.floorId === floor.id);
  return (
    <>
      {onFloor.map(svc => {
        const poly = floor.polygons.find(p => p.id === svc.roomId);
        if (!poly) return null;
        const cx = poly.points.reduce((a, [x]) => a + x, 0) / poly.points.length;
        const cz = poly.points.reduce((a, [, z]) => a + z, 0) / poly.points.length;
        const x = cx - floor.bounds.width / 2;
        const z = cz - floor.bounds.depth / 2;
        const ids = svc.counterIds ?? [];
        const avg =
          ids.length === 0
            ? 0
            : ids.reduce((acc, id) => acc + (counterLoads[id] ?? 0), 0) / ids.length;
        const people = Math.round(avg * 12);
        return (
          <Html key={svc.id} position={[x, 6, z]} center>
            <div className="text-[10px] px-2 py-0.5 rounded-full bg-oth-ink text-white whitespace-nowrap">
              {people} waiting
            </div>
          </Html>
        );
      })}
    </>
  );
}
```

- [ ] **Step 2: Mount `<CounterBadges>` inside `Scene.tsx`**

After `<Floor>`:
```tsx
{active && <CounterBadges floor={active} />}
```

Import: `import { CounterBadges } from "./CounterBadge";`

- [ ] **Step 3: Commit**

```powershell
git add src/world/CounterBadge.tsx src/world/Scene.tsx
git commit -m "feat: counter load badges with simulated waiting counts"
```

---

### Task 38: Cold-start manual gate

- [ ] **Step 1: Deploy to Vercel**

Run:
```powershell
vercel
```

Accept defaults. Configure `OPENAI_API_KEY` and `OPENAI_MODEL` in the Vercel dashboard under the new project's Environment Variables.

Run:
```powershell
vercel --prod
```

Copy the production URL.

- [ ] **Step 2: Open the production URL in an incognito window on a colleague's laptop**

- [ ] **Step 3: Execute the full demo arc from spec §14 without dev tools open**

Verify all of:
- [ ] Service tile tap triggers route
- [ ] Camera tween smooth (no jank)
- [ ] TTS plays in English; switch toggle → TTS plays in Mandarin
- [ ] Step-free toggle changes route to use lift
- [ ] Counter load badge visible; route picks lower-loaded counter
- [ ] Success card appears at end with counter info
- [ ] No console errors

- [ ] **Step 4: Fix anything that broke; commit fixes individually**

- [ ] **Step 5: Final commit (if changes)**

```powershell
git add -p
git commit -m "fix: cold-start gate fixes"
```

---

### Task 39: Senior-friendliness gate

- [ ] **Step 1: Show the running app to a parent or grandparent**

- [ ] **Step 2: Watch them try the tile interface unprompted; do NOT explain anything**

- [ ] **Step 3: Note every friction point**

Examples to expect:
- Tap targets too small
- Service names unclear in their primary language
- Camera moves disorient them
- Narration plays too fast

- [ ] **Step 4: Implement the fixes**

Common adjustments:
- Bump tile font size from `text-sm` to `text-base`
- Slow TTS rate: `utt.rate = 0.9` in `ttsQueue.ts`
- Reduce camera tween rate in `CameraRig.tsx` (change `0.001` to `0.0001`)

- [ ] **Step 5: Re-deploy and commit**

```powershell
git add -p
git commit -m "polish: senior-friendliness gate adjustments"
vercel --prod
```

---

## Done

The plan covers everything in the spec. To execute, pick one of the two execution flows below.

---

**Plan complete and saved to `docs/superpowers/plans/2026-05-22-oth-2_5d-navigation.md`. Two execution options:**

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
