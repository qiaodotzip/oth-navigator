# Floorplan Underlay and Calibration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the editor something to trace over — a shared per-level floorplan image, scaled against a known real dimension and positioned on the building datum — and make the canvas actually frame its content.

**Architecture:** The image lives on the server, one per level, with its calibration on the same row, because local-only storage would let each teammate trace a different picture. Bytes reuse the existing content-addressed store. Validation mirrors `.glb` ingest: the header is parsed to confirm it really is a PNG or JPEG and to read its dimensions, as a pure function with no new dependency. On the client, everything geometric stays a pure function; React renders what those return.

**Tech Stack:** Hono, Drizzle, React, Vitest. No new runtime dependencies.

**Spec:** [`docs/design-and-plans/specs/2026-09-05-editor-usability-design.md`](../specs/2026-09-05-editor-usability-design.md)

**Depends on:** the four completed plans of approach A. Consumes `storeAsset`/`readAsset`, the entity repository pattern, `calibrationFromMeasurement`, `fitViewport`.

## Global Constraints

- **One live image per level.** Uploading a replacement soft-deletes the previous one in the same transaction.
- **Level images never enter a published bundle.** They are authoring aids; the visitor app renders the model, not the drawing it was traced from.
- **Image budget is 20 MB**, enough for a 300 DPI storey plan.
- **An unreadable or oversized upload is 422, never 500** — a bad file is the uploader's problem to fix.
- **Calibration never moves geometry.** Footprints are stored in metres, so re-calibrating moves the *image*, not the rooms.
- **`@oth/model` owns validity**; the editor never re-implements a rule.
- **TypeScript strict**, tests beside the code, Vitest.

---

## File Structure

`packages/server/`:
- `src/images/inspect.ts` — PNG/JPEG header parsing
- `src/images/routes.ts` — upload, list, patch, delete, file
- modify `src/db/schema.ts` — `levelImages`
- modify `src/app.ts` — mount

`packages/editor/`:
- `src/plan/content.ts` — what the viewport should frame
- `src/plan/Underlay.tsx` — already exists; wired up here
- `src/plan/CalibrationOverlay.tsx` — the two-point measurement
- `src/panels/FloorplanPanel.tsx` — upload, scale, position
- modify `src/api/client.ts` — level-image calls
- modify `src/state/store.ts` — `levelImages`, `calibrationDraft`
- modify `src/plan/PlanCanvas.tsx` — underlay, fitting, calibrate tool

---

## Task 1: Frame the content

**Files:**
- Create: `packages/editor/src/plan/content.ts`, `src/plan/content.test.ts`
- Modify: `src/plan/PlanCanvas.tsx`, `src/plan/PlanCanvas.test.tsx`

**Interfaces:**
- Produces: `contentBBox(rings: readonly Ring[], extra?: BBox | null): BBox`, `hasArea(b: BBox): boolean`.

- [ ] **Step 1: Write the failing test**

`packages/editor/src/plan/content.test.ts`:

```ts
import type { Ring } from "@oth/model";
import { describe, expect, it } from "vitest";
import { contentBBox, hasArea } from "./content";

const square: Ring = [[0, 0], [10, 0], [10, 8], [0, 8]];
const far: Ring = [[100, 100], [110, 100], [110, 108]];

describe("contentBBox", () => {
  it("bounds a single ring", () => {
    expect(contentBBox([square])).toEqual({ minX: 0, minY: 0, maxX: 10, maxY: 8 });
  });

  it("unions several rings", () => {
    expect(contentBBox([square, far])).toEqual({ minX: 0, minY: 0, maxX: 110, maxY: 108 });
  });

  it("includes the extra box, which is how the underlay gets framed", () => {
    expect(contentBBox([square], { minX: -5, minY: -5, maxX: 5, maxY: 5 }))
      .toEqual({ minX: -5, minY: -5, maxX: 10, maxY: 8 });
  });

  it("returns the extra box alone when there is no geometry yet", () => {
    const only = { minX: 0, minY: 0, maxX: 200, maxY: 150 };
    expect(contentBBox([], only)).toEqual(only);
  });

  it("returns an empty box when there is nothing at all", () => {
    expect(hasArea(contentBBox([], null))).toBe(false);
  });
});

describe("hasArea", () => {
  it("is true for a real box", () => {
    expect(hasArea({ minX: 0, minY: 0, maxX: 1, maxY: 1 })).toBe(true);
  });

  it("is false for an inverted empty box", () => {
    expect(hasArea({ minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity })).toBe(false);
  });

  it("is false for a zero-area box, which cannot be fitted", () => {
    expect(hasArea({ minX: 5, minY: 5, maxX: 5, maxY: 5 })).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run packages/editor/src/plan/content.test.ts`
Expected: FAIL — cannot resolve `./content`.

- [ ] **Step 3: Implement**

`packages/editor/src/plan/content.ts`:

```ts
import type { BBox, Ring } from "@oth/model";
import { bboxOfRings, EMPTY_BBOX } from "@oth/model";

/**
 * What the canvas should frame: every footprint on the level, plus the underlay
 * if there is one. Without the underlay a level that has an image but no rooms
 * yet would frame nothing, which is exactly the state a teammate starts in.
 */
export function contentBBox(rings: readonly Ring[], extra: BBox | null = null): BBox {
  const rooms = rings.length > 0 ? bboxOfRings(rings) : EMPTY_BBOX;
  if (!extra) return rooms;
  return {
    minX: Math.min(rooms.minX, extra.minX),
    minY: Math.min(rooms.minY, extra.minY),
    maxX: Math.max(rooms.maxX, extra.maxX),
    maxY: Math.max(rooms.maxY, extra.maxY),
  };
}

export function hasArea(b: BBox): boolean {
  return Number.isFinite(b.minX) && Number.isFinite(b.minY) && b.maxX > b.minX && b.maxY > b.minY;
}
```

- [ ] **Step 4: Write the failing canvas test**

Append to `packages/editor/src/plan/PlanCanvas.test.tsx`:

```tsx
import { fitViewport } from "./viewport";

describe("framing", () => {
  it("frames the level's rooms on first render", () => {
    render(<PlanCanvas width={800} height={600} />);
    // The room spans 0..10 m; with the default viewport it renders above the
    // canvas entirely, which is what made the editor look empty.
    const vp = useEditorStore.getState().viewport;
    const [, sy] = [vp.originX, vp.originY - 5 * vp.scale];
    expect(sy).toBeGreaterThan(0);
    expect(sy).toBeLessThan(600);
  });

  it("re-frames when the level changes", () => {
    render(<PlanCanvas width={800} height={600} />);
    const first = useEditorStore.getState().viewport;
    useEditorStore.getState().setViewport({ ...first, originX: -9999 });
    useEditorStore.getState().setActiveLevel("oth-L1");
    expect(useEditorStore.getState().viewport.originX).not.toBe(-9999);
  });

  it("does not fight a manual pan on an unrelated re-render", () => {
    const { rerender } = render(<PlanCanvas width={800} height={600} />);
    useEditorStore.getState().setViewport({ originX: 123, originY: 456, scale: 7 });
    rerender(<PlanCanvas width={800} height={600} />);
    expect(useEditorStore.getState().viewport).toEqual({ originX: 123, originY: 456, scale: 7 });
  });
});
```

The third test is the one that matters. Refitting on every render would make the canvas snap back the instant you pan, which is worse than never fitting at all.

- [ ] **Step 5: Run it and watch it fail**

Run: `npx vitest run packages/editor/src/plan/PlanCanvas.test.tsx`
Expected: FAIL — the first test's `sy` is negative, because nothing fits the viewport.

- [ ] **Step 6: Implement the fitting effect**

In `PlanCanvas.tsx`, add the imports and an effect keyed on the level:

```tsx
import { useEffect, useRef } from "react";
import { contentBBox, hasArea } from "./content";
import { fitViewport, screenToWorld, worldToScreen, zoomViewport } from "./viewport";
```

```tsx
  // Fit once per level, not on every render: refitting continuously would snap
  // the canvas back the moment anyone panned.
  const fittedFor = useRef<string | null>(null);

  useEffect(() => {
    const levelId = state.activeLevelId;
    if (!levelId || fittedFor.current === levelId) return;
    const box = contentBBox(rings, null);
    if (!hasArea(box)) return;
    fittedFor.current = levelId;
    state.setViewport(fitViewport(box, width, height));
  }, [state.activeLevelId, rings, width, height, state]);
```

- [ ] **Step 7: Run the tests**

Run: `npx vitest run packages/editor/src/plan`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/editor/src/plan
git commit -m "fix(editor): frame the level's content instead of opening on empty space"
```

---

## Task 2: PNG and JPEG header parsing

**Files:**
- Create: `packages/server/src/images/inspect.ts`, `src/images/inspect.test.ts`

**Interfaces:**
- Produces: `readImageSize(bytes: Uint8Array): ImageInfo` where `ImageInfo = { format: "png" | "jpeg"; widthPx: number; heightPx: number }`; `InvalidImageError`; `IMAGE_MAX_BYTES`.

- [ ] **Step 1: Write the failing test**

`packages/server/src/images/inspect.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { InvalidImageError, readImageSize } from "./inspect";

/** A minimal but structurally real PNG header: signature + IHDR. */
function png(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13); // IHDR length
  bytes.set([0x49, 0x48, 0x44, 0x52], 12); // "IHDR"
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

/** SOI, a JFIF APP0 segment, then an SOF0 carrying the dimensions. */
function jpeg(width: number, height: number): Uint8Array {
  const bytes: number[] = [0xff, 0xd8];
  bytes.push(0xff, 0xe0, 0x00, 0x04, 0x00, 0x00); // APP0, length 4
  bytes.push(0xff, 0xc0, 0x00, 0x11, 0x08);       // SOF0, length 17, precision 8
  bytes.push((height >> 8) & 0xff, height & 0xff);
  bytes.push((width >> 8) & 0xff, width & 0xff);
  return new Uint8Array(bytes);
}

describe("readImageSize", () => {
  it("reads PNG dimensions", () => {
    expect(readImageSize(png(3000, 2121))).toEqual({ format: "png", widthPx: 3000, heightPx: 2121 });
  });

  it("reads JPEG dimensions", () => {
    expect(readImageSize(jpeg(3000, 2121))).toEqual({ format: "jpeg", widthPx: 3000, heightPx: 2121 });
  });

  it("skips JPEG segments before the frame header", () => {
    // The APP0 above is exactly such a segment; a parser that assumed SOF came
    // first would read its bytes as dimensions.
    expect(readImageSize(jpeg(640, 480)).widthPx).toBe(640);
  });

  it("rejects a file that is neither", () => {
    expect(() => readImageSize(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]))).toThrow(InvalidImageError);
  });

  it("rejects an empty upload", () => {
    expect(() => readImageSize(new Uint8Array())).toThrow(InvalidImageError);
  });

  it("rejects a truncated PNG rather than reading past the end", () => {
    expect(() => readImageSize(png(100, 100).slice(0, 20))).toThrow(InvalidImageError);
  });

  it("rejects a JPEG with no frame header", () => {
    expect(() => readImageSize(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]))).toThrow(InvalidImageError);
  });

  it("rejects zero dimensions", () => {
    expect(() => readImageSize(png(0, 100))).toThrow(InvalidImageError);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run packages/server/src/images`
Expected: FAIL — cannot resolve `./inspect`.

- [ ] **Step 3: Implement**

`packages/server/src/images/inspect.ts`:

```ts
export class InvalidImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidImageError";
  }
}

/** Comfortably fits a 300 DPI storey plan. */
export const IMAGE_MAX_BYTES = 20 * 1024 * 1024;

export type ImageInfo = { format: "png" | "jpeg"; widthPx: number; heightPx: number };

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Start-of-frame markers. Every other 0xFFxx segment carries a length we skip. */
const SOF_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7,
  0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);

function isPng(bytes: Uint8Array): boolean {
  return PNG_SIGNATURE.every((b, i) => bytes[i] === b);
}

function readPng(bytes: Uint8Array): ImageInfo {
  // Signature(8) + length(4) + "IHDR"(4) + width(4) + height(4)
  if (bytes.byteLength < 24) throw new InvalidImageError("truncated PNG header");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { format: "png", widthPx: view.getUint32(16), heightPx: view.getUint32(20) };
}

function readJpeg(bytes: Uint8Array): ImageInfo {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 2; // past SOI

  while (offset + 1 < bytes.byteLength) {
    if (bytes[offset] !== 0xff) {
      offset++;
      continue;
    }
    const marker = bytes[offset + 1]!;
    // Padding and standalone markers carry no length.
    if (marker === 0xff || marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    if (marker === 0xd9) break; // end of image
    if (offset + 3 >= bytes.byteLength) break;

    const length = view.getUint16(offset + 2);
    if (SOF_MARKERS.has(marker)) {
      if (offset + 9 > bytes.byteLength) throw new InvalidImageError("truncated JPEG frame header");
      return {
        format: "jpeg",
        heightPx: view.getUint16(offset + 5),
        widthPx: view.getUint16(offset + 7),
      };
    }
    if (length < 2) throw new InvalidImageError("malformed JPEG segment length");
    offset += 2 + length;
  }

  throw new InvalidImageError("no JPEG frame header found");
}

/**
 * Confirms the bytes really are a PNG or JPEG and reads their dimensions, by
 * parsing the header directly. Roughly forty lines against a dependency, and it
 * doubles as the upload's validation gate the way `inspectGlb` does for meshes.
 */
export function readImageSize(bytes: Uint8Array): ImageInfo {
  if (bytes.byteLength === 0) throw new InvalidImageError("empty upload");

  const info = isPng(bytes)
    ? readPng(bytes)
    : bytes[0] === 0xff && bytes[1] === 0xd8
      ? readJpeg(bytes)
      : null;

  if (!info) throw new InvalidImageError("not a PNG or JPEG file");
  if (info.widthPx <= 0 || info.heightPx <= 0) {
    throw new InvalidImageError("image reports zero width or height");
  }
  return info;
}
```

- [ ] **Step 4: Run and commit**

```bash
npx vitest run packages/server/src/images
git add packages/server/src/images
git commit -m "feat(server): parse PNG and JPEG headers to validate and size uploads"
```

---

## Task 3: The levelImages table

**Files:**
- Modify: `packages/server/src/db/schema.ts`
- Test: `packages/server/src/db/schema.test.ts` (append)

**Interfaces:**
- Produces: `levelImages` Drizzle table.

- [ ] **Step 1: Write the failing test**

Append to `packages/server/src/db/schema.test.ts`:

```ts
import { levelImages } from "./schema";

describe("levelImages", () => {
  it("round-trips an uncalibrated image", async () => {
    const db = await createTestDb();
    await db.insert(buildings).values({
      id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94, rotationDeg: 0,
    });
    await db.insert(levels).values({
      id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1,
      nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6,
    });
    await db.insert(levelImages).values({
      id: "img_1", levelId: "oth-L1", filename: "L1.jpg",
      storagePath: "images/ab/abc.jpg", checksum: "abc",
      widthPx: 3000, heightPx: 2121, sizeBytes: 1234,
    });

    const [row] = await db.select().from(levelImages).where(eq(levelImages.id, "img_1"));
    expect(row?.widthPx).toBe(3000);
    // Uncalibrated until someone measures against a known dimension.
    expect(row?.metresPerPixel).toBeNull();
    expect(row?.offsetX).toBe(0);
    expect(row?.opacity).toBeCloseTo(0.6);
    expect(row?.version).toBe(0);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run packages/server/src/db`
Expected: FAIL — `levelImages` is not exported.

- [ ] **Step 3: Implement**

Append to `packages/server/src/db/schema.ts`:

```ts
/**
 * The floorplan a level is traced over, with its calibration on the same row.
 *
 * Server-side rather than local because teammates must trace the same picture;
 * a local-only underlay would let two people draw against different images and
 * disagree silently. At most one live row per level — uploading a replacement
 * soft-deletes the previous one.
 */
export const levelImages = pgTable("level_images", {
  id: text("id").primaryKey(),
  levelId: text("level_id").notNull(),
  filename: text("filename").notNull(),
  storagePath: text("storage_path").notNull(),
  checksum: text("checksum").notNull(),
  widthPx: integer("width_px").notNull(),
  heightPx: integer("height_px").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  /** Null until someone measures a known dimension. */
  metresPerPixel: doublePrecision("metres_per_pixel"),
  /** World metres of the image's top-left pixel. */
  offsetX: doublePrecision("offset_x").notNull().default(0),
  offsetY: doublePrecision("offset_y").notNull().default(0),
  opacity: doublePrecision("opacity").notNull().default(0.6),
  uploadedBy: text("uploaded_by"),
  ...auditColumns,
}, t => ({ levelIdx: index("level_images_level_idx").on(t.levelId) }));
```

- [ ] **Step 4: Generate the migration, run, commit**

```bash
npm run db:generate --workspace @oth/server
npx vitest run packages/server/src/db
git add packages/server
git commit -m "feat(server): level_images table carrying calibration on the row"
```

---

## Task 4: Level image routes

**Files:**
- Create: `packages/server/src/images/routes.ts`, `src/images/routes.test.ts`
- Modify: `src/app.ts`

**Interfaces:**
- Produces: `GET /api/level-images`, `POST /api/level-images` (multipart `file` + `levelId`), `PATCH /api/level-images/:id`, `DELETE /api/level-images/:id`, `GET /api/level-images/:id/file`.

- [ ] **Step 1: Write the failing test**

`packages/server/src/images/routes.test.ts`:

```ts
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq, isNull } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { createUser } from "../auth/users";
import type { Database } from "../db/client";
import { buildings, levelImages, levels } from "../db/schema";
import { createTestDb, json } from "../testing/harness";

let db: Database;
let app: ReturnType<typeof createApp>;
let cookie: string;

function png(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

function upload(bytes: Uint8Array, levelId = "oth-L1", filename = "L1.png") {
  const form = new FormData();
  form.append("file", new Blob([bytes as BlobPart]), filename);
  form.append("levelId", levelId);
  return app.request("/api/level-images", { method: "POST", headers: { cookie }, body: form });
}

beforeEach(async () => {
  db = await createTestDb();
  app = createApp({ db, dataDir: await mkdtemp(join(tmpdir(), "oth-img-")) });
  await createUser(db, { email: "wei@example.com", password: "passphrase", displayName: "Wei" });
  cookie = (await app.request("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "wei@example.com", password: "passphrase" }),
  })).headers.get("set-cookie") ?? "";
  await db.insert(buildings).values({ id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94, rotationDeg: 0 });
  await db.insert(levels).values({
    id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1,
    nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6,
  });
});

describe("level image routes", () => {
  it("requires authentication", async () => {
    expect((await app.request("/api/level-images")).status).toBe(401);
  });

  it("accepts a PNG and records its dimensions", async () => {
    const res = await upload(png(3000, 2121));
    expect(res.status).toBe(201);
    const { image } = await json<{ image: Record<string, unknown> }>(res);
    expect(image.widthPx).toBe(3000);
    expect(image.heightPx).toBe(2121);
    expect(image.metresPerPixel).toBeNull();
    expect(image.uploadedBy).toMatch(/^user_/);
  });

  it("rejects a file that is not an image with 422, not 500", async () => {
    expect((await upload(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]))).status).toBe(422);
  });

  it("rejects an unknown level", async () => {
    expect((await upload(png(10, 10), "oth-L9")).status).toBe(422);
  });

  it("keeps only one live image per level", async () => {
    await upload(png(100, 100), "oth-L1", "first.png");
    await upload(png(200, 200), "oth-L1", "second.png");
    const live = await db.select().from(levelImages).where(isNull(levelImages.deletedAt));
    expect(live).toHaveLength(1);
    expect(live[0]?.filename).toBe("second.png");
  });

  it("stores calibration through a patch", async () => {
    const { image } = await json<{ image: { id: string; version: number } }>(await upload(png(100, 100)));
    const res = await app.request(`/api/level-images/${image.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ expectedVersion: 0, data: { metresPerPixel: 0.071, offsetX: 5, offsetY: -2 } }),
    });
    expect(res.status).toBe(200);
    const [row] = await db.select().from(levelImages).where(eq(levelImages.id, image.id));
    expect(row?.metresPerPixel).toBeCloseTo(0.071);
    expect(row?.offsetX).toBe(5);
    expect(row?.version).toBe(1);
  });

  it("409s a stale calibration patch", async () => {
    const { image } = await json<{ image: { id: string } }>(await upload(png(100, 100)));
    const patch = (expectedVersion: number) =>
      app.request(`/api/level-images/${image.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ expectedVersion, data: { metresPerPixel: 0.1 } }),
      });
    await patch(0);
    expect((await patch(0)).status).toBe(409);
  });

  it("serves the stored bytes back", async () => {
    const { image } = await json<{ image: { id: string } }>(await upload(png(100, 100)));
    const file = await app.request(`/api/level-images/${image.id}/file`, { headers: { cookie } });
    expect(file.status).toBe(200);
    expect(file.headers.get("content-type")).toBe("image/png");
  });

  it("lists only live images", async () => {
    await upload(png(100, 100), "oth-L1", "first.png");
    await upload(png(200, 200), "oth-L1", "second.png");
    const list = await app.request("/api/level-images", { headers: { cookie } });
    expect((await json<{ items: unknown[] }>(list)).items).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run packages/server/src/images/routes.test.ts`
Expected: FAIL — cannot resolve `./routes`.

- [ ] **Step 3: Implement**

`packages/server/src/images/routes.ts`:

```ts
import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../app";
import { requireUser } from "../auth/middleware";
import { readAsset, storeAsset } from "../assets/storage";
import { levelImages, levels } from "../db/schema";
import { IMAGE_MAX_BYTES, InvalidImageError, readImageSize } from "./inspect";

const PatchBody = z.object({
  expectedVersion: z.number().int().nonnegative(),
  data: z.object({
    metresPerPixel: z.number().positive().nullable().optional(),
    offsetX: z.number().finite().optional(),
    offsetY: z.number().finite().optional(),
    opacity: z.number().min(0).max(1).optional(),
  }),
});

const CONTENT_TYPE = { png: "image/png", jpeg: "image/jpeg" } as const;

export const levelImageRoutes = new Hono<AppEnv>();

levelImageRoutes.use("*", requireUser);

levelImageRoutes.get("/", async c =>
  c.json({ items: await c.get("db").select().from(levelImages).where(isNull(levelImages.deletedAt)) }),
);

levelImageRoutes.post("/", async c => {
  const db = c.get("db");
  const form = await c.req.formData().catch(() => null);
  const file = form?.get("file");
  const levelId = form?.get("levelId");

  if (!(file instanceof File) || typeof levelId !== "string") {
    return c.json({ error: "expected multipart fields 'file' and 'levelId'" }, 400);
  }

  const level = (await db.select().from(levels).where(eq(levels.id, levelId)))[0];
  if (!level) return c.json({ error: `no such level: ${levelId}` }, 422);

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.byteLength > IMAGE_MAX_BYTES) {
    return c.json({ error: `image exceeds the ${IMAGE_MAX_BYTES} byte budget` }, 422);
  }

  let info;
  try {
    info = readImageSize(bytes);
  } catch (err) {
    if (err instanceof InvalidImageError) return c.json({ error: err.message }, 422);
    throw err;
  }

  const stored = await storeAsset(c.get("dataDir"), bytes);
  const id = `img_${randomUUID()}`;

  // At most one live image per level: the previous one is retired here.
  await db.update(levelImages)
    .set({ deletedAt: new Date(), updatedBy: c.get("user").id, updatedAt: new Date() })
    .where(and(eq(levelImages.levelId, levelId), isNull(levelImages.deletedAt)));

  await db.insert(levelImages).values({
    id,
    levelId,
    filename: file.name,
    storagePath: stored.storagePath,
    checksum: stored.checksum,
    widthPx: info.widthPx,
    heightPx: info.heightPx,
    sizeBytes: bytes.byteLength,
    uploadedBy: c.get("user").id,
  });

  const [row] = await db.select().from(levelImages).where(eq(levelImages.id, id));
  return c.json({ image: row }, 201);
});

levelImageRoutes.patch("/:id", async c => {
  const db = c.get("db");
  const body = PatchBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: "expected { expectedVersion, data }" }, 400);

  const id = c.req.param("id");
  const updated = await db.update(levelImages)
    .set({ ...body.data.data, updatedBy: c.get("user").id, updatedAt: new Date() })
    .where(and(eq(levelImages.id, id), eq(levelImages.version, body.data.expectedVersion)))
    .returning();

  if (!updated[0]) {
    const [current] = await db.select().from(levelImages).where(eq(levelImages.id, id));
    if (!current) return c.json({ error: "not found" }, 404);
    return c.json({ error: "version conflict", current }, 409);
  }

  // Bump separately so the set above cannot be told to write version itself.
  const [row] = await db.update(levelImages)
    .set({ version: body.data.expectedVersion + 1 })
    .where(eq(levelImages.id, id))
    .returning();

  return c.json({ image: row });
});

levelImageRoutes.delete("/:id", async c => {
  const db = c.get("db");
  await db.update(levelImages)
    .set({ deletedAt: new Date(), updatedBy: c.get("user").id, updatedAt: new Date() })
    .where(eq(levelImages.id, c.req.param("id")));
  return c.body(null, 204);
});

levelImageRoutes.get("/:id/file", async c => {
  const db = c.get("db");
  const [row] = await db.select().from(levelImages).where(eq(levelImages.id, c.req.param("id")));
  if (!row) return c.json({ error: "not found" }, 404);
  const bytes = await readAsset(c.get("dataDir"), row.storagePath);
  const isPng = row.filename.toLowerCase().endsWith(".png") || row.storagePath.endsWith(".png");
  return c.body(bytes.buffer as ArrayBuffer, 200, {
    "content-type": isPng ? CONTENT_TYPE.png : CONTENT_TYPE.jpeg,
    "cache-control": "public, max-age=31536000, immutable",
  });
});
```

**Note on content type:** `storeAsset` names every file `.glb` because it was written for meshes. Task 4a fixes that.

- [ ] **Step 4: Make the store extension-aware (Task 4a)**

`storeAsset` currently hard-codes `.glb`. Give it an extension parameter so images are stored and served honestly.

Modify `packages/server/src/assets/storage.ts`:

```ts
export async function storeAsset(dataDir: string, bytes: Uint8Array, extension = "glb") {
  const checksum = createHash("sha256").update(bytes).digest("hex");
  const storagePath = join("assets", checksum.slice(0, 2), `${checksum}.${extension}`);
  const full = join(dataDir, storagePath);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, bytes);
  return { checksum, storagePath };
}
```

Add to `packages/server/src/assets/storage.test.ts`:

```ts
  it("defaults to a .glb extension, as meshes are the original caller", async () => {
    const a = await storeAsset(await dir(), new Uint8Array([1, 2, 3]));
    expect(a.storagePath.endsWith(".glb")).toBe(true);
  });

  it("honours an explicit extension so images are stored honestly", async () => {
    const a = await storeAsset(await dir(), new Uint8Array([1, 2, 3]), "png");
    expect(a.storagePath.endsWith(".png")).toBe(true);
  });
```

Then in `routes.ts`, store with the detected format and serve from it:

```ts
  const stored = await storeAsset(c.get("dataDir"), bytes, info.format === "png" ? "png" : "jpg");
```

and simplify the file route's content type:

```ts
  const isPng = row.storagePath.endsWith(".png");
```

- [ ] **Step 5: Mount and run**

In `src/app.ts`:

```ts
import { levelImageRoutes } from "./images/routes";
```

```ts
  app.route("/api/level-images", levelImageRoutes);
```

Mount it beside `/api/assets`, before the static catch-all.

```bash
npx vitest run packages/server
npm run typecheck
```

- [ ] **Step 6: Guard the bundle**

Level images must never be published. Add to `packages/server/src/publish/service.test.ts`:

```ts
  it("never puts a level image in the bundle", async () => {
    await seedPublishable();
    const result = await publish(db, dir, { createdBy: "user_1" });
    const files = await readdir(join(dir, "published", result.version));
    expect(files).not.toContain("levelImages.json");
    const building = await readFile(join(dir, "published", result.version, "building.json"), "utf8");
    expect(building).not.toContain("level_images");
  });
```

This passes already — `buildBundle` has no notion of level images — and exists so a later change cannot quietly start publishing them.

- [ ] **Step 7: Commit**

```bash
git add packages/server
git commit -m "feat(server): level image upload, calibration patch and serving"
```

---

## Task 5: Level images in the editor client and store

**Files:**
- Modify: `packages/editor/src/api/client.ts`, `src/api/client.test.ts`, `src/state/store.ts`, `src/state/store.test.ts`
- Create: `packages/editor/src/state/underlay.ts`, `src/state/underlay.test.ts`

**Interfaces:**
- Produces on the client: `LevelImage` type; `listLevelImages()`, `uploadLevelImage(levelId, file)`, `patchLevelImage(id, expectedVersion, data)`, `levelImageFileUrl(id)`.
- Store gains `levelImages: LevelImage[]`, `setLevelImages`.
- Produces: `imageForLevel(images, levelId): LevelImage | null`, `underlayBBox(image): BBox | null`, `imageCalibration(image): Calibration | null`.

- [ ] **Step 1: Write the failing test**

`packages/editor/src/state/underlay.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { LevelImage } from "../api/client";
import { imageCalibration, imageForLevel, underlayBBox } from "./underlay";

const base: LevelImage = {
  id: "img_1", levelId: "oth-L1", filename: "L1.png",
  widthPx: 1000, heightPx: 500, sizeBytes: 10,
  metresPerPixel: null, offsetX: 0, offsetY: 0, opacity: 0.6, version: 0,
};

describe("imageForLevel", () => {
  it("finds the image for a level", () => {
    expect(imageForLevel([base], "oth-L1")?.id).toBe("img_1");
  });

  it("returns null when the level has none", () => {
    expect(imageForLevel([base], "oth-L2")).toBeNull();
  });
});

describe("imageCalibration", () => {
  it("is null until the image has a scale", () => {
    expect(imageCalibration(base)).toBeNull();
  });

  it("becomes a calibration once scaled", () => {
    expect(imageCalibration({ ...base, metresPerPixel: 0.1, offsetX: 5, offsetY: -2 }))
      .toEqual({ metresPerPixel: 0.1, offsetX: 5, offsetY: -2 });
  });
});

describe("underlayBBox", () => {
  it("is null for an uncalibrated image, which has no size in metres yet", () => {
    expect(underlayBBox(base)).toBeNull();
  });

  it("spans the image in world metres, growing downward from the offset", () => {
    // 1000 x 500 px at 0.1 m/px is 100 x 50 m; image y grows down, world y is north.
    expect(underlayBBox({ ...base, metresPerPixel: 0.1 }))
      .toEqual({ minX: 0, minY: -50, maxX: 100, maxY: 0 });
  });

  it("applies the offset", () => {
    expect(underlayBBox({ ...base, metresPerPixel: 0.1, offsetX: 10, offsetY: 60 }))
      .toEqual({ minX: 10, minY: 10, maxX: 110, maxY: 60 });
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run packages/editor/src/state/underlay.test.ts`
Expected: FAIL — cannot resolve `./underlay`.

- [ ] **Step 3: Implement the client additions**

Add to `packages/editor/src/api/client.ts`:

```ts
export type LevelImage = {
  id: string;
  levelId: string;
  filename: string;
  widthPx: number;
  heightPx: number;
  sizeBytes: number;
  metresPerPixel: number | null;
  offsetX: number;
  offsetY: number;
  opacity: number;
  version: number;
};

export type LevelImagePatch = {
  metresPerPixel?: number | null;
  offsetX?: number;
  offsetY?: number;
  opacity?: number;
};
```

and inside the returned object:

```ts
    async listLevelImages(): Promise<LevelImage[]> {
      return (await request<{ items: LevelImage[] }>("/api/level-images")).items;
    },

    async uploadLevelImage(levelId: string, file: File): Promise<LevelImage> {
      const form = new FormData();
      form.append("file", file);
      form.append("levelId", levelId);
      // No content-type header: the browser must set the multipart boundary.
      const body = await request<{ image: LevelImage }>("/api/level-images", {
        method: "POST",
        body: form,
      });
      return body.image;
    },

    async patchLevelImage(id: string, expectedVersion: number, data: LevelImagePatch) {
      const body = await request<{ image: LevelImage }>(`/api/level-images/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ expectedVersion, data }),
      });
      return body.image;
    },

    levelImageFileUrl: (id: string) => `${base}/api/level-images/${id}/file`,
```

- [ ] **Step 4: Implement the selectors**

`packages/editor/src/state/underlay.ts`:

```ts
import type { BBox } from "@oth/model";
import type { LevelImage } from "../api/client";
import type { Calibration } from "../plan/calibration";

export function imageForLevel(
  images: readonly LevelImage[], levelId: string | null,
): LevelImage | null {
  if (!levelId) return null;
  return images.find(i => i.levelId === levelId) ?? null;
}

/** Null until someone has measured a known dimension on the image. */
export function imageCalibration(image: LevelImage | null): Calibration | null {
  if (!image || image.metresPerPixel == null) return null;
  return {
    metresPerPixel: image.metresPerPixel,
    offsetX: image.offsetX,
    offsetY: image.offsetY,
  };
}

/**
 * The image's extent in world metres. Image y grows downward while world y is
 * north, so the image hangs *below* its offset.
 */
export function underlayBBox(image: LevelImage | null): BBox | null {
  const cal = imageCalibration(image);
  if (!image || !cal) return null;
  const widthM = image.widthPx * cal.metresPerPixel;
  const heightM = image.heightPx * cal.metresPerPixel;
  return {
    minX: cal.offsetX,
    minY: cal.offsetY - heightM,
    maxX: cal.offsetX + widthM,
    maxY: cal.offsetY,
  };
}
```

- [ ] **Step 5: Extend the store**

In `packages/editor/src/state/store.ts` add to the state type, initial object and creator:

```ts
  levelImages: LevelImage[];
  setLevelImages: (i: LevelImage[]) => void;
```

```ts
  levelImages: [],
```

```ts
  setLevelImages: levelImages => set({ levelImages }),
```

with `import type { AssetRecord, LevelImage, SessionUser } from "../api/client";`.

Add to `packages/editor/src/state/store.test.ts`:

```ts
  it("holds level images and clears them on reset", () => {
    useEditorStore.getState().setLevelImages([
      { id: "img_1", levelId: "oth-L1", filename: "a.png", widthPx: 1, heightPx: 1,
        sizeBytes: 1, metresPerPixel: null, offsetX: 0, offsetY: 0, opacity: 0.6, version: 0 },
    ]);
    expect(useEditorStore.getState().levelImages).toHaveLength(1);
    useEditorStore.getState().reset();
    expect(useEditorStore.getState().levelImages).toEqual([]);
  });
```

- [ ] **Step 6: Load them in the saver**

In `packages/editor/src/state/save.ts`, extend `refresh` so the underlay arrives with the model:

```ts
  async function refresh(): Promise<void> {
    const [model, report, levelImages] = await Promise.all([
      api.getModel(),
      api.validate(),
      api.listLevelImages(),
    ]);
    store.getState().setModel(model);
    store.getState().setReport(report);
    store.getState().setLevelImages(levelImages);
  }
```

and add `listLevelImages: vi.fn(async () => [])` to the `fakeApi` in `save.test.ts`, plus:

```ts
  it("loads level images alongside the model", async () => {
    const image = { id: "img_1", levelId: "oth-L1", filename: "a.png", widthPx: 1, heightPx: 1,
      sizeBytes: 1, metresPerPixel: null, offsetX: 0, offsetY: 0, opacity: 0.6, version: 0 };
    await createSaver(fakeApi({ listLevelImages: vi.fn(async () => [image]) })).refresh();
    expect(useEditorStore.getState().levelImages).toEqual([image]);
  });
```

- [ ] **Step 7: Run and commit**

```bash
npx vitest run packages/editor
npm run typecheck
git add packages/editor
git commit -m "feat(editor): level images in the API client, store and refresh"
```

---

## Task 6: Render the underlay and frame it

**Files:**
- Modify: `packages/editor/src/plan/PlanCanvas.tsx`, `src/plan/Underlay.tsx`, `src/plan/PlanCanvas.test.tsx`

**Interfaces:**
- `PlanCanvas` renders the active level's underlay beneath the geometry and includes it when framing.

- [ ] **Step 1: Write the failing test**

Append to `packages/editor/src/plan/PlanCanvas.test.tsx`:

```tsx
const image = {
  id: "img_1", levelId: "oth-L1", filename: "L1.png",
  widthPx: 1000, heightPx: 500, sizeBytes: 10,
  metresPerPixel: 0.1, offsetX: 0, offsetY: 0, opacity: 0.6, version: 0,
};

describe("underlay", () => {
  it("renders the level's floorplan", () => {
    useEditorStore.getState().setLevelImages([image]);
    render(<PlanCanvas width={800} height={600} imageUrl={id => `/api/level-images/${id}/file`} />);
    expect(screen.getByTestId("underlay")).toBeTruthy();
  });

  it("renders no underlay for a level without one", () => {
    useEditorStore.getState().setLevelImages([{ ...image, levelId: "oth-L2" }]);
    render(<PlanCanvas width={800} height={600} imageUrl={id => `/x/${id}`} />);
    expect(screen.queryByTestId("underlay")).toBeNull();
  });

  it("does not render an uncalibrated image, which has no size in metres", () => {
    useEditorStore.getState().setLevelImages([{ ...image, metresPerPixel: null }]);
    render(<PlanCanvas width={800} height={600} imageUrl={id => `/x/${id}`} />);
    expect(screen.queryByTestId("underlay")).toBeNull();
  });

  it("draws the underlay behind the rooms", () => {
    useEditorStore.getState().setLevelImages([image]);
    const { container } = render(
      <PlanCanvas width={800} height={600} imageUrl={id => `/x/${id}`} />,
    );
    const nodes = Array.from(container.querySelectorAll("[data-testid]"));
    const underlay = nodes.findIndex(n => n.getAttribute("data-testid") === "underlay");
    const room = nodes.findIndex(n => n.getAttribute("data-testid") === "room-L1-a");
    expect(underlay).toBeLessThan(room);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run packages/editor/src/plan/PlanCanvas.test.tsx`
Expected: FAIL — no `underlay` test id.

- [ ] **Step 3: Give Underlay a test id and a width in metres**

Replace `packages/editor/src/plan/Underlay.tsx`:

```tsx
import type { Calibration } from "./calibration";
import { worldToScreen, type Viewport } from "./viewport";

/**
 * The reference floor plan, positioned by its calibration rather than eyeballed.
 * Rendered inside the same SVG as the geometry so it pans and zooms with it, and
 * before everything else so it sits behind the rooms.
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
      data-testid="underlay"
      href={src}
      x={x}
      y={y}
      width={widthPx * scale}
      height={heightPx * scale}
      opacity={opacity}
      style={{ pointerEvents: "none" }}
      preserveAspectRatio="none"
    />
  );
}
```

- [ ] **Step 4: Wire it into the canvas**

In `PlanCanvas.tsx`, add to the props type:

```tsx
  /** Resolves a level image id to a URL. */
  imageUrl?: (imageId: string) => string;
```

derive the underlay above the return:

```tsx
  const image = imageForLevel(state.levelImages, state.activeLevelId);
  const calibration = imageCalibration(image);
  const underlay = underlayBBox(image);
```

render it first inside the `<svg>`, before the surface rect:

```tsx
      {image && calibration && imageUrl && (
        <Underlay
          src={imageUrl(image.id)}
          calibration={calibration}
          viewport={state.viewport}
          widthPx={image.widthPx}
          heightPx={image.heightPx}
          opacity={image.opacity}
        />
      )}
```

and include it when framing, replacing the fitting effect's body:

```tsx
    const box = contentBBox(rings, underlay);
```

with imports:

```tsx
import { imageCalibration, imageForLevel, underlayBBox } from "../state/underlay";
import { Underlay } from "./Underlay";
```

Also change the fit key so uploading an image re-frames:

```tsx
  const fitKey = `${state.activeLevelId ?? ""}:${image?.id ?? ""}`;
  const fittedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!state.activeLevelId || fittedFor.current === fitKey) return;
    const box = contentBBox(rings, underlay);
    if (!hasArea(box)) return;
    fittedFor.current = fitKey;
    state.setViewport(fitViewport(box, width, height));
  }, [fitKey, state.activeLevelId, rings, underlay, width, height, state]);
```

Pass `imageUrl={api.levelImageFileUrl}` from `App.tsx`.

- [ ] **Step 5: Run and commit**

```bash
npx vitest run packages/editor
npm run typecheck
git add packages/editor
git commit -m "feat(editor): render the level's floorplan underlay and frame it"
```

---

## Task 7: The floorplan panel — upload, scale, position

**Files:**
- Create: `packages/editor/src/panels/FloorplanPanel.tsx`, `src/panels/FloorplanPanel.test.tsx`
- Modify: `src/state/store.ts` (calibration draft), `src/App.tsx`

**Interfaces:**
- Store gains `calibrationDraft: Vec2[] | null`, `beginCalibration()`, `pushCalibrationPoint(p)`, `clearCalibration()`.
- `FloorplanPanel` props `{ api: Api; saver: Saver }`.

- [ ] **Step 1: Extend the store**

Add to the state type, initial object and creator in `store.ts`:

```ts
  /** The two points of an in-progress scale measurement, in world metres. */
  calibrationDraft: Vec2[] | null;
  beginCalibration: () => void;
  pushCalibrationPoint: (p: Vec2) => void;
  clearCalibration: () => void;
```

```ts
  calibrationDraft: null,
```

```ts
  beginCalibration: () => set({ tool: "calibrate", calibrationDraft: [] }),
  pushCalibrationPoint: p =>
    set(state => ({ calibrationDraft: [...(state.calibrationDraft ?? []), p] })),
  clearCalibration: () => set({ calibrationDraft: null }),
```

and clear it in `setTool` alongside the drawing draft:

```ts
  setTool: tool => set({ tool, draft: null, calibrationDraft: tool === "calibrate" ? [] : null }),
```

- [ ] **Step 2: Write the failing test**

`packages/editor/src/panels/FloorplanPanel.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useEditorStore } from "../state/store";
import { FloorplanPanel } from "./FloorplanPanel";

const image = {
  id: "img_1", levelId: "oth-L1", filename: "L1.png",
  widthPx: 1000, heightPx: 500, sizeBytes: 10,
  metresPerPixel: null as number | null, offsetX: 0, offsetY: 0, opacity: 0.6, version: 0,
};

function deps(overrides: Record<string, unknown> = {}) {
  return {
    api: {
      uploadLevelImage: vi.fn(async () => image),
      patchLevelImage: vi.fn(async () => ({ ...image, metresPerPixel: 0.1, version: 1 })),
      ...overrides,
    } as never,
    saver: { refresh: vi.fn(async () => {}) } as never,
  };
}

beforeEach(() => {
  useEditorStore.getState().reset();
  useEditorStore.getState().setActiveLevel("oth-L1");
});

describe("FloorplanPanel", () => {
  it("prompts for a floorplan when the level has none", () => {
    render(<FloorplanPanel {...deps()} />);
    expect(screen.getByLabelText(/add a floorplan/i)).toBeTruthy();
  });

  it("uploads for the active level", async () => {
    const d = deps();
    render(<FloorplanPanel {...d} />);
    fireEvent.change(screen.getByLabelText(/add a floorplan/i), {
      target: { files: [new File([new Uint8Array([1])], "L1.png")] },
    });
    await waitFor(() =>
      expect((d.api as unknown as { uploadLevelImage: { mock: { calls: unknown[][] } } })
        .uploadLevelImage.mock.calls[0]![0]).toBe("oth-L1"),
    );
  });

  it("reports a rejected upload in the server's own words", async () => {
    const d = deps({ uploadLevelImage: vi.fn(async () => { throw new Error("not a PNG or JPEG file"); }) });
    render(<FloorplanPanel {...d} />);
    fireEvent.change(screen.getByLabelText(/add a floorplan/i), {
      target: { files: [new File([new Uint8Array([1])], "notes.txt")] },
    });
    await waitFor(() => expect(useEditorStore.getState().status).toMatch(/not a PNG or JPEG/));
  });

  it("asks for the scale once an image exists", () => {
    useEditorStore.getState().setLevelImages([image]);
    render(<FloorplanPanel {...deps()} />);
    expect(screen.getByRole("button", { name: /set the scale/i })).toBeTruthy();
  });

  it("starts a measurement when the scale button is pressed", () => {
    useEditorStore.getState().setLevelImages([image]);
    render(<FloorplanPanel {...deps()} />);
    fireEvent.click(screen.getByRole("button", { name: /set the scale/i }));
    expect(useEditorStore.getState().tool).toBe("calibrate");
    expect(useEditorStore.getState().calibrationDraft).toEqual([]);
  });

  it("saves the scale once two points and a distance are given", async () => {
    const d = deps();
    useEditorStore.getState().setLevelImages([image]);
    useEditorStore.getState().beginCalibration();
    // Two points 100 world units apart on an uncalibrated image, which the
    // canvas reports in raw units until a scale exists.
    useEditorStore.getState().pushCalibrationPoint([0, 0]);
    useEditorStore.getState().pushCalibrationPoint([100, 0]);
    render(<FloorplanPanel {...d} />);
    fireEvent.change(screen.getByLabelText(/real distance/i), { target: { value: "20" } });
    fireEvent.click(screen.getByRole("button", { name: /apply scale/i }));
    await waitFor(() =>
      expect((d.api as unknown as { patchLevelImage: { mock: { calls: unknown[][] } } })
        .patchLevelImage.mock.calls).toHaveLength(1),
    );
  });

  it("refuses a measurement with no length rather than dividing by zero", async () => {
    const d = deps();
    useEditorStore.getState().setLevelImages([image]);
    useEditorStore.getState().beginCalibration();
    useEditorStore.getState().pushCalibrationPoint([5, 5]);
    useEditorStore.getState().pushCalibrationPoint([5, 5]);
    render(<FloorplanPanel {...d} />);
    fireEvent.change(screen.getByLabelText(/real distance/i), { target: { value: "20" } });
    fireEvent.click(screen.getByRole("button", { name: /apply scale/i }));
    await waitFor(() => expect(useEditorStore.getState().status).toMatch(/length/i));
  });

  it("shows the current scale once calibrated", () => {
    useEditorStore.getState().setLevelImages([{ ...image, metresPerPixel: 0.071 }]);
    render(<FloorplanPanel {...deps()} />);
    expect(screen.getByText(/0\.071/)).toBeTruthy();
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

Run: `npx vitest run packages/editor/src/panels/FloorplanPanel.test.tsx`
Expected: FAIL — cannot resolve `./FloorplanPanel`.

- [ ] **Step 4: Implement**

`packages/editor/src/panels/FloorplanPanel.tsx`:

```tsx
import { useState } from "react";
import type { Api } from "../api/client";
import { CalibrationError, calibrationFromMeasurement } from "../plan/calibration";
import type { Saver } from "../state/save";
import { useEditorStore } from "../state/store";
import { imageForLevel } from "../state/underlay";

export function FloorplanPanel({ api, saver }: { api: Api; saver: Saver }) {
  const activeLevelId = useEditorStore(s => s.activeLevelId);
  const levelImages = useEditorStore(s => s.levelImages);
  const draft = useEditorStore(s => s.calibrationDraft);
  const beginCalibration = useEditorStore(s => s.beginCalibration);
  const clearCalibration = useEditorStore(s => s.clearCalibration);
  const setStatus = useEditorStore(s => s.setStatus);
  const [metres, setMetres] = useState("");

  const image = imageForLevel(levelImages, activeLevelId);

  async function upload(file: File) {
    if (!activeLevelId) return;
    try {
      await api.uploadLevelImage(activeLevelId, file);
      setStatus(`Added ${file.name}. Now set the scale.`);
      await saver.refresh();
    } catch (err) {
      // Header-validation rejections arrive here; show the server's own words.
      setStatus(err instanceof Error ? err.message : String(err));
    }
  }

  async function applyScale() {
    if (!image || !draft || draft.length < 2) return;
    try {
      const { metresPerPixel: perUnit } = calibrationFromMeasurement(
        draft[0]!, draft[draft.length - 1]!, Number.parseFloat(metres),
      );
      // The canvas reports world units; before calibration one unit is one
      // pixel, so this ratio is already metres per pixel.
      await api.patchLevelImage(image.id, image.version, { metresPerPixel: perUnit });
      clearCalibration();
      setStatus(`Scale set to ${perUnit.toFixed(4)} m per pixel.`);
      await saver.refresh();
    } catch (err) {
      if (err instanceof CalibrationError) {
        setStatus(err.message);
        return;
      }
      setStatus(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="space-y-3 border-b p-3 text-sm">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-stone-500">Floorplan</h2>

      {!image && (
        <label className="block cursor-pointer text-xs text-stone-600">
          Add a floorplan
          <input
            aria-label="Add a floorplan"
            type="file"
            accept="image/png,image/jpeg"
            className="mt-1 block w-full text-xs"
            onChange={e => {
              const file = e.target.files?.[0];
              if (file) void upload(file);
            }}
          />
        </label>
      )}

      {image && (
        <>
          <div className="text-xs text-stone-600">{image.filename}</div>
          <div className="text-xs text-stone-500">
            {image.metresPerPixel == null
              ? "Not scaled yet."
              : `${image.metresPerPixel.toFixed(4)} m per pixel`}
          </div>

          <button
            className="w-full rounded border px-2 py-1"
            onClick={() => beginCalibration()}
          >
            Set the scale
          </button>

          {draft && (
            <div className="space-y-2 rounded bg-stone-100 p-2">
              <p className="text-xs text-stone-600">
                {draft.length < 2
                  ? `Click two points on something you know the length of (${draft.length}/2).`
                  : "Now type how far apart those points really are."}
              </p>
              <label className="block text-xs">
                Real distance (metres)
                <input
                  aria-label="Real distance in metres"
                  className="mt-1 w-full rounded border px-2 py-1"
                  inputMode="decimal"
                  value={metres}
                  onChange={e => setMetres(e.target.value)}
                />
              </label>
              <button
                className="w-full rounded bg-stone-800 py-1 text-white disabled:opacity-40"
                disabled={draft.length < 2}
                onClick={() => void applyScale()}
              >
                Apply scale
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Handle the calibrate tool on the canvas**

In `PlanCanvas.tsx`'s `onSurfaceClick`, before the drawing branch:

```tsx
    if (state.tool === "calibrate") {
      // Raw world point, unsnapped: you are measuring the image, not the geometry.
      const rect = svgRef.current?.getBoundingClientRect();
      const raw = screenToWorld(state.viewport, [
        event.clientX - (rect?.left ?? 0),
        event.clientY - (rect?.top ?? 0),
      ]);
      if ((state.calibrationDraft?.length ?? 0) >= 2) state.beginCalibration();
      state.pushCalibrationPoint(raw);
      return;
    }
```

and render the measurement line after the draft polyline:

```tsx
      {state.calibrationDraft && state.calibrationDraft.length > 0 && (
        <polyline
          data-testid="calibration-line"
          points={ringPoints(state.calibrationDraft)}
          fill="none"
          stroke="#2563eb"
          strokeWidth={2}
          strokeDasharray="6 4"
        />
      )}
```

- [ ] **Step 6: Mount the panel**

In `App.tsx`, add `import { FloorplanPanel } from "./panels/FloorplanPanel";` and render it at the top of the right sidebar's scrolling area, above `Inspector`:

```tsx
            <FloorplanPanel api={api} saver={saver} />
```

- [ ] **Step 7: Run everything and commit**

```bash
npm test
npm run typecheck
npm run build --workspace @oth/editor
git add packages/editor
git commit -m "feat(editor): floorplan upload and two-click scale calibration"
```

---

## Task 8: Position the underlay

**Files:**
- Modify: `packages/editor/src/panels/FloorplanPanel.tsx`, `src/panels/FloorplanPanel.test.tsx`

**Interfaces:**
- Adds numeric offset and opacity controls, saved through `patchLevelImage`.

- [ ] **Step 1: Write the failing test**

Append to `FloorplanPanel.test.tsx`:

```tsx
describe("positioning", () => {
  const scaled = { ...image, metresPerPixel: 0.1 };

  it("offers offsets once the image is scaled", () => {
    useEditorStore.getState().setLevelImages([scaled]);
    render(<FloorplanPanel {...deps()} />);
    expect(screen.getByLabelText(/east/i)).toBeTruthy();
    expect(screen.getByLabelText(/north/i)).toBeTruthy();
  });

  it("hides offsets until there is a scale, since metres are meaningless before then", () => {
    useEditorStore.getState().setLevelImages([image]);
    render(<FloorplanPanel {...deps()} />);
    expect(screen.queryByLabelText(/east/i)).toBeNull();
  });

  it("saves an offset change", async () => {
    const d = deps();
    useEditorStore.getState().setLevelImages([scaled]);
    render(<FloorplanPanel {...d} />);
    fireEvent.change(screen.getByLabelText(/east/i), { target: { value: "12.5" } });
    fireEvent.blur(screen.getByLabelText(/east/i));
    await waitFor(() => {
      const calls = (d.api as unknown as { patchLevelImage: { mock: { calls: unknown[][] } } })
        .patchLevelImage.mock.calls;
      expect(calls[0]![2]).toMatchObject({ offsetX: 12.5 });
    });
  });

  it("ignores a non-numeric offset rather than writing NaN", async () => {
    const d = deps();
    useEditorStore.getState().setLevelImages([scaled]);
    render(<FloorplanPanel {...d} />);
    fireEvent.change(screen.getByLabelText(/east/i), { target: { value: "abc" } });
    fireEvent.blur(screen.getByLabelText(/east/i));
    expect((d.api as unknown as { patchLevelImage: { mock: { calls: unknown[][] } } })
      .patchLevelImage.mock.calls).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run packages/editor/src/panels/FloorplanPanel.test.tsx`
Expected: FAIL — no east/north controls.

- [ ] **Step 3: Implement**

Add to `FloorplanPanel.tsx`, inside the `image &&` block after the scale button:

```tsx
          {image.metresPerPixel != null && (
            <div className="space-y-2">
              <p className="text-xs text-stone-500">
                Position the image so it lines up with the floor below.
              </p>
              <div className="flex gap-2">
                <label className="block flex-1 text-xs">
                  East (m)
                  <input
                    aria-label="East offset in metres"
                    className="mt-1 w-full rounded border px-2 py-1"
                    inputMode="decimal"
                    defaultValue={image.offsetX}
                    onBlur={e => void saveOffset({ offsetX: Number.parseFloat(e.target.value) })}
                  />
                </label>
                <label className="block flex-1 text-xs">
                  North (m)
                  <input
                    aria-label="North offset in metres"
                    className="mt-1 w-full rounded border px-2 py-1"
                    inputMode="decimal"
                    defaultValue={image.offsetY}
                    onBlur={e => void saveOffset({ offsetY: Number.parseFloat(e.target.value) })}
                  />
                </label>
              </div>
              <label className="block text-xs">
                Opacity
                <input
                  aria-label="Underlay opacity"
                  type="range"
                  min={0.1}
                  max={1}
                  step={0.05}
                  defaultValue={image.opacity}
                  className="mt-1 w-full"
                  onMouseUp={e =>
                    void saveOffset({ opacity: Number.parseFloat((e.target as HTMLInputElement).value) })
                  }
                />
              </label>
            </div>
          )}
```

and the handler above the return:

```tsx
  async function saveOffset(patch: { offsetX?: number; offsetY?: number; opacity?: number }) {
    if (!image) return;
    // A blur on a half-typed value must not write NaN into the calibration.
    if (Object.values(patch).some(v => v === undefined || Number.isNaN(v))) return;
    try {
      await api.patchLevelImage(image.id, image.version, patch);
      await saver.refresh();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    }
  }
```

- [ ] **Step 4: Run everything and commit**

```bash
npm test
npm run typecheck
npm run build --workspace @oth/editor
git add packages/editor
git commit -m "feat(editor): position and fade the floorplan underlay"
```

---

## Done criteria

- `npm test` green, `npm run typecheck` clean, editor builds.
- Opening a level frames its content; the canvas is never blank when data exists.
- A teammate can upload a PNG or JPEG floorplan for a level, click two points, type a distance, and see the image appear correctly scaled behind the geometry.
- Everyone sees the same underlay, because it lives on the server.
- A non-image upload is refused with a message that says why.
- Level images never appear in a published bundle.
