# Survey Labelling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the walkthrough footage into a named, categorised tenant catalogue and an adjacency graph, with every claim carrying the frame it came from — before any floorplan exists.

**Architecture:** Four new entities (capture, keyframe, place, sighting) join the model as an evidence layer, generic CRUD through the existing registry, keyframe bytes through the existing content-addressed image store. The video is never uploaded: the browser extracts frames to JPEG and posts only those. Adjacency is derived by pure functions over sightings, and binding a place to a room is what lets the graph and the geometry disagree out loud.

**Tech Stack:** TypeScript, Zod, Drizzle, Hono, React, Zustand, Vitest. No new dependencies — routing is a 30-line hook, not a router.

**Spec:** [`docs/design-and-plans/specs/2026-09-05-survey-labelling-design.md`](../specs/2026-09-05-survey-labelling-design.md)

## Global Constraints

- **Survey data never ships to visitors.** `buildBundle` picks entities explicitly; do not add these four, and assert it.
- **The video is never uploaded.** Only extracted JPEG frames reach the server.
- Keyframes reuse `storeAsset` / `readAsset` and `readImageSize`, including the existing **20 MB** budget.
- A place has **no coordinates**. Position comes only from the room it binds to.
- All three disagreement rules are **warnings, never errors** — each is a question for a human.
- Run `npm run typecheck` as its own step and read it **before** committing.
- Stage explicit paths. Never `git add -A` — `docs/OTH_Project_Plan.*` and `docs/figures/` are the user's and must stay untracked.

---

## File Structure

| File | Responsibility |
|---|---|
| `packages/model/src/schema/survey.ts` | capture, keyframe, place, sighting schemas |
| `packages/model/src/survey/graph.ts` | `coVisiblePairs`, `sequentialPairs` — pure |
| `packages/model/src/validation/rules/survey.ts` | `place.unbound`, `place.adjacencyBroken`, `room.unsurveyed` |
| `packages/server/src/db/schema.ts` | four tables |
| `packages/server/src/survey/routes.ts` | keyframe upload and file serving |
| `packages/editor/src/route.ts` | `useRoute` / `navigate` — pathname, no dependency |
| `packages/editor/src/survey/frames.ts` | pure: frame naming, filmstrip ordering |
| `packages/editor/src/survey/CaptureVideo.tsx` | local file → `<video>` → canvas → JPEG blob |
| `packages/editor/src/survey/SurveyApp.tsx` | the `/survey` shell: captures, frame, places |
| `packages/editor/src/survey/PlaceTagger.tsx` | box drag + naming with autocomplete |

---

## Task 1: The survey entities

**Files:**
- Create: `packages/model/src/schema/survey.ts`, `src/schema/survey.test.ts`
- Modify: `packages/model/src/schema/model.ts`, `src/index.ts`
- Test: `packages/model/src/bundle/build.test.ts`

**Interfaces:**
- Produces: `CaptureSchema`, `KeyframeSchema`, `PlaceSchema`, `SightingSchema`, `BoxSchema`; `MapModel` gains `captures`, `keyframes`, `places`, `sightings`.

- [ ] **Step 1: Write the failing tests**

`packages/model/src/schema/survey.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { CaptureSchema, KeyframeSchema, PlaceSchema, SightingSchema } from "./survey";

describe("capture", () => {
  it("accepts a video with a duration", () => {
    const c = CaptureSchema.parse({ id: "cap_1", kind: "video", filename: "L1.mp4", durationMs: 90_000 });
    expect(c.kind).toBe("video");
  });

  it("accepts a photo set, which has no duration", () => {
    expect(() => CaptureSchema.parse({ id: "cap_2", kind: "photos", filename: "L3 photos" })).not.toThrow();
  });

  it("rejects a capture with no filename to recognise it by", () => {
    expect(() => CaptureSchema.parse({ id: "cap_3", kind: "video", filename: "" })).toThrow();
  });
});

describe("place", () => {
  it("needs a name, since naming is the whole point", () => {
    expect(() => PlaceSchema.parse({ id: "pl_1", nameEn: "", category: "retail" })).toThrow();
  });

  it("is unbound until a room claims it", () => {
    expect(PlaceSchema.parse({ id: "pl_1", nameEn: "NTUC", category: "retail" }).roomId).toBeUndefined();
  });

  it("takes a tenant category, so the catalogue lands without translation", () => {
    expect(() => PlaceSchema.parse({ id: "pl_1", nameEn: "X", category: "wormhole" })).toThrow();
  });
});

describe("sighting", () => {
  it("may carry no box, when the whole frame is the thing", () => {
    expect(SightingSchema.parse({ id: "s1", placeId: "pl_1", keyframeId: "kf_1" }).box).toBeUndefined();
  });

  it("takes a box in image fractions, so it survives any resize", () => {
    const s = SightingSchema.parse({
      id: "s1", placeId: "pl_1", keyframeId: "kf_1", box: { x: 0.1, y: 0.2, w: 0.3, h: 0.4 },
    });
    expect(s.box?.w).toBe(0.3);
  });

  it("rejects a box outside the frame", () => {
    expect(() => SightingSchema.parse({
      id: "s1", placeId: "pl_1", keyframeId: "kf_1", box: { x: 0.9, y: 0, w: 0.5, h: 0.1 },
    })).toThrow();
  });
});

describe("keyframe", () => {
  it("carries the moment it came from", () => {
    expect(KeyframeSchema.parse({
      id: "kf_1", captureId: "cap_1", timeMs: 4200, imageId: "img_1", widthPx: 1920, heightPx: 1080,
    }).timeMs).toBe(4200);
  });

  it("has no time when it is an uploaded photo", () => {
    expect(KeyframeSchema.parse({
      id: "kf_1", captureId: "cap_2", imageId: "img_1", widthPx: 4032, heightPx: 3024,
    }).timeMs).toBeUndefined();
  });
});
```

Append to `packages/model/src/bundle/build.test.ts`:

```ts
it("never ships survey evidence to visitors", () => {
  // Photographs of the building's interior are internal working material, and
  // the bundle is public. Everything survey-related stays server-side.
  const files = buildBundle(modelWithSurvey, meta);
  const all = files.map(f => f.contents).join("");
  expect(all).not.toContain("sighting");
  expect(all).not.toContain("keyframe");
});
```

- [ ] **Step 2: Run and watch them fail**

Run: `npx vitest run packages/model`
Expected: FAIL — no `./survey` module.

- [ ] **Step 3: Write the schemas**

`packages/model/src/schema/survey.ts`:

```ts
import { z } from "zod";
import { AuditFieldsSchema, SlugSchema } from "../primitives";
import { TenantCategorySchema } from "./semantics";

/**
 * The evidence layer: what was filmed, what was seen in it, and what it was
 * called. Authored before any floorplan exists, so nothing here has coordinates
 * and nothing here is required to reference a room.
 */

export const CaptureKindSchema = z.enum(["video", "photos"]);

export const CaptureSchema = AuditFieldsSchema.extend({
  id: SlugSchema,
  kind: CaptureKindSchema,
  /** How a teammate recognises the source file when asked for it again. */
  filename: z.string().min(1),
  durationMs: z.number().nonnegative().optional(),
  /** Best guess at the floor filmed. Optional — some walkthroughs cross floors. */
  levelId: SlugSchema.optional(),
  notes: z.string().default(""),
});

export const KeyframeSchema = AuditFieldsSchema.extend({
  id: SlugSchema,
  captureId: SlugSchema,
  /** Absent for an uploaded photo, which came from no timeline. */
  timeMs: z.number().nonnegative().optional(),
  imageId: SlugSchema,
  widthPx: z.number().int().positive(),
  heightPx: z.number().int().positive(),
});

/** Fractions of the frame, so a box survives any resize or re-encode. */
export const BoxSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  w: z.number().min(0).max(1),
  h: z.number().min(0).max(1),
}).refine(b => b.x + b.w <= 1 && b.y + b.h <= 1, "box extends outside the frame");

export const PlaceSchema = AuditFieldsSchema.extend({
  id: SlugSchema,
  nameEn: z.string().min(1),
  nameZh: z.string().default(""),
  category: TenantCategorySchema,
  levelId: SlugSchema.optional(),
  /** Empty until someone binds this to a traced room. */
  roomId: SlugSchema.optional(),
  notes: z.string().default(""),
});

export const SightingSchema = AuditFieldsSchema.extend({
  id: SlugSchema,
  placeId: SlugSchema,
  keyframeId: SlugSchema,
  /** Absent when the whole frame is the thing; a box says which of two shops. */
  box: BoxSchema.optional(),
});

export type Capture = z.infer<typeof CaptureSchema>;
export type Keyframe = z.infer<typeof KeyframeSchema>;
export type Place = z.infer<typeof PlaceSchema>;
export type Sighting = z.infer<typeof SightingSchema>;
export type Box = z.infer<typeof BoxSchema>;
```

- [ ] **Step 4: Add them to the model**

In `packages/model/src/schema/model.ts`, import the four and add to `MapModelSchema`:

```ts
  captures: z.array(CaptureSchema).default([]),
  keyframes: z.array(KeyframeSchema).default([]),
  places: z.array(PlaceSchema).default([]),
  sightings: z.array(SightingSchema).default([]),
```

Add `export * from "./schema/survey";` to `packages/model/src/index.ts`. Leave `bundle/build.ts` alone — it names every entity it writes, so the four stay out by construction, which is what the new test locks.

- [ ] **Step 5: Run and commit**

```bash
npx vitest run packages/model
npm run typecheck
git add packages/model/src/schema/survey.ts packages/model/src/schema/survey.test.ts packages/model/src/schema/model.ts packages/model/src/index.ts packages/model/src/bundle/build.test.ts
git commit -m "feat(model): the survey layer — captures, keyframes, places, sightings"
```

---

## Task 2: Survey entities on the server

**Files:**
- Modify: `packages/server/src/db/schema.ts`, `src/entities/registry.ts`, `src/model/assemble.ts`
- Create: `packages/server/src/survey/routes.ts`, `src/survey/routes.test.ts`
- Modify: `packages/server/src/app.ts`

**Interfaces:**
- Consumes: the four schemas (Task 1).
- Produces: `POST /api/keyframes` (multipart `file` + `captureId` + optional `timeMs`) → `{ keyframe }`; `GET /api/keyframes/:id/file` → the JPEG. The other three go through `/api/entities/:type` unchanged.

- [ ] **Step 1: Write the failing tests**

`packages/server/src/survey/routes.test.ts`, following `images/routes.test.ts` for setup (a signed-in cookie and a `pngBytes()` helper):

```ts
it("stores a keyframe and returns its size", async () => {
  await post("/api/entities/capture", { data: { id: "cap_1", kind: "video", filename: "L1.mp4" } });
  const form = new FormData();
  form.append("file", new Blob([pngBytes(640, 480)], { type: "image/png" }), "frame.png");
  form.append("captureId", "cap_1");
  form.append("timeMs", "4200");
  const res = await app.request("/api/keyframes", { method: "POST", body: form, headers: { cookie } });
  expect(res.status).toBe(201);
  const body = await json<{ keyframe: { widthPx: number; timeMs: number } }>(res);
  expect(body.keyframe.widthPx).toBe(640);
  expect(body.keyframe.timeMs).toBe(4200);
});

it("refuses a keyframe for a capture that does not exist", async () => { /* 422 */ });
it("refuses a file that is not an image", async () => { /* 422 */ });
it("requires authentication", async () => { /* 401 without cookie */ });
it("serves the stored frame back", async () => { /* GET .../file is 200, image/* */ });
it("creates a place through the generic entity route", async () => { /* 201 */ });
```

- [ ] **Step 2: Run and watch them fail**

Run: `npx vitest run packages/server/src/survey`
Expected: FAIL — no such route, and `capture` is not an entity type.

- [ ] **Step 3: The four tables**

In `packages/server/src/db/schema.ts`, following `pathways` for shape and `...auditColumns`:

```ts
export const captures = pgTable("captures", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull(),
  filename: text("filename").notNull(),
  durationMs: integer("duration_ms"),
  levelId: text("level_id"),
  notes: text("notes").notNull().default(""),
  ...auditColumns,
});

export const keyframes = pgTable("keyframes", {
  id: text("id").primaryKey(),
  captureId: text("capture_id").notNull(),
  timeMs: integer("time_ms"),
  imageId: text("image_id").notNull(),
  storagePath: text("storage_path").notNull(),
  checksum: text("checksum").notNull(),
  widthPx: integer("width_px").notNull(),
  heightPx: integer("height_px").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  ...auditColumns,
}, t => ({ captureIdx: index("keyframes_capture_idx").on(t.captureId) }));

export const places = pgTable("places", {
  id: text("id").primaryKey(),
  nameEn: text("name_en").notNull(),
  nameZh: text("name_zh").notNull().default(""),
  category: text("category").notNull(),
  levelId: text("level_id"),
  roomId: text("room_id"),
  notes: text("notes").notNull().default(""),
  ...auditColumns,
});

export const sightings = pgTable("sightings", {
  id: text("id").primaryKey(),
  placeId: text("place_id").notNull(),
  keyframeId: text("keyframe_id").notNull(),
  box: jsonb("box").$type<{ x: number; y: number; w: number; h: number }>(),
  ...auditColumns,
}, t => ({ placeIdx: index("sightings_place_idx").on(t.placeId) }));
```

`storagePath`, `checksum` and `sizeBytes` are server-only bookkeeping and are not in `KeyframeSchema` — `toModelRow` already drops what the schema does not name.

Generate the migration:

```bash
cd packages/server && npx drizzle-kit generate
```

- [ ] **Step 4: Register three of the four**

In `packages/server/src/entities/registry.ts` add `"capture"`, `"place"`, `"sighting"` to `ENTITY_TYPES` and the registry. **Not `keyframe`** — a keyframe arrives as multipart bytes, not JSON, so it has its own route and generic CRUD would be a way to create one with no image behind it.

Mirror the three in `packages/editor/src/api/client.ts`'s `EntityType`.

- [ ] **Step 5: The keyframe route**

`packages/server/src/survey/routes.ts`, modelled closely on `images/routes.ts`:

```ts
surveyRoutes.post("/", async c => {
  const db = c.get("db");
  const form = await c.req.formData().catch(() => null);
  const file = form?.get("file");
  const captureId = form?.get("captureId");
  const timeMsRaw = form?.get("timeMs");

  if (!(file instanceof File) || typeof captureId !== "string") {
    return c.json({ error: "expected multipart fields 'file' and 'captureId'" }, 400);
  }

  const capture = (await db.select().from(captures).where(eq(captures.id, captureId)))[0];
  if (!capture) return c.json({ error: `no such capture: ${captureId}` }, 422);

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.byteLength > IMAGE_MAX_BYTES) {
    return c.json({ error: `frame exceeds the ${IMAGE_MAX_BYTES} byte budget` }, 422);
  }

  let info;
  try {
    info = readImageSize(bytes);
  } catch (err) {
    if (err instanceof InvalidImageError) return c.json({ error: err.message }, 422);
    throw err;
  }

  const stored = await storeAsset(c.get("dataDir"), bytes, info.format === "png" ? "png" : "jpg");
  const id = `kf_${randomUUID()}`;
  const timeMs = typeof timeMsRaw === "string" && timeMsRaw !== "" ? Number(timeMsRaw) : null;

  await db.insert(keyframes).values({
    id, captureId,
    timeMs: Number.isFinite(timeMs) ? timeMs : null,
    imageId: id,
    storagePath: stored.storagePath,
    checksum: stored.checksum,
    widthPx: info.widthPx,
    heightPx: info.heightPx,
    sizeBytes: bytes.byteLength,
    updatedBy: c.get("user").id,
  });

  const [row] = await db.select().from(keyframes).where(eq(keyframes.id, id));
  return c.json({ keyframe: toModelRow(row!) }, 201);
});
```

plus a `GET /:id/file` copied from the level-image file route, and `requireUser` on `*`.

Register in `app.ts`: `app.route("/api/keyframes", surveyRoutes);` before the static handler.

- [ ] **Step 6: Assemble them**

In `packages/server/src/model/assemble.ts`, add the four tables to the assembly exactly as `pathways` is done, mapping through `toModelRow`.

- [ ] **Step 7: Run and commit**

```bash
npx vitest run packages/server
npm run typecheck
git add packages/server/src packages/server/drizzle packages/editor/src/api/client.ts
git commit -m "feat(server): survey tables, keyframe upload, and assembly"
```

---

## Task 3: Adjacency, and the rules that let it disagree

**Files:**
- Create: `packages/model/src/survey/graph.ts`, `src/survey/graph.test.ts`, `src/validation/rules/survey.ts`, `src/validation/rules/survey.test.ts`
- Modify: `packages/model/src/validation/validate.ts`, `src/validation/types.ts`, `src/index.ts`

**Interfaces:**
- Produces:
  - `type Pair = { a: string; b: string }` — place ids, `a < b` so a pair is its own key.
  - `coVisiblePairs(model): Pair[]`, `sequentialPairs(model): Pair[]`
  - rules `place.unbound`, `place.adjacencyBroken`, `room.unsurveyed`
- `EntityType` in `validation/types.ts` gains `"place"`.

- [ ] **Step 1: Write the failing derivation tests**

`packages/model/src/survey/graph.test.ts`:

```ts
describe("coVisiblePairs", () => {
  it("pairs two places seen in the same frame", () => {
    expect(coVisiblePairs(model([s("a", "kf1"), s("b", "kf1")]))).toEqual([{ a: "a", b: "b" }]);
  });

  it("says nothing about places in different frames", () => {
    expect(coVisiblePairs(model([s("a", "kf1"), s("b", "kf2")]))).toEqual([]);
  });

  it("never pairs a place with itself, however often it is sighted", () => {
    expect(coVisiblePairs(model([s("a", "kf1"), s("a", "kf1")]))).toEqual([]);
  });

  it("reports a pair once however many frames show both", () => {
    const m = model([s("a", "kf1"), s("b", "kf1"), s("a", "kf2"), s("b", "kf2")]);
    expect(coVisiblePairs(m)).toHaveLength(1);
  });

  it("orders each pair, so a pair is its own key", () => {
    expect(coVisiblePairs(model([s("z", "kf1"), s("a", "kf1")]))[0]).toEqual({ a: "a", b: "z" });
  });

  it("ignores a soft-deleted sighting", () => { /* deletedAt set → [] */ });
});

describe("sequentialPairs", () => {
  it("pairs places in consecutive frames of one capture", () => {
    // You walked past one and then the other, so a route exists between them.
    expect(sequentialPairs(m)).toContainEqual({ a: "a", b: "b" });
  });

  it("orders frames by time, not by insertion", () => {
    // Frames are grabbed out of order whenever someone scrubs backwards.
  });

  it("does not pair across two different captures", () => { /* [] */ });

  it("does not pair across a gap of more than one frame", () => { /* kf1 and kf3 → [] */ });
});
```

- [ ] **Step 2: Run and watch fail**, then **Step 3: implement**

`packages/model/src/survey/graph.ts`:

```ts
import { live } from "../primitives";
import type { MapModel } from "../schema/model";

/** An unordered pair of place ids, normalised so it is its own key. */
export type Pair = { a: string; b: string };

const pair = (x: string, y: string): Pair => (x < y ? { a: x, b: y } : { a: y, b: x });
const key = (p: Pair) => `${p.a} ${p.b}`;

function dedupe(pairs: Pair[]): Pair[] {
  const seen = new Map<string, Pair>();
  for (const p of pairs) if (p.a !== p.b) seen.set(key(p), p);
  return [...seen.values()];
}

/**
 * Places seen in the same frame. You can see both at once, so they are near
 * each other and facing the same space — the strongest adjacency signal the
 * footage carries.
 */
export function coVisiblePairs(model: MapModel): Pair[] {
  const byFrame = new Map<string, string[]>();
  for (const s of live(model.sightings)) {
    byFrame.set(s.keyframeId, [...(byFrame.get(s.keyframeId) ?? []), s.placeId]);
  }

  const out: Pair[] = [];
  for (const places of byFrame.values()) {
    for (let i = 0; i < places.length; i++) {
      for (let j = i + 1; j < places.length; j++) out.push(pair(places[i]!, places[j]!));
    }
  }
  return dedupe(out);
}

/**
 * Places in consecutive frames of one capture.
 *
 * Weaker than co-visibility as evidence of adjacency, but it says something
 * co-visibility cannot: a walkable route exists between them, because a person
 * walked it while filming.
 */
export function sequentialPairs(model: MapModel): Pair[] {
  const frames = live(model.keyframes);
  const sightings = live(model.sightings);

  const byCapture = new Map<string, typeof frames>();
  for (const f of frames) byCapture.set(f.captureId, [...(byCapture.get(f.captureId) ?? []), f]);

  const placesIn = (keyframeId: string) =>
    sightings.filter(s => s.keyframeId === keyframeId).map(s => s.placeId);

  const out: Pair[] = [];
  for (const group of byCapture.values()) {
    // Frames are grabbed out of order the moment anyone scrubs backwards, so
    // the timeline is the order, not the insertion sequence.
    const ordered = [...group].sort((x, y) => (x.timeMs ?? 0) - (y.timeMs ?? 0));
    for (let i = 0; i + 1 < ordered.length; i++) {
      for (const a of placesIn(ordered[i]!.id)) {
        for (const b of placesIn(ordered[i + 1]!.id)) out.push(pair(a, b));
      }
    }
  }
  return dedupe(out);
}
```

- [ ] **Step 4: Write the failing rule tests**

`packages/model/src/validation/rules/survey.test.ts` — one passing and one failing case each for:

```ts
it("warns about a named place no room claims", () => { /* place.unbound */ });
it("says nothing once the place is bound", () => { /* not to contain */ });
it("warns when two co-visible places are bound to rooms far apart", () => { /* place.adjacencyBroken */ });
it("says nothing when the bound rooms are near each other", () => { /* not to contain */ });
it("says nothing while either place is unbound, since there is nothing to check", () => { /* … */ });
it("warns about a traced room nobody has surveyed", () => { /* room.unsurveyed */ });
it("never blocks a publish on any of the three", () => { expect(report.errorCount).toBe(0); });
```

- [ ] **Step 5: Implement the rules**

`packages/model/src/validation/rules/survey.ts`:

```ts
/** Co-visible places whose rooms are further apart than this have disagreed. */
export const CO_VISIBLE_MAX_M = 40;
```

`placeUnbound` warns for every live place with no `roomId`.
`roomUnsurveyed` warns for every live room of kind `room` or `area` with no place bound to it — details and voids are furniture and holes, and nobody surveys those.
`adjacencyBroken` walks `coVisiblePairs`, skips any pair where either place is unbound or its room is missing, and warns when the centroid distance between the two footprints exceeds `CO_VISIBLE_MAX_M`, naming both places and the distance.

All three `severity: "warning"`. Add `surveyRules` to `validate.ts`, and `"place"` to `EntityType`.

- [ ] **Step 6: Run and commit**

```bash
npx vitest run packages/model
npm run typecheck
git add packages/model/src/survey packages/model/src/validation packages/model/src/index.ts
git commit -m "feat(model): adjacency from co-visibility and sequence, and the rules that check it"
```

---

## Task 4: The /survey route and grabbing frames

**Files:**
- Create: `packages/editor/src/route.ts`, `src/route.test.ts`, `src/survey/frames.ts`, `src/survey/frames.test.ts`, `src/survey/CaptureVideo.tsx`
- Modify: `packages/editor/src/main.tsx`, `src/api/client.ts`

**Interfaces:**
- Produces:
  - `useRoute(): string`, `navigate(path: string): void`
  - `frameFilename(capture, timeMs): string`, `orderFrames(keyframes): Keyframe[]`
  - `captureFrame(video, canvas): Promise<Blob>` — thin, uncovered
  - `api.uploadKeyframe(file, captureId, timeMs?)`, `api.keyframeFileUrl(id)`

- [ ] **Step 1: Write the failing tests**

`packages/editor/src/route.test.ts`:

```ts
it("reads the current path", () => { /* useRoute() === "/" */ });
it("changes path without reloading", () => { /* navigate("/survey") → useRoute() === "/survey" */ });
it("follows the browser's back button", () => { /* popstate → re-render */ });
```

`packages/editor/src/survey/frames.test.ts`:

```ts
describe("frameFilename", () => {
  it("names a frame by its capture and timestamp, so a download is recognisable", () => {
    expect(frameFilename({ filename: "L1 walk.mp4" }, 65_400)).toBe("L1-walk-01m05s.jpg");
  });

  it("copes with a capture whose name has no extension", () => { /* … */ });
});

describe("orderFrames", () => {
  it("orders by timeline, not by when they were grabbed", () => {
    // Scrubbing backwards is normal; the filmstrip must still read left to right.
  });

  it("keeps photos in insertion order, since they have no timeline", () => { /* … */ });
});
```

- [ ] **Step 2: Run and watch fail. Step 3: implement routing**

`packages/editor/src/route.ts`:

```ts
import { useSyncExternalStore } from "react";

/**
 * Two routes do not need a router.
 *
 * The server already serves index.html for any non-API path and Vite does the
 * same in development, so real paths work; this is the 30 lines that would
 * otherwise be a dependency.
 */
const listeners = new Set<() => void>();

function subscribe(fn: () => void) {
  listeners.add(fn);
  window.addEventListener("popstate", fn);
  return () => {
    listeners.delete(fn);
    window.removeEventListener("popstate", fn);
  };
}

export function useRoute(): string {
  return useSyncExternalStore(subscribe, () => window.location.pathname, () => "/");
}

export function navigate(path: string): void {
  window.history.pushState({}, "", path);
  for (const fn of listeners) fn();
}
```

`main.tsx` renders `<SurveyApp />` when the route starts with `/survey`, else `<App />`.

- [ ] **Step 4: The pure frame helpers**

`packages/editor/src/survey/frames.ts` — `frameFilename` slugifies the capture name, strips the extension and formats `mm`/`ss`; `orderFrames` sorts by `timeMs` when present and leaves photos alone.

- [ ] **Step 5: The video component**

`packages/editor/src/survey/CaptureVideo.tsx` — a file input, a `<video>` on an object URL, a hidden `<canvas>`, and a Grab button plus the Space key. The extraction itself:

```ts
/**
 * The one untestable line in the tool: jsdom has no canvas, so the drawing is
 * isolated here and everything either side of it is a pure function.
 */
export function captureFrame(video: HTMLVideoElement, canvas: HTMLCanvasElement): Promise<Blob> {
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext("2d")!.drawImage(video, 0, 0);
  return new Promise((resolve, reject) =>
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error("could not read the frame"))), "image/jpeg", 0.85),
  );
}
```

Revoke the object URL on unmount; the video is never uploaded.

- [ ] **Step 6: Run and commit**

```bash
npx vitest run packages/editor
npm run typecheck
git add packages/editor/src/route.ts packages/editor/src/route.test.ts packages/editor/src/survey packages/editor/src/main.tsx packages/editor/src/api/client.ts
git commit -m "feat(editor): a /survey route, and frames grabbed without uploading the video"
```

---

## Task 5: Labelling

**Files:**
- Create: `packages/editor/src/survey/SurveyApp.tsx`, `src/survey/PlaceTagger.tsx`, `src/survey/PlaceTagger.test.tsx`, `src/survey/places.ts`, `src/survey/places.test.ts`
- Test: `packages/editor/src/survey/SurveyApp.test.tsx`

**Interfaces:**
- Produces: `matchPlaces(places, query): Place[]` — the autocomplete, pure and tested; `PlaceTagger` props `{ keyframe, places, onTag }`.

- [ ] **Step 1: Write the failing tests**

`places.test.ts`:

```ts
it("matches on any part of the name, since people type the distinctive word", () => {
  expect(matchPlaces(all, "coff").map(p => p.nameEn)).toContain("Coffee Bean");
});
it("ignores case and surrounding space", () => { /* " NTUC " */ });
it("puts a prefix match first, since that is usually the one meant", () => { /* … */ });
it("returns everything for an empty query, so the list is browsable", () => { /* … */ });
it("matches the Chinese name too", () => { /* nameZh */ });
```

`PlaceTagger.test.tsx`:

```ts
it("tags the whole frame when no box is drawn", () => { /* onTag called with box undefined */ });
it("turns a drag into a box in image fractions", () => { /* mouse events → box ~{x,y,w,h} */ });
it("offers an existing place rather than making a second one", () => { /* autocomplete → existing id */ });
it("creates a place when the name is new", () => { /* onTag with a new name and category */ });
it("refuses to tag with an empty name", () => { /* onTag not called */ });
```

Drags use **mouse** events, not pointer events — jsdom builds `PointerEvent` with no coordinates.

- [ ] **Step 2: Run and watch fail. Steps 3–4: implement**

`matchPlaces` — case-insensitive substring over `nameEn` and `nameZh`, prefix matches sorted first.

`PlaceTagger` — the keyframe image, a drag rectangle in fractions of the displayed size, a name input with a datalist of matches, a category select defaulting to `retail`, and a Tag button. Tagging an existing name reuses its id; a new name creates a place.

`SurveyApp` — the three-column shell from the spec: captures on the left, the frame in the middle with the filmstrip beneath, places on the right with sighting counts and an unbound total.

- [ ] **Step 5: Run and commit**

```bash
npx vitest run packages/editor
npm run typecheck
git add packages/editor/src/survey
git commit -m "feat(editor): label a frame, naming places by autocomplete"
```

---

## Task 6: Binding, and evidence

**Files:**
- Create: `packages/editor/src/panels/BindPlacePanel.tsx`, `src/panels/BindPlacePanel.test.tsx`
- Modify: `packages/editor/src/App.tsx`, `src/flow/checklist.ts`
- Test: `packages/model/src/validation/rules/survey.test.ts` (evidence assertions)

**Interfaces:**
- Consumes: `place.roomId` (Task 1), the survey rules (Task 3).
- Produces: `BindPlacePanel` in the editor's rooms section — bind the selected room to a surveyed place.

- [ ] **Step 1: Write the failing tests**

```tsx
it("offers only places nothing else has claimed", () => { /* bound place absent from the list */ });
it("binds the selected room to the chosen place", () => { /* onBind(placeId, roomId) */ });
it("copies the sightings onto the room as evidence", () => { /* verification.evidence */ });
it("moves the room off unverified once bound", () => { /* status === "photo" */ });
it("says so when nothing has been surveyed yet", () => { /* empty state, not an empty select */ });
```

- [ ] **Step 2: Run and watch fail. Step 3: implement**

Binding is two writes through the existing saver, both optimistically locked:

```ts
void saver.update("place", place.id, place.version, { roomId: room.id });
void saver.update("room", room.id, room.version, {
  verification: {
    status: "photo",
    // The frames that show it — the first thing in this project to move an
    // entity off "unverified".
    evidence: sightingsFor(place.id).map(s => s.keyframeId),
    verifiedAt: new Date().toISOString(),
  },
});
```

- [ ] **Step 4: Route the codes**

In `packages/editor/src/flow/checklist.ts`, `stepForCode`: `place.*` and `room.unsurveyed` belong to `"rooms"` — the tracing step is where you would act on them.

- [ ] **Step 5: Run everything and commit**

```bash
npm test
npm run typecheck
npm run build
git add packages/editor/src packages/model/src
git commit -m "feat: bind a surveyed place to a traced room, with the frames as evidence"
```

---

## Done criteria

- `npm test` green, `npm run typecheck` clean, editor builds.
- A local video can be scrubbed, frames grabbed, and **the video is never uploaded** — only JPEGs reach the server.
- Two places tagged in one frame produce one co-visible pair; two places in consecutive frames produce a sequential pair; neither pairs a place with itself.
- Frames grabbed out of order still read left to right and still derive the right sequence.
- Binding a place to a room sets the room's `verification.status` to `photo` with keyframe ids as evidence.
- A published bundle contains no captures, keyframes, places or sightings.
- All three survey rules warn and none blocks a publish.

## Self-review

**Spec coverage.** §4 entities → Task 1. §5 browser extraction → Task 4. §6 catalogue and both adjacency signals → Tasks 3 and 6. §7 binding and the three rules → Tasks 3 and 6. §8 the tool → Tasks 4 and 5. §9 migration → Task 2. The §12 open question (filmstrip vs grid) lands in Task 5 and can be answered then without touching Tasks 1–4.

**Placeholders.** Tasks 3, 5 and 6 give test names and assertions rather than full bodies where the fixture is mechanical; each names the exact function and expectation. Task 2's route is given in full because its failure modes are the subtle ones.

**Type consistency.** `Pair` is `{a, b}` throughout. `keyframeId` — not `imageId` — is what evidence stores, since a keyframe is the thing with a timestamp and a capture behind it. `PlaceSchema.category` reuses `TenantCategorySchema`, so Task 6 writes a tenant without translating.
