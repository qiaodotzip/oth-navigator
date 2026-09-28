# Plan 6E — The floor setup wizard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One floor at a time, a teammate is walked through getting it onto the map: footage, Claude's labels, their review, the floorplan, then Claude's rooms, places and objects, and pathways, a check of everything Claude did, and the hand-over to normal editing. Each step shows its real tool, and Claude's steps show the slash command to run and fill in the map as Claude works.

**Architecture:** A new `editor/src/setup/` folder. `types.ts` is this plan's side of the contract with 6C (what the four setup calls return). `progress.ts` holds the pure rules: when a step is done, what it still needs, where the wizard opens, and since when the check looks. `sync.ts` keeps each floor's setup in a small zustand store and polls it every 5 s while a Claude step is on screen. The steps' screens reuse the real tools: Survey's `AddFootageDialog`, `ReviewWorkspace`, Build's `FloorplanTools`, `DraftsFind` and `PlanCanvas`. `SetupWizard` puts the step the address names above a bottom bar. The header shows `SetupStepBar` in place of the floor's tabs. The Floors home card links in.

**Tech Stack:** TypeScript (strict, `noUncheckedIndexedAccess`, `noUnusedLocals`, `noUnusedParameters`), React 18, zustand 4, Tailwind 3, Vitest 1.6 with jsdom and Testing Library, Playwright (the rehearsal only, required from `my_library`).

**Spec:** [`docs/design-and-plans/specs/2026-09-28-guided-setup-objects-and-export-design.md`](../specs/2026-09-28-guided-setup-objects-and-export-design.md). Read §4 (the wizard), §8 (checking Claude's work) and §11 (the rehearsal) first. This plan covers §4 and §8 on the editor's side, and runs §11's rehearsal.

**Interfaces:** `.superpowers/sdd/2026-09-28-plan6/interfaces.md`. This plan owns its "Editor — owned by 6E" part and consumes 6C's four API client methods.

## Global Constraints

- Work in the worktree `C:\Users\qhuip\Repositories\oth_navigation\.claude\worktrees\ux-overhaul` on branch `ux-overhaul`, from its root. Never `cd` to the main checkout.
- From interfaces.md, verbatim:
  - **Tests** run only through `bash .superpowers/run-tests.sh vitest <paths>` and `bash .superpowers/run-tests.sh tsc <pkg dirs>`, folder-scoped. Builds take `.superpowers/test.lock` by hand. Parallel runs crashed the laptop.
  - **Commits:** `git commit --only -m "…" -- <paths>`, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never `git add -A`, never bare `git stash`.
  - **Screenshots** only on a sandbox copy of the dev database on a spare port, never :3000 or the main checkout's data. Playwright is required by absolute path from `C:/Users/qhuip/Repositories/my_library/node_modules/playwright`.
  - **Copy style:** short, plain sentences like the existing app. No emoji. Buttons say what they do.
- A new file must be staged by its path (`git add -- <path>`) before `git commit --only` can take it. Stage nothing else.
- **What this plan waits for.** The spec's build order puts 6E after 6C and 6D.
  - **6C's four client methods** (`getSetup`, `setSetupStep`, `listClaudeChanges`, `undoChange` in `api/client.ts`). `setup/setupApi.ts` (Task 7) is the only file that assumes they exist. Until they merge, `tsc` for the editor fails in that one file and nowhere else, and every vitest run still passes against the fakes in `setup/testing.ts`.
  - **6A's model fields.** Task 6 reads `placement.sightingIds`, and its test builds placements with `objectKindId`. Start Task 6 once 6A's model task has merged.
  - **6B's `DownloadModelButton({ api, levelId? })`** in `packages/editor/src/build/DownloadModel.tsx`. The Finish step (Task 4) imports it. Do Task 4's Add footage half first if it hasn't merged yet.
  - **A real browser** needs 6C's routes merged: Tasks 3, 6, 7 and 8 call them. Tasks 4 and 5 are reached only through the wizard (Task 7).
  - **The rehearsal (Task 9)** needs 6A, 6B, 6C and 6D merged.
- **Files other plans own. Never edit them here:**
  - `api/client.ts`, `api/client.test.ts` and `testing/fakeApi.ts` (6C adds the four methods).
  - Everything under `packages/server`, `packages/model` and `packages/renderer`.
  - 6A's survey, Places and plan-marker UI (`survey/`, `places/`, `plan/PlanCanvas.tsx`).
  - 6B's `build/DownloadModel.tsx`, and its lines in `build/BuildWorkspace.tsx`.
- **Shared files this plan edits:** `route.ts`, `shell/Header.tsx`, `shell/Workspace.tsx`, `shell/ClaudeCodeButton.tsx`, `home/FloorsHome.tsx` and `home/FloorCard.tsx`. Re-read each before editing. If an anchor has moved, keep the intent and fit the edit to the file as it stands.
- No new dependencies.
- UI rules, as in Plans 3–5:
  - second person, sentence case, and loading text that ends with `…`;
  - colour is never the only signal (✓, "Undone", "Low confidence", a line through);
  - 13 px (`text-xs`) is the smallest text;
  - colours are the tokens in `packages/editor/tailwind.config.ts`.
- Comments say *why*, in the repo's voice. Every test file sits beside the file it tests.
- Commit messages are `type(scope): summary`, then a body.

## Review Focus

1. **A Claude step left open while the server is slow or down, or after the session has ended.** It must send one request at a time, never a queue of them. It must not toast every 5 s, and must not poll with 401s while nobody is signed in. It says so in one quiet line, and recovers when the server answers. Pinned in Task 2 (`useSetupPoll`) and Task 3 (`ClaudeStep`).
2. **An address the wizard can't take at its word:** `/setup/0`, `/setup/12`, `/setup/x`, a lower-case floor code, a floor that doesn't exist. It opens the first step not done and writes that into the address. An unknown floor goes to the Floors home with a toast. Pinned in Task 1 (`parseRoute`) and Task 7 (`SetupWizard`).
3. **An undo that can't be done, or is pressed twice.** Each case below is pinned in Task 6:
   - a 409 shows its reason on that row;
   - a dropped connection gets a Retry toast;
   - two quick presses send one request;
   - a row whose thing is no longer on this floor has Show turned off.
4. **A floor Claude touched before this setup, and a second run.** The check lists this run's changes only, and leaves Claude's survey labels to Review. Pinned in:
   - Task 1 (`setupSince`);
   - Task 6 (the labels);
   - Task 7 (Add footage stamped once);
   - Task 8 (Set up again opens every step).
5. **Your tokens can't be loaded, or your only token has expired.** Unknown must not read as "not connected", and expired must. Pinned in Task 3.

---

## Tasks, order and parallelism

| Task | Needs first | Runs beside | Waits for |
|---|---|---|---|
| 1. Route, contract types and the progress rules | — | — | — |
| 2. Setup state and polling | 1 | 4, 5 | — |
| 3. The map beside, a Claude step's screen, and opening the Claude Code panel | 1, 2 | 4, 5 | a browser: 6C |
| 4. Add footage and Finish screens | 1 | 2, 3, 5, 6 | tsc and tests: 6B's `DownloadModel.tsx` |
| 5. Floorplan screen | 1 | 2, 3, 4, 6 | — |
| 6. Check Claude's work | 1, 3 | 4, 5 | tsc and tests: 6A; a browser: 6C |
| 7. The wizard, the step bar, and the route mounted | 1–6 | — | tsc and a browser: 6C's client methods |
| **✂ Usable after Task 7.** A teammate can set a floor up by typing `/floors/L1/setup`. | | | |
| 8. The Floors home card's way in | 1, 2, 7 | — | tsc and a browser: 6C |
| 9. The rehearsal (spec §11) | 1–8 | — | 6A, 6C and 6D merged |

The file sets of tasks that run side by side don't overlap:

- Task 2 touches `setup/sync*`.
- Task 3 touches `setup/{SetupMap,ClaudeStep}*` and `shell/{claudePanel,ClaudeCodeButton}*`.
- Task 4 touches `setup/{FootageStep,FinishStep}*`.
- Task 5 touches `setup/FloorplanStep*`.
- Task 6 touches `setup/{check,CheckStep}*`.

## File map

```
packages/editor/src/route.ts                         MODIFY  1  the setup route
packages/editor/src/route.test.tsx                   MODIFY  1
packages/editor/src/setup/types.ts                   CREATE  1  the contract with 6C
packages/editor/src/setup/steps.ts                   CREATE  1  WIZARD_STEPS, slashCommand, doItMyself
packages/editor/src/setup/progress.ts                CREATE  1  stepDone, notDoneLine, firstOpenStep, cardLink, setupSince…
packages/editor/src/setup/progress.test.ts           CREATE  1
packages/editor/src/setup/testing.ts                 CREATE  1  setupState, change, fakeSetupApi (tests only)
packages/editor/src/setup/sync.ts                    CREATE  2  useSetupStore, loadSetup, useSetupPoll, useStepContext
packages/editor/src/setup/sync.test.tsx              CREATE  2
packages/editor/src/shell/claudePanel.ts             CREATE  3  the Claude Code panel's open state
packages/editor/src/shell/ClaudeCodeButton.tsx       MODIFY  3  reads it; myLiveTokens
packages/editor/src/shell/ClaudeCodeButton.test.tsx  MODIFY  3
packages/editor/src/setup/SetupMap.tsx               CREATE  3
packages/editor/src/setup/ClaudeStep.tsx             CREATE  3
packages/editor/src/setup/ClaudeStep.test.tsx        CREATE  3
packages/editor/src/setup/FootageStep.tsx            CREATE  4
packages/editor/src/setup/FootageStep.test.tsx       CREATE  4
packages/editor/src/setup/FinishStep.tsx             CREATE  4
packages/editor/src/setup/FinishStep.test.tsx        CREATE  4
packages/editor/src/setup/FloorplanStep.tsx          CREATE  5
packages/editor/src/setup/FloorplanStep.test.tsx     CREATE  5
packages/editor/src/setup/check.ts                   CREATE  6  checkSections, showTarget, objectFrames, undoRefusal
packages/editor/src/setup/check.test.ts              CREATE  6
packages/editor/src/setup/CheckStep.tsx              CREATE  6
packages/editor/src/setup/CheckStep.test.tsx         CREATE  6
packages/editor/src/setup/setupApi.ts                CREATE  7  asSetupApi: the one line that needs 6C
packages/editor/src/setup/SetupWizard.tsx            CREATE  7  the wizard and its bottom bar
packages/editor/src/setup/SetupWizard.test.tsx       CREATE  7
packages/editor/src/setup/SetupStepBar.tsx           CREATE  7
packages/editor/src/shell/Header.tsx                 MODIFY  7
packages/editor/src/shell/Header.test.tsx            MODIFY  7
packages/editor/src/shell/Workspace.tsx              MODIFY  7
packages/editor/src/shell/Workspace.test.tsx         MODIFY  7
packages/editor/src/home/FloorsHome.tsx              MODIFY  8
packages/editor/src/home/FloorCard.tsx               MODIFY  8
packages/editor/src/home/FloorsHome.test.tsx         MODIFY  8
```

`shell/AppShell.tsx` and `shell/FloorTabs.tsx` stay as they are. The Header chooses between the tabs and the step bar. The bottom bar is part of the wizard's own layout inside `<main>`.

## Decisions this plan makes where the spec is silent

- **The route carries query parameters.** It is `{ name: "setup"; code; step?; params }`. Review keeps its proposal in `?place=`, and inside the wizard it writes that to the wizard's own address. `step` is 1–9. Anything else in its place (`0`, `12`, `x`) parses as no step, and the wizard chooses one.
- **When a step is done.**
  - Any step is done when it is stored as done or skipped: by `finish_step`, **Mark done**, **Skip**, **Looks right** or **Finish setup**.
  - A "you" step is also done by its own rule, read off the map, so its tick follows an edit at once:
    - **Add footage:** a live capture is filed under the floor.
    - **Review:** step 2 is done and nothing waits in the floor's Review queue. This is Review's own badge number (`waitingReview`). Before Claude has labelled, nothing waits either, and a tick there would say the step was done before it began.
    - **Floorplan:** the plan came from a PDF (so a page was picked), it is scaled, and Find rooms has run. Find rooms has run if the server counts any of the floor's drafts, or the drafts store holds some, or a room here has `pdf:` evidence.
- **"Since the wizard's step 2 began"** (§8). `floor_setup` stores no start time, so the wizard makes one.
  - The first time it shows any step after Add footage, and Add footage's rule says done but it isn't stored, the wizard stores it as done. That `finishedAt` is the run's start.
  - The check sends it as `since`. With none stored, it sends the epoch: every change there is.
  - **Set up again** opens all nine steps, so a second run gets a fresh start.
- **What the check lists.** Its eight groups are spec §8's, in its order.
  - Claude's survey labels (group `labels`) can run to thousands of tags, and are left out. Review, step 3, is their check, and a line says so.
  - Any other change without a group goes under **Other changes**, last, so nothing Claude did on the floor is hidden.
  - Low-confidence objects come first within **Objects placed**.
- **Show** selects the thing and frames it on the map beside the list:
  - a stop shows its end on this floor;
  - a place shows the room it is bound to;
  - a draft, or anything no longer on this floor, has Show turned off.
- **Polling** lives in the Claude step's screen: it is on screen exactly while that is mounted.
  - The next request goes 5 s after the last answer, so there is only ever one in flight.
  - When the counts change, it reloads the model through the non-validating saver, as Survey and Review do. The editor has only a whole-model load.
  - It also asks for Claude's last changes again.
  - It stops while nobody is signed in.
- **The step bar** names every step at 1536 px and wider. Below that, it shows the others' numbers only, so the row fits beside Claude Code and Publish. The current step is always named, and a screen reader hears "Step 5: Rooms from the PDF, done".
- **The bottom bar** has Back, the step's name, Mark done, Skip (Review only), the one-line warning, Leave setup and Next.
  - Check and Finish have their own buttons, **Looks right** and **Finish setup and open Build**, so they get no Mark done.
  - **Leave setup** goes to the Floors home.
- **Opening the Claude Code panel from the wizard.** Its open state moves from the button's `useState` into a small store (`shell/claudePanel.ts`). The token list reloads each time the panel opens, however it was opened.
- **Do it myself** goes to:
  - Survey for the labels;
  - Build's Areas & rooms step for the rooms;
  - the Places tab for places and objects: its checklist binds places, and 6A's **Objects** section has **Place one** for each kind;
  - Build's Pathways step for the pathways.
- **Finish** shows 6B's `DownloadModelButton` for the floor being set up (`levelId`), and **Finish setup and open Build**. In Build the same button sits beside the 3D toggle, bottom left of the canvas.
- **The Floors card** asks for each floor's setup as the page opens.
  - It shows **Set up L1** until a step is stored, **Continue: step n of 9** after that (n is the first step not done), and **Set up again** once Finish is stored.
  - A floor whose setup can't be loaded still offers **Set up L1**. The wizard loads its own.
  - **Set up again** is a button: it opens all nine steps, then goes to step 1.

## The contract 6C must match

`packages/editor/src/setup/types.ts` (Task 1) is the contract. In short:

- `getSetup(levelId)` resolves to `{ steps, counts }`:
  - `steps` has all nine in `SETUP_STEP_IDS` order. A step with no row comes back `{ status: "open", note: "", finishedBy: null, finishedVia: null, finishedAt: null }`.
  - `status` is only what is stored. The wizard works out the "you" steps' ticks itself.
  - `counts` has exactly the fields of `SetupCounts`. Drafts are counted across every search, decided or not.
- `setSetupStep(levelId, step, { status, note? })`:
  - a `done` or `skipped` write stamps `finishedAt` (and `finishedBy`, `finishedVia`) every time, a repeat included;
  - an `open` write clears all three.
- `listClaudeChanges(levelId, since)` resolves to `ClaudeChange[]`, newest first.
  - `since` is always an ISO string. The wizard sends `1970-01-01T00:00:00.000Z` for "all".
  - A room made from a draft is one row, the room's own create (`entityType: "room"`, `group: "rooms"`).
  - Objects placed carry `confidence`. Placements don't store it, so 6C works it out from the placement's `sightingIds`, as `suggest_object_spots` would.
  - `undone` may be left out.
- `undoChange(auditId)` resolves on success. A refusal is a 409 whose body is `{ reason: string }`, which the client throws as a `ConflictError`.
- `setup/setupApi.ts` (Task 7) makes the compiler hold 6C's methods to `SetupApi`.

---

### Task 1: Route, contract types, and the progress rules

**Files:**
- Modify: `packages/editor/src/route.ts` (the `Route` type, `parseRoute`, `href`)
- Modify: `packages/editor/src/route.test.tsx` (two tests)
- Create: `packages/editor/src/setup/types.ts`
- Create: `packages/editor/src/setup/steps.ts`
- Create: `packages/editor/src/setup/progress.ts`
- Create: `packages/editor/src/setup/progress.test.ts`
- Create: `packages/editor/src/setup/testing.ts`

**Interfaces:**
- Consumes:
  - `href`, `FloorTab` from `../route`;
  - `waitingReview` from `../flow/floorProgress`;
  - `imageForLevel` from `../state/underlay`;
  - `relativeTime` from `../ui/relativeTime`;
  - `LevelImage`, `TeamMember`, `Api` from `../api/client`;
  - `fakeApi` from `../testing/fakeApi`.
- Produces:
  - In `route.ts`: the union member `{ name: "setup"; code: string; step?: number; params: Record<string, string> }`, and `export type SetupRoute`.
  - In `setup/types.ts`: `SETUP_STEP_IDS`, `SetupStepId`, `SetupStatus`, `SetupStepState`, `SetupCounts`, `SetupState`, `CHECK_GROUPS`, `CheckGroup`, `ClaudeChangeGroup`, `ClaudeChange`, `interface SetupApi`.
  - In `setup/steps.ts`:
    - `type ClaudeStepId = "label" | "rooms" | "things" | "paths"`;
    - `type WizardStep = { id; short; title }` and `WIZARD_STEPS`;
    - `STEP_COUNT` (9);
    - `wizardStep(id)`, `stepNumber(id): number`, `stepAt(n: number | undefined): SetupStepId | null`;
    - `slashCommand(id: ClaudeStepId, levelCode): string`;
    - `doItMyself(id: ClaudeStepId, levelCode): { label: string; to: string }`.
  - In `setup/progress.ts`:
    - `type StepContext = { setup: SetupState | null; model: MapModel | null; levelImages: readonly LevelImage[]; levelId: string; levelCode: string; draftsWaiting: number }`;
    - `EPOCH`;
    - `storedState(setup, step)`, `floorplanGap(ctx)`, `autoDone(step, ctx)`, `stepDone(step, ctx)`, `notDoneLine(step, ctx)`, `firstOpenStep(ctx): number`;
    - `setupStarted(setup)`, `setupFinished(setup)`, `setupSince(setup): string | null`, `sinceParam(setup): string`;
    - `countRows(step, counts): { label: string; value: number }[]`, `countsKey(counts): string`;
    - `doneLine(state, team, now?): string | null`;
    - `type SetupLink = { label: string; to: string; restart: boolean }` and `cardLink(ctx): SetupLink`.
  - In `setup/testing.ts` (tests only): `NO_COUNTS`, `setupState(steps?, counts?)`, `change(over)`, `fakeSetupApi(overrides?)`.

- [ ] **Step 1: Write the failing tests**

Add to `packages/editor/src/route.test.tsx`, inside `describe("parseRoute", …)`:

```tsx
  it("reads a floor's setup, with or without its step, and leaves a step that isn't one of the nine to the wizard", () => {
    expect(parseRoute("/floors/l1/setup")).toEqual({ name: "setup", code: "L1", params: {} });
    expect(parseRoute("/floors/L1/setup/5", "?place=pl_1")).toEqual({
      name: "setup", code: "L1", step: 5, params: { place: "pl_1" },
    });
    for (const junk of ["0", "10", "12", "x", "2.5", "-1"]) {
      expect(parseRoute(`/floors/L1/setup/${junk}`)).toEqual({ name: "setup", code: "L1", params: {} });
    }
    expect(parseRoute("/floors/L1/setup/5/more")).toEqual({ name: "not-found", path: "/floors/L1/setup/5/more" });
  });
```

Add inside `describe("href", …)`:

```tsx
  it("writes a floor's setup, its step and its parameters", () => {
    expect(href({ name: "setup", code: "L1", params: {} })).toBe("/floors/L1/setup");
    expect(href({ name: "setup", code: "L1", step: 3, params: { place: "pl_1" } })).toBe("/floors/L1/setup/3?place=pl_1");
  });
```

`packages/editor/src/setup/progress.test.ts`:

```ts
import { parseModel, type PlanSource } from "@oth/model";
import { describe, expect, it } from "vitest";
import type { LevelImage } from "../api/client";
import {
  EPOCH, autoDone, cardLink, countRows, doneLine, firstOpenStep, notDoneLine, setupSince, sinceParam, stepDone,
  type StepContext,
} from "./progress";
import { STEP_COUNT, WIZARD_STEPS, doItMyself, slashCommand, stepAt, stepNumber } from "./steps";
import { NO_COUNTS, setupState } from "./testing";
import { SETUP_STEP_IDS } from "./types";

const sq: [number, number][] = [[0, 0], [10, 0], [10, 10], [0, 10]];
/** L1 has footage and one of Claude's labels waiting in Review; L2 has nothing. */
const model = parseModel({
  building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
  levels: [
    { id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6 },
    { id: "oth-L2", buildingId: "oth", code: "L2", ordinal: 2, nameEn: "L2", nameZh: "二楼", elevationM: 6, heightM: 4 },
  ],
  captures: [{ id: "cap_1", kind: "video", filename: "l1.mp4", levelId: "oth-L1" }],
  keyframes: [{ id: "kf_1", captureId: "cap_1", imageId: "kf_1", widthPx: 640, heightPx: 480 }],
  places: [{ id: "pl_tea", nameEn: "iTea", category: "retail", status: "proposed", proposedBy: "claude-code" }],
  sightings: [{ id: "s1", placeId: "pl_tea", keyframeId: "kf_1", status: "proposed" }],
});
/** The same, with Review done: nothing waits. */
const reviewed = parseModel({ ...model, places: [], sightings: [] });

const source: PlanSource = {
  page: 1, pageCount: 1, pageSizePt: [400, 300], rotation: 0, clipPt: [36, 78, 246, 292], pointsPerPixel: 0.1,
  metresPerPoint: 0.5, runsAgree: 2, runsFound: 2, pdfId: "pdf_1", checksum: "d".repeat(64), filename: "L1.pdf",
};
const plan = (over: Partial<LevelImage> = {}): LevelImage => ({
  id: "img_1", levelId: "oth-L1", filename: "L1.png", widthPx: 2000, heightPx: 1400, sizeBytes: 1,
  metresPerPixel: 0.05, offsetX: 0, offsetY: 0, opacity: 0.6, version: 1, source, ...over,
});

function on(code: "L1" | "L2", over: Partial<StepContext> = {}): StepContext {
  return { setup: setupState(), model, levelImages: [], levelId: `oth-${code}`, levelCode: code, draftsWaiting: 0, ...over };
}

const done = { status: "done" } as const;

describe("the nine steps", () => {
  it("are 6C's SETUP_STEPS, in order, numbered from 1", () => {
    expect(SETUP_STEP_IDS).toEqual(["footage", "label", "review", "floorplan", "rooms", "things", "paths", "check", "finish"]);
    expect(WIZARD_STEPS.map(s => s.id)).toEqual([...SETUP_STEP_IDS]);
    expect(STEP_COUNT).toBe(9);
    expect(stepNumber("check")).toBe(8);
    expect([stepAt(1), stepAt(9)]).toEqual(["footage", "finish"]);
    expect([stepAt(0), stepAt(10), stepAt(undefined)]).toEqual([null, null, null]);
  });

  it("give each Claude step its slash command for the floor", () => {
    expect(slashCommand("label", "L1")).toBe("/mcp__oth__label_survey L1");
    expect(slashCommand("rooms", "L2")).toBe("/mcp__oth__map_rooms L2");
    expect(slashCommand("things", "L1")).toBe("/mcp__oth__place_things L1");
    expect(slashCommand("paths", "L1")).toBe("/mcp__oth__draw_paths L1");
  });

  it("send Do it myself to the step's own tool", () => {
    expect(doItMyself("label", "L1")).toEqual({ label: "Do it myself in Survey", to: "/floors/L1/survey" });
    expect(doItMyself("rooms", "L1")).toEqual({ label: "Do it myself on Build", to: "/floors/L1/build?step=rooms" });
    expect(doItMyself("things", "L1")).toEqual({ label: "Do it myself on the Places tab", to: "/floors/L1/places" });
    expect(doItMyself("paths", "L1")).toEqual({ label: "Do it myself on Build", to: "/floors/L1/build?step=pathways" });
  });
});

describe("a step's tick", () => {
  it("ticks Add footage once footage is filed under the floor", () => {
    expect(stepDone("footage", on("L1"))).toBe(true);
    expect(stepDone("footage", on("L2"))).toBe(false);
    expect(notDoneLine("footage", on("L2"))).toBe("No footage is filed under L2 yet.");
    expect(notDoneLine("footage", on("L1"))).toBeNull();
  });

  it("ticks a Claude step only once it is stored: finish_step, or Mark done", () => {
    expect(stepDone("rooms", on("L1"))).toBe(false);
    expect(notDoneLine("rooms", on("L1"))).toBe("Claude hasn't finished the rooms yet.");
    expect(stepDone("rooms", on("L1", { setup: setupState({ rooms: done }) }))).toBe(true);
  });

  it("ticks Review once Claude has labelled and nothing waits, and says how much does", () => {
    expect(notDoneLine("review", on("L1"))).toBe("Claude hasn't labelled the survey yet.");
    const labelled = setupState({ label: done });
    expect(notDoneLine("review", on("L1", { setup: labelled }))).toBe("1 label is waiting for you.");
    expect(stepDone("review", on("L1", { setup: labelled, model: reviewed }))).toBe(true);
    // Before Claude has labelled, nothing waits either: that is not done.
    expect(autoDone("review", on("L1", { model: reviewed }))).toBe(false);
    expect(stepDone("review", on("L1", { setup: setupState({ review: { status: "skipped" } }) }))).toBe(true);
  });

  it("says what the Floorplan step still needs, in the order it is done", () => {
    expect(notDoneLine("floorplan", on("L1"))).toBe("L1 has no plan yet. Add the floor's PDF.");
    expect(notDoneLine("floorplan", on("L1", { levelImages: [plan({ source: null })] })))
      .toBe("This plan came from an image. Add the floor's PDF to find rooms in it.");
    expect(notDoneLine("floorplan", on("L1", { levelImages: [plan({ metresPerPixel: null })] })))
      .toBe("The plan isn't scaled yet.");
    expect(notDoneLine("floorplan", on("L1", { levelImages: [plan()] }))).toBe("Find rooms hasn't run on this plan yet.");
  });

  it("knows Find rooms has run from the server's drafts, the drafts store, or rooms from the drawing", () => {
    const withPlan = { levelImages: [plan()] };
    const found = setupState({}, { rooms: { waiting: 0, accepted: 0, rejectedOrSetAside: 3, stops: 0 } });
    expect(stepDone("floorplan", on("L1", { ...withPlan, setup: found }))).toBe(true);
    expect(stepDone("floorplan", on("L1", { ...withPlan, draftsWaiting: 4 }))).toBe(true);
    const fromPdf = parseModel({
      ...model,
      rooms: [{ id: "L1-a", levelId: "oth-L1", kind: "room", footprint: sq, heightM: 4, verification: { status: "cad", evidence: ["pdf:d"] } }],
    });
    expect(stepDone("floorplan", on("L1", { ...withPlan, model: fromPdf }))).toBe(true);
  });
});

describe("where the wizard opens", () => {
  it("opens on the first step not done", () => {
    expect(firstOpenStep(on("L2"))).toBe(1);
    expect(firstOpenStep(on("L1"))).toBe(2);
    const all = setupState({
      footage: done, label: done, review: done, floorplan: done, rooms: done, things: done, paths: done, check: done, finish: done,
    });
    expect(firstOpenStep(on("L1", { setup: all }))).toBe(9);
  });

  it("gives the Floors card Set up, Continue, or Set up again", () => {
    expect(cardLink(on("L1", { setup: null }))).toEqual({ label: "Set up L1", to: "/floors/L1/setup", restart: false });
    // Footage alone ticks by itself; nothing stored means nobody has started.
    expect(cardLink(on("L1"))).toEqual({ label: "Set up L1", to: "/floors/L1/setup", restart: false });
    const started = setupState({ footage: { status: "done", finishedAt: "2026-09-28T09:00:00.000Z" } });
    expect(cardLink(on("L1", { setup: started })))
      .toEqual({ label: "Continue: step 2 of 9", to: "/floors/L1/setup/2", restart: false });
    expect(cardLink(on("L1", { setup: setupState({ finish: done }) })))
      .toEqual({ label: "Set up again", to: "/floors/L1/setup/1", restart: true });
  });
});

describe("since when the check looks", () => {
  it("starts from when Add footage was stored done: when step 2 began", () => {
    const setup = setupState({
      footage: { status: "done", finishedAt: "2026-09-28T09:00:00.000Z" },
      label: { status: "done", finishedAt: "2026-09-28T09:40:00.000Z" },
    });
    expect(setupSince(setup)).toBe("2026-09-28T09:00:00.000Z");
    expect(sinceParam(setup)).toBe("2026-09-28T09:00:00.000Z");
  });

  it("asks for every change there is before the run has a start", () => {
    expect(setupSince(setupState())).toBeNull();
    expect(sinceParam(null)).toBe(EPOCH);
  });
});

describe("words", () => {
  it("names each Claude step's counts", () => {
    const counts = {
      ...NO_COUNTS,
      rooms: { waiting: 12, accepted: 150, rejectedOrSetAside: 53, stops: 8 },
      things: { bound: 30, unbound: 5, objects: [{ kindId: "ok_bin", name: "wastebin", count: 5 }] },
    };
    expect(countRows("rooms", counts)).toEqual([
      { label: "Drafts waiting", value: 12 },
      { label: "Made rooms", value: 150 },
      { label: "Rejected or set aside", value: 53 },
      { label: "Stops made", value: 8 },
    ]);
    expect(countRows("things", counts).map(r => r.label)).toEqual(["Places bound", "Places not bound yet", "Objects placed: wastebin"]);
    expect(countRows("things", NO_COUNTS).at(-1)).toEqual({ label: "Objects placed", value: 0 });
    expect(countRows("footage", counts)).toEqual([]);
  });

  it("says who finished a step, and when", () => {
    const team = [{ id: "u_sc", displayName: "Stef Chan" }];
    const now = Date.parse("2026-09-28T10:00:00.000Z");
    const at = "2026-09-28T09:55:00.000Z";
    const base = { step: "label" as const, status: "done" as const, note: "", finishedBy: "u_sc", finishedAt: at };
    expect(doneLine({ ...base, finishedVia: "tok_1" }, team, now)).toBe("Done by Claude, 5 minutes ago");
    expect(doneLine({ ...base, finishedVia: null }, team, now)).toBe("Done by Stef Chan, 5 minutes ago");
    expect(doneLine({ ...base, status: "skipped", finishedBy: "u_gone", finishedVia: null, finishedAt: null }, team, now))
      .toBe("Skipped by a teammate");
    expect(doneLine(null, team, now)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify that they fail**

Run: `bash .superpowers/run-tests.sh vitest packages/editor/src/setup/progress.test.ts packages/editor/src/route.test.tsx`
Expected: FAIL.
- `progress.test.ts` fails with `Failed to resolve import "./progress"`.
- The setup tests in `route.test.tsx` fail: `/floors/l1/setup` parses as a floor with `tab: null`.

- [ ] **Step 3: The route**

In `packages/editor/src/route.ts`, add the setup member to `Route`, between the `floor` and `team` members:

```ts
  /**
   * A floor's setup wizard (Plan 6E). `step` is 1–9, or absent for the wizard
   * to choose. `params` carries what a step's own tool keeps in the address,
   * such as Review's `?place=`.
   */
  | { name: "setup"; code: string; step?: number; params: Record<string, string> }
```

After `export type FloorRoute = …`, add:

```ts
export type SetupRoute = Extract<Route, { name: "setup" }>;
```

In `parseRoute`, directly after `if (parts.length === 1) return { name: "floors" };`, add:

```ts
    if (parts[2] === "setup" && parts.length <= 4) {
      const params = Object.fromEntries(new URLSearchParams(search).entries());
      // Steps 1–9 (setup/types.ts). Anything else is left for the wizard to choose.
      const step = /^[1-9]$/.test(parts[3] ?? "") ? Number(parts[3]) : undefined;
      return { name: "setup", code: parts[1]!.toUpperCase(), step, params };
    }
```

In `href`, add a case after `case "floor":`'s return:

```ts
    case "setup":
      return `/floors/${encodeURIComponent(route.code)}/setup${route.step ? `/${route.step}` : ""}${query(route.params)}`;
```

- [ ] **Step 4: The contract types**

`packages/editor/src/setup/types.ts`:

```ts
/**
 * Plan 6E's half of the setup contract with Plan 6C (interfaces.md): what
 * the four setup calls return. 6C's routes and its client methods in
 * `api/client.ts` answer in these shapes; `setupApi.ts` is where the compiler
 * holds the two to it.
 */

/** The nine steps, in order: 6C's `SETUP_STEPS`. Step n in an address is index n − 1. */
export const SETUP_STEP_IDS = [
  "footage", "label", "review", "floorplan", "rooms", "things", "paths", "check", "finish",
] as const;
export type SetupStepId = (typeof SETUP_STEP_IDS)[number];
export type SetupStatus = "open" | "done" | "skipped";

/**
 * One step as `floor_setup` stores it. A step with no row comes back open,
 * with every other field empty. `status` is only what was stored (finish_step,
 * Mark done, Skip): a "you" step that the map shows done is worked out by the
 * wizard (progress.ts), so its tick follows an edit at once.
 */
export type SetupStepState = {
  step: SetupStepId;
  status: SetupStatus;
  /** Claude's one line from finish_step; empty otherwise. */
  note: string;
  /** Whose name it was finished in: a token's owner, or whoever pressed Mark done. */
  finishedBy: string | null;
  /** The token it came through; null when a person did it in the app. */
  finishedVia: string | null;
  /** Stamped by every done or skipped write, a repeat included; cleared by an open one. */
  finishedAt: string | null;
};

/** Spec §4.3's live counts, worked out from the model on each GET. */
export type SetupCounts = {
  /** The frames of this floor's captures. */
  label: { tagged: number; binned: number; left: number };
  /** Proposals sighted in this floor's frames. */
  review: { left: number };
  /** This floor's drafts, every search's, decided or not; and the stops made on it. */
  rooms: { waiting: number; accepted: number; rejectedOrSetAside: number; stops: number };
  /** This floor's places, bound or not; its objects, per kind, named in English. */
  things: { bound: number; unbound: number; objects: { kindId: string; name: string; count: number }[] };
  /** This floor's pathways and entrances, and its rooms with a door that no route reaches. */
  paths: { pathways: number; entrances: number; unreachable: number };
};

/** `GET /api/levels/:id/setup`: all nine steps in SETUP_STEP_IDS order, and the counts. */
export type SetupState = { steps: SetupStepState[]; counts: SetupCounts };

/** Spec §8's groups, in the order the check lists them. */
export const CHECK_GROUPS = [
  "rooms", "drafts", "names", "stops", "places", "objects", "pathways", "entrances",
] as const;
export type CheckGroup = (typeof CHECK_GROUPS)[number];
/** Also: Claude's survey labels, which Review checks, and anything else. */
export type ClaudeChangeGroup = CheckGroup | "labels" | "other";

/**
 * One audit row with a Claude token in `via`, as
 * `GET /api/levels/:id/claude-changes?since=` lists them, newest first.
 */
export type ClaudeChange = {
  auditId: string;
  /** When, as ISO. */
  at: string;
  group: ClaudeChangeGroup;
  /** One plain line: "Made Starbucks from a draft". */
  summary: string;
  /**
   * What changed, as the audit log names it. A room made from a draft is one
   * row, the room's own (`room`, group `rooms`), not a second for its draft.
   */
  entityType: string;
  entityId: string;
  /** The audit log's action: create, update, delete, restore. */
  action: string;
  /** Objects placed only: high with two or more anchors, low for a capture-order guess (spec §5.4). */
  confidence?: "high" | "low";
  /** True once undone through `POST /api/changes/:id/undo`. May be left out. */
  undone?: boolean;
};

/**
 * The four calls the wizard makes. 6C adds them to `createApi`. A refused
 * undo is a 409, which the client throws as a ConflictError whose body is
 * `{ reason: string }`: why, in a sentence ("Wei has bound Starbucks to it since").
 */
export interface SetupApi {
  getSetup(levelId: string): Promise<SetupState>;
  setSetupStep(levelId: string, step: SetupStepId, body: { status: SetupStatus; note?: string }): Promise<unknown>;
  /** `since` is ISO; the wizard sends the epoch to mean every change there is. */
  listClaudeChanges(levelId: string, since: string): Promise<ClaudeChange[]>;
  undoChange(auditId: string): Promise<unknown>;
}
```

- [ ] **Step 5: The steps, as data**

`packages/editor/src/setup/steps.ts`:

```ts
import { href, type FloorTab } from "../route";
import { SETUP_STEP_IDS, type SetupStepId } from "./types";

/** The steps Claude does, each run with its own slash command. */
export type ClaudeStepId = Extract<SetupStepId, "label" | "rooms" | "things" | "paths">;

export type WizardStep = {
  id: SetupStepId;
  /** The step bar's word for it: nine must fit beside the header's buttons. */
  short: string;
  /** Its heading, and its name everywhere else. */
  title: string;
};

/** Spec §4.1's table, in 6C's `SETUP_STEPS` order. */
export const WIZARD_STEPS: readonly WizardStep[] = [
  { id: "footage", short: "Footage", title: "Add footage" },
  { id: "label", short: "Labels", title: "Label the survey" },
  { id: "review", short: "Review", title: "Review Claude's labels" },
  { id: "floorplan", short: "Floorplan", title: "Floorplan" },
  { id: "rooms", short: "Rooms", title: "Rooms from the PDF" },
  { id: "things", short: "Places", title: "Places and objects" },
  { id: "paths", short: "Pathways", title: "Pathways and entrances" },
  { id: "check", short: "Check", title: "Check Claude's work" },
  { id: "finish", short: "Finish", title: "Finish" },
];

export const STEP_COUNT = WIZARD_STEPS.length;

export function wizardStep(id: SetupStepId): WizardStep {
  return WIZARD_STEPS.find(s => s.id === id)!;
}

/** Its number in an address, 1 to 9. */
export function stepNumber(id: SetupStepId): number {
  return SETUP_STEP_IDS.indexOf(id) + 1;
}

/** The step an address names, or null when it names none of the nine. */
export function stepAt(n: number | undefined): SetupStepId | null {
  return n !== undefined && Number.isInteger(n) ? SETUP_STEP_IDS[n - 1] ?? null : null;
}

/** The MCP prompts 6C registers; Claude Code shows each as `/mcp__oth__<prompt>`. */
const PROMPTS: Record<ClaudeStepId, string> = {
  label: "label_survey", rooms: "map_rooms", things: "place_things", paths: "draw_paths",
};

/** What to paste into Claude Code for a Claude step on this floor. */
export function slashCommand(id: ClaudeStepId, levelCode: string): string {
  return `/mcp__oth__${PROMPTS[id]} ${levelCode}`;
}

/** The step's own tool, for doing it by hand (spec §4.2). */
export function doItMyself(id: ClaudeStepId, levelCode: string): { label: string; to: string } {
  const tab = (t: FloorTab, params: Record<string, string> = {}) => href({ name: "floor", code: levelCode, tab: t, params });
  switch (id) {
    case "label":
      return { label: "Do it myself in Survey", to: tab("survey") };
    case "rooms":
      return { label: "Do it myself on Build", to: tab("build", { step: "rooms" }) };
    case "things":
      return { label: "Do it myself on the Places tab", to: tab("places") };
    case "paths":
      return { label: "Do it myself on Build", to: tab("build", { step: "pathways" }) };
  }
}
```

- [ ] **Step 6: The progress rules**

`packages/editor/src/setup/progress.ts`:

```ts
import { live, type MapModel } from "@oth/model";
import type { LevelImage, TeamMember } from "../api/client";
import { waitingReview } from "../flow/floorProgress";
import { href } from "../route";
import { imageForLevel } from "../state/underlay";
import { relativeTime } from "../ui/relativeTime";
import { STEP_COUNT } from "./steps";
import { SETUP_STEP_IDS, type SetupCounts, type SetupState, type SetupStepId, type SetupStepState } from "./types";

/** Everything a step's tick is read from. */
export type StepContext = {
  setup: SetupState | null;
  model: MapModel | null;
  levelImages: readonly LevelImage[];
  levelId: string;
  levelCode: string;
  /** The floor's drafts waiting, from the drafts store: 0 where they aren't loaded, as on the Floors home. */
  draftsWaiting: number;
};

/** "Every change there is": the since sent before a run has a start. */
export const EPOCH = "1970-01-01T00:00:00.000Z";

export function storedState(setup: SetupState | null, step: SetupStepId): SetupStepState | null {
  return setup?.steps.find(s => s.step === step) ?? null;
}

function stored(ctx: StepContext, step: SetupStepId): boolean {
  const state = storedState(ctx.setup, step);
  return state !== null && state.status !== "open";
}

/**
 * Whether Find rooms has run on this floor. The server counts every search's
 * drafts, decided or not; the drafts store has them the moment a search
 * saves; and a floor whose drafts were all decided long ago still has rooms
 * whose evidence is its PDF.
 */
function roomsFound(ctx: StepContext): boolean {
  const r = ctx.setup?.counts.rooms;
  if (r && r.waiting + r.accepted + r.rejectedOrSetAside > 0) return true;
  if (ctx.draftsWaiting > 0) return true;
  return live(ctx.model?.rooms ?? []).some(
    room => room.levelId === ctx.levelId && room.verification.evidence.some(e => e.startsWith("pdf:")),
  );
}

/** What the Floorplan step still needs, in the order it is done; null when it has it all. */
export function floorplanGap(ctx: StepContext): string | null {
  const image = imageForLevel(ctx.levelImages, ctx.levelId);
  if (!image) return `${ctx.levelCode} has no plan yet. Add the floor's PDF.`;
  if (!image.source) return "This plan came from an image. Add the floor's PDF to find rooms in it.";
  if (image.metresPerPixel == null) return "The plan isn't scaled yet.";
  if (!roomsFound(ctx)) return "Find rooms hasn't run on this plan yet.";
  return null;
}

/**
 * A "you" step's own rule, read off the map (spec §4.1), whatever is stored.
 * Review waits for Claude's labels: with none yet, nothing waits either, and
 * a tick there would say the step was done before it began.
 */
export function autoDone(step: SetupStepId, ctx: StepContext): boolean {
  switch (step) {
    case "footage":
      return live(ctx.model?.captures ?? []).some(c => c.levelId === ctx.levelId);
    case "review":
      return stepDone("label", ctx) && waitingReview(ctx.model, ctx.levelId) === 0;
    case "floorplan":
      return floorplanGap(ctx) === null;
    default:
      return false;
  }
}

/** Done: stored as done or skipped (finish_step, Mark done, Skip), or done on the map. */
export function stepDone(step: SetupStepId, ctx: StepContext): boolean {
  return stored(ctx, step) || autoDone(step, ctx);
}

/** The bottom bar's one-line warning while a step isn't done; null once it is. */
export function notDoneLine(step: SetupStepId, ctx: StepContext): string | null {
  if (stepDone(step, ctx)) return null;
  switch (step) {
    case "footage":
      return `No footage is filed under ${ctx.levelCode} yet.`;
    case "label":
      return "Claude hasn't finished labelling yet.";
    case "review": {
      if (!stepDone("label", ctx)) return "Claude hasn't labelled the survey yet.";
      const n = waitingReview(ctx.model, ctx.levelId);
      return n === 1 ? "1 label is waiting for you." : `${n} labels are waiting for you.`;
    }
    case "floorplan":
      return floorplanGap(ctx);
    case "rooms":
      return "Claude hasn't finished the rooms yet.";
    case "things":
      return "Claude hasn't finished places and objects yet.";
    case "paths":
      return "Claude hasn't finished the pathways yet.";
    case "check":
      return "Press Looks right once you've checked Claude's work.";
    case "finish":
      return "Press Finish setup to hand the floor over.";
  }
}

/** The number, 1 to 9, of the first step not done; 9 when all are. */
export function firstOpenStep(ctx: StepContext): number {
  const i = SETUP_STEP_IDS.findIndex(step => !stepDone(step, ctx));
  return i < 0 ? STEP_COUNT : i + 1;
}

/** Whether anyone has started this floor's setup: something is stored. */
export function setupStarted(setup: SetupState | null): boolean {
  return setup?.steps.some(s => s.status !== "open") ?? false;
}

export function setupFinished(setup: SetupState | null): boolean {
  return storedState(setup, "finish")?.status === "done";
}

/**
 * When this run of the setup began: when Add footage was stored done, which
 * the wizard does the first time it shows a later step (SetupWizard). The
 * check lists Claude's changes from then (spec §8: "since the wizard's step 2
 * began"). Set up again opens every step, so a second run starts afresh.
 */
export function setupSince(setup: SetupState | null): string | null {
  return storedState(setup, "footage")?.finishedAt ?? null;
}

/** The since the server is sent: the run's start, or every change there is. */
export function sinceParam(setup: SetupState | null): string {
  return setupSince(setup) ?? EPOCH;
}

/** A Claude step's live counts (spec §4.3), as a label and a number each. */
export function countRows(step: SetupStepId, counts: SetupCounts): { label: string; value: number }[] {
  switch (step) {
    case "label":
      return [
        { label: "Frames tagged", value: counts.label.tagged },
        { label: "Frames binned", value: counts.label.binned },
        { label: "Frames left", value: counts.label.left },
      ];
    case "rooms":
      return [
        { label: "Drafts waiting", value: counts.rooms.waiting },
        { label: "Made rooms", value: counts.rooms.accepted },
        { label: "Rejected or set aside", value: counts.rooms.rejectedOrSetAside },
        { label: "Stops made", value: counts.rooms.stops },
      ];
    case "things":
      return [
        { label: "Places bound", value: counts.things.bound },
        { label: "Places not bound yet", value: counts.things.unbound },
        ...(counts.things.objects.length === 0
          ? [{ label: "Objects placed", value: 0 }]
          : counts.things.objects.map(o => ({ label: `Objects placed: ${o.name}`, value: o.count }))),
      ];
    case "paths":
      return [
        { label: "Pathways", value: counts.paths.pathways },
        { label: "Entrances", value: counts.paths.entrances },
        { label: "Rooms with a door but no route", value: counts.paths.unreachable },
      ];
    default:
      return [];
  }
}

/** A fingerprint of the counts: a Claude step reloads the map when it changes. */
export function countsKey(counts: SetupCounts): string {
  return JSON.stringify(counts);
}

/** "Done by Claude, 5 minutes ago": who finished a step, and when. Null while it is open. */
export function doneLine(state: SetupStepState | null, team: readonly TeamMember[], now = Date.now()): string | null {
  if (!state || state.status === "open") return null;
  const who = state.finishedVia ? "Claude" : team.find(m => m.id === state.finishedBy)?.displayName ?? "a teammate";
  const when = state.finishedAt ? `, ${relativeTime(state.finishedAt, now)}` : "";
  return `${state.status === "skipped" ? "Skipped" : "Done"} by ${who}${when}`;
}

export type SetupLink = { label: string; to: string; restart: boolean };

/** The Floors home card's way into the wizard (spec §4.2). */
export function cardLink(ctx: StepContext): SetupLink {
  const at = (step?: number) => href({ name: "setup", code: ctx.levelCode, step, params: {} });
  if (setupFinished(ctx.setup)) return { label: "Set up again", to: at(1), restart: true };
  if (setupStarted(ctx.setup)) {
    const n = firstOpenStep(ctx);
    return { label: `Continue: step ${n} of ${STEP_COUNT}`, to: at(n), restart: false };
  }
  return { label: `Set up ${ctx.levelCode}`, to: at(), restart: false };
}
```

- [ ] **Step 7: The fakes for tests**

`packages/editor/src/setup/testing.ts`:

```ts
import { vi } from "vitest";
import type { Api } from "../api/client";
import { fakeApi } from "../testing/fakeApi";
import {
  SETUP_STEP_IDS, type ClaudeChange, type SetupApi, type SetupCounts, type SetupState, type SetupStepId,
  type SetupStepState,
} from "./types";

export const NO_COUNTS: SetupCounts = {
  label: { tagged: 0, binned: 0, left: 0 },
  review: { left: 0 },
  rooms: { waiting: 0, accepted: 0, rejectedOrSetAside: 0, stops: 0 },
  things: { bound: 0, unbound: 0, objects: [] },
  paths: { pathways: 0, entrances: 0, unreachable: 0 },
};

/** A floor's setup as the server gives it: every step open unless `steps` says otherwise. */
export function setupState(
  steps: Partial<Record<SetupStepId, Partial<SetupStepState>>> = {},
  counts: Partial<SetupCounts> = {},
): SetupState {
  return {
    steps: SETUP_STEP_IDS.map(step => ({
      step, status: "open", note: "", finishedBy: null, finishedVia: null, finishedAt: null, ...steps[step],
    })),
    counts: { ...NO_COUNTS, ...counts },
  };
}

/** One of Claude's changes; a room made from a draft unless `over` says otherwise. */
export function change(over: Partial<ClaudeChange> & Pick<ClaudeChange, "auditId">): ClaudeChange {
  return {
    at: "2026-09-28T10:00:00.000Z", group: "rooms", summary: "Made Starbucks from a draft",
    entityType: "room", entityId: "L1-a", action: "create", ...over,
  };
}

/**
 * fakeApi, plus the four setup calls 6C adds, with harmless defaults. Tests
 * use this rather than fakeApi so they run before 6C's client lands.
 */
export function fakeSetupApi(overrides: Partial<Record<keyof (Api & SetupApi), unknown>> = {}): Api & SetupApi {
  return {
    ...fakeApi(),
    getSetup: vi.fn().mockResolvedValue(setupState()),
    setSetupStep: vi.fn().mockResolvedValue({}),
    listClaudeChanges: vi.fn().mockResolvedValue([]),
    undoChange: vi.fn().mockResolvedValue({}),
    ...overrides,
  } as unknown as Api & SetupApi;
}
```

- [ ] **Step 8: Run the tests and typecheck**

Run: `bash .superpowers/run-tests.sh vitest packages/editor/src/setup/progress.test.ts packages/editor/src/route.test.tsx`
Expected: PASS.

Run: `bash .superpowers/run-tests.sh tsc packages/editor`
Expected: no errors. `href`'s switch must cover the new route, which Step 3 did.

- [ ] **Step 9: Commit**

```bash
git add -- packages/editor/src/setup/types.ts packages/editor/src/setup/steps.ts packages/editor/src/setup/progress.ts packages/editor/src/setup/progress.test.ts packages/editor/src/setup/testing.ts
git commit --only -m "feat(editor): the setup route, the contract with 6C, and when each step is done

/floors/L1/setup and /floors/L1/setup/5 parse as the setup route, with the
step's own query parameters; a step that isn't 1–9 is left for the wizard to
choose. setup/types.ts is the shape 6C's four calls answer in. progress.ts
reads each step's tick: stored (finish_step, Mark done, Skip), or, for the
steps you do, off the map. It also says what a step still needs, where the
wizard opens, and since when the check looks.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- packages/editor/src/route.ts packages/editor/src/route.test.tsx packages/editor/src/setup/types.ts packages/editor/src/setup/steps.ts packages/editor/src/setup/progress.ts packages/editor/src/setup/progress.test.ts packages/editor/src/setup/testing.ts
```

---

### Task 2: Setup state and polling

**Files:**
- Create: `packages/editor/src/setup/sync.ts`
- Create: `packages/editor/src/setup/sync.test.tsx`

**Interfaces:**
- Consumes:
  - `countsKey`, `StepContext` from `./progress` (Task 1);
  - `SetupApi`, `SetupState` from `./types` (Task 1);
  - `isUnauthorized` from `../api/client`;
  - `useDrafts` from `../build/drafts`;
  - `useEditorStore` from `../state/store`.
- Produces:
  - `POLL_MS` (5000);
  - `useSetupStore`: `{ byLevel: Record<levelId, SetupState>; failed: Record<levelId, boolean>; put(levelId, state); fail(levelId); reset() }`;
  - `loadSetup(api: Pick<SetupApi, "getSetup">, levelId): Promise<SetupState | null>`;
  - `useSetupPoll(api: Pick<SetupApi, "getSetup">, levelId: string, on: boolean, onCountsChange: () => void): void`;
  - `useStepContext(level: Pick<Level, "id" | "code"> | null): StepContext | null`.

- [ ] **Step 1: Write the failing tests**

`packages/editor/src/setup/sync.test.tsx`:

```tsx
import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/client";
import { useEditorStore } from "../state/store";
import { POLL_MS, loadSetup, useSetupPoll, useSetupStore } from "./sync";
import { setupState } from "./testing";
import type { SetupApi, SetupState } from "./types";

const me = { id: "u_sc", email: "sc@oth.local", displayName: "Stef Chan" };
/** A floor's setup with `n` frames still to label. */
const left = (n: number) => setupState({}, { label: { tagged: 10 - n, binned: 0, left: n } });
const stored = () => useSetupStore.getState();

beforeEach(() => {
  useSetupStore.getState().reset();
  useEditorStore.getState().reset();
  useEditorStore.getState().setUser(me);
});

describe("loadSetup", () => {
  it("keeps the floor's setup in the store", async () => {
    await loadSetup({ getSetup: vi.fn().mockResolvedValue(left(3)) }, "oth-L1");
    expect(stored().byLevel["oth-L1"]?.counts.label.left).toBe(3);
    expect(stored().failed["oth-L1"]).toBe(false);
  });

  it("keeps the last setup and marks the floor when a load fails", async () => {
    await loadSetup({ getSetup: vi.fn().mockResolvedValue(left(3)) }, "oth-L1");
    expect(await loadSetup({ getSetup: vi.fn().mockRejectedValue(new TypeError("Failed to fetch")) }, "oth-L1")).toBeNull();
    expect(stored().byLevel["oth-L1"]?.counts.label.left).toBe(3);
    expect(stored().failed["oth-L1"]).toBe(true);
  });

  it("leaves a 401 to the sign-in dialog", async () => {
    await loadSetup({ getSetup: vi.fn().mockRejectedValue(new ApiError(401, null)) }, "oth-L1");
    expect(stored().failed["oth-L1"]).toBeUndefined();
  });

  it("keeps the newer answer when an older one arrives after it", async () => {
    let answerFirst: (state: SetupState) => void = () => {};
    const getSetup = vi.fn()
      .mockImplementationOnce(() => new Promise<SetupState>(resolve => {
        answerFirst = resolve;
      }))
      .mockResolvedValueOnce(left(3));
    const first = loadSetup({ getSetup }, "oth-L1");
    await loadSetup({ getSetup }, "oth-L1");
    answerFirst(left(9));
    expect(await first).toBeNull();
    expect(stored().byLevel["oth-L1"]?.counts.label.left).toBe(3);
  });
});

describe("useSetupPoll", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function Poller({ api, on = true, onChange }: { api: Pick<SetupApi, "getSetup">; on?: boolean; onChange: () => void }) {
    useSetupPoll(api, "oth-L1", on, onChange);
    return null;
  }
  const wait = (ms: number) => act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

  it("asks every 5 s, and calls back only when the counts change", async () => {
    stored().put("oth-L1", left(5));
    const api = { getSetup: vi.fn().mockResolvedValueOnce(left(5)).mockResolvedValue(left(4)) };
    const onChange = vi.fn();
    render(<Poller api={api} onChange={onChange} />);
    expect(api.getSetup).not.toHaveBeenCalled();
    await wait(POLL_MS);
    expect(api.getSetup).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();
    await wait(POLL_MS);
    expect(onChange).toHaveBeenCalledTimes(1);
    await wait(POLL_MS);
    expect(api.getSetup).toHaveBeenCalledTimes(3);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("never sends a second request while one is out", async () => {
    const api = {
      getSetup: vi.fn(() => new Promise<SetupState>(resolve => {
        setTimeout(() => resolve(left(5)), 12_000);
      })),
    };
    render(<Poller api={api} onChange={vi.fn()} />);
    await wait(5_000); // asked at 5 s
    expect(api.getSetup).toHaveBeenCalledTimes(1);
    await wait(10_000); // 15 s: the answer comes at 17 s
    expect(api.getSetup).toHaveBeenCalledTimes(1);
    await wait(7_000); // 22 s: asked again 5 s after the answer
    expect(api.getSetup).toHaveBeenCalledTimes(2);
  });

  it("carries on after a failure, marking the floor rather than saying so each time", async () => {
    const api = { getSetup: vi.fn().mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValue(left(5)) };
    render(<Poller api={api} onChange={vi.fn()} />);
    await wait(POLL_MS);
    expect(stored().failed["oth-L1"]).toBe(true);
    await wait(POLL_MS);
    expect(api.getSetup).toHaveBeenCalledTimes(2);
    expect(stored().failed["oth-L1"]).toBe(false);
  });

  it("stops when the step leaves the screen, and while nobody is signed in", async () => {
    const api = { getSetup: vi.fn().mockResolvedValue(left(5)) };
    const { rerender, unmount } = render(<Poller api={api} onChange={vi.fn()} />);
    await wait(POLL_MS);
    expect(api.getSetup).toHaveBeenCalledTimes(1);
    rerender(<Poller api={api} on={false} onChange={vi.fn()} />);
    await wait(3 * POLL_MS);
    expect(api.getSetup).toHaveBeenCalledTimes(1);
    rerender(<Poller api={api} onChange={vi.fn()} />);
    act(() => useEditorStore.getState().endSession("expired"));
    await wait(3 * POLL_MS);
    expect(api.getSetup).toHaveBeenCalledTimes(1);
    unmount();
  });
});
```

- [ ] **Step 2: Run the tests to verify that they fail**

Run: `bash .superpowers/run-tests.sh vitest packages/editor/src/setup/sync.test.tsx`
Expected: FAIL with `Failed to resolve import "./sync"`.

- [ ] **Step 3: Write `sync.ts`**

`packages/editor/src/setup/sync.ts`:

```ts
import type { Level } from "@oth/model";
import { useEffect, useMemo, useRef } from "react";
import { create } from "zustand";
import { isUnauthorized } from "../api/client";
import { useDrafts } from "../build/drafts";
import { useEditorStore } from "../state/store";
import { countsKey, type StepContext } from "./progress";
import type { SetupApi, SetupState } from "./types";

/** How often a Claude step asks for its counts (spec §4.3). */
export const POLL_MS = 5000;

type SetupStore = {
  /** Each floor's setup, as the server last gave it. */
  byLevel: Readonly<Record<string, SetupState>>;
  /** Floors whose last load failed; the next that works clears it. */
  failed: Readonly<Record<string, boolean>>;
  put: (levelId: string, state: SetupState) => void;
  fail: (levelId: string) => void;
  reset: () => void;
};

/**
 * Each floor's setup, shared: the wizard, its step bar in the header and the
 * Floors home cards all read the same answer, so their ticks never disagree.
 */
export const useSetupStore = create<SetupStore>(set => ({
  byLevel: {},
  failed: {},
  put: (levelId, state) => set(s => ({
    byLevel: { ...s.byLevel, [levelId]: state },
    failed: { ...s.failed, [levelId]: false },
  })),
  fail: levelId => set(s => ({ failed: { ...s.failed, [levelId]: true } })),
  reset: () => set({ byLevel: {}, failed: {} }),
}));

/** Each floor's newest load. An answer to an older one is dropped, as the drafts' loads are. */
const asked = new Map<string, number>();

/**
 * A floor's setup from the server, into the store. Null when there is none
 * to use: it failed, or a newer load has been asked for since. A failure keeps
 * the last setup and marks the floor, for one quiet line rather than a toast:
 * a Claude step asks every 5 s. A 401 has already opened the sign-in dialog.
 * Before 6C's client lands `getSetup` is missing, and that fails here too.
 */
export async function loadSetup(api: Pick<SetupApi, "getSetup">, levelId: string): Promise<SetupState | null> {
  const mine = (asked.get(levelId) ?? 0) + 1;
  asked.set(levelId, mine);
  const newest = () => asked.get(levelId) === mine;
  try {
    const state = await api.getSetup(levelId);
    if (!newest()) return null;
    useSetupStore.getState().put(levelId, state);
    return state;
  } catch (err) {
    if (newest() && !isUnauthorized(err)) useSetupStore.getState().fail(levelId);
    return null;
  }
}

/**
 * Asks for the floor's setup every 5 s while `on`, which a Claude step keeps
 * true while it is on screen. `onCountsChange` is told when the counts differ
 * from the last answer: the caller reloads the model, so the map shows
 * Claude's work. The next request goes 5 s after the last answer, so a slow
 * server is never sent a queue of them. It stops while nobody is signed in:
 * every request would be a 401.
 */
export function useSetupPoll(
  api: Pick<SetupApi, "getSetup">, levelId: string, on: boolean, onCountsChange: () => void,
): void {
  const signedIn = useEditorStore(s => s.user !== null);
  const told = useRef(onCountsChange);
  told.current = onCountsChange;

  useEffect(() => {
    if (!on || !signedIn) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const held = useSetupStore.getState().byLevel[levelId];
    let last = held ? countsKey(held.counts) : null;
    const tick = async () => {
      const state = await loadSetup(api, levelId);
      if (stopped) return;
      if (state) {
        const key = countsKey(state.counts);
        if (last !== null && key !== last) told.current();
        last = key;
      }
      timer = setTimeout(() => void tick(), POLL_MS);
    };
    timer = setTimeout(() => void tick(), POLL_MS);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [api, levelId, on, signedIn]);
}

/** A floor's step context from the stores: what every tick is read from. */
export function useStepContext(level: Pick<Level, "id" | "code"> | null): StepContext | null {
  const levelId = level?.id ?? null;
  const levelCode = level?.code ?? "";
  const setup = useSetupStore(s => (levelId ? s.byLevel[levelId] ?? null : null));
  const model = useEditorStore(s => s.model);
  const levelImages = useEditorStore(s => s.levelImages);
  const draftsWaiting = useDrafts(s => (levelId ? s.byLevel[levelId]?.length ?? 0 : 0));
  return useMemo(
    () => (levelId ? { setup, model, levelImages, levelId, levelCode, draftsWaiting } : null),
    [setup, model, levelImages, levelId, levelCode, draftsWaiting],
  );
}
```

- [ ] **Step 4: Run the tests and typecheck**

Run: `bash .superpowers/run-tests.sh vitest packages/editor/src/setup/sync.test.tsx`
Expected: PASS.

Run: `bash .superpowers/run-tests.sh tsc packages/editor`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add -- packages/editor/src/setup/sync.ts packages/editor/src/setup/sync.test.tsx
git commit --only -m "feat(editor): each floor's setup in one store, polled every 5 s while Claude works

loadSetup keeps each floor's setup where the wizard, its step bar and the
Floors cards all read it, and drops an answer a newer load has overtaken.
useSetupPoll asks every 5 s, one request at a time, and says when the counts
change so the caller can reload the map. It stops while nobody is signed in,
and a failure marks the floor for one quiet line instead of a toast.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- packages/editor/src/setup/sync.ts packages/editor/src/setup/sync.test.tsx
```

---

### Task 3: The map beside, a Claude step's screen, and opening the Claude Code panel

**Real browser:** needs 6C's routes and prompts merged.

**Files:**
- Create: `packages/editor/src/shell/claudePanel.ts`
- Modify: `packages/editor/src/shell/ClaudeCodeButton.tsx`
- Modify: `packages/editor/src/shell/ClaudeCodeButton.test.tsx` (one test)
- Create: `packages/editor/src/setup/SetupMap.tsx`
- Create: `packages/editor/src/setup/ClaudeStep.tsx`
- Create: `packages/editor/src/setup/ClaudeStep.test.tsx`

**Interfaces:**
- Consumes:
  - from Task 1: `countRows`, `countsKey`, `doneLine`, `sinceParam`, `storedState` (`./progress`); `doItMyself`, `slashCommand`, `wizardStep`, `ClaudeStepId` (`./steps`); `ClaudeChange`, `SetupApi` (`./types`); `setupState`, `change`, `fakeSetupApi` (`./testing`);
  - from Task 2: `useSetupPoll`, `useSetupStore`, `POLL_MS` (`./sync`);
  - `parseSelectParam`, `selectParam` (`../build/selection`); `zoomViewportTo` (`../build/zoomTo`); `roomLabels` (`../places/labels`); `PlanCanvas`; `PlanRoomLabels`; `useElementSize`.
- Produces:
  - `useClaudeCodePanel` (zustand: `{ open: boolean; setOpen(open) }`) and `openClaudeCodePanel(): void`, in `shell/claudePanel.ts`;
  - `myLiveTokens(list: TokenList | null, userId: string | null, now?: number): ApiToken[]`, exported from `shell/ClaudeCodeButton.tsx`;
  - `type MapFocus = { target: NonNullable<Selection>; seq: number }` and `SetupMap({ api, focus? }: { api: Pick<Api, "levelImageFileUrl">; focus?: MapFocus | null })`;
  - `ClaudeStep({ api, saver, level, stepId }: { api: Pick<Api, "listTokens" | "levelImageFileUrl"> & Pick<SetupApi, "getSetup" | "listClaudeChanges">; saver: Pick<Saver, "refresh">; level: Level; stepId: ClaudeStepId })`.

- [ ] **Step 1: Write the failing tests**

Add to `packages/editor/src/shell/ClaudeCodeButton.test.tsx`, inside `describe("ClaudeCodeButton", …)`, and add `import { openClaudeCodePanel } from "./claudePanel";` to its imports:

```tsx
  it("opens from the setup wizard's link, loading your tokens as it does", async () => {
    const listTokens = listed([]);
    render(<ClaudeCodeButton api={fakeApi({ listTokens })} />);
    await waitFor(() => expect(listTokens).toHaveBeenCalledTimes(1));
    act(() => openClaudeCodePanel());
    expect(await screen.findByRole("list", { name: "Steps" })).toBeTruthy();
    await waitFor(() => expect(listTokens).toHaveBeenCalledTimes(2));
  });
```

`packages/editor/src/setup/ClaudeStep.test.tsx`:

```tsx
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiToken } from "../api/client";
import { useClaudeCodePanel } from "../shell/claudePanel";
import { useEditorStore } from "../state/store";
import { sampleModel, sampleTeam } from "../testing/fakeApi";
import { useToasts } from "../ui/toast";
import { ClaudeStep } from "./ClaudeStep";
import type { ClaudeStepId } from "./steps";
import { POLL_MS, useSetupStore } from "./sync";
import { change, fakeSetupApi, setupState } from "./testing";
import type { SetupState } from "./types";

const me = { id: "u_sc", email: "sc@oth.local", displayName: "Stef Chan" };
const L1 = sampleModel.levels[0]!;
const liveToken: ApiToken = {
  id: "tok_1", name: "Laptop", ownerId: "u_sc", ownerName: "Stef Chan", mayPublish: false,
  createdAt: "2026-09-01T12:00:00Z", lastUsedAt: null, expiresAt: "2099-01-01T12:00:00Z",
};
const tokens = (list: ApiToken[]) => vi.fn().mockResolvedValue({ tokens: list, mayPublishByDefault: false });
const rooms = (waiting: number, accepted: number) => ({ waiting, accepted, rejectedOrSetAside: 0, stops: 0 });

beforeEach(() => {
  useSetupStore.getState().reset();
  useToasts.getState().clear();
  useClaudeCodePanel.getState().setOpen(false);
  const s = useEditorStore.getState();
  s.reset();
  s.setUser(me);
  s.setModel(sampleModel);
  s.setTeam(sampleTeam);
  s.setActiveLevel("oth-L1");
});

function open({ api = fakeSetupApi(), stepId = "rooms", state = setupState() }: {
  api?: ReturnType<typeof fakeSetupApi>; stepId?: ClaudeStepId; state?: SetupState;
} = {}) {
  useSetupStore.getState().put("oth-L1", state);
  const saver = { refresh: vi.fn().mockResolvedValue(undefined) };
  render(<ClaudeStep api={api} saver={saver} level={L1} stepId={stepId} />);
  return { api, saver };
}

const progress = () => within(screen.getByRole("region", { name: "Progress" }));
const count = (label: string) => progress().getByText(label).nextElementSibling?.textContent;

describe("ClaudeStep", () => {
  it("gives the command for this floor, and copies it", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    // jsdom has no clipboard.
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    open();
    expect(screen.getByRole("heading", { name: "Rooms from the PDF" })).toBeTruthy();
    expect(screen.getByLabelText("Command for Claude Code").textContent).toBe("/mcp__oth__map_rooms L1");
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("/mcp__oth__map_rooms L1"));
    expect(useToasts.getState().toasts.at(-1)?.message).toBe("Copied. Paste it into Claude Code.");
  });

  it("shows the step's live counts", () => {
    open({ state: setupState({}, { rooms: { waiting: 12, accepted: 150, rejectedOrSetAside: 53, stops: 8 } }) });
    expect(count("Drafts waiting")).toBe("12");
    expect(count("Made rooms")).toBe("150");
    expect(count("Rejected or set aside")).toBe("53");
    expect(count("Stops made")).toBe("8");
  });

  it("lists Claude's last five changes on the floor, from when this setup began", async () => {
    const listClaudeChanges = vi.fn().mockResolvedValue(
      Array.from({ length: 7 }, (_, i) => change({ auditId: `a${i}`, summary: `Made room ${i} from a draft` })));
    open({
      api: fakeSetupApi({ listClaudeChanges }),
      state: setupState({ footage: { status: "done", finishedAt: "2026-09-28T09:00:00.000Z" } }),
    });
    const list = within(screen.getByRole("region", { name: "Claude's last changes" }));
    await waitFor(() => expect(list.getAllByRole("listitem")).toHaveLength(5));
    expect(list.getAllByRole("listitem")[0]!.textContent).toContain("Made room 0 from a draft");
    expect(listClaudeChanges).toHaveBeenCalledWith("oth-L1", "2026-09-28T09:00:00.000Z");
  });

  it("says so while Claude has done nothing here", async () => {
    open();
    expect(await screen.findByText("Nothing from Claude on L1 yet.")).toBeTruthy();
  });

  it("leads to the Claude Code panel when you have no live token: an expired one is none", async () => {
    open({ api: fakeSetupApi({ listTokens: tokens([{ ...liveToken, expiresAt: "2020-01-01T00:00:00Z" }]) }) });
    fireEvent.click(await screen.findByRole("button", { name: "Connect Claude Code" }));
    expect(useClaudeCodePanel.getState().open).toBe(true);
  });

  it("says nothing about connecting when you have a live token, or when your tokens can't be loaded", async () => {
    const live = tokens([liveToken]);
    open({ api: fakeSetupApi({ listTokens: live }) });
    await waitFor(() => expect(live).toHaveBeenCalled());
    await act(async () => {});
    expect(screen.queryByRole("button", { name: "Connect Claude Code" })).toBeNull();
    cleanup();

    const failing = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    open({ api: fakeSetupApi({ listTokens: failing }) });
    await waitFor(() => expect(failing).toHaveBeenCalled());
    await act(async () => {});
    expect(screen.queryByRole("button", { name: "Connect Claude Code" })).toBeNull();
  });

  it("shows Claude's note once it has called finish_step", () => {
    open({
      state: setupState({
        rooms: {
          status: "done", finishedBy: "u_sc", finishedVia: "tok_1", finishedAt: new Date().toISOString(),
          note: "Made 150 rooms; 12 drafts set aside for a person",
        },
      }),
    });
    expect(screen.getByRole("status").textContent)
      .toBe("✓ Done by Claude, just now: Made 150 rooms; 12 drafts set aside for a person");
  });

  it("links to the step's own tool, to do it yourself", () => {
    open({ stepId: "paths" });
    expect(screen.getByRole("link", { name: "Do it myself on Build" }).getAttribute("href")).toBe("/floors/L1/build?step=pathways");
  });

  describe("while Claude works", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());
    const flush = () => act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    const nextPoll = () => act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_MS);
    });

    it("asks every 5 s, and reloads the map and Claude's changes when the counts move", async () => {
      const before = setupState({}, { rooms: rooms(12, 0) });
      const after = setupState({}, { rooms: rooms(2, 10) });
      const getSetup = vi.fn().mockResolvedValueOnce(before).mockResolvedValue(after);
      const listClaudeChanges = vi.fn().mockResolvedValue([]);
      const { saver } = open({ api: fakeSetupApi({ getSetup, listClaudeChanges }), state: before });
      await flush();
      expect(listClaudeChanges).toHaveBeenCalledTimes(1);
      await nextPoll(); // the same counts
      expect(saver.refresh).not.toHaveBeenCalled();
      await nextPoll(); // Claude has made ten rooms
      expect(saver.refresh).toHaveBeenCalledTimes(1);
      expect(listClaudeChanges).toHaveBeenCalledTimes(2);
      expect(count("Made rooms")).toBe("10");
    });

    it("says so, quietly, while the server can't be reached, and carries on", async () => {
      const getSetup = vi.fn().mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValue(setupState());
      open({ api: fakeSetupApi({ getSetup }) });
      await flush();
      await nextPoll();
      expect(screen.getByText("Can't reach the server. Trying again every 5 seconds.")).toBeTruthy();
      expect(useToasts.getState().toasts).toEqual([]);
      await nextPoll();
      expect(screen.queryByText(/Can't reach the server/)).toBeNull();
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify that they fail**

Run: `bash .superpowers/run-tests.sh vitest packages/editor/src/setup/ClaudeStep.test.tsx packages/editor/src/shell/ClaudeCodeButton.test.tsx`
Expected: FAIL. `./ClaudeStep` and `./claudePanel` do not resolve.

- [ ] **Step 3: The panel's open state, in a store**

`packages/editor/src/shell/claudePanel.ts`:

```ts
import { create } from "zustand";

/**
 * Whether the header's Claude Code panel is open. It lives here rather than
 * in the button, so the setup wizard's "Connect Claude Code" can open it too.
 */
export const useClaudeCodePanel = create<{ open: boolean; setOpen: (open: boolean) => void }>(set => ({
  open: false,
  setOpen: open => set({ open }),
}));

export function openClaudeCodePanel(): void {
  useClaudeCodePanel.getState().setOpen(true);
}
```

In `packages/editor/src/shell/ClaudeCodeButton.tsx`:

- Change the client import to `import { isUnauthorized, type Api, type ApiToken, type TokenList } from "../api/client";`, and add `import { useClaudeCodePanel } from "./claudePanel";`.
- Above `export function ClaudeCodeButton`, add:

```tsx
/** Your own tokens that still work. The server drops revoked and expired ones; expiry is checked again here. */
export function myLiveTokens(list: TokenList | null, userId: string | null, now = Date.now()): ApiToken[] {
  return (list?.tokens ?? []).filter(t => t.ownerId === userId && Date.parse(t.expiresAt) > now);
}
```

- Replace `const [open, setOpen] = useState(false);` with:

```tsx
  const open = useClaudeCodePanel(s => s.open);
  const setOpen = useClaudeCodePanel(s => s.setOpen);
```

- Replace these lines:

```tsx
  // A session that ends with the panel open must not reopen it on sign-in.
  if (!user && open) setOpen(false);

  // The list is the whole team's; the server drops revoked and expired ones, and this checks expiry again.
  const now = Date.now();
  const mine = (list?.tokens ?? []).filter(t => t.ownerId === userId && Date.parse(t.expiresAt) > now);
```

with:

```tsx
  // Again each time the panel opens, however it was opened: its trigger, or the setup wizard's link.
  useEffect(() => {
    if (open && userId) void load();
  }, [open, userId, load]);

  // A session that ends with the panel open must not reopen it on sign-in.
  useEffect(() => {
    if (!user && open) setOpen(false);
  }, [user, open, setOpen]);

  // The panel is this button's: gone with it, so it never springs open on the next mount.
  useEffect(() => () => setOpen(false), [setOpen]);

  // The list is the whole team's.
  const mine = myLiveTokens(list, userId);
```

- Replace the Popover's `onOpenChange` prop:

```tsx
        onOpenChange={next => {
          setOpen(next);
          if (next && userId) void load();
        }}
```

with `onOpenChange={setOpen}`. The load moved into the effect above.

`useState` is still used for the list, the failure and the dialog, so keep its import.

- [ ] **Step 4: The map beside a step**

`packages/editor/src/setup/SetupMap.tsx`:

```tsx
import { useEffect, useMemo } from "react";
import type { Api } from "../api/client";
import { parseSelectParam, selectParam } from "../build/selection";
import { zoomViewportTo } from "../build/zoomTo";
import { roomLabels } from "../places/labels";
import { PlanCanvas } from "../plan/PlanCanvas";
import { PlanRoomLabels } from "../plan/RoomLabels";
import { useElementSize } from "../plan/useElementSize";
import { useEditorStore, type Selection } from "../state/store";

/** A request to frame something on the map. `seq` makes the same thing asked twice two requests. */
export type MapFocus = { target: NonNullable<Selection>; seq: number };

/**
 * The floor's plan beside a step (spec §4.2, §8): what Claude has put on it so
 * far, with the rooms' names. It draws nothing itself; a click selects, as on
 * Build.
 */
export function SetupMap({ api, focus = null }: { api: Pick<Api, "levelImageFileUrl">; focus?: MapFocus | null }) {
  const model = useEditorStore(s => s.model);
  const levelId = useEditorStore(s => s.activeLevelId);
  const selection = useEditorStore(s => s.selection);
  const [box, size] = useElementSize();
  const labels = useMemo(() => (model && levelId ? roomLabels(model, levelId) : []), [model, levelId]);

  // Select only: a drawing tool left in hand on Build would draw here on a click.
  useEffect(() => {
    useEditorStore.getState().setTool("select");
  }, []);

  // Leaving lets go of the selection, which is also the collaboration lock.
  useEffect(() => () => useEditorStore.getState().select(null), []);

  // A selection whose thing has gone, undone say, is let go, as on Build.
  useEffect(() => {
    if (selection && !parseSelectParam(selectParam(selection), model, levelId)) useEditorStore.getState().select(null);
  }, [selection, model, levelId]);

  // Frame what Show asked for, once the map has a size.
  useEffect(() => {
    if (!focus || !size) return;
    const viewport = zoomViewportTo(useEditorStore.getState().model, focus.target, size.width, size.height);
    if (viewport) useEditorStore.getState().setViewport(viewport);
  }, [focus, size]);

  return (
    <div ref={box} data-testid="setup-map" className="relative min-w-0 flex-1 overflow-hidden bg-stone-100">
      {size && (
        <PlanCanvas
          width={size.width}
          height={size.height}
          imageUrl={api.levelImageFileUrl}
          showHint={false}
          overlays={<PlanRoomLabels labels={labels} />}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 5: A Claude step's screen**

`packages/editor/src/setup/ClaudeStep.tsx`:

```tsx
import type { Level } from "@oth/model";
import { Fragment, useEffect, useState } from "react";
import type { Api, TokenList } from "../api/client";
import { followLink } from "../route";
import { myLiveTokens } from "../shell/ClaudeCodeButton";
import { openClaudeCodePanel, useClaudeCodePanel } from "../shell/claudePanel";
import type { Saver } from "../state/save";
import { useEditorStore } from "../state/store";
import { Button } from "../ui/Button";
import { relativeTime } from "../ui/relativeTime";
import { toast } from "../ui/toast";
import { countRows, countsKey, doneLine, sinceParam, storedState } from "./progress";
import { SetupMap } from "./SetupMap";
import { doItMyself, slashCommand, wizardStep, type ClaudeStepId } from "./steps";
import { useSetupPoll, useSetupStore } from "./sync";
import type { ClaudeChange, SetupApi } from "./types";

/** How many of Claude's changes the step lists (spec §4.2). */
const LAST_CHANGES = 5;

async function copy(command: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(command);
    toast({ tone: "success", message: "Copied. Paste it into Claude Code." });
  } catch {
    toast({ tone: "error", message: "Couldn't copy. Select the command and copy it yourself." });
  }
}

/**
 * A step Claude does (spec §4.2): the slash command to run in your own
 * Claude Code, the step's live counts, what Claude last did here, and the
 * step's own tool for doing it by hand. The map beside it fills in as Claude
 * works: the counts are asked for every 5 s, and a change reloads the model.
 */
export function ClaudeStep({ api, saver, level, stepId }: {
  api: Pick<Api, "listTokens" | "levelImageFileUrl"> & Pick<SetupApi, "getSetup" | "listClaudeChanges">;
  saver: Pick<Saver, "refresh">;
  level: Level;
  stepId: ClaudeStepId;
}) {
  const setup = useSetupStore(s => s.byLevel[level.id] ?? null);
  const unreachable = useSetupStore(s => s.failed[level.id] ?? false);
  const user = useEditorStore(s => s.user);
  const team = useEditorStore(s => s.team);
  const panelOpen = useClaudeCodePanel(s => s.open);
  const [tokens, setTokens] = useState<TokenList | null>(null);
  const [changes, setChanges] = useState<ClaudeChange[] | null>(null);
  const step = wizardStep(stepId);
  const command = slashCommand(stepId, level.code);
  const since = sinceParam(setup);
  const key = setup ? countsKey(setup.counts) : "";

  // Claude's work lands on the server; counts that move mean there is more of
  // it to show. A reload that fails is tried again at the next change.
  useSetupPoll(api, level.id, true, () => {
    void saver.refresh().catch(() => {});
  });

  // Your tokens: once, and again as the Claude Code panel closes, where one may just have been made.
  useEffect(() => {
    if (panelOpen || !user) return;
    let mounted = true;
    api.listTokens().then(
      list => {
        if (mounted) setTokens(list);
      },
      () => {},
    );
    return () => {
      mounted = false;
    };
  }, [api, panelOpen, user]);

  // Claude's last changes: on arrival, and whenever the counts move.
  useEffect(() => {
    let mounted = true;
    api.listClaudeChanges(level.id, since).then(
      list => {
        if (mounted) setChanges(list.slice(0, LAST_CHANGES));
      },
      () => {},
    );
    return () => {
      mounted = false;
    };
  }, [api, level.id, since, key]);

  // Unknown until they load. A list that can't be had says nothing: telling
  // someone already connected to connect would be wrong.
  const noToken = tokens !== null && myLiveTokens(tokens, user?.id ?? null).length === 0;
  const state = storedState(setup, stepId);
  const done = doneLine(state, team);
  const mine = doItMyself(stepId, level.code);

  return (
    <div className="flex h-full min-h-0">
      <section aria-label={step.title} className="w-96 shrink-0 space-y-5 overflow-y-auto border-r border-stone-200 bg-white p-5">
        <header className="space-y-1">
          <h1 className="text-lg font-semibold">{step.title}</h1>
          <p className="text-sm text-stone-600">Claude does this step. Run this in your Claude Code, and watch the map fill in.</p>
        </header>

        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <code
              aria-label="Command for Claude Code"
              className="min-w-0 flex-1 truncate rounded border border-stone-300 bg-stone-50 px-2 py-1.5 font-mono text-sm"
            >
              {command}
            </code>
            <Button size="sm" onClick={() => void copy(command)}>Copy</Button>
          </div>
          {noToken && (
            <p className="text-xs text-stone-700">
              Your Claude Code isn't connected yet.{" "}
              <button type="button" className="font-medium text-accent underline" onClick={openClaudeCodePanel}>
                Connect Claude Code
              </button>{" "}
              first.
            </p>
          )}
        </div>

        {done && (
          <p role="status" className="rounded border border-confirmed/30 bg-confirmed-soft p-2 text-sm text-stone-900">
            <span aria-hidden>✓ </span>
            {done}
            {state?.note ? `: ${state.note}` : ""}
          </p>
        )}

        <section aria-label="Progress" className="space-y-1">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-stone-500">Progress</h2>
          {unreachable && <p className="text-xs text-stone-600">Can't reach the server. Trying again every 5 seconds.</p>}
          {setup && (
            <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-0.5 text-sm">
              {countRows(stepId, setup.counts).map(row => (
                <Fragment key={row.label}>
                  <dt className="text-stone-600">{row.label}</dt>
                  <dd className="text-right font-medium tabular-nums">{row.value}</dd>
                </Fragment>
              ))}
            </dl>
          )}
        </section>

        <section aria-label="Claude's last changes" className="space-y-1">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-stone-500">Claude's last changes</h2>
          {changes !== null && changes.length === 0 && (
            <p className="text-xs text-stone-600">Nothing from Claude on {level.code} yet.</p>
          )}
          {changes !== null && changes.length > 0 && (
            <ol className="space-y-1 text-sm">
              {changes.map(c => (
                <li key={c.auditId}>
                  {c.summary} <span className="text-xs text-stone-500">{relativeTime(c.at)}</span>
                </li>
              ))}
            </ol>
          )}
        </section>

        <a href={mine.to} onClick={followLink(mine.to)} className="inline-block text-sm font-medium text-accent underline">
          {mine.label}
        </a>
      </section>
      <SetupMap api={api} />
    </div>
  );
}
```

- [ ] **Step 6: Run the tests and typecheck**

Run: `bash .superpowers/run-tests.sh vitest packages/editor/src/setup packages/editor/src/shell`
Expected: PASS. Every existing ClaudeCodeButton test still passes, "does not spring open by itself after the session ends" among them.

Run: `bash .superpowers/run-tests.sh tsc packages/editor`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add -- packages/editor/src/shell/claudePanel.ts packages/editor/src/setup/SetupMap.tsx packages/editor/src/setup/ClaudeStep.tsx packages/editor/src/setup/ClaudeStep.test.tsx
git commit --only -m "feat(editor): a Claude step's screen: the command, live counts, Claude's last changes

Each Claude step shows its slash command with Copy, the step's counts, the
last five things Claude did on the floor, and Do it myself. The map beside it
reloads when the counts move, asked every 5 s. With no live token of yours, a
line opens the Claude Code panel, whose open state now lives in a small store
so the wizard can reach it.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- packages/editor/src/shell/claudePanel.ts packages/editor/src/shell/ClaudeCodeButton.tsx packages/editor/src/shell/ClaudeCodeButton.test.tsx packages/editor/src/setup/SetupMap.tsx packages/editor/src/setup/ClaudeStep.tsx packages/editor/src/setup/ClaudeStep.test.tsx
```

---

### Task 4: Add footage and Finish screens

**Waits for:** 6B's `packages/editor/src/build/DownloadModel.tsx`, for the Finish half. Check with `ls packages/editor/src/build/DownloadModel.tsx`. If it isn't there yet, do Steps 1–4 for Add footage alone, commit them, and do the Finish half once 6B has merged.

**Files:**
- Create: `packages/editor/src/setup/FootageStep.tsx`
- Create: `packages/editor/src/setup/FootageStep.test.tsx`
- Create: `packages/editor/src/setup/FinishStep.tsx`
- Create: `packages/editor/src/setup/FinishStep.test.tsx`

**Interfaces:**
- Consumes:
  - `AddFootageDialog` from `../survey/AddFootageDialog`;
  - `DownloadModelButton({ api, levelId? }: { api: Api; levelId?: string })` from `../build/DownloadModel` (6B);
  - `doneLine` from `./progress` and `SetupStepState` from `./types` (Task 1);
  - `followLink`, `href` from `../route`.
- Produces:
  - `FootageStep({ api, saver, level }: { api: Pick<Api, "uploadKeyframe">; saver: Pick<Saver, "create" | "update" | "refresh">; level: Level })`;
  - `FinishStep({ api, level, state, onFinish }: { api: Api; level: Level; state: SetupStepState | null; onFinish: () => void })`.

- [ ] **Step 1: Write the failing tests**

`packages/editor/src/setup/FootageStep.test.tsx`:

```tsx
import type { Level } from "@oth/model";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useEditorStore } from "../state/store";
import { sampleModel } from "../testing/fakeApi";
import { FootageStep } from "./FootageStep";

const [L1, L2] = sampleModel.levels as [Level, Level];

function open(level: Level = L1) {
  const api = { uploadKeyframe: vi.fn() };
  const saver = { create: vi.fn(async () => true), update: vi.fn(async () => true), refresh: vi.fn(async () => {}) };
  render(<FootageStep api={api} saver={saver} level={level} />);
}

beforeEach(() => {
  useEditorStore.getState().reset();
  useEditorStore.getState().setModel(sampleModel);
});

describe("FootageStep", () => {
  it("lists the footage filed under the floor, each with its frames and a way into Survey", () => {
    open();
    const walk = within(screen.getByTestId("footage-cap_1"));
    expect(walk.getByText("L1 walk.mp4")).toBeTruthy();
    expect(walk.getByText("Video · 2 frames")).toBeTruthy();
    expect(walk.getByRole("link", { name: "Open in Survey: L1 walk.mp4" }).getAttribute("href"))
      .toBe("/floors/L1/survey?capture=cap_1");
  });

  it("says when a floor has none", () => {
    open(L2);
    expect(screen.getByText("No footage on L2 yet.")).toBeTruthy();
  });

  it("opens Survey's own Add footage dialog", async () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: "+ Add footage" }));
    expect(await screen.findByRole("dialog", { name: "Add footage" })).toBeTruthy();
  });

  it("looks through footage again for frames it missed", async () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: "Find more frames in L1 walk.mp4" }));
    expect(await screen.findByRole("dialog", { name: "Find more frames in L1 walk.mp4" })).toBeTruthy();
  });
});
```

`packages/editor/src/setup/FinishStep.test.tsx`:

```tsx
import type { Level } from "@oth/model";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useEditorStore } from "../state/store";
import { fakeApi, sampleModel, sampleTeam } from "../testing/fakeApi";
import { FinishStep } from "./FinishStep";

const L1 = sampleModel.levels[0] as Level;

beforeEach(() => {
  const s = useEditorStore.getState();
  s.reset();
  s.setModel(sampleModel);
  s.setTeam(sampleTeam);
  s.setActiveLevel("oth-L1");
});

describe("FinishStep", () => {
  it("hands the floor over to normal editing", () => {
    const onFinish = vi.fn();
    render(<FinishStep api={fakeApi()} level={L1} state={null} onFinish={onFinish} />);
    fireEvent.click(screen.getByRole("button", { name: "Finish setup and open Build" }));
    expect(onFinish).toHaveBeenCalled();
  });

  it("offers the floor as a 3D model", () => {
    render(<FinishStep api={fakeApi()} level={L1} state={null} onFinish={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Download 3D model" })).toBeEnabled();
  });

  it("says who finished it, once someone has, and still links to Build", () => {
    const state = {
      step: "finish" as const, status: "done" as const, note: "",
      finishedBy: "u_wei", finishedVia: null, finishedAt: new Date().toISOString(),
    };
    render(<FinishStep api={fakeApi()} level={L1} state={state} onFinish={vi.fn()} />);
    expect(screen.getByRole("status").textContent).toBe("✓ Done by Wei Kang, just now");
    expect(screen.queryByRole("button", { name: /Finish setup/ })).toBeNull();
    expect(screen.getByRole("link", { name: "Open Build" }).getAttribute("href")).toBe("/floors/L1/build");
  });
});
```

- [ ] **Step 2: Run the tests to verify that they fail**

Run: `bash .superpowers/run-tests.sh vitest packages/editor/src/setup/FootageStep.test.tsx packages/editor/src/setup/FinishStep.test.tsx`
Expected: FAIL. `./FootageStep` and `./FinishStep` do not resolve.

- [ ] **Step 3: Add footage**

`packages/editor/src/setup/FootageStep.tsx`:

```tsx
import { live, type Level } from "@oth/model";
import { useMemo, useState } from "react";
import type { Api } from "../api/client";
import { followLink, href } from "../route";
import type { Saver } from "../state/save";
import { useEditorStore } from "../state/store";
import { AddFootageDialog } from "../survey/AddFootageDialog";
import { Button } from "../ui/Button";

/**
 * Step 1 (spec §4.2): Survey's own Add footage dialog, and the footage already
 * filed under this floor. Any of it can be looked through again for frames it
 * missed, and each opens in Survey. New footage is filed under this floor as
 * it is made, so the list shows it as the model reloads.
 */
export function FootageStep({ api, saver, level }: {
  api: Pick<Api, "uploadKeyframe">;
  saver: Pick<Saver, "create" | "update" | "refresh">;
  level: Level;
}) {
  const model = useEditorStore(s => s.model);
  const [dialog, setDialog] = useState<{ captureId: string | null } | null>(null);
  const footage = useMemo(() => {
    if (!model) return [];
    const frames = new Map<string, number>();
    for (const k of live(model.keyframes)) frames.set(k.captureId, (frames.get(k.captureId) ?? 0) + 1);
    return live(model.captures)
      .filter(c => c.levelId === level.id)
      .sort((a, b) => a.filename.localeCompare(b.filename))
      .map(capture => ({ capture, frames: frames.get(capture.id) ?? 0 }));
  }, [model, level.id]);

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-6">
      <header className="space-y-1">
        <h1 className="text-lg font-semibold">Add footage</h1>
        <p className="text-sm text-stone-600">
          Walk {level.code} filming with a phone, then add the video here. It stays on this computer: only the frames worth keeping are uploaded.
        </p>
      </header>
      <Button variant="primary" onClick={() => setDialog({ captureId: null })}>+ Add footage</Button>
      {footage.length === 0 ? (
        <p className="text-sm text-stone-600">No footage on {level.code} yet.</p>
      ) : (
        <ul aria-label={`Footage on ${level.code}`} className="divide-y divide-stone-200 rounded border border-stone-200 bg-white">
          {footage.map(({ capture, frames }) => {
            const survey = href({ name: "floor", code: level.code, tab: "survey", params: { capture: capture.id } });
            return (
              <li key={capture.id} data-testid={`footage-${capture.id}`} className="flex items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{capture.filename}</p>
                  <p className="text-xs text-stone-600">
                    {capture.kind === "video" ? "Video" : "Photos"} · {frames === 1 ? "1 frame" : `${frames} frames`}
                  </p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => setDialog({ captureId: capture.id })}>
                  Find more frames<span className="sr-only"> in {capture.filename}</span>
                </Button>
                <a href={survey} onClick={followLink(survey)} className="text-xs font-medium text-accent underline">
                  Open in Survey<span className="sr-only">: {capture.filename}</span>
                </a>
              </li>
            );
          })}
        </ul>
      )}
      {dialog && (
        <AddFootageDialog
          key={dialog.captureId ?? "new"}
          api={api}
          saver={saver}
          level={level}
          captureId={dialog.captureId}
          open
          onOpenChange={next => {
            if (!next) setDialog(null);
          }}
          // The list shows new footage as the model reloads: there is no frame to follow here.
          onCapture={() => {}}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run the Add footage tests**

Run: `bash .superpowers/run-tests.sh vitest packages/editor/src/setup/FootageStep.test.tsx`
Expected: PASS.

- [ ] **Step 5: Finish, with 6B's Download 3D model**

`packages/editor/src/setup/FinishStep.tsx`:

```tsx
import type { Level } from "@oth/model";
import type { Api } from "../api/client";
import { DownloadModelButton } from "../build/DownloadModel";
import { followLink, href } from "../route";
import { useEditorStore } from "../state/store";
import { Button } from "../ui/Button";
import { doneLine } from "./progress";
import type { SetupStepState } from "./types";

/**
 * Step 9 (spec §4.1): the floor goes back to normal editing, and the 3D model
 * is offered. Download 3D model is Plan 6B's button, the same one that sits
 * beside the 3D toggle on Build; here it is fixed to the floor being set up.
 */
export function FinishStep({ api, level, state, onFinish }: {
  api: Api;
  level: Level;
  state: SetupStepState | null;
  onFinish: () => void;
}) {
  const team = useEditorStore(s => s.team);
  const build = href({ name: "floor", code: level.code, tab: "build", params: {} });
  const done = doneLine(state, team);

  return (
    <div className="mx-auto max-w-2xl space-y-5 p-6">
      <header className="space-y-1">
        <h1 className="text-lg font-semibold">Finish</h1>
        <p className="text-sm text-stone-600">
          {level.code} is set up. From here the team edits it as usual, on Build and the other tabs, and publishes it when it's ready.
        </p>
      </header>
      <section aria-label="3D model" className="space-y-2 rounded border border-stone-200 bg-white p-4">
        <h2 className="text-sm font-semibold">The 3D model</h2>
        <p className="text-xs text-stone-600">
          For the modeller, or to hand over: everything the 3D preview shows, as named parts, in metres.
        </p>
        <DownloadModelButton api={api} levelId={level.id} />
      </section>
      {done ? (
        <p role="status" className="text-sm text-stone-700">
          <span aria-hidden>✓ </span>
          {done}
        </p>
      ) : (
        <Button variant="primary" onClick={onFinish}>Finish setup and open Build</Button>
      )}
      {done && (
        <a href={build} onClick={followLink(build)} className="inline-block text-sm font-medium text-accent underline">
          Open Build
        </a>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Run the tests and typecheck**

Run: `bash .superpowers/run-tests.sh vitest packages/editor/src/setup/FootageStep.test.tsx packages/editor/src/setup/FinishStep.test.tsx`
Expected: PASS.

Run: `bash .superpowers/run-tests.sh tsc packages/editor`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add -- packages/editor/src/setup/FootageStep.tsx packages/editor/src/setup/FootageStep.test.tsx packages/editor/src/setup/FinishStep.tsx packages/editor/src/setup/FinishStep.test.tsx
git commit --only -m "feat(editor): the setup's first and last screens: Add footage, and Finish

Add footage is Survey's own dialog above the floor's footage, each with its
frames, Find more frames and Open in Survey. Finish offers 6B's Download 3D
model for the floor being set up, and Finish setup and open Build.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- packages/editor/src/setup/FootageStep.tsx packages/editor/src/setup/FootageStep.test.tsx packages/editor/src/setup/FinishStep.tsx packages/editor/src/setup/FinishStep.test.tsx
```

If the Finish half waited for 6B, commit Steps 1–4's two FootageStep files first, with the first line `feat(editor): the setup's Add footage screen`. Then commit the FinishStep files once 6B has merged.

---

### Task 5: The Floorplan screen

**Files:**
- Create: `packages/editor/src/setup/FloorplanStep.tsx`
- Create: `packages/editor/src/setup/FloorplanStep.test.tsx`

**Interfaces:**
- Consumes (all existing):
  - `FloorplanTools`, `PlanDropZone`, `patchPlan` from `../build/FloorplanTools`;
  - `DraftsFind` from `../build/DraftsFind`;
  - `DraftsOnPlan` from `../build/DraftsOnPlan`;
  - `StepGuide` from `../build/StepGuide`;
  - `PlanCanvas`, `PlanRoomLabels`, `useElementSize`, `roomLabels`, `levelBelow`, `imageForLevel`.
- Produces: `FloorplanStep({ api, level }: { api: Api; level: Level })`.
- Reads the active level from the store. The wizard (Task 7) makes it this floor before it shows any step.

- [ ] **Step 1: Write the failing tests**

`packages/editor/src/setup/FloorplanStep.test.tsx`:

```tsx
import { parseModel, type Level, type PlanSource } from "@oth/model";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LevelImage } from "../api/client";
import { useDrafts } from "../build/drafts";
import { useEditorStore } from "../state/store";
import { fakeApi } from "../testing/fakeApi";
import { FloorplanStep } from "./FloorplanStep";

type Measure = (entries: { contentRect: { width: number; height: number } }[]) => void;
let measure: Measure | null = null;

class FakeResizeObserver {
  // The step's own box is the first thing observed.
  constructor(cb: Measure) {
    measure ??= cb;
  }
  observe() {}
  unobserve() {}
  disconnect() {}
}

const model = parseModel({
  building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
  levels: [
    { id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6 },
    { id: "oth-L2", buildingId: "oth", code: "L2", ordinal: 2, nameEn: "L2", nameZh: "二楼", elevationM: 6, heightM: 4 },
  ],
  rooms: [{ id: "L1-a", levelId: "oth-L1", kind: "room", footprint: [[0, 0], [10, 0], [10, 10], [0, 10]], heightM: 3 }],
});
const L2 = model.levels[1] as Level;
const source: PlanSource = {
  page: 1, pageCount: 1, pageSizePt: [400, 300], rotation: 0, clipPt: [36, 78, 246, 292], pointsPerPixel: 0.1,
  metresPerPoint: 0.5, runsAgree: 2, runsFound: 2, pdfId: "pdf_1", checksum: "d".repeat(64), filename: "L2.pdf",
};
const plan = (over: Partial<LevelImage> = {}): LevelImage => ({
  id: "img_2", levelId: "oth-L2", filename: "L2.png", widthPx: 2092, heightPx: 2132, sizeBytes: 1,
  metresPerPixel: 0.05, offsetX: 0, offsetY: 0, opacity: 0.6, version: 2, source, ...over,
});

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  measure = null;
  useDrafts.getState().reset();
  const s = useEditorStore.getState();
  s.reset();
  s.setModel(model);
  s.setActiveLevel("oth-L2");
});

function open(images: LevelImage[] = []) {
  useEditorStore.getState().setLevelImages(images);
  const view = render(<FloorplanStep api={fakeApi()} level={L2} />);
  act(() => measure?.([{ contentRect: { width: 900, height: 600 } }]));
  return view;
}

const guide = () => within(screen.getByRole("region", { name: "Floorplan guide" }));

describe("FloorplanStep", () => {
  it("asks for the plan first, with Build's drop box and guide", () => {
    open();
    expect(screen.getByTestId("plan-drop-zone")).toBeTruthy();
    expect(guide().getByText("Start with the plan: drop it in the box on the canvas.")).toBeTruthy();
    expect(guide().getByRole("button", { name: "Find rooms in the drawing" })).toBeDisabled();
  });

  it("draws the plan, and offers Find rooms under Build's own tools once the PDF is scaled", () => {
    open([plan()]);
    expect(screen.queryByTestId("plan-drop-zone")).toBeNull();
    expect(document.querySelector("svg")).not.toBeNull();
    expect(guide().getByRole("button", { name: /^Measure scale/ })).toBeTruthy();
    expect(guide().getByRole("button", { name: /^Align/ })).toBeTruthy();
    expect(guide().getByRole("button", { name: "Find rooms in the drawing" })).toBeEnabled();
  });

  it("says what Find rooms is waiting for", () => {
    open([plan({ metresPerPixel: null })]);
    expect(guide().getByText("Set the plan's scale on the Floorplan step first.")).toBeTruthy();
    expect(guide().getByRole("button", { name: "Find rooms in the drawing" })).toBeDisabled();
  });

  it("puts Select back in hand when you move on", () => {
    const { unmount } = open([plan()]);
    fireEvent.click(guide().getByRole("button", { name: /^Measure scale/ }));
    expect(useEditorStore.getState().tool).toBe("calibrate");
    unmount();
    expect(useEditorStore.getState().tool).toBe("select");
  });
});
```

- [ ] **Step 2: Run the tests to verify that they fail**

Run: `bash .superpowers/run-tests.sh vitest packages/editor/src/setup/FloorplanStep.test.tsx`
Expected: FAIL with `Failed to resolve import "./FloorplanStep"`.

- [ ] **Step 3: Write `FloorplanStep`**

`packages/editor/src/setup/FloorplanStep.tsx`:

```tsx
import { live, type Level } from "@oth/model";
import { useEffect, useMemo } from "react";
import type { Api } from "../api/client";
import { DraftsFind } from "../build/DraftsFind";
import { DraftsOnPlan } from "../build/DraftsOnPlan";
import { FloorplanTools, PlanDropZone, patchPlan } from "../build/FloorplanTools";
import { StepGuide } from "../build/StepGuide";
import { levelBelow } from "../flow/floors";
import { roomLabels } from "../places/labels";
import { PlanCanvas } from "../plan/PlanCanvas";
import { PlanRoomLabels } from "../plan/RoomLabels";
import { useElementSize } from "../plan/useElementSize";
import { useEditorStore } from "../state/store";
import { imageForLevel } from "../state/underlay";

/**
 * Step 4 (spec §4.2): Build's Floorplan tools and canvas, then Find rooms.
 * The PDF goes in, its page is picked, it is scaled and lined up on the floor
 * below, and Find rooms leaves its drafts on the plan. The drafts are decided
 * at step 5, by Claude or on Build.
 */
export function FloorplanStep({ api, level }: { api: Api; level: Level }) {
  const model = useEditorStore(s => s.model);
  const levelImages = useEditorStore(s => s.levelImages);
  const [box, size] = useElementSize();
  const image = imageForLevel(levelImages, level.id);
  const below = levelBelow(model, level.id);
  const belowRings = useMemo(
    () => (model && below
      ? live(model.rooms).filter(r => r.levelId === below.id && r.kind !== "detail").map(r => r.footprint)
      : undefined),
    [model, below],
  );
  const labels = useMemo(() => (model ? roomLabels(model, level.id) : []), [model, level.id]);

  // Measure and Align are this step's tools. Moving on puts Select back in hand.
  useEffect(() => () => useEditorStore.getState().setTool("select"), []);

  // Only the drop box takes a file, as on Build. A file let go anywhere else
  // would be opened by the browser in place of the editor. This repeats
  // BuildWorkspace's own effect, which the other plans leave in place there.
  useEffect(() => {
    const refuse = (event: DragEvent) => {
      if (event.defaultPrevented) return; // The drop box took it.
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "none";
    };
    window.addEventListener("dragover", refuse);
    window.addEventListener("drop", refuse);
    return () => {
      window.removeEventListener("dragover", refuse);
      window.removeEventListener("drop", refuse);
    };
  }, []);

  return (
    <div ref={box} className="relative h-full overflow-hidden bg-stone-100">
      {size && (
        <PlanCanvas
          width={size.width}
          height={size.height}
          imageUrl={api.levelImageFileUrl}
          showHint={false}
          belowRings={belowRings}
          overlays={<>
            <DraftsOnPlan levelId={level.id} />
            <PlanRoomLabels labels={labels} />
          </>}
          onMoveUnderlay={offset => (image ? patchPlan(api, image, offset, { doing: "move the plan" }) : undefined)}
        />
      )}
      <StepGuide
        step="floorplan"
        extras={<>
          <FloorplanTools api={api} />
          <div className="border-t border-stone-200 pt-2">
            <DraftsFind api={api} />
          </div>
        </>}
      />
      {!image && <PlanDropZone api={api} />}
    </div>
  );
}
```

- [ ] **Step 4: Run the tests and typecheck**

Run: `bash .superpowers/run-tests.sh vitest packages/editor/src/setup/FloorplanStep.test.tsx`
Expected: PASS.

Run: `bash .superpowers/run-tests.sh tsc packages/editor`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add -- packages/editor/src/setup/FloorplanStep.tsx packages/editor/src/setup/FloorplanStep.test.tsx
git commit --only -m "feat(editor): the setup's Floorplan screen is Build's plan tools, then Find rooms

The floor's plan with Build's guide over it: the drop box, Measure scale,
Align on the floor below, Sheet scale, and Find rooms in the drawing, whose
drafts show on the plan as they come.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- packages/editor/src/setup/FloorplanStep.tsx packages/editor/src/setup/FloorplanStep.test.tsx
```

---

### Task 6: Check Claude's work (spec §8)

**Waits for:** 6A's model task, which gives placements `objectKindId` and `sightingIds`. **Real browser:** needs 6C's `claude-changes` and `undo` routes.

**Files:**
- Create: `packages/editor/src/setup/check.ts`
- Create: `packages/editor/src/setup/check.test.ts`
- Create: `packages/editor/src/setup/CheckStep.tsx`
- Create: `packages/editor/src/setup/CheckStep.test.tsx`

**Interfaces:**
- Consumes:
  - from Task 1: `CHECK_GROUPS`, `CheckGroup`, `ClaudeChange`, `SetupApi` (`./types`); `EPOCH` (`./progress`); `change`, `fakeSetupApi` (`./testing`);
  - from Task 3: `SetupMap`, `MapFocus` (`./SetupMap`);
  - `SELECTABLE_TYPES`, `parseSelectParam`, `selectParam`, `Selectable` from `../build/selection`;
  - `ConflictError`, `isUnauthorized` from `../api/client`;
  - `serverWords`, `reportFailure` from `../ui/failure`.
- Produces:
  - `type CheckSection = { group: CheckGroup | "other"; label: string; rows: ClaudeChange[] }`;
  - `SECTION_LABEL`;
  - `checkSections(changes): { sections: CheckSection[]; labels: number }`;
  - `showTarget(model, change, levelId): NonNullable<Selection> | null`;
  - `objectFrames(model, change): Keyframe[]`;
  - `undoRefusal(err): string | null`;
  - `CheckStep({ api, saver, level, since, onLooksRight }: { api: Pick<Api, "keyframeFileUrl" | "levelImageFileUrl"> & Pick<SetupApi, "listClaudeChanges" | "undoChange">; saver: Pick<Saver, "refresh">; level: Level; since: string; onLooksRight: () => void })`.

- [ ] **Step 1: Write the failing tests**

`packages/editor/src/setup/check.test.ts`:

```ts
import { parseModel } from "@oth/model";
import { describe, expect, it } from "vitest";
import { ApiError, ConflictError } from "../api/client";
import { checkSections, showTarget, undoRefusal } from "./check";
import { change } from "./testing";

const sq = (x: number): [number, number][] => [[x, 0], [x + 10, 0], [x + 10, 10], [x, 10]];
const model = parseModel({
  building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
  levels: [
    { id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6 },
    { id: "oth-L2", buildingId: "oth", code: "L2", ordinal: 2, nameEn: "L2", nameZh: "二楼", elevationM: 6, heightM: 4 },
  ],
  rooms: [
    { id: "L1-a", levelId: "oth-L1", kind: "room", footprint: sq(0), heightM: 4 },
    { id: "L1-gone", levelId: "oth-L1", kind: "room", footprint: sq(20), heightM: 4, deletedAt: "2026-09-28T10:00:00.000Z" },
    { id: "L2-a", levelId: "oth-L2", kind: "room", footprint: sq(0), heightM: 4 },
  ],
  portals: [{ id: "lift_1", kind: "lift" }],
  portalEndpoints: [
    { id: "pe_1", portalId: "lift_1", levelId: "oth-L1", roomId: "L1-a", point: [5, 5] },
    { id: "pe_2", portalId: "lift_1", levelId: "oth-L2", roomId: "L2-a", point: [5, 5] },
  ],
  places: [{ id: "pl_star", nameEn: "Starbucks", category: "retail", levelId: "oth-L1", roomId: "L1-a" }],
});
const on = (entityType: string, entityId: string) => showTarget(model, { entityType, entityId }, "oth-L1");

describe("showTarget", () => {
  it("selects what a change made, while it is still on this floor", () => {
    expect(on("room", "L1-a")).toEqual({ type: "room", id: "L1-a" });
    expect(on("room", "L1-gone")).toBeNull();
    expect(on("room", "L2-a")).toBeNull();
  });

  it("shows a stop at its end on this floor, and a place at the room it is bound to", () => {
    expect(on("portal", "lift_1")).toEqual({ type: "portalEndpoint", id: "pe_1" });
    expect(on("place", "pl_star")).toEqual({ type: "room", id: "L1-a" });
  });

  it("has nothing to show for a draft, or for anything the map doesn't select", () => {
    expect(on("roomDraft", "rd_1")).toBeNull();
    expect(on("objectKind", "ok_bin")).toBeNull();
  });
});

describe("checkSections", () => {
  it("groups in the spec's order, low-confidence objects first, other changes last, and counts the labels apart", () => {
    const { sections, labels } = checkSections([
      change({ auditId: "p", group: "pathways" }),
      change({ auditId: "o1", group: "objects", confidence: "high" }),
      change({ auditId: "o2", group: "objects", confidence: "low" }),
      change({ auditId: "r", group: "rooms" }),
      change({ auditId: "x", group: "other" }),
      change({ auditId: "t", group: "labels" }),
    ]);
    expect(sections.map(s => [s.label, s.rows.map(r => r.auditId)])).toEqual([
      ["Rooms made from drafts", ["r"]],
      ["Objects placed", ["o2", "o1"]],
      ["Pathways", ["p"]],
      ["Other changes", ["x"]],
    ]);
    expect(labels).toBe(1);
  });

  it("puts a group it doesn't know under Other changes", () => {
    const { sections } = checkSections([change({ auditId: "n", group: "navHints" as never })]);
    expect(sections.map(s => s.label)).toEqual(["Other changes"]);
  });
});

describe("undoRefusal", () => {
  it("reads the server's reason from a 409", () => {
    expect(undoRefusal(new ConflictError(null, { reason: "Wei has bound Starbucks to it since." })))
      .toBe("Wei has bound Starbucks to it since");
    expect(undoRefusal(new ConflictError(null, { error: "It has changed since." }))).toBe("It has changed since");
    expect(undoRefusal(new ConflictError(null, null))).toBe("it has changed since Claude made it");
  });

  it("is no refusal when the undo never reached the server, or the server fell over", () => {
    expect(undoRefusal(new TypeError("Failed to fetch"))).toBeNull();
    expect(undoRefusal(new ApiError(500, null))).toBeNull();
  });
});
```

`packages/editor/src/setup/CheckStep.test.tsx`:

```tsx
import { parseModel, type Level } from "@oth/model";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConflictError } from "../api/client";
import { useEditorStore } from "../state/store";
import { useToasts } from "../ui/toast";
import { CheckStep } from "./CheckStep";
import { change, fakeSetupApi } from "./testing";
import type { ClaudeChange } from "./types";

type Measure = (entries: { contentRect: { width: number; height: number } }[]) => void;
let measure: Measure | null = null;

class FakeResizeObserver {
  // The map's box is the only thing observed.
  constructor(cb: Measure) {
    measure ??= cb;
  }
  observe() {}
  unobserve() {}
  disconnect() {}
}

const sq = (x: number): [number, number][] => [[x, 0], [x + 10, 0], [x + 10, 10], [x, 10]];
const frame = (id: string) => ({ id, captureId: "cap_1", imageId: id, widthPx: 640, heightPx: 480 });
const model = parseModel({
  building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
  levels: [{ id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6 }],
  rooms: [{ id: "L1-star", levelId: "oth-L1", kind: "room", footprint: sq(0), heightM: 4, nameEn: "Starbucks" }],
  pathways: [{ id: "pw_1", levelId: "oth-L1", polyline: [[0, 20], [60, 20]], widthM: 3 }],
  captures: [{ id: "cap_1", kind: "video", filename: "l1.mp4", levelId: "oth-L1" }],
  keyframes: [frame("kf_1"), frame("kf_2")],
  places: [{ id: "pl_bin", nameEn: "wastebin", category: "facility", levelId: "oth-L1" }],
  sightings: [
    { id: "s1", placeId: "pl_bin", keyframeId: "kf_1" },
    { id: "s2", placeId: "pl_bin", keyframeId: "kf_2" },
  ],
  objectKinds: [{ id: "ok_bin", nameEn: "wastebin", size: { w: 0.5, d: 0.5, h: 1 } }],
  placements: [
    { id: "pm_1", levelId: "oth-L1", objectKindId: "ok_bin", position: [12, 18, 0], sightingIds: ["s1", "s2"] },
    { id: "pm_2", levelId: "oth-L1", objectKindId: "ok_bin", position: [30, 18, 0], sightingIds: ["s2"] },
  ],
});
const L1 = model.levels[0] as Level;

const made = change({ auditId: "a_room", group: "rooms", summary: "Made Starbucks from a draft", entityType: "room", entityId: "L1-star" });
const rejected = change({ auditId: "a_draft", group: "drafts", summary: "Rejected the draft Column 12", entityType: "roomDraft", entityId: "rd_col", action: "delete" });
const sure = change({ auditId: "a_bin2", group: "objects", summary: "Placed wastebin by Gate 4, from 1 frame", entityType: "placement", entityId: "pm_2", confidence: "high" });
const guess = change({ auditId: "a_bin1", group: "objects", summary: "Placed wastebin near Starbucks, from 2 frames", entityType: "placement", entityId: "pm_1", confidence: "low" });
const path = change({ auditId: "a_path", group: "pathways", summary: "Drew the concourse", entityType: "pathway", entityId: "pw_1" });
const tag = change({ auditId: "a_tag", group: "labels", summary: "Tagged a frame as Starbucks", entityType: "sighting", entityId: "s1" });
const all: ClaudeChange[] = [made, rejected, sure, guess, path, tag];

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  measure = null;
  useToasts.getState().clear();
  const s = useEditorStore.getState();
  s.reset();
  s.setModel(model);
  s.setActiveLevel("oth-L1");
});

function open(api = fakeSetupApi({ listClaudeChanges: vi.fn().mockResolvedValue(all) })) {
  const saver = { refresh: vi.fn().mockResolvedValue(undefined) };
  const onLooksRight = vi.fn();
  render(<CheckStep api={api} saver={saver} level={L1} since="2026-09-28T09:00:00.000Z" onLooksRight={onLooksRight} />);
  act(() => measure?.([{ contentRect: { width: 800, height: 600 } }]));
  return { api, saver, onLooksRight };
}
const withUndo = (undoChange: unknown) => fakeSetupApi({ listClaudeChanges: vi.fn().mockResolvedValue(all), undoChange });
const row = (auditId: string) => within(screen.getByTestId(`change-${auditId}`));
const lastToast = () => useToasts.getState().toasts.at(-1);

describe("CheckStep", () => {
  it("lists Claude's changes since this setup began, in the spec's groups, and leaves the labels to Review", async () => {
    const { api } = open();
    expect(await screen.findByRole("region", { name: "Rooms made from drafts" })).toBeTruthy();
    expect(api.listClaudeChanges).toHaveBeenCalledWith("oth-L1", "2026-09-28T09:00:00.000Z");
    expect(screen.getAllByRole("heading", { level: 2 }).map(h => h.textContent)).toEqual([
      "Rooms made from drafts 1", "Drafts rejected or set aside 1", "Objects placed 2", "Pathways 1",
    ]);
    expect(screen.queryByTestId("change-a_tag")).toBeNull();
    expect(screen.getByText("Claude's 1 survey label isn't listed here: Review is where they're checked.")).toBeTruthy();
  });

  it("puts low-confidence objects first, each with the frames it was placed from", async () => {
    open();
    const objects = within(await screen.findByRole("region", { name: "Objects placed" }));
    expect(objects.getAllByRole("listitem").map(li => li.getAttribute("data-testid"))).toEqual(["change-a_bin1", "change-a_bin2"]);
    expect(row("a_bin1").getByText("Low confidence")).toBeTruthy();
    const thumbs = [...screen.getByTestId("change-a_bin1").querySelectorAll("img")].map(img => img.getAttribute("src"));
    expect(thumbs).toEqual(["/api/keyframes/kf_1/file?w=160", "/api/keyframes/kf_2/file?w=160"]);
  });

  it("Show selects the thing on the map and frames it", async () => {
    open();
    const show = await screen.findByRole("button", { name: "Show: Drew the concourse" });
    const before = useEditorStore.getState().viewport;
    fireEvent.click(show);
    expect(useEditorStore.getState().selection).toEqual({ type: "pathway", id: "pw_1" });
    expect(useEditorStore.getState().viewport).not.toEqual(before);
  });

  it("has no Show for what isn't on the map", async () => {
    open();
    expect(await screen.findByRole("button", { name: "Show: Rejected the draft Column 12" })).toBeDisabled();
  });

  it("Undo takes a change back, says so, and reloads the map", async () => {
    const { api, saver } = open();
    fireEvent.click(await screen.findByRole("button", { name: "Undo: Made Starbucks from a draft" }));
    expect(await row("a_room").findByText("Undone")).toBeTruthy();
    expect(api.undoChange).toHaveBeenCalledWith("a_room");
    expect(saver.refresh).toHaveBeenCalled();
    expect(lastToast()?.message).toBe("Undone: Made Starbucks from a draft.");
    expect(row("a_room").getByRole("button", { name: /^Undo/ })).toBeDisabled();
  });

  it("says why an undo is refused, on its row", async () => {
    open(withUndo(vi.fn().mockRejectedValue(new ConflictError(null, { reason: "Wei has bound Starbucks to it since." }))));
    fireEvent.click(await screen.findByRole("button", { name: "Undo: Made Starbucks from a draft" }));
    expect((await row("a_room").findByRole("alert")).textContent).toBe("Can't undo: Wei has bound Starbucks to it since.");
    expect(useToasts.getState().toasts).toEqual([]);
  });

  it("sends one undo for two quick presses", async () => {
    let answer: () => void = () => {};
    const undoChange = vi.fn(() => new Promise<void>(resolve => {
      answer = resolve;
    }));
    open(withUndo(undoChange));
    const undo = await screen.findByRole("button", { name: "Undo: Drew the concourse" });
    fireEvent.click(undo);
    fireEvent.click(undo);
    expect(undoChange).toHaveBeenCalledTimes(1);
    await act(async () => answer());
  });

  it("offers Retry when an undo doesn't reach the server", async () => {
    open(withUndo(vi.fn().mockRejectedValue(new TypeError("Failed to fetch"))));
    fireEvent.click(await screen.findByRole("button", { name: "Undo: Drew the concourse" }));
    await waitFor(() => expect(lastToast()?.message).toBe("Couldn't undo Claude's change. Check your connection, then retry."));
    expect(lastToast()?.action?.label).toBe("Retry");
  });

  it("Looks right finishes the step, whatever is left in the list", async () => {
    const { onLooksRight } = open();
    fireEvent.click(await screen.findByRole("button", { name: "Looks right" }));
    expect(onLooksRight).toHaveBeenCalled();
  });

  it("says when Claude changed nothing here", async () => {
    open(fakeSetupApi({ listClaudeChanges: vi.fn().mockResolvedValue([]) }));
    expect(await screen.findByText("Nothing from Claude on L1 to check.")).toBeTruthy();
  });

  it("says so when the list can't be loaded, and tries again", async () => {
    const listClaudeChanges = vi.fn().mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValue([made]);
    open(fakeSetupApi({ listClaudeChanges }));
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    expect(await screen.findByTestId("change-a_room")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the tests to verify that they fail**

Run: `bash .superpowers/run-tests.sh vitest packages/editor/src/setup/check.test.ts packages/editor/src/setup/CheckStep.test.tsx`
Expected: FAIL. `./check` and `./CheckStep` do not resolve.

- [ ] **Step 3: The pure half**

`packages/editor/src/setup/check.ts`:

```ts
import { live, type Keyframe, type MapModel } from "@oth/model";
import { ConflictError } from "../api/client";
import { SELECTABLE_TYPES, parseSelectParam, selectParam, type Selectable } from "../build/selection";
import type { Selection } from "../state/store";
import { serverWords } from "../ui/failure";
import { CHECK_GROUPS, type CheckGroup, type ClaudeChange } from "./types";

export type CheckSection = { group: CheckGroup | "other"; label: string; rows: ClaudeChange[] };

export const SECTION_LABEL: Record<CheckGroup | "other", string> = {
  rooms: "Rooms made from drafts",
  drafts: "Drafts rejected or set aside",
  names: "Names or kinds changed",
  stops: "Stops made",
  places: "Places bound",
  objects: "Objects placed",
  pathways: "Pathways",
  entrances: "Entrances",
  other: "Other changes",
};

const KNOWN: ReadonlySet<string> = new Set(CHECK_GROUPS);

/**
 * Claude's changes in spec §8's groups, in its order, empty groups left out.
 * Objects placed from a capture-order guess come first: they are the likeliest
 * to be wrong. Anything without a group goes last, so nothing Claude did here
 * is hidden, except its survey labels: those can run to thousands, and Review
 * is their check. They are counted, for a line saying so.
 */
export function checkSections(changes: readonly ClaudeChange[]): { sections: CheckSection[]; labels: number } {
  const groups: (CheckGroup | "other")[] = [...CHECK_GROUPS, "other"];
  const sections = groups.map(group => {
    let rows = changes.filter(c => (group === "other" ? !KNOWN.has(c.group) && c.group !== "labels" : c.group === group));
    if (group === "objects") rows = [...rows.filter(c => c.confidence === "low"), ...rows.filter(c => c.confidence !== "low")];
    return { group, label: SECTION_LABEL[group], rows };
  });
  return {
    sections: sections.filter(s => s.rows.length > 0),
    labels: changes.filter(c => c.group === "labels").length,
  };
}

/**
 * What Show selects for a change, if it is still on this floor. A stop is
 * shown at its end here, and a place at the room it is bound to. A draft is
 * not on the map, and Show has nothing to select.
 */
export function showTarget(
  model: MapModel | null, change: Pick<ClaudeChange, "entityType" | "entityId">, levelId: string,
): NonNullable<Selection> | null {
  if (!model) return null;
  const { entityType: type, entityId: id } = change;
  let wanted: NonNullable<Selection> | null = null;
  if (type === "place") {
    const roomId = live(model.places).find(p => p.id === id)?.roomId;
    wanted = roomId ? { type: "room", id: roomId } : null;
  } else if (type === "portal") {
    const stop = live(model.portalEndpoints).find(e => e.portalId === id && e.levelId === levelId);
    wanted = stop ? { type: "portalEndpoint", id: stop.id } : null;
  } else if (SELECTABLE_TYPES.has(type)) {
    wanted = { type: type as Selectable, id };
  }
  // Only what is still there, on this floor.
  return wanted ? parseSelectParam(selectParam(wanted), model, levelId) : null;
}

/** Up to three frames an object was placed from, shown beside it (spec §8). */
export function objectFrames(model: MapModel | null, change: Pick<ClaudeChange, "entityType" | "entityId">): Keyframe[] {
  if (!model || change.entityType !== "placement") return [];
  // Undone, the placement is deleted; its frames still say what it was.
  const placement = model.placements.find(p => p.id === change.entityId);
  if (!placement) return [];
  const sightings = new Map(model.sightings.map(s => [s.id, s]));
  const frames = new Map(live(model.keyframes).map(k => [k.id, k]));
  const out: Keyframe[] = [];
  for (const id of placement.sightingIds) {
    const frame = frames.get(sightings.get(id)?.keyframeId ?? "");
    if (frame && !out.includes(frame)) out.push(frame);
  }
  return out.slice(0, 3);
}

/**
 * Why an undo was refused, in the server's words, without a closing full
 * stop; null when it wasn't a refusal. A 409 is a refusal: something since
 * depends on the change (spec §8). Anything else is a failure to report.
 */
export function undoRefusal(err: unknown): string | null {
  if (!(err instanceof ConflictError)) return null;
  const reason = (err.body as { reason?: unknown } | null)?.reason;
  if (typeof reason === "string" && reason.trim() !== "") return reason.trim().replace(/\.$/, "");
  return serverWords(err) ?? "it has changed since Claude made it";
}
```

- [ ] **Step 4: The screen**

`packages/editor/src/setup/CheckStep.tsx`:

```tsx
import type { Level, MapModel } from "@oth/model";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isUnauthorized, type Api } from "../api/client";
import type { Saver } from "../state/save";
import { useEditorStore } from "../state/store";
import { Button } from "../ui/Button";
import { reportFailure } from "../ui/failure";
import { relativeTime } from "../ui/relativeTime";
import { toast } from "../ui/toast";
import { checkSections, objectFrames, showTarget, undoRefusal } from "./check";
import { EPOCH } from "./progress";
import { SetupMap, type MapFocus } from "./SetupMap";
import type { ClaudeChange, SetupApi } from "./types";

/** Frame thumbnails are 64 px wide; 160 covers a 2x screen. */
const THUMB_PX = 160;

type CheckApi = Pick<Api, "keyframeFileUrl" | "levelImageFileUrl"> & Pick<SetupApi, "listClaudeChanges" | "undoChange">;

/**
 * Step 8 (spec §8): everything Claude changed on the floor in this run, in
 * groups, with the map beside it. Show selects a change on the map, and Undo
 * takes it back, or says why it can't. Looks right finishes the step; what is
 * left in the list stays on the map.
 */
export function CheckStep({ api, saver, level, since, onLooksRight }: {
  api: CheckApi;
  saver: Pick<Saver, "refresh">;
  level: Level;
  since: string;
  onLooksRight: () => void;
}) {
  const model = useEditorStore(s => s.model);
  const [changes, setChanges] = useState<ClaudeChange[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [undone, setUndone] = useState<ReadonlySet<string>>(new Set());
  const [refused, setRefused] = useState<ReadonlyMap<string, string>>(new Map());
  // Undos under way. A ref, so a second press that lands before the redraw is still turned away.
  const undoing = useRef(new Set<string>());
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());
  const [focus, setFocus] = useState<MapFocus | null>(null);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      setChanges(await api.listClaudeChanges(level.id, since));
    } catch (err) {
      if (!isUnauthorized(err)) setFailed(true);
    }
  }, [api, level.id, since]);

  useEffect(() => {
    void load();
  }, [load]);

  const { sections, labels } = useMemo(() => checkSections(changes ?? []), [changes]);

  function show(change: ClaudeChange): void {
    const target = showTarget(useEditorStore.getState().model, change, level.id);
    if (!target) return;
    useEditorStore.getState().select(target);
    setFocus(f => ({ target, seq: (f?.seq ?? 0) + 1 }));
  }

  async function undo(change: ClaudeChange): Promise<void> {
    const id = change.auditId;
    if (undoing.current.has(id)) return;
    undoing.current.add(id);
    setBusy(new Set(undoing.current));
    try {
      await api.undoChange(id);
      setUndone(s => new Set(s).add(id));
      setRefused(m => {
        const next = new Map(m);
        next.delete(id);
        return next;
      });
      toast({ tone: "success", message: `Undone: ${change.summary.replace(/\.$/, "")}.` });
      // The undo landed; only the reload after it can fail here, and its Retry is the reload.
      await saver.refresh().catch(err => reportFailure(err, {
        doing: "reload the map after the undo",
        retry: async () => {
          await saver.refresh().catch(() => {});
        },
      }));
    } catch (err) {
      const why = undoRefusal(err);
      if (why) setRefused(m => new Map(m).set(id, why));
      else reportFailure(err, { doing: "undo Claude's change", retry: () => undo(change) });
    } finally {
      undoing.current.delete(id);
      setBusy(new Set(undoing.current));
    }
  }

  return (
    <div className="flex h-full min-h-0">
      <section aria-label="Claude's changes" className="flex w-[28rem] shrink-0 flex-col border-r border-stone-200 bg-white">
        <header className="space-y-1 border-b border-stone-200 p-4">
          <h1 className="text-lg font-semibold">Check Claude's work</h1>
          <p className="text-sm text-stone-600">
            {since === EPOCH
              ? `Everything Claude has changed on ${level.code}.`
              : `Everything Claude changed on ${level.code} since this setup began, ${relativeTime(since)}.`}{" "}
            Show finds it on the map. Undo takes it back.
          </p>
        </header>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
          {failed && (
            <div role="alert" className="space-y-2 text-sm text-danger">
              <p>Couldn't load Claude's changes. Check your connection, then try again.</p>
              <Button size="sm" onClick={() => void load()}>Try again</Button>
            </div>
          )}
          {!failed && changes === null && <p className="text-sm text-stone-500">Loading Claude's changes…</p>}
          {changes !== null && sections.length === 0 && (
            <p className="text-sm text-stone-600">Nothing from Claude on {level.code} to check.</p>
          )}
          {sections.map(section => (
            <section key={section.group} aria-label={section.label}>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                {section.label} <span className="font-normal">{section.rows.length}</span>
              </h2>
              <ul className="mt-1 divide-y divide-stone-100">
                {section.rows.map(change => (
                  <ChangeRow
                    key={change.auditId}
                    api={api}
                    model={model}
                    levelId={level.id}
                    change={change}
                    undone={undone.has(change.auditId) || change.undone === true}
                    refusal={refused.get(change.auditId) ?? null}
                    busy={busy.has(change.auditId)}
                    onShow={() => show(change)}
                    onUndo={() => void undo(change)}
                  />
                ))}
              </ul>
            </section>
          ))}
          {labels > 0 && (
            <p className="text-xs text-stone-600">
              {labels === 1 ? "Claude's 1 survey label isn't listed here" : `Claude's ${labels} survey labels aren't listed here`}
              : Review is where they're checked.
            </p>
          )}
        </div>
        <footer className="space-y-1 border-t border-stone-200 p-4">
          <Button variant="primary" onClick={onLooksRight}>Looks right</Button>
          <p className="text-xs text-stone-600">Anything still in the list stays on the map.</p>
        </footer>
      </section>
      <SetupMap api={api} focus={focus} />
    </div>
  );
}

function ChangeRow({ api, model, levelId, change, undone, refusal, busy, onShow, onUndo }: {
  api: Pick<Api, "keyframeFileUrl">;
  model: MapModel | null;
  levelId: string;
  change: ClaudeChange;
  undone: boolean;
  refusal: string | null;
  busy: boolean;
  onShow: () => void;
  onUndo: () => void;
}) {
  const target = showTarget(model, change, levelId);
  const frames = objectFrames(model, change);
  return (
    <li data-testid={`change-${change.auditId}`} className="flex items-start gap-2 py-2">
      {frames.length > 0 && (
        <div className="flex shrink-0 gap-1">
          {frames.map(f => (
            <img key={f.id} src={api.keyframeFileUrl(f.id, THUMB_PX)} alt="" className="h-12 w-16 rounded object-cover" />
          ))}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className={`text-sm ${undone ? "text-stone-500 line-through" : "text-stone-900"}`}>{change.summary}</p>
        <p className="flex flex-wrap items-center gap-2 text-xs text-stone-500">
          {change.confidence === "low" && (
            <span className="rounded-full border border-yours px-1.5 text-yours">Low confidence</span>
          )}
          {undone && <span className="font-medium text-stone-700">Undone</span>}
          <span>{relativeTime(change.at)}</span>
        </p>
        {refusal && <p role="alert" className="text-xs text-danger">Can't undo: {refusal}.</p>}
      </div>
      <div className="flex shrink-0 gap-1">
        <Button size="sm" variant="ghost" disabled={!target} onClick={onShow}>
          Show<span className="sr-only">: {change.summary}</span>
        </Button>
        <Button size="sm" disabled={undone || busy} onClick={onUndo}>
          Undo<span className="sr-only">: {change.summary}</span>
        </Button>
      </div>
    </li>
  );
}
```

The labels line is written across two JSX lines. Keep the `: Review is where they're checked.` text directly after the expression, with no space before the colon: the test reads the whole sentence.

- [ ] **Step 5: Run the tests and typecheck**

Run: `bash .superpowers/run-tests.sh vitest packages/editor/src/setup/check.test.ts packages/editor/src/setup/CheckStep.test.tsx`
Expected: PASS.

Run: `bash .superpowers/run-tests.sh tsc packages/editor`
Expected: no errors. If `placement.sightingIds` is unknown, 6A's model task hasn't merged: stop, and tell the controller.

- [ ] **Step 6: Commit**

```bash
git add -- packages/editor/src/setup/check.ts packages/editor/src/setup/check.test.ts packages/editor/src/setup/CheckStep.tsx packages/editor/src/setup/CheckStep.test.tsx
git commit --only -m "feat(editor): check Claude's work: every change in the spec's groups, with Show and Undo

Step 8 lists what Claude changed on the floor in this run, grouped as spec §8
has it, with low-confidence objects first and their frames beside them.
Show selects the thing on the map beside the list. Undo takes it back, or
says on the row why it can't. Claude's survey labels are left to Review.
Looks right finishes the step.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- packages/editor/src/setup/check.ts packages/editor/src/setup/check.test.ts packages/editor/src/setup/CheckStep.tsx packages/editor/src/setup/CheckStep.test.tsx
```

---

### Task 7: The wizard, the step bar, and the route mounted

**Waits for:** 6C's four client methods, for `tsc` (`setupApi.ts`) and for a real browser. The tests pass without them.

**Files:**
- Create: `packages/editor/src/setup/setupApi.ts`
- Create: `packages/editor/src/setup/SetupWizard.tsx`
- Create: `packages/editor/src/setup/SetupWizard.test.tsx`
- Create: `packages/editor/src/setup/SetupStepBar.tsx`
- Modify: `packages/editor/src/shell/Header.tsx`
- Modify: `packages/editor/src/shell/Header.test.tsx` (one test)
- Modify: `packages/editor/src/shell/Workspace.tsx`
- Modify: `packages/editor/src/shell/Workspace.test.tsx` (one test)

**Interfaces:**
- Consumes: everything in Tasks 1–6; `ReviewWorkspace` from `../review/ReviewWorkspace`; `useRoomDrafts` from `../build/drafts`; `createSaver`; `findLevel`.
- Produces:
  - `asSetupApi(api: Api): Api & SetupApi`;
  - `SetupWizard({ api, route }: { api: Api & SetupApi; route: SetupRoute })`;
  - `SetupStepBar({ level, current }: { level: Level; current: number | undefined })`;
  - the Header shows the step bar on a setup route, and the Workspace mounts the wizard there.

- [ ] **Step 1: Write the failing tests**

`packages/editor/src/setup/SetupWizard.test.tsx`:

```tsx
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Api } from "../api/client";
import { useDrafts } from "../build/drafts";
import { useCurrentRoute } from "../route";
import { useEditorStore } from "../state/store";
import { sampleModel, sampleTeam } from "../testing/fakeApi";
import { useToasts } from "../ui/toast";
import { SetupWizard } from "./SetupWizard";
import { useSetupStore } from "./sync";
import { fakeSetupApi, setupState } from "./testing";
import type { SetupApi } from "./types";

const me = { id: "u_sc", email: "sc@oth.local", displayName: "Stef Chan" };

function Hosted({ api }: { api: Api & SetupApi }) {
  const route = useCurrentRoute();
  return route.name === "setup" ? <SetupWizard api={api} route={route} /> : null;
}

function at(path: string, api = fakeSetupApi()) {
  window.history.pushState({}, "", path);
  render(<Hosted api={api} />);
  return api;
}

const bar = () => within(screen.getByRole("region", { name: "Setup controls" }));

beforeEach(() => {
  useSetupStore.getState().reset();
  useDrafts.getState().reset();
  useToasts.getState().clear();
  const s = useEditorStore.getState();
  s.reset();
  s.setUser(me);
  s.setModel(sampleModel);
  s.setTeam(sampleTeam);
});

describe("SetupWizard", () => {
  it("opens on the first step not done, and writes it into the address", async () => {
    // sampleModel: L2 has no footage.
    at("/floors/L2/setup");
    await waitFor(() => expect(window.location.pathname).toBe("/floors/L2/setup/1"));
    expect(await screen.findByRole("heading", { name: "Add footage" })).toBeTruthy();
  });

  it("on a floor with footage, opens on Claude's labels, and stores Add footage done then, once", async () => {
    const api = at("/floors/L1/setup");
    await waitFor(() => expect(window.location.pathname).toBe("/floors/L1/setup/2"));
    await waitFor(() => expect(api.setSetupStep).toHaveBeenCalledWith("oth-L1", "footage", { status: "done" }));
    await act(async () => {});
    expect(api.setSetupStep).toHaveBeenCalledTimes(1);
  });

  it("opens the first step not done for a step that isn't one of the nine", async () => {
    at("/floors/l2/setup/12");
    await waitFor(() => expect(window.location.pathname).toBe("/floors/L2/setup/1"));
  });

  it("moves a step at a time, and warns but never blocks when a step isn't done", async () => {
    at("/floors/L2/setup/1");
    expect(await screen.findByRole("heading", { name: "Add footage" })).toBeTruthy();
    expect(bar().getByRole("status").textContent).toBe("! No footage is filed under L2 yet.");
    expect(bar().getByRole("button", { name: "Back" })).toBeDisabled();
    fireEvent.click(bar().getByRole("button", { name: "Next" }));
    expect(window.location.pathname).toBe("/floors/L2/setup/2");
    fireEvent.click(bar().getByRole("button", { name: "Back" }));
    expect(window.location.pathname).toBe("/floors/L2/setup/1");
    fireEvent.click(bar().getByRole("button", { name: "Leave setup" }));
    expect(window.location.pathname).toBe("/floors");
  });

  it("gives a Claude step its command", async () => {
    at("/floors/L1/setup/5");
    expect((await screen.findByLabelText("Command for Claude Code")).textContent).toBe("/mcp__oth__map_rooms L1");
  });

  it("records who marked a step done", async () => {
    let labelDone = false;
    const getSetup = vi.fn(async () => setupState(labelDone
      ? { label: { status: "done", finishedBy: "u_sc", finishedVia: null, finishedAt: new Date().toISOString() } }
      : {}));
    const setSetupStep = vi.fn(async (_levelId: string, step: string) => {
      if (step === "label") labelDone = true;
      return {};
    });
    at("/floors/L1/setup/2", fakeSetupApi({ getSetup, setSetupStep }));
    fireEvent.click(await screen.findByRole("button", { name: "Mark done" }));
    expect(await bar().findByText("Done by Stef Chan, just now")).toBeTruthy();
    expect(setSetupStep).toHaveBeenCalledWith("oth-L1", "label", { status: "done" });
  });

  it("shows the floor's Review queue at step 3, and Skip skips it", async () => {
    const api = at("/floors/L1/setup/3");
    expect(await screen.findByDisplayValue("Festive Mall")).toBeTruthy();
    fireEvent.click(bar().getByRole("button", { name: "Skip" }));
    await waitFor(() => expect(api.setSetupStep).toHaveBeenCalledWith("oth-L1", "review", { status: "skipped" }));
  });

  it("goes on to Finish once Claude's work looks right", async () => {
    const api = at("/floors/L1/setup/8");
    fireEvent.click(await screen.findByRole("button", { name: "Looks right" }));
    await waitFor(() => expect(window.location.pathname).toBe("/floors/L1/setup/9"));
    expect(api.setSetupStep).toHaveBeenCalledWith("oth-L1", "check", { status: "done" });
  });

  it("hands the floor to Build at Finish", async () => {
    const api = at("/floors/L1/setup/9");
    fireEvent.click(await screen.findByRole("button", { name: "Finish setup and open Build" }));
    await waitFor(() => expect(window.location.pathname).toBe("/floors/L1/build"));
    expect(api.setSetupStep).toHaveBeenCalledWith("oth-L1", "finish", { status: "done" });
  });

  it("stays on the step and says so when it can't be stored", async () => {
    at("/floors/L1/setup/8", fakeSetupApi({ setSetupStep: vi.fn().mockRejectedValue(new TypeError("Failed to fetch")) }));
    fireEvent.click(await screen.findByRole("button", { name: "Looks right" }));
    await waitFor(() => expect(useToasts.getState().toasts.at(-1)?.message)
      .toBe("Couldn't mark the step done. Check your connection, then retry."));
    expect(window.location.pathname).toBe("/floors/L1/setup/8");
  });

  it("still opens a step when the floor's setup can't be loaded", async () => {
    at("/floors/L2/setup", fakeSetupApi({ getSetup: vi.fn().mockRejectedValue(new TypeError("Failed to fetch")) }));
    await waitFor(() => expect(window.location.pathname).toBe("/floors/L2/setup/1"));
    expect(await screen.findByRole("heading", { name: "Add footage" })).toBeTruthy();
  });

  it("sends a floor that doesn't exist to the floors, and says so", async () => {
    at("/floors/L9/setup");
    await waitFor(() => expect(window.location.pathname).toBe("/floors"));
    expect(useToasts.getState().toasts.some(t => t.message === "There is no floor L9. Pick one from the floors.")).toBe(true);
  });
});
```

Add to `packages/editor/src/shell/Header.test.tsx`, inside `describe("Header", …)`:

```tsx
  it("shows the setup's nine steps in place of the tabs, each a link, the current one marked", () => {
    const api = fakeApi();
    render(<Header api={api} saver={createSaver(api)} route={{ name: "setup", code: "L1", step: 2, params: {} }} />);
    expect(screen.queryByRole("navigation", { name: "Workspace" })).toBeNull();
    const steps = within(screen.getByRole("navigation", { name: "Setup steps" }));
    expect(steps.getAllByRole("link")).toHaveLength(9);
    // L1 has footage, so its first step ticks itself.
    expect(steps.getByRole("link", { name: "Step 1: Add footage, done" }).getAttribute("href")).toBe("/floors/L1/setup/1");
    expect(steps.getByRole("link", { name: "Step 2: Label the survey" }).getAttribute("aria-current")).toBe("step");
    expect(steps.getByRole("link", { name: "Step 9: Finish" }).getAttribute("href")).toBe("/floors/L1/setup/9");
  });
```

Add to `packages/editor/src/shell/Workspace.test.tsx`, inside `describe("Workspace", …)`. Add `import { fakeSetupApi } from "../setup/testing";` and `import { useSetupStore } from "../setup/sync";` to its imports:

```tsx
  it("opens a floor's setup on its first step not done, with the steps in place of the tabs", async () => {
    useSetupStore.getState().reset();
    window.history.pushState({}, "", "/floors/L2/setup");
    render(<Workspace api={fakeSetupApi()} />);
    await waitFor(() => expect(window.location.pathname).toBe("/floors/L2/setup/1"));
    expect(await screen.findByRole("heading", { name: "Add footage" })).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "Setup steps" })).toBeTruthy();
    expect(screen.queryByRole("navigation", { name: "Workspace" })).toBeNull();
  });
```

- [ ] **Step 2: Run the tests to verify that they fail**

Run: `bash .superpowers/run-tests.sh vitest packages/editor/src/setup/SetupWizard.test.tsx packages/editor/src/shell`
Expected: FAIL. `./SetupWizard` does not resolve, and the Header and Workspace have no setup steps.

- [ ] **Step 3: The one line that needs 6C**

`packages/editor/src/setup/setupApi.ts`:

```ts
import type { Api } from "../api/client";
import type { SetupApi } from "./types";

/**
 * The real client as the wizard's API. Plan 6C adds the four setup calls to
 * `createApi` (interfaces.md). Returning `api` here is the check: until those
 * calls land, this is the one line in the editor that fails to compile; once
 * they have, a call whose shape drifts from `SetupApi` fails here, not at run
 * time.
 */
export function asSetupApi(api: Api): Api & SetupApi {
  return api;
}
```

- [ ] **Step 4: The step bar**

`packages/editor/src/setup/SetupStepBar.tsx`:

```tsx
import type { Level } from "@oth/model";
import { followLink, href } from "../route";
import { stepDone, storedState } from "./progress";
import { WIZARD_STEPS } from "./steps";
import { useStepContext } from "./sync";

/**
 * The setup's nine steps, in the header in place of the floor's tabs (spec
 * §4.2): numbered, the current one named and marked, a tick on each done, and
 * every one a link. Below 1536 px the others show their numbers only, so the
 * row fits beside Claude Code and Publish. A screen reader hears each in full.
 */
export function SetupStepBar({ level, current }: { level: Level; current: number | undefined }) {
  const ctx = useStepContext(level);
  return (
    <nav aria-label="Setup steps" className="min-w-0">
      <ol className="flex items-center gap-0.5">
        {WIZARD_STEPS.map((step, i) => {
          const n = i + 1;
          const to = href({ name: "setup", code: level.code, step: n, params: {} });
          const here = n === current;
          const skipped = storedState(ctx?.setup ?? null, step.id)?.status === "skipped";
          const done = !skipped && ctx !== null && stepDone(step.id, ctx);
          return (
            <li key={step.id}>
              <a
                href={to}
                onClick={followLink(to)}
                aria-current={here ? "step" : undefined}
                title={step.title}
                className={`flex items-center gap-1 whitespace-nowrap rounded px-2 py-1 text-sm ${
                  here ? "bg-stone-900 font-medium text-white" : "text-stone-600 hover:bg-stone-100"
                }`}
              >
                <span aria-hidden className="tabular-nums">{n}</span>
                <span aria-hidden className={here ? "" : "hidden 2xl:inline"}>{step.short}</span>
                {done && <span aria-hidden>✓</span>}
                {skipped && <span aria-hidden>–</span>}
                <span className="sr-only">{`Step ${n}: ${step.title}${done ? ", done" : skipped ? ", skipped" : ""}`}</span>
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
```

- [ ] **Step 5: The wizard and its bottom bar**

`packages/editor/src/setup/SetupWizard.tsx`:

```tsx
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import type { Api } from "../api/client";
import { useRoomDrafts } from "../build/drafts";
import { findLevel } from "../flow/floors";
import { ReviewWorkspace } from "../review/ReviewWorkspace";
import { href, navigate, type SetupRoute } from "../route";
import { createSaver } from "../state/save";
import { useEditorStore } from "../state/store";
import { Button } from "../ui/Button";
import { reportFailure } from "../ui/failure";
import { toast } from "../ui/toast";
import { CheckStep } from "./CheckStep";
import { ClaudeStep } from "./ClaudeStep";
import { FinishStep } from "./FinishStep";
import { FloorplanStep } from "./FloorplanStep";
import { FootageStep } from "./FootageStep";
import {
  autoDone, doneLine, firstOpenStep, notDoneLine, sinceParam, stepDone, storedState, type StepContext,
} from "./progress";
import { STEP_COUNT, stepAt, stepNumber, wizardStep } from "./steps";
import { loadSetup, useSetupStore, useStepContext } from "./sync";
import type { SetupApi, SetupStepId } from "./types";

/**
 * One floor's setup (spec §4): the step the address names, as its real tool,
 * above a bar to move on. Progress is the server's, so anyone can carry on
 * where a teammate left off. Next is never refused: the bar says in one line
 * what a step still lacks, and you decide.
 *
 * It saves through a saver that skips validation, as Survey and Review do:
 * nothing here shows the report, and Build checks again as it opens.
 */
export function SetupWizard({ api, route }: { api: Api & SetupApi; route: SetupRoute }) {
  const model = useEditorStore(s => s.model);
  const activeLevelId = useEditorStore(s => s.activeLevelId);
  const setActiveLevel = useEditorStore(s => s.setActiveLevel);
  const saver = useMemo(() => createSaver(api, { validate: false }), [api]);
  const level = findLevel(model, route.code);
  const levelId = level?.id ?? null;
  const ctx = useStepContext(level);
  const loaded = useSetupStore(s => (levelId ? levelId in s.byLevel || s.failed[levelId] === true : false));
  const stepId = stepAt(route.step);
  // The floor's drafts: the Floorplan step's tick reads them, and its Find rooms replaces them.
  useRoomDrafts(api, levelId);

  useEffect(() => {
    if (level && level.id !== activeLevelId) setActiveLevel(level.id);
  }, [level, activeLevelId, setActiveLevel]);

  useEffect(() => {
    if (!model || level) return;
    toast({ tone: "error", message: `There is no floor ${route.code}. Pick one from the floors.` });
    navigate("/floors", { replace: true });
  }, [model, level, route.code]);

  // The floor's setup, fresh at every step, so its ticks and Claude's notes are.
  useEffect(() => {
    if (levelId) void loadSetup(api, levelId);
  }, [api, levelId, route.step]);

  // No step in the address, or none of the nine: the first not done, written in.
  // A setup that can't be loaded still gets one, worked out from the map.
  useEffect(() => {
    if (!ctx || stepId || !loaded) return;
    navigate(href({ name: "setup", code: ctx.levelCode, step: firstOpenStep(ctx), params: {} }), { replace: true });
  }, [ctx, stepId, loaded]);

  // Past Add footage, with footage filed and the step not stored yet: store it
  // now. That moment is when this run's step 2 began, which the check lists
  // Claude's changes from (spec §8). Once a visit; tried again if it failed.
  const stamped = useRef<string | null>(null);
  const stamp = ctx !== null && stepId !== null && stepId !== "footage" && autoDone("footage", ctx)
    && storedState(ctx.setup, "footage")?.status === "open";
  useEffect(() => {
    if (!stamp || !levelId || stamped.current === levelId) return;
    stamped.current = levelId;
    api.setSetupStep(levelId, "footage", { status: "done" })
      .then(() => loadSetup(api, levelId))
      .catch(() => {
        stamped.current = null;
      });
  }, [stamp, api, levelId]);

  if (!model || !level || !ctx || activeLevelId !== level.id) {
    return <p className="p-8 text-sm text-stone-500">Loading the floor…</p>;
  }
  if (!stepId) return <p className="p-8 text-sm text-stone-500">Loading the setup…</p>;

  const go = (n: number) => navigate(href({ name: "setup", code: level.code, step: n, params: {} }));

  /** Stores a step as done or skipped, then reloads the setup. False, and said, when it didn't land. */
  const store = async (step: SetupStepId, status: "done" | "skipped"): Promise<boolean> => {
    try {
      await api.setSetupStep(level.id, step, { status });
    } catch (err) {
      reportFailure(err, {
        doing: status === "skipped" ? "skip the step" : "mark the step done",
        retry: async () => {
          await store(step, status);
        },
      });
      return false;
    }
    await loadSetup(api, level.id);
    return true;
  };

  const body = (): ReactNode => {
    switch (stepId) {
      case "footage":
        return <FootageStep api={api} saver={saver} level={level} />;
      case "review":
        return <ReviewWorkspace api={api} saver={saver} level={level} params={route.params} />;
      case "floorplan":
        return <FloorplanStep api={api} level={level} />;
      case "check":
        return (
          <CheckStep
            api={api}
            saver={saver}
            level={level}
            since={sinceParam(ctx.setup)}
            onLooksRight={() => void store("check", "done").then(ok => {
              if (ok) go(stepNumber("finish"));
            })}
          />
        );
      case "finish":
        return (
          <FinishStep
            api={api}
            level={level}
            state={storedState(ctx.setup, "finish")}
            onFinish={() => void store("finish", "done").then(ok => {
              if (ok) navigate(href({ name: "floor", code: level.code, tab: "build", params: {} }));
            })}
          />
        );
      default:
        // Keyed, so each Claude step's poll and lists start afresh.
        return <ClaudeStep key={stepId} api={api} saver={saver} level={level} stepId={stepId} />;
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-auto">{body()}</div>
      <BottomBar
        ctx={ctx}
        stepId={stepId}
        onBack={() => go(stepNumber(stepId) - 1)}
        onNext={() => go(stepNumber(stepId) + 1)}
        onLeave={() => navigate("/floors")}
        onMark={() => void store(stepId, "done")}
        onSkip={() => void store(stepId, "skipped")}
      />
    </div>
  );
}

/**
 * Back, where you are, whether it is done, the one-line warning, Leave setup
 * and Next. Check and Finish have their own buttons, Looks right and Finish
 * setup, so they get no Mark done; only Review can be skipped.
 */
function BottomBar({ ctx, stepId, onBack, onNext, onLeave, onMark, onSkip }: {
  ctx: StepContext;
  stepId: SetupStepId;
  onBack: () => void;
  onNext: () => void;
  onLeave: () => void;
  onMark: () => void;
  onSkip: () => void;
}) {
  const team = useEditorStore(s => s.team);
  const n = stepNumber(stepId);
  const stored = doneLine(storedState(ctx.setup, stepId), team);
  const done = stepDone(stepId, ctx);
  const warning = notDoneLine(stepId, ctx);
  const ownButton = stepId === "check" || stepId === "finish";

  return (
    <section aria-label="Setup controls" className="flex shrink-0 items-center gap-3 border-t border-stone-200 bg-white px-4 py-2">
      <Button size="sm" disabled={n === 1} onClick={onBack}>Back</Button>
      <span className="shrink-0 text-sm font-medium">Step {n} of {STEP_COUNT}: {wizardStep(stepId).title}</span>
      {stored ? (
        <span className="shrink-0 text-xs text-stone-600"><span aria-hidden>✓ </span>{stored}</span>
      ) : done ? (
        <span className="shrink-0 text-xs text-stone-600"><span aria-hidden>✓ </span>Done</span>
      ) : !ownButton && (
        <>
          <Button size="sm" variant="ghost" onClick={onMark}>Mark done</Button>
          {stepId === "review" && <Button size="sm" variant="ghost" onClick={onSkip}>Skip</Button>}
        </>
      )}
      {warning && (
        <p role="status" className="min-w-0 truncate text-xs text-yours">
          <span aria-hidden className="font-semibold">! </span>
          {warning}
        </p>
      )}
      <div className="ml-auto flex shrink-0 items-center gap-2">
        <Button size="sm" variant="ghost" onClick={onLeave}>Leave setup</Button>
        {n < STEP_COUNT && <Button size="sm" variant="primary" onClick={onNext}>Next</Button>}
      </div>
    </section>
  );
}
```

- [ ] **Step 6: The header and the workspace**

In `packages/editor/src/shell/Header.tsx`:

- Add `import { SetupStepBar } from "../setup/SetupStepBar";`.
- Replace `const level = route.name === "floor" ? findLevel(model, route.code) : null;` with:

```tsx
  const level = route.name === "floor" || route.name === "setup" ? findLevel(model, route.code) : null;
```

- After the `{route.name === "floor" && level && ( … )}` block, add:

```tsx
      {/* Setting a floor up, its nine steps stand where its tabs do (spec §4.2). */}
      {route.name === "setup" && level && (
        <>
          <span className="shrink-0 text-sm text-stone-600">
            Setting up <span className="text-base font-bold text-stone-900">{level.code}</span>
          </span>
          <SetupStepBar level={level} current={route.step} />
        </>
      )}
```

In `packages/editor/src/shell/Workspace.tsx`:

- Add `import { SetupWizard } from "../setup/SetupWizard";` and `import { asSetupApi } from "../setup/setupApi";`.
- After the `{route.name === "floor" && …}` line, add:

```tsx
      {route.name === "setup" && <SetupWizard api={asSetupApi(api)} route={route} />}
```

- [ ] **Step 7: Run the tests and typecheck**

Run: `bash .superpowers/run-tests.sh vitest packages/editor/src/setup packages/editor/src/shell packages/editor/src/route.test.tsx`
Expected: PASS. Every existing Header and Workspace test still passes.

Run: `bash .superpowers/run-tests.sh tsc packages/editor`
Expected, once 6C's client methods have merged: no errors. Before then: errors in `setup/setupApi.ts` only, naming `getSetup`, `setSetupStep`, `listClaudeChanges` or `undoChange`. Any error elsewhere is this task's to fix.

- [ ] **Step 8: Commit**

```bash
git add -- packages/editor/src/setup/setupApi.ts packages/editor/src/setup/SetupWizard.tsx packages/editor/src/setup/SetupWizard.test.tsx packages/editor/src/setup/SetupStepBar.tsx
git commit --only -m "feat(editor): the floor setup wizard, at /floors/L1/setup

The step the address names, as its real tool, above Back, Next and Leave
setup. Next never blocks; the bar says in one line what a step still lacks.
Mark done records your name, Review can be skipped, Looks right goes on to
Finish, and Finish hands the floor to Build. With no step in the address it
opens the first not done. Past Add footage it stores that step, whose time
is when the check starts listing Claude's changes. The header shows the nine
steps where the floor's tabs were, each with its tick.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- packages/editor/src/setup/setupApi.ts packages/editor/src/setup/SetupWizard.tsx packages/editor/src/setup/SetupWizard.test.tsx packages/editor/src/setup/SetupStepBar.tsx packages/editor/src/shell/Header.tsx packages/editor/src/shell/Header.test.tsx packages/editor/src/shell/Workspace.tsx packages/editor/src/shell/Workspace.test.tsx
```

---

### Task 8: The Floors home card's way in

**Waits for:** Task 7 (`asSetupApi`). **Real browser:** needs 6C's routes merged.

**Files:**
- Modify: `packages/editor/src/home/FloorsHome.tsx`
- Modify: `packages/editor/src/home/FloorCard.tsx`
- Modify: `packages/editor/src/home/FloorsHome.test.tsx` (one `describe` block)

**Interfaces:**
- Consumes:
  - `cardLink`, `SetupLink` from `../setup/progress` (Task 1);
  - `SETUP_STEP_IDS` from `../setup/types` (Task 1);
  - `loadSetup`, `useSetupStore` from `../setup/sync` (Task 2);
  - `asSetupApi` from `../setup/setupApi` (Task 7);
  - `navigate` from `../route`;
  - `reportFailure` from `../ui/failure`.
- Produces: `FloorCard` gains the props `setup: SetupLink` and `onRestart: () => void`.

- [ ] **Step 1: Write the failing tests**

Add to `packages/editor/src/home/FloorsHome.test.tsx`, at the end of the file. Add these to its imports: `import { useSetupStore } from "../setup/sync";`, `import { fakeSetupApi, setupState } from "../setup/testing";` and `import { useToasts } from "../ui/toast";`.

```tsx
describe("FloorsHome — setting a floor up", () => {
  beforeEach(() => {
    useSetupStore.getState().reset();
    useToasts.getState().clear();
  });

  it("offers to set up a floor nobody has started", async () => {
    const api = fakeSetupApi();
    render(<FloorsHome api={api} saver={fakeSaver()} />);
    await waitFor(() => expect(api.getSetup).toHaveBeenCalledTimes(2));
    const [l1] = screen.getAllByRole("article");
    expect(within(l1!).getByRole("link", { name: "Set up L1" }).getAttribute("href")).toBe("/floors/L1/setup");
  });

  it("continues a started setup at its first step not done", async () => {
    const getSetup = vi.fn(async (levelId: string) => (levelId === "oth-L1"
      ? setupState({ footage: { status: "done", finishedAt: "2026-09-28T09:00:00.000Z" }, label: { status: "done" } })
      : setupState()));
    render(<FloorsHome api={fakeSetupApi({ getSetup })} saver={fakeSaver()} />);
    const [l1, l2] = screen.getAllByRole("article");
    // L1's one proposal still waits in Review: step 3.
    const go = await within(l1!).findByRole("link", { name: "Continue: step 3 of 9" });
    expect(go.getAttribute("href")).toBe("/floors/L1/setup/3");
    expect(within(l2!).getByRole("link", { name: "Set up L2" })).toBeTruthy();
  });

  it("starts a finished floor again: every step open, then step 1", async () => {
    const setSetupStep = vi.fn().mockResolvedValue({});
    const getSetup = vi.fn().mockResolvedValue(setupState({ finish: { status: "done" } }));
    render(<FloorsHome api={fakeSetupApi({ getSetup, setSetupStep })} saver={fakeSaver()} />);
    const [l1] = screen.getAllByRole("article");
    fireEvent.click(await within(l1!).findByRole("button", { name: "Set up again" }));
    await waitFor(() => expect(window.location.pathname).toBe("/floors/L1/setup/1"));
    expect(setSetupStep).toHaveBeenCalledTimes(9);
    expect(setSetupStep).toHaveBeenCalledWith("oth-L1", "footage", { status: "open" });
    expect(setSetupStep).toHaveBeenCalledWith("oth-L1", "finish", { status: "open" });
  });

  it("stays put, and says so, when the steps can't be opened again", async () => {
    window.history.pushState({}, "", "/floors");
    const setSetupStep = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    const getSetup = vi.fn().mockResolvedValue(setupState({ finish: { status: "done" } }));
    render(<FloorsHome api={fakeSetupApi({ getSetup, setSetupStep })} saver={fakeSaver()} />);
    fireEvent.click(await within(screen.getAllByRole("article")[0]!).findByRole("button", { name: "Set up again" }));
    await waitFor(() => expect(useToasts.getState().toasts.at(-1)?.message)
      .toBe("Couldn't start L1's setup again. Check your connection, then retry."));
    expect(window.location.pathname).toBe("/floors");
  });

  it("still offers to set up a floor whose setup can't be loaded", async () => {
    const getSetup = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    render(<FloorsHome api={fakeSetupApi({ getSetup })} saver={fakeSaver()} />);
    await waitFor(() => expect(getSetup).toHaveBeenCalledTimes(2));
    expect(within(screen.getAllByRole("article")[0]!).getByRole("link", { name: "Set up L1" })).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the tests to verify that they fail**

Run: `bash .superpowers/run-tests.sh vitest packages/editor/src/home`
Expected: FAIL. The cards have no setup link or button.

- [ ] **Step 3: The card**

In `packages/editor/src/home/FloorCard.tsx`:

- Add `import type { SetupLink } from "../setup/progress";`.
- Above `export function FloorCard`, add:

```tsx
/** Above the card's stretched link, as the owner picker is, so it is a target of its own. */
const SETUP_LINK =
  "relative z-10 self-start rounded border border-stone-300 bg-white px-2.5 py-1 text-xs font-medium text-stone-900 hover:bg-stone-100";
```

- Change the props to:

```tsx
export function FloorCard({ level, progress, mine, saver, setup, onRestart }: {
  level: Level; progress: FloorProgress; mine: boolean; saver: Pick<Saver, "update">;
  /** The way into the floor's setup wizard (spec §4.2). */
  setup: SetupLink;
  /** Set up again: opens every step, then goes to step 1. */
  onRestart: () => void;
}) {
```

- After the `<p className="mt-auto pt-1 …">{nextStepText(progress)}</p>` line, add:

```tsx
      {setup.restart ? (
        <button type="button" onClick={onRestart} className={SETUP_LINK}>{setup.label}</button>
      ) : (
        <a href={setup.to} onClick={followLink(setup.to)} className={SETUP_LINK}>{setup.label}</a>
      )}
```

- [ ] **Step 4: The home loads each floor's setup**

In `packages/editor/src/home/FloorsHome.tsx`:

- Add these imports, and add `navigate` to the existing `../route` import:

```tsx
import type { Level } from "@oth/model";
import { cardLink } from "../setup/progress";
import { asSetupApi } from "../setup/setupApi";
import { loadSetup, useSetupStore } from "../setup/sync";
import { SETUP_STEP_IDS } from "../setup/types";
import { reportFailure } from "../ui/failure";
```

- After `const [latest, setLatest] = …;` and its `useEffect`, and before `if (!model) return …`, add:

```tsx
  const setups = useSetupStore(s => s.byLevel);
  const levelKey = sortedLevels(model).map(l => l.id).join(" ");

  // Each floor's setup, for its card's way in (spec §4.2). One that can't be
  // had leaves its card offering Set up: the wizard loads its own.
  useEffect(() => {
    const setupApi = asSetupApi(api);
    for (const id of levelKey.split(" ").filter(Boolean)) void loadSetup(setupApi, id);
  }, [api, levelKey]);
```

- After `if (!model) return …`, add:

```tsx
  /** Set up again: every step open, so the new run's check starts from now; then its step 1. */
  const restart = async (level: Level): Promise<void> => {
    const setupApi = asSetupApi(api);
    try {
      await Promise.all(SETUP_STEP_IDS.map(step => setupApi.setSetupStep(level.id, step, { status: "open" })));
    } catch (err) {
      reportFailure(err, { doing: `start ${level.code}'s setup again`, retry: () => restart(level) });
      return;
    }
    await loadSetup(setupApi, level.id);
    navigate(href({ name: "setup", code: level.code, step: 1, params: {} }));
  };
```

- Pass the two new props to each `FloorCard`:

```tsx
              setup={cardLink({
                setup: setups[level.id] ?? null, model, levelImages, levelId: level.id, levelCode: level.code,
                // Drafts are loaded only for the open floor; the card knows Find rooms ran from the server's counts.
                draftsWaiting: 0,
              })}
              onRestart={() => void restart(level)}
```

- [ ] **Step 5: Run the tests and typecheck**

Run: `bash .superpowers/run-tests.sh vitest packages/editor/src/home packages/editor/src/shell`
Expected: PASS. The existing FloorsHome tests use `fakeApi()`, which has no `getSetup`. `loadSetup` catches that, and their cards offer Set up.

Run: `bash .superpowers/run-tests.sh tsc packages/editor`
Expected: as Task 7, Step 7: no errors once 6C's client methods have merged.

- [ ] **Step 6: Commit**

```bash
git commit --only -m "feat(editor): each Floors card offers Set up, Continue at step n, or Set up again

The home asks for every floor's setup as it opens. A card offers Set up L1
until a step is stored, then Continue: step n of 9 at the first step not done,
then Set up again once Finish is stored. Set up again opens every step, so the
new run's check starts from then. A setup that can't be loaded still offers
Set up.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- packages/editor/src/home/FloorsHome.tsx packages/editor/src/home/FloorCard.tsx packages/editor/src/home/FloorsHome.test.tsx
```

---

### Task 9: The rehearsal (spec §11)

**Not a code task, and not committed.** The controller runs it with the user before 6E ships. It needs 6A, 6B, 6C and 6D merged into `ux-overhaul`, and Tasks 1–8 done.

The goal is spec §11:
- a sandbox server on a copy of the live data;
- a real Claude Code, connected with a token, runs all four commands on **L2**, then on **L1**;
- the check step is used to undo a sample of changes;
- what Claude got wrong goes back into 6C's prompts before deploy.

**Files (scratchpad and ledger only):**
- `$S` below is `<your session's scratchpad>/p6e-rehearsal`. Everything in it stays uncommitted:
  - `rehearse.sh`, `token.cjs`, `setup-drive.cjs`, `watch.cjs`, `check-drive.cjs`;
  - `data/`, `shots/` and the logs.
- Create: `.superpowers/sdd/2026-09-28-plan6/rehearsal.md`, the findings. `.superpowers/` is untracked.

- [ ] **Step 1: Check that everything it needs is in**

```bash
git log --oneline -60
grep -cE "getSetup|setSetupStep|listClaudeChanges|undoChange" packages/editor/src/api/client.ts
ls packages/server/src/mcp/prompts/ packages/server/src/paths/suggest.ts packages/editor/src/build/DownloadModel.tsx
bash .superpowers/run-tests.sh tsc packages/editor packages/server
```

Expected:
- the log shows 6A's, 6B's, 6C's and 6D's commits;
- the grep counts at least 4;
- the prompts folder holds the four prompts;
- both packages compile with no errors.

If anything is missing, stop and tell the controller which plan it belongs to.

- [ ] **Step 2: The data (ask first)**

The controller asks the user this, word for word:

> For the rehearsal I'd like a copy of the live map from Railway. It exports the database and files into a folder on the Railway volume (it only reads the database), downloads it, and deletes the folder. Is that OK, or should I rehearse on the local dev copy instead (the data as of the first deploy)?

**Route A, live data**, only on a yes. The export's migration count must also equal this worktree's, or `data:import` refuses it. Railway runs the last deployed SHA, so if 6A hasn't been deployed yet, use Route B.

1. Set up the folder and compare the migration counts. From the worktree root:

   ```bash
   S="<your scratchpad>/p6e-rehearsal"; mkdir -p "$S"
   MSYS_NO_PATHCONV=1 railway ssh --service oth-map -- 'ls /app/packages/server/drizzle/*.sql | wc -l'
   ls packages/server/drizzle/*.sql | wc -l
   ```

   The two counts must match.
2. Export on Railway, download, and import into a fresh sandbox database:

   ```bash
   MSYS_NO_PATHCONV=1 railway ssh --service oth-map -- 'cd /app && npm run data:export -- /data/rehearsal-export'
   MSYS_NO_PATHCONV=1 railway ssh --service oth-map -- 'tar -C /data/rehearsal-export -cf - .' > "$S/live-export.tar"
   mkdir -p "$S/live-export"
   tar --force-local -xf "$S/live-export.tar" -C "$S/live-export"
   DATA_DIR="$S/data" npm run data:import -- "$S/live-export" 2>&1 | tee "$S/import.log"
   MSYS_NO_PATHCONV=1 railway ssh --service oth-map -- 'rm -rf /data/rehearsal-export'
   ```

   - If the export says `DATABASE_URL` is missing, use the environ form from Step 8, Probe 4 of `.superpowers/sdd/2026-09-28-deploy/runbook-v2.md`.
   - The import checks every file against its row. If it refuses a file, the download was mangled: run the `rm` line, then use Route B.

**Route B, the dev copy**, on a no, or when Route A can't be used:

```bash
S="<your scratchpad>/p6e-rehearsal"; mkdir -p "$S/data"
cp -r /c/Users/qhuip/Repositories/oth_navigation/packages/server/data/dev-db /c/Users/qhuip/Repositories/oth_navigation/packages/server/data/assets "$S/data/"
```

The sandbox server migrates this copy when it opens it. Note which route you used at the top of the findings.

- [ ] **Step 3: Build and serve the sandbox on :3065**

`$S/rehearse.sh`:

```bash
#!/usr/bin/env bash
# Plan 6E rehearsal: build the editor under the test lock, then serve it on
# :3065 over the rehearsal copy in $S/data. Never :3000, never the main
# checkout's data. Leaves the server running and prints its pid.
set -u
W="/c/Users/qhuip/Repositories/oth_navigation/.claude/worktrees/ux-overhaul"
S="${S:?set S to the rehearsal folder}"
LOCK="$W/.superpowers/test.lock"
until mkdir "$LOCK" 2>/dev/null; do echo "waiting for the lock"; sleep 15; done
date +%s > "$LOCK/since"
( cd "$W" && timeout 300 npm run build --workspace @oth/editor > "$S/build.log" 2>&1 )
code=$?
rm -rf "$LOCK"
[ $code -eq 0 ] || { tail -30 "$S/build.log"; exit $code; }
cd "$W/packages/server" || exit 1
DATA_DIR="$S/data" PORT=3065 nohup node --import tsx src/index.ts > "$S/server.log" 2>&1 &
echo "server pid $!"
for i in $(seq 1 60); do
  curl -sf http://localhost:3065/api/health >/dev/null && { echo "up after ~${i}s"; exit 0; }
  sleep 1
done
echo "the server did not come up"; tail -20 "$S/server.log"; exit 1
```

Run: `S="$S" bash "$S/rehearse.sh"`. Note the pid: Step 9 stops that process, and only that one.

- [ ] **Step 4: Screenshots of every step, before Claude runs (spec §11)**

`$S/setup-drive.cjs`:

```js
// Plan 6E: the Floors cards and all nine setup steps on the :3065 rehearsal
// sandbox, at 1536 and 1280 wide, with the header checked for overflow.
const { chromium } = require("C:/Users/qhuip/Repositories/my_library/node_modules/playwright");
const fs = require("node:fs");
const path = require("node:path");

const BASE = "http://localhost:3065";
const FLOOR = process.argv[2] ?? "L2";
const OUT = path.join(__dirname, "shots", FLOOR);
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1536, height: 864 } });
  const people = (await (await context.request.get(BASE + "/api/auth/people")).json()).people;
  const login = await context.request.post(BASE + "/api/auth/login", { data: { userId: people[0].id } });
  if (!login.ok()) throw new Error(`login: ${login.status()}`);
  const page = await context.newPage();
  const logs = [];
  page.on("pageerror", e => logs.push(`pageerror: ${e.message}`));
  page.on("console", m => { if (m.type() === "error") logs.push(`console: ${m.text()}`); });

  await page.goto(BASE + "/floors");
  await page.getByRole("heading", { name: "Floors" }).waitFor({ timeout: 20_000 });
  await page.waitForTimeout(1500);
  for (const card of await page.getByRole("article").all()) {
    const code = await card.getByRole("link").first().textContent();
    const way = card.getByRole("link", { name: /^(Set up|Continue)/ }).or(card.getByRole("button", { name: "Set up again" }));
    console.log(`card ${code}: ${(await way.count()) ? await way.first().textContent() : "(no way in)"}`);
  }
  await page.screenshot({ path: path.join(OUT, "0-floors.png") });

  for (const width of [1536, 1280]) {
    await page.setViewportSize({ width, height: width === 1536 ? 864 : 800 });
    for (let n = 1; n <= 9; n++) {
      await page.goto(`${BASE}/floors/${FLOOR}/setup/${n}`);
      const bar = page.getByRole("region", { name: "Setup controls" });
      await bar.waitFor({ timeout: 20_000 });
      await page.waitForTimeout(1200);
      const header = await page.evaluate(() => {
        const h = document.querySelector("header");
        const r = h.getBoundingClientRect();
        const outside = [...h.querySelectorAll("a, button")]
          .filter(e => { const b = e.getBoundingClientRect(); return b.width > 0 && (b.right > r.right + 0.5 || b.bottom > r.bottom + 0.5); })
          .map(e => (e.textContent || "").trim().slice(0, 20));
        return { height: Math.round(r.height), scroll: h.scrollWidth, client: h.clientWidth, outside };
      });
      const status = bar.getByRole("status");
      const warn = (await status.count()) ? await status.textContent() : "(done)";
      console.log(`${width} step ${n}: header ${header.height}px ${header.scroll}/${header.client}, outside ${JSON.stringify(header.outside)} | ${warn}`);
      await page.screenshot({ path: path.join(OUT, `${width}-step-${n}.png`) });
    }
  }
  console.log(logs.slice(-12).join("\n"));
  await browser.close();
})().catch(e => { console.error("FAILED", e); process.exit(1); });
```

Run: `node "$S/setup-drive.cjs" L2 | tee "$S/drive-L2.log"`. Then look at every screenshot.

The pass:
- the header is 48 px at both widths, with `scroll` equal to `client` and nothing `outside`;
- each step shows its own tool;
- the bar's line matches what the floor lacks;
- there is no `pageerror`.

Record any failure as a wizard issue in the findings.

- [ ] **Step 5: Connect a real Claude Code to the sandbox**

`$S/token.cjs`, which prints only the secret, for the local config:

```js
// Makes a Claude Code token on the :3065 sandbox for its first person and
// prints only the secret. The sandbox's database is a copy; the token dies with it.
const BASE = "http://localhost:3065";
(async () => {
  const people = (await (await fetch(BASE + "/api/auth/people")).json()).people;
  const login = await fetch(BASE + "/api/auth/login", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId: people[0].id }),
  });
  if (!login.ok) throw new Error(`login: ${login.status}`);
  const cookie = login.headers.getSetCookie().map(c => c.split(";")[0]).join("; ");
  const made = await fetch(BASE + "/api/tokens", {
    method: "POST", headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ name: "Rehearsal", mayPublish: false }),
  });
  if (!made.ok) throw new Error(`token: ${made.status}`);
  process.stdout.write((await made.json()).secret);
})().catch(e => { console.error(e.message); process.exit(1); });
```

```bash
node "$S/token.cjs" > "$S/token.secret"
mkdir -p "$S/cc"
cd "$S/cc" && claude mcp add --transport http --scope local oth http://localhost:3065/mcp --header "Authorization: Bearer $(cat "$S/token.secret")"
cd "$S/cc" && claude mcp list
```

- The last command must show `oth` at `http://localhost:3065/mcp`, connected.
- Local scope applies in `$S/cc` only, and wins over a user-scope `oth`. So a teammate's own connection to Railway is untouched, and the slash commands keep the names the wizard shows.
- Never print the secret or paste it anywhere else.

- [ ] **Step 6: The four commands on L2, as a teammate would run them**

`$S/watch.cjs`, which watches one Claude step the way a person would:

```js
// Watches one Claude step of the setup wizard on the :3065 sandbox: its counts
// and Claude's last changes every 30 s, how often the map reloaded, and a
// screenshot every 5 minutes, until Claude calls finish_step or 90 minutes pass.
const { chromium } = require("C:/Users/qhuip/Repositories/my_library/node_modules/playwright");
const fs = require("node:fs");
const path = require("node:path");

const BASE = "http://localhost:3065";
const [FLOOR, STEP] = [process.argv[2], Number(process.argv[3])];
const OUT = path.join(__dirname, "shots", `${FLOOR}-watch-${STEP}`);
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1536, height: 864 } });
  const people = (await (await context.request.get(BASE + "/api/auth/people")).json()).people;
  await context.request.post(BASE + "/api/auth/login", { data: { userId: people[0].id } });
  const page = await context.newPage();
  let reloads = 0;
  page.on("request", r => { if (new URL(r.url()).pathname === "/api/model") reloads++; });
  await page.goto(`${BASE}/floors/${FLOOR}/setup/${STEP}`);
  const progress = page.getByRole("region", { name: "Progress" });
  await progress.waitFor({ timeout: 20_000 });
  const start = Date.now();
  for (let i = 0; Date.now() - start < 90 * 60_000; i++) {
    const counts = (await progress.innerText()).replace(/\s+/g, " ");
    const last = (await page.getByRole("region", { name: "Claude's last changes" }).innerText()).split("\n").slice(1, 3).join(" | ");
    console.log(`${new Date().toISOString().slice(11, 19)} ${counts} | model loads ${reloads} | ${last}`);
    if (i % 10 === 0) await page.screenshot({ path: path.join(OUT, `${String(i).padStart(3, "0")}.png`) });
    if (await page.getByText(/Done by Claude/).count()) {
      console.log("Claude called finish_step");
      await page.screenshot({ path: path.join(OUT, "done.png") });
      break;
    }
    await page.waitForTimeout(30_000);
  }
  await browser.close();
})().catch(e => { console.error("FAILED", e); process.exit(1); });
```

On L2, in step order:

1. **The "you" steps before each command.** Do them in the sandbox as a teammate would. Use the watch browser's context, or `node -e` with Playwright, and take a screenshot after each.
   - **Step 1:** if L2 has no footage in this copy, press Mark done, and note it.
   - **Step 3,** after the labels: decide three proposals in the Review screen, then press Skip.
   - **Step 4:** L2 needs a scaled PDF plan. If it has one, press Find rooms in the drawing and wait for its toast. If it has none, note that the rooms step can't be rehearsed on L2.
2. **Each Claude step:** label (step 2), rooms (5), things (6), then paths (7).
   1. Start the watcher: `node "$S/watch.cjs" L2 <step> > "$S/watch-L2-<step>.log"`, in the background.
   2. Run the command in `$S/cc`. Try headless first:

      ```bash
      cd "$S/cc" && timeout 5400 claude -p "/mcp__oth__label_survey L2" --allowedTools "mcp__oth" --output-format stream-json --verbose > "$S/claude-L2-label.jsonl" 2> "$S/claude-L2-label.err"
      ```

      Use `map_rooms`, `place_things` and `draw_paths` for the others.
   3. If the output says the command is unknown, print mode doesn't expand MCP prompts. The controller then asks the user to open `claude` in `$S/cc`, type the command, and say when Claude has finished. The watcher logs what the wizard shows, and the audit log keeps what Claude did.
   4. When it ends, record:
      - the minutes it took;
      - Claude's finish_step note, from `GET /api/levels/<id>/setup`;
      - the counts before and after, from the watcher's log;
      - the number of tool errors: `grep -c '"is_error":true' "$S/claude-L2-<step>.jsonl"`;
      - whether `model loads` rose while the counts moved. It should: that is the reload on a count change.

- [ ] **Step 7: The check step, with Undo on a sample**

`$S/check-drive.cjs`:

```js
// The check step on the :3065 sandbox: each section and its count, then Show
// and Undo on the first row of each, logging what Undo answered.
const { chromium } = require("C:/Users/qhuip/Repositories/my_library/node_modules/playwright");
const fs = require("node:fs");
const path = require("node:path");

const BASE = "http://localhost:3065";
const FLOOR = process.argv[2];
const OUT = path.join(__dirname, "shots", `${FLOOR}-check`);
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1536, height: 864 } });
  const people = (await (await context.request.get(BASE + "/api/auth/people")).json()).people;
  await context.request.post(BASE + "/api/auth/login", { data: { userId: people[0].id } });
  const page = await context.newPage();
  await page.goto(`${BASE}/floors/${FLOOR}/setup/8`);
  const list = page.getByRole("region", { name: "Claude's changes" });
  await list.getByRole("button", { name: "Looks right" }).waitFor({ timeout: 30_000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(OUT, "0-list.png") });
  const sections = await list.getByRole("region").all();
  for (const [i, section] of sections.entries()) {
    const title = (await section.getByRole("heading").textContent()).trim();
    const first = section.getByRole("listitem").first();
    console.log(`${title}: first "${(await first.locator("p").first().textContent()).trim()}"`);
    const show = first.getByRole("button", { name: /^Show/ });
    if (await show.isEnabled()) {
      await show.click();
      await page.waitForTimeout(800);
      await page.screenshot({ path: path.join(OUT, `${i + 1}-show.png`) });
    } else {
      console.log("  Show is off: nothing on the map");
    }
    await first.getByRole("button", { name: /^Undo/ }).click();
    await page.waitForTimeout(2500);
    const refusal = first.getByRole("alert");
    console.log((await refusal.count())
      ? `  refused: ${await refusal.textContent()}`
      : `  undone: ${(await first.getByText("Undone").count()) > 0}`);
    await page.screenshot({ path: path.join(OUT, `${i + 1}-undo.png`) });
  }
  await browser.close();
})().catch(e => { console.error("FAILED", e); process.exit(1); });
```

Run: `node "$S/check-drive.cjs" L2 | tee "$S/check-L2.log"`.

Then, by hand in the sandbox:
1. Find a room Claude made that step 6 has since bound a place to. The Places tab shows the binding.
2. On step 8, press Undo on that room's row.
3. Expect a refusal with a reason on the row, and note its words.

Also press Show on one object row and one stop row, and check each lands on the right thing.

- [ ] **Step 8: The same on L1**

Repeat Steps 4, 6 and 7 with `L1`. L1 is the long one: 215 drafts and 417 frames.
- Let each command run to its end, or to the 90-minute cap.
- If a command stops part-way, run it again once, and note whether the second run carried on or started over (spec §12: "a second run carries on").

- [ ] **Step 9: Write the findings, and clean up**

Write `.superpowers/sdd/2026-09-28-plan6/rehearsal.md` in this layout:

```markdown
# Plan 6 rehearsal — <date>, on <the live export at SHA <sha> | the dev copy>

## Per command
| Floor | Command | Minutes | Finished with | Counts before → after | Tool errors |
|---|---|---|---|---|---|

## What Claude got wrong
- <floor, command>: <what it did> → <what it should have done>. Evidence: <audit id, or screenshot path>.

## Prompt changes for 6C
- `packages/server/src/mcp/prompts/<file>`: replace "<the line>" with "<the new line>". Why: <the finding above>.

## The undo sample
| Floor | Section | Row | Result (undone, or the refusal's words) |
|---|---|---|---|

## Wizard issues for 6E
- <what, on which step, at which width>: <screenshot path>.
```

Then clean up:

```bash
kill <the server pid from Step 3>
cd "$S/cc" && claude mcp remove oth --scope local
rm -f "$S/token.secret"
```

- Keep `$S/data`, `$S/shots` and the logs until the controller has read the findings.
- Tell the controller:
  - the prompt changes go to 6C, and are made before deploy;
  - the wizard issues become 6E fix tasks.
- Deploy nothing from this task.

---

## Shipping 6E (the controller, after Task 9)

This is not an implementation task.

1. **Run the checks.**
   - Run `bash .superpowers/run-tests.sh vitest packages/editor/src/setup packages/editor/src/shell packages/editor/src/home packages/editor/src/route.test.tsx`.
   - Run `bash .superpowers/run-tests.sh tsc packages/editor`.
   - Run the whole suite once, as the controller's checkpoint (about 300 s).
2. **Fold in the rehearsal.** 6C's prompt changes, and any 6E fix tasks, are made and reviewed.
3. **Deploy to Railway** by the usual route (`git archive` of the SHA, then `railway up`). Add one line to the teammate note:

   > *Set up L1 on the Floors page walks you through a floor: footage, Claude's labels, your review, the plan, then Claude's rooms, places and pathways, a check of everything Claude did, and the 3D model.*
