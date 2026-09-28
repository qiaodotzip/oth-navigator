# Plan 5B — PDF plan and rooms — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A teammate drops a floor's architect PDF on the Floorplan step and gets a crisp plan, scaled from the drawing's own grid dimensions. Then, on Areas & rooms, **Find rooms in the drawing** turns the named spaces into drafts that a person accepts, rejects or skips.

**Architecture:** The PDF is parsed only in the uploader's browser, by pdf.js (spec §5.1 option c). `editor/src/pdf/` ports `scripts/extract-storey-plan.py` to TypeScript:
- the text layer gives the scale (`calibrate`) and the labels;
- pdf.js renders a window of the sheet, replacing `get_pixmap` one for one;
- the script's erode, dilate, flood and crack-trace become typed-array code, run in a Web Worker.

The server stores the PDF beside the plan image and never reads it: it checks the `%PDF-` header and nothing else. It keeps the drafts as a new `roomDraft` entity, outside `MapModel`, and turns an accepted draft into a room in one transaction.

**Tech Stack:** pdf.js (`pdfjs-dist` **6.3.289**, legacy build, Apache-2.0), `@napi-rs/canvas` 1.0.9 (tests only: pdf.js's own Node canvas), React 18, zustand, Hono, Drizzle (PGlite in tests), zod, Vitest 1.6 with jsdom 25.

**Spec:** [`docs/design-and-plans/specs/2026-09-28-map-fidelity-and-agent-access-design.md`](../specs/2026-09-28-map-fidelity-and-agent-access-design.md), §5 (Part B) and §8–§10. Read §5 in full before any task. The source being ported is [`scripts/extract-storey-plan.py`](../../../scripts/extract-storey-plan.py). Read it once, whole: every constant below comes from it.

**Checked before writing this plan (2026-09-28, in a scratch folder, not in the repo):**
- `pdfjs-dist@6.3.289` requires Node ≥22.13 or 24. Its **modern** build throws `hashOriginal.toHex is not a function` under Node 24 (it needs `Uint8Array.prototype.toHex`). The **legacy** build works in all three places:
  - Vite 5.4.21 builds it as a lazy chunk of 541 kB (165 kB gzipped), plus the 1.3 MB worker file, emitted as `.mjs`.
  - Under Vitest 1.6.1 with jsdom 25 it reads text and renders through `@napi-rs/canvas`, with no worker file set.
  - It runs in plain Node too.
- `@napi-rs/canvas` is pdf.js's own optional dependency. It installs prebuilt on Windows (`canvas-win32-x64-msvc`, 37 MB). The lockfile npm writes on Windows records `canvas-linux-x64-gnu` (glibc) as well, so `npm ci` in the `node:24-bookworm-slim` image installs it. The Dockerfile runs `npm ci --include=dev`, so it adds about 35 MB to the image, and nothing at runtime loads it. Docker Desktop was not running, so the image itself was not built; Task 1 Step 9 does that.
- On the real L1 sheet (`docs/1st Level - Floor Plan.pdf` in the main checkout, never committed):
  - pdf.js reads 2,288 text items and 75 grid dimensions, the same count as PyMuPDF.
  - This plan's `calibrate`, run on pdf.js's items, gives **0.750511 m per point from 2 of 3 runs**. The script gives 0.750512 from the same 2 of 3, and `plan:l1` records 0.750504.
  - Rendering the window this plan computes (grid dimensions and room names, plus 10 m) at 0.07 m/px gives 6,072 × 5,144 px in 7.7 s, as a 5.1 MB JPEG.
  - The whole page at 0.07 m/px would be 8,492 × 6,562 px (56 Mpx). At 0.05 m/px it would be 109 Mpx.
  - Every task's pure and pdf.js code in this plan (Tasks 1, 3, 4's `importPlan` and `placement`, 5, and 6's `findInDrawing`) passed its own tests in a scratch copy under Vitest 1.6 and jsdom. Tasks 1 and 3 also typechecked under this repo's strict settings. The server and React code was not run.
  - Parity with the script (Task 5 Step 6): 190 spaces found against 188, and the calibration matches. The median IoU is 0.873 against the spec's 0.95. The cause is how text is boxed for erasing, and Task 5 Step 6 gives the diagnosis and the fix to try. The slice (Tasks 1–4) doesn't depend on it.
- jsdom's `File` has no `arrayBuffer()`. `FileReader` works: see `readBytes` in Task 1.
- `server/src/static.ts` has no `.mjs` content type. The pdf.js worker would go out as `application/octet-stream`, and a browser refuses a module worker served that way. Task 4 fixes it.

## Global Constraints

- **Worktree.** Work in `C:\Users\qhuip\Repositories\oth_navigation\.claude\worktrees\ux-overhaul`, on branch `ux-overhaul`. Never `cd` to the main checkout, and never use `git stash`.
- **Other agents share this worktree.** Parts A, C and D run at the same time.
  - Touch only the files your task lists. `.superpowers/` and any file you did not create stay unstaged.
  - Stage by path, and commit with `git commit --only -m "…" -- <paths>`. End every message with exactly `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
  - If git reports `index.lock`, wait and retry. Never delete it.
- **Tests go through the lock** (the 16:40 ruling, after the laptop crashed at 16:12). From the worktree root, run `bash .superpowers/run-tests.sh vitest <paths…>`. It waits for the lock, runs with `timeout 300` and two threads, then lets go.
  - Never call `npx vitest` or `npx tsc` directly.
  - Never run the whole suite: the controller runs it at checkpoints.
  - For anything else heavy (`npm run build -w @oth/editor`, a node probe), take the lock by hand, from the worktree root: `until mkdir .superpowers/test.lock 2>/dev/null; do sleep 15; done`, run it, then `rm -rf .superpowers/test.lock`.
  - Never start a dev server, Playwright or a second run while yours is going.
  - The PDF tests render real pages, so they are this plan's heaviest: give them one file per run.
- **Typecheck** with `bash .superpowers/run-tests.sh tsc packages/<pkg>`. TypeScript 5.9 is strict, with `noUncheckedIndexedAccess`, `noUnusedLocals` and `noUnusedParameters`. Under 5.9 a `Uint8Array<ArrayBufferLike>` is not a `BlobPart`: give `Blob` a copied `Uint8Array` or an `ArrayBuffer`.
- **pdf.js** (spec §5.1):
  - `pdfjs-dist` is pinned **exactly** at `6.3.289`.
  - Import only the **legacy** build: `pdfjs-dist/legacy/build/pdf.mjs` and `pdfjs-dist/legacy/build/pdf.worker.min.mjs?url`.
  - The spec asks for `isEvalSupported: false`. pdf.js 6 no longer has that option, because it no longer evaluates code: its builds contain no `eval(` and no `new Function(` (checked in 6.3.289). The pin is what keeps it that way, and TypeScript rejects the old option, so it is not passed.
  - Only `editor/src/pdf/pdfjs.ts` imports pdf.js at runtime (Part D's finders excepted).
  - pdf.js takes over the buffer it is given and empties it, so always hand it a copy.
- **The server never parses a PDF.** It checks the `%PDF-` header in the first 1024 bytes and a 50 MB limit. It serves the file back as an attachment with `x-content-type-options: nosniff`.
- **Scale** (spec §2, §5.2; the memory note on OTH's sheets):
  - The printed ratio and the drawn scale bar are never read: on OTH's sheets both are wrong.
  - The scale comes from runs of grid dimensions, keeping those that agree to within 0.5%. It takes at least two agreeing runs.
  - The plan is rendered at 0.05 m/px, or 0.07 m/px for a sheet wider than 400 m, within a budget of 36 Mpx.
- **Drafts:**
  - At most 1,000 per `PUT`, and a body of at most 2 MB.
  - `roomDraft` is never part of `MapModel`, its validation or the published bundle.
  - An accepted room gets its id from its name and its height from its level. It is walkable if it is an area, and its verification is `cad`, with evidence `pdf:<sha256>`.
- **Migrations only add.** This part has exactly one migration, generated in Task 2 (see Task 2 Step 10 for why then, and what to do if another part's migration lands first).
- **Shared files:**
  - Append your own block only to `db/schema.ts`, `api/client.ts`, `testing/fakeApi.ts` and `@oth/model`'s `index.ts`.
  - B's files per spec §8: `build/FloorplanTools.tsx`, `build/StepTools.tsx`, `build/todo.ts` and `images/routes.ts`. B also makes small, listed hook-in edits to:
    - `build/BuildWorkspace.tsx`, `plan/PlanCanvas.tsx` and `plan/colours.ts`;
    - `server/src/app.ts`, `server/src/static.ts` and `server/src/cli/dataTables.ts`;
    - `entities/registry.ts`, and one field in `levelImages`.
- **The second builder's files** (`cli/planL1.ts`, `renderer/{massing,shell,theme}.ts`) are not touched. `scripts/extract-storey-plan.py` gets one docstring line, in Task 5, and only if parity holds.
- **Copy:** second person and sentence case. Loading text ends with `…`. Errors say what to do next. Colour is never the only signal: drafts are dashed and named.
- **Comments** explain *why*, in the repo's voice.
- **Test files** sit beside the files they test.

## Review Focus

1. **Sheets that are not laid out like L1's**: turned 90° or 270°, or with a MediaBox that does not start at 0,0. Text and raster must stay in one frame, or every label floods from outside its own room and every draft is wrong. A reasonable person expects the same rooms whichever way the sheet is saved. This is pinned in Task 5: the same sheet is found four ways, and every label point must lie inside its own footprint.
2. **A plan moved with Align, or rescaled by hand, after it was uploaded.** A person expects drafts to land on the plan as they see it now, not where it first arrived. Pinned in Task 1 (`sheetToModel` follows a new offset and scale) and in Task 5 (a moved plan moves every footprint by exactly the offset).
3. **A reviewer accepting a draft that a teammate's new search replaced.** A person expects a plain refusal and a refreshed list, never a room made from a stale draft. Pinned in Task 2 (a 422 that says the drawing was searched again) and in Task 8 (the words are shown and the drafts reload).
4. **Keys in the wrong place.** Build already uses A for Draw area and R for Draw room. Pressing A while a draft is selected must accept it and not pick up a tool. Pressing A with no draft selected must still pick up Draw area. Typing "a" into the name field must type it. Pinned in Task 8.
5. **Finding rooms again on a floor whose earlier drafts were accepted.** A person expects the new copies of rooms already on the map to be hidden, not offered again. That covers L1, whose 193 rooms came from this same method. Pinned in Task 7 (`draftView` puts them under *already on the map*).

---

## Files

```
packages/editor/package.json                  MODIFY 1  pdfjs-dist 6.3.289 (dep), @napi-rs/canvas 1.0.9 (dev), exact
package-lock.json                             MODIFY 1
packages/editor/src/pdf/pdfjs.ts              CREATE 1  lazy pdf.js, openPdf, looksLikePdf, readBytes, PdfUnreadableError
packages/editor/src/pdf/pdfjs-url.d.ts        CREATE 1  `?url` module type
packages/editor/src/pdf/words.ts              CREATE 1  the script's word lists
packages/editor/src/pdf/text.ts               CREATE 1  text items on the sheet as shown; words
packages/editor/src/pdf/calibrate.ts          CREATE 1  dimension runs → metres per point
packages/editor/src/pdf/sheet.ts              CREATE 1  window, resolution, budget, sheet → model, readSheet
packages/editor/src/pdf/render.ts             CREATE 1  render a window, ink mask, JPEG
packages/editor/src/pdf/testing/syntheticPdf.ts CREATE 1 hand-built PDFs and the miniature storey plan
packages/model/src/schema/pdfPlan.ts          CREATE 2  PlanSheet/PlanSource/RoomDraft schemas
packages/model/src/index.ts                   MODIFY 2  one export line
packages/server/src/db/schema.ts              MODIFY 2  levelImages.source; plan_pdfs; room_drafts
packages/server/src/entities/registry.ts      MODIFY 2  roomDraft
packages/server/src/images/pdf.ts             CREATE 2  PDF_MAX_BYTES, looksLikePdf, attachmentName
packages/server/src/images/routes.ts          MODIFY 2  POST/GET /:id/source
packages/server/src/drafts/service.ts         CREATE 2  list, replace, accept, unaccept, roomIdFor
packages/server/src/drafts/routes.ts          CREATE 2  /api/levels/:id/drafts, /api/room-drafts/…
packages/server/src/app.ts                    MODIFY 2  two app.route lines
packages/server/src/cli/dataTables.ts         MODIFY 2  carry plan_pdfs (with its files) and room_drafts
packages/server/drizzle/0012_*.sql + meta     CREATE 2  generated
packages/editor/src/pdf/raster.ts             CREATE 3  dilate, erode, flood, nearest, loops, rdp, clean
packages/editor/src/pdf/placement.ts          CREATE 4  where a new plan goes
packages/editor/src/pdf/importPlan.ts         CREATE 4  PDF → plan image + calibration + source
packages/editor/src/build/PdfPagePicker.tsx   CREATE 4  "Which page is this floor's plan?"
packages/editor/src/build/FloorplanTools.tsx  MODIFY 4  takes a PDF
packages/editor/src/api/client.ts             MODIFY 4,6 LevelImage.source; Part B block
packages/editor/src/testing/fakeApi.ts        MODIFY 4,6
packages/server/src/static.ts                 MODIFY 4  .mjs
packages/editor/src/pdf/labels.ts             CREATE 5  grouping and naming
packages/editor/src/pdf/findRooms.ts          CREATE 5  the method, on a raster
packages/editor/src/pdf/extract.ts            CREATE 5  PDF page → FindInput; user space → model
packages/editor/src/pdf/worker.ts             CREATE 5
packages/editor/src/pdf/runFind.ts            CREATE 5
packages/editor/src/pdf/parity.test.ts        CREATE 5  by hand, against l1-spaces.json
scripts/extract-storey-plan.py                MODIFY 5  "superseded" line, only if parity holds
packages/editor/src/pdf/findInDrawing.ts      CREATE 6  fetch PDF → find → PUT drafts
packages/editor/src/build/drafts.ts           CREATE 6, MODIFY 7  draft store; view helpers
packages/editor/src/build/DraftsFind.tsx      CREATE 6  the button
packages/editor/src/build/StepTools.tsx       MODIFY 6,8
packages/editor/src/build/BuildWorkspace.tsx  MODIFY 6,7,8  hook-ins
packages/editor/src/plan/DraftLayer.tsx       CREATE 7  drafts drawn (presentational)
packages/editor/src/build/DraftsOnPlan.tsx    CREATE 7  the layer, wired to the stores
packages/editor/src/plan/colours.ts           MODIFY 7  PROPOSED_STROKE
packages/editor/src/plan/PlanCanvas.tsx       MODIFY 7  `overlays` slot, only if Part A's Task 4 has not added it
packages/editor/src/build/draftActions.ts     CREATE 8  accept, reject, next
packages/editor/src/build/useDraftKeys.ts     CREATE 8  A · R · S
packages/editor/src/build/DraftsPanel.tsx     CREATE 8  the review
packages/editor/src/build/todo.ts             MODIFY 8  "n drafts to review"
```

## Order, parallel groups and the cut line

| Wave | Tasks | Can run together because | Needs |
|---|---|---|---|
| 1 | **1**, **2**, **3** | Disjoint: 1 is `editor/src/pdf/*` except `raster.ts`, plus `packages/editor/package.json` and the lockfile. 2 is model and server only. 3 is `raster.ts` only. | — |
| 2 | **4**, **5** | 4 is the Floorplan UI, `placement.ts`, `importPlan.ts`, the API client and `static.ts`. 5 is `labels.ts`, `findRooms.ts`, `extract.ts`, the worker and parity. | 4 needs 1 and 2. 5 needs 1 and 3. |
| 3 | **6** → **7** → **8** | Sequential: each edits `BuildWorkspace.tsx`, and 7 and 8 build on 6's store. | 6 needs 2, 4 and 5. |

**Shippable after Task 4.** Tasks 1, 2 and 4 are the first slice: a PDF becomes a crisp, auto-scaled plan on every floor, and it carries the one migration. Task 3 may ride along; it changes nothing anyone sees. After Task 4, the controller can merge and deploy:
- `npm ci` picks up the new dependencies;
- the server runs migration 0012 on start;
- the teammate note gets the line: *Floorplan takes the architect's PDF now: drop it in and the plan comes out sharp, scaled from the drawing's own grid.*

**Shippable again after Task 8**, with the note line: *On Areas & rooms, **Find rooms in the drawing** turns the PDF's named spaces into drafts. Review them with A (accept), R (reject) and S (skip).*

**Part D's hook.** D's Task 8 finds columns and flight outlines once B has found the rooms. The document is open on the main thread in `pdf/findInDrawing.ts`; the worker holds only a raster. So D hooks in at the comment marked `Part D` in `findRoomsInDrawing`, not in `worker.ts`. Everything D's table asks for is in scope there:
- the page, from `doc.getPage(source.page)`;
- `OPS`, from `loadPdfjs()`;
- `toModel`, which is `userSpaceToModel(page, source, place)`;
- `result.skippedLabels`;
- `roomsExtent(result.drafts)`.

`roomDraft.kind` accepts `detail`, and accepting a detail draft makes a detail room at the level's height.

---
### Task 1: Reading a sheet: pdf.js, the drawing's own scale, the window, the render

This task reads a sheet: pdf.js loads the file; the text layer gives the scale, taken the script's way; a window around the drawing is chosen; and pdf.js renders that window. Two facts pin the scale:
- the memory note's **0.21 m/px for OTH's 2020 A3 sheets at 1:1500**, whose drawn scale bar is 3× wrong;
- **L1's 0.750504 m per point**, which `plan:l1` renders at **0.07 m/px**.

**Files:**
- Modify: `packages/editor/package.json` and `package-lock.json`
- Create: `packages/editor/src/pdf/pdfjs.ts`, `pdfjs-url.d.ts`, `words.ts`, `text.ts`, `calibrate.ts`, `sheet.ts`, `render.ts`, `testing/syntheticPdf.ts`
- Test: `packages/editor/src/pdf/pdfjs.test.ts`, `text.test.ts`, `calibrate.test.ts`, `sheet.test.ts`, `render.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces, used by Tasks 4 to 7:
  - `pdfjs.ts`:
    - `loadPdfjs(): Promise<typeof import("pdfjs-dist/legacy/build/pdf.mjs")>`
    - `openPdf(bytes: Uint8Array): Promise<{ doc: PdfDocument; close(): Promise<void> }>`
    - `looksLikePdf(bytes): boolean`
    - `readBytes(blob: Blob): Promise<Uint8Array>`
    - `class PdfUnreadableError`
    - `PDF_MAX_BYTES`
    - `type PdfDocument`, `type PdfPage`
  - `text.ts`:
    - `type Box = { x0; y0; x1; y1 }`, in points, on the sheet as shown (rotation applied, y down)
    - `type TextItem = { text: string; box: Box; ux: number; uy: number }`
    - `type Word = { text: string; x: number; y: number; box: Box }`
    - `placeItem(raw, toShown)`, `readTextItems(page)`, `wordsOf(items)`
  - `words.ts`:
    - `ROOMY`, `SERVICE_WORDS`, `AREA_WORDS`, `OPEN_WORDS`, `FLIGHT_WORDS`
    - `NOT_A_NAME`, `LEVEL_LINE`, `LEVEL_NOTE`, `SERVICE_CODE`, `JUNK_NAME`, `FIXUPS`, `GRID_MM`
    - `wordsIn(text): Set<string>`, `hasWordIn(text, list)`, `isRoomLabel(text)`
  - `calibrate.ts`:
    - `type Run = { axis: "x" | "y"; mm: number; pt: number; words: Word[] }`
    - `type Calibration = { metresPerPoint: number | null; runsAgree: number; runsFound: number; runs: Run[] }`
    - `dimensionRuns(words)`, `calibrate(words)`, `describeCalibration(cal, hasText)`
  - `sheet.ts`:
    - `WINDOW_MARGIN_M = 10`, `WIDE_SHEET_M = 400`, `PIXEL_BUDGET = 36_000_000`
    - `renderMetresPerPixel(sheetWidthM)`, `drawingWindow(page, marks, metresPerPoint)`, `windowMarks(items, runs)`
    - `fitBudget(window, metresPerPoint, metresPerPixel, budget?)`, `unscaledPointsPerPixel(window)`
    - `type SheetPlacement = { clipPt: readonly [number, number, number, number]; pointsPerPixel: number }`
    - `type ImagePlace = { metresPerPixel: number; offsetX: number; offsetY: number }`
    - `sheetToModel(sheet, image): (x, y) => [number, number]`
    - `type Rotation = 0 | 90 | 180 | 270`, `normaliseRotation(deg)`
    - `type SheetReading = { width; height; rotation; items: TextItem[]; calibration; window: Box }`, `readSheet(page)`
  - `render.ts`:
    - `type Rendered = { canvas: unknown; context: CanvasRenderingContext2D; width; height; release(): void }`
    - `renderWindow(doc, page, window, pxPerPt)`, `class CanvasTooLargeError`
    - `inkFromRgba(rgba, width, height, threshold = 170): Uint8Array`
    - `encodeJpeg(canvas, quality = 0.88): Promise<Blob>`
  - `testing/syntheticPdf.ts`:
    - `syntheticPdf(pages)`, `line`, `rect`, `fillRect`, `text`, `textUp`, `centred`, `centredUp`, `storedTurned(content, 90 | 270)`
    - `planSheet({ dimensions? })`, `PLAN_SHEET_SCALE = 0.5`

- [ ] **Step 1: Add the dependencies, pinned exactly**

```bash
npm install pdfjs-dist@6.3.289 --save-exact -w @oth/editor
npm install @napi-rs/canvas@1.0.9 --save-exact --save-dev -w @oth/editor
```

Expected: `packages/editor/package.json` has `"pdfjs-dist": "6.3.289"` under `dependencies` and `"@napi-rs/canvas": "1.0.9"` under `devDependencies`. Then check that the lockfile carries the Linux binary the Docker image needs: `grep -c '"node_modules/@napi-rs/canvas-linux-x64-gnu"' package-lock.json` prints `1`.

- [ ] **Step 2: Write the synthetic PDF helper**

The architect's sheet never enters the repo (spec §9), so every test builds its own PDF. Create `packages/editor/src/pdf/testing/syntheticPdf.ts`:

```ts
/**
 * PDFs built by hand for tests: Helvetica, straight lines and text, nothing
 * else. The architect's sheet never enters the repo (spec §9), so the tests
 * draw a storey plan in miniature instead.
 */
export type SyntheticPage = {
  width: number;
  height: number;
  rotate?: 0 | 90 | 180 | 270;
  /** Where the MediaBox starts. The content is moved with it, so the sheet looks the same. */
  origin?: [number, number];
  content: string;
};

export function syntheticPdf(pages: readonly SyntheticPage[]): Uint8Array {
  const kids = pages.map((_, i) => `${4 + i * 2} 0 R`).join(" ");
  const objects: string[] = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  pages.forEach((page, i) => {
    const [ox, oy] = page.origin ?? [0, 0];
    const body = ox || oy ? `q 1 0 0 1 ${ox} ${oy} cm\n${page.content}\nQ` : page.content;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [${ox} ${oy} ${ox + page.width} ${oy + page.height}] ` +
        `/Rotate ${page.rotate ?? 0} /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + i * 2} 0 R >>`,
      `<< /Length ${body.length} >>\nstream\n${body}\nendstream`,
    );
  });
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) out += `${String(o).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(out);
}

/** Helvetica's advance widths (per 1000), which pdf.js uses for this base-14 font: enough to centre a label. */
const HELVETICA: Record<string, number> = {
  " ": 278, ":": 278, "0": 556, "1": 556, "2": 556, "3": 556, "4": 556, "5": 556, "6": 556, "7": 556, "8": 556, "9": 556,
  A: 667, B: 667, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278, J: 500, K: 667, L: 556, M: 833,
  N: 722, O: 778, P: 667, Q: 778, R: 722, S: 667, T: 611, U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611,
};
export const textWidth = (s: string, size: number) =>
  [...s].reduce((w, ch) => w + (HELVETICA[ch] ?? 556), 0) * size / 1000;

export const line = (x0: number, y0: number, x1: number, y1: number, w = 0.4) =>
  `${w} w ${x0} ${y0} m ${x1} ${y1} l S`;
export const rect = (x: number, y: number, w: number, h: number, lw = 0.4) => `${lw} w ${x} ${y} ${w} ${h} re S`;
export const fillRect = (x: number, y: number, w: number, h: number) => `${x} ${y} ${w} ${h} re f`;
export const text = (x: number, y: number, size: number, s: string) => `BT /F1 ${size} Tf ${x} ${y} Td (${s}) Tj ET`;
/** Text reading up the sheet, as a run of dimensions down its side is printed. */
export const textUp = (x: number, y: number, size: number, s: string) =>
  `BT /F1 ${size} Tf 0 1 -1 0 ${x} ${y} Tm (${s}) Tj ET`;
/** Text centred on `xc`, baseline at `y`. */
export const centred = (xc: number, y: number, size: number, s: string) => text(xc - textWidth(s, size) / 2, y, size, s);
/** Text reading up the sheet, centred on `yc`, baseline at `x`. */
export const centredUp = (x: number, yc: number, size: number, s: string) =>
  textUp(x, yc - textWidth(s, size) / 2, size, s);

/**
 * A landscape drawing stored as CAD exports store one, and as L1's sheet is
 * saved: turned into a portrait page, with /Rotate turning it back. Shown, it
 * looks exactly like the upright sheet, text included.
 */
export function storedTurned(content: string, turn: 90 | 270, width = 400, height = 300): SyntheticPage {
  const cm = turn === 90 ? `0 1 -1 0 ${height} 0` : `0 -1 1 0 0 ${width}`;
  return { width: height, height: width, rotate: turn, content: `q ${cm} cm\n${content}\nQ` };
}

/** Metres per point of `planSheet`: 9 m bays printed 18 pt apart. */
export const PLAN_SHEET_SCALE = 0.5;

/**
 * A storey plan in miniature, on a 400 × 300 pt sheet at 0.5 m per point
 * (so 200 × 150 m, under the 400 m that asks for 0.07 m per pixel):
 * - a shop and a changing room, 12 × 10 m each, joined by a 0.9 m door;
 * - a void beside them, 9 × 10 m;
 * - an escalator in a 6 × 5 m box, and a plaza the drawing leaves open;
 * - a run of nine 9 m grid dimensions along the top, and another up the side, clear of each other;
 * - a title block that prints a scale, as OTH's sheets do, well away from the drawing.
 */
export function planSheet({ dimensions = true }: { dimensions?: boolean } = {}): string {
  const parts = [
    rect(100, 150, 66, 20),
    line(124, 150, 124, 158.1),
    line(124, 159.9, 124, 170),
    line(148, 150, 148, 170),
    rect(100, 125, 12, 10),
    centred(112, 159, 2, "SHOP"),
    centred(136, 160.4, 2, "CHANGING"),
    centred(136, 158.0, 2, "ROOM"),
    centred(157, 159, 2, "VOID"),
    centred(106, 129.5, 1, "ESCALATOR"),
    centred(170, 110, 2, "PLAZA"),
    text(300, 20, 3, "SCALE 1 : 500"),
  ];
  if (dimensions) {
    for (let i = 0; i < 9; i++) {
      parts.push(centred(80 + 18 * i, 200, 1.5, "9000"));
      parts.push(centredUp(58, 30 + 18 * i, 1.5, "9000"));
    }
  }
  return parts.join("\n");
}
```

- [ ] **Step 3: Write the failing tests**

`packages/editor/src/pdf/pdfjs.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { PdfUnreadableError, looksLikePdf, openPdf, readBytes } from "./pdfjs";
import { planSheet, syntheticPdf } from "./testing/syntheticPdf";

const bytes = (s: string) => new TextEncoder().encode(s);

describe("looksLikePdf", () => {
  it("knows a PDF by its header, which readers accept anywhere in the first 1024 bytes", () => {
    expect(looksLikePdf(bytes("%PDF-1.7\n"))).toBe(true);
    expect(looksLikePdf(bytes(`${" ".repeat(500)}%PDF-1.4`))).toBe(true);
    expect(looksLikePdf(bytes(`${" ".repeat(1100)}%PDF-1.4`))).toBe(false);
    expect(looksLikePdf(bytes("%PDF"))).toBe(false);
    expect(looksLikePdf(new Uint8Array(0))).toBe(false);
  });
});

describe("openPdf", () => {
  it("opens a PDF and leaves the caller's bytes whole, so they can still be uploaded", async () => {
    const pdf = syntheticPdf([{ width: 400, height: 300, content: planSheet() }]);
    const length = pdf.byteLength;
    const { doc, close } = await openPdf(pdf);
    expect(doc.numPages).toBe(1);
    await close();
    expect(pdf.byteLength).toBe(length);
  });

  it("says a file it cannot read is unreadable, rather than failing as a lost connection would", async () => {
    await expect(openPdf(bytes("%PDF-1.4\nnot really"))).rejects.toBeInstanceOf(PdfUnreadableError);
  });
});

describe("readBytes", () => {
  it("reads a dropped file, which in some browsers (and jsdom) has no arrayBuffer()", async () => {
    const file = new File([new Uint8Array([37, 80, 68, 70, 45])], "L2.pdf", { type: "application/pdf" });
    expect(Array.from(await readBytes(file))).toEqual([37, 80, 68, 70, 45]);
  });
});
```

`packages/editor/src/pdf/text.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { openPdf } from "./pdfjs";
import { readTextItems, wordsOf, type TextItem } from "./text";
import { centred, syntheticPdf, text, textUp } from "./testing/syntheticPdf";

const centre = (i: TextItem) => [(i.box.x0 + i.box.x1) / 2, (i.box.y0 + i.box.y1) / 2] as const;

async function itemsOf(rotate: 0 | 90, content: string) {
  const { doc, close } = await openPdf(syntheticPdf([{ width: 400, height: 300, rotate, content }]));
  try {
    return await readTextItems(await doc.getPage(1));
  } finally {
    await close();
  }
}

describe("readTextItems", () => {
  it("places text on the sheet as shown: y down, and turned with the page", async () => {
    const flat = await itemsOf(0, centred(112, 159, 2, "SHOP"));
    expect(flat.map(i => i.text)).toEqual(["SHOP"]);
    const [x, y] = centre(flat[0]!);
    expect(x).toBeCloseTo(112, 1);
    expect(y).toBeCloseTo(300 - 160, 1);

    // Turned a quarter clockwise, a point (x, y) on the page is shown at (y, x).
    const [tx, ty] = centre((await itemsOf(90, centred(112, 159, 2, "SHOP")))[0]!);
    expect(tx).toBeCloseTo(160, 1);
    expect(ty).toBeCloseTo(112, 1);
  });

  it("places text printed up the sheet, reading upward", async () => {
    const [item] = await itemsOf(0, textUp(58, 30, 1.5, "9000"));
    expect(item!.uy).toBeCloseTo(-1, 6);
    expect(item!.box.x0).toBeCloseTo(56.5, 1);
    expect(item!.box.x1).toBeCloseTo(58, 1);
    expect(item!.box.y1).toBeCloseTo(270, 1);
    expect(item!.box.y0).toBeCloseTo(270 - 3.336, 1);
  });

  it("leaves out runs of text that are only spaces", async () => {
    expect(await itemsOf(0, text(10, 10, 5, "   "))).toEqual([]);
  });
});

describe("wordsOf", () => {
  it("splits a run of text into words, each about where it is printed", () => {
    const item: TextItem = { text: "9000 4500", box: { x0: 0, y0: 0, x1: 47.26, y1: 10 }, ux: 1, uy: 0 };
    const words = wordsOf([item]);
    expect(words.map(w => w.text)).toEqual(["9000", "4500"]);
    // Placed by character count: within a point of where Helvetica puts them (11.1 and 36.1).
    expect(Math.abs(words[0]!.x - 11.1)).toBeLessThan(1);
    expect(Math.abs(words[1]!.x - 36.1)).toBeLessThan(1);
    expect(words[0]!.y).toBe(5);
  });

  it("splits text reading up the sheet along its own direction", () => {
    const item: TextItem = { text: "9000 9000", box: { x0: 0, y0: 0, x1: 10, y1: 40 }, ux: 0, uy: -1 };
    const [first, second] = wordsOf([item]);
    // Read upward, so the first word is the lower one.
    expect(first!.y).toBeGreaterThan(second!.y);
    expect(first!.x).toBe(5);
  });
});
```

`packages/editor/src/pdf/calibrate.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { calibrate, describeCalibration, dimensionRuns } from "./calibrate";
import type { Word } from "./text";

const word = (text: string, x: number, y: number): Word => ({ text, x, y, box: { x0: x - 1, y0: y - 1, x1: x + 1, y1: y + 1 } });

/**
 * A printed run of grid dimensions. Each is centred in the bay it measures,
 * so the next one along sits half this bay and half the next further on.
 */
function run(axis: "x" | "y", lane: number, start: number, mm: readonly number[], metresPerPoint: number): Word[] {
  let at = start;
  return mm.map((value, i) => {
    if (i > 0) at += (mm[i - 1]! + value) / 2 / 1000 / metresPerPoint;
    return axis === "x" ? word(String(value), at, lane) : word(String(value), lane, at);
  });
}
const bays = (n: number, mm = 9000) => Array.from({ length: n }, () => mm);

describe("calibrate", () => {
  it("reads L1's 0.750504 m per point from its grid, as plan:l1 has it, and throws out the run that disagrees", () => {
    const L1 = 0.750504;
    const cal = calibrate([
      ...run("x", 89, 226, bays(22), L1),
      ...run("y", 138, 100, [7700, 7700, 8350, ...bays(23)], L1),
      // The real sheet's third run comes out at 0.7646 m per point: not the sheet's scale.
      ...run("x", 469, 300, bays(10, 7260), 0.7646),
    ]);
    expect(cal.metresPerPoint).toBeCloseTo(L1, 6);
    expect([cal.runsAgree, cal.runsFound]).toEqual([2, 3]);
  });

  it("reads OTH's 2020 A3 sheets at 1:1500 from their grid, which is 0.21 m per pixel, not the scale bar's 0.07", () => {
    const a3At1500 = (25.4 / 72 / 1000) * 1500;
    const cal = calibrate([
      ...run("x", 60, 100, bays(10), a3At1500),
      ...run("y", 40, 120, bays(10), a3At1500),
      // The title block's printed ratio, and a drawn bar marked 25 and 50 m that is 3× wrong: never read.
      word("SCALE", 1000, 800), word("1", 1030, 800), word(":", 1035, 800), word("500", 1045, 800),
      word("0", 1000, 780), word("25", 1020, 780), word("50", 1040, 780),
    ]);
    expect(cal.metresPerPoint).toBeCloseTo(a3At1500, 6);
    // The 2020 raster is this A3 sheet (1190.55 pt across) at 3000 px.
    expect((1190.55 * cal.metresPerPoint!) / 3000).toBeCloseTo(0.21, 4);
  });

  it("never reads a printed ratio: a sheet with no runs of dimensions has no scale", () => {
    const cal = calibrate([word("SCALE", 10, 10), word("1:500", 40, 10), word("1:1500", 80, 10)]);
    expect(cal).toMatchObject({ metresPerPoint: null, runsFound: 0 });
  });

  it("needs two runs that agree: one alone gives no scale", () => {
    expect(calibrate(run("x", 50, 0, bays(10), 0.75)).metresPerPoint).toBeNull();
  });

  // The runs below sit along the top and down the side, as on a sheet, never crossing.
  it("gives no scale when two runs disagree", () => {
    const cal = calibrate([...run("x", 50, 0, bays(10), 0.75), ...run("y", -30, 100, bays(10), 0.6)]);
    expect(cal).toMatchObject({ metresPerPoint: null, runsFound: 2 });
  });

  it("counts a run once when its numbers straddle two lanes", () => {
    // The script counted lanes by rounded position, so a run printed at 88.4 and 88.6 was two runs, and agreed with itself.
    const straddling = run("x", 0, 0, bays(16), 0.75).map((w, i) => ({ ...w, y: i % 2 ? 88.6 : 88.4 }));
    const cal = calibrate(straddling);
    expect(cal).toMatchObject({ metresPerPoint: null, runsFound: 1 });
  });

  it("keeps a run with one dimension missing: only the pair across the gap is left out", () => {
    const gappy = run("x", 50, 0, bays(12), 0.75).filter((_, i) => i !== 5);
    const cal = calibrate([...gappy, ...run("y", -30, 100, bays(10), 0.75)]);
    expect(cal.metresPerPoint).toBeCloseTo(0.75, 6);
  });

  it("keeps the pairs whose lettering wanders, which cancel over the run, as the script does", () => {
    // Every other number printed 2 pt late: the pairs are 14 and 10 pt apart, and the run is still 12 pt a bay.
    const wandering = run("x", 50, 0, bays(13), 0.75).map((w, i) => (i % 2 ? { ...w, x: w.x + 2 } : w));
    const cal = calibrate([...wandering, ...run("y", -30, 100, bays(10), 0.75)]);
    expect(cal.metresPerPoint).toBeCloseTo(0.75, 6);
  });

  it("does not count a run shorter than 50 points", () => {
    // Eight 1 m bays at 0.75 m per point span 9 pt.
    expect(dimensionRuns([...run("x", 50, 0, bays(8, 1000), 0.75)])).toEqual([]);
  });
});

describe("describeCalibration", () => {
  const none = { metresPerPoint: null, runsAgree: 0, runs: [] };
  it("says where the scale came from", () => {
    expect(describeCalibration({ metresPerPoint: 0.750511, runsAgree: 2, runsFound: 3, runs: [] }, true))
      .toBe("Scale from the drawing's grid: 0.7505 m per point, 2 of 3 dimension runs agree.");
  });
  it("says why there is none, and what to do", () => {
    expect(describeCalibration({ ...none, runsFound: 0 }, false)).toMatch(/^Not scaled: the drawing has no text to read a scale from, so it may be a scan\. Set it with Sheet scale or Measure scale\.$/);
    expect(describeCalibration({ ...none, runsFound: 0 }, true)).toMatch(/no runs of grid dimensions/);
    expect(describeCalibration({ ...none, runsFound: 1 }, true)).toMatch(/only 1 run of grid dimensions, and two must agree/);
    expect(describeCalibration({ ...none, runsFound: 3 }, true)).toMatch(/3 runs of grid dimensions disagree/);
  });
});
```

`packages/editor/src/pdf/sheet.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { openPdf } from "./pdfjs";
import {
  PIXEL_BUDGET, drawingWindow, fitBudget, normaliseRotation, readSheet, renderMetresPerPixel,
  sheetToModel, unscaledPointsPerPixel,
} from "./sheet";
import { PLAN_SHEET_SCALE, planSheet, syntheticPdf } from "./testing/syntheticPdf";

describe("renderMetresPerPixel", () => {
  it("is 0.05, or 0.07 for a sheet wider than 400 m", () => {
    expect(renderMetresPerPixel(400)).toBe(0.05);
    expect(renderMetresPerPixel(400.1)).toBe(0.07);
  });
  it("gives L1's sheet (792 pt at 0.750504 m per point) the 0.07 plan:l1 rendered it at", () => {
    expect(renderMetresPerPixel(792 * 0.750504)).toBe(0.07);
  });
});

describe("drawingWindow", () => {
  const page = { width: 400, height: 300 };
  it("is the whole sheet when there is no scale, or nothing to go round", () => {
    expect(drawingWindow(page, [{ x0: 10, y0: 10, x1: 20, y1: 20 }], null)).toEqual({ x0: 0, y0: 0, x1: 400, y1: 300 });
    expect(drawingWindow(page, [], 0.5)).toEqual({ x0: 0, y0: 0, x1: 400, y1: 300 });
  });
  it("goes 10 m round the marks, and no further than the sheet", () => {
    expect(drawingWindow(page, [{ x0: 100, y0: 5, x1: 200, y1: 100 }, { x0: 150, y0: 50, x1: 390, y1: 60 }], 0.5))
      .toEqual({ x0: 80, y0: 0, x1: 400, y1: 120 });
  });
});

describe("fitBudget", () => {
  it("keeps the resolution asked for when the window fits", () => {
    expect(fitBudget({ x0: 0, y0: 0, x1: 400, y1: 300 }, 0.5, 0.05)).toBe(0.05);
  });
  it("coarsens it just enough to fit the pixel budget", () => {
    const window = { x0: 0, y0: 0, x1: 1000, y1: 1000 };
    const mpp = fitBudget(window, 1, 0.05);
    expect(mpp).toBe(0.167);
    expect((1000 / mpp) ** 2).toBeLessThanOrEqual(PIXEL_BUDGET);
  });
});

describe("unscaledPointsPerPixel", () => {
  it("draws a sheet with no scale at 4 pixels a point, with no side over 8000 px", () => {
    expect(unscaledPointsPerPixel({ x0: 0, y0: 0, x1: 400, y1: 300 })).toBe(0.25);
    expect(unscaledPointsPerPixel({ x0: 0, y0: 0, x1: 4000, y1: 300 })).toBe(0.5);
  });
});

describe("sheetToModel", () => {
  const sheet = { clipPt: [100, 50, 700, 560] as const, pointsPerPixel: 0.1 };
  it("puts the window's corner at the plan's offset, x east and y north", () => {
    const toModel = sheetToModel(sheet, { metresPerPixel: 0.05, offsetX: -25, offsetY: 300 });
    expect(toModel(100, 50)).toEqual([-25, 300]);
    expect(toModel(110, 60)).toEqual([-20, 295]);
  });
  it("follows the plan when Align moves it, or Measure scale rescales it", () => {
    const moved = sheetToModel(sheet, { metresPerPixel: 0.05, offsetX: 0, offsetY: 0 });
    expect(moved(110, 60)).toEqual([5, -5]);
    // Twice the metres per pixel on the same pixels is twice the metres per point, about the same corner.
    const rescaled = sheetToModel(sheet, { metresPerPixel: 0.1, offsetX: 0, offsetY: 0 });
    expect(rescaled(110, 60)).toEqual([10, -10]);
  });
});

describe("normaliseRotation", () => {
  it("reads any turn as one of four", () => {
    expect([0, 90, 180, 270, 360, -90, 450].map(normaliseRotation)).toEqual([0, 90, 180, 270, 0, 270, 90]);
  });
});

describe("readSheet", () => {
  it("reads the sheet's size, its scale, and a window round the drawing that leaves the title block out", async () => {
    const { doc, close } = await openPdf(syntheticPdf([{ width: 400, height: 300, content: planSheet() }]));
    try {
      const r = await readSheet(await doc.getPage(1));
      expect([r.width, r.height, r.rotation]).toEqual([400, 300, 0]);
      expect(r.calibration.metresPerPoint).toBeCloseTo(PLAN_SHEET_SCALE, 6);
      expect([r.calibration.runsAgree, r.calibration.runsFound]).toEqual([2, 2]);
      // The side run's left edge (56.5 pt) and the top run's last number (225.7 pt), with 20 pt (10 m) round them.
      expect(r.window.x0).toBeCloseTo(36.5, 0);
      expect(r.window.x1).toBeCloseTo(245.7, 0);
      expect(r.window.y0).toBeCloseTo(78.5, 0);
      expect(r.window.y1).toBeCloseTo(291.7, 0);
    } finally {
      await close();
    }
  });
});
```

`packages/editor/src/pdf/render.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { openPdf, readBytes } from "./pdfjs";
import { encodeJpeg, inkFromRgba, renderWindow } from "./render";
import { fillRect, syntheticPdf } from "./testing/syntheticPdf";

describe("renderWindow", () => {
  it.each([
    // A 10 pt black square at (100, 100) on the page. Upright, it is shown at x 100–110, y 190–200; turned, at 100–110 both ways.
    [0, { x0: 90, y0: 180, x1: 130, y1: 220 }],
    [90, { x0: 90, y0: 90, x1: 130, y1: 130 }],
  ] as const)("draws the window asked for, at its resolution, on a sheet turned %i°", async (rotate, window) => {
    const { doc, close } = await openPdf(syntheticPdf([{ width: 400, height: 300, rotate, content: fillRect(100, 100, 10, 10) }]));
    try {
      const r = await renderWindow(doc, await doc.getPage(1), window, 2);
      try {
        expect([r.width, r.height]).toEqual([80, 80]);
        const ink = inkFromRgba(r.context.getImageData(0, 0, 80, 80).data, 80, 80);
        expect(ink[30 * 80 + 30]).toBe(1);
        expect(ink[5 * 80 + 5]).toBe(0);
        expect(ink.reduce((n, v) => n + v, 0)).toBeGreaterThan(20 * 20 - 80);
      } finally {
        r.release();
      }
    } finally {
      await close();
    }
  });

  it("saves the drawing as a JPEG", async () => {
    const { doc, close } = await openPdf(syntheticPdf([{ width: 100, height: 100, content: fillRect(10, 10, 10, 10) }]));
    try {
      const r = await renderWindow(doc, await doc.getPage(1), { x0: 0, y0: 0, x1: 100, y1: 100 }, 1);
      const jpeg = await readBytes(await encodeJpeg(r.canvas));
      r.release();
      expect([jpeg[0], jpeg[1]]).toEqual([0xff, 0xd8]);
    } finally {
      await close();
    }
  });
});

describe("inkFromRgba", () => {
  it("reads ink as the script does, from the red channel darker than 170, so a red line is not a wall", () => {
    const rgba = new Uint8ClampedArray([0, 0, 0, 255, 255, 0, 0, 255, 169, 169, 169, 255, 170, 170, 170, 255]);
    expect(Array.from(inkFromRgba(rgba, 4, 1))).toEqual([1, 0, 1, 0]);
  });
});
```

- [ ] **Step 4: Run the tests to see them fail**

Run: `bash .superpowers/run-tests.sh vitest packages/editor/src/pdf`
Expected: FAIL, because `./pdfjs`, `./text`, `./calibrate`, `./sheet` and `./render` do not resolve.

- [ ] **Step 5: Write `pdfjs-url.d.ts`, `pdfjs.ts` and `words.ts`**

`packages/editor/src/pdf/pdfjs-url.d.ts`:

```ts
// Vite turns a `?url` import into the URL of the file it emits.
declare module "*?url" {
  const url: string;
  export default url;
}
```

`packages/editor/src/pdf/pdfjs.ts`:

```ts
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist/legacy/build/pdf.mjs";

export type PdfDocument = PDFDocumentProxy;
export type PdfPage = PDFPageProxy;
type Pdfjs = typeof import("pdfjs-dist/legacy/build/pdf.mjs");

/** The server's own limit (`PDF_MAX_BYTES` in `server/src/images/pdf.ts`). */
export const PDF_MAX_BYTES = 50 * 1024 * 1024;

export class PdfUnreadableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PdfUnreadableError";
  }
}

let loading: Promise<Pdfjs> | null = null;

/**
 * pdf.js, fetched the first time a PDF is opened, so its 1.5 MB stays out of
 * the bundle everyone loads. The legacy build: the modern one needs
 * Uint8Array.toHex, which Node 24 (and so every test) does not have.
 *
 * In a browser it parses in its own worker, so an untrusted file is read off
 * the page's thread. Under Node, in the tests, it parses in place and needs no
 * worker file.
 */
export function loadPdfjs(): Promise<Pdfjs> {
  loading ??= (async () => {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    if (typeof window !== "undefined" && typeof Worker !== "undefined") {
      const { default: workerSrc } = await import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url");
      pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
    }
    return pdfjs;
  })();
  return loading;
}

const SIGNATURE = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-

/** Whether the bytes are a PDF by their header, which readers accept anywhere in the first 1024 bytes. */
export function looksLikePdf(bytes: Uint8Array): boolean {
  const last = Math.min(bytes.length - SIGNATURE.length, 1024 - SIGNATURE.length);
  for (let i = 0; i <= last; i++) {
    if (SIGNATURE.every((b, j) => bytes[i + j] === b)) return true;
  }
  return false;
}

/** A file's bytes. A dropped File in some browsers, and in jsdom, has no arrayBuffer(). */
export function readBytes(blob: Blob): Promise<Uint8Array> {
  if (typeof blob.arrayBuffer === "function") return blob.arrayBuffer().then(b => new Uint8Array(b));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

/**
 * Opens a PDF. pdf.js takes over the buffer it is handed and empties it, so it
 * gets a copy: the caller still has the file to upload. A file it cannot read
 * says so as a PdfUnreadableError, which the screens word differently from a
 * lost connection. There is no `isEvalSupported` to turn off: pdf.js 6
 * evaluates no code at all, and the exact pin keeps it that way.
 */
export async function openPdf(bytes: Uint8Array): Promise<{ doc: PdfDocument; close: () => Promise<void> }> {
  const pdfjs = await loadPdfjs();
  const task = pdfjs.getDocument({ data: bytes.slice(), verbosity: 0 });
  try {
    const doc = await task.promise;
    return { doc, close: () => task.destroy() };
  } catch (err) {
    await task.destroy().catch(() => {});
    const name = (err as { name?: string } | null)?.name;
    throw new PdfUnreadableError(
      name === "PasswordException" ? "it is protected by a password" : "it isn't a PDF this app can read",
    );
  }
}
```

`packages/editor/src/pdf/words.ts`:

```ts
/**
 * The word lists of `scripts/extract-storey-plan.py`, which decide what a
 * printed line is. Verbatim, except where Part B departs from the script on
 * purpose (spec §5.2): a void is a draft, so "Void" is not junk here, and
 * escalators and stairs are left out and reported.
 */

/** A grid dimension: one bay, in millimetres. */
export const GRID_MM = /^\d{3,5}$/;

export const ROOMY: ReadonlySet<string> = new Set([
  "STALL", "RESTAURANT", "KITCHEN", "SHOP", "TOILET", "CORRIDOR", "STORAGE",
  "STORE", "ROOM", "STUDIO", "CHANGING", "LOUNGE", "CONCESSION", "REFEREE",
  "TUNNEL", "HALLWAY", "SEATING", "LOBBY", "SHOWER", "KIOSK", "PLAZA",
  "WALKWAY", "FIELD", "POOL", "RECREATIONAL", "TERRACE", "LIBRARY",
  "THEATRE", "GALLERY", "HALL", "OFFICE", "NURSING", "FAMILY", "SECURITY",
  "CARETAKER", "CLEANER", "AID", "SERVER", "CHAMBER", "REFUSE", "TRAY",
  "WASH", "TAXI", "DECK", "VOID", "ESCALATOR", "PANTRY", "CENTRE", "AREA",
  "COMMAND", "LAN", "MDF", "AHU", "SWITCH", "CHEMICAL", "SPRINKLER",
  "FIRST", "MEDIA", "VIP", "TEAM", "PLAYER'S", "MULTI", "FITNESS",
  "COMMUNITY", "DANCE", "HOCKEY", "TENNIS", "FUTSAL", "SWIMMING", "STADIUM",
]);

export const SERVICE_WORDS: ReadonlySet<string> = new Set([
  "STORAGE", "STORE", "LAN", "MDF", "AHU", "SWITCH", "CHAMBER", "SHAFT",
  "RISER", "REFUSE", "PUMP", "WASH", "TRAY", "CLEANER", "ELEC", "CHEMICAL",
  "SPRINKLER", "COMMAND", "SECURITY", "SERVER", "CARETAKER", "CHUTE",
]);

export const AREA_WORDS: ReadonlySet<string> = new Set([
  "CORRIDOR", "HALLWAY", "LOBBY", "TUNNEL", "RECREATIONAL", "CONCOURSE", "SEATING", "PLAZA", "WALKWAY",
]);

/** Named as open, and the drawing never closes it: both tests must pass. */
export const OPEN_WORDS: ReadonlySet<string> = new Set([
  "PLAZA", "WALK", "WALKWAY", "FIELD", "DECK", "TAXI", "SEATING", "ARRIVAL", "EVENT", "POOL",
]);

/** Left out and reported: flooded, L1's escalators came out as walled rooms. Part D draws them as flights. */
export const FLIGHT_WORDS: ReadonlySet<string> = new Set(["ESCALATOR", "ESCALATORS", "STAIR", "STAIRS", "STAIRCASE"]);

export const NOT_A_NAME = new RegExp(
  "^(FFL|SFL|SLL|CLL|RL|FALL|GRADIENT|RWDP|LINE OF|DOUBLE SLAB|MIN HEADROOM|" +
    "BOUNDARY|BASEMENT|ROOF LINE|UP TO|UP FROM|RAMP UP|STEP UP|SHUTTER GATE|" +
    "OPERABLE|TO \\+)",
  "i",
);

/** A floor level, printed under half the names on a sheet: not part of any name, and not erased. */
export const LEVEL_LINE = /^(FFL|SFL|SLL|CLL|RL)\b|^[+-]?[\d.,]+$/i;
/** Global: only ever used with `replace`, which resets it. */
export const LEVEL_NOTE = /\b(?:FFL|SFL|SLL|CLL|RL)\b\s*[+-]?[\d.,]*/gi;
/** Global: only ever used with `replace`, which resets it. */
export const SERVICE_CODE = /\b(?:WTR|SAN|TEL|ELV|FAD|EAD|KEAD|KFAD|RWDP|IEP|MV|BI|SCV|VRF|HR|DR|FU)\b/g;
/** Not a space at all. The script dropped "Void" too; Part B keeps voids as drafts. */
export const JUNK_NAME = /^(Field|Slab Above|Step Up|Shutter|Ramp|Fall)\b/i;
export const FIXUPS: Readonly<Record<string, string>> = {
  Hcp: "HCP", Vip: "VIP", Ahu: "AHU", Lan: "LAN", Mdf: "MDF", Fm: "FM", Sppg: "SPPG", Ht: "HT",
};

/** A label's words as the script reads them: runs of two or more letters, an apostrophe counting as one. */
export function wordsIn(text: string): Set<string> {
  return new Set(text.toUpperCase().match(/[A-Z']{2,}/g) ?? []);
}

export function hasWordIn(text: string, list: ReadonlySet<string>): boolean {
  for (const w of wordsIn(text)) if (list.has(w)) return true;
  return false;
}

/** Whether a printed line reads as the name of a space. */
export function isRoomLabel(text: string): boolean {
  return !NOT_A_NAME.test(text) && hasWordIn(text, ROOMY);
}
```

- [ ] **Step 6: Write `text.ts` and `calibrate.ts`**

`packages/editor/src/pdf/text.ts`:

```ts
import type { PdfPage } from "./pdfjs";

/** A box on the sheet as shown (the page's rotation applied), in PDF points, y down. */
export type Box = { x0: number; y0: number; x1: number; y1: number };

/** One run of text as pdf.js gives it, on the sheet as shown. `ux, uy` is its reading direction there. */
export type TextItem = { text: string; box: Box; ux: number; uy: number };

/** One word, about where it is printed: the script's `get_text("words")`. */
export type Word = { text: string; x: number; y: number; box: Box };

type RawItem = { str: string; transform: number[]; width: number; height: number };
type ToShown = (x: number, y: number) => [number, number];

/**
 * Where a pdf.js text item sits on the sheet as shown. Its transform places
 * the baseline's start in PDF space (y up, before the page's turn); the box is
 * the run's width along its direction and the font's height across it.
 */
export function placeItem(item: RawItem, toShown: ToShown): TextItem | null {
  const text = item.str.replace(/\s+/g, " ").trim();
  if (!text) return null;
  const [a = 0, b = 0, c = 0, d = 0, e = 0, f = 0] = item.transform;
  const along = Math.hypot(a, b) || 1;
  const up = Math.hypot(c, d) || 1;
  const [ax, ay, cx, cy] = [a / along, b / along, c / up, d / up];
  const w = item.width;
  const h = item.height;
  const corners = [
    toShown(e, f),
    toShown(e + ax * w, f + ay * w),
    toShown(e + cx * h, f + cy * h),
    toShown(e + ax * w + cx * h, f + ay * w + cy * h),
  ];
  const xs = corners.map(p => p[0]);
  const ys = corners.map(p => p[1]);
  const [s0x, s0y] = toShown(e, f);
  const [s1x, s1y] = toShown(e + ax, f + ay);
  const length = Math.hypot(s1x - s0x, s1y - s0y) || 1;
  return {
    text,
    box: { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) },
    ux: (s1x - s0x) / length,
    uy: (s1y - s0y) / length,
  };
}

/** Every run of text on a page, on the sheet as shown. Empty for a scan. */
export async function readTextItems(page: PdfPage): Promise<TextItem[]> {
  const viewport = page.getViewport({ scale: 1 });
  const toShown: ToShown = (x, y) => viewport.convertToViewportPoint(x, y) as [number, number];
  const content = await page.getTextContent();
  const out: TextItem[] = [];
  for (const item of content.items) {
    if (!("str" in item)) continue;
    const placed = placeItem(item as RawItem, toShown);
    if (placed) out.push(placed);
  }
  return out;
}

/**
 * The words of each item, each placed along the item by its characters. A CAD
 * export usually gives each dimension its own item; when it runs two together,
 * this keeps them apart.
 */
export function wordsOf(items: readonly TextItem[]): Word[] {
  const out: Word[] = [];
  for (const item of items) {
    const { box, text } = item;
    const cx = (box.x0 + box.x1) / 2;
    const cy = (box.y0 + box.y1) / 2;
    const flat = Math.abs(item.ux) >= Math.abs(item.uy);
    const length = flat ? box.x1 - box.x0 : box.y1 - box.y0;
    const sign = Math.sign(flat ? item.ux : item.uy) || 1;
    for (const m of text.matchAll(/\S+/g)) {
      const mid = (m.index! + m[0].length / 2) / text.length;
      const offset = (mid - 0.5) * length * sign;
      const half = (length * m[0].length) / text.length / 2;
      const x = flat ? cx + offset : cx;
      const y = flat ? cy : cy + offset;
      out.push({
        text: m[0], x, y,
        box: flat ? { x0: x - half, y0: box.y0, x1: x + half, y1: box.y1 } : { x0: box.x0, y0: y - half, x1: box.x1, y1: y + half },
      });
    }
  }
  return out;
}
```

`packages/editor/src/pdf/calibrate.ts`:

```ts
import type { Word } from "./text";
import { GRID_MM } from "./words";

/** A run is a line of at least this many dimensions sharing a coordinate. */
export const MIN_RUN_WORDS = 8;
export const LANE_TOLERANCE_PT = 6;
/** A run shorter than this on paper is too short to trust. */
export const MIN_RUN_PT = 50;
/**
 * A pair spaced more than 1.5× its run's own spacing, or less than 2/3 of it,
 * has a dimension missing between them or a stray number in between. The band
 * is as wide as the script's, so the pairs that wander with the lettering
 * stay in, and cancel over the run (checked on L1: 0.750511, 2 of 3, as the
 * script finds).
 */
export const PAIR_BAND = [2 / 3, 1.5] as const;
/** Runs this close to the median are the sheet's scale (spec §5.2: 0.5%). */
export const RUN_AGREEMENT = 0.005;
const PLAUSIBLE_M_PER_PT = [0.001, 10] as const;

export type Run = { axis: "x" | "y"; mm: number; pt: number; words: Word[] };
export type Calibration = { metresPerPoint: number | null; runsAgree: number; runsFound: number; runs: Run[] };

/** The upper median, as the script takes it. */
const median = (values: readonly number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!;

/**
 * The sheet's runs of grid dimensions, the script's way. A dimension is
 * printed centred in the bay it measures, so the gap between two neighbours
 * is the mean of their bays. Individual gaps wander with the lettering; the
 * sum over a whole run does not.
 *
 * Two departures from the script, both on purpose:
 * - A pair is judged against its own run's spacing (PAIR_BAND). The script
 *   bounded the spacing to 0.5–2 m per point instead. That was right for L1
 *   (0.75), but it would throw out a sheet drawn at 1:100 altogether.
 * - A run whose numbers straddle a rounding boundary sits in two lanes. It is
 *   still counted once, so it cannot agree with itself.
 */
export function dimensionRuns(words: readonly Word[]): Run[] {
  const dims = words.filter(w => GRID_MM.test(w.text));
  const runs: Run[] = [];
  for (const axis of ["x", "y"] as const) {
    const along = (w: Word) => (axis === "x" ? w.x : w.y);
    const across = (w: Word) => (axis === "x" ? w.y : w.x);
    const lanes = new Map<number, number>();
    for (const d of dims) lanes.set(Math.round(across(d)), (lanes.get(Math.round(across(d))) ?? 0) + 1);
    const counted = new Set<string>();
    for (const [lane, n] of lanes) {
      if (n < MIN_RUN_WORDS) continue;
      const row = dims.filter(d => Math.abs(across(d) - lane) < LANE_TOLERANCE_PT).sort((p, q) => along(p) - along(q));
      const key = row.map(d => dims.indexOf(d)).join(",");
      if (counted.has(key)) continue;
      counted.add(key);
      const pairs: { gap: number; span: number; a: Word; b: Word }[] = [];
      for (let i = 0; i + 1 < row.length; i++) {
        const a = row[i]!;
        const b = row[i + 1]!;
        const gap = along(b) - along(a);
        if (gap > 0) pairs.push({ gap, span: (Number(a.text) + Number(b.text)) / 2, a, b });
      }
      if (pairs.length === 0) continue;
      const spacing = median(pairs.map(p => p.gap / p.span));
      let mm = 0;
      let pt = 0;
      const used = new Set<Word>();
      for (const p of pairs) {
        const relative = p.gap / p.span / spacing;
        if (!(relative > PAIR_BAND[0] && relative < PAIR_BAND[1])) continue;
        mm += p.span;
        pt += p.gap;
        used.add(p.a);
        used.add(p.b);
      }
      if (pt > MIN_RUN_PT) runs.push({ axis, mm, pt, words: [...used] });
    }
  }
  return runs;
}

/**
 * Metres per point, from the sheet's own dimension strings (the script's
 * `calibrate`). Never the printed ratio: OTH's L1 sheet says 1:500 and is
 * out by 4.25×, and its 2020 sheets carry a scale bar that is out by 3×.
 * The agreeing majority is the scale: the median, and the runs within 0.5%
 * of it. Fewer than two agreeing runs is no scale at all.
 */
export function calibrate(words: readonly Word[]): Calibration {
  const runs = dimensionRuns(words);
  if (runs.length < 2) return { metresPerPoint: null, runsAgree: 0, runsFound: runs.length, runs };
  const mid = median(runs.map(r => r.mm / r.pt));
  const keep = runs.filter(r => Math.abs(r.mm / r.pt - mid) / mid < RUN_AGREEMENT);
  if (keep.length < 2) return { metresPerPoint: null, runsAgree: keep.length, runsFound: runs.length, runs: keep };
  const metresPerPoint = keep.reduce((s, r) => s + r.mm, 0) / keep.reduce((s, r) => s + r.pt, 0) / 1000;
  if (metresPerPoint < PLAUSIBLE_M_PER_PT[0] || metresPerPoint > PLAUSIBLE_M_PER_PT[1]) {
    return { metresPerPoint: null, runsAgree: 0, runsFound: runs.length, runs: [] };
  }
  return { metresPerPoint, runsAgree: keep.length, runsFound: runs.length, runs: keep };
}

/** What the Floorplan step says about a PDF's scale (spec §5.2 step 2). */
export function describeCalibration(cal: Calibration, hasText: boolean): string {
  if (cal.metresPerPoint != null) {
    return `Scale from the drawing's grid: ${cal.metresPerPoint.toFixed(4)} m per point, ` +
      `${cal.runsAgree} of ${cal.runsFound} dimension runs agree.`;
  }
  const how = "Set it with Sheet scale or Measure scale.";
  if (!hasText) return `Not scaled: the drawing has no text to read a scale from, so it may be a scan. ${how}`;
  if (cal.runsFound === 0) return `Not scaled: the drawing has no runs of grid dimensions to read a scale from. ${how}`;
  if (cal.runsFound === 1) return `Not scaled: the drawing has only 1 run of grid dimensions, and two must agree. ${how}`;
  return `Not scaled: the drawing's ${cal.runsFound} runs of grid dimensions disagree. ${how}`;
}
```

- [ ] **Step 7: Write `sheet.ts` and `render.ts`**

`packages/editor/src/pdf/sheet.ts`:

```ts
import { calibrate, type Calibration, type Run } from "./calibrate";
import type { PdfPage } from "./pdfjs";
import { readTextItems, wordsOf, type Box, type TextItem } from "./text";
import { isRoomLabel } from "./words";

export const WINDOW_MARGIN_M = 10;
export const WIDE_SHEET_M = 400;
/**
 * About 6,000 × 6,000 px. The raster, its ink mask and the pinched copy
 * together stay near the spec's 250 MB (§5.3), and every current browser
 * allocates a canvas this size.
 */
export const PIXEL_BUDGET = 36_000_000;
export const UNSCALED_MAX_SIDE_PX = 8000;
export const UNSCALED_MAX_PX_PER_PT = 4;

export type Rotation = 0 | 90 | 180 | 270;

export function normaliseRotation(degrees: number): Rotation {
  return ((((Math.round(degrees / 90) * 90) % 360) + 360) % 360) as Rotation;
}

/** Spec §5.2: 0.05 m per pixel, or 0.07 for a sheet wider than 400 m. L1's 594 m sheet is 0.07, as plan:l1 made it. */
export function renderMetresPerPixel(sheetWidthM: number): number {
  return sheetWidthM > WIDE_SHEET_M ? 0.07 : 0.05;
}

export function boxUnion(boxes: readonly Box[]): Box | null {
  if (boxes.length === 0) return null;
  return {
    x0: Math.min(...boxes.map(b => b.x0)), y0: Math.min(...boxes.map(b => b.y0)),
    x1: Math.max(...boxes.map(b => b.x1)), y1: Math.max(...boxes.map(b => b.y1)),
  };
}

/** What the window goes round: the grid's dimensions and the names of spaces, never the title block's notes. */
export function windowMarks(items: readonly TextItem[], runs: readonly Run[]): Box[] {
  return [...runs.flatMap(r => r.words.map(w => w.box)), ...items.filter(i => isRoomLabel(i.text)).map(i => i.box)];
}

/**
 * The part of the sheet worth rendering. The whole of L1's sheet at 0.07 m
 * per pixel would be 56 Mpx, and most of it roads, title block and margin.
 * The grid's dimensions ring the building and the names sit in it, so 10 m
 * round both holds the drawing. Without a scale there is no telling a metre,
 * so the whole sheet is rendered.
 */
export function drawingWindow(page: { width: number; height: number }, marks: readonly Box[], metresPerPoint: number | null): Box {
  const whole = { x0: 0, y0: 0, x1: page.width, y1: page.height };
  const around = boxUnion(marks);
  if (!metresPerPoint || !around) return whole;
  const pad = WINDOW_MARGIN_M / metresPerPoint;
  return {
    x0: Math.max(0, around.x0 - pad), y0: Math.max(0, around.y0 - pad),
    x1: Math.min(page.width, around.x1 + pad), y1: Math.min(page.height, around.y1 + pad),
  };
}

/** The metres per pixel asked for, or coarser, just enough that the window fits the pixel budget. */
export function fitBudget(window: Box, metresPerPoint: number, metresPerPixel: number, budget = PIXEL_BUDGET): number {
  const areaM2 = (window.x1 - window.x0) * (window.y1 - window.y0) * metresPerPoint ** 2;
  const least = Math.sqrt(areaM2 / budget);
  return least <= metresPerPixel ? metresPerPixel : Math.ceil(least * 1000) / 1000;
}

/** A sheet with no scale: 4 pixels a point, and no side longer than 8000 px. */
export function unscaledPointsPerPixel(window: Box): number {
  const longest = Math.max(window.x1 - window.x0, window.y1 - window.y0);
  return Math.max(1 / UNSCALED_MAX_PX_PER_PT, longest / UNSCALED_MAX_SIDE_PX);
}

/** Where a plan image came from on its sheet: fixed when it was rendered. */
export type SheetPlacement = { clipPt: readonly [number, number, number, number]; pointsPerPixel: number };
/** Where the plan image sits in the model now: Align and Measure scale change this. */
export type ImagePlace = { metresPerPixel: number; offsetX: number; offsetY: number };

/**
 * A point on the sheet as shown → model metres, through the plan as it is
 * placed now. The image's pixels are the window's points divided by
 * `pointsPerPixel`, and the image's calibration takes pixels to metres. So a
 * plan moved with Align or rescaled by hand still lines up with its drawing.
 */
export function sheetToModel(sheet: SheetPlacement, image: ImagePlace): (x: number, y: number) => [number, number] {
  const metresPerPoint = image.metresPerPixel / sheet.pointsPerPixel;
  const [x0, y0] = sheet.clipPt;
  return (x, y) => [image.offsetX + (x - x0) * metresPerPoint, image.offsetY - (y - y0) * metresPerPoint];
}

export type SheetReading = {
  /** The sheet as shown, in points. */
  width: number;
  height: number;
  rotation: Rotation;
  items: TextItem[];
  calibration: Calibration;
  window: Box;
};

/** Everything the text layer says about a page: its size, its scale, and where the drawing is. */
export async function readSheet(page: PdfPage): Promise<SheetReading> {
  const viewport = page.getViewport({ scale: 1 });
  const items = await readTextItems(page);
  const calibration = calibrate(wordsOf(items));
  const window = drawingWindow(viewport, windowMarks(items, calibration.runs), calibration.metresPerPoint);
  return { width: viewport.width, height: viewport.height, rotation: normaliseRotation(page.rotate), items, calibration, window };
}
```

`packages/editor/src/pdf/render.ts`:

```ts
import type { PdfDocument, PdfPage } from "./pdfjs";
import type { Box } from "./text";

type Made = { canvas: unknown; context: CanvasRenderingContext2D | null };
type CanvasFactory = { create(width: number, height: number): Made; destroy(made: Made): void };

export class CanvasTooLargeError extends Error {
  constructor(width: number, height: number) {
    super(`a ${width} × ${height} px canvas is more than this browser will hold`);
    this.name = "CanvasTooLargeError";
  }
}

export type Rendered = {
  canvas: unknown;
  context: CanvasRenderingContext2D;
  width: number;
  height: number;
  /** Frees the canvas's memory: a 6,000 px square is 144 MB. */
  release: () => void;
};

/**
 * One window of the sheet as pixels, `pxPerPt` to the point, on white: the
 * script's `get_pixmap` with a clip. It uses pdf.js's own canvas factory: a
 * <canvas> in a browser, and @napi-rs/canvas under Node, so the tests draw
 * what the app draws.
 */
export async function renderWindow(doc: PdfDocument, page: PdfPage, window: Box, pxPerPt: number): Promise<Rendered> {
  const width = Math.max(1, Math.ceil((window.x1 - window.x0) * pxPerPt));
  const height = Math.max(1, Math.ceil((window.y1 - window.y0) * pxPerPt));
  const factory = doc.canvasFactory as CanvasFactory;
  let made: Made;
  try {
    made = factory.create(width, height);
  } catch {
    throw new CanvasTooLargeError(width, height);
  }
  const context = made.context;
  if (!context) throw new CanvasTooLargeError(width, height);
  const release = () => factory.destroy(made);
  try {
    const viewport = page.getViewport({ scale: pxPerPt, offsetX: -window.x0 * pxPerPt, offsetY: -window.y0 * pxPerPt });
    await page.render({ canvas: made.canvas as HTMLCanvasElement, canvasContext: context, viewport, background: "#ffffff" }).promise;
  } catch (err) {
    release();
    throw err;
  }
  return { canvas: made.canvas, context, width, height, release };
}

/**
 * Ink as the script reads it: the red channel darker than 170. It reads the
 * red channel only, so a red line never counts as a wall. That is kept for
 * parity with the rooms already on L1.
 */
export function inkFromRgba(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number, threshold = 170): Uint8Array {
  const ink = new Uint8Array(width * height);
  for (let p = 0, i = 0; p < ink.length; p++, i += 4) ink[p] = rgba[i]! < threshold ? 1 : 0;
  return ink;
}

type Encodable = {
  toBlob?: (done: (blob: Blob | null) => void, type: string, quality: number) => void;
  encode?: (format: "jpeg", quality: number) => Promise<Uint8Array>;
};

/** The canvas as a JPEG, at the script's quality. */
export async function encodeJpeg(canvas: unknown, quality = 0.88): Promise<Blob> {
  const c = canvas as Encodable;
  if (typeof c.toBlob === "function") {
    return new Promise((resolve, reject) =>
      c.toBlob!(blob => (blob ? resolve(blob) : reject(new Error("the plan could not be saved as an image"))), "image/jpeg", quality));
  }
  // @napi-rs/canvas, which is what the tests draw on.
  if (typeof c.encode === "function") {
    return new Blob([new Uint8Array(await c.encode("jpeg", Math.round(quality * 100)))], { type: "image/jpeg" });
  }
  throw new Error("the plan could not be saved as an image");
}
```

- [ ] **Step 8: Run the tests to see them pass, and typecheck**

Run: `bash .superpowers/run-tests.sh vitest packages/editor/src/pdf`
Expected: PASS, every test in the five files. If `page.render` reports that `canvas` must be null when `canvasContext` is given, pass `canvas: null` instead (6.3.289 was checked with both set).

Run: `bash .superpowers/run-tests.sh tsc packages/editor`
Expected: no errors. If a `?url` import is still reported as unknown, check that `pdfjs-url.d.ts` sits in `src/pdf/`, which the `include: ["src"]` of `packages/editor/tsconfig.json` covers.

- [ ] **Step 9: Check the build and the Docker image**

Holding the lock (Global Constraints), run `npm run build -w @oth/editor`
Expected: the build succeeds. It prints no pdf chunk yet, since nothing imports `pdf/` until Task 4.

If Docker Desktop is running, then, holding the lock, run `docker build -t oth-pdf-check .` from the worktree root. Expected: `npm ci` finishes and the image builds. If Docker is not running, say so in your report: Railway builds the same Dockerfile, and the controller watches that build.

- [ ] **Step 10: Commit**

```bash
git add packages/editor/package.json package-lock.json packages/editor/src/pdf/pdfjs.ts packages/editor/src/pdf/pdfjs-url.d.ts packages/editor/src/pdf/words.ts packages/editor/src/pdf/text.ts packages/editor/src/pdf/calibrate.ts packages/editor/src/pdf/sheet.ts packages/editor/src/pdf/render.ts packages/editor/src/pdf/testing/syntheticPdf.ts packages/editor/src/pdf/pdfjs.test.ts packages/editor/src/pdf/text.test.ts packages/editor/src/pdf/calibrate.test.ts packages/editor/src/pdf/sheet.test.ts packages/editor/src/pdf/render.test.ts
git commit --only -m "feat(editor): read a PDF sheet's own scale, and draw the part of it that is the drawing

pdf.js 6.3.289 (legacy build, pinned exactly) opens the sheet in the
uploader's browser. The scale comes from runs of grid dimensions, the way
scripts/extract-storey-plan.py takes it, never from the printed ratio. It
reads L1's 0.750504 m per point and the 2020 sheets' A3 at 1:1500. The
window is the grid and the room names with 10 m round them, rendered at
0.05 m per pixel, or 0.07 on a sheet wider than 400 m.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- packages/editor/package.json package-lock.json packages/editor/src/pdf/pdfjs.ts packages/editor/src/pdf/pdfjs-url.d.ts packages/editor/src/pdf/words.ts packages/editor/src/pdf/text.ts packages/editor/src/pdf/calibrate.ts packages/editor/src/pdf/sheet.ts packages/editor/src/pdf/render.ts packages/editor/src/pdf/testing/syntheticPdf.ts packages/editor/src/pdf/pdfjs.test.ts packages/editor/src/pdf/text.test.ts packages/editor/src/pdf/calibrate.test.ts packages/editor/src/pdf/sheet.test.ts packages/editor/src/pdf/render.test.ts
```

---
### Task 2: The server half: the PDF beside the plan, and room drafts

**Files:**
- Create: `packages/model/src/schema/pdfPlan.ts`, `packages/model/src/schema/pdfPlan.test.ts`
- Modify: `packages/model/src/index.ts` (append one line)
- Modify: `packages/server/src/db/schema.ts` (one field in `levelImages`, two tables appended)
- Modify: `packages/server/src/entities/registry.ts`
- Create: `packages/server/src/images/pdf.ts`
- Modify: `packages/server/src/images/routes.ts`
- Create: `packages/server/src/images/source.test.ts`
- Create: `packages/server/src/drafts/service.ts`, `packages/server/src/drafts/routes.ts`, `packages/server/src/drafts/routes.test.ts`
- Modify: `packages/server/src/app.ts` (two lines)
- Modify: `packages/server/src/cli/dataTables.ts`
- Create: `packages/server/drizzle/0012_*.sql` (after Part C's 0011) and its `meta/` snapshot and journal entry (generated)

**Interfaces:**
- Consumes: `AuditFieldsSchema`, `RingSchema`, `SlugSchema`, `Vec2Schema`, `RoomKindSchema` from `@oth/model`, and the `entities/repository.ts` functions (`createEntity`, `updateEntity`, `softDeleteEntity`, `restoreEntity`, `NotFoundError`, `VersionConflictError`).
- Produces:
  - `@oth/model`:
    - `PlanSheetSchema`, `PlanSourceSchema`, `DraftSourceSchema`, `RoomDraftSchema`, `RoomDraftInputSchema`
    - types `PlanSheet`, `PlanSource`, `DraftSource`, `RoomDraft`, `RoomDraftInput` (the zod *input* type)
  - `POST /api/level-images/:id/source` takes multipart `file` (the PDF), `sheet` (JSON, a `PlanSheet`) and `expectedVersion`.
    - Answers `{ image }`, with `image.source: PlanSource`.
    - 400 for a malformed request; 422 for a bad sheet, a file that is not a PDF, or one over 50 MB; 404 for no such plan; 409 `{ error, current }` for a stale version; 413 for a body over the limit.
  - `GET /api/level-images/:id/source` serves the PDF as `application/pdf`, as an attachment, with `nosniff`. 404 when the plan came from an image.
  - `GET /api/levels/:id/drafts` → `{ drafts: RoomDraft[] }`: live drafts not yet accepted, largest first.
  - `PUT /api/levels/:id/drafts` with `{ source: DraftSource, drafts: RoomDraftInput[] }` → `{ drafts: RoomDraft[] }`.
    - It replaces the floor's live drafts.
    - 422 for more than 1,000 drafts, an unknown floor, or an invalid draft; 413 for a body over 2 MB.
  - `POST /api/room-drafts/accept` with `{ items: [{ id, expectedVersion, nameEn?, kind? }] }` → `{ accepted: [{ draftId, draftVersion, roomId, roomVersion }] }`. All the items or none.
  - `POST /api/room-drafts/:id/accept` with `{ expectedVersion, nameEn?, kind? }` → `{ accepted: {…} }`.
  - `POST /api/room-drafts/unaccept` with `{ items: [{ id, expectedVersion, roomVersion }] }` → `{ drafts: n }`, and `POST /api/room-drafts/:id/unaccept` with `{ expectedVersion, roomVersion }`.
  - Reject is the generic `DELETE /api/entities/roomDraft/:id`, and its undo is `POST /api/entities/roomDraft/:id/restore`.
  - `drafts/service.ts`: `roomIdFor(code, name, taken)`, `listDrafts`, `replaceDrafts`, `acceptDrafts`, `unacceptDrafts`, `MAX_DRAFTS`, `DraftRefusedError`.

- [ ] **Step 1: Write the failing model test**

`packages/model/src/schema/pdfPlan.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { PlanSheetSchema, PlanSourceSchema, RoomDraftInputSchema, RoomDraftSchema } from "./pdfPlan";

const draft = {
  id: "rd_1", levelId: "oth-L2", nameEn: " Shop ", kind: "room",
  footprint: [[0, 0], [10, 0], [10, 10], [0, 10]], labelPoint: [5, 5], areaM2: 100,
  source: { checksum: "a".repeat(64), page: 1 },
};
const sheet = {
  page: 1, pageCount: 1, pageSizePt: [792, 612], rotation: 90, clipPt: [117, 76, 684, 556],
  pointsPerPixel: 0.0933, metresPerPoint: 0.7505, runsAgree: 2, runsFound: 3,
};

describe("RoomDraftSchema", () => {
  it("reads a draft, trims its name, and gives it no holes by default", () => {
    const parsed = RoomDraftSchema.parse(draft);
    expect(parsed.nameEn).toBe("Shop");
    expect(parsed.holes).toEqual([]);
    expect(parsed.version).toBe(0);
  });
  it("keeps a space the drawing leaves open, with no shape", () => {
    expect(RoomDraftSchema.parse({ ...draft, footprint: undefined }).footprint).toBeUndefined();
  });
  it("refuses a draft with no name", () => {
    expect(RoomDraftSchema.safeParse({ ...draft, nameEn: "  " }).success).toBe(false);
  });
  it("takes any kind a room can be, a column's detail and a void included", () => {
    expect(RoomDraftSchema.safeParse({ ...draft, kind: "void" }).success).toBe(true);
    expect(RoomDraftSchema.safeParse({ ...draft, kind: "detail" }).success).toBe(true);
    expect(RoomDraftSchema.safeParse({ ...draft, kind: "corridor" }).success).toBe(false);
  });
  it("what the finder sends carries no id, floor or source: the server gives those", () => {
    const parsed = RoomDraftInputSchema.parse(draft);
    expect(Object.keys(parsed).sort()).toEqual(["areaM2", "footprint", "holes", "kind", "labelPoint", "nameEn"]);
  });
});

describe("PlanSheetSchema and PlanSourceSchema", () => {
  it("records where a plan sits on its sheet, with or without a scale", () => {
    expect(PlanSheetSchema.safeParse(sheet).success).toBe(true);
    expect(PlanSheetSchema.safeParse({ ...sheet, metresPerPoint: null, runsAgree: 0 }).success).toBe(true);
  });
  it("refuses a sheet turned other than by quarters, or with no pixels", () => {
    expect(PlanSheetSchema.safeParse({ ...sheet, rotation: 45 }).success).toBe(false);
    expect(PlanSheetSchema.safeParse({ ...sheet, pointsPerPixel: 0 }).success).toBe(false);
    expect(PlanSheetSchema.safeParse({ ...sheet, clipPt: [0, 0, 1] }).success).toBe(false);
  });
  it("names the PDF by its SHA-256", () => {
    const source = { ...sheet, pdfId: "pdf_1", checksum: "b".repeat(64), filename: "L1.pdf" };
    expect(PlanSourceSchema.safeParse(source).success).toBe(true);
    expect(PlanSourceSchema.safeParse({ ...source, checksum: "abc" }).success).toBe(false);
  });
});
```

Run: `bash .superpowers/run-tests.sh vitest packages/model/src/schema/pdfPlan.test.ts`
Expected: FAIL, because `./pdfPlan` does not resolve.

- [ ] **Step 2: Write the model schema**

`packages/model/src/schema/pdfPlan.ts`:

```ts
import { z } from "zod";
import { AuditFieldsSchema, RingSchema, SlugSchema, Vec2Schema } from "../primitives";
import { RoomKindSchema } from "./structure";

const finite = z.number().finite();
const positive = z.number().positive().finite();

/**
 * Where a floor's plan image came from on its PDF (spec §5.3). It is kept so
 * rooms can be found in the same drawing later, and so the next floor's sheet
 * can be placed the same way. Points are the sheet as shown: the page's turn
 * applied, y down.
 *
 * The spec asks for the origin in points. That is not stored: it would go
 * stale the moment Align or Measure scale moved the plan. The window and the
 * points per pixel are fixed facts about the image, and the origin follows
 * from them and the plan's calibration as it is now.
 */
export const PlanSheetSchema = z.object({
  page: z.number().int().positive(),
  pageCount: z.number().int().positive(),
  /** The sheet as shown, in points. */
  pageSizePt: z.tuple([positive, positive]),
  /** The page's own turn: its /Rotate. */
  rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]),
  /** The part of the sheet the image shows: x0, y0, x1, y1. */
  clipPt: z.tuple([finite, finite, finite, finite]),
  /** Points per image pixel, fixed when the image was drawn. The plan's metres per pixel over this is its metres per point now. */
  pointsPerPixel: positive,
  /** Read from the drawing's grid dimensions; null when they could not be. */
  metresPerPoint: positive.nullable(),
  runsAgree: z.number().int().nonnegative(),
  runsFound: z.number().int().nonnegative(),
});

export const PlanSourceSchema = PlanSheetSchema.extend({
  pdfId: z.string().min(1),
  checksum: z.string().regex(/^[0-9a-f]{64}$/),
  filename: z.string(),
});

export const DraftSourceSchema = z.object({ checksum: z.string().min(1), page: z.number().int().positive() });

/**
 * A space found in a floor's PDF, waiting for a person to make it a room
 * (spec §5.2). As an entity it gets version checks, the audit, soft delete and
 * restore for nothing. It is never part of MapModel: it is not validated with
 * the map, and never published.
 */
export const RoomDraftSchema = AuditFieldsSchema.extend({
  id: SlugSchema,
  levelId: SlugSchema,
  nameEn: z.string().trim().min(1).max(200),
  kind: RoomKindSchema,
  /** Absent for a space the drawing leaves open: it is drawn by hand at its label. */
  footprint: RingSchema.optional(),
  holes: z.array(RingSchema).default([]),
  /** Where the name is printed on the drawing. */
  labelPoint: Vec2Schema,
  areaM2: z.number().nonnegative().finite(),
  source: DraftSourceSchema,
  /** The room it became. Set as the draft is retired, and cleared by the undo. */
  acceptedRoomId: SlugSchema.optional(),
});

/** What the finder sends. The server gives each draft its id, floor and source. */
export const RoomDraftInputSchema = RoomDraftSchema.pick({
  nameEn: true, kind: true, footprint: true, holes: true, labelPoint: true, areaM2: true,
});

export type PlanSheet = z.infer<typeof PlanSheetSchema>;
export type PlanSource = z.infer<typeof PlanSourceSchema>;
export type DraftSource = z.infer<typeof DraftSourceSchema>;
export type RoomDraft = z.infer<typeof RoomDraftSchema>;
export type RoomDraftInput = z.input<typeof RoomDraftInputSchema>;
```

Append to `packages/model/src/index.ts`, after the other `schema/` exports:

```ts
export * from "./schema/pdfPlan";
```

Run the model test again. Expected: PASS.

- [ ] **Step 3: Write the failing server tests**

`packages/server/src/images/source.test.ts`:

```ts
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { createUser } from "../auth/users";
import type { Database } from "../db/client";
import { buildings, levelImages, levels, planPdfs } from "../db/schema";
import { createTestDb, json } from "../testing/harness";
import { attachmentName, looksLikePdf } from "./pdf";

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

const pdf = new TextEncoder().encode("%PDF-1.4\n% a floor's sheet\n");
const sheet = {
  page: 1, pageCount: 1, pageSizePt: [792, 612], rotation: 90, clipPt: [117, 76, 684, 556],
  pointsPerPixel: 0.0933, metresPerPoint: 0.7505, runsAgree: 2, runsFound: 3,
};

async function plan(): Promise<{ id: string; version: number }> {
  const form = new FormData();
  form.append("file", new Blob([png(100, 100)]), "L1.jpg");
  form.append("levelId", "oth-L1");
  const res = await app.request("/api/level-images", { method: "POST", headers: { cookie }, body: form });
  return (await json<{ image: { id: string; version: number } }>(res)).image;
}

function send(id: string, { bytes = pdf, meta = sheet as unknown, expectedVersion = 0, name = "L1 Floor Plan.pdf" } = {}) {
  const form = new FormData();
  form.append("file", new Blob([bytes]), name);
  form.append("sheet", JSON.stringify(meta));
  form.append("expectedVersion", String(expectedVersion));
  return app.request(`/api/level-images/${id}/source`, { method: "POST", headers: { cookie }, body: form });
}

beforeEach(async () => {
  db = await createTestDb();
  app = createApp({ db, dataDir: await mkdtemp(join(tmpdir(), "oth-src-")) });
  const wei = await createUser(db, { email: "wei@example.com", password: "passphrase", displayName: "Wei" });
  cookie = (await app.request("/api/auth/login", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId: wei.id }),
  })).headers.get("set-cookie") ?? "";
  await db.insert(buildings).values({ id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94, rotationDeg: 0 });
  await db.insert(levels).values({
    id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6,
  });
});

describe("a plan's PDF", () => {
  it("is stored beside the plan, with where the plan sits on the sheet", async () => {
    const image = await plan();
    const res = await send(image.id);
    expect(res.status).toBe(200);
    const { image: row } = await json<{ image: { version: number; source: Record<string, unknown> } }>(res);
    expect(row.version).toBe(1);
    expect(row.source).toMatchObject({ ...sheet, filename: "L1 Floor Plan.pdf" });
    expect(row.source.pdfId).toMatch(/^pdf_[0-9a-f]{16}$/);
    expect(row.source.checksum).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is served back as a download that never renders on the app's own origin", async () => {
    const image = await plan();
    await send(image.id);
    const res = await app.request(`/api/level-images/${image.id}/source`, { headers: { cookie } });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="L1 Floor Plan.pdf"');
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(pdf);
  });

  it("refuses a file that isn't a PDF, and leaves the plan as it was", async () => {
    const image = await plan();
    const res = await send(image.id, { bytes: new TextEncoder().encode("<html>hello</html>") });
    expect(res.status).toBe(422);
    const [row] = await db.select().from(levelImages).where(eq(levelImages.id, image.id));
    expect(row?.source).toBeNull();
    expect(row?.version).toBe(0);
  });

  it("refuses a sheet the model would reject", async () => {
    const image = await plan();
    expect((await send(image.id, { meta: { ...sheet, clipPt: [0, 0, 1] } })).status).toBe(422);
    expect((await send(image.id, { meta: "not json" })).status).toBe(422);
  });

  it("409s a stale version rather than overwriting a teammate's", async () => {
    const image = await plan();
    await send(image.id);
    expect((await send(image.id, { expectedVersion: 0 })).status).toBe(409);
  });

  it("404s the PDF of a plan that came from an image", async () => {
    const image = await plan();
    expect((await app.request(`/api/level-images/${image.id}/source`, { headers: { cookie } })).status).toBe(404);
  });

  it("keeps one copy of a PDF sent twice", async () => {
    const first = await plan();
    await send(first.id);
    const second = await plan();
    await send(second.id);
    expect(await db.select().from(planPdfs)).toHaveLength(1);
  });
});

describe("looksLikePdf and attachmentName", () => {
  it("knows a PDF by its header, within the first 1024 bytes", () => {
    expect(looksLikePdf(pdf)).toBe(true);
    expect(looksLikePdf(new TextEncoder().encode(`${"\n".repeat(900)}%PDF-1.7`))).toBe(true);
    expect(looksLikePdf(new TextEncoder().encode(`${"\n".repeat(1100)}%PDF-1.7`))).toBe(false);
  });
  it("names the download safely", () => {
    expect(attachmentName('L1 "plan"\r\n.pdf')).toBe("L1 _plan___.pdf");
    expect(attachmentName("sheet")).toBe("sheet.pdf");
  });
});
```

`packages/server/src/drafts/routes.test.ts`:

```ts
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { createUser } from "../auth/users";
import type { Database } from "../db/client";
import { buildings, levels, roomDrafts, rooms } from "../db/schema";
import { createTestDb, json } from "../testing/harness";
import { roomIdFor } from "./service";

let db: Database;
let app: ReturnType<typeof createApp>;
let cookie: string;

const square = (x: number, y: number, s: number): [number, number][] => [[x, y], [x + s, y], [x + s, y + s], [x, y + s]];
const found = (nameEn: string, over: Record<string, unknown> = {}) => ({
  nameEn, kind: "room", footprint: square(0, 0, 10), holes: [], labelPoint: [5, 5], areaM2: 100, ...over,
});
const source = { checksum: "a".repeat(64), page: 1 };
type Draft = { id: string; version: number; nameEn: string; levelId: string; footprint?: unknown; acceptedRoomId?: string; source: unknown };
type Accepted = { draftId: string; draftVersion: number; roomId: string; roomVersion: number };

beforeEach(async () => {
  db = await createTestDb();
  app = createApp({ db, dataDir: await mkdtemp(join(tmpdir(), "oth-drafts-")) });
  const wei = await createUser(db, { email: "wei@example.com", password: "passphrase", displayName: "Wei" });
  cookie = (await app.request("/api/auth/login", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId: wei.id }),
  })).headers.get("set-cookie") ?? "";
  await db.insert(buildings).values({ id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94, rotationDeg: 0 });
  await db.insert(levels).values({
    id: "oth-L2", buildingId: "oth", code: "L2", ordinal: 2, nameEn: "L2", nameZh: "二楼", elevationM: 6, heightM: 4.5,
  });
  // Already on the map: a new "Shop" must not take its id.
  await db.insert(rooms).values({ id: "L2-shop", levelId: "oth-L2", kind: "room", footprint: square(50, 50, 5), heightM: 4.5 });
});

const send = (method: string, path: string, body: unknown) =>
  app.request(path, { method, headers: { "content-type": "application/json", cookie }, body: typeof body === "string" ? body : JSON.stringify(body) });
const replace = (drafts: unknown[], levelId = "oth-L2") => send("PUT", `/api/levels/${levelId}/drafts`, { source, drafts });
const listed = async () =>
  (await json<{ drafts: Draft[] }>(await app.request("/api/levels/oth-L2/drafts", { headers: { cookie } }))).drafts;
const named = async (name: string) => (await listed()).find(d => d.nameEn === name)!;
const accept = (items: unknown[]) => send("POST", "/api/room-drafts/accept", { items });
const unaccept = (items: unknown[]) => send("POST", "/api/room-drafts/unaccept", { items });

describe("a floor's drafts", () => {
  it("replaces the floor's live drafts in one go, each with an id, the floor and the PDF it came from", async () => {
    expect((await replace([found("Shop"), found("Store Room")])).status).toBe(200);
    const res = await replace([found("Changing Room")]);
    expect(res.status).toBe(200);
    const { drafts } = await json<{ drafts: Draft[] }>(res);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({ nameEn: "Changing Room", levelId: "oth-L2", source });
    expect(drafts[0]!.id).toMatch(/^rd_/);
    expect((await listed()).map(d => d.nameEn)).toEqual(["Changing Room"]);
    // The first search's drafts are retired, not gone: soft, like every removal.
    expect(await db.select().from(roomDrafts)).toHaveLength(3);
  });

  it("keeps a space the drawing leaves open, with no shape", async () => {
    await replace([found("Plaza", { kind: "area", footprint: undefined, areaM2: 0 })]);
    expect((await named("Plaza")).footprint).toBeUndefined();
  });

  it("refuses a floor that isn't there", async () => {
    expect((await replace([found("Shop")], "oth-L9")).status).toBe(422);
  });

  it("refuses more than 1,000 drafts at once", async () => {
    const many = Array.from({ length: 1001 }, (_, i) => found(`Store ${i}`, { footprint: square(0, 0, 1), areaM2: 1 }));
    expect((await replace(many)).status).toBe(422);
  });

  it("refuses a body over 2 MB", async () => {
    const long = Array.from({ length: 200_000 }, (_, i) => [i, i]);
    expect((await replace([found("Hall", { footprint: long })])).status).toBe(413);
  });

  it("refuses a draft the model would reject, and keeps the drafts there were", async () => {
    await replace([found("Shop")]);
    expect((await replace([found("Bad", { footprint: [[0, 0], [1, 1]] })])).status).toBe(422);
    expect((await listed()).map(d => d.nameEn)).toEqual(["Shop"]);
  });

  it("never puts drafts in the map", async () => {
    await replace([found("Shop")]);
    const model = await json<Record<string, unknown>>(await app.request("/api/model", { headers: { cookie } }));
    expect(Object.keys(model)).not.toContain("roomDrafts");
    expect(JSON.stringify(model)).not.toContain("rd_");
  });
});

describe("accepting drafts", () => {
  it("makes rooms: the id from the name, the height from the floor, walkable if an area, and from the drawing", async () => {
    await replace([found("Shop"), found("Main Lobby", { kind: "area", labelPoint: [20, 20] })]);
    const shop = await named("Shop");
    const lobby = await named("Main Lobby");
    const res = await accept([{ id: shop.id, expectedVersion: 0 }, { id: lobby.id, expectedVersion: 0 }]);
    expect(res.status).toBe(200);
    const { accepted } = await json<{ accepted: Accepted[] }>(res);
    expect(accepted.map(a => a.roomId)).toEqual(["L2-shop-2", "L2-main-lobby"]);
    expect(accepted[0]).toMatchObject({ draftId: shop.id, draftVersion: 2, roomVersion: 0 });
    const [room] = await db.select().from(rooms).where(eq(rooms.id, "L2-shop-2"));
    expect(room).toMatchObject({
      levelId: "oth-L2", kind: "room", heightM: 4.5, walkable: false, nameEn: "Shop",
      verification: { status: "cad", evidence: [`pdf:${"a".repeat(64)}`] },
    });
    expect((await db.select().from(rooms).where(eq(rooms.id, "L2-main-lobby")))[0]?.walkable).toBe(true);
    const [retired] = await db.select().from(roomDrafts).where(eq(roomDrafts.id, shop.id));
    expect(retired?.acceptedRoomId).toBe("L2-shop-2");
    expect(retired?.deletedAt).not.toBeNull();
    expect(await listed()).toEqual([]);
  });

  it("takes the name and kind the reviewer corrected", async () => {
    await replace([found("Shop")]);
    const shop = await named("Shop");
    const res = await send("POST", `/api/room-drafts/${shop.id}/accept`, { expectedVersion: 0, nameEn: "Kiosk 3", kind: "service" });
    expect(res.status).toBe(200);
    expect((await json<{ accepted: Accepted }>(res)).accepted.roomId).toBe("L2-kiosk-3");
    expect((await db.select().from(rooms).where(eq(rooms.id, "L2-kiosk-3")))[0]?.kind).toBe("service");
  });

  it("refuses a space the drawing leaves open: it has no shape to add", async () => {
    await replace([found("Plaza", { kind: "area", footprint: undefined, areaM2: 0 })]);
    const res = await accept([{ id: (await named("Plaza")).id, expectedVersion: 0 }]);
    expect(res.status).toBe(422);
    expect((await json<{ error: string }>(res)).error).toMatch(/Draw it by hand/);
  });

  it("409s a stale draft, and adds no room for any of them", async () => {
    await replace([found("Shop"), found("Store")]);
    const before = (await db.select().from(rooms)).length;
    const res = await accept([
      { id: (await named("Shop")).id, expectedVersion: 0 },
      { id: (await named("Store")).id, expectedVersion: 5 },
    ]);
    expect(res.status).toBe(409);
    expect((await db.select().from(rooms)).length).toBe(before);
    expect(await listed()).toHaveLength(2);
  });

  it("tells a reviewer whose draft a new search replaced, rather than adding it", async () => {
    await replace([found("Shop")]);
    const old = await named("Shop");
    await replace([found("Shop")]);
    const res = await accept([{ id: old.id, expectedVersion: 0 }]);
    expect(res.status).toBe(422);
    expect((await json<{ error: string }>(res)).error).toMatch(/searched again/);
  });
});

describe("undoing an accept", () => {
  async function accepted(): Promise<Accepted> {
    await replace([found("Shop")]);
    const res = await accept([{ id: (await named("Shop")).id, expectedVersion: 0 }]);
    return (await json<{ accepted: Accepted[] }>(res)).accepted[0]!;
  }

  it("takes the room off the map and puts the draft back", async () => {
    const a = await accepted();
    const res = await unaccept([{ id: a.draftId, expectedVersion: a.draftVersion, roomVersion: a.roomVersion }]);
    expect(res.status).toBe(200);
    expect((await db.select().from(rooms).where(eq(rooms.id, a.roomId)))[0]?.deletedAt).not.toBeNull();
    const back = await listed();
    expect(back.map(d => d.id)).toEqual([a.draftId]);
    expect(back[0]!.acceptedRoomId).toBeUndefined();
  });

  it("won't take back a room someone has changed since", async () => {
    const a = await accepted();
    expect((await send("PATCH", `/api/entities/room/${a.roomId}`, { expectedVersion: 0, data: { nameEn: "Shop 12" } })).status).toBe(200);
    const res = await send("POST", `/api/room-drafts/${a.draftId}/unaccept`, { expectedVersion: a.draftVersion, roomVersion: a.roomVersion });
    expect(res.status).toBe(409);
    expect((await db.select().from(rooms).where(eq(rooms.id, a.roomId)))[0]?.deletedAt).toBeNull();
  });
});

describe("rejecting a draft", () => {
  it("is the generic soft delete, and the generic restore undoes it", async () => {
    await replace([found("Shop")]);
    const shop = await named("Shop");
    expect((await send("DELETE", `/api/entities/roomDraft/${shop.id}`, { expectedVersion: 0 })).status).toBe(200);
    expect(await listed()).toEqual([]);
    expect((await send("POST", `/api/entities/roomDraft/${shop.id}/restore`, { expectedVersion: 1 })).status).toBe(200);
    expect((await listed()).map(d => d.id)).toEqual([shop.id]);
  });
});

describe("roomIdFor", () => {
  it("is the floor's code and the name, numbered past what is taken, as plan:l1 named L1's rooms", () => {
    const taken = new Set(["L2-shop", "L2-shop-2"]);
    expect(roomIdFor("L2", "Shop", taken)).toBe("L2-shop-3");
    expect(taken.has("L2-shop-3")).toBe(true);
    expect(roomIdFor("L2", "Cleaner's Room", taken)).toBe("L2-cleaner-s-room");
    expect(roomIdFor("L2", "!!!", taken)).toBe("L2-space");
    expect(roomIdFor("L2", "A".repeat(80), new Set()).length).toBeLessThanOrEqual(3 + 48);
  });
});
```

Run both test files:
- `bash .superpowers/run-tests.sh vitest packages/server/src/images/source.test.ts`
- `bash .superpowers/run-tests.sh vitest packages/server/src/drafts`

Expected: FAIL. `./pdf`, `planPdfs`, `roomDrafts` and `./service` do not exist.

- [ ] **Step 4: Add the tables**

In `packages/server/src/db/schema.ts`:

- Add at the top: `import type { DraftSource, PlanSource } from "@oth/model";`
- In `levelImages`, after `opacity`:

```ts
  /** Set when the plan was drawn from a PDF: which sheet, and where on it (PlanSourceSchema in @oth/model). */
  source: jsonb("source").$type<PlanSource>(),
```

- Append at the end of the file:

```ts
/**
 * A floor's PDF, kept so anyone can find rooms in it later (spec §5.3). Stored
 * and served back, never parsed here. A table of its own, with the
 * `storage_path` and `size_bytes` that data:export carries files by, so the
 * PDFs move to another server with everything else.
 */
export const planPdfs = pgTable("plan_pdfs", {
  id: text("id").primaryKey(),
  filename: text("filename").notNull(),
  storagePath: text("storage_path").notNull(),
  checksum: text("checksum").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  uploadedBy: text("uploaded_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Spaces found in a floor's PDF, waiting for a person (RoomDraftSchema). Never part of the map. */
export const roomDrafts = pgTable("room_drafts", {
  id: text("id").primaryKey(),
  levelId: text("level_id").notNull(),
  nameEn: text("name_en").notNull(),
  kind: text("kind").notNull(),
  /** Null for a space the drawing leaves open. */
  footprint: jsonb("footprint").$type<[number, number][]>(),
  holes: jsonb("holes").$type<[number, number][][]>().notNull().default([]),
  labelPoint: jsonb("label_point").$type<[number, number]>().notNull(),
  areaM2: doublePrecision("area_m2").notNull(),
  source: jsonb("source").$type<DraftSource>().notNull(),
  acceptedRoomId: text("accepted_room_id"),
  ...auditColumns,
}, t => ({ levelIdx: index("room_drafts_level_idx").on(t.levelId) }));
```

In `packages/server/src/entities/registry.ts`:
- Add `RoomDraftSchema` to the `@oth/model` import.
- Append `"roomDraft"` as the last entry of `ENTITY_TYPES`.
- Add to `entityRegistry`:

```ts
  roomDraft: { table: schema.roomDrafts as EntityTable, schema: RoomDraftSchema },
```

`assembleModel` names its tables one by one, so this does not put drafts in `/api/model`, and the test above holds it to that.

In `packages/server/src/cli/dataTables.ts`:
- In `CARRIED_TABLES`, after `"level_images",`, add `"plan_pdfs", "room_drafts",`.
- Change `FILE_TABLES` to `["assets", "level_images", "keyframes", "plan_pdfs"] as const`.

Without this, `data:export` refuses to run once the migration adds the tables. With `plan_pdfs` in `FILE_TABLES`, every PDF goes to Railway with its row. A path kept inside the `source` JSON would have been left behind.

- [ ] **Step 5: Write `images/pdf.ts` and the source routes**

`packages/server/src/images/pdf.ts`:

```ts
/** The largest PDF a floor's plan may come from: a CAD sheet with every layer on runs to tens of megabytes. */
export const PDF_MAX_BYTES = 50 * 1024 * 1024;

const SIGNATURE = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-

/**
 * Whether the bytes are a PDF by their header, which readers accept anywhere
 * in the first 1024 bytes. Nothing more is read: the server never parses a
 * PDF (spec §5.1). A pdf.js bug read here would be a server bug.
 */
export function looksLikePdf(bytes: Uint8Array): boolean {
  const last = Math.min(bytes.length - SIGNATURE.length, 1024 - SIGNATURE.length);
  for (let i = 0; i <= last; i++) {
    if (SIGNATURE.every((b, j) => bytes[i + j] === b)) return true;
  }
  return false;
}

/** A download name that cannot break out of its header. */
export function attachmentName(filename: string): string {
  const safe = filename.replace(/[^\w.\- ]/g, "_").slice(0, 120) || "plan";
  return /\.pdf$/i.test(safe) ? safe : `${safe}.pdf`;
}
```

In `packages/server/src/images/routes.ts`:

- Add imports:

```ts
import { PlanSheetSchema } from "@oth/model";
import { bodyLimit } from "hono/body-limit";
import { levelImages, levels, planPdfs } from "../db/schema";
import { PDF_MAX_BYTES, attachmentName, looksLikePdf } from "./pdf";
```

  The `levelImages, levels` import line already exists: add `planPdfs` to it.

- Append after the `/:id/file` route:

```ts
/**
 * The PDF a plan was drawn from, kept beside it so any teammate can find rooms
 * in it later (spec §5.3). Checked by its header and its size, and nothing
 * else.
 */
levelImageRoutes.post(
  "/:id/source",
  bodyLimit({ maxSize: PDF_MAX_BYTES + 1024 * 1024, onError: c => c.json({ error: "The PDF is over 50 MB." }, 413) }),
  async c => {
    const db = c.get("db");
    const id = c.req.param("id");
    const form = await c.req.formData().catch(() => null);
    const file = form?.get("file");
    const sheetText = form?.get("sheet");
    const expectedVersion = Number(form?.get("expectedVersion"));
    if (!(file instanceof File) || typeof sheetText !== "string" || !Number.isInteger(expectedVersion) || expectedVersion < 0) {
      return c.json({ error: "expected multipart fields 'file', 'sheet' and 'expectedVersion'" }, 400);
    }
    let sheetJson: unknown = null;
    try {
      sheetJson = JSON.parse(sheetText);
    } catch {
      // Refused just below, as any other sheet the schema will not take.
    }
    const sheet = PlanSheetSchema.safeParse(sheetJson);
    if (!sheet.success) return c.json({ error: "invalid sheet", detail: String(sheet.error) }, 422);

    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.byteLength > PDF_MAX_BYTES) return c.json({ error: "The PDF is over 50 MB." }, 422);
    if (!looksLikePdf(bytes)) return c.json({ error: "not a PDF file" }, 422);

    const [image] = await db.select().from(levelImages).where(eq(levelImages.id, id));
    if (!image || image.deletedAt) return c.json({ error: "not found" }, 404);

    const stored = await storeAsset(c.get("dataDir"), bytes, "pdf");
    const pdfId = `pdf_${stored.checksum.slice(0, 16)}`;
    // Content-addressed like every stored file: the same PDF sent for two floors is kept once.
    await db.insert(planPdfs).values({
      id: pdfId, filename: file.name, storagePath: stored.storagePath, checksum: stored.checksum,
      sizeBytes: bytes.byteLength, uploadedBy: c.get("user").id,
    }).onConflictDoNothing();

    const [row] = await db.update(levelImages)
      .set({
        source: { ...sheet.data, pdfId, checksum: stored.checksum, filename: file.name },
        version: expectedVersion + 1,
        updatedBy: c.get("user").id,
        updatedAt: new Date(),
      })
      .where(and(eq(levelImages.id, id), eq(levelImages.version, expectedVersion)))
      .returning();
    if (!row) return c.json({ error: "version conflict", current: image }, 409);
    return c.json({ image: row });
  },
);

levelImageRoutes.get("/:id/source", async c => {
  const db = c.get("db");
  const [row] = await db.select().from(levelImages).where(eq(levelImages.id, c.req.param("id")));
  const pdfId = row?.source?.pdfId;
  if (!pdfId) return c.json({ error: "this plan did not come from a PDF" }, 404);
  const [pdf] = await db.select().from(planPdfs).where(eq(planPdfs.id, pdfId));
  if (!pdf) return c.json({ error: "not found" }, 404);
  const bytes = await readAsset(c.get("dataDir"), pdf.storagePath);
  return c.body(bytes.buffer as ArrayBuffer, 200, {
    "content-type": "application/pdf",
    // A download, never a page: a PDF shown on the app's own origin would run whatever it carries there.
    "content-disposition": `attachment; filename="${attachmentName(pdf.filename)}"`,
    "x-content-type-options": "nosniff",
    "cache-control": "private, no-cache",
  });
});
```

- [ ] **Step 6: Write the drafts service**

`packages/server/src/drafts/service.ts`:

```ts
import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { RoomDraftInputSchema, type DraftSource, type RoomKind } from "@oth/model";
import type { Database } from "../db/client";
import { toModelRow, type Row } from "../db/rows";
import { levels, roomDrafts, rooms } from "../db/schema";
import {
  NotFoundError, VersionConflictError, createEntity, restoreEntity, softDeleteEntity, updateEntity,
} from "../entities/repository";

/** At most this many drafts in one search (spec §5.3). */
export const MAX_DRAFTS = 1000;

/** A request the drafts cannot take, in words the reviewer can act on. Answered 422. */
export class DraftRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DraftRefusedError";
  }
}

export type AcceptItem = { id: string; expectedVersion: number; nameEn?: string; kind?: RoomKind };
export type UnacceptItem = { id: string; expectedVersion: number; roomVersion: number };
export type Accepted = { draftId: string; draftVersion: number; roomId: string; roomVersion: number };

/**
 * A room's id from its name, as plan:l1 made L1's: the floor's code, the name
 * as a slug of at most 48 characters, then -2, -3… until it is free. `taken`
 * holds every room id, deleted ones too (an id is a primary key), and this
 * adds the one it gives.
 */
export function roomIdFor(code: string, name: string, taken: Set<string>): string {
  const prefix = code.replace(/[^A-Za-z0-9_-]/g, "") || "room";
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48).replace(/-+$/, "") || "space";
  const base = `${prefix}-${slug}`;
  let id = base;
  for (let i = 2; taken.has(id); i++) id = `${base}-${i}`;
  taken.add(id);
  return id;
}

/** A floor's drafts still waiting for review, largest first, as the script ordered them. */
export async function listDrafts(db: Database, levelId: string): Promise<Row[]> {
  const rows = await db.select().from(roomDrafts).where(and(
    eq(roomDrafts.levelId, levelId), isNull(roomDrafts.deletedAt), isNull(roomDrafts.acceptedRoomId),
  ));
  return rows.map(r => toModelRow(r as unknown as Row)).sort((a, b) => Number(b.areaM2) - Number(a.areaM2));
}

/**
 * A new search's drafts in place of the floor's old ones, in one transaction.
 * Accepted drafts are rooms now and are not touched. The old live ones are
 * retired together, at one moment, like every batch removal here.
 */
export async function replaceDrafts(
  db: Database, levelId: string, source: DraftSource, inputs: readonly unknown[], actor: string,
): Promise<Row[]> {
  return db.transaction(async t => {
    const tx = t as unknown as Database;
    const [level] = await tx.select().from(levels).where(eq(levels.id, levelId));
    if (!level) throw new DraftRefusedError(`There is no floor ${levelId}.`);
    const at = new Date();
    const live = await tx.select().from(roomDrafts)
      .where(and(eq(roomDrafts.levelId, levelId), isNull(roomDrafts.deletedAt)));
    for (const d of live) await softDeleteEntity(tx, "roomDraft", d.id, d.version, actor, at);
    const out: Row[] = [];
    for (const input of inputs) {
      const draft = { ...RoomDraftInputSchema.parse(input), id: `rd_${randomUUID()}`, levelId, source };
      out.push(toModelRow(await createEntity(tx, "roomDraft", draft, actor)));
    }
    return out;
  });
}

/**
 * Drafts made rooms, all or none (spec §5.2 step 7). Each room gets its id
 * from its name and its height from its floor. It is walkable if it is an
 * area, and its verification is `cad`, with the PDF's checksum as evidence.
 * Each draft is retired pointing at the room it became, so the undo can find
 * both.
 */
export async function acceptDrafts(db: Database, items: readonly AcceptItem[], actor: string): Promise<Accepted[]> {
  return db.transaction(async t => {
    const tx = t as unknown as Database;
    const taken = new Set((await tx.select({ id: rooms.id }).from(rooms)).map(r => r.id));
    const out: Accepted[] = [];
    for (const item of items) {
      const [draft] = await tx.select().from(roomDrafts).where(eq(roomDrafts.id, item.id));
      if (!draft) throw new NotFoundError();
      if (draft.acceptedRoomId) throw new DraftRefusedError(`${draft.nameEn} is on the map already.`);
      if (draft.deletedAt) {
        throw new DraftRefusedError(`${draft.nameEn} is no longer waiting for review: it was rejected, or the drawing was searched again.`);
      }
      // The draft's version is the check that matters, so it comes before anything is written.
      if (draft.version !== item.expectedVersion) throw new VersionConflictError(toModelRow(draft as unknown as Row));
      if (!draft.footprint) {
        throw new DraftRefusedError(`${draft.nameEn} is left open on the drawing, so it has no shape to add. Draw it by hand.`);
      }
      const [level] = await tx.select().from(levels).where(eq(levels.id, draft.levelId));
      if (!level) throw new DraftRefusedError(`There is no floor ${draft.levelId}.`);
      const nameEn = item.nameEn?.trim() || draft.nameEn;
      const kind = item.kind ?? (draft.kind as RoomKind);
      const roomId = roomIdFor(level.code, nameEn, taken);
      const room = await createEntity(tx, "room", {
        id: roomId, levelId: draft.levelId, kind,
        footprint: draft.footprint, holes: draft.holes,
        // As tall as its storey, like every room plan:l1 made; a column stands floor to ceiling.
        heightM: level.heightM,
        // An area is floor you cross; a room is somewhere you arrive.
        walkable: kind === "area",
        nameEn, nameZh: "",
        verification: { status: "cad", evidence: [`pdf:${draft.source.checksum}`] },
      }, actor);
      const renamed = await updateEntity(tx, "roomDraft", draft.id, draft.version, { acceptedRoomId: roomId, nameEn, kind }, actor);
      const retired = await softDeleteEntity(tx, "roomDraft", draft.id, Number(renamed.version), actor);
      out.push({ draftId: draft.id, draftVersion: Number(retired.version), roomId, roomVersion: Number(room.version) });
    }
    return out;
  });
}

/**
 * The undo of an accept, as `/reopen` is for places: the room comes off the
 * map and the draft goes back to waiting, all or none. A room someone has
 * changed since is refused (409) rather than deleted with their change in it.
 */
export async function unacceptDrafts(db: Database, items: readonly UnacceptItem[], actor: string): Promise<number> {
  return db.transaction(async t => {
    const tx = t as unknown as Database;
    for (const item of items) {
      const [draft] = await tx.select().from(roomDrafts).where(eq(roomDrafts.id, item.id));
      if (!draft) throw new NotFoundError();
      if (!draft.acceptedRoomId || !draft.deletedAt) {
        throw new DraftRefusedError(`${draft.nameEn} isn't on the map, so there is nothing to take back.`);
      }
      if (draft.version !== item.expectedVersion) throw new VersionConflictError(toModelRow(draft as unknown as Row));
      const [room] = await tx.select().from(rooms).where(eq(rooms.id, draft.acceptedRoomId));
      if (room && !room.deletedAt) await softDeleteEntity(tx, "room", room.id, item.roomVersion, actor);
      const back = await restoreEntity(tx, "roomDraft", draft.id, item.expectedVersion, actor);
      await updateEntity(tx, "roomDraft", draft.id, Number(back.version), { acceptedRoomId: null }, actor);
    }
    return items.length;
  });
}
```

- [ ] **Step 7: Write the drafts routes and mount them**

`packages/server/src/drafts/routes.ts`:

```ts
import { DraftSourceSchema, RoomKindSchema } from "@oth/model";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z, ZodError } from "zod";
import type { AppEnv } from "../app";
import { requireUser } from "../auth/middleware";
import { NotFoundError, VersionConflictError } from "../entities/repository";
import {
  DraftRefusedError, MAX_DRAFTS, acceptDrafts, listDrafts, replaceDrafts, unacceptDrafts,
} from "./service";

const Version = z.number().int().nonnegative();
const ReplaceBody = z.object({ source: DraftSourceSchema, drafts: z.array(z.unknown()) });
const AcceptOne = z.object({
  expectedVersion: Version,
  nameEn: z.string().trim().min(1).max(200).optional(),
  kind: RoomKindSchema.optional(),
});
const AcceptMany = z.object({ items: z.array(AcceptOne.extend({ id: z.string().min(1) })).min(1).max(MAX_DRAFTS) });
const UnacceptOne = z.object({ expectedVersion: Version, roomVersion: Version });
const UnacceptMany = z.object({ items: z.array(UnacceptOne.extend({ id: z.string().min(1) })).min(1).max(MAX_DRAFTS) });

/**
 * The answer for a failure the request caused. Anything else is rethrown, so
 * onError answers 500 and the client offers Retry.
 */
function failure(err: unknown) {
  if (err instanceof VersionConflictError) {
    return { body: { error: "version conflict", current: err.current }, status: 409 as const };
  }
  if (err instanceof NotFoundError) return { body: { error: "not found" }, status: 404 as const };
  if (err instanceof DraftRefusedError) return { body: { error: err.message }, status: 422 as const };
  if (err instanceof ZodError) return { body: { error: "invalid draft", detail: String(err) }, status: 422 as const };
  throw err;
}

/** Mounted at /api/levels. */
export const levelDraftRoutes = new Hono<AppEnv>();
levelDraftRoutes.use("*", requireUser);

levelDraftRoutes.get("/:id/drafts", async c => c.json({ drafts: await listDrafts(c.get("db"), c.req.param("id")) }));

levelDraftRoutes.put(
  "/:id/drafts",
  bodyLimit({ maxSize: 2 * 1024 * 1024, onError: c => c.json({ error: "Too much to save at once: the drafts are over 2 MB." }, 413) }),
  async c => {
    const body = ReplaceBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "expected { source, drafts }" }, 400);
    if (body.data.drafts.length > MAX_DRAFTS) {
      return c.json({ error: `At most ${MAX_DRAFTS.toLocaleString("en")} drafts at once.` }, 422);
    }
    try {
      const drafts = await replaceDrafts(c.get("db"), c.req.param("id"), body.data.source, body.data.drafts, c.get("user").id);
      return c.json({ drafts });
    } catch (err) {
      const { body: out, status } = failure(err);
      return c.json(out, status);
    }
  },
);

/** Mounted at /api/room-drafts. Reject and its undo are the generic entity delete and restore. */
export const roomDraftRoutes = new Hono<AppEnv>();
roomDraftRoutes.use("*", requireUser);

roomDraftRoutes.post("/accept", async c => {
  const body = AcceptMany.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: "expected { items: [{ id, expectedVersion }] }" }, 400);
  try {
    return c.json({ accepted: await acceptDrafts(c.get("db"), body.data.items, c.get("user").id) });
  } catch (err) {
    const { body: out, status } = failure(err);
    return c.json(out, status);
  }
});

roomDraftRoutes.post("/unaccept", async c => {
  const body = UnacceptMany.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: "expected { items: [{ id, expectedVersion, roomVersion }] }" }, 400);
  try {
    return c.json({ drafts: await unacceptDrafts(c.get("db"), body.data.items, c.get("user").id) });
  } catch (err) {
    const { body: out, status } = failure(err);
    return c.json(out, status);
  }
});

roomDraftRoutes.post("/:id/accept", async c => {
  const body = AcceptOne.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: "expected { expectedVersion }" }, 400);
  try {
    const [accepted] = await acceptDrafts(c.get("db"), [{ id: c.req.param("id"), ...body.data }], c.get("user").id);
    return c.json({ accepted });
  } catch (err) {
    const { body: out, status } = failure(err);
    return c.json(out, status);
  }
});

roomDraftRoutes.post("/:id/unaccept", async c => {
  const body = UnacceptOne.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: "expected { expectedVersion, roomVersion }" }, 400);
  try {
    return c.json({ drafts: await unacceptDrafts(c.get("db"), [{ id: c.req.param("id"), ...body.data }], c.get("user").id) });
  } catch (err) {
    const { body: out, status } = failure(err);
    return c.json(out, status);
  }
});
```

In `packages/server/src/app.ts`:
- Add `import { levelDraftRoutes, roomDraftRoutes } from "./drafts/routes";`
- After `app.route("/api/level-images", levelImageRoutes);`, add:

```ts
  app.route("/api/levels", levelDraftRoutes);
  app.route("/api/room-drafts", roomDraftRoutes);
```

- [ ] **Step 8: Typecheck**

Run: `bash .superpowers/run-tests.sh tsc packages/model packages/server`
Expected: no errors. The tests still fail: PGlite has no `plan_pdfs` or `room_drafts` table until Step 10 generates the migration.

- [ ] **Step 9: Check the generic entity routes with the new type**

`isEntityType("roomDraft")` is now true. The generic delete and restore need nothing more: a draft is not a capture or a place, which are the two restore special cases in `entities/routes.ts`.

The listing (`listDrafts`) leaves out a draft with `acceptedRoomId` even when it is live. So a generic restore of an accepted draft, which no screen offers, cannot show it twice.

Part C's MCP tools (`mcp/tools/edit.ts`, `mcp/tools/read.ts`) take their types from `ENTITY_TYPES`. So `get`, `create`, `update`, `delete` and `restore` now reach drafts too. That is harmless, and it is what C's `review_draft` will build on. It is also why Step 10 runs C's MCP tests.

- [ ] **Step 10: Generate the migration, run the tests, commit**

This part's one migration is generated here, not in the last task, and there are two reasons:
- the server tests run against PGlite, which is built from `packages/server/drizzle/`;
- `level_images.source` is part of the first shippable slice.

Run: `npm run db:generate -w @oth/server`
Expected: a new `packages/server/drizzle/0012_<name>.sql`, a snapshot in `drizzle/meta/`, and a journal entry. Read the SQL. It must contain only:
- `CREATE TABLE "plan_pdfs"`;
- `CREATE TABLE "room_drafts"`, with its index;
- `ALTER TABLE "level_images" ADD COLUMN "source" jsonb`.

Nothing is dropped or renamed.

Part C's `0011` (tokens, and the audit's `via`) is already on the branch, so this one is `0012`. **If another part's migration lands before this one is committed** (D's portal footprint, say), the one that lands second regenerates (spec §8):
1. `git rm` this part's `0012_*.sql` and its snapshot.
2. `git checkout HEAD -- packages/server/drizzle/meta/_journal.json`.
3. `npm run db:generate -w @oth/server`.
4. Rerun the server tests below.

Run:
- `bash .superpowers/run-tests.sh vitest packages/server/src/drafts`
- `bash .superpowers/run-tests.sh vitest packages/server/src/images`
- `bash .superpowers/run-tests.sh vitest packages/server/src/cli/dataTransfer.test.ts`
- `bash .superpowers/run-tests.sh vitest packages/model/src/schema`
- `bash .superpowers/run-tests.sh vitest packages/server/src/mcp`

Expected: all PASS, run one after another. The data-transfer test's "knows every table in the schema" passes only because Step 4 listed both tables. If an MCP test lists the entity types word for word, add `roomDraft` to its expectation and say so in your report. It is C's file, so change nothing else in it.

```bash
git add packages/model/src/schema/pdfPlan.ts packages/model/src/schema/pdfPlan.test.ts packages/model/src/index.ts packages/server/src/db/schema.ts packages/server/src/entities/registry.ts packages/server/src/images/pdf.ts packages/server/src/images/routes.ts packages/server/src/images/source.test.ts packages/server/src/drafts packages/server/src/app.ts packages/server/src/cli/dataTables.ts packages/server/drizzle
git commit --only -m "feat(server): a floor's PDF beside its plan, and room drafts to review

The PDF is stored, content-addressed, in plan_pdfs, and never parsed: the
server checks its %PDF- header and its 50 MB limit, and serves it back as
an attachment with nosniff. level_images.source records the sheet, the
window and the points per pixel. roomDraft is an entity kept out of the
map. A PUT replaces a floor's live drafts. Accept makes rooms, all or
none, from the drawing (cad, pdf:<sha256>), and unaccept is its undo.
data:export carries both tables, and the PDFs with them.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- packages/model/src/schema/pdfPlan.ts packages/model/src/schema/pdfPlan.test.ts packages/model/src/index.ts packages/server/src/db/schema.ts packages/server/src/entities/registry.ts packages/server/src/images/pdf.ts packages/server/src/images/routes.ts packages/server/src/images/source.test.ts packages/server/src/drafts packages/server/src/app.ts packages/server/src/cli/dataTables.ts packages/server/drizzle
```

---
### Task 3: The raster operations, ported

This task is a faithful port of the script's `shift_or`, `dilate`, `erode`, `loops`, `drop_collinear`, `rdp`, `clean`, `nearest` and PIL's `floodfill`, on typed arrays. Everything is pure, so it runs in the worker and in the tests alike.

**Files:**
- Create: `packages/editor/src/pdf/raster.ts`
- Test: `packages/editor/src/pdf/raster.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces, used by Task 5:
  - Types:
    - `type Grid = { data: Uint8Array; width: number; height: number }`: row-major, 1 set, 0 clear.
    - `type Pt = [number, number]`
    - `type Region = { pixels: Int32Array; minX; minY; maxX; maxY }`: indices into the whole grid.
    - `type Window = Grid & { x0: number; y0: number }`: a sub-grid, and where it sits in the whole.
  - Morphology: `dilate(g, r)`, `erode(g, r)`, `invert(g)`, `and(a, b)`, `countSet(g)`, `firstSet(g)`
  - Flooding: `nearest(ok, sx, sy, reach = 40): Pt | null`, and `class Flooder { constructor(width, height); fill(passable: Uint8Array, seed: Pt, limit = Infinity): Region | null }`
  - Windows: `regionWindow(region, whole, pad): Window`, `cropLike(whole, win): Grid`
  - Cleaning: `clean(g, metresPerPixel, spurM = 0.3, notchM = 0.3)`, `cleanPad(metresPerPixel, spurM = 0.3, notchM = 0.3)`
  - Tracing: `loops(g): Pt[][]`, whose corners lie on pixel boundaries in the grid's own corner space (0…width, 0…height), and `dropCollinear(ring)`, `rdp(pts, eps)`

- [ ] **Step 1: Write the failing tests**

`packages/editor/src/pdf/raster.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  Flooder, and, clean, cleanPad, countSet, cropLike, dilate, dropCollinear, erode, firstSet,
  loops, nearest, rdp, regionWindow, type Grid,
} from "./raster";

/** A grid from rows of "#" (set) and "." (clear). */
function grid(rows: string[]): Grid {
  const width = rows[0]!.length;
  const data = new Uint8Array(width * rows.length);
  rows.forEach((row, y) => [...row].forEach((ch, x) => { data[y * width + x] = ch === "#" ? 1 : 0; }));
  return { data, width, height: rows.length };
}
const show = (g: Grid) =>
  Array.from({ length: g.height }, (_, y) => Array.from(g.data.subarray(y * g.width, (y + 1) * g.width), v => (v ? "#" : ".")).join(""));

/** The script's shift_or, one line for one line: each set pixel spreads r along its row and its column. */
function shiftOr(a: Grid, r: number): Grid {
  const out = a.data.slice();
  const { width: W, height: H } = a;
  for (let d = 1; d <= r; d++) {
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (!a.data[y * W + x]) continue;
        if (y + d < H) out[(y + d) * W + x] = 1;
        if (y - d >= 0) out[(y - d) * W + x] = 1;
        if (x + d < W) out[y * W + x + d] = 1;
        if (x - d >= 0) out[y * W + x - d] = 1;
      }
    }
  }
  return { data: out, width: W, height: H };
}

function random(width: number, height: number, seed: number, density = 0.1): Grid {
  let s = seed;
  const next = () => ((s = (s * 1103515245 + 12345) >>> 0) / 2 ** 32);
  return { data: Uint8Array.from({ length: width * height }, () => (next() < density ? 1 : 0)), width, height };
}

describe("dilate and erode", () => {
  it("spread along rows and columns, a cross and not a square, exactly as the script's shift_or", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const g = random(37, 23, seed);
      for (const r of [1, 3, 6]) {
        expect(dilate(g, r).data).toEqual(shiftOr(g, r).data);
        const inverted = { ...g, data: g.data.map(v => 1 - v) };
        expect(erode(g, r).data).toEqual(shiftOr(inverted, r).data.map(v => 1 - v));
      }
    }
  });

  it("dilate by a cross: a lone pixel becomes a plus", () => {
    expect(show(dilate(grid([".....", ".....", "..#..", ".....", "....."]), 2))).toEqual([
      "..#..", "..#..", "#####", "..#..", "..#..",
    ]);
  });

  it("erodes nothing at the grid's edge: outside counts as set, as in the script", () => {
    expect(countSet(erode(grid(["###", "###", "###"]), 1))).toBe(9);
  });
});

describe("Flooder", () => {
  it("floods four ways, never through a corner, as PIL's floodfill does", () => {
    const g = grid(["##..", "##..", "..##", "..##"]);
    const region = new Flooder(4, 4).fill(g.data, [0, 0])!;
    expect(region.pixels.length).toBe(4);
    expect([region.minX, region.minY, region.maxX, region.maxY]).toEqual([0, 0, 1, 1]);
  });

  it("gives up once the flood passes its limit: bigger than any room", () => {
    expect(new Flooder(4, 4).fill(new Uint8Array(16).fill(1), [0, 0], 10)).toBeNull();
  });

  it("floods again and again on one grid without clearing it", () => {
    const g = grid(["#.#", "#.#"]);
    const flooder = new Flooder(3, 2);
    expect(flooder.fill(g.data, [0, 0])!.pixels.length).toBe(2);
    expect(flooder.fill(g.data, [2, 0])!.pixels.length).toBe(2);
    expect(flooder.fill(g.data, [0, 1])!.pixels.length).toBe(2);
  });
});

describe("nearest", () => {
  it("is the seed itself when it is set, else the nearest set pixel in the first square that has one", () => {
    const g = grid([".....", ".....", ".....", "....#", "....."]);
    expect(nearest(g, 4, 3)).toEqual([4, 3]);
    expect(nearest(g, 2, 2)).toEqual([4, 3]);
    expect(nearest(g, 0, 0, 3)).toBeNull();
  });
});

describe("regionWindow and cropLike", () => {
  it("cuts a region out with room round it, and the same part of another grid", () => {
    const whole = grid(["......", ".##...", ".##...", "......"]);
    const region = new Flooder(6, 4).fill(whole.data, [1, 1])!;
    const win = regionWindow(region, whole, 1);
    expect([win.x0, win.y0, win.width, win.height]).toEqual([0, 0, 4, 4]);
    expect(show(win)).toEqual(["....", ".##.", ".##.", "...."]);
    expect(show(cropLike(grid(["#.....", "......", "......", ".....#"]), win))).toEqual(["#...", "....", "....", "...."]);
    expect(firstSet(win)).toBe(5);
    expect(countSet(and(win, cropLike(whole, win)))).toBe(4);
  });
});

describe("loops", () => {
  it("walks the cracks between pixels, so a corner lands on the wall line itself", () => {
    const [ring, ...rest] = loops(grid(["...", ".#.", "..."]));
    expect(rest).toEqual([]);
    expect(new Set(ring!.map(p => p.join(",")))).toEqual(new Set(["1,1", "2,1", "2,2", "1,2"]));
  });

  it("gives a room with a column in it an outer ring and a hole", () => {
    const rings = loops(grid(["#####", "#####", "##.##", "#####", "#####"])).sort((a, b) => b.length - a.length);
    expect(rings).toHaveLength(2);
    const xs = rings[0]!.map(p => p[0]);
    expect([Math.min(...xs), Math.max(...xs)]).toEqual([0, 5]);
    expect(new Set(rings[1]!.map(p => p.join(",")))).toEqual(new Set(["2,2", "3,2", "3,3", "2,3"]));
  });
});

describe("dropCollinear and rdp", () => {
  it("drops the corners of a straight run", () => {
    expect(dropCollinear([[0, 0], [1, 0], [2, 0], [2, 1], [2, 2], [0, 2]])).toEqual([[0, 0], [2, 0], [2, 2], [0, 2]]);
  });

  it("simplifies a closed ring without collapsing it to two points", () => {
    const stairs: [number, number][] = [[0, 0], [10, 0], [10, 1], [11, 1], [11, 10], [0, 10]];
    const simple = rdp([...stairs, stairs[0]!], 1.5).slice(0, -1);
    expect(simple).toEqual([[0, 0], [10, 0], [11, 10], [0, 10]]);
  });
});

describe("clean", () => {
  it("cuts a spur back, closes a pinhole, and cuts a room's corners, as the script's cross does", () => {
    // A 2 × 2 m room at 0.05 m per pixel, a 0.5 m spur off its west wall, and a one-pixel hole in the middle.
    const rows = Array.from({ length: 60 }, (_, y) =>
      Array.from({ length: 60 }, (_, x) => {
        const room = x >= 10 && x < 50 && y >= 10 && y < 50;
        const spur = y === 30 && x < 10;
        const pinhole = x === 30 && y === 30;
        return (room && !pinhole) || spur ? "#" : ".";
      }).join(""));
    const cleaned = clean(grid(rows), 0.05);
    const at = (x: number, y: number) => cleaned.data[y * 60 + x];
    // Along its own row the cross cannot see how thin a spur is, so the 5 px next to the wall stay;
    // the 0.4 m simplify takes them when the room is traced.
    expect(at(2, 30)).toBe(0);
    expect(at(7, 30)).toBe(1);
    expect(at(30, 30)).toBe(1);
    expect(at(10, 20)).toBe(1);
    // Opening by a cross takes a 5 px square off each corner; the 0.4 m simplify then smooths it, as on L1.
    expect(at(10, 10)).toBe(0);
    expect(cleanPad(0.05)).toBe(9);
  });
});
```

Run: `bash .superpowers/run-tests.sh vitest packages/editor/src/pdf/raster.test.ts`
Expected: FAIL. `./raster` does not resolve.

- [ ] **Step 2: Write `raster.ts`**

`packages/editor/src/pdf/raster.ts`:

```ts
/**
 * The raster half of `scripts/extract-storey-plan.py`, on typed arrays. A grid
 * is row-major, one byte a pixel, 1 set and 0 clear. Each function matches its
 * Python counterpart, including where the script is odd, because L1's 193
 * rooms came out of the Python and a port that disagrees would move walls.
 */
export type Grid = { data: Uint8Array; width: number; height: number };
export type Pt = [number, number];
export type Region = { pixels: Int32Array; minX: number; minY: number; maxX: number; maxY: number };
export type Window = Grid & { x0: number; y0: number };

/**
 * Set every pixel within r of a set one along its row or its column: the
 * script's `shift_or`, a cross and not a square. Rows and columns each read
 * the original, so this is the union of the two, as the script's four shifts
 * are. Nothing outside the grid is set.
 */
export function dilate(g: Grid, r: number): Grid {
  const { width: W, height: H, data } = g;
  const out = data.slice();
  if (r <= 0) return { width: W, height: H, data: out };
  for (let y = 0; y < H; y++) {
    const row = y * W;
    let last = -Infinity;
    for (let x = 0; x < W; x++) {
      if (data[row + x]) last = x;
      else if (x - last <= r) out[row + x] = 1;
    }
    last = Infinity;
    for (let x = W - 1; x >= 0; x--) {
      if (data[row + x]) last = x;
      else if (last - x <= r) out[row + x] = 1;
    }
  }
  for (let x = 0; x < W; x++) {
    let last = -Infinity;
    for (let y = 0; y < H; y++) {
      if (data[y * W + x]) last = y;
      else if (y - last <= r) out[y * W + x] = 1;
    }
    last = Infinity;
    for (let y = H - 1; y >= 0; y--) {
      if (data[y * W + x]) last = y;
      else if (last - y <= r) out[y * W + x] = 1;
    }
  }
  return { width: W, height: H, data: out };
}

export function invert(g: Grid): Grid {
  return { width: g.width, height: g.height, data: g.data.map(v => (v ? 0 : 1)) };
}

/** `~shift_or(~a, r)`: outside the grid counts as set, so nothing wears away at its edge. */
export function erode(g: Grid, r: number): Grid {
  return invert(dilate(invert(g), r));
}

export function and(a: Grid, b: Grid): Grid {
  const data = new Uint8Array(a.data.length);
  for (let i = 0; i < data.length; i++) data[i] = a.data[i]! & b.data[i]!;
  return { width: a.width, height: a.height, data };
}

export function countSet(g: Grid): number {
  let n = 0;
  for (let i = 0; i < g.data.length; i++) n += g.data[i]!;
  return n;
}

/** The first set pixel in reading order, as `np.nonzero` finds it; −1 for none. */
export function firstSet(g: Grid): number {
  return g.data.indexOf(1);
}

/**
 * The set pixel nearest (sx, sy): the seed itself if it is set, otherwise the
 * closest in the first growing square that holds any, first in reading order
 * on a tie. That is the script's `nearest`, reach 40.
 */
export function nearest(ok: Grid, sx: number, sy: number, reach = 40): Pt | null {
  const { width: W, height: H, data } = ok;
  if (data[sy * W + sx]) return [sx, sy];
  for (let r = 1; r < reach; r++) {
    const y0 = Math.max(sy - r, 0);
    const y1 = Math.min(sy + r + 1, H);
    const x0 = Math.max(sx - r, 0);
    const x1 = Math.min(sx + r + 1, W);
    let best: Pt | null = null;
    let bestD = Infinity;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        if (!data[y * W + x]) continue;
        const d = (x - sx) ** 2 + (y - sy) ** 2;
        if (d < bestD) {
          bestD = d;
          best = [x, y];
        }
      }
    }
    if (best) return best;
  }
  return null;
}

/**
 * Four-way floods over one grid size, as PIL's floodfill. A stamp per pixel
 * says which flood saw it last, so the hundreds of floods on one sheet never
 * copy or clear the whole grid. The script copied the image for every label.
 */
export class Flooder {
  private readonly seen: Int32Array;
  private stamp = 0;
  private stack = new Int32Array(4096);

  constructor(readonly width: number, readonly height: number) {
    this.seen = new Int32Array(width * height);
  }

  /** The pixels joined to `seed`, or null once there are more than `limit`: bigger than any room. */
  fill(passable: Uint8Array, [sx, sy]: Pt, limit = Infinity): Region | null {
    const { width: W, height: H, seen } = this;
    const stamp = ++this.stamp;
    const seed = sy * W + sx;
    let minX = sx;
    let maxX = sx;
    let minY = sy;
    let maxY = sy;
    if (!passable[seed]) return { pixels: new Int32Array(0), minX, minY, maxX, maxY };
    const pixels: number[] = [];
    let top = 0;
    const push = (q: number) => {
      if (!passable[q] || seen[q] === stamp) return;
      seen[q] = stamp;
      if (top === this.stack.length) {
        const grown = new Int32Array(this.stack.length * 2);
        grown.set(this.stack);
        this.stack = grown;
      }
      this.stack[top++] = q;
    };
    push(seed);
    while (top > 0) {
      const p = this.stack[--top]!;
      pixels.push(p);
      if (pixels.length > limit) return null;
      const x = p % W;
      const y = (p - x) / W;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (x > 0) push(p - 1);
      if (x < W - 1) push(p + 1);
      if (y > 0) push(p - W);
      if (y < H - 1) push(p + W);
    }
    return { pixels: Int32Array.from(pixels), minX, minY, maxX, maxY };
  }
}

/** A region as its own small grid, with `pad` clear pixels round it (fewer where the whole ends). */
export function regionWindow(region: Region, whole: { width: number; height: number }, pad: number): Window {
  const x0 = Math.max(region.minX - pad, 0);
  const y0 = Math.max(region.minY - pad, 0);
  const x1 = Math.min(region.maxX + pad + 1, whole.width);
  const y1 = Math.min(region.maxY + pad + 1, whole.height);
  const width = x1 - x0;
  const height = y1 - y0;
  const data = new Uint8Array(width * height);
  for (const p of region.pixels) {
    const x = p % whole.width;
    const y = (p - x) / whole.width;
    data[(y - y0) * width + (x - x0)] = 1;
  }
  return { data, width, height, x0, y0 };
}

/** The same part of another whole grid. */
export function cropLike(whole: Grid, win: Window): Grid {
  const data = new Uint8Array(win.width * win.height);
  for (let y = 0; y < win.height; y++) {
    const from = (win.y0 + y) * whole.width + win.x0;
    data.set(whole.data.subarray(from, from + win.width), y * win.width);
  }
  return { data, width: win.width, height: win.height };
}

/** How much room `clean` needs round a mask: the script's pad. */
export function cleanPad(metresPerPixel: number, spurM = 0.3, notchM = 0.3): number {
  return Math.floor(Math.max(spurM, notchM) / metresPerPixel) + 4;
}

/**
 * Drops what is not the room: door swings, fixtures, the gap a cleared label
 * left in a wall. Opening takes off thin spurs, and closing fills notches.
 * Floor division as Python's int(): 0.3 / 0.05 is 5.999… in floating point,
 * so the radius is 5, as it was for L1.
 */
export function clean(g: Grid, metresPerPixel: number, spurM = 0.3, notchM = 0.3): Grid {
  const rs = Math.floor(spurM / metresPerPixel);
  const rn = Math.floor(notchM / metresPerPixel);
  return erode(dilate(dilate(erode(g, rs), rs), rn), rn);
}

/**
 * Every closed boundary of the set pixels, walked along the cracks between
 * pixels, so a vertex lands on the wall line itself rather than half a pixel
 * off it. The edges are gathered and walked in the script's order, so the
 * rings come out as its did.
 */
export function loops(g: Grid): Pt[][] {
  const { width: W, height: H, data } = g;
  const at = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && data[y * W + x] === 1;
  const CW = W + 1;
  const edges = new Map<number, number[]>();
  const add = (ax: number, ay: number, bx: number, by: number) => {
    const key = ay * CW + ax;
    const next = by * CW + bx;
    const list = edges.get(key);
    if (list) list.push(next);
    else edges.set(key, [next]);
  };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (at(x, y) && !at(x, y - 1)) add(x, y, x + 1, y);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (at(x, y) && !at(x + 1, y)) add(x + 1, y, x + 1, y + 1);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (at(x, y) && !at(x, y + 1)) add(x + 1, y + 1, x, y + 1);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (at(x, y) && !at(x - 1, y)) add(x, y + 1, x, y);

  const out: Pt[][] = [];
  while (edges.size > 0) {
    const start = edges.keys().next().value as number;
    let cur = start;
    const ring = [start];
    for (;;) {
      const nexts = edges.get(cur);
      if (!nexts || nexts.length === 0) break;
      const next = nexts.pop()!;
      if (nexts.length === 0) edges.delete(cur);
      cur = next;
      if (cur === start) break;
      ring.push(cur);
    }
    if (ring.length >= 4) out.push(ring.map(k => [k % CW, Math.floor(k / CW)] as Pt));
  }
  return out;
}

/** Drops the corners of a straight run, which the crack walk leaves at every pixel. */
export function dropCollinear(ring: readonly Pt[]): Pt[] {
  const n = ring.length;
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = ring[(i - 1 + n) % n]!;
    const p = ring[i]!;
    const b = ring[(i + 1) % n]!;
    if ((p[0] - a[0]) * (b[1] - p[1]) !== (p[1] - a[1]) * (b[0] - p[0])) out.push(p);
  }
  return out.length > 0 ? out : [...ring];
}

/**
 * Ramer–Douglas–Peucker. A closed ring starts and ends on the same point, so
 * its chord has no length and the perpendicular distance is undefined: the
 * distance from that point stands in, or the ring collapses to two points.
 */
export function rdp(pts: readonly Pt[], eps: number): Pt[] {
  if (pts.length < 3) return [...pts];
  const a = pts[0]!;
  const b = pts[pts.length - 1]!;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const den = Math.hypot(dx, dy);
  let best = -1;
  let bi = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i]!;
    const d = den ? Math.abs(dx * (a[1] - p[1]) - dy * (a[0] - p[0])) / den : Math.hypot(p[0] - a[0], p[1] - a[1]);
    if (d > best) {
      best = d;
      bi = i;
    }
  }
  if (best <= eps) return [a, b];
  return [...rdp(pts.slice(0, bi + 1), eps).slice(0, -1), ...rdp(pts.slice(bi), eps)];
}
```

- [ ] **Step 3: Run the tests to see them pass, and typecheck**

Run: `bash .superpowers/run-tests.sh vitest packages/editor/src/pdf/raster.test.ts`
Expected: PASS.

If the `rdp` staircase expectation differs, check the order of the returned points against the Python run by hand (`python -c` with the script's `rdp` on the same list), then fix the port, not the test's point set. The script's own output is the reference.

Run: `bash .superpowers/run-tests.sh tsc packages/editor`. Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/editor/src/pdf/raster.ts packages/editor/src/pdf/raster.test.ts
git commit --only -m "feat(editor): the storey-plan script's raster operations, on typed arrays

Dilate and erode by the script's cross, four-way floods that stamp rather
than copy, the crack-following trace, and its simplify and clean. Each is
held to the Python's behaviour, oddities included, since L1's rooms came
out of it.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- packages/editor/src/pdf/raster.ts packages/editor/src/pdf/raster.test.ts
```

---
### Task 4: The Floorplan step takes a PDF

This task is the first shippable slice. A dropped or chosen PDF becomes the floor's plan: rendered crisp, scaled from its own grid, placed over the floor below's when the two are one drawing set, and uploaded with its PDF.

**Files:**
- Create: `packages/editor/src/pdf/placement.ts`, `packages/editor/src/pdf/placement.test.ts`
- Create: `packages/editor/src/pdf/importPlan.ts`, `packages/editor/src/pdf/importPlan.test.ts`
- Create: `packages/editor/src/build/PdfPagePicker.tsx`, `packages/editor/src/build/PdfPagePicker.test.tsx`
- Modify: `packages/editor/src/build/FloorplanTools.tsx`, `packages/editor/src/build/FloorplanTools.test.tsx`
- Modify: `packages/editor/src/api/client.ts`, `packages/editor/src/testing/fakeApi.ts`
- Modify: `packages/server/src/static.ts`, `packages/server/src/static.test.ts`

**Interfaces:**
- Consumes from Task 1:
  - `openPdf`, `readBytes`, `looksLikePdf`, `PdfUnreadableError`, `PDF_MAX_BYTES`
  - `readSheet`, `fitBudget`, `renderMetresPerPixel`, `unscaledPointsPerPixel`
  - `renderWindow`, `encodeJpeg`, `CanvasTooLargeError`
  - `describeCalibration`
- Consumes from Task 2: `PlanSheet` and `PlanSource` from `@oth/model`, and `POST`/`GET /api/level-images/:id/source`.
- Produces:
  - `api/client.ts`:
    - `LevelImage.source?: PlanSource | null`
    - `api.uploadPlanSource(imageId, expectedVersion, pdf: Blob, filename, sheet: PlanSheet): Promise<LevelImage>`
    - `api.fetchPlanSource(imageId): Promise<Uint8Array>`
  - `placement.ts`:
    - `type NewPlan = { sheet: PlanSheet; widthPx: number; heightPx: number; metresPerPixel: number | null }`
    - `type Placed = { offsetX: number; offsetY: number; how: "same-sheet" | "centred" | "unplaced"; on: LevelImage | null }`
    - `placePlan(plan, current, below): Placed`
    - `sameSheet(sheet, ref): boolean`
  - `importPlan.ts`:
    - `type PageChoice = { number: number; title: string }`
    - `class NotAPdfError`
    - `importPdfPlan(o: PdfImport): Promise<{ image: LevelImage; report: string } | null>`
  - `PdfPagePicker.tsx`: `askForPage(choices): Promise<number | null>`, `<PdfPagePicker />`

- [ ] **Step 1: Write the failing tests**

`packages/editor/src/pdf/placement.test.ts`:

```ts
import type { PlanSheet, PlanSource } from "@oth/model";
import { describe, expect, it } from "vitest";
import type { LevelImage } from "../api/client";
import { placePlan } from "./placement";

const L1_SCALE = 0.7505;
const sheet = (over: Partial<PlanSheet> = {}): PlanSheet => ({
  page: 1, pageCount: 1, pageSizePt: [792, 612], rotation: 90, clipPt: [100, 50, 700, 560],
  pointsPerPixel: 0.07 / L1_SCALE, metresPerPoint: L1_SCALE, runsAgree: 2, runsFound: 3, ...over,
});
const source = (s: PlanSheet): PlanSource => ({ ...s, pdfId: "pdf_1", checksum: "a".repeat(64), filename: "L1.pdf" });
const image = (over: Partial<LevelImage> = {}): LevelImage => ({
  id: "img_below", levelId: "oth-L1", filename: "L1.jpg", widthPx: 6000, heightPx: 5000, sizeBytes: 1,
  metresPerPixel: 0.07, offsetX: -25, offsetY: 300, opacity: 0.6, version: 3, source: source(sheet()), ...over,
});
const plan = (s: PlanSheet, metresPerPixel: number | null = 0.07) => ({ sheet: s, widthPx: 4000, heightPx: 3000, metresPerPixel });

describe("placePlan", () => {
  it("puts a sheet of the same set exactly where the floor below's sits: one CAD set shares its viewport", () => {
    const placed = placePlan(plan(sheet({ clipPt: [120, 40, 690, 580] })), null, image());
    expect(placed.how).toBe("same-sheet");
    // 20 pt east and 10 pt north of the floor below's window, at 0.7505 m a point.
    expect(placed.offsetX).toBeCloseTo(-25 + 20 * L1_SCALE, 6);
    expect(placed.offsetY).toBeCloseTo(300 + 10 * L1_SCALE, 6);
  });

  it("prefers the plan it replaces when that was the same sheet: a new revision keeps its place", () => {
    const current = image({ id: "img_current", offsetX: 5, offsetY: 280 });
    const placed = placePlan(plan(sheet()), current, image());
    expect(placed).toMatchObject({ how: "same-sheet", offsetX: 5, offsetY: 280 });
    expect(placed.on?.id).toBe("img_current");
  });

  it("centres a sheet of another size on the floor below's plan", () => {
    const placed = placePlan(plan(sheet({ pageSizePt: [1190.55, 841.89] }), 0.05), null, image());
    expect(placed.how).toBe("centred");
    // The floor below's centre is (185, 125); this plan is 200 × 150 m.
    expect(placed.offsetX).toBeCloseTo(185 - 100, 6);
    expect(placed.offsetY).toBeCloseTo(125 + 75, 6);
  });

  it("does not take a sheet more than 0.5% off in scale for the same set", () => {
    expect(placePlan(plan(sheet({ metresPerPoint: 0.76 })), null, image()).how).toBe("centred");
  });

  it("reads the floor below at the scale it has now, after a hand correction", () => {
    // 1% more metres per pixel on the same render is 1% more metres per point: not the same set any more.
    expect(placePlan(plan(sheet()), null, image({ metresPerPixel: 0.0707 })).how).toBe("centred");
  });

  it("centres on a floor below whose plan came from an image", () => {
    expect(placePlan(plan(sheet()), null, image({ source: null })).how).toBe("centred");
  });

  it("leaves an unscaled plan, or one with nothing to go by, at the origin for Align", () => {
    expect(placePlan(plan(sheet(), null), null, image())).toMatchObject({ how: "unplaced", offsetX: 0, offsetY: 0 });
    expect(placePlan(plan(sheet()), null, null)).toMatchObject({ how: "unplaced", offsetX: 0, offsetY: 0 });
  });
});
```

`packages/editor/src/pdf/importPlan.test.ts`:

```ts
import type { PlanSheet } from "@oth/model";
import { describe, expect, it, vi } from "vitest";
import type { LevelImage } from "../api/client";
import { NotAPdfError, importPdfPlan, type PageChoice, type PdfImport } from "./importPlan";
import { PdfUnreadableError, readBytes } from "./pdfjs";
import { PLAN_SHEET_SCALE, planSheet, syntheticPdf } from "./testing/syntheticPdf";

const sheetPdf = (content = planSheet(), pages = 1) =>
  syntheticPdf(Array.from({ length: pages }, () => ({ width: 400, height: 300, content })));
const asFile = (bytes: Uint8Array, name = "L2.pdf") => new File([bytes.slice()], name, { type: "application/pdf" });

/** The three calls an import makes, each answering as the server would. */
function fakes() {
  let latest: LevelImage;
  const api = {
    uploadLevelImage: vi.fn(async (levelId: string, file: File) => {
      latest = {
        id: "img_new", levelId, filename: file.name, widthPx: 2092, heightPx: 2132, sizeBytes: file.size,
        metresPerPixel: null, offsetX: 0, offsetY: 0, opacity: 0.6, version: 0, source: null,
      };
      return latest;
    }),
    patchLevelImage: vi.fn(async (_id: string, version: number, patch: Partial<LevelImage>) => {
      latest = { ...latest, ...patch, version: version + 1 };
      return latest;
    }),
    uploadPlanSource: vi.fn(async (_id: string, version: number, _pdf: Blob, filename: string, sheet: PlanSheet) => {
      latest = { ...latest, version: version + 1, source: { ...sheet, pdfId: "pdf_x", checksum: "b".repeat(64), filename } };
      return latest;
    }),
  };
  return api;
}

const options = (over: Partial<PdfImport> = {}): PdfImport => ({
  api: fakes(), levelId: "oth-L2", file: asFile(sheetPdf()), current: null, below: null,
  choosePage: vi.fn(async () => 1), ...over,
});

describe("importPdfPlan", () => {
  it("draws the sheet as the floor's plan at 0.05 m per pixel, scaled from its own grid, with its PDF beside it", async () => {
    const pdf = sheetPdf();
    const o = options({ file: asFile(pdf) });
    const done = await importPdfPlan(o);
    const api = o.api as ReturnType<typeof fakes>;

    const [levelId, uploaded] = api.uploadLevelImage.mock.calls[0]!;
    expect(levelId).toBe("oth-L2");
    expect(uploaded.name).toBe("L2.jpg");
    expect(Array.from((await readBytes(uploaded)).subarray(0, 2))).toEqual([0xff, 0xd8]);

    const [, , patch] = api.patchLevelImage.mock.calls[0]!;
    expect(patch.metresPerPixel).toBeCloseTo(0.05, 10);

    const [, , sent, filename, sheet] = api.uploadPlanSource.mock.calls[0]!;
    expect(filename).toBe("L2.pdf");
    // Compared as plain arrays: FileReader hands back a Uint8Array from jsdom's realm.
    expect(Array.from(await readBytes(sent))).toEqual(Array.from(pdf));
    expect(sheet).toMatchObject({ page: 1, pageCount: 1, pageSizePt: [400, 300], rotation: 0, runsAgree: 2, runsFound: 2 });
    expect(sheet.metresPerPoint).toBeCloseTo(PLAN_SHEET_SCALE, 6);
    expect(sheet.pointsPerPixel).toBeCloseTo(0.1, 10);
    expect(sheet.clipPt[0]).toBeCloseTo(36.5, 0);

    expect(done!.image.source?.pdfId).toBe("pdf_x");
    expect(done!.report).toBe("Scale from the drawing's grid: 0.5000 m per point, 2 of 2 dimension runs agree. Line it up with Align.");
  });

  it("places the sheet over the floor below's when the two are one drawing set", async () => {
    const first = options();
    const below = (await importPdfPlan(first))!.image;
    const moved = { ...below, levelId: "oth-L1", offsetX: 40, offsetY: 90 };
    const o = options({ below: { code: "L1", image: moved } });
    const done = await importPdfPlan(o);
    const [, , patch] = (o.api as ReturnType<typeof fakes>).patchLevelImage.mock.calls[0]!;
    expect(patch).toMatchObject({ offsetX: 40, offsetY: 90 });
    expect(done!.report).toMatch(/It is placed over L1's plan, as the same drawing set\.$/);
  });

  it("asks which page when there are several, and stops without a word if you don't choose", async () => {
    const choosePage = vi.fn(async (_pages: PageChoice[]): Promise<number | null> => null);
    const o = options({ file: asFile(sheetPdf(planSheet(), 2)), choosePage });
    expect(await importPdfPlan(o)).toBeNull();
    expect(choosePage.mock.calls[0]![0].map(c => c.number)).toEqual([1, 2]);
    expect((o.api as ReturnType<typeof fakes>).uploadLevelImage).not.toHaveBeenCalled();
  });

  it("draws the page you choose", async () => {
    const o = options({ file: asFile(sheetPdf(planSheet(), 2)), choosePage: vi.fn(async () => 2) });
    await importPdfPlan(o);
    const [, , , , sheet] = (o.api as ReturnType<typeof fakes>).uploadPlanSource.mock.calls[0]!;
    expect(sheet).toMatchObject({ page: 2, pageCount: 2 });
  });

  it("adds a sheet with no grid whole and unscaled, and says how to scale it", async () => {
    const o = options({ file: asFile(sheetPdf(planSheet({ dimensions: false }))) });
    const done = await importPdfPlan(o);
    const api = o.api as ReturnType<typeof fakes>;
    expect(api.patchLevelImage.mock.calls[0]![2]).toEqual({ offsetX: 0, offsetY: 0 });
    const sheet = api.uploadPlanSource.mock.calls[0]![4];
    expect(sheet).toMatchObject({ metresPerPoint: null, clipPt: [0, 0, 400, 300], pointsPerPixel: 0.25 });
    expect(done!.report).toMatch(/^Not scaled: the drawing has no runs of grid dimensions/);
  });

  it("refuses a file that isn't a PDF before reading anything", async () => {
    const o = options({ file: asFile(new TextEncoder().encode("GIF89a"), "L2.pdf") });
    await expect(importPdfPlan(o)).rejects.toBeInstanceOf(NotAPdfError);
    expect((o.api as ReturnType<typeof fakes>).uploadLevelImage).not.toHaveBeenCalled();
  });

  it("calls a PDF it cannot read unreadable, not a lost connection", async () => {
    const o = options({ file: asFile(new TextEncoder().encode("%PDF-1.4\nnothing here")) });
    await expect(importPdfPlan(o)).rejects.toBeInstanceOf(PdfUnreadableError);
  });

  it("says what it is doing as it goes", async () => {
    const stages: string[] = [];
    await importPdfPlan(options({ stage: s => stages.push(s) }));
    expect(stages).toEqual(["Reading L2.pdf…", "Drawing the plan…", "Uploading L2.pdf…"]);
  });
});
```

`packages/editor/src/build/PdfPagePicker.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PdfPagePicker, askForPage } from "./PdfPagePicker";

const choices = [{ number: 1, title: "1ST STOREY PLAN" }, { number: 2, title: "2ND STOREY PLAN" }];

describe("PdfPagePicker", () => {
  it("asks which page is the floor's plan, and answers with the one you choose", async () => {
    render(<PdfPagePicker />);
    const answer = askForPage(choices);
    fireEvent.click(await screen.findByRole("button", { name: "Page 2 · 2ND STOREY PLAN" }));
    expect(await answer).toBe(2);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("answers nothing when you close it", async () => {
    render(<PdfPagePicker />);
    const answer = askForPage(choices);
    fireEvent.click(await screen.findByRole("button", { name: "Close" }));
    expect(await answer).toBeNull();
  });

  it("answers nothing at once when no picker is on screen to ask with", async () => {
    expect(await askForPage(choices)).toBeNull();
  });
});
```

Append to `packages/editor/src/build/FloorplanTools.test.tsx`:
- Add `import { planSheet, syntheticPdf } from "../pdf/testing/syntheticPdf";` to the imports.
- In the existing `it.each` of refused files, replace the PDF row with a GIF, and the message it expects:

```tsx
  it.each([
    ["not a plan at all", new File(["GIF89a"], "L1.gif", { type: "image/gif" })],
    ["over 20 MB", Object.defineProperty(file("L1.jpg"), "size", { value: 20 * 1024 * 1024 + 1 })],
  ])("refuses a file that is %s before sending it, and says what to do instead", async (_why, refused) => {
    const a = api();
    render(<PlanDropZone api={a} />);
    fireEvent.change(screen.getByLabelText("Choose a file"), { target: { files: [refused] } });
    await waitFor(() => expect(lastToast()?.message).toMatch(/Use the sheet's PDF, or a PNG or JPEG under 20 MB\./));
    expect(lastToast()?.tone).toBe("error");
    expect(a.uploadLevelImage).not.toHaveBeenCalled();
  });
```

- Then append this block at the end of the file:

```tsx
describe("a PDF plan", () => {
  const pdf = (content = planSheet(), name = "L2.pdf") =>
    new File([syntheticPdf([{ width: 400, height: 300, content }]).slice()], name, { type: "application/pdf" });

  function pdfApi(overrides: Partial<Record<keyof Api, unknown>> = {}) {
    return api({
      uploadPlanSource: vi.fn(async (id: string, version: number, _pdf: Blob, filename: string, sheet: Record<string, unknown>) =>
        ({ ...image, id, levelId: "oth-L1", filename: "L2.jpg", version: version + 1, source: { ...sheet, pdfId: "pdf_x", checksum: "b".repeat(64), filename } })),
      ...overrides,
    });
  }

  it("turns a dropped PDF into the floor's plan, scaled from the drawing's own grid", async () => {
    const a = pdfApi();
    render(<PlanDropZone api={a} />);
    fireEvent.drop(screen.getByTestId("plan-drop-zone"), { dataTransfer: { files: [pdf()] } });
    await waitFor(() => expect(a.uploadPlanSource).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(lastToast()?.message).toMatch(
      /^Added L2\.pdf\. Scale from the drawing's grid: 0\.5000 m per point, 2 of 2 dimension runs agree\./));
    expect(patches(a)[0]![2]).toMatchObject({ metresPerPixel: expect.closeTo(0.05, 10) });
    expect(useEditorStore.getState().levelImages.map(i => i.source?.pdfId)).toEqual(["pdf_x"]);
  });

  it("says what it is doing while it works on the sheet", async () => {
    let finish!: (value: LevelImage) => void;
    const a = pdfApi({ uploadLevelImage: vi.fn(() => new Promise<LevelImage>(resolve => { finish = resolve; })) });
    render(<PlanDropZone api={a} />);
    fireEvent.change(screen.getByLabelText("Choose a file"), { target: { files: [pdf()] } });
    expect(await screen.findByText("Uploading L2.pdf…")).toBeTruthy();
    expect(screen.getByLabelText("Choose a file")).toBeDisabled();
    finish({ ...image, id: "img_2" });
    await waitFor(() => expect(screen.queryByText(/Uploading/)).toBeNull());
  });

  it("says a file called .pdf that isn't one is not a PDF", async () => {
    render(<PlanDropZone api={pdfApi()} />);
    fireEvent.change(screen.getByLabelText("Choose a file"), { target: { files: [new File(["%PDF"], "L1.pdf", { type: "application/pdf" })] } });
    await waitFor(() => expect(lastToast()?.message).toBe("Couldn't add L1.pdf: it isn't a PDF."));
  });

  it("refuses a PDF over 50 MB before reading it", async () => {
    const big = Object.defineProperty(pdf(), "size", { value: 50 * 1024 * 1024 + 1 });
    const a = pdfApi();
    render(<PlanDropZone api={a} />);
    fireEvent.change(screen.getByLabelText("Choose a file"), { target: { files: [big] } });
    await waitFor(() => expect(lastToast()?.message).toBe("Couldn't add L2.pdf: a PDF must be under 50 MB."));
    expect(a.uploadLevelImage).not.toHaveBeenCalled();
  });

  it("says where a plan's scale came from", () => {
    const fromPdf: LevelImage = {
      ...image, metresPerPixel: 0.07,
      source: {
        page: 1, pageCount: 1, pageSizePt: [792, 612], rotation: 90, clipPt: [0, 0, 1, 1], pointsPerPixel: 0.0933,
        metresPerPoint: 0.7505, runsAgree: 2, runsFound: 3, pdfId: "pdf_1", checksum: "a".repeat(64), filename: "L1.pdf",
      },
    };
    useEditorStore.getState().setLevelImages([fromPdf]);
    render(<FloorplanTools api={api()} />);
    expect(screen.getByText(/0\.0700 m per pixel, from the drawing's grid/)).toBeTruthy();
  });
});
```

(`api`, `image`, `patches`, `lastToast` and `file` are the file's existing helpers. The test's `beforeEach` already sets the model, and so L1 is the active floor.)

Append to `packages/server/src/static.test.ts`, inside `describe("serving the built editor", …)`:

```ts
  it("serves an .mjs module as JavaScript, which a module worker (pdf.js's) must be", async () => {
    const dist = await distWithBuild();
    await writeFile(join(dist, "assets", "pdf.worker.min-abc123.mjs"), "export {};");
    const app = createApp({ db, editorDist: dist });
    const res = await app.request("/assets/pdf.worker.min-abc123.mjs");
    expect(res.headers.get("content-type")).toBe("text/javascript; charset=utf-8");
  });
```

Run:
- `bash .superpowers/run-tests.sh vitest packages/editor/src/pdf/placement.test.ts packages/editor/src/pdf/importPlan.test.ts`
- `bash .superpowers/run-tests.sh vitest packages/editor/src/build/PdfPagePicker.test.tsx packages/editor/src/build/FloorplanTools.test.tsx`
- `bash .superpowers/run-tests.sh vitest packages/server/src/static.test.ts`

Expected: FAIL. The new modules do not resolve, the refusal message is the old one, and `.mjs` is served as `application/octet-stream`.

- [ ] **Step 2: Add the API calls and the `.mjs` type**

In `packages/editor/src/api/client.ts`:

- Add `import type { PlanSheet, PlanSource } from "@oth/model";` beside the `@oth/model` import.
- In `LevelImage`, after `updatedAt?: string;`, add:

```ts
  /** Where the plan was drawn from on its PDF; absent or null for a plan that came as an image. */
  source?: PlanSource | null;
```

- At the end of the object `createApi` returns, after Part C's `--- Claude Code tokens (plan 5C) ---` block, append this one:

```ts
    // --- PDF plans and room drafts (plan 5B) ---

    /** Keeps the PDF a plan was drawn from beside it, with where on the sheet the plan is. */
    async uploadPlanSource(
      imageId: string, expectedVersion: number, pdf: Blob, filename: string, sheet: PlanSheet,
    ): Promise<LevelImage> {
      const form = new FormData();
      form.append("file", pdf, filename);
      form.append("sheet", JSON.stringify(sheet));
      form.append("expectedVersion", String(expectedVersion));
      return (await request<{ image: LevelImage }>(`/api/level-images/${imageId}/source`, { method: "POST", body: form })).image;
    },

    /** The PDF behind a plan, as bytes: a download, never shown on this origin. */
    async fetchPlanSource(imageId: string): Promise<Uint8Array> {
      const path = `/api/level-images/${imageId}/source`;
      const res = await doFetch(`${base}${path}`, { credentials: "same-origin" });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        if (isGateRefusal(res.status, body)) options.onGateClosed?.();
        else if (res.status === 401) options.onUnauthorized?.({ method: "GET", path });
        throw new ApiError(res.status, body);
      }
      return new Uint8Array(await res.arrayBuffer());
    },
```

In `packages/editor/src/testing/fakeApi.ts`, append inside the object, after Part C's block and before `...overrides`:

```ts
    // --- PDF plans and room drafts (plan 5B) ---
    uploadPlanSource: vi.fn(),
    fetchPlanSource: vi.fn(),
```

In `packages/server/src/static.ts`, add to `CONTENT_TYPES`, after `".js"`:

```ts
  // Vite emits pdf.js's worker as .mjs, and a browser refuses a module worker without a JavaScript type.
  ".mjs": "text/javascript; charset=utf-8",
```

- [ ] **Step 3: Write `placement.ts`**

```ts
import type { PlanSheet } from "@oth/model";
import type { LevelImage } from "../api/client";

export type NewPlan = { sheet: PlanSheet; widthPx: number; heightPx: number; metresPerPixel: number | null };
export type Placed = { offsetX: number; offsetY: number; how: "same-sheet" | "centred" | "unplaced"; on: LevelImage | null };

const SAME_SIZE_PT = 1;
const SAME_SCALE = 0.005;

/**
 * Whether a new sheet is one CAD set's with a plan already placed: the same
 * size and turn on the page, and the same scale as that plan has now. The
 * sheets of one set usually share their viewport (spec §5.2 step 4), so a
 * point on one is the same place in the building on the other.
 */
export function sameSheet(sheet: PlanSheet, ref: LevelImage): boolean {
  const src = ref.source;
  if (!src || ref.metresPerPixel == null || sheet.metresPerPoint == null) return false;
  const refScale = ref.metresPerPixel / src.pointsPerPixel;
  return src.rotation === sheet.rotation &&
    Math.abs(src.pageSizePt[0] - sheet.pageSizePt[0]) <= SAME_SIZE_PT &&
    Math.abs(src.pageSizePt[1] - sheet.pageSizePt[1]) <= SAME_SIZE_PT &&
    Math.abs(sheet.metresPerPoint - refScale) / refScale < SAME_SCALE;
}

/**
 * Where a new plan goes (spec §5.2 step 4). Where the same sheet already
 * sits: the plan it replaces, then the floor below's. Otherwise centred on
 * one of them. An unscaled plan, or one with nothing to go by, waits at the
 * origin. Align finishes the job either way.
 */
export function placePlan(plan: NewPlan, current: LevelImage | null, below: LevelImage | null): Placed {
  if (plan.metresPerPixel == null) return { offsetX: 0, offsetY: 0, how: "unplaced", on: null };
  for (const ref of [current, below]) {
    if (!ref || !sameSheet(plan.sheet, ref)) continue;
    const src = ref.source!;
    const refScale = ref.metresPerPixel! / src.pointsPerPixel;
    return {
      offsetX: ref.offsetX + (plan.sheet.clipPt[0] - src.clipPt[0]) * refScale,
      offsetY: ref.offsetY - (plan.sheet.clipPt[1] - src.clipPt[1]) * refScale,
      how: "same-sheet",
      on: ref,
    };
  }
  for (const ref of [current, below]) {
    if (!ref || ref.metresPerPixel == null) continue;
    const cx = ref.offsetX + (ref.widthPx * ref.metresPerPixel) / 2;
    const cy = ref.offsetY - (ref.heightPx * ref.metresPerPixel) / 2;
    return {
      offsetX: cx - (plan.widthPx * plan.metresPerPixel) / 2,
      offsetY: cy + (plan.heightPx * plan.metresPerPixel) / 2,
      how: "centred",
      on: ref,
    };
  }
  return { offsetX: 0, offsetY: 0, how: "unplaced", on: null };
}
```

- [ ] **Step 4: Write `importPlan.ts`**

```ts
import type { PlanSheet } from "@oth/model";
import type { Api, LevelImage } from "../api/client";
import { describeCalibration, type Calibration } from "./calibrate";
import { placePlan, type Placed } from "./placement";
import { PdfUnreadableError, looksLikePdf, openPdf, readBytes, type PdfDocument } from "./pdfjs";
import { CanvasTooLargeError, encodeJpeg, renderWindow } from "./render";
import { fitBudget, readSheet, renderMetresPerPixel, unscaledPointsPerPixel } from "./sheet";

/** The server's own limit for a plan image (`IMAGE_MAX_BYTES`). */
const IMAGE_MAX_BYTES = 20 * 1024 * 1024;

export class NotAPdfError extends Error {
  constructor(filename: string) {
    super(`${filename} isn't a PDF`);
    this.name = "NotAPdfError";
  }
}

export type PageChoice = { number: number; title: string };

export type PdfImport = {
  api: Pick<Api, "uploadLevelImage" | "patchLevelImage" | "uploadPlanSource">;
  levelId: string;
  file: File;
  /** This floor's plan now, which the new one replaces. */
  current: LevelImage | null;
  below: { code: string; image: LevelImage } | null;
  choosePage: (pages: PageChoice[]) => Promise<number | null>;
  stage?: (words: string) => void;
};

type Drawn = { jpeg: Blob; sheet: PlanSheet; metresPerPixel: number | null; calibration: Calibration; hasText: boolean };

/** "L2 Floor Plan.pdf" → "L2 Floor Plan.jpg". */
const imageName = (pdfName: string) => `${pdfName.replace(/\.pdf$/i, "")}.jpg`;

/** Each page, by its largest lettering: on a CAD sheet that is the drawing's title. */
async function pageChoices(doc: PdfDocument): Promise<PageChoice[]> {
  const out: PageChoice[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const content = await (await doc.getPage(n)).getTextContent();
    let title = "";
    let tallest = 0;
    for (const item of content.items) {
      if (!("str" in item) || !item.str.trim()) continue;
      if (item.height > tallest) {
        tallest = item.height;
        title = item.str.trim().slice(0, 48);
      }
    }
    out.push({ number: n, title });
  }
  return out;
}

/**
 * Renders one page's drawing as the plan image (spec §5.2 steps 2–3): scaled
 * from its grid, windowed round the drawing, within the pixel budget. A
 * browser that will not hold the canvas gets a coarser plan rather than none,
 * and a JPEG over the server's 20 MB is saved again at a lower quality.
 * Anything that goes wrong here is local, and is said as the PDF being
 * unreadable, not as a lost connection.
 */
async function drawPage(doc: PdfDocument, n: number, stage?: (w: string) => void): Promise<Drawn> {
  try {
    const page = await doc.getPage(n);
    const reading = await readSheet(page);
    const scale = reading.calibration.metresPerPoint;
    let pointsPerPixel = scale
      ? fitBudget(reading.window, scale, renderMetresPerPixel(reading.width * scale)) / scale
      : unscaledPointsPerPixel(reading.window);
    stage?.("Drawing the plan…");
    for (let attempt = 0; ; attempt++) {
      let rendered;
      try {
        rendered = await renderWindow(doc, page, reading.window, 1 / pointsPerPixel);
      } catch (err) {
        if (!(err instanceof CanvasTooLargeError) || attempt >= 2) throw err;
        pointsPerPixel *= 1.5;
        continue;
      }
      try {
        let jpeg = await encodeJpeg(rendered.canvas, 0.88);
        for (const quality of [0.75, 0.6]) {
          if (jpeg.size <= IMAGE_MAX_BYTES) break;
          jpeg = await encodeJpeg(rendered.canvas, quality);
        }
        const w = reading.window;
        return {
          jpeg,
          metresPerPixel: scale ? scale * pointsPerPixel : null,
          calibration: reading.calibration,
          hasText: reading.items.length > 0,
          sheet: {
            page: n, pageCount: doc.numPages, pageSizePt: [reading.width, reading.height], rotation: reading.rotation,
            clipPt: [w.x0, w.y0, w.x1, w.y1], pointsPerPixel, metresPerPoint: scale,
            runsAgree: reading.calibration.runsAgree, runsFound: reading.calibration.runsFound,
          },
        };
      } finally {
        rendered.release();
      }
    }
  } catch (err) {
    if (err instanceof PdfUnreadableError) throw err;
    throw new PdfUnreadableError(`the drawing couldn't be drawn (${err instanceof Error ? err.message : String(err)})`);
  }
}

function placementWords(placed: Placed, o: PdfImport, scaled: boolean): string {
  if (!scaled) return "";
  const onBelow = placed.on != null && placed.on === o.below?.image;
  if (placed.how === "same-sheet") {
    return onBelow ? `It is placed over ${o.below!.code}'s plan, as the same drawing set.` : "It is placed where the plan it replaces was.";
  }
  if (placed.how === "centred") {
    return onBelow ? `It is centred on ${o.below!.code}'s plan. Line it up with Align.` : "It is centred where the plan it replaces was. Line it up with Align.";
  }
  return "Line it up with Align.";
}

/**
 * A floor's PDF becomes its plan (spec §5.2 steps 1–4). The file is read in
 * this tab only. Three requests follow: the image, its calibration and place,
 * and the PDF with where on it the image is. Null when you did not choose a
 * page.
 */
export async function importPdfPlan(o: PdfImport): Promise<{ image: LevelImage; report: string } | null> {
  const bytes = await readBytes(o.file);
  if (!looksLikePdf(bytes)) throw new NotAPdfError(o.file.name);
  o.stage?.(`Reading ${o.file.name}…`);
  const { doc, close } = await openPdf(bytes);
  let drawn: Drawn;
  try {
    const n = doc.numPages === 1 ? 1 : await o.choosePage(await pageChoices(doc));
    if (n == null) return null;
    drawn = await drawPage(doc, n, o.stage);
  } finally {
    await close();
  }

  o.stage?.(`Uploading ${o.file.name}…`);
  const uploaded = await o.api.uploadLevelImage(o.levelId, new File([drawn.jpeg], imageName(o.file.name), { type: "image/jpeg" }));
  const placed = placePlan(
    { sheet: drawn.sheet, widthPx: uploaded.widthPx, heightPx: uploaded.heightPx, metresPerPixel: drawn.metresPerPixel },
    o.current, o.below?.image ?? null,
  );
  const patched = await o.api.patchLevelImage(uploaded.id, uploaded.version, {
    ...(drawn.metresPerPixel != null ? { metresPerPixel: drawn.metresPerPixel } : {}),
    offsetX: placed.offsetX,
    offsetY: placed.offsetY,
  });
  const image = await o.api.uploadPlanSource(
    patched.id, patched.version, new Blob([bytes.slice().buffer], { type: "application/pdf" }), o.file.name, drawn.sheet,
  );
  const report = [describeCalibration(drawn.calibration, drawn.hasText), placementWords(placed, o, drawn.metresPerPixel != null)]
    .filter(Boolean).join(" ");
  return { image, report };
}
```

- [ ] **Step 5: Write `PdfPagePicker.tsx`**

```tsx
import { useEffect } from "react";
import { create } from "zustand";
import type { PageChoice } from "../pdf/importPlan";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";

type Ask = { choices: PageChoice[]; answer: (page: number | null) => void };

/** The question on screen, and how many pickers are there to show it. */
const usePageAsk = create<{ ask: Ask | null; shown: number }>(() => ({ ask: null, shown: 0 }));

/**
 * Asks which page of a PDF is this floor's plan (spec §5.2 step 1). Answers
 * null when the question is closed, and at once when no picker is on screen,
 * such as a Retry from a toast after leaving the Floorplan step. A question
 * left waiting would hold "Adding…" for ever.
 */
export function askForPage(choices: PageChoice[]): Promise<number | null> {
  return new Promise(resolve => {
    const { ask, shown } = usePageAsk.getState();
    ask?.answer(null);
    if (shown === 0) {
      resolve(null);
      return;
    }
    usePageAsk.setState({
      ask: {
        choices,
        answer: page => {
          usePageAsk.setState({ ask: null });
          resolve(page);
        },
      },
    });
  });
}

export function PdfPagePicker() {
  const ask = usePageAsk(s => s.ask);
  useEffect(() => {
    usePageAsk.setState(s => ({ shown: s.shown + 1 }));
    return () => usePageAsk.setState(s => ({ shown: s.shown - 1 }));
  }, []);
  return (
    <Dialog
      open={ask != null}
      onOpenChange={open => {
        if (!open) ask?.answer(null);
      }}
      title="Which page is this floor's plan?"
      description="The PDF has more than one page. Choose the one with this floor's plan."
    >
      <ul className="max-h-80 space-y-1 overflow-auto">
        {ask?.choices.map(c => (
          <li key={c.number}>
            <Button className="w-full justify-start" onClick={() => ask.answer(c.number)}>
              {c.title ? `Page ${c.number} · ${c.title}` : `Page ${c.number}`}
            </Button>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}
```

- [ ] **Step 6: Let `FloorplanTools.tsx` take a PDF**

In `packages/editor/src/build/FloorplanTools.tsx`:

- Add these imports:

```ts
import { levelBelow } from "../flow/floors";
import { NotAPdfError, importPdfPlan } from "../pdf/importPlan";
import { PDF_MAX_BYTES, PdfUnreadableError } from "../pdf/pdfjs";
import { PdfPagePicker, askForPage } from "./PdfPagePicker";
```

Plan 3 made the "adding" state per floor (`useAddingPlan.byLevel`, `setAdding`, `useAddingOn`). Leave those as they are; the PDF's stage words get a per-floor store of their own beside them.

- Replace `ACCEPT` and `couldBePlan` with:

```ts
const ACCEPT = "application/pdf,.pdf,image/png,image/jpeg";

function isPdf(file: File): boolean {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
}

/**
 * Whether a file could be a plan, checked before it goes up the wire only to
 * be refused. A file with no type (some drops have none) is judged by its
 * name; the bytes decide either way.
 */
function couldBePlan(file: File): boolean {
  if (isPdf(file)) return file.size <= PDF_MAX_BYTES;
  const pngOrJpeg = file.type
    ? /^image\/(png|jpeg)$/.test(file.type)
    : /\.(png|jpe?g)$/i.test(file.name);
  return pngOrJpeg && file.size <= MAX_PLAN_BYTES;
}
```

- After `useAddingOn`, add:

```ts
/** Per floor, what a PDF on its way to being the plan is going through: "Drawing the plan…". */
const useAddingStage = create<{ byLevel: Readonly<Record<string, string>> }>(() => ({ byLevel: {} }));

function setStage(levelId: string, stage: string | null): void {
  useAddingStage.setState(s => {
    const byLevel = { ...s.byLevel };
    if (stage == null) delete byLevel[levelId];
    else byLevel[levelId] = stage;
    return { byLevel };
  });
}

/** What the floor's plan upload says it is doing: the PDF's stage, else "Adding L2.jpg…". */
function useAddingWords(levelId: string | null): string | null {
  const adding = useAddingOn(levelId);
  const stage = useAddingStage(s => (levelId ? s.byLevel[levelId] ?? null : null));
  return adding ? stage ?? `Adding ${adding}…` : null;
}
```

- In `uploadPlan`, replace the first `if` with the following, and route PDFs:

```ts
  if (!couldBePlan(file)) {
    toast({
      tone: "error",
      message: isPdf(file)
        ? `Couldn't add ${file.name}: a PDF must be under 50 MB.`
        : `Couldn't add ${file.name}. Use the sheet's PDF, or a PNG or JPEG under 20 MB.`,
    });
    return;
  }
  if (isPdf(file)) return uploadPdfPlan(api, levelId, file);
```

- Add after `uploadPlan`:

```ts
/** The floor below's plan, with its code, which a new sheet may be placed over. */
function planBelow(levelId: string): { code: string; image: LevelImage } | null {
  const s = useEditorStore.getState();
  const below = levelBelow(s.model, levelId);
  const image = below ? imageForLevel(s.levelImages, below.id) : null;
  return below && image ? { code: below.code, image } : null;
}

/**
 * A PDF becomes the plan in this tab (spec §5.1: the server never parses it).
 * What goes wrong locally is said as the PDF's fault; what goes wrong on the
 * wire is said as the network's, with Retry.
 */
async function uploadPdfPlan(api: Api, levelId: string, file: File): Promise<void> {
  const done = () => {
    setAdding(levelId, null);
    setStage(levelId, null);
  };
  setAdding(levelId, file.name);
  setStage(levelId, `Reading ${file.name}…`);
  let outcome: Awaited<ReturnType<typeof importPdfPlan>>;
  try {
    outcome = await importPdfPlan({
      api, levelId, file,
      current: imageForLevel(useEditorStore.getState().levelImages, levelId),
      below: planBelow(levelId),
      choosePage: askForPage,
      stage: stage => setStage(levelId, stage),
    });
  } catch (err) {
    done();
    if (err instanceof NotAPdfError) {
      toast({ tone: "error", message: `Couldn't add ${file.name}: it isn't a PDF.` });
    } else if (err instanceof PdfUnreadableError) {
      toast({ tone: "error", message: `Couldn't add ${file.name}: ${err.message}. Export the sheet as a PNG or JPEG instead.` });
    } else {
      reportFailure(err, { doing: `add ${file.name}`, retry: () => uploadPlan(api, levelId, file) });
    }
    return;
  }
  done();
  if (!outcome) return;
  const s = useEditorStore.getState();
  s.setLevelImages([...s.levelImages.filter(i => i.levelId !== levelId), outcome.image]);
  toast({ tone: "success", message: `Added ${file.name}. ${outcome.report}` });
}
```

- In `PlanDropZone`:
  - add `const words = useAddingWords(levelId);`;
  - show `{words ?? "Drop this floor's plan here"}` where it showed `Adding ${adding}…`;
  - change the hint line to `The architect's PDF, or a PNG or JPEG of the sheet. PDFs up to 50 MB, images up to 20 MB.`
- In `FloorplanTools`:
  - render `<PdfPagePicker />` in both branches: wrap the early "Start with the plan" return as `<><PdfPagePicker /><p …>…</p></>`, and put `<PdfPagePicker />` first inside the main fragment. The hooks stay above the early return, as they are now;
  - add `const words = useAddingWords(levelId);` beside `adding`, and show `{words ?? ""}` in the `aria-live` span;
  - make the scale line say where the scale came from:

```tsx
        {image.metresPerPixel == null
          ? <span className="text-yours">not scaled yet</span>
          : `${image.metresPerPixel.toFixed(4)} m per pixel${image.source?.metresPerPoint ? ", from the drawing's grid" : ""}`}
```

- [ ] **Step 7: Run the tests to see them pass, and typecheck**

Run the three commands from Step 1. Expected: all PASS, the existing `FloorplanTools` tests included. The PDF tests render a 2,092 × 2,132 px plan through `@napi-rs/canvas`, so they take a second or two each.

Run: `bash .superpowers/run-tests.sh tsc packages/editor packages/server`. Expected: no errors.

Holding the lock (Global Constraints), run `npm run build -w @oth/editor`. Expected: the build lists a lazy `pdf-*.js` chunk of about 540 kB and a `pdf.worker.min-*.mjs` asset.

- [ ] **Step 8: Try it on the sandbox**

Follow the memory note on the :3055 sandbox copy: never the live :3000 database.
1. On L2's Floorplan step, drop `docs/1st Level - Floor Plan.pdf` from the main checkout. It is L1's sheet, but that doesn't matter for the check.
2. Expect the toast `Added 1st Level - Floor Plan.pdf. Scale from the drawing's grid: 0.7505 m per point, 2 of 3 dimension runs agree. …`.
3. Expect the plan line to read `0.0700 m per pixel, from the drawing's grid`.
4. Expect the plan to be sharp when zoomed in on a toilet block.

Record in your report how long the upload took.

- [ ] **Step 9: Commit**

```bash
git add packages/editor/src/pdf/placement.ts packages/editor/src/pdf/placement.test.ts packages/editor/src/pdf/importPlan.ts packages/editor/src/pdf/importPlan.test.ts packages/editor/src/build/PdfPagePicker.tsx packages/editor/src/build/PdfPagePicker.test.tsx packages/editor/src/build/FloorplanTools.tsx packages/editor/src/build/FloorplanTools.test.tsx packages/editor/src/api/client.ts packages/editor/src/testing/fakeApi.ts packages/server/src/static.ts packages/server/src/static.test.ts
git commit --only -m "feat(editor): drop a floor's PDF on the Floorplan step and get a sharp, scaled plan

The PDF is read in the browser: the page chosen, the scale taken from the
grid's own dimensions, the drawing rendered at 0.05 m per pixel (0.07 on
a wide sheet), and the plan placed over the floor below's when the two
are one drawing set. The image, its calibration and the PDF go up in
three requests. The server now serves .mjs as JavaScript, which pdf.js's
module worker needs.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- packages/editor/src/pdf/placement.ts packages/editor/src/pdf/placement.test.ts packages/editor/src/pdf/importPlan.ts packages/editor/src/pdf/importPlan.test.ts packages/editor/src/build/PdfPagePicker.tsx packages/editor/src/build/PdfPagePicker.test.tsx packages/editor/src/build/FloorplanTools.tsx packages/editor/src/build/FloorplanTools.test.tsx packages/editor/src/api/client.ts packages/editor/src/testing/fakeApi.ts packages/server/src/static.ts packages/server/src/static.test.ts
```

**— Shippable after Task 4 —**

---
### Task 5: Finding rooms: labels, the flood, the worker, and parity with the script

The script's method, over a raster of the plan as it is placed now:
- erase the lettering;
- pinch the doorways shut at 0.5 m;
- flood from each label, then dilate back;
- clean, trace and simplify at 0.4 m.

Two changes from the script (spec §5.2 step 5): escalator and stair labels are left out and reported, and "Void" labels become `void` drafts.

**Files:**
- Create: `packages/editor/src/pdf/labels.ts`, `labels.test.ts`
- Create: `packages/editor/src/pdf/findRooms.ts`, `findRooms.test.ts`
- Create: `packages/editor/src/pdf/extract.ts`
- Create: `packages/editor/src/pdf/worker.ts`, `packages/editor/src/pdf/runFind.ts`
- Create: `packages/editor/src/pdf/parity.test.ts` (runs by hand only)
- Modify: `scripts/extract-storey-plan.py`: one docstring line, and only if parity holds (Step 6)

**Interfaces:**
- Consumes:
  - from Task 1: `Box`, `TextItem` and `readTextItems`; `SheetPlacement`, `ImagePlace`, `sheetToModel`, `fitBudget` and `readSheet`; `renderWindow` and `inkFromRgba`; `openPdf`, `PdfDocument` and `PdfPage`; the word lists in `words.ts`;
  - from Task 3: everything in `raster.ts`.
- Produces, used by Task 6 and by Part D:
  - `labels.ts`:
    - `type ModelLine = { text: string; box: BBox; x: number; y: number }`, in model metres
    - `groupLabels(lines): Label[]`, `tidy`, `titleCase`, `bestName`, `kindOf`, `isJunk`
  - `findRooms.ts`:
    - `type FindInput = { ink: Uint8Array; width: number; height: number; metresPerPixel: number; originX: number; originY: number; lines: ModelLine[] }`
    - `type RoomCandidate = { nameEn: string; kind: RoomKind; footprint?: Pt[]; holes?: Pt[][]; labelPoint: Pt; areaM2: number }`: the shape of `RoomDraftInput`
    - `type SkippedLabel = { text: string; at: Pt }`
    - `type FindResult = { drafts: RoomCandidate[]; skippedLabels: SkippedLabel[] }`
    - `findRooms(input): FindResult`, `roomsExtent(drafts): BBox | null`
  - `extract.ts`:
    - `FIND_METRES_PER_PIXEL = 0.05`
    - `prepareFind(doc, page, sheet, image, metresPerPixel?): Promise<FindInput>`
    - `modelLine(item, toModel)`
    - `userSpaceToModel(page, sheet, image): (pt: [number, number]) => [number, number]`: PDF user space (points, y up, before `/Rotate`) → model metres, which Part D's finders take
  - `runFind.ts`: `runFindRooms(input): Promise<FindResult>`. It runs in a Web Worker in a browser, and in place where there is no `Worker` (the tests).

- [ ] **Step 1: Write the failing tests**

`packages/editor/src/pdf/labels.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { bestName, groupLabels, isJunk, kindOf, tidy, type ModelLine } from "./labels";

const line = (text: string, x: number, y: number): ModelLine => ({
  text, x, y, box: { minX: x - 2, minY: y - 0.5, maxX: x + 2, maxY: y + 0.5 },
});

describe("groupLabels", () => {
  it("joins lines printed one under another back into the name they were", () => {
    expect(groupLabels([line("CHANGING", 10, 21.2), line("ROOM", 10, 20)])).toEqual([{ text: "CHANGING ROOM", x: 10, y: 20.6 }]);
  });

  it("keeps the order a name is read in, even when its second line sits right of centre", () => {
    // The script sorted by x first, so this came apart as "ROOM" and "CHANGING".
    expect(groupLabels([line("ROOM", 10.4, 20), line("CHANGING", 10, 21.2)]).map(l => l.text)).toEqual(["CHANGING ROOM"]);
  });

  it("does not join lines two metres or more apart, or far off to the side", () => {
    expect(groupLabels([line("SHOP", 10, 23), line("STORE", 10, 20), line("KIOSK", 14, 22)]).map(l => l.text).sort())
      .toEqual(["KIOSK", "SHOP", "STORE"]);
  });

  it("leaves out the floor levels printed under the names", () => {
    expect(groupLabels([line("TOILET", 10, 21.2), line("FFL +111.50", 10, 20), line("+111.50", 10, 19)]).map(l => l.text))
      .toEqual(["TOILET"]);
  });
});

describe("tidy", () => {
  it("names a space as a person would, as the script did", () => {
    expect(tidy("TOILET (FEMALE) (SSC)")).toBe("Toilet (Female)");
    expect(tidy("SHOP FFL +111.50")).toBe("Shop");
    expect(tidy("AHU ROOM")).toBe("AHU Room");
    expect(tidy("- LOBBY -")).toBe("Lobby");
  });
  it("keeps the letter after an apostrophe small: \"Cleaner's\", where the script wrote \"Cleaner'S\"", () => {
    expect(tidy("CLEANER'S ROOM")).toBe("Cleaner's Room");
  });
});

describe("bestName, kindOf and isJunk", () => {
  it("takes the longest name when several labels flood one space", () => {
    expect(bestName(["SHOP", "SHOP UNIT 12", ""])).toBe("Shop Unit 12");
    expect(bestName(["ROOM", "SHOP"])).toBe("Room");
    // A label that is only a level note names nothing.
    expect(bestName(["FFL +111.50"])).toBeNull();
  });
  it("gives a draft its kind from the script's word lists, and a void its own", () => {
    expect(kindOf("Riser Shaft")).toBe("service");
    expect(kindOf("Main Lobby")).toBe("area");
    expect(kindOf("Shop")).toBe("room");
    expect(kindOf("Void")).toBe("void");
    expect(kindOf("Atrium Void")).toBe("void");
  });
  it("drops what is not a space, but not a void", () => {
    expect(isJunk("Slab Above")).toBe(true);
    expect(isJunk("Void")).toBe(false);
  });
});
```

`packages/editor/src/pdf/findRooms.test.ts`:

```ts
import { pointInPolygon } from "@oth/model";
import { describe, expect, it } from "vitest";
import { prepareFind } from "./extract";
import { findRooms, roomsExtent, type FindInput, type FindResult } from "./findRooms";
import type { ModelLine } from "./labels";
import { openPdf } from "./pdfjs";
import { runFindRooms } from "./runFind";
import { readSheet } from "./sheet";
import { planSheet, storedTurned, syntheticPdf, type SyntheticPage } from "./testing/syntheticPdf";

const MPP = 0.1;

/** A blank raster at 0.1 m a pixel, whose model origin makes pixel (x, y) the point (x/10, (H − y)/10). */
function raster(width: number, height: number) {
  const ink = new Uint8Array(width * height);
  const box = (x0: number, y0: number, x1: number, y1: number, wall = 2) => {
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const edge = x < x0 + wall || x >= x1 - wall || y < y0 + wall || y >= y1 - wall;
        if (edge) ink[y * width + x] = 1;
      }
    }
  };
  const clear = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = y0; y < y1; y++) ink.fill(0, y * width + x0, y * width + x1);
  };
  const fill = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = y0; y < y1; y++) ink.fill(1, y * width + x0, y * width + x1);
  };
  const at = (px: number, py: number): [number, number] => [px * MPP, (height - py) * MPP];
  /** A line of text centred at pixel (px, py), 1.6 × 0.6 m unless told otherwise. */
  const label = (text: string, px: number, py: number, halfW = 0.8, halfH = 0.3): ModelLine => {
    const [x, y] = at(px, py);
    return { text, x, y, box: { minX: x - halfW, minY: y - halfH, maxX: x + halfW, maxY: y + halfH } };
  };
  const input = (lines: ModelLine[]): FindInput => ({
    ink, width, height, metresPerPixel: MPP, originX: 0, originY: height * MPP, lines,
  });
  return { ink, box, clear, fill, label, input };
}

const names = (r: FindResult) => r.drafts.map(d => d.nameEn).sort();

describe("findRooms, on a raster", () => {
  it("floods a room from its label and puts its walls back where they were", () => {
    const r = raster(200, 160);
    r.box(50, 40, 150, 120);
    const { drafts } = findRooms(r.input([r.label("SHOP", 100, 80)]));
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({ nameEn: "Shop", kind: "room", holes: [] });
    // 10 × 8 m inside 0.2 m walls, less the corners the script's clean cuts.
    expect(drafts[0]!.areaM2).toBeGreaterThan(70);
    expect(drafts[0]!.areaM2).toBeLessThanOrEqual(9.6 * 7.6);
    const xs = drafts[0]!.footprint!.map(p => p[0]);
    expect(Math.min(...xs)).toBeCloseTo(5.2, 1);
    expect(Math.max(...xs)).toBeCloseTo(14.8, 1);
  });

  it("does not join two rooms through a door narrower than a metre", () => {
    const r = raster(260, 160);
    r.box(30, 40, 132, 120);
    r.box(130, 40, 230, 120);
    r.clear(130, 76, 132, 85);
    const { drafts } = findRooms(r.input([r.label("SHOP", 80, 80), r.label("STORE", 180, 80)]));
    expect(drafts.map(d => d.nameEn).sort()).toEqual(["Shop", "Store"]);
    for (const d of drafts) expect(d.areaM2).toBeLessThan(80);
  });

  it("takes a doorway wider than a metre as a way through, so both labels name one space", () => {
    const r = raster(260, 160);
    r.box(30, 40, 132, 120);
    r.box(130, 40, 230, 120);
    r.clear(130, 70, 132, 90);
    const { drafts } = findRooms(r.input([r.label("SHOP", 80, 80), r.label("STORE ROOM", 180, 80)]));
    expect(drafts.map(d => d.nameEn)).toEqual(["Store Room"]);
  });

  it("erases the lettering first, so a name's own ink does not wall it off", () => {
    const r = raster(200, 160);
    r.box(50, 40, 150, 120);
    r.fill(94, 78, 106, 82);
    expect(names(findRooms(r.input([r.label("SHOP", 100, 80)])))).toEqual(["Shop"]);
  });

  it("leaves escalators out and reports them, with where they are", () => {
    const r = raster(200, 160);
    r.box(50, 40, 150, 120);
    const { drafts, skippedLabels } = findRooms(r.input([r.label("ESCALATOR", 100, 80)]));
    expect(drafts).toEqual([]);
    expect(skippedLabels).toEqual([{ text: "Escalator", at: [10, 8] }]);
  });

  it("makes a void a void draft, where the script dropped it", () => {
    const r = raster(200, 160);
    r.box(50, 40, 150, 120);
    expect(findRooms(r.input([r.label("VOID", 100, 80)])).drafts[0]).toMatchObject({ nameEn: "Void", kind: "void" });
  });

  it("lists a plaza the drawing leaves open as a space to draw by hand, with no shape", () => {
    const r = raster(600, 600);
    r.box(50, 50, 150, 130);
    const { drafts } = findRooms(r.input([r.label("PLAZA", 400, 400)]));
    expect(drafts).toEqual([{ nameEn: "Plaza", kind: "area", holes: [], labelPoint: [40, 20], areaM2: 0 }]);
  });

  it("skips what is not the name of a space", () => {
    const r = raster(200, 160);
    r.box(50, 40, 150, 120);
    const lines = [r.label("UP TO 2ND FLR", 100, 70), r.label("PL-01", 100, 80), r.label("FFL +111.50", 100, 90)];
    expect(findRooms(r.input(lines)).drafts).toEqual([]);
  });

  it("keeps only spaces from 3 to 2,500 m²", () => {
    // A 1.3 × 1.3 m cupboard, named in lettering small enough to leave its walls alone.
    const r = raster(200, 160);
    r.box(85, 65, 102, 82);
    expect(findRooms(r.input([r.label("STORE", 93, 73, 0.2, 0.1)])).drafts).toEqual([]);
  });

  it("keeps a hole of 6 m² or more, and fills a smaller one", () => {
    const r = raster(300, 260);
    r.box(20, 20, 280, 240);
    r.box(60, 60, 95, 95);
    r.box(200, 180, 215, 195);
    const [room] = findRooms(r.input([r.label("HALL", 150, 130)])).drafts;
    expect(room!.holes).toHaveLength(1);
  });

  it("gives the extent of the rooms it found, which Part D's finders stay inside", () => {
    const r = raster(200, 160);
    r.box(50, 40, 150, 120);
    const extent = roomsExtent(findRooms(r.input([r.label("SHOP", 100, 80)])).drafts)!;
    expect(extent.minX).toBeCloseTo(5.2, 1);
    expect(extent.maxY).toBeCloseTo(11.8, 1);
  });

  it("runs in place where there is no Worker, as under the tests", async () => {
    const r = raster(200, 160);
    r.box(50, 40, 150, 120);
    expect(names(await runFindRooms(r.input([r.label("SHOP", 100, 80)])))).toEqual(["Shop"]);
  });
});

const UPRIGHT: SyntheticPage = { width: 400, height: 300, content: planSheet() };

/** A sheet found the way the app finds a real one. */
async function findOnSheet(page: SyntheticPage, image = { metresPerPixel: 0.05, offsetX: 0, offsetY: 0 }) {
  const { doc, close } = await openPdf(syntheticPdf([page]));
  try {
    const p = await doc.getPage(1);
    const reading = await readSheet(p);
    const w = reading.window;
    const sheet = { clipPt: [w.x0, w.y0, w.x1, w.y1] as const, pointsPerPixel: image.metresPerPixel / reading.calibration.metresPerPoint! };
    return findRooms(await prepareFind(doc, p, sheet, image, MPP));
  } finally {
    await close();
  }
}

describe("findRooms, on a sheet", () => {
  it("finds the plan's rooms: two either side of a door, a void, an open plaza, and an escalator left out", async () => {
    const { drafts, skippedLabels } = await findOnSheet(UPRIGHT);
    const byName = Object.fromEntries(drafts.map(d => [d.nameEn, d]));
    expect(Object.keys(byName).sort()).toEqual(["Changing Room", "Plaza", "Shop", "Void"]);
    expect(byName.Shop!.kind).toBe("room");
    expect(byName.Void!.kind).toBe("void");
    expect(byName.Plaza!.footprint).toBeUndefined();
    // 12 × 10 m and 9 × 10 m inside 0.2 m walls, less the cut corners and the door.
    expect(byName.Shop!.areaM2).toBeGreaterThan(105);
    expect(byName.Shop!.areaM2).toBeLessThan(118);
    expect(byName["Changing Room"]!.areaM2).toBeGreaterThan(105);
    expect(byName.Void!.areaM2).toBeGreaterThan(78);
    expect(skippedLabels.map(s => s.text)).toEqual(["Escalator"]);
  });

  it.each([
    // Stored as L1's sheet is: a portrait page that /Rotate turns back to landscape.
    ["stored turned by 90°", storedTurned(planSheet(), 90)],
    ["stored turned by 270°", storedTurned(planSheet(), 270)],
    ["on a MediaBox that starts at (100, 50)", { ...UPRIGHT, origin: [100, 50] as [number, number] }],
  ])("finds the same rooms, in the same places, on a sheet %s", async (_how, page) => {
    const upright = await findOnSheet(UPRIGHT);
    const other = await findOnSheet(page);
    const byName = (r: FindResult) => Object.fromEntries(r.drafts.map(d => [d.nameEn, d]));
    expect(Object.keys(byName(other)).sort()).toEqual(Object.keys(byName(upright)).sort());
    for (const [name, d] of Object.entries(byName(upright))) {
      const o = byName(other)[name]!;
      expect(Math.abs(o.areaM2 - d.areaM2)).toBeLessThan(1);
      expect(o.labelPoint[0]).toBeCloseTo(d.labelPoint[0], 0);
      expect(o.labelPoint[1]).toBeCloseTo(d.labelPoint[1], 0);
    }
    // Text and raster in one frame: every name sits inside the space it named.
    for (const d of other.drafts) {
      if (d.footprint) expect(pointInPolygon(d.labelPoint, d.footprint, d.holes ?? [])).toBe(true);
    }
  });

  it("finds the rooms where the plan is now: a plan moved by Align moves every draft by as much", async () => {
    const here = await findOnSheet(UPRIGHT);
    const moved = await findOnSheet(UPRIGHT, { metresPerPixel: 0.05, offsetX: 100, offsetY: -50 });
    const shop = (r: FindResult) => r.drafts.find(d => d.nameEn === "Shop")!.footprint!;
    const a = shop(here);
    const b = shop(moved);
    expect(b).toHaveLength(a.length);
    b.forEach((p, i) => {
      expect(p[0]).toBeCloseTo(a[i]![0] + 100, 1);
      expect(p[1]).toBeCloseTo(a[i]![1] - 50, 1);
    });
  });
});
```

`packages/editor/src/pdf/parity.test.ts`:

```ts
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pointInPolygon, type Ring } from "@oth/model";
import { describe, expect, it } from "vitest";
import { prepareFind } from "./extract";
import { findRooms } from "./findRooms";
import { openPdf } from "./pdfjs";
import { readSheet } from "./sheet";

/**
 * By hand only (spec §9): the port against scripts/extract-storey-plan.py on
 * the real L1 sheet, which never enters the repo.
 *
 *   OTH_L1_PDF="C:/Users/qhuip/Repositories/oth_navigation/docs/1st Level - Floor Plan.pdf" \
 *     bash .superpowers/run-tests.sh vitest packages/editor/src/pdf/parity.test.ts
 */
const sheetPath = process.env.OTH_L1_PDF;

type Shape = { footprint: Ring; holes: readonly Ring[] };

function bounds(ring: Ring) {
  const xs = ring.map(p => p[0]);
  const ys = ring.map(p => p[1]);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

function overlaps(a: Ring, b: Ring): boolean {
  const p = bounds(a);
  const q = bounds(b);
  return p.minX < q.maxX && q.minX < p.maxX && p.minY < q.maxY && q.minY < p.maxY;
}

/** Intersection over union, by sampling both on a 0.25 m grid. */
function iou(a: Shape, b: Shape, step = 0.25): number {
  const p = bounds([...a.footprint, ...b.footprint]);
  let both = 0;
  let either = 0;
  for (let x = p.minX + step / 2; x < p.maxX; x += step) {
    for (let y = p.minY + step / 2; y < p.maxY; y += step) {
      const inA = pointInPolygon([x, y], a.footprint, a.holes);
      const inB = pointInPolygon([x, y], b.footprint, b.holes);
      if (inA || inB) either++;
      if (inA && inB) both++;
    }
  }
  return either === 0 ? 0 : both / either;
}

describe.skipIf(!sheetPath)("parity with scripts/extract-storey-plan.py on the real L1 sheet", () => {
  it("reads 0.750504 m per point, and finds the spaces the script found", async () => {
    const { doc, close } = await openPdf(new Uint8Array(await readFile(sheetPath!)));
    try {
      const page = await doc.getPage(1);
      const reading = await readSheet(page);
      const S = reading.calibration.metresPerPoint!;
      expect(Math.abs(S - 0.750504) / 0.750504).toBeLessThan(1e-4);

      // The script's own placement: its --origin (628.03, 489.39) in unrotated points is
      // (792 − 628.03, 489.39) on the sheet as shown, and its --window runs x −20…280 m, y 300…10 m.
      const X0 = reading.width - 628.03;
      const Y0 = 489.39;
      const sheet = { clipPt: [X0 - 20 / S, Y0 - 300 / S, X0 + 280 / S, Y0 - 10 / S] as const, pointsPerPixel: 0.05 / S };
      const result = findRooms(await prepareFind(doc, page, sheet, { metresPerPixel: 0.05, offsetX: -20, offsetY: 300 }, 0.05));

      // From the worktree root, where the command above runs: under jsdom, import.meta.url is not a file URL.
      const file = resolve(process.cwd(), "packages/server/src/cli/data/l1-spaces.json");
      const reference = JSON.parse(await readFile(file, "utf8")) as { spaces: (Shape & { nameEn: string })[] };
      // Part B leaves escalators out and keeps voids, both on purpose: compare the rest.
      const theirs = reference.spaces.filter(s => !/escalator/i.test(s.nameEn));
      const ours = result.drafts.filter(d => d.footprint && d.kind !== "void").map(d => ({ footprint: d.footprint!, holes: d.holes ?? [] }));
      const best = theirs.map(t => Math.max(0, ...ours.filter(o => overlaps(t.footprint, o.footprint)).map(o => iou(t, o))));
      best.sort((a, b) => a - b);
      const median = best[Math.floor(best.length / 2)]!;
      console.log(`parity: ${ours.length} found, ${theirs.length} in l1-spaces.json, median IoU ${median.toFixed(3)}, ${S} m per point`);
      expect(Math.abs(ours.length - theirs.length) / theirs.length).toBeLessThanOrEqual(0.05);
      expect(median).toBeGreaterThanOrEqual(0.95);
    } finally {
      await close();
    }
  }, 280_000);
});
```

Run: `bash .superpowers/run-tests.sh vitest packages/editor/src/pdf/labels.test.ts packages/editor/src/pdf/findRooms.test.ts`
Expected: FAIL. `./labels`, `./findRooms`, `./extract` and `./runFind` do not resolve.

- [ ] **Step 2: Write `labels.ts`**

```ts
import type { BBox, RoomKind } from "@oth/model";
import { AREA_WORDS, FIXUPS, JUNK_NAME, LEVEL_LINE, LEVEL_NOTE, SERVICE_CODE, SERVICE_WORDS, hasWordIn, wordsIn } from "./words";

/** A line of text on the plan, in model metres (y north), with its centre. */
export type ModelLine = { text: string; box: BBox; x: number; y: number };
export type Label = { text: string; x: number; y: number };

/** Lines of one name sit within this much of each other across, and less than this apart down. */
const LINE_ALIGN_M = 1.2;
const LINE_GAP_M = 2.0;

/** Whether a line is lettering to read and erase, and not a floor level printed under a name. */
export const isWording = (text: string) => text !== "" && !LEVEL_LINE.test(text);

/**
 * Printed labels, grouped back into the multi-line names they were (the
 * script's `labels`). Top line first: the script sorted by x first, so a
 * second line printed right of centre started a name of its own.
 */
export function groupLabels(lines: readonly ModelLine[]): Label[] {
  const kept = lines.filter(l => isWording(l.text)).sort((a, b) => b.y - a.y || a.x - b.x);
  const used = kept.map(() => false);
  const out: Label[] = [];
  for (let i = 0; i < kept.length; i++) {
    if (used[i]) continue;
    const group = [kept[i]!];
    used[i] = true;
    for (let j = i + 1; j < kept.length; j++) {
      if (used[j]) continue;
      const next = kept[j]!;
      const last = group[group.length - 1]!;
      const below = last.y - next.y;
      if (Math.abs(next.x - last.x) < LINE_ALIGN_M && below > 0 && below < LINE_GAP_M) {
        group.push(next);
        used[j] = true;
      }
    }
    out.push({
      text: group.map(g => g.text).join(" ").replace(/\s+/g, " ").trim(),
      x: group.reduce((s, g) => s + g.x, 0) / group.length,
      y: group.reduce((s, g) => s + g.y, 0) / group.length,
    });
  }
  return out;
}

/**
 * Python's str.title(), except that a letter after an apostrophe stays small:
 * "Cleaner's", not the script's "Cleaner'S".
 */
export function titleCase(text: string): string {
  return text.toLowerCase().replace(/(^|[^a-z'])([a-z])/g, (_, before: string, letter: string) => before + letter.toUpperCase());
}

/** A label as a name (the script's `tidy`): no level notes or service codes, in title case. */
export function tidy(text: string): string {
  let t = text.replace(/\s*\((?:SSC|CC)\)/g, "");
  t = t.replace(LEVEL_NOTE, " ").replace(SERVICE_CODE, " ");
  t = t.replace(/\s+/g, " ").replace(/^[ \-|/,]+|[ \-|/,]+$/g, "");
  t = titleCase(t);
  for (const [from, to] of Object.entries(FIXUPS)) t = t.replace(new RegExp(`\\b${from}\\b`, "g"), to);
  return t;
}

/** The longest of the names that flooded one space, then the first alphabetically, as the script chose. */
export function bestName(labels: readonly string[]): string | null {
  const names = labels.map(tidy).filter(n => n !== "");
  names.sort((a, b) => b.length - a.length || (a < b ? -1 : a > b ? 1 : 0));
  return names[0] ?? null;
}

/** A draft's kind (the script's `classify`), and `void` for a void, which Part B keeps (spec §5.2). */
export function kindOf(name: string): RoomKind {
  if (wordsIn(name).has("VOID")) return "void";
  if (hasWordIn(name, SERVICE_WORDS)) return "service";
  if (hasWordIn(name, AREA_WORDS)) return "area";
  return "room";
}

export function isJunk(name: string): boolean {
  return JUNK_NAME.test(name);
}
```

- [ ] **Step 3: Write `findRooms.ts`**

```ts
import type { BBox, RoomKind } from "@oth/model";
import { bestName, groupLabels, isJunk, isWording, kindOf, tidy, type ModelLine } from "./labels";
import {
  Flooder, and, clean, cleanPad, cropLike, countSet, dilate, dropCollinear, erode, firstSet,
  loops, nearest, rdp, regionWindow, type Grid, type Pt, type Window,
} from "./raster";
import { FLIGHT_WORDS, NOT_A_NAME, OPEN_WORDS, ROOMY, hasWordIn } from "./words";

export const PINCH_M = 0.5;
export const LABEL_PAD_M = 0.35;
export const MIN_AREA_M2 = 3;
export const MAX_AREA_M2 = 2500;
export const SIMPLIFY_M = 0.4;
export const MIN_HOLE_M2 = 6;

/** A raster of the plan as it is placed now, and its text in model metres. */
export type FindInput = {
  /** 1 where the drawing has ink, row-major. Not changed: the lettering is erased on a copy. */
  ink: Uint8Array;
  width: number;
  height: number;
  metresPerPixel: number;
  /** Model metres of the raster's top-left corner. */
  originX: number;
  originY: number;
  lines: ModelLine[];
};

/** A draft as the finder makes it: `RoomDraftInput`'s shape. */
export type RoomCandidate = {
  nameEn: string;
  kind: RoomKind;
  /** Absent for a space the drawing leaves open. */
  footprint?: Pt[];
  holes?: Pt[][];
  labelPoint: Pt;
  areaM2: number;
};
/** A label left out on purpose (escalators and stairs), with where it is: Part D draws those as flights. */
export type SkippedLabel = { text: string; at: Pt };
export type FindResult = { drafts: RoomCandidate[]; skippedLabels: SkippedLabel[] };

type Row = { labels: string[]; areaM2: number; footprint: Pt[]; holes: Pt[][]; labelPoint: Pt };

const round2 = (v: number) => Math.round(v * 100) / 100;
const clampTo = (v: number, hi: number) => Math.min(Math.max(v, 0), hi);

function boxAreaPx(ring: readonly Pt[]): number {
  const xs = ring.map(p => p[0]);
  const ys = ring.map(p => p[1]);
  return (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
}

/**
 * The script's method (spec §5.2 step 5), over a raster of the plan as it is
 * placed now:
 * - The lettering is erased: text is not architecture, and left in place it
 *   walls a label off from its own room.
 * - Doorways are pinched shut by eroding the open floor by half a metre, so a
 *   flood stays in its room; dilating back puts the walls where they were. A
 *   space too narrow to survive the pinch is a riser or a shaft, taken whole.
 * - A name the script calls open, whose flood escapes anyway, is a plaza or a
 *   walkway: listed to draw by hand.
 *
 * Part B departs from the script twice: escalators and stairs are left out and
 * reported, and a void is kept as a void.
 */
export function findRooms(input: FindInput): FindResult {
  const { width: W, height: H, metresPerPixel: mpp, originX, originY } = input;
  const px = (x: number, y: number): Pt => [Math.round((x - originX) / mpp), Math.round((originY - y) / mpp)];
  const lines = input.lines.filter(l => isWording(l.text));

  const ink = input.ink.slice();
  for (const line of lines) {
    const [a, b] = px(line.box.minX - LABEL_PAD_M, line.box.maxY + LABEL_PAD_M);
    const [c, d] = px(line.box.maxX + LABEL_PAD_M, line.box.minY - LABEL_PAD_M);
    // Both ends clamped: a label off the plan erases nothing, rather than wrapping round to the far side.
    const x0 = clampTo(a, W);
    const x1 = clampTo(c, W);
    for (let y = clampTo(b, H); y < clampTo(d, H); y++) ink.fill(0, y * W + x0, y * W + x1);
  }
  const free: Grid = { width: W, height: H, data: ink.map(v => (v ? 0 : 1)) };
  const R = Math.floor(PINCH_M / mpp);
  const tight = erode(free, R);
  const flooder = new Flooder(W, H);
  const limit = Math.floor(MAX_AREA_M2 / (mpp * mpp));
  const pad = R + cleanPad(mpp);

  const rows: Row[] = [];
  const seen = new Map<string, Row>();
  const open: { text: string; at: Pt }[] = [];
  const skippedLabels: SkippedLabel[] = [];

  for (const label of groupLabels(lines)) {
    if (NOT_A_NAME.test(label.text) || !hasWordIn(label.text, ROOMY)) continue;
    const [sx, sy] = px(label.x, label.y);
    if (sx < 0 || sy < 0 || sx >= W || sy >= H) continue;
    const at: Pt = [round2(label.x), round2(label.y)];
    if (hasWordIn(label.text, FLIGHT_WORDS)) {
      skippedLabels.push({ text: tidy(label.text), at });
      continue;
    }

    if (hasWordIn(label.text, OPEN_WORDS)) {
      const loose = nearest(free, sx, sy);
      if (loose && flooder.fill(free.data, loose, limit) === null) {
        open.push({ text: label.text, at });
        continue;
      }
    }

    let win: Window;
    let mask: Grid;
    const seed = nearest(tight, sx, sy);
    if (seed) {
      const region = flooder.fill(tight.data, seed, limit);
      // Bigger than any room: the flood got out.
      if (!region) continue;
      win = regionWindow(region, free, pad);
      mask = and(dilate(win, R), cropLike(free, win));
    } else {
      const loose = nearest(free, sx, sy);
      if (!loose) continue;
      const region = flooder.fill(free.data, loose, limit);
      if (!region) continue;
      win = regionWindow(region, free, pad);
      mask = win;
    }

    const n = countSet(mask);
    const areaM2 = n * mpp * mpp;
    if (areaM2 < MIN_AREA_M2 || areaM2 > MAX_AREA_M2) continue;
    const first = firstSet(mask);
    const key = `${n}:${(win.y0 + Math.floor(first / mask.width)) * W + win.x0 + (first % mask.width)}`;
    const same = seen.get(key);
    if (same) {
      same.labels.push(label.text);
      continue;
    }

    const place = ([x, y]: Pt): Pt => [round2(originX + (x + win.x0) * mpp), round2(originY - (y + win.y0) * mpp)];
    const poly = (ring: Pt[]): Pt[] | null => {
      const r = dropCollinear(ring);
      const c = rdp([...r, r[0]!], SIMPLIFY_M / mpp).slice(0, -1);
      return c.length >= 3 ? c.map(place) : null;
    };
    const rings = loops(clean(mask, mpp)).sort((p, q) => q.length - p.length);
    const outer = rings[0] ? poly(rings[0]) : null;
    if (!outer) continue;
    const holes: Pt[][] = [];
    for (const ring of rings.slice(1)) {
      if (boxAreaPx(ring) * mpp * mpp < MIN_HOLE_M2) continue;
      const hole = poly(ring);
      if (hole) holes.push(hole);
    }
    const row: Row = { labels: [label.text], areaM2, footprint: outer, holes, labelPoint: at };
    seen.set(key, row);
    rows.push(row);
  }

  const drafts: RoomCandidate[] = [];
  for (const row of rows) {
    const name = bestName(row.labels);
    if (!name || isJunk(name)) continue;
    drafts.push({
      nameEn: name, kind: kindOf(name), footprint: row.footprint, holes: row.holes,
      labelPoint: row.labelPoint, areaM2: Math.round(row.areaM2 * 10) / 10,
    });
  }
  drafts.sort((a, b) => b.areaM2 - a.areaM2);
  for (const o of open) {
    const name = tidy(o.text);
    if (name) drafts.push({ nameEn: name, kind: kindOf(name), holes: [], labelPoint: o.at, areaM2: 0 });
  }
  return { drafts, skippedLabels };
}

/** The extent of the rooms found: Part D's finders look for columns only inside it. */
export function roomsExtent(drafts: readonly RoomCandidate[]): BBox | null {
  const points = drafts.flatMap(d => d.footprint ?? []);
  if (points.length === 0) return null;
  return {
    minX: Math.min(...points.map(p => p[0])), minY: Math.min(...points.map(p => p[1])),
    maxX: Math.max(...points.map(p => p[0])), maxY: Math.max(...points.map(p => p[1])),
  };
}
```

- [ ] **Step 4: Write `extract.ts`, `worker.ts` and `runFind.ts`**

`packages/editor/src/pdf/extract.ts`:

```ts
import type { FindInput } from "./findRooms";
import type { ModelLine } from "./labels";
import type { PdfDocument, PdfPage } from "./pdfjs";
import { inkFromRgba, renderWindow } from "./render";
import { fitBudget, sheetToModel, type ImagePlace, type SheetPlacement } from "./sheet";
import { readTextItems, type TextItem } from "./text";

/** The script's finding resolution: a 0.5 m pinch is 10 pixels. */
export const FIND_METRES_PER_PIXEL = 0.05;

export function modelLine(item: TextItem, toModel: (x: number, y: number) => [number, number]): ModelLine {
  const [ax, ay] = toModel(item.box.x0, item.box.y0);
  const [bx, by] = toModel(item.box.x1, item.box.y1);
  const box = { minX: Math.min(ax, bx), minY: Math.min(ay, by), maxX: Math.max(ax, bx), maxY: Math.max(ay, by) };
  return { text: item.text, box, x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 };
}

/**
 * PDF user space (points, y up, before the page's /Rotate) → model metres,
 * through the plan as it is placed now: the transform the rooms are traced
 * with, which Part D's finders take for the drawing's paths.
 */
export function userSpaceToModel(page: PdfPage, sheet: SheetPlacement, image: ImagePlace): (pt: [number, number]) => [number, number] {
  const viewport = page.getViewport({ scale: 1 });
  const toModel = sheetToModel(sheet, image);
  return ([x, y]) => {
    const [sx, sy] = viewport.convertToViewportPoint(x, y) as [number, number];
    return toModel(sx, sy);
  };
}

/**
 * A page of the drawing as the finder takes it (spec §5.2 step 5): the plan's
 * window rendered at 0.05 m a pixel, or coarser to fit the pixel budget, and
 * its text, both placed where the plan is now. The raster's top-left corner
 * is the image's, so it sits at the image's offset.
 */
export async function prepareFind(
  doc: PdfDocument, page: PdfPage, sheet: SheetPlacement, image: ImagePlace, metresPerPixel = FIND_METRES_PER_PIXEL,
): Promise<FindInput> {
  const [x0, y0, x1, y1] = sheet.clipPt;
  const window = { x0, y0, x1, y1 };
  const metresPerPoint = image.metresPerPixel / sheet.pointsPerPixel;
  const mpp = fitBudget(window, metresPerPoint, metresPerPixel);
  const rendered = await renderWindow(doc, page, window, metresPerPoint / mpp);
  let ink: Uint8Array;
  try {
    ink = inkFromRgba(rendered.context.getImageData(0, 0, rendered.width, rendered.height).data, rendered.width, rendered.height);
  } finally {
    rendered.release();
  }
  const toModel = sheetToModel(sheet, image);
  const lines = (await readTextItems(page)).map(item => modelLine(item, toModel));
  return { ink, width: rendered.width, height: rendered.height, metresPerPixel: mpp, originX: image.offsetX, originY: image.offsetY, lines };
}
```

`packages/editor/src/pdf/worker.ts`:

```ts
import { findRooms, type FindInput } from "./findRooms";

/**
 * The flood and the trace, off the page's thread: L1's raster is 35 Mpx, and
 * two hundred floods over it would freeze the tab for most of a minute.
 */
type Scope = { onmessage: ((event: MessageEvent<FindInput>) => void) | null; postMessage: (message: unknown) => void };
const scope = self as unknown as Scope;

scope.onmessage = event => {
  try {
    scope.postMessage({ ok: true, result: findRooms(event.data) });
  } catch (err) {
    scope.postMessage({ ok: false, message: err instanceof Error ? err.message : String(err) });
  }
};
```

`packages/editor/src/pdf/runFind.ts`:

```ts
import { findRooms, type FindInput, type FindResult } from "./findRooms";

type Answer = { ok: true; result: FindResult } | { ok: false; message: string };

/**
 * Finds rooms in a Web Worker, handing it the raster rather than copying it.
 * The caller's `ink` is empty afterwards. Where there is no Worker (the tests,
 * under jsdom) it runs in place.
 */
export function runFindRooms(input: FindInput): Promise<FindResult> {
  if (typeof Worker === "undefined") return Promise.resolve(findRooms(input));
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<Answer>) => {
      worker.terminate();
      if (event.data.ok) resolve(event.data.result);
      else reject(new Error(event.data.message));
    };
    worker.onerror = event => {
      worker.terminate();
      reject(new Error(event.message || "the room finder stopped"));
    };
    worker.postMessage(input, [input.ink.buffer as ArrayBuffer]);
  });
}
```

- [ ] **Step 5: Run the tests to see them pass, typecheck and build**

Run: `bash .superpowers/run-tests.sh vitest packages/editor/src/pdf`
Expected: PASS. `parity.test.ts` is reported as skipped.

If a sheet test's areas fall outside the stated bounds, print them and compare against the raster tests before changing anything: those are exact, and the sheet adds only rendering. If the turned-sheet test fails on "each round its own name", the text and the raster are in two different frames. Fix `placeItem` or the viewport offset, never the test.

Run: `bash .superpowers/run-tests.sh tsc packages/editor`. Expected: no errors.

Holding the lock (Global Constraints), run `npm run build -w @oth/editor`. Expected: a `worker-*.js` asset is emitted. Nothing imports `runFind.ts` until Task 6, so if the worker asset is missing now, that is why; Task 6 checks it again.

- [ ] **Step 6: Check parity with the script on the real L1 sheet, by hand**

The sheet is in the main checkout only. Run it on its own; it takes about a minute:

```bash
OTH_L1_PDF="C:/Users/qhuip/Repositories/oth_navigation/docs/1st Level - Floor Plan.pdf" bash .superpowers/run-tests.sh vitest packages/editor/src/pdf/parity.test.ts
```

Expected, from spec §9:
- it prints `parity: N found, M in l1-spaces.json, median IoU …`;
- the calibration is within 0.01% of 0.750504;
- the count is within 5%;
- the median IoU is at least 0.95.

Put the printed line in your report.

**What this plan's code gave on the real sheet** (a scratch run of exactly the code above, 2026-09-28): `parity: 190 found, 188 in l1-spaces.json, median IoU 0.873, 0.7505112672362817 m per point`. The calibration and the count pass, and the IoU does not: 48 of 188 spaces score 0.95 or more, 119 score 0.8 or more.

What was found about the gap:
1. **A one-pixel shift, which is the script's own.** The median offset between matched spaces is 0.05 m north, with no difference in width or height. PyMuPDF snaps a clip to whole pixels: L1's pixmap starts at (2061, 1345) where the clip times the matrix is (2061.23, 1345.86). The script's raster therefore sits 0.23 px right and 0.86 px down of where its arithmetic assumes. The port places its raster exactly. This costs little IoU.
2. **The lettering is erased in different places**, which moves the floods. Mid-scoring spaces come out larger or smaller, never merely shifted: Restaurant 98.8 m² against the port's 52.7 m², and Switch Room 16.0 against 29.5. The erase boxes differ in two ways:
   - **Their size.** PyMuPDF boxes a line from the font's descender to its ascender (Helvetica: −0.212 to 0.741) at the geometric mean of the text's two scales. For `[0, 0.639, −1.111, 0]` that is √(0.639 × 1.111) = 0.842 pt. The port boxes from the baseline up by pdf.js's `height`, which is 1.111 pt.
   - **Their side.** For the labels whose transform turns them 180° (`[−1.179, 0, 0, −1.515, …]`, such as RESTAURANT at model x ≈ 205), PyMuPDF puts the letters on the other side of the baseline from the port: 205.05–206.05 against 204.13–205.26.

   The fix to try first is in `placeItem` (Task 1's `text.ts`). Box each item as PyMuPDF does:
   - along the reading direction, over its width;
   - across it, from `baseline + descent × size` to `baseline + ascent × size`, with `size = √|a·d − b·c|` and `ascent` and `descent` from `(await page.getTextContent()).styles[item.fontName]`.

   If the side still disagrees for the turned labels, count the raster's ink on each side of the baseline, and box the side that holds the letters.

   Add a test for each change to `text.test.ts`, then rerun this step. A scratch copy of the diagnosis is easy to rebuild: print, for each reference space, its best match's IoU, both areas, and both bounding boxes.

If it still falls short, stop there. The slice (Tasks 1–4) doesn't depend on this step, and the drafts are reviewed by a person either way.

**Only if it passes**, add this line at the end of the opening docstring of `scripts/extract-storey-plan.py`, before its closing `"""`:

```
Superseded by packages/editor/src/pdf/ (Plan 5B), which ports this method to the
browser and was checked against l1-spaces.json by pdf/parity.test.ts. Kept as the
reference that check was made against.
```

If it fails, leave the script alone, and report the numbers and the ten lowest-IoU spaces by name. The controller decides whether B ships with drafts that differ from L1's.

- [ ] **Step 7: Commit**

```bash
git add packages/editor/src/pdf/labels.ts packages/editor/src/pdf/labels.test.ts packages/editor/src/pdf/findRooms.ts packages/editor/src/pdf/findRooms.test.ts packages/editor/src/pdf/extract.ts packages/editor/src/pdf/worker.ts packages/editor/src/pdf/runFind.ts packages/editor/src/pdf/parity.test.ts
git commit --only -m "feat(editor): find the rooms in a floor's drawing, the storey-plan script's way

Erase the lettering, pinch the doorways shut at 0.5 m, flood from each
name, dilate back, then clean, trace and simplify at 0.4 m. It runs in a
Web Worker over the plan as it is placed now. Escalators and stairs are
left out and reported, and voids are kept. A by-hand test holds it to
l1-spaces.json on the real sheet.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- packages/editor/src/pdf/labels.ts packages/editor/src/pdf/labels.test.ts packages/editor/src/pdf/findRooms.ts packages/editor/src/pdf/findRooms.test.ts packages/editor/src/pdf/extract.ts packages/editor/src/pdf/worker.ts packages/editor/src/pdf/runFind.ts packages/editor/src/pdf/parity.test.ts
```

If Step 6 passed, commit the script's one line on its own: `git commit --only -m "docs(scripts): extract-storey-plan.py is superseded by the editor's port …" -- scripts/extract-storey-plan.py`, with the trailer.

---
### Task 6: Find rooms in the drawing

This task adds **Find rooms in the drawing** beside Import DXF on Areas & rooms (spec §5.2 step 5). It fetches the floor's PDF, finds the rooms over the plan as it is placed now, and saves them as the floor's drafts. The drafts are loaded for the floor whenever Build opens it.

**Files:**
- Create: `packages/editor/src/pdf/findInDrawing.ts`, `packages/editor/src/pdf/findInDrawing.test.ts`
- Create: `packages/editor/src/build/drafts.ts`, `packages/editor/src/build/drafts.test.ts`
- Create: `packages/editor/src/build/DraftsFind.tsx`, `packages/editor/src/build/DraftsFind.test.tsx`
- Modify: `packages/editor/src/build/StepTools.tsx` (`RoomsTools` takes `api`)
- Modify: `packages/editor/src/build/BuildWorkspace.tsx` (two hook-ins)
- Modify: `packages/editor/src/api/client.ts`, `packages/editor/src/testing/fakeApi.ts` (append to Part B's block)

**Interfaces:**
- Consumes:
  - from Task 5: `prepareFind`, `FIND_METRES_PER_PIXEL`, `userSpaceToModel` and `runFindRooms`; `RoomCandidate`, `FindResult` and `roomsExtent`;
  - from Task 1: `openPdf`, `loadPdfjs` and `PdfUnreadableError`;
  - from Task 2: the drafts routes, and `RoomDraft` and `RoomDraftInput`;
  - from Task 4: `api.fetchPlanSource` and `LevelImage.source`.
- Produces, used by Tasks 7 and 8:
  - `api/client.ts`:
    - `type AcceptedDraft = { draftId; draftVersion; roomId; roomVersion }`
    - `api.listRoomDrafts(levelId): Promise<RoomDraft[]>`
    - `api.replaceRoomDrafts(levelId, { source, drafts }): Promise<RoomDraft[]>`
    - `api.acceptRoomDrafts(items: { id; expectedVersion; nameEn?; kind? }[]): Promise<AcceptedDraft[]>`
    - `api.unacceptRoomDrafts(items: { id; expectedVersion; roomVersion }[]): Promise<{ drafts: number }>`
    - `api.rejectRoomDraft(id, expectedVersion)`, `api.restoreRoomDraft(id, expectedVersion)`
  - `build/drafts.ts`:
    - `useDrafts`, a zustand store: `byLevel`, `selectedId`, `showCovered`, `finding`, `frame`, and `setDrafts`, `select`, `setShowCovered`, `setFinding`, `frameBox`, `reset`
    - `loadDrafts(api, levelId): Promise<boolean>`, `useRoomDrafts(api, levelId)`
  - `pdf/findInDrawing.ts`:
    - `type FindSummary = { drafts: RoomDraft[]; rooms: number; open: number; skipped: string[] }`
    - `findRoomsInDrawing({ api, image, levelId, stage?, metresPerPixel? }): Promise<FindSummary>`
    - `describeFind(summary): string`
  - `build/DraftsFind.tsx`: `<DraftsFind api />`

- [ ] **Step 1: Add the API calls**

In `packages/editor/src/api/client.ts`:
- Add `RoomDraft`, `RoomDraftInput`, `DraftSource` and `RoomKind` to the `import type { … } from "@oth/model"` line.
- Add this type after the `--- Claude Code tokens (plan 5C) ---` types:

```ts
// --- PDF plans and room drafts (plan 5B) ---

/** What an accepted draft became, and the versions its undo sends back. */
export type AcceptedDraft = { draftId: string; draftVersion: number; roomId: string; roomVersion: number };
```

- Append to Part B's block in the object, after `fetchPlanSource`:

```ts
    /** The floor's drafts still waiting for review. */
    listRoomDrafts: async (levelId: string): Promise<RoomDraft[]> =>
      (await request<{ drafts: RoomDraft[] }>(`/api/levels/${levelId}/drafts`)).drafts,

    /** A new search's drafts in place of the floor's old ones. */
    replaceRoomDrafts: async (levelId: string, body: { source: DraftSource; drafts: RoomDraftInput[] }): Promise<RoomDraft[]> =>
      (await request<{ drafts: RoomDraft[] }>(`/api/levels/${levelId}/drafts`, { method: "PUT", body: json(body) })).drafts,

    /** Drafts made rooms, all or none. */
    acceptRoomDrafts: async (items: { id: string; expectedVersion: number; nameEn?: string; kind?: RoomKind }[]): Promise<AcceptedDraft[]> =>
      (await request<{ accepted: AcceptedDraft[] }>("/api/room-drafts/accept", { method: "POST", body: json({ items }) })).accepted,

    /** The undo of an accept: the rooms off the map, the drafts back. */
    unacceptRoomDrafts: (items: { id: string; expectedVersion: number; roomVersion: number }[]) =>
      request<{ drafts: number }>("/api/room-drafts/unaccept", { method: "POST", body: json({ items }) }),

    /** Reject is a soft delete, like every removal; restore is its undo. */
    rejectRoomDraft: (id: string, expectedVersion: number) =>
      request<{ entity: Record<string, unknown> }>(`/api/entities/roomDraft/${id}`, { method: "DELETE", body: json({ expectedVersion }) }),

    restoreRoomDraft: (id: string, expectedVersion: number) =>
      request<{ entity: Record<string, unknown> }>(`/api/entities/roomDraft/${id}/restore`, { method: "POST", body: json({ expectedVersion }) }),
```

In `packages/editor/src/testing/fakeApi.ts`, append to Part B's block:

```ts
    listRoomDrafts: vi.fn().mockResolvedValue([]),
    replaceRoomDrafts: vi.fn().mockResolvedValue([]),
    acceptRoomDrafts: vi.fn().mockResolvedValue([]),
    unacceptRoomDrafts: vi.fn().mockResolvedValue({ drafts: 0 }),
    rejectRoomDraft: vi.fn().mockResolvedValue({}),
    restoreRoomDraft: vi.fn().mockResolvedValue({}),
```

`listRoomDrafts` answers `[]` by default because Build now asks for the floor's drafts whenever it opens, so every existing Build test calls it.

- [ ] **Step 2: Write the failing tests**

`packages/editor/src/pdf/findInDrawing.test.ts`:

```ts
import type { PlanSource, RoomDraft, RoomDraftInput, DraftSource } from "@oth/model";
import { describe, expect, it, vi } from "vitest";
import type { LevelImage } from "../api/client";
import { describeFind, findRoomsInDrawing } from "./findInDrawing";
import { PdfUnreadableError, openPdf } from "./pdfjs";
import { readSheet } from "./sheet";
import { planSheet, syntheticPdf } from "./testing/syntheticPdf";

const pdf = syntheticPdf([{ width: 400, height: 300, content: planSheet() }]);

/** The source Task 4 would have saved for this sheet at 0.05 m a pixel. */
async function sourceFor(bytes: Uint8Array): Promise<PlanSource> {
  const { doc, close } = await openPdf(bytes);
  try {
    const r = await readSheet(await doc.getPage(1));
    const S = r.calibration.metresPerPoint!;
    return {
      page: 1, pageCount: 1, pageSizePt: [r.width, r.height], rotation: r.rotation,
      clipPt: [r.window.x0, r.window.y0, r.window.x1, r.window.y1], pointsPerPixel: 0.05 / S, metresPerPoint: S,
      runsAgree: 2, runsFound: 2, pdfId: "pdf_1", checksum: "d".repeat(64), filename: "L2.pdf",
    };
  } finally {
    await close();
  }
}

function fakes(bytes = pdf) {
  const replaceRoomDrafts = vi.fn(async (levelId: string, body: { source: DraftSource; drafts: RoomDraftInput[] }) =>
    body.drafts.map((d, i) => ({ ...d, holes: d.holes ?? [], id: `rd_${i}`, levelId, source: body.source, version: 0 }) as RoomDraft));
  return { fetchPlanSource: vi.fn(async () => bytes.slice()), replaceRoomDrafts };
}

describe("findRoomsInDrawing", () => {
  it("reads the floor's PDF where its plan sits now, and saves what it finds as the floor's drafts", async () => {
    const source = await sourceFor(pdf);
    const image: LevelImage = {
      id: "img_2", levelId: "oth-L2", filename: "L2.jpg", widthPx: 2092, heightPx: 2132, sizeBytes: 1,
      metresPerPixel: 0.05, offsetX: 10, offsetY: 200, opacity: 0.6, version: 2, source,
    };
    const api = fakes();
    const stages: string[] = [];
    const found = await findRoomsInDrawing({ api, image, levelId: "oth-L2", stage: s => stages.push(s), metresPerPixel: 0.1 });

    expect(api.fetchPlanSource).toHaveBeenCalledWith("img_2");
    const [levelId, body] = api.replaceRoomDrafts.mock.calls[0]!;
    expect(levelId).toBe("oth-L2");
    expect(body.source).toEqual({ checksum: "d".repeat(64), page: 1 });
    expect(body.drafts.map(d => d.nameEn).sort()).toEqual(["Changing Room", "Plaza", "Shop", "Void"]);
    expect(found).toMatchObject({ rooms: 3, open: 1, skipped: ["Escalator"] });
    expect(found.drafts).toHaveLength(4);
    expect(stages).toEqual(["Fetching the drawing…", "Reading the drawing…", "Finding rooms…", "Saving the drafts…"]);

    // Where the plan is now: the image's corner is at (10, 200). The shop's west wall is sheet x 100 pt,
    // its inner face 100.2 pt, and the window starts at clipPt[0], at 0.5 m a point.
    const shop = body.drafts.find(d => d.nameEn === "Shop")!;
    expect(Math.min(...shop.footprint!.map(p => p[0]))).toBeCloseTo(10 + (100.2 - source.clipPt[0]) * 0.5, 0);
  });

  it("calls a PDF it cannot read unreadable, not a lost connection", async () => {
    const image: LevelImage = {
      id: "img_2", levelId: "oth-L2", filename: "L2.jpg", widthPx: 1, heightPx: 1, sizeBytes: 1,
      metresPerPixel: 0.05, offsetX: 0, offsetY: 0, opacity: 0.6, version: 2, source: await sourceFor(pdf),
    };
    const api = fakes(new TextEncoder().encode("%PDF-1.4\nnothing"));
    await expect(findRoomsInDrawing({ api, image, levelId: "oth-L2" })).rejects.toBeInstanceOf(PdfUnreadableError);
    expect(api.replaceRoomDrafts).not.toHaveBeenCalled();
  });
});

describe("describeFind", () => {
  it("says what was found, what to draw by hand, and what was left out", () => {
    expect(describeFind({ rooms: 3, open: 1, skipped: ["Escalator"] }))
      .toBe("Found 3 rooms in the drawing. 1 open space to draw by hand. 1 escalator or stair left out: mark it on Entrances & lifts.");
    expect(describeFind({ rooms: 1, open: 0, skipped: [] })).toBe("Found 1 room in the drawing.");
    expect(describeFind({ rooms: 190, open: 4, skipped: ["Escalator 7", "Escalator 8"] }))
      .toBe("Found 190 rooms in the drawing. 4 open spaces to draw by hand. 2 escalators and stairs left out: mark them on Entrances & lifts.");
  });
});
```

`packages/editor/src/build/drafts.test.ts`:

```ts
import { RoomDraftSchema, type RoomDraft } from "@oth/model";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/client";
import { fakeApi } from "../testing/fakeApi";
import { useToasts } from "../ui/toast";
import { loadDrafts, useDrafts, useRoomDrafts } from "./drafts";

const draft = (id: string): RoomDraft => RoomDraftSchema.parse({
  id, levelId: "oth-L2", nameEn: id, kind: "room", footprint: [[0, 0], [10, 0], [10, 10], [0, 10]],
  labelPoint: [5, 5], areaM2: 96, source: { checksum: "c".repeat(64), page: 1 },
});

beforeEach(() => {
  useDrafts.getState().reset();
  useToasts.getState().clear();
});

describe("the drafts store", () => {
  it("loads a floor's drafts", async () => {
    const api = fakeApi({ listRoomDrafts: vi.fn().mockResolvedValue([draft("rd_a")]) });
    expect(await loadDrafts(api, "oth-L2")).toBe(true);
    expect(useDrafts.getState().byLevel["oth-L2"]!.map(d => d.id)).toEqual(["rd_a"]);
  });

  it("lets go of the draft in hand when a reload no longer has it", () => {
    act(() => {
      useDrafts.getState().setDrafts("oth-L2", [draft("rd_a"), draft("rd_b")]);
      useDrafts.getState().select("rd_a");
      useDrafts.getState().setDrafts("oth-L2", [draft("rd_b")]);
    });
    expect(useDrafts.getState().selectedId).toBeNull();
  });

  it("keeps the draft in hand when another floor's drafts load", () => {
    act(() => {
      useDrafts.getState().setDrafts("oth-L2", [draft("rd_a")]);
      useDrafts.getState().select("rd_a");
      useDrafts.getState().setDrafts("oth-L3", []);
    });
    expect(useDrafts.getState().selectedId).toBe("rd_a");
  });

  it("asks to frame the same box twice as two requests", () => {
    const box = { minX: 0, minY: 0, maxX: 1, maxY: 1 };
    act(() => useDrafts.getState().frameBox(box));
    const first = useDrafts.getState().frame;
    act(() => useDrafts.getState().frameBox(box));
    expect(useDrafts.getState().frame).not.toBe(first);
    expect(useDrafts.getState().frame!.seq).toBe(first!.seq + 1);
  });

  it("says a failed load in words, with Retry where trying again could work", async () => {
    const api = fakeApi({ listRoomDrafts: vi.fn().mockRejectedValue(new ApiError(500, {})) });
    expect(await loadDrafts(api, "oth-L2")).toBe(false);
    expect(useToasts.getState().toasts.at(-1)?.message).toMatch(/^Couldn't load the drafts from the drawing/);
    expect(useToasts.getState().toasts.at(-1)?.action?.label).toBe("Retry");
  });

  it("loads the floor's drafts whenever the floor changes", async () => {
    const api = fakeApi({ listRoomDrafts: vi.fn().mockResolvedValue([]) });
    const { rerender } = renderHook(({ levelId }) => useRoomDrafts(api, levelId), { initialProps: { levelId: "oth-L1" as string | null } });
    rerender({ levelId: "oth-L2" });
    await vi.waitFor(() => expect(api.listRoomDrafts).toHaveBeenCalledTimes(2));
    expect((api.listRoomDrafts as unknown as { mock: { calls: string[][] } }).mock.calls.map(c => c[0])).toEqual(["oth-L1", "oth-L2"]);
  });
});
```

`packages/editor/src/build/DraftsFind.test.tsx`:

```tsx
import { RoomDraftSchema, parseModel, type PlanSource } from "@oth/model";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { ApiError, type LevelImage } from "../api/client";
import { findRoomsInDrawing } from "../pdf/findInDrawing";
import { PdfUnreadableError } from "../pdf/pdfjs";
import { useEditorStore } from "../state/store";
import { fakeApi } from "../testing/fakeApi";
import { useToasts } from "../ui/toast";
import { useDrafts } from "./drafts";
import { DraftsFind } from "./DraftsFind";

vi.mock("../pdf/findInDrawing", async importOriginal => ({
  ...(await importOriginal<typeof import("../pdf/findInDrawing")>()),
  findRoomsInDrawing: vi.fn(),
}));
const find = findRoomsInDrawing as unknown as Mock;

const model = parseModel({
  building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
  levels: [{ id: "oth-L2", buildingId: "oth", code: "L2", ordinal: 2, nameEn: "L2", nameZh: "二楼", elevationM: 6, heightM: 4 }],
});
const source: PlanSource = {
  page: 1, pageCount: 1, pageSizePt: [400, 300], rotation: 0, clipPt: [36, 78, 246, 292], pointsPerPixel: 0.1,
  metresPerPoint: 0.5, runsAgree: 2, runsFound: 2, pdfId: "pdf_1", checksum: "d".repeat(64), filename: "L2.pdf",
};
const plan = (over: Partial<LevelImage> = {}): LevelImage => ({
  id: "img_2", levelId: "oth-L2", filename: "L2.jpg", widthPx: 2092, heightPx: 2132, sizeBytes: 1,
  metresPerPixel: 0.05, offsetX: 0, offsetY: 0, opacity: 0.6, version: 2, source, ...over,
});
const shop = RoomDraftSchema.parse({
  id: "rd_shop", levelId: "oth-L2", nameEn: "Shop", kind: "room", footprint: [[0, 0], [10, 0], [10, 10], [0, 10]],
  labelPoint: [5, 5], areaM2: 96, source: { checksum: "d".repeat(64), page: 1 },
});
const button = () => screen.getByRole("button", { name: "Find rooms in the drawing" });
const lastToast = () => useToasts.getState().toasts.at(-1);

beforeEach(() => {
  find.mockReset();
  useDrafts.getState().reset();
  useToasts.getState().clear();
  useEditorStore.getState().reset();
  useEditorStore.getState().setModel(model);
  useEditorStore.getState().setActiveLevel("oth-L2");
});

describe("DraftsFind", () => {
  it.each([
    ["no plan", [], "Add this floor's plan as a PDF on the Floorplan step first."],
    ["a plan from an image", [plan({ source: null })], "This plan came from an image. Add the floor's PDF on the Floorplan step to find rooms in it."],
    ["an unscaled plan", [plan({ metresPerPixel: null })], "Set the plan's scale on the Floorplan step first."],
  ])("can't find rooms on a floor with %s, and says what to do", (_what, images, words) => {
    useEditorStore.getState().setLevelImages(images);
    render(<DraftsFind api={fakeApi()} />);
    expect(button()).toBeDisabled();
    expect(screen.getByText(words)).toBeTruthy();
  });

  it("finds the rooms, keeps them as the floor's drafts, and says what it found", async () => {
    useEditorStore.getState().setLevelImages([plan()]);
    find.mockResolvedValue({ drafts: [shop], rooms: 1, open: 0, skipped: ["Escalator"] });
    render(<DraftsFind api={fakeApi()} />);
    fireEvent.click(button());
    await waitFor(() => expect(lastToast()?.message)
      .toBe("Found 1 room in the drawing. 1 escalator or stair left out: mark it on Entrances & lifts."));
    expect(useDrafts.getState().byLevel["oth-L2"]).toEqual([shop]);
    expect(find.mock.calls[0]![0]).toMatchObject({ levelId: "oth-L2", image: { id: "img_2" } });
  });

  it("says what it is doing, and takes no second click while it works", async () => {
    useEditorStore.getState().setLevelImages([plan()]);
    let finish!: (value: unknown) => void;
    find.mockImplementation(({ stage }: { stage: (s: string) => void }) => {
      stage("Finding rooms…");
      return new Promise(resolve => { finish = resolve; });
    });
    render(<DraftsFind api={fakeApi()} />);
    fireEvent.click(button());
    expect(await screen.findByText("Finding rooms…")).toBeTruthy();
    expect(button()).toBeDisabled();
    fireEvent.click(button());
    expect(find).toHaveBeenCalledTimes(1);
    finish({ drafts: [], rooms: 0, open: 0, skipped: [] });
    await waitFor(() => expect(button()).not.toBeDisabled());
  });

  it("says a drawing it cannot read is unreadable", async () => {
    useEditorStore.getState().setLevelImages([plan()]);
    find.mockRejectedValue(new PdfUnreadableError("the drawing couldn't be read (bad XRef)"));
    render(<DraftsFind api={fakeApi()} />);
    fireEvent.click(button());
    await waitFor(() => expect(lastToast()?.message).toBe("Couldn't find rooms: the drawing couldn't be read (bad XRef)."));
  });

  it("offers Retry when the server had a problem", async () => {
    useEditorStore.getState().setLevelImages([plan()]);
    find.mockRejectedValue(new ApiError(500, {}));
    render(<DraftsFind api={fakeApi()} />);
    fireEvent.click(button());
    await waitFor(() => expect(lastToast()?.action?.label).toBe("Retry"));
  });
});
```

Run, one file at a time:
- `bash .superpowers/run-tests.sh vitest packages/editor/src/pdf/findInDrawing.test.ts`
- `bash .superpowers/run-tests.sh vitest packages/editor/src/build/drafts.test.ts packages/editor/src/build/DraftsFind.test.tsx`

Expected: FAIL. `./findInDrawing`, `./drafts` and `./DraftsFind` do not resolve.

- [ ] **Step 3: Write `findInDrawing.ts`**

```ts
import type { RoomDraft } from "@oth/model";
import type { Api, LevelImage } from "../api/client";
import { FIND_METRES_PER_PIXEL, prepareFind } from "./extract";
import type { FindResult } from "./findRooms";
import { PdfUnreadableError, openPdf } from "./pdfjs";
import { runFindRooms } from "./runFind";

export type FindSummary = { drafts: RoomDraft[]; rooms: number; open: number; skipped: string[] };

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** What a search found, for the toast (spec §5.2 step 5). */
export function describeFind(s: Pick<FindSummary, "rooms" | "open" | "skipped">): string {
  const parts = [`Found ${count(s.rooms, "room", "rooms")} in the drawing.`];
  if (s.open > 0) parts.push(`${count(s.open, "open space", "open spaces")} to draw by hand.`);
  if (s.skipped.length === 1) parts.push("1 escalator or stair left out: mark it on Entrances & lifts.");
  if (s.skipped.length > 1) parts.push(`${s.skipped.length} escalators and stairs left out: mark them on Entrances & lifts.`);
  return parts.join(" ");
}

/**
 * Finds the rooms in a floor's PDF, over its plan as it is placed now, and
 * saves them as the floor's drafts, in place of the last search's (spec §5.2
 * step 5). The PDF is read in this tab; the flood runs in a worker. What goes
 * wrong reading or finding is the PDF's, said as unreadable. What goes wrong
 * on the wire is left as it is, for the caller's Retry.
 */
export async function findRoomsInDrawing({ api, image, levelId, stage, metresPerPixel = FIND_METRES_PER_PIXEL }: {
  api: Pick<Api, "fetchPlanSource" | "replaceRoomDrafts">;
  image: LevelImage;
  levelId: string;
  stage?: (words: string) => void;
  /** Coarser in the tests, to keep them quick. */
  metresPerPixel?: number;
}): Promise<FindSummary> {
  const source = image.source;
  if (!source || image.metresPerPixel == null) throw new PdfUnreadableError("this plan has no PDF behind it, or no scale");
  const place = { metresPerPixel: image.metresPerPixel, offsetX: image.offsetX, offsetY: image.offsetY };

  stage?.("Fetching the drawing…");
  const bytes = await api.fetchPlanSource(image.id);
  stage?.("Reading the drawing…");
  const { doc, close } = await openPdf(bytes);
  let result: FindResult;
  try {
    try {
      const page = await doc.getPage(source.page);
      const input = await prepareFind(doc, page, source, place, metresPerPixel);
      stage?.("Finding rooms…");
      result = await runFindRooms(input);
    } catch (err) {
      if (err instanceof PdfUnreadableError) throw err;
      throw new PdfUnreadableError(`the drawing couldn't be read (${err instanceof Error ? err.message : String(err)})`);
    }
    // Part D: columns and flight outlines join the list here, while the document is open. What its
    // finders take: the page (doc.getPage(source.page)); (await loadPdfjs()).OPS; userSpaceToModel(page,
    // source, place); result.skippedLabels; and roomsExtent(result.drafts), 5 m wider. Their drafts go
    // in result.drafts, so the one PUT below carries both: a second PUT would replace the rooms'.
  } finally {
    await close();
  }

  stage?.("Saving the drafts…");
  const drafts = await api.replaceRoomDrafts(levelId, {
    source: { checksum: source.checksum, page: source.page },
    drafts: result.drafts,
  });
  return {
    drafts,
    rooms: result.drafts.filter(d => d.footprint).length,
    open: result.drafts.filter(d => !d.footprint).length,
    skipped: result.skippedLabels.map(s => s.text),
  };
}
```

- [ ] **Step 4: Write `build/drafts.ts`**

```ts
import type { BBox, RoomDraft } from "@oth/model";
import { useEffect } from "react";
import { create } from "zustand";
import type { Api } from "../api/client";
import { reportFailure } from "../ui/failure";

type DraftsState = {
  /** Each floor's drafts waiting for review, as the server last gave them. */
  byLevel: Readonly<Record<string, RoomDraft[]>>;
  /** The draft in hand. Part B's own, so the map's selection (state/store.ts) is left alone. */
  selectedId: string | null;
  /** Whether drafts already on the map are drawn too. */
  showCovered: boolean;
  /** What the finder is doing while it runs; null when it is not. */
  finding: string | null;
  /** A request to frame part of the plan. `seq` makes the same box asked twice two requests. */
  frame: { box: BBox; seq: number } | null;
  setDrafts: (levelId: string, drafts: RoomDraft[]) => void;
  select: (id: string | null) => void;
  setShowCovered: (on: boolean) => void;
  setFinding: (words: string | null) => void;
  frameBox: (box: BBox) => void;
  reset: () => void;
};

const initial = { byLevel: {}, selectedId: null, showCovered: false, finding: null, frame: null };

export const useDrafts = create<DraftsState>(set => ({
  ...initial,
  setDrafts: (levelId, drafts) => set(s => {
    // A draft in hand that this floor's new list no longer has is let go; one on another floor is not.
    const wasHere = (s.byLevel[levelId] ?? []).some(d => d.id === s.selectedId);
    const stillHere = drafts.some(d => d.id === s.selectedId);
    return { byLevel: { ...s.byLevel, [levelId]: drafts }, selectedId: wasHere && !stillHere ? null : s.selectedId };
  }),
  select: id => set({ selectedId: id }),
  setShowCovered: on => set({ showCovered: on }),
  setFinding: words => set({ finding: words }),
  frameBox: box => set(s => ({ frame: { box, seq: (s.frame?.seq ?? 0) + 1 } })),
  reset: () => set(initial),
}));

/** A floor's drafts from the server. True when they came. */
export async function loadDrafts(api: Pick<Api, "listRoomDrafts">, levelId: string): Promise<boolean> {
  try {
    useDrafts.getState().setDrafts(levelId, await api.listRoomDrafts(levelId));
    return true;
  } catch (err) {
    reportFailure(err, { doing: "load the drafts from the drawing", retry: () => loadDrafts(api, levelId).then(() => {}) });
    return false;
  }
}

/** Keeps the open floor's drafts loaded, for its to-do count and its Areas & rooms step. */
export function useRoomDrafts(api: Pick<Api, "listRoomDrafts">, levelId: string | null): void {
  useEffect(() => {
    if (levelId) void loadDrafts(api, levelId);
  }, [api, levelId]);
}
```

- [ ] **Step 5: Write `DraftsFind.tsx`, and hook it in**

`packages/editor/src/build/DraftsFind.tsx`:

```tsx
import { useId } from "react";
import type { Api } from "../api/client";
import { describeFind, findRoomsInDrawing } from "../pdf/findInDrawing";
import { PdfUnreadableError } from "../pdf/pdfjs";
import { useEditorStore } from "../state/store";
import { imageForLevel } from "../state/underlay";
import { Button } from "../ui/Button";
import { reportFailure } from "../ui/failure";
import { toast } from "../ui/toast";
import { useDrafts } from "./drafts";

/**
 * Find rooms in the drawing (spec §5.2 step 5), beside Import DXF. It needs
 * the floor's plan to have come from its PDF, and to be scaled. When it can't
 * run, it says why, and where to go.
 */
export function DraftsFind({ api }: { api: Api }) {
  const levelId = useEditorStore(s => s.activeLevelId);
  const image = useEditorStore(s => imageForLevel(s.levelImages, s.activeLevelId));
  const finding = useDrafts(s => s.finding);
  const hintId = useId();

  const why = !image
    ? "Add this floor's plan as a PDF on the Floorplan step first."
    : !image.source
      ? "This plan came from an image. Add the floor's PDF on the Floorplan step to find rooms in it."
      : image.metresPerPixel == null
        ? "Set the plan's scale on the Floorplan step first."
        : null;

  async function find(): Promise<void> {
    if (!image || !levelId || why || useDrafts.getState().finding) return;
    const say = (words: string | null) => useDrafts.getState().setFinding(words);
    say("Fetching the drawing…");
    try {
      const found = await findRoomsInDrawing({ api, image, levelId, stage: say });
      useDrafts.getState().setDrafts(levelId, found.drafts);
      toast({ tone: "success", message: describeFind(found) });
    } catch (err) {
      if (err instanceof PdfUnreadableError) toast({ tone: "error", message: `Couldn't find rooms: ${err.message}.` });
      else reportFailure(err, { doing: "find rooms in the drawing", retry: find });
    } finally {
      say(null);
    }
  }

  return (
    <div className="space-y-1">
      <Button size="sm" disabled={why != null || finding != null} aria-describedby={hintId} onClick={() => void find()}>
        Find rooms in the drawing
      </Button>
      <p id={hintId} aria-live="polite" className="text-xs text-stone-600">
        {finding ?? why ?? "Finds each named space as a draft for you to review, in place of the drafts found before."}
      </p>
    </div>
  );
}
```

In `packages/editor/src/build/StepTools.tsx`:
- Add `import { DraftsFind } from "./DraftsFind";`.
- Replace `RoomsTools` with:

```tsx
/** Areas & rooms: find the rooms in the floor's PDF, or bring in a CAD export instead of tracing. */
export function RoomsTools({ api, saver }: { api: Api; saver: Saver }) {
  return (
    <div className="flex flex-wrap items-start gap-2">
      <DraftsFind api={api} />
      <DxfImportButton saver={saver} />
    </div>
  );
}
```

`Api` is already imported in that file.

In `packages/editor/src/build/BuildWorkspace.tsx`, make two hook-in edits and nothing else:
- Add `import { useRoomDrafts } from "./drafts";`, and call `useRoomDrafts(api, levelId);` directly after the `useElementSize` line.
- In `extrasFor`, change `return <RoomsTools saver={saver} />;` to `return <RoomsTools api={api} saver={saver} />;`.

- [ ] **Step 6: Run the tests to see them pass, typecheck and build**

Run the two commands from Step 2, and then, one at a time:
- `bash .superpowers/run-tests.sh vitest packages/editor/src/build/BuildWorkspace.test.tsx packages/editor/src/build/StepTools.test.tsx`

Expected: all PASS. The existing Build tests pass because `fakeApi`'s `listRoomDrafts` answers `[]`.

Run: `bash .superpowers/run-tests.sh tsc packages/editor`. Expected: no errors.

Holding the lock (Global Constraints), run `npm run build -w @oth/editor`. Expected: a `worker-*.js` asset now, besides the pdf chunk and `pdf.worker.min-*.mjs`.

- [ ] **Step 7: Try it on the sandbox**

On the :3055 sandbox, on the floor where Task 4's check put the L1 sheet, choose **Find rooms in the drawing**. Expect:
- the stages;
- then `Found … rooms in the drawing. … open spaces to draw by hand. … escalators and stairs left out: mark them on Entrances & lifts.`

Note the time it took. Nothing shows on the plan yet: Task 7 draws the drafts.

- [ ] **Step 8: Commit**

```bash
git add packages/editor/src/pdf/findInDrawing.ts packages/editor/src/pdf/findInDrawing.test.ts packages/editor/src/build/drafts.ts packages/editor/src/build/drafts.test.ts packages/editor/src/build/DraftsFind.tsx packages/editor/src/build/DraftsFind.test.tsx packages/editor/src/build/StepTools.tsx packages/editor/src/build/BuildWorkspace.tsx packages/editor/src/api/client.ts packages/editor/src/testing/fakeApi.ts
git commit --only -m "feat(editor): Find rooms in the drawing, on Areas & rooms

Fetches the floor's PDF, finds the named spaces over the plan as it is
placed now, and saves them as the floor's drafts in place of the last
search's. It says what it found, what to draw by hand, and which
escalators and stairs it left out. Build loads a floor's drafts as it
opens it.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- packages/editor/src/pdf/findInDrawing.ts packages/editor/src/pdf/findInDrawing.test.ts packages/editor/src/build/drafts.ts packages/editor/src/build/drafts.test.ts packages/editor/src/build/DraftsFind.tsx packages/editor/src/build/DraftsFind.test.tsx packages/editor/src/build/StepTools.tsx packages/editor/src/build/BuildWorkspace.tsx packages/editor/src/api/client.ts packages/editor/src/testing/fakeApi.ts
```

---
### Task 7: Drafts on the plan

This task draws the drafts on the plan (spec §5.2 step 6): dashed, in the *proposed* colour, with their names. A draft that covers more than half of a room already on the map is marked *already on the map* and hidden until asked for. On L1, whose rooms came from this same method, only what the script dropped comes through. Clicking a draft selects it in Part B's own store.

**Files:**
- Modify: `packages/editor/src/build/drafts.ts` (append the view helpers), `packages/editor/src/build/drafts.test.ts` (append)
- Create: `packages/editor/src/plan/DraftLayer.tsx`, `packages/editor/src/plan/DraftLayer.test.tsx`
- Create: `packages/editor/src/build/DraftsOnPlan.tsx`, `packages/editor/src/build/DraftsOnPlan.test.tsx`
- Modify: `packages/editor/src/plan/colours.ts` (append one constant)
- Modify: `packages/editor/src/plan/PlanCanvas.tsx`, only if Part A's `overlays` slot is not there yet
- Modify: `packages/editor/src/build/BuildWorkspace.tsx` (one hook-in), `packages/editor/src/build/BuildWorkspace.test.tsx` (append one test)

**Interfaces:**
- Consumes:
  - from Task 6: `useDrafts`, and `api.listRoomDrafts`;
  - Part A's `PlanCanvasProps.overlays?: ReactNode`: SVG drawn over the spaces, pathways and details, and under the handles and markers. Overlays read the viewport from `useEditorStore` and set their own pointer events.
- Produces, used by Task 8:
  - `build/drafts.ts`:
    - `coverage(draft, room): number`
    - `type DraftView = { review: RoomDraft[]; covered: { draft: RoomDraft; roomId: string }[]; open: RoomDraft[] }`
    - `draftView(drafts, rooms): DraftView`, `useDraftView(levelId): DraftView`, `draftBox(draft): BBox`
  - `plan/colours.ts`: `PROPOSED_STROKE`
  - `plan/DraftLayer.tsx`: `type ShownDraft = { draft: RoomDraft; covered: boolean }`, `<DraftLayer drafts open selectedId viewport clickable onSelect />`
  - `build/DraftsOnPlan.tsx`: `<DraftsOnPlan levelId />`

- [ ] **Step 1: Write the failing tests**

Append to `packages/editor/src/build/drafts.test.ts`. The file already imports `RoomDraftSchema`, `RoomDraft`, `act`, `renderHook`, `vi` and `fakeApi`, and defines `draft`. Add `RoomSchema`, `parseModel` and `type Room` to the `@oth/model` import, `useEditorStore` from `"../state/store"`, and `coverage`, `draftView`, `draftBox` and `useDraftView` from `"./drafts"`.

```ts
const square = (x: number, y: number, s: number): [number, number][] => [[x, y], [x + s, y], [x + s, y + s], [x, y + s]];
const room = (id: string, ring: [number, number][], kind: Room["kind"] = "room"): Room =>
  RoomSchema.parse({ id, levelId: "oth-L2", kind, footprint: ring, heightM: 4 });
const shaped = (id: string, ring: [number, number][] | undefined, over: Partial<RoomDraft> = {}): RoomDraft =>
  ({ ...draft(id), footprint: ring, ...over });

describe("coverage", () => {
  it("is how much of a room a draft covers", () => {
    expect(coverage(shaped("d", square(0, 0, 10)), room("r", square(0, 0, 10)))).toBeCloseTo(1, 1);
    expect(coverage(shaped("d", square(0, 0, 10)), room("r", square(5, 0, 10)))).toBeCloseTo(0.5, 1);
    expect(coverage(shaped("d", square(0, 0, 10)), room("r", square(30, 30, 5)))).toBe(0);
    expect(coverage(shaped("d", undefined), room("r", square(0, 0, 10)))).toBe(0);
  });
  it("counts nothing a draft's hole leaves out", () => {
    const ring = shaped("d", square(0, 0, 10), { holes: [square(2, 2, 6)] });
    expect(coverage(ring, room("r", square(2, 2, 6)))).toBe(0);
  });
});

describe("draftView", () => {
  it("sorts drafts into those to review, those already on the map, and open spaces to draw by hand", () => {
    const view = draftView(
      [shaped("new", square(0, 0, 10)), shaped("copy", square(50, 50, 10)), shaped("plaza", undefined)],
      [room("L2-shop", square(50.2, 50.2, 9.6))],
    );
    expect(view.review.map(d => d.id)).toEqual(["new"]);
    expect(view.covered).toEqual([{ draft: expect.objectContaining({ id: "copy" }), roomId: "L2-shop" }]);
    expect(view.open.map(d => d.id)).toEqual(["plaza"]);
  });

  it("hides the copies a second search makes of rooms accepted from the first", () => {
    // Accepted rooms are drafts' exact shapes, so searching again finds them already on the map.
    const accepted = [room("L2-shop", square(0, 0, 10)), room("L2-store", square(20, 0, 10))];
    const again = [shaped("a", square(0, 0, 10)), shaped("b", square(20, 0, 10))];
    expect(draftView(again, accepted).review).toEqual([]);
  });

  it("never takes a hall for a column standing in it, or a column for the hall", () => {
    const view = draftView(
      [shaped("hall", square(0, 0, 30)), shaped("col", square(10, 10, 1), { kind: "detail" })],
      [room("L2-column", square(10, 10, 1), "detail"), room("L2-kiosk", square(40, 40, 5))],
    );
    expect(view.review.map(d => d.id)).toEqual(["hall"]);
    expect(view.covered.map(c => c.roomId)).toEqual(["L2-column"]);
  });
});

describe("draftBox and useDraftView", () => {
  it("frames a draft with 4 m round it, and an open space 15 m round its name", () => {
    expect(draftBox(shaped("d", square(0, 0, 10)))).toEqual({ minX: -4, minY: -4, maxX: 14, maxY: 14 });
    expect(draftBox(shaped("p", undefined, { labelPoint: [60, 60] }))).toEqual({ minX: 45, minY: 45, maxX: 75, maxY: 75 });
  });

  it("gives everything that asks one answer, until the drafts or the map change", () => {
    useEditorStore.getState().setModel(parseModel({
      building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
      levels: [{ id: "oth-L2", buildingId: "oth", code: "L2", ordinal: 2, nameEn: "L2", nameZh: "二楼", elevationM: 6, heightM: 4 }],
    }));
    act(() => useDrafts.getState().setDrafts("oth-L2", [draft("rd_a")]));
    const a = renderHook(() => useDraftView("oth-L2")).result.current;
    const b = renderHook(() => useDraftView("oth-L2")).result.current;
    expect(a).toBe(b);
    act(() => useDrafts.getState().setDrafts("oth-L2", [draft("rd_a"), draft("rd_b")]));
    expect(renderHook(() => useDraftView("oth-L2")).result.current.review).toHaveLength(2);
  });
});
```

`packages/editor/src/plan/DraftLayer.test.tsx`:

```tsx
import { RoomDraftSchema, type RoomDraft } from "@oth/model";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PROPOSED_STROKE, SELECTED_STROKE } from "./colours";
import { DraftLayer, type ShownDraft } from "./DraftLayer";

const draft = (id: string, nameEn: string, over: Record<string, unknown> = {}): RoomDraft => RoomDraftSchema.parse({
  id, levelId: "oth-L2", nameEn, kind: "room", footprint: [[0, 0], [10, 0], [10, 8], [0, 8]],
  labelPoint: [5, 4], areaM2: 76, source: { checksum: "c".repeat(64), page: 1 }, ...over,
});
const viewport = { originX: 100, originY: 500, scale: 10 };

function layer(drafts: ShownDraft[], over: Partial<Parameters<typeof DraftLayer>[0]> = {}) {
  const onSelect = vi.fn();
  render(
    <svg width={800} height={600}>
      <DraftLayer drafts={drafts} open={[]} selectedId={null} viewport={viewport} clickable onSelect={onSelect} {...over} />
    </svg>,
  );
  return onSelect;
}
const shape = (id: string) => screen.getByTestId(`draft-${id}`).querySelector("path")!;

describe("DraftLayer", () => {
  it("draws a draft dashed and named, so it reads as a draft by more than its colour", () => {
    layer([{ draft: draft("rd_shop", "Shop"), covered: false }]);
    expect(shape("rd_shop").getAttribute("stroke-dasharray")).toBe("6 4");
    expect(shape("rd_shop").getAttribute("stroke")).toBe(PROPOSED_STROKE);
    expect(screen.getByText("Shop")).toBeTruthy();
  });

  it("says a draft already on the map is, and draws it fainter", () => {
    layer([{ draft: draft("rd_hall", "Hall"), covered: true }]);
    expect(screen.getByTestId("draft-rd_hall").textContent).toContain("already on the map");
    expect(shape("rd_hall").getAttribute("stroke-opacity")).toBe("0.5");
  });

  it("draws the draft in hand in the selection's colour, and thicker", () => {
    layer([{ draft: draft("rd_shop", "Shop"), covered: false }], { selectedId: "rd_shop" });
    expect(shape("rd_shop").getAttribute("stroke")).toBe(SELECTED_STROKE);
    expect(shape("rd_shop").getAttribute("stroke-width")).toBe("2.5");
  });

  it("takes a click on a draft only while Select is in use", () => {
    const onSelect = layer([{ draft: draft("rd_shop", "Shop"), covered: false }]);
    fireEvent.click(shape("rd_shop"));
    expect(onSelect).toHaveBeenCalledWith("rd_shop");
  });

  it("lets clicks through to the drawing tool when another tool is in use", () => {
    const onSelect = layer([{ draft: draft("rd_shop", "Shop"), covered: false }], { clickable: false });
    expect(shape("rd_shop").getAttribute("pointer-events")).toBe("none");
    fireEvent.click(shape("rd_shop"));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("leaves off the name of a draft too small on screen to hold it", () => {
    layer([{ draft: draft("rd_shop", "Shop"), covered: false }], { viewport: { originX: 0, originY: 0, scale: 1 } });
    expect(screen.queryByText("Shop")).toBeNull();
  });

  it("marks a space the drawing leaves open at its name, to draw by hand", () => {
    layer([], { open: [draft("rd_plaza", "Plaza", { footprint: undefined, kind: "area", areaM2: 0 })] });
    expect(screen.getByTestId("open-rd_plaza").textContent).toBe("Plaza · draw by hand");
  });
});
```

`packages/editor/src/build/DraftsOnPlan.test.tsx`:

```tsx
import { RoomDraftSchema, parseModel, type RoomDraft } from "@oth/model";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { fitViewport } from "../plan/viewport";
import { useEditorStore } from "../state/store";
import { useDrafts } from "./drafts";
import { DraftsOnPlan } from "./DraftsOnPlan";

const square = (x: number, y: number, s: number): [number, number][] => [[x, y], [x + s, y], [x + s, y + s], [x, y + s]];
const model = parseModel({
  building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
  levels: [{ id: "oth-L2", buildingId: "oth", code: "L2", ordinal: 2, nameEn: "L2", nameZh: "二楼", elevationM: 6, heightM: 4 }],
  rooms: [{ id: "L2-hall", levelId: "oth-L2", kind: "area", footprint: square(100, 100, 20), heightM: 4 }],
});
const draft = (id: string, nameEn: string, ring: [number, number][] | undefined): RoomDraft => RoomDraftSchema.parse({
  id, levelId: "oth-L2", nameEn, kind: "room", footprint: ring, labelPoint: ring ? [ring[0]![0] + 1, ring[0]![1] + 1] : [60, 60],
  areaM2: 90, source: { checksum: "c".repeat(64), page: 1 },
});

beforeEach(() => {
  useDrafts.getState().reset();
  const s = useEditorStore.getState();
  s.reset();
  s.setModel(model);
  s.setActiveLevel("oth-L2");
  s.setViewport({ originX: 0, originY: 600, scale: 4 });
  useDrafts.getState().setDrafts("oth-L2", [
    draft("rd_shop", "Shop", square(0, 0, 10)),
    draft("rd_hall", "Hall", square(100, 100, 20)),
    draft("rd_plaza", "Plaza", undefined),
  ]);
});

const renderOnPlan = () => render(<svg width={800} height={600}><DraftsOnPlan levelId="oth-L2" /></svg>);
const path = (id: string) => screen.getByTestId(`draft-${id}`).querySelector("path")!;

describe("DraftsOnPlan", () => {
  it("draws the drafts to review, and hides those already on the map until you ask for them", () => {
    renderOnPlan();
    expect(screen.getByTestId("draft-rd_shop")).toBeTruthy();
    expect(screen.queryByTestId("draft-rd_hall")).toBeNull();
    expect(screen.getByTestId("open-rd_plaza")).toBeTruthy();
    act(() => useDrafts.getState().setShowCovered(true));
    expect(screen.getByTestId("draft-rd_hall")).toBeTruthy();
  });

  it("selects a draft you click, and lets go of whatever the map had selected", () => {
    useEditorStore.getState().select({ type: "room", id: "L2-hall" });
    renderOnPlan();
    fireEvent.click(path("rd_shop"));
    expect(useDrafts.getState().selectedId).toBe("rd_shop");
    expect(useEditorStore.getState().selection).toBeNull();
  });

  it("takes no clicks while a drawing tool is in use", () => {
    useEditorStore.getState().setTool("draw-area");
    renderOnPlan();
    fireEvent.click(path("rd_shop"));
    expect(useDrafts.getState().selectedId).toBeNull();
  });

  it("frames what it is asked to, at the plan's own size", () => {
    renderOnPlan();
    const box = { minX: -4, minY: -4, maxX: 14, maxY: 14 };
    act(() => useDrafts.getState().frameBox(box));
    expect(useEditorStore.getState().viewport).toEqual(fitViewport(box, 800, 600, 60));
  });
});
```

Append to `packages/editor/src/build/BuildWorkspace.test.tsx`, at the end of the file:

```tsx
describe("BuildWorkspace — drafts from the drawing", () => {
  const found = RoomDraftSchema.parse({
    id: "rd_1", levelId: "oth-L1", nameEn: "Changing Room", kind: "room",
    footprint: [[50, 0], [60, 0], [60, 10], [50, 10]], labelPoint: [55, 5], areaM2: 90,
    source: { checksum: "c".repeat(64), page: 1 },
  });

  it("draws the floor's drafts on Areas & rooms, and only there", async () => {
    const { api } = open("/floors/L1/build?step=rooms", { listRoomDrafts: vi.fn().mockResolvedValue([found]) });
    measure();
    expect(await screen.findByTestId("draft-rd_1")).toBeTruthy();
    expect(api.listRoomDrafts).toHaveBeenCalledWith("oth-L1");
    fireEvent.click(stepper().getByRole("button", { name: /^Pathways/ }));
    expect(screen.queryByTestId("draft-rd_1")).toBeNull();
  });
});
```

Add `RoomDraftSchema` to that file's `@oth/model` import. The file's `beforeEach` resets the stores it knows. Also add `useDrafts.getState().reset();` to it, with `import { useDrafts } from "./drafts";`.

Run, one file at a time:
- `bash .superpowers/run-tests.sh vitest packages/editor/src/build/drafts.test.ts packages/editor/src/plan/DraftLayer.test.tsx packages/editor/src/build/DraftsOnPlan.test.tsx`
- `bash .superpowers/run-tests.sh vitest packages/editor/src/build/BuildWorkspace.test.tsx`

Expected: FAIL, because `coverage`, `DraftLayer` and `DraftsOnPlan` do not exist.

- [ ] **Step 2: Append the view helpers to `build/drafts.ts`**

Change the `@oth/model` import to `import { bboxOfRing, live, pointInPolygon, type BBox, type MapModel, type Room, type RoomDraft } from "@oth/model";`, add `import { useEditorStore } from "../state/store";`, and append:

```ts
/**
 * How much of a room a draft covers, 0 to 1, by sampling the room on a grid
 * of about 400 points. Pairs whose boxes do not meet cost one comparison, so
 * L1's 193 rooms against as many drafts stay quick.
 */
export function coverage(draft: Pick<RoomDraft, "footprint" | "holes">, room: Pick<Room, "footprint" | "holes">): number {
  if (!draft.footprint) return 0;
  const r = bboxOfRing(room.footprint);
  const d = bboxOfRing(draft.footprint);
  if (d.maxX <= r.minX || d.minX >= r.maxX || d.maxY <= r.minY || d.minY >= r.maxY) return 0;
  const step = Math.max(0.05, Math.sqrt(((r.maxX - r.minX) * (r.maxY - r.minY)) / 400));
  let inRoom = 0;
  let both = 0;
  for (let x = r.minX + step / 2; x < r.maxX; x += step) {
    for (let y = r.minY + step / 2; y < r.maxY; y += step) {
      if (!pointInPolygon([x, y], room.footprint, room.holes)) continue;
      inRoom++;
      if (pointInPolygon([x, y], draft.footprint, draft.holes)) both++;
    }
  }
  return inRoom === 0 ? 0 : both / inRoom;
}

export type DraftView = {
  review: RoomDraft[];
  covered: { draft: RoomDraft; roomId: string }[];
  /** Spaces the drawing leaves open: drawn by hand at their names. */
  open: RoomDraft[];
};

/**
 * A floor's drafts, sorted for review (spec §5.2 step 6). A draft covering
 * more than half of a room already on the map is under "already on the map".
 * A column is measured against columns only, so a hall is never taken for a
 * column standing in it.
 */
export function draftView(drafts: readonly RoomDraft[], rooms: readonly Room[]): DraftView {
  const view: DraftView = { review: [], covered: [], open: [] };
  for (const d of drafts) {
    if (!d.footprint) {
      view.open.push(d);
      continue;
    }
    const detail = d.kind === "detail";
    const room = rooms.find(r => (r.kind === "detail") === detail && coverage(d, r) > 0.5);
    if (room) view.covered.push({ draft: d, roomId: room.id });
    else view.review.push(d);
  }
  return view;
}

const NO_DRAFTS: readonly RoomDraft[] = [];
let lastView: { drafts: readonly RoomDraft[] | undefined; model: MapModel | null; levelId: string | null; view: DraftView } | null = null;

/**
 * The open floor's drafts, sorted. One answer, shared by the plan, the review
 * and the to-do count, until the drafts or the map change: the sort samples
 * every room a draft touches, so it is done once, not three times a render.
 */
export function useDraftView(levelId: string | null): DraftView {
  const drafts = useDrafts(s => (levelId ? s.byLevel[levelId] : undefined));
  const model = useEditorStore(s => s.model);
  if (!lastView || lastView.drafts !== drafts || lastView.model !== model || lastView.levelId !== levelId) {
    const rooms = model && levelId ? live(model.rooms).filter(r => r.levelId === levelId) : [];
    lastView = { drafts, model, levelId, view: draftView(drafts ?? NO_DRAFTS, rooms) };
  }
  return lastView.view;
}

/** The part of the plan to show for a draft: its shape with 4 m round it, or 15 m round an open space's name. */
export function draftBox(d: Pick<RoomDraft, "footprint" | "labelPoint">): BBox {
  if (d.footprint) {
    const b = bboxOfRing(d.footprint);
    return { minX: b.minX - 4, minY: b.minY - 4, maxX: b.maxX + 4, maxY: b.maxY + 4 };
  }
  const [x, y] = d.labelPoint;
  return { minX: x - 15, minY: y - 15, maxX: x + 15, maxY: y + 15 };
}
```

- [ ] **Step 3: Write `DraftLayer.tsx` and `DraftsOnPlan.tsx`**

Append to `packages/editor/src/plan/colours.ts`:

```ts
/**
 * A draft from the drawing, in the proposed colour (`proposed` in
 * tailwind.config): it is a claim until someone accepts it.
 */
export const PROPOSED_STROKE = "#0284c7";
```

`packages/editor/src/plan/DraftLayer.tsx`:

```tsx
import { bboxOfRing, type RoomDraft } from "@oth/model";
import { PROPOSED_STROKE, SELECTED_STROKE } from "./colours";
import { worldToScreen, type Viewport } from "./viewport";

export type ShownDraft = { draft: RoomDraft; covered: boolean };

/** A name is drawn only on a draft at least this wide on screen, so a floor of drafts is not a wall of text. */
const NAME_MIN_WIDTH_PX = 40;

/**
 * Drafts from the drawing on the plan (spec §5.2 step 6). Dashed, in the
 * proposed colour, and named, so a draft differs from a room by more than its
 * colour. One already on the map is fainter, and says so to a screen reader.
 * Presentational: `DraftsOnPlan` gives it what to draw.
 */
export function DraftLayer({ drafts, open, selectedId, viewport, clickable, onSelect }: {
  drafts: readonly ShownDraft[];
  open: readonly RoomDraft[];
  selectedId: string | null;
  viewport: Viewport;
  /** Only while Select is in use: a drawing tool's click belongs to the canvas under it. */
  clickable: boolean;
  onSelect: (id: string) => void;
}) {
  const path = (d: RoomDraft) =>
    [d.footprint!, ...d.holes].map(ring => `M${ring.map(p => worldToScreen(viewport, p).join(",")).join("L")}Z`).join(" ");
  return (
    <g data-testid="draft-layer">
      {drafts.map(({ draft, covered }) => {
        const selected = draft.id === selectedId;
        const [lx, ly] = worldToScreen(viewport, draft.labelPoint);
        const box = bboxOfRing(draft.footprint!);
        const wide = (box.maxX - box.minX) * viewport.scale >= NAME_MIN_WIDTH_PX;
        return (
          <g key={draft.id} data-testid={`draft-${draft.id}`}>
            <path
              d={path(draft)}
              fillRule="evenodd"
              fill={PROPOSED_STROKE}
              fillOpacity={selected ? 0.18 : 0.06}
              stroke={selected ? SELECTED_STROKE : PROPOSED_STROKE}
              strokeOpacity={covered ? 0.5 : 1}
              strokeWidth={selected ? 2.5 : 1.5}
              strokeDasharray="6 4"
              pointerEvents={clickable ? "visiblePainted" : "none"}
              style={{ cursor: clickable ? "pointer" : undefined }}
              onClick={event => {
                if (!clickable) return;
                event.stopPropagation();
                onSelect(draft.id);
              }}
            >
              <title>{`Draft: ${draft.nameEn}${covered ? " (already on the map)" : ""}`}</title>
            </path>
            {wide && (
              <text x={lx} y={ly} textAnchor="middle" fontSize={11} fill={PROPOSED_STROKE} pointerEvents="none">
                {draft.nameEn}
              </text>
            )}
          </g>
        );
      })}
      {open.map(d => {
        const [x, y] = worldToScreen(viewport, d.labelPoint);
        return (
          <g key={d.id} data-testid={`open-${d.id}`} pointerEvents="none">
            <circle cx={x} cy={y} r={6} fill="none" stroke={PROPOSED_STROKE} strokeDasharray="2 2" />
            <text x={x + 9} y={y + 4} fontSize={11} fill={PROPOSED_STROKE}>{`${d.nameEn} · draw by hand`}</text>
          </g>
        );
      })}
    </g>
  );
}
```

`packages/editor/src/build/DraftsOnPlan.tsx`:

```tsx
import { useEffect, useRef } from "react";
import { DraftLayer, type ShownDraft } from "../plan/DraftLayer";
import { fitViewport } from "../plan/viewport";
import { useEditorStore } from "../state/store";
import { useDraftView, useDrafts } from "./drafts";

/** Room round a framed draft on screen, as zooming to a selection has. */
const FRAME_PAD_PX = 60;

/**
 * The drafts layer, wired to the stores. Mounted through PlanCanvas's
 * `overlays` slot on Areas & rooms. It frames what the review asks it to: it
 * sits inside the plan's own <svg>, so it knows the plan's size.
 */
export function DraftsOnPlan({ levelId }: { levelId: string | null }) {
  const view = useDraftView(levelId);
  const showCovered = useDrafts(s => s.showCovered);
  const selectedId = useDrafts(s => s.selectedId);
  const frame = useDrafts(s => s.frame);
  const viewport = useEditorStore(s => s.viewport);
  const tool = useEditorStore(s => s.tool);
  const group = useRef<SVGGElement>(null);

  useEffect(() => {
    const svg = group.current?.ownerSVGElement;
    if (!frame || !svg) return;
    const width = Number(svg.getAttribute("width"));
    const height = Number(svg.getAttribute("height"));
    if (width > 0 && height > 0) useEditorStore.getState().setViewport(fitViewport(frame.box, width, height, FRAME_PAD_PX));
  }, [frame]);

  const shown: ShownDraft[] = [
    ...view.review.map(draft => ({ draft, covered: false })),
    ...(showCovered ? view.covered.map(c => ({ draft: c.draft, covered: true })) : []),
  ];
  return (
    <g ref={group}>
      <DraftLayer
        drafts={shown}
        open={view.open}
        selectedId={selectedId}
        viewport={viewport}
        clickable={tool === "select"}
        onSelect={id => {
          // One thing is selected at a time: a draft in hand lets go of the room or pathway.
          useEditorStore.getState().select(null);
          useDrafts.getState().select(id);
        }}
      />
    </g>
  );
}
```

- [ ] **Step 4: Mount it through the `overlays` slot**

Check `packages/editor/src/plan/PlanCanvas.tsx` for `overlays`.
- If Part A's Task 4 has added it, use it as it is.
- If not, add it exactly as Part A's plan (`2026-09-28-survey-in-map.md`, Task 4 Step 4) specifies, so that whichever part lands second finds it already there:
  - the React import gains `type ReactNode`;
  - `PlanCanvasProps` gains, after `showHint`:

```ts
  /**
   * SVG drawn over the spaces, pathways and details, and under the corner
   * handles and markers: room labels, and the layers later parts add. Each
   * overlay reads the viewport from the store, as the canvas does, and sets
   * its own pointer events. A label lets clicks through to the room beneath.
   */
  overlays?: ReactNode;
```

  - `overlays,` goes in the destructured props after `showHint = true,`;
  - `{overlays}` goes directly after `{rooms.filter(r => r.kind === "detail").map(renderRoom)}` in the SVG.

In `packages/editor/src/build/BuildWorkspace.tsx`, add `import { DraftsOnPlan } from "./DraftsOnPlan";`, and on `<PlanCanvas …>`:
- **If Part A's labels are already mounted there** (`overlays={<PlanRoomLabels labels={labels} />}`), make it:

```tsx
              overlays={<>
                <PlanRoomLabels labels={labels} />
                {step === "rooms" && <DraftsOnPlan levelId={levelId} />}
              </>}
```

- **Otherwise**, add `overlays={step === "rooms" ? <DraftsOnPlan levelId={levelId} /> : undefined}`. Part A's Task 5 then wraps both as above when it lands.

- [ ] **Step 5: Run the tests to see them pass, and typecheck**

Run the two commands from Step 1, one after the other. Expected: PASS, the whole of `BuildWorkspace.test.tsx` included.

Run: `bash .superpowers/run-tests.sh tsc packages/editor`. Expected: no errors.

- [ ] **Step 6: Try it on the sandbox**

On the floor searched in Task 6, open Areas & rooms. Expect:
- the drafts dashed in blue, named where they are wide enough;
- open spaces marked *· draw by hand*;
- on the L1 sheet, most drafts hidden as already on the map.

- [ ] **Step 7: Commit**

```bash
git add packages/editor/src/build/drafts.ts packages/editor/src/build/drafts.test.ts packages/editor/src/plan/DraftLayer.tsx packages/editor/src/plan/DraftLayer.test.tsx packages/editor/src/build/DraftsOnPlan.tsx packages/editor/src/build/DraftsOnPlan.test.tsx packages/editor/src/plan/colours.ts packages/editor/src/build/BuildWorkspace.tsx packages/editor/src/build/BuildWorkspace.test.tsx
git commit --only -m "feat(editor): drafts from the drawing on the plan, dashed and named

On Areas & rooms, through the plan's overlays slot. A draft covering more
than half of a room already on the map is hidden until asked for, so on
L1 only what the script dropped shows. Clicking one takes it in hand.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- packages/editor/src/build/drafts.ts packages/editor/src/build/drafts.test.ts packages/editor/src/plan/DraftLayer.tsx packages/editor/src/plan/DraftLayer.test.tsx packages/editor/src/build/DraftsOnPlan.tsx packages/editor/src/build/DraftsOnPlan.test.tsx packages/editor/src/plan/colours.ts packages/editor/src/build/BuildWorkspace.tsx packages/editor/src/build/BuildWorkspace.test.tsx
```

If this task added the `overlays` slot, add `packages/editor/src/plan/PlanCanvas.tsx` to both path lists, and say so in the message.

---
### Task 8: Reviewing drafts

This task is the review (spec §5.2 step 7):
- The to-do list says *n drafts to review*.
- A selected draft shows its name (editable), its kind and its area.
- **Accept (A) · Reject (R) · Skip (S)** use Review's keys. **Accept all** comes with a single Undo.
- Open spaces are listed as *Draw by hand*: choosing one picks Draw area and frames it.

**Files:**
- Create: `packages/editor/src/build/draftActions.ts`, `packages/editor/src/build/draftActions.test.ts`
- Create: `packages/editor/src/build/useDraftKeys.ts`
- Create: `packages/editor/src/build/DraftsPanel.tsx`, `packages/editor/src/build/DraftsPanel.test.tsx`
- Modify: `packages/editor/src/build/StepTools.tsx` (`RoomsTools` shows the panel)
- Modify: `packages/editor/src/build/todo.ts`, `packages/editor/src/build/todo.test.ts`
- Modify: `packages/editor/src/build/BuildWorkspace.tsx` (the count, one hook-in), `packages/editor/src/build/BuildWorkspace.test.tsx` (append one test)

**Interfaces:**
- Consumes:
  - from Task 6: `useDrafts` and `loadDrafts`, and the API's `acceptRoomDrafts`, `unacceptRoomDrafts`, `rejectRoomDraft` and `restoreRoomDraft`;
  - from Task 7: `useDraftView` and `draftBox`;
  - existing building blocks: `Saver` (`saver.apply`, `saver.refresh`), `offerUndo`, `reportFailure`, `ignoreKey`, `Button`, `Kbd`.
- Produces:
  - `draftActions.ts`:
    - `type ReviewContext = { api: Api; saver: Saver; levelId: string }`
    - `type Decision = { draft: RoomDraft; nameEn: string; kind: RoomKind }`
    - `acceptDrafts(ctx, decisions): Promise<boolean>`, `rejectDraft(ctx, draft, words?): Promise<boolean>`, `nextDraft(list, id): RoomDraft | null`
  - `useDraftKeys(handlers | null)`
  - `<DraftsPanel api saver />`
  - `stepTodos(model, report, levelImages, levelId, draftsToReview = 0)`

- [ ] **Step 1: Write the failing tests**

`packages/editor/src/build/draftActions.test.ts`:

```ts
import { RoomDraftSchema, type RoomDraft } from "@oth/model";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { ApiError } from "../api/client";
import { createSaver } from "../state/save";
import { useEditorStore } from "../state/store";
import { fakeApi } from "../testing/fakeApi";
import { useToasts } from "../ui/toast";
import { acceptDrafts, nextDraft, rejectDraft } from "./draftActions";

const draft = (id: string, nameEn: string): RoomDraft => RoomDraftSchema.parse({
  id, levelId: "oth-L2", nameEn, kind: "room", footprint: [[0, 0], [10, 0], [10, 10], [0, 10]],
  labelPoint: [5, 5], areaM2: 96, source: { checksum: "c".repeat(64), page: 1 }, version: 0,
});
const shop = draft("rd_shop", "Shop");
const store = draft("rd_store", "Store Room");
const lastToast = () => useToasts.getState().toasts.at(-1);

function context(overrides: Parameters<typeof fakeApi>[0] = {}) {
  const api = fakeApi({
    acceptRoomDrafts: vi.fn(async (items: { id: string }[]) =>
      items.map((i, n) => ({ draftId: i.id, draftVersion: 2, roomId: `L2-room-${n}`, roomVersion: 0 }))),
    ...overrides,
  });
  return { api, saver: createSaver(api), levelId: "oth-L2" };
}

beforeEach(() => {
  useEditorStore.getState().reset();
  useToasts.getState().clear();
});

describe("acceptDrafts", () => {
  it("makes rooms with the names and kinds decided, reloads the map and the drafts, and offers one Undo", async () => {
    const ctx = context();
    expect(await acceptDrafts(ctx, [{ draft: shop, nameEn: "Shop 12", kind: "service" }, { draft: store, nameEn: "Store Room", kind: "room" }])).toBe(true);
    expect(ctx.api.acceptRoomDrafts).toHaveBeenCalledWith([
      { id: "rd_shop", expectedVersion: 0, nameEn: "Shop 12", kind: "service" },
      { id: "rd_store", expectedVersion: 0, nameEn: "Store Room", kind: "room" },
    ]);
    expect(ctx.api.getModel).toHaveBeenCalled();
    expect(ctx.api.listRoomDrafts).toHaveBeenCalledWith("oth-L2");
    expect(lastToast()).toMatchObject({ message: "Added 2 rooms", action: { label: "Undo" } });

    await lastToast()!.action!.run();
    expect(ctx.api.unacceptRoomDrafts).toHaveBeenCalledWith([
      { id: "rd_shop", expectedVersion: 2, roomVersion: 0 },
      { id: "rd_store", expectedVersion: 2, roomVersion: 0 },
    ]);
    expect(lastToast()?.message).toBe("The 2 rooms are drafts again");
  });

  it("names a single room in its toast", async () => {
    await acceptDrafts(context(), [{ draft: shop, nameEn: "Shop 12", kind: "room" }]);
    expect(lastToast()?.message).toBe("Added Shop 12");
  });

  it("says a refusal in the server's words, reloads the drafts, and offers no Undo", async () => {
    const ctx = context({
      acceptRoomDrafts: vi.fn().mockRejectedValue(new ApiError(422, { error: "Shop is no longer waiting for review: it was rejected, or the drawing was searched again." })),
    });
    expect(await acceptDrafts(ctx, [{ draft: shop, nameEn: "Shop", kind: "room" }])).toBe(false);
    expect(lastToast()?.message).toMatch(/the drawing was searched again/);
    expect(lastToast()?.action).toBeUndefined();
    expect(ctx.api.listRoomDrafts).toHaveBeenCalledWith("oth-L2");
  });
});

describe("rejectDraft", () => {
  it("retires the draft and offers Undo, which brings it back at the version the delete left", async () => {
    const ctx = context();
    expect(await rejectDraft(ctx, shop)).toBe(true);
    expect(ctx.api.rejectRoomDraft).toHaveBeenCalledWith("rd_shop", 0);
    expect(lastToast()).toMatchObject({ message: "Rejected Shop", action: { label: "Undo" } });
    await lastToast()!.action!.run();
    expect(ctx.api.restoreRoomDraft).toHaveBeenCalledWith("rd_shop", 1);
  });

  it("offers Retry when the reject never arrived", async () => {
    const ctx = context({ rejectRoomDraft: vi.fn().mockRejectedValue(new TypeError("Failed to fetch")) });
    expect(await rejectDraft(ctx, shop)).toBe(false);
    expect(lastToast()?.action?.label).toBe("Retry");
    expect(ctx.api.restoreRoomDraft as unknown as Mock).not.toHaveBeenCalled();
  });
});

describe("nextDraft", () => {
  it("is the one after, going round, and nothing when it was the only one", () => {
    expect(nextDraft([shop, store], "rd_shop")?.id).toBe("rd_store");
    expect(nextDraft([shop, store], "rd_store")?.id).toBe("rd_shop");
    expect(nextDraft([shop], "rd_shop")).toBeNull();
    expect(nextDraft([shop, store], "gone")?.id).toBe("rd_shop");
    expect(nextDraft([], null)).toBeNull();
  });
});
```

`packages/editor/src/build/DraftsPanel.test.tsx`:

```tsx
import { RoomDraftSchema, parseModel, type RoomDraft } from "@oth/model";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { ApiError } from "../api/client";
import { createSaver } from "../state/save";
import { useEditorStore } from "../state/store";
import { fakeApi } from "../testing/fakeApi";
import { useToasts } from "../ui/toast";
import { useDrafts } from "./drafts";
import { DraftsPanel } from "./DraftsPanel";
import { useBuildKeys } from "./useBuildKeys";

const square = (x: number, y: number, s: number): [number, number][] => [[x, y], [x + s, y], [x + s, y + s], [x, y + s]];
const model = parseModel({
  building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
  levels: [{ id: "oth-L2", buildingId: "oth", code: "L2", ordinal: 2, nameEn: "L2", nameZh: "二楼", elevationM: 6, heightM: 4 }],
  rooms: [{ id: "L2-hall", levelId: "oth-L2", kind: "area", footprint: square(100, 100, 20), heightM: 4 }],
});
const draft = (id: string, nameEn: string, over: Record<string, unknown> = {}): RoomDraft => RoomDraftSchema.parse({
  id, levelId: "oth-L2", nameEn, kind: "room", footprint: square(0, 0, 10), labelPoint: [5, 5], areaM2: 96.2,
  source: { checksum: "c".repeat(64), page: 1 }, version: 0, ...over,
});
const shop = draft("rd_shop", "Shop");
const store = draft("rd_store", "Store Room", { footprint: square(20, 0, 10), labelPoint: [25, 5], kind: "service" });
const copy = draft("rd_copy", "Hall", { footprint: square(100, 100, 20), labelPoint: [110, 110], kind: "area" });
const plaza = draft("rd_plaza", "Plaza", { footprint: undefined, kind: "area", labelPoint: [60, 60], areaM2: 0 });
const all = [shop, store, copy, plaza];

/** Build's own keys are mounted too, as in the workspace, so A and R are contested as they are there. */
function Keys() {
  useBuildKeys({ onFit: () => {}, onDelete: () => {}, onStep: () => {} });
  return null;
}

function setup(overrides: Parameters<typeof fakeApi>[0] = {}) {
  const api = fakeApi({
    getModel: vi.fn().mockResolvedValue(model),
    listRoomDrafts: vi.fn().mockResolvedValue(all),
    acceptRoomDrafts: vi.fn(async (items: { id: string }[]) =>
      items.map((i, n) => ({ draftId: i.id, draftVersion: 2, roomId: `L2-room-${n}`, roomVersion: 0 }))),
    ...overrides,
  });
  render(<><Keys /><DraftsPanel api={api} saver={createSaver(api)} /></>);
  return api;
}

const key = (k: string, target: Element = document.body) => fireEvent.keyDown(target, { key: k });
const lastToast = () => useToasts.getState().toasts.at(-1);
const hold = (d: RoomDraft) => act(() => useDrafts.getState().select(d.id));

beforeEach(() => {
  useDrafts.getState().reset();
  useToasts.getState().clear();
  const s = useEditorStore.getState();
  s.reset();
  s.setModel(model);
  s.setActiveLevel("oth-L2");
  useDrafts.getState().setDrafts("oth-L2", all);
});

describe("DraftsPanel", () => {
  it("says how many drafts wait, and how many are on the map already", () => {
    setup();
    expect(screen.getByText("2 drafts to review")).toBeTruthy();
    expect(screen.getByText(/1 already on the map/)).toBeTruthy();
  });

  it("shows the draft in hand: its name to edit, its kind and its area", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Review the drafts" }));
    expect(useDrafts.getState().selectedId).toBe("rd_shop");
    expect(screen.getByLabelText("Draft name")).toHaveValue("Shop");
    expect(screen.getByLabelText("Draft kind")).toHaveValue("room");
    expect(screen.getByText("96 m²")).toBeTruthy();
  });

  it("accepts the draft with your corrections, then takes up the next", async () => {
    const api = setup();
    hold(shop);
    fireEvent.change(screen.getByLabelText("Draft name"), { target: { value: "Shop 12" } });
    fireEvent.change(screen.getByLabelText("Draft kind"), { target: { value: "service" } });
    fireEvent.click(screen.getByRole("button", { name: "Accept A" }));
    await waitFor(() => expect(api.acceptRoomDrafts).toHaveBeenCalledWith([{ id: "rd_shop", expectedVersion: 0, nameEn: "Shop 12", kind: "service" }]));
    await waitFor(() => expect(useDrafts.getState().selectedId).toBe("rd_store"));
    expect(lastToast()?.message).toBe("Added Shop 12");
  });

  it("won't accept a draft with no name", () => {
    setup();
    hold(shop);
    fireEvent.change(screen.getByLabelText("Draft name"), { target: { value: "  " } });
    expect(screen.getByRole("button", { name: "Accept A" })).toBeDisabled();
  });

  it("takes A as Accept while a draft is in hand, and never as Draw area", async () => {
    const api = setup();
    hold(shop);
    key("a");
    await waitFor(() => expect(api.acceptRoomDrafts).toHaveBeenCalledTimes(1));
    expect(useEditorStore.getState().tool).toBe("select");
  });

  it("takes R as Reject and S as Skip while a draft is in hand", async () => {
    const api = setup();
    hold(shop);
    key("s");
    expect(useDrafts.getState().selectedId).toBe("rd_store");
    key("r");
    await waitFor(() => expect(api.rejectRoomDraft).toHaveBeenCalledWith("rd_store", 0));
    expect(useEditorStore.getState().tool).toBe("select");
  });

  it("leaves A to Draw area when no draft is in hand", () => {
    const api = setup();
    key("a");
    expect(useEditorStore.getState().tool).toBe("draw-area");
    expect(api.acceptRoomDrafts).not.toHaveBeenCalled();
  });

  it("types an a into the name, rather than accepting", () => {
    const api = setup();
    hold(shop);
    key("a", screen.getByLabelText("Draft name"));
    expect(api.acceptRoomDrafts).not.toHaveBeenCalled();
  });

  it("accepts every draft to review in one go, never one already on the map, with one Undo for them all", async () => {
    const api = setup();
    act(() => useDrafts.getState().setShowCovered(true));
    fireEvent.click(screen.getByRole("button", { name: "Accept all 2 to review" }));
    await waitFor(() => expect(api.acceptRoomDrafts).toHaveBeenCalledTimes(1));
    expect((api.acceptRoomDrafts as unknown as Mock).mock.calls[0]![0].map((i: { id: string }) => i.id)).toEqual(["rd_shop", "rd_store"]);
    await waitFor(() => expect(lastToast()?.message).toBe("Added 2 rooms"));
    await lastToast()!.action!.run();
    expect(api.unacceptRoomDrafts).toHaveBeenCalledTimes(1);
  });

  it("says so when the draft was replaced by a teammate's new search, and reloads the drafts", async () => {
    const api = setup({
      acceptRoomDrafts: vi.fn().mockRejectedValue(new ApiError(422, { error: "Shop is no longer waiting for review: it was rejected, or the drawing was searched again." })),
    });
    hold(shop);
    fireEvent.click(screen.getByRole("button", { name: "Accept A" }));
    await waitFor(() => expect(lastToast()?.message).toMatch(/the drawing was searched again/));
    expect(api.listRoomDrafts).toHaveBeenCalledWith("oth-L2");
  });

  it("lists open spaces to draw by hand: choosing one picks Draw area and frames it, and Done takes it off", async () => {
    const api = setup();
    fireEvent.click(screen.getByRole("button", { name: "Plaza" }));
    expect(useEditorStore.getState().tool).toBe("draw-area");
    expect(useDrafts.getState().frame?.box).toEqual({ minX: 45, minY: 45, maxX: 75, maxY: 75 });
    fireEvent.click(screen.getByRole("button", { name: "Done with Plaza" }));
    await waitFor(() => expect(api.rejectRoomDraft).toHaveBeenCalledWith("rd_plaza", 0));
  });

  it("lets go of the draft when a room is picked on the plan", () => {
    setup();
    hold(shop);
    act(() => useEditorStore.getState().select({ type: "room", id: "L2-hall" }));
    expect(useDrafts.getState().selectedId).toBeNull();
  });
});
```

Append to `packages/editor/src/build/todo.test.ts`:

```ts
describe("stepTodos — drafts from the drawing", () => {
  it("says how many drafts wait on Areas & rooms, as one item", () => {
    const rooms = stepTodos(model, null, [scaled], "oth-L1", 3).rooms;
    expect(rooms).toContainEqual({
      key: "rooms.drafts", step: "rooms", severity: "warning", code: "rooms.drafts",
      message: "3 drafts to review.", target: { kind: "none" },
    });
    expect(stepTodos(model, null, [scaled], "oth-L1", 1).rooms.find(t => t.code === "rooms.drafts")?.message).toBe("1 draft to review.");
  });

  it("says nothing of drafts when none wait", () => {
    expect(codes(stepTodos(model, null, [scaled], "oth-L1").rooms)).not.toContain("rooms.drafts");
  });
});
```

Append to `packages/editor/src/build/BuildWorkspace.test.tsx`, inside Task 7's `describe("BuildWorkspace — drafts from the drawing", …)`:

```tsx
  it("counts the drafts to review on the to-do list, and in the review beside the tools", async () => {
    open("/floors/L1/build?step=rooms", { listRoomDrafts: vi.fn().mockResolvedValue([found]) });
    expect(await within(screen.getByRole("region", { name: "To do" })).findByText("1 draft to review.")).toBeTruthy();
    expect(screen.getByText("1 draft to review")).toBeTruthy();
  });
```

Run, one command at a time:
- `bash .superpowers/run-tests.sh vitest packages/editor/src/build/draftActions.test.ts packages/editor/src/build/DraftsPanel.test.tsx`
- `bash .superpowers/run-tests.sh vitest packages/editor/src/build/todo.test.ts packages/editor/src/build/BuildWorkspace.test.tsx`

Expected: FAIL. `./draftActions` and `./DraftsPanel` do not exist, and `stepTodos` takes no count.

- [ ] **Step 2: Write `draftActions.ts`**

```ts
import type { RoomDraft, RoomKind } from "@oth/model";
import type { AcceptedDraft, Api } from "../api/client";
import type { Saver } from "../state/save";
import { reportFailure } from "../ui/failure";
import { offerUndo } from "../ui/offerUndo";
import { loadDrafts } from "./drafts";

export type ReviewContext = { api: Api; saver: Saver; levelId: string };
export type Decision = { draft: RoomDraft; nameEn: string; kind: RoomKind };

/**
 * Drafts made rooms, all or none, with one Undo for the lot (spec §5.2 step
 * 7). Through the saver, so a conflict is the banner, a failure is the usual
 * toast, and the map reloads once it lands. The drafts reload either way:
 * after a refusal, the list has usually moved on (a teammate searched again).
 */
export async function acceptDrafts(ctx: ReviewContext, decisions: readonly Decision[]): Promise<boolean> {
  if (decisions.length === 0) return false;
  let accepted: AcceptedDraft[] = [];
  const landed = await ctx.saver.apply("room", decisions[0]!.draft.id, async () => {
    accepted = await ctx.api.acceptRoomDrafts(decisions.map(d => ({
      id: d.draft.id, expectedVersion: d.draft.version, nameEn: d.nameEn, kind: d.kind,
    })));
  });
  await loadDrafts(ctx.api, ctx.levelId);
  if (!landed) return false;
  const one = decisions.length === 1;
  const label = one ? decisions[0]!.nameEn : `${decisions.length} rooms`;
  offerUndo({
    message: `Added ${label}`,
    undone: one ? `${label} is a draft again` : `The ${label} are drafts again`,
    what: label,
    run: () => ctx.api.unacceptRoomDrafts(accepted.map(a => ({ id: a.draftId, expectedVersion: a.draftVersion, roomVersion: a.roomVersion }))),
    refresh: async () => {
      await ctx.saver.refresh();
      await loadDrafts(ctx.api, ctx.levelId);
    },
  });
  return true;
}

/**
 * A draft set aside: a soft delete, with Undo. The map is not reloaded: a
 * draft is not on it. `words` lets an open space say "Took Plaza off the
 * list" rather than "Rejected".
 */
export async function rejectDraft(
  ctx: ReviewContext, draft: RoomDraft,
  words = { done: `Rejected ${draft.nameEn}`, undone: `${draft.nameEn} is back` },
): Promise<boolean> {
  try {
    await ctx.api.rejectRoomDraft(draft.id, draft.version);
  } catch (err) {
    reportFailure(err, { doing: `reject ${draft.nameEn}`, retry: () => rejectDraft(ctx, draft, words).then(() => {}) });
    await loadDrafts(ctx.api, ctx.levelId);
    return false;
  }
  await loadDrafts(ctx.api, ctx.levelId);
  offerUndo({
    message: words.done,
    undone: words.undone,
    what: draft.nameEn,
    run: () => ctx.api.restoreRoomDraft(draft.id, draft.version + 1),
    refresh: () => loadDrafts(ctx.api, ctx.levelId).then(() => {}),
  });
  return true;
}

/** The draft after this one, going round: what Accept, Reject and Skip take up next. Null when it was the only one. */
export function nextDraft(list: readonly RoomDraft[], id: string | null): RoomDraft | null {
  if (list.length === 0) return null;
  const i = list.findIndex(d => d.id === id);
  if (i === -1) return list[0]!;
  return list.length === 1 ? null : list[(i + 1) % list.length]!;
}
```

- [ ] **Step 3: Write `useDraftKeys.ts`**

```ts
import { useEffect, useRef } from "react";
import { ignoreKey } from "../ui/keys";

type DraftKeys = { accept: () => void; reject: () => void; skip: () => void };

/**
 * Review's keys for a draft in hand (spec §5.2 step 7): A accepts, R rejects,
 * S skips. Build already uses A for Draw area and R for Draw room. So while a
 * draft is in hand, these are heard first, on the window's capture phase, and
 * each one they take is marked handled. `useKeys`, which Build's keys go
 * through, skips a handled key. With no draft in hand they are Build's again.
 * The same `ignoreKey` rules hold: never while typing, and never behind a
 * dialog.
 */
export function useDraftKeys(handlers: DraftKeys | null): void {
  const latest = useRef(handlers);
  latest.current = handlers;
  useEffect(() => {
    const listen = (event: KeyboardEvent) => {
      const h = latest.current;
      if (!h || event.repeat || ignoreKey(event)) return;
      const act = ({ a: h.accept, r: h.reject, s: h.skip } as Record<string, (() => void) | undefined>)[event.key.toLowerCase()];
      if (!act) return;
      event.preventDefault();
      act();
    };
    window.addEventListener("keydown", listen, { capture: true });
    return () => window.removeEventListener("keydown", listen, { capture: true });
  }, []);
}
```

- [ ] **Step 4: Write `DraftsPanel.tsx`**

```tsx
import type { RoomDraft, RoomKind } from "@oth/model";
import { useEffect, useState } from "react";
import type { Api } from "../api/client";
import type { Saver } from "../state/save";
import { useEditorStore } from "../state/store";
import { Button } from "../ui/Button";
import { Kbd } from "../ui/Kbd";
import { acceptDrafts, nextDraft, rejectDraft, type ReviewContext } from "./draftActions";
import { draftBox, useDraftView, useDrafts } from "./drafts";
import { useDraftKeys } from "./useDraftKeys";

/** The kinds a draft can be made (spec §5.2: the script's word lists, and void). */
const KINDS: { value: RoomKind; label: string }[] = [
  { value: "room", label: "Room" },
  { value: "area", label: "Area" },
  { value: "service", label: "Service" },
  { value: "void", label: "Void" },
  { value: "detail", label: "Detail" },
];

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * The review of a floor's drafts, beside Find rooms in the drawing (spec §5.2
 * step 7). The draft in hand shows its name to correct, its kind and its
 * area. Accept, Reject and Skip each take up the next draft, and the plan
 * frames it. Accept all takes every draft still to review, but never one
 * already on the map: those are accepted one at a time, knowingly.
 */
export function DraftsPanel({ api, saver }: { api: Api; saver: Saver }) {
  const levelId = useEditorStore(s => s.activeLevelId);
  const mapSelection = useEditorStore(s => s.selection);
  const view = useDraftView(levelId);
  const selectedId = useDrafts(s => s.selectedId);
  const showCovered = useDrafts(s => s.showCovered);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<RoomKind>("room");
  const [busy, setBusy] = useState(false);

  const shown = showCovered ? [...view.review, ...view.covered.map(c => c.draft)] : view.review;
  const selected = shown.find(d => d.id === selectedId) ?? null;
  const coveredIds = new Set(view.covered.map(c => c.draft.id));

  // A new draft in hand starts from its own name and kind.
  useEffect(() => {
    if (selected) {
      setName(selected.nameEn);
      setKind(selected.kind);
    }
  }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // One thing is selected at a time: a room or pathway picked on the plan lets go of the draft.
  useEffect(() => {
    if (mapSelection) useDrafts.getState().select(null);
  }, [mapSelection]);

  const ctx: ReviewContext | null = levelId ? { api, saver, levelId } : null;

  function take(d: RoomDraft | null) {
    useDrafts.getState().select(d?.id ?? null);
    if (d) useDrafts.getState().frameBox(draftBox(d));
  }

  async function decide(run: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    try {
      await run();
    } finally {
      setBusy(false);
    }
  }

  const accept = () => {
    if (!selected || !ctx || !name.trim()) return;
    const after = nextDraft(shown, selected.id);
    void decide(async () => {
      if (await acceptDrafts(ctx, [{ draft: selected, nameEn: name.trim(), kind }])) take(after);
    });
  };
  const reject = () => {
    if (!selected || !ctx) return;
    const after = nextDraft(shown, selected.id);
    void decide(async () => {
      if (await rejectDraft(ctx, selected)) take(after);
    });
  };
  const skip = () => {
    if (selected) take(nextDraft(shown, selected.id));
  };
  const acceptAll = () => {
    if (!ctx) return;
    // The draft in hand goes with its corrections; the rest as they were found.
    const decisions = view.review.map(d => (d.id === selected?.id && name.trim()
      ? { draft: d, nameEn: name.trim(), kind }
      : { draft: d, nameEn: d.nameEn, kind: d.kind }));
    void decide(async () => {
      if (await acceptDrafts(ctx, decisions)) take(null);
    });
  };
  const drawByHand = (d: RoomDraft) => {
    const s = useEditorStore.getState();
    s.select(null);
    s.setTool("draw-area");
    useDrafts.getState().frameBox(draftBox(d));
  };

  useDraftKeys(selected ? { accept, reject, skip } : null);

  if (!levelId || view.review.length + view.covered.length + view.open.length === 0) return null;

  return (
    <section aria-label="Drafts from the drawing" className="space-y-2">
      <p className="text-xs text-stone-700">
        <span className="font-medium">{`${plural(view.review.length, "draft", "drafts")} to review`}</span>
        {view.covered.length > 0 && ` · ${view.covered.length} already on the map`}
      </p>
      {view.covered.length > 0 && (
        <label className="flex items-center gap-2 text-xs text-stone-700">
          <input type="checkbox" checked={showCovered} onChange={e => useDrafts.getState().setShowCovered(e.target.checked)} />
          Show the drafts already on the map
        </label>
      )}
      {selected ? (
        <div role="group" aria-label={`Draft: ${selected.nameEn}`} className="space-y-2 rounded bg-stone-100 p-2">
          <label className="block text-xs text-stone-700">
            Name
            <input aria-label="Draft name" value={name} onChange={e => setName(e.target.value)}
              className="mt-1 w-full rounded border border-stone-300 px-2 py-1 text-sm" />
          </label>
          <label className="block text-xs text-stone-700">
            Kind
            <select aria-label="Draft kind" value={kind} onChange={e => setKind(e.target.value as RoomKind)}
              className="mt-1 w-full rounded border border-stone-300 px-2 py-1 text-sm">
              {KINDS.map(k => <option key={k.value} value={k.value}>{k.label}</option>)}
            </select>
          </label>
          <p className="text-xs text-stone-600">
            {`${Math.round(selected.areaM2)} m²`}{coveredIds.has(selected.id) ? " · already on the map" : ""}
          </p>
          <div className="flex flex-wrap gap-1">
            <Button size="sm" variant="primary" disabled={busy || !name.trim()} onClick={accept}>Accept <Kbd>A</Kbd></Button>
            <Button size="sm" disabled={busy} onClick={reject}>Reject <Kbd>R</Kbd></Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={skip}>Skip <Kbd>S</Kbd></Button>
          </div>
        </div>
      ) : shown.length > 0 ? (
        <Button size="sm" onClick={() => take(shown[0]!)}>Review the drafts</Button>
      ) : null}
      {view.review.length > 1 && (
        <Button size="sm" disabled={busy} onClick={acceptAll}>{`Accept all ${view.review.length} to review`}</Button>
      )}
      {view.open.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-stone-700">Draw by hand</h3>
          <p className="text-xs text-stone-600">The drawing leaves these open, so they have no shape to add.</p>
          <ul className="mt-1 space-y-1">
            {view.open.map(d => (
              <li key={d.id} className="flex items-center gap-1">
                <Button size="sm" variant="ghost" onClick={() => drawByHand(d)}>{d.nameEn}</Button>
                <Button size="sm" variant="ghost" aria-label={`Done with ${d.nameEn}`}
                  onClick={() => ctx && void rejectDraft(ctx, d, { done: `Took ${d.nameEn} off the list`, undone: `${d.nameEn} is back on the list` })}>
                  Done
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
```

Delete the `eslint-disable-line` comment if the repo has no ESLint (it has none today). The effect depends on the draft's id alone on purpose: a reload that returns the same draft must not wipe a name being typed.

- [ ] **Step 5: Hook it in**

In `packages/editor/src/build/StepTools.tsx`, add `import { DraftsPanel } from "./DraftsPanel";`, and make `RoomsTools`:

```tsx
export function RoomsTools({ api, saver }: { api: Api; saver: Saver }) {
  return (
    <>
      <div className="flex flex-wrap items-start gap-2">
        <DraftsFind api={api} />
        <DxfImportButton saver={saver} />
      </div>
      <DraftsPanel api={api} saver={saver} />
    </>
  );
}
```

In `packages/editor/src/build/todo.ts`:
- give `stepTodos` a fifth parameter, `draftsToReview = 0`, with the doc line `/** Drafts from the floor's drawing still to review (Part B), counted by the caller: they are not in the map. */`;
- directly after the floorplan block (the `else if (image.metresPerPixel == null) { … }`), add:

```ts
  if (draftsToReview > 0) {
    todos.rooms.push({
      key: "rooms.drafts", step: "rooms", severity: "warning", code: "rooms.drafts",
      message: `${draftsToReview} ${draftsToReview === 1 ? "draft" : "drafts"} to review.`, target: NONE,
    });
  }
```

In `packages/editor/src/build/BuildWorkspace.tsx`, add `useDraftView` to the `./drafts` import, and change the `todos` memo to pass the count:

```tsx
  const draftsToReview = useDraftView(levelId).review.length;
  const todos = useMemo(
    () => (model && levelId ? stepTodos(model, report, levelImages, levelId, draftsToReview) : EMPTY_TODOS),
    [model, report, levelImages, levelId, draftsToReview],
  );
```

The stepper's count comes from `stepCounts(todos)`, so Areas & rooms counts the drafts too.

- [ ] **Step 6: Run the tests to see them pass, and typecheck**

Run the two commands from Step 1, then `bash .superpowers/run-tests.sh vitest packages/editor/src/build/StepTools.test.tsx`, one at a time. Expected: all PASS.

Run: `bash .superpowers/run-tests.sh tsc packages/editor`. Expected: no errors.

- [ ] **Step 7: Try the whole part on the sandbox**

On the :3055 sandbox:
1. Drop a PDF on a floor's Floorplan step.
2. On Areas & rooms, choose **Find rooms in the drawing**.
3. Choose **Review the drafts**, then press A, R and S. The plan frames each next draft.
4. Accept one with a corrected name. It turns into a room, verification `cad`, and Undo takes it back.
5. Reject one, and Undo brings it back.
6. Choose an open space: Draw area is in hand, framed on its name.
7. On L1, choose **Find rooms in the drawing** with L1's own sheet. Expect *n already on the map* for nearly everything, and only what the script dropped left to review.

- [ ] **Step 8: Commit**

```bash
git add packages/editor/src/build/draftActions.ts packages/editor/src/build/draftActions.test.ts packages/editor/src/build/useDraftKeys.ts packages/editor/src/build/DraftsPanel.tsx packages/editor/src/build/DraftsPanel.test.tsx packages/editor/src/build/StepTools.tsx packages/editor/src/build/todo.ts packages/editor/src/build/todo.test.ts packages/editor/src/build/BuildWorkspace.tsx packages/editor/src/build/BuildWorkspace.test.tsx
git commit --only -m "feat(editor): review the drafts from the drawing: Accept, Reject, Skip, and Accept all

A draft in hand shows its name to correct, its kind and its area. A, R
and S decide it and take up the next, ahead of Build's own A and R. An
accept makes the room from the drawing, and Accept all takes every draft
to review with one Undo. Open spaces are listed to draw by hand, and the
to-do list counts the drafts waiting.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- packages/editor/src/build/draftActions.ts packages/editor/src/build/draftActions.test.ts packages/editor/src/build/useDraftKeys.ts packages/editor/src/build/DraftsPanel.tsx packages/editor/src/build/DraftsPanel.test.tsx packages/editor/src/build/StepTools.tsx packages/editor/src/build/todo.ts packages/editor/src/build/todo.test.ts packages/editor/src/build/BuildWorkspace.tsx packages/editor/src/build/BuildWorkspace.test.tsx
```

**— Shippable again after Task 8 —**

---

## Self-review against the spec

| Spec | Where |
|---|---|
| §5.1 (c): the browser parses; pdf.js pinned exactly; no eval; the core stays pure under Vitest with the legacy build | Task 1 (`pdfjs.ts`, the Global Constraints), Task 3, Task 5 |
| §5.2 step 1: choose the page | Task 4 (`PdfPagePicker`, `importPdfPlan`) |
| §5.2 step 2: scale from the grid; runs agreeing to 0.5%; the report; fewer than two runs → unscaled; the printed ratio never read | Task 1 (`calibrate`, `describeCalibration`); Task 4 puts the report in the toast and the scale line |
| §5.2 step 3: 0.05 or 0.07 m/px; uploaded through the existing level-image endpoints with its calibration; the PDF alongside | Tasks 1 and 4; Task 2 (`POST …/source`) |
| §5.2 step 4: reuse the floor below's placement for the same sheet; otherwise centre; Align finishes | Task 4 (`placePlan`), which also reuses the placement of the plan it replaces |
| §5.2 step 5: Find rooms beside Import DXF; erase, pinch 0.5 m, flood, dilate back, clean, trace, simplify 0.4 m; drafts replace the floor's previous ones; escalators and stairs left out and reported; voids as drafts | Task 5 (`findRooms`), Task 6 (`DraftsFind`, `PUT …/drafts`) |
| §5.2 step 6: dashed, proposed colour, named; hidden when covering more than half of a room | Task 7 |
| §5.2 step 7: *n drafts to review*; name, kind and m²; A, R and S; Accept all with one Undo; the room's id from its name, its height from the level, walkable if an area, `cad` with the checksum; open spaces as *Draw by hand* | Task 8; Task 2 (`acceptDrafts`) |
| §5.3: `level_images.source`; `POST`/`GET …/source` (50 MB, `%PDF-` only, attachment, `nosniff`); the `roomDraft` entity kept out of `MapModel`; the PUT (1,000 drafts, 2 MB); accept and unaccept | Task 2 |
| §5.3 risks: a scan (no text) → says so, unscaled; rotated sheets tested; memory bounded | Tasks 1 and 4 (the no-text report); Task 5 (turned sheets); Task 1 (`PIXEL_BUDGET`) |
| §8: B's files; migrations only add; `api/client.ts`, `fakeApi` and `index.ts` appended to | Files table and Global Constraints; Task 2 Step 10 |
| §9: `calibrate` (agreeing runs, one thrown out, too few); the raster operations on small fixtures; a synthetic PDF with two rooms, a door gap, labels, a run of dimensions and a turned page; parity by hand (count within 5%, median IoU ≥ 0.95); PGlite tests of replace, accept, unaccept and the non-PDF refusal | Tasks 1, 3, 5 and 2 |

Deliberate departures from the spec, each with its reason in the code and its test:
- **The render is windowed to the drawing, not the whole page.** L1's whole page at 0.07 m/px would be 56 Mpx.
- **`origin in points` is derived, not stored.** Stored, it would go stale after Align.
- **The PDF has its own table**, so `data:export` carries it.
- **`isEvalSupported`** no longer exists in pdf.js 6.
- **Accept all never includes drafts already on the map.**
- **Four departures from the script:**
  - a scale-free pair check;
  - a run counted once when it straddles two lanes;
  - label lines grouped top first;
  - "Cleaner's", not "Cleaner'S".
