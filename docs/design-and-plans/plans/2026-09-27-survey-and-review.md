# Workspace Overhaul, Plan 2 of 4 — Survey and Review — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The floor workspace's Survey and Review tabs, rebuilt: a frame-first, keyboard-driven Survey with a Grid view and an Add footage dialog, and a one-proposal-at-a-time Review with a list drawer, batch accept, "Same as…" merging and an Undo on every decision.

**Architecture:** The new screens live in `packages/editor/src/survey/` and `packages/editor/src/review/`. They are built around the kept store, saver, API client and pure survey functions, and hosted by `floor/FloorWorkspace.tsx` in place of the old `SurveyApp` and `ReviewPanel`, which are then deleted. Both screens read the model the shell already loaded. Their URL parameters are the state (`capture`, `frame`, `view`, `filter`, `place` for Survey; `place`, `list`, `scope` for Review), and every write goes through one non-validating saver. On the server, keyframe bin and restore become audited, transactional and versioned. Reject stamps the place and its tags with one moment, so the generic restore can bring the tags back. Merge and the undo endpoints `reopen` and `unmerge` are new.

**Tech Stack:** React 18, TypeScript (strict), Vite 5, Tailwind 3, zustand 4, Radix (dialog, popover, toast — already installed), Hono, Drizzle (PGlite in dev and tests), Vitest 1.6 + Testing Library.

**Spec:** [`docs/design-and-plans/specs/2026-09-27-workspace-overhaul-design.md`](../specs/2026-09-27-workspace-overhaul-design.md). This plan covers the spec's §15 item 2:
- §9 Survey workspace;
- §10 Review workspace;
- from §5.3, `POST /api/places/:id/merge` and capture level at creation;
- from §5.1, the survey and review URL parameters;
- §14's testing rules, for this scope.

Plan 1 ([`2026-09-27-workspace-foundation.md`](2026-09-27-workspace-foundation.md)) is done. Its "Carried forward to plans 2–4" list is worked through here; the table at the end of this plan says where each item went. Read the spec first.

## Global Constraints

- Work in the worktree `C:\Users\qhuip\Repositories\oth_navigation\.claude\worktrees\ux-overhaul` on branch `ux-overhaul`. Never `cd` to the main checkout. Never use `git stash`.
- Stage files by path. Never `git add -A` or `git add .` at the worktree root: `.superpowers/` there is untracked mockup output.
- Every test run is throttled, from the worktree root: `npx vitest run <files> --poolOptions.threads.maxThreads=2 --poolOptions.threads.minThreads=1`. Never run the whole suite unthrottled — it has frozen this laptop before. Leave no vitest process running.
- TypeScript is strict with `noUncheckedIndexedAccess`, `noUnusedLocals` and `noUnusedParameters`: `npx tsc -b` must pass before every commit.
- No new runtime dependencies in this plan.
- Component tests drive mouse events, not pointer events: jsdom gives `PointerEvent` no coordinates.
- Colour tokens (spec §12), exact, already in `tailwind.config.ts`: accent `#0f766e` (hover `#115e59`, soft `#f0fdfa`, ring `#14b8a6`); yours `#b45309` / soft `#fef3c7`; proposed `#0284c7` / soft `#e0f2fe`; confirmed `#047857` / soft `#d1fae5`; danger `#b91c1c` / soft `#fee2e2`; neutrals are Tailwind `stone`. Components use the token names (`bg-proposed`, `border-confirmed`), never raw hex.
- Type: Inter; `text-xs` is 13 px / 18 px and `text-sm` 14 px / 20 px; no text smaller than 13 px, avatar initials excepted.
- Copy: second person, sentence case, loading text ends with `…`, errors say what to do next, and no screen ever tells a teammate to run a terminal command.
- Colour is never the only signal: every status also carries a word, a glyph or a shape (a proposed box is dashed).
- There are no passwords: signing in is picking your name (spec §8). A flat team: anyone signed in may add a teammate, assign owners, survey, review and publish (spec §4).
- Destructive actions are undone, not confirmed (spec §3): no `window.confirm` or `window.prompt` in a new screen. Every bin, removed tag and review decision offers Undo in its toast.
- New workspaces never return early when `user` is null. An expired session keeps the page mounted behind the sign-in dialog.
- New workspaces never load the model. `shell/Workspace.tsx` loads it once. Survey and Review write through one saver made in `FloorWorkspace` with `{ validate: false }`. That is safe because every survey validation rule is a warning, so these writes never change what blocks publishing.
- Keys (spec §9, §10) are inactive while a text field, select or dialog (Radix popovers included) has focus, and never fire with Ctrl, Cmd or Alt held. `ui/keys.ts` is the one place that decides this.
- Frame images: the 240 px variant in the filmstrip and grid, the 1600 px variant for the frame being tagged and for review evidence, never the 4K original. Long frame lists are windowed.
- Never touch the live server on :3000 or the main checkout's `packages/server/data`. Anything run against real data runs against a copy in the scratchpad, served on :3055.
- Comments explain *why*, in the repo's existing voice. Commit messages are `type(scope): summary` with an explanatory body, ending with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

## Review Focus

1. **Footage filed under no floor.** The real walkthrough has no level. Without help, L1's Survey says there is no footage, and about 150 of its proposals belong to no floor. Survey must offer *File under L1*, and Review must offer the proposals that are on no floor. Pinned in Task 6 (`unfiled`), Task 11 (the banner files it), Task 12 (the `floorless` scope) and Task 13 (the link to it).
2. **A letter typed into a field** — the N of "NTUC", the R of "Rice Garden" — is text, never a jump to another frame or a reject. No key acts behind a dialog or an open popover either. Pinned in Task 7 (`ignoreKey`), Task 11 and Task 13.
3. **A name that differs only in case or spacing** from a place already there ("gate 1 ") links to that place in Survey and is offered as "Same as…" in Review, instead of becoming a duplicate. A place of the same name on another floor is never linked. Pinned in Task 7 (`exactPlace`, `normalName`), Task 11 and Task 13.
4. **A second key press while the first write is still in flight.** Del Del must not bin the next frame too. A pressed twice decides the next proposal, never the same one twice. A decision that fails comes back into view. Pinned in Task 11 (one bin at a time) and Task 13 (two As, two different proposals; a failed one returns).
5. **A proposal with no frame at all** (six in the real data) still shows and can be decided. It says there is no frame instead of showing a broken image. Pinned in Task 13.

---

## File map

```
packages/server/src/
  entities/repository.ts        MODIFY  recordAudit exported; softDeleteEntity(at)
  entities/routes.ts            MODIFY  restoring a place brings back its tags
  entities/routes.test.ts       MODIFY
  survey/routes.ts              MODIFY  keyframe bin/restore: audited, transactional, versioned
  survey/routes.test.ts         MODIFY
  survey/review.ts              MODIFY  reject stamps once; accept levelId + confirmed ids; reopen; merge; unmerge; restorePlace
  survey/review.test.ts         MODIFY
  images/thumbnail.test.ts      MODIFY  a failed rename is cleaned up

packages/editor/src/
  api/client.ts                 MODIFY  onUnauthorized(request), wasWrite, acceptPlace levelId, reopenPlace, mergePlace, unmergePlace
  state/store.ts                MODIFY  sessionEndUnsaved; endSession(reason, unsaved)
  state/save.ts                 MODIFY  saveFailure; failures as toasts with Retry; apply("keyframe")
  main.tsx                      MODIFY  the 401 hook says whether a write was lost
  auth/AuthGate.tsx             MODIFY  "not saved" only when it was not
  shell/OwnerAvatars.tsx        MODIFY  a glyph while names load
  shell/FloorSwitcher.tsx       MODIFY  the team-failed message
  panels/{FloorplanPanel,AssetLibrary,PublishButton}.tsx   MODIFY  a 401 shows nothing of its own
  App.tsx                       MODIFY  docstring
  flow/floorProgress.ts         MODIFY  reviewCounts
  testing/fakeApi.ts            MODIFY  the new endpoints
  ui/keys.ts                    CREATE  isTypingTarget, ignoreKey, useKeys
  ui/windowing.ts               CREATE  visibleRange, centerOffset
  ui/undo.ts                    MODIFY  offerUndo; deleteWithUndo uses it
  survey/frameStatus.ts         CREATE  frameStatuses, filterCounts
  survey/surveyView.ts          CREATE  readSurveyParams, surveyView, stepFrame, nextUntagged, frameTime
  survey/keys.ts                CREATE  surveyCommand
  survey/suggest.ts             CREATE  normalName, linkablePlaces, suggestPlaces, exactPlace
  survey/tagging.ts             CREATE  Tag, newId, tagWrites, drawnBox, walkwayColour
  survey/fit.ts                 CREATE  fitSize
  survey/FrameCanvas.tsx        CREATE  the frame and its boxes (from PlaceTagger)
  survey/TagBar.tsx             CREATE  the tag bar (from PlaceTagger)
  survey/FrameStripe.tsx        CREATE
  survey/Filmstrip.tsx          CREATE
  survey/GridView.tsx           CREATE
  survey/autoFrames.ts          MODIFY  freshSamples
  survey/findFrames.ts          CREATE  the frame-finding loop, out of CaptureVideo
  survey/AddFootageDialog.tsx   CREATE
  survey/FramePanel.tsx         CREATE
  survey/FrameView.tsx          CREATE
  survey/SurveyWorkspace.tsx    CREATE
  review/keys.ts                CREATE  reviewCommand
  review/queue.ts               CREATE  readReviewParams, reviewQueue, floorlessProposals, currentProposal, nextProposal, sameAs, evidenceFor
  review/decide.ts              CREATE  acceptProposal, rejectProposal, mergeProposal, acceptProposals
  review/ProposalFocus.tsx      CREATE
  review/ProposalDrawer.tsx     CREATE
  review/ReviewWorkspace.tsx    CREATE
  floor/FloorWorkspace.tsx      MODIFY  hosts the new workspaces
  shell/Workspace.test.tsx      MODIFY
  survey/{SurveyApp,PlaceTagger,CaptureVideo,ReviewPanel}.tsx (+ tests)   DELETE
```

---
### Task 1: An expired session says only what is true, and a failed save offers Retry

This is the first half of what Plan 1 left for Plan 2's first task. The session-ended dialog said "Your last change was not saved." every time. Usually that was untrue, because the presence poll notices an expiry before any save does. Separately, a failed save went through the status bar as raw text (`api error 500`) with nothing to press. Spec §6 wants errors to stay until dismissed and to offer Retry where retrying makes sense.

**Files:**
- Modify: `packages/editor/src/api/client.ts` (the `ApiOptions.onUnauthorized` type and its call in `request`; add `wasWrite`)
- Modify: `packages/editor/src/state/store.ts` (`sessionEndUnsaved`, `endSession`, `setUser`, `initial`)
- Modify: `packages/editor/src/state/save.ts`
- Modify: `packages/editor/src/main.tsx:16-20`
- Modify: `packages/editor/src/auth/AuthGate.tsx:35-40`
- Test: `packages/editor/src/api/client.test.ts`, `packages/editor/src/state/store.test.ts`, `packages/editor/src/state/save.test.ts`, `packages/editor/src/auth/AuthGate.test.tsx`

**Interfaces:**
- Consumes: `toast` from `ui/toast.ts`; `isUnauthorized`, `ApiError`, `ConflictError` from `api/client.ts`.
- Produces:
  - `wasWrite(request: { method: string; path: string }): boolean`.
  - `ApiOptions.onUnauthorized?: (request: { method: string; path: string }) => void`.
  - Store: `sessionEndUnsaved: boolean` and `endSession(reason: "signed-out" | "expired", unsaved?: boolean)`. The flag sticks until `setUser(user)`.
  - `saveFailure(err: unknown): { message: string; retry: boolean }`.
  - `Saver.apply(type: EntityType | "keyframe", id, run)`.
  - A saver write whose request succeeded now returns `true` even when the reload after it fails.

- [ ] **Step 1: Write the failing tests**

In `packages/editor/src/api/client.test.ts`, change the import to `import { ApiError, ConflictError, createApi, isUnauthorized, wasWrite } from "./client";`. Inside `describe("api client", …)`, after the test "does not call onUnauthorized for a 401 on login, me, people or logout", add:

```ts
  it("tells onUnauthorized which request was refused", async () => {
    const onUnauthorized = vi.fn();
    const api = createApi({ fetchImpl: mockFetch(401, { error: "unauthenticated" }), onUnauthorized });
    await expect(api.deleteKeyframe("kf_1")).rejects.toBeInstanceOf(ApiError);
    expect(onUnauthorized).toHaveBeenCalledWith({ method: "DELETE", path: "/api/keyframes/kf_1" });
  });
```

After the `describe("isUnauthorized", …)` block, add:

```ts
describe("wasWrite", () => {
  it("counts a request that changes something as a write", () => {
    expect(wasWrite({ method: "POST", path: "/api/entities/room" })).toBe(true);
    expect(wasWrite({ method: "PATCH", path: "/api/entities/room/r1" })).toBe(true);
    expect(wasWrite({ method: "DELETE", path: "/api/keyframes/kf_1" })).toBe(true);
  });

  it("does not count reading, or the presence and lock pings every screen sends", () => {
    expect(wasWrite({ method: "GET", path: "/api/model" })).toBe(false);
    expect(wasWrite({ method: "POST", path: "/api/presence" })).toBe(false);
    expect(wasWrite({ method: "POST", path: "/api/locks/room/r1" })).toBe(false);
    expect(wasWrite({ method: "DELETE", path: "/api/locks/room/r1" })).toBe(false);
  });
});
```

In `packages/editor/src/state/store.test.ts`, at the end of the file, add:

```ts
describe("an ended session", () => {
  it("remembers that a change was lost until someone signs in again", () => {
    useEditorStore.getState().endSession("expired", true);
    // A presence poll's 401 a moment later must not make it forget.
    useEditorStore.getState().endSession("expired");
    expect(useEditorStore.getState().sessionEndUnsaved).toBe(true);
    useEditorStore.getState().setUser({ id: "u1", email: "a@oth.local", displayName: "A" });
    expect(useEditorStore.getState().sessionEndUnsaved).toBe(false);
  });

  it("does not claim a lost change when none was", () => {
    useEditorStore.getState().endSession("expired");
    expect(useEditorStore.getState().sessionEndUnsaved).toBe(false);
  });
});
```

In `packages/editor/src/state/save.test.ts`, add `import { useToasts } from "../ui/toast";` to the imports. Change the file's `beforeEach` to:

```ts
beforeEach(() => {
  useEditorStore.getState().reset();
  useToasts.getState().clear();
});
```

Delete the test `it("surfaces an unexpected failure as a status message rather than crashing", …)`. The block below replaces it. Add at the end of the file:

```ts
describe("a write that fails", () => {
  it("says so in a toast that stays, with Retry, when trying again could help", async () => {
    const updateEntity = vi.fn(async () => { throw new TypeError("Failed to fetch"); });
    expect(await createSaver(fakeApi({ updateEntity })).update("room", "L1-a", 0, {})).toBe(false);
    const shown = useToasts.getState().toasts[0]!;
    expect(shown.tone).toBe("error");
    expect(shown.message).toBe("Couldn't save. Check your connection and try again.");
    expect(shown.durationMs).toBeNull();
    expect(shown.action?.label).toBe("Retry");
  });

  it("Retry sends the same write again", async () => {
    const updateEntity = vi.fn()
      .mockRejectedValueOnce(new ApiError(503, null))
      .mockResolvedValueOnce({ id: "L1-a", version: 1 });
    await createSaver(fakeApi({ updateEntity })).update("room", "L1-a", 0, { nameEn: "X" });
    await useToasts.getState().toasts[0]!.action!.run();
    expect(updateEntity).toHaveBeenCalledTimes(2);
    expect(updateEntity.mock.calls[1]).toEqual(["room", "L1-a", 0, { nameEn: "X" }]);
  });

  it("offers no Retry for a change the server refused, since it would refuse it again", async () => {
    const updateEntity = vi.fn(async () => { throw new ApiError(422, { error: "invalid entity" }); });
    await createSaver(fakeApi({ updateEntity })).update("room", "L1-a", 0, {});
    const shown = useToasts.getState().toasts[0]!;
    expect(shown.message).toBe("The server refused that change: invalid entity.");
    expect(shown.action).toBeUndefined();
  });

  it("counts a write that landed as saved, even when the reload after it fails", async () => {
    const getModel = vi.fn(async () => { throw new TypeError("Failed to fetch"); });
    expect(await createSaver(fakeApi({ getModel })).create("room", { id: "x" })).toBe(true);
    expect(useToasts.getState().toasts[0]!.message).toMatch(/^Saved, but the map didn't reload/);
  });

  it("goes through apply for a frame, which is not a generic entity", async () => {
    const run = vi.fn(async () => undefined);
    expect(await createSaver(fakeApi()).apply("keyframe", "kf_1", run)).toBe(true);
    expect(run).toHaveBeenCalledTimes(1);
  });
});
```

In the same file, inside `describe("an expired session", …)`, add:

```ts
  it("says the change was lost when the write itself was refused", async () => {
    useEditorStore.getState().setUser({ id: "u1", email: "a@oth.local", displayName: "A" });
    const updateEntity = vi.fn(async () => { throw new ApiError(401, null); });
    await createSaver(fakeApi({ updateEntity })).update("room", "r1", 0, {});
    expect(useEditorStore.getState().sessionEndUnsaved).toBe(true);
  });

  it("does not say a change was lost when it landed and only the reload was refused", async () => {
    useEditorStore.getState().setUser({ id: "u1", email: "a@oth.local", displayName: "A" });
    const getModel = vi.fn(async () => { throw new ApiError(401, null); });
    expect(await createSaver(fakeApi({ getModel })).update("room", "r1", 0, {})).toBe(true);
    expect(useEditorStore.getState().sessionEnd).toBe("expired");
    expect(useEditorStore.getState().sessionEndUnsaved).toBe(false);
  });
```

In `packages/editor/src/auth/AuthGate.test.tsx`, inside `describe("AuthGate", …)`, add:

```ts
  it("does not say a change was lost when the session simply ran out", async () => {
    render(<AuthGate api={fakeApi()}><p>the survey</p></AuthGate>);
    await waitFor(() => screen.getByText("the survey"));
    act(() => useEditorStore.getState().endSession("expired"));
    expect(screen.getByRole("dialog", { name: /session ended/i }).textContent).not.toMatch(/not saved/i);
  });

  it("says the last change was not saved when a write was refused", async () => {
    render(<AuthGate api={fakeApi()}><p>the survey</p></AuthGate>);
    await waitFor(() => screen.getByText("the survey"));
    act(() => useEditorStore.getState().endSession("expired", true));
    expect(screen.getByRole("dialog", { name: /session ended/i }).textContent).toMatch(/your last change was not saved/i);
  });
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run packages/editor/src/api/client.test.ts packages/editor/src/state packages/editor/src/auth/AuthGate.test.tsx --poolOptions.threads.maxThreads=2 --poolOptions.threads.minThreads=1`
Expected: FAIL. `wasWrite` is not exported; `sessionEndUnsaved` is undefined; the saver sets `status` instead of toasting; the dialog always says "not saved".

- [ ] **Step 3: The client tells the hook which request was refused**

In `packages/editor/src/api/client.ts`, directly above `export type EntityType =`, add:

```ts
/**
 * Whether a refused request was trying to change something, so the sign-in
 * dialog can say that change did not land. Presence and lock pings are POSTs
 * too, but they save nothing anyone made.
 */
export function wasWrite(request: { method: string; path: string }): boolean {
  if (request.method === "GET" || request.method === "HEAD") return false;
  return !request.path.startsWith("/api/presence") && !request.path.startsWith("/api/locks");
}
```

In `ApiOptions`, replace the `onUnauthorized?: () => void;` line (keep its comment) with:

```ts
  onUnauthorized?: (request: { method: string; path: string }) => void;
```

In `request`, replace

```ts
      if (res.status === 401 && !requestOptions.skipUnauthorized) options.onUnauthorized?.();
```

with

```ts
      if (res.status === 401 && !requestOptions.skipUnauthorized) {
        options.onUnauthorized?.({ method: (init.method ?? "GET").toUpperCase(), path });
      }
```

- [ ] **Step 4: The store remembers whether a change was lost**

In `packages/editor/src/state/store.ts`:

In `EditorState`, directly under the `sessionEnd` field and its comment, add:

```ts
  /**
   * Whether a write was refused when the session ended. The dialog says "your
   * last change was not saved" only then: usually a presence poll notices the
   * expiry first, and nothing was lost.
   */
  sessionEndUnsaved: boolean;
```

Change the `endSession` line in `EditorState` to:

```ts
  endSession: (reason: "signed-out" | "expired", unsaved?: boolean) => void;
```

In `initial`, under `sessionEnd: null as EditorState["sessionEnd"],`, add:

```ts
  sessionEndUnsaved: false,
```

Replace the `setUser` implementation with:

```ts
  // Signing in, or back in, settles why the session had ended.
  setUser: user => set(user ? { user, sessionEnd: null, sessionEndUnsaved: false } : { user }),
```

Replace the `endSession` implementation with:

```ts
  // A lost change stays lost until someone signs in: a later 401 from a poll
  // must not make the dialog forget it.
  endSession: (reason, unsaved = false) =>
    set(state => ({ user: null, sessionEnd: reason, sessionEndUnsaved: state.sessionEndUnsaved || unsaved })),
```

- [ ] **Step 5: The saver toasts its failures, with Retry where it helps**

Replace `packages/editor/src/state/save.ts` with:

```ts
import type { Api, EntityType } from "../api/client";
import { ApiError, ConflictError, isUnauthorized } from "../api/client";
import { toast } from "../ui/toast";
import { useEditorStore } from "./store";

/**
 * What to say when a write fails for a reason other than a conflict or an
 * expired session, and whether trying again could help. A refusal (a 4xx)
 * would be refused again; a server fault or a dropped connection may not be.
 */
export function saveFailure(err: unknown): { message: string; retry: boolean } {
  if (err instanceof ApiError) {
    if (err.status >= 500) return { message: "The server couldn't save that. Try again in a moment.", retry: true };
    const said = (err.body as { error?: unknown } | null)?.error;
    return {
      message: typeof said === "string"
        ? `The server refused that change: ${said}.`
        : `The server refused that change (HTTP ${err.status}).`,
      retry: false,
    };
  }
  return { message: "Couldn't save. Check your connection and try again.", retry: true };
}

/**
 * Every mutation goes through here so four rules hold everywhere:
 *
 * 1. A 409 becomes a conflict in the store, never an automatic retry. Retrying
 *    with the fresh version is precisely the silent overwrite optimistic
 *    locking exists to prevent — the user has to see what someone else did.
 * 2. A successful write refreshes model and report together, so the canvas
 *    always shows what the server actually accepted rather than a local guess.
 * 3. Nothing throws at the call site; callers get a boolean — true when the
 *    write landed, even if the reload after it did not.
 * 4. Any other failure is a toast that stays until dismissed, with Retry when
 *    trying again could help (spec §6).
 *
 * `validate: false` is for Survey and Review, which never show the report.
 * Running the validator bakes every level's nav grid, which costs about half
 * a second on each write for nothing anyone there looks at — and every survey
 * rule is a warning, so skipping it never hides a publish blocker.
 */
export function createSaver(api: Api, options: { validate?: boolean } = {}) {
  const store = useEditorStore;
  const validates = options.validate ?? true;

  async function refresh(): Promise<void> {
    const [model, report, levelImages] = await Promise.all([
      api.getModel(),
      validates ? api.validate() : Promise.resolve(null),
      api.listLevelImages(),
    ]);
    store.getState().setModel(model);
    if (validates) store.getState().setReport(report);
    store.getState().setLevelImages(levelImages);
  }

  async function guard(
    entityType: string, entityId: string, run: () => Promise<unknown>,
  ): Promise<boolean> {
    try {
      await run();
    } catch (err) {
      if (err instanceof ConflictError) {
        store.getState().setConflict({ entityType, entityId, current: err.current });
        return false;
      }
      // Refused as signed out: keep the page, ask for a sign-in over it, and
      // let the dialog say that this change did not land.
      if (isUnauthorized(err)) {
        store.getState().endSession("expired", true);
        return false;
      }
      const { message, retry } = saveFailure(err);
      toast({
        tone: "error",
        message,
        ...(retry
          ? { action: { label: "Retry", run: async () => { await guard(entityType, entityId, run); } } }
          : {}),
      });
      return false;
    }

    store.getState().setConflict(null);
    try {
      await refresh();
    } catch (err) {
      // The change landed; only the reload after it did not. Retrying the
      // write here would make it twice, so the offer is to reload.
      if (isUnauthorized(err)) {
        store.getState().endSession("expired");
      } else {
        toast({
          tone: "error",
          message: "Saved, but the map didn't reload. Try again to see the latest.",
          action: { label: "Try again", run: async () => { await refresh().catch(() => {}); } },
        });
      }
    }
    return true;
  }

  /**
   * The first load of a screen, which nothing is awaiting.
   *
   * An expired session sends you back to sign in; anything else is said out
   * loud in the status bar. A bare `void refresh()` threw into nowhere, and the
   * screen just sat there empty.
   */
  async function load(): Promise<boolean> {
    try {
      await refresh();
      return true;
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        store.getState().endSession("expired");
        return false;
      }
      store.getState().setStatus(
        err instanceof ApiError
          ? `The server refused to load the map (HTTP ${err.status}). Try reloading the page.`
          : "Can't reach the server. Check your connection and reload the page.",
      );
      return false;
    }
  }

  return {
    refresh,
    load,

    create: (type: EntityType, data: Record<string, unknown>) =>
      guard(type, String(data.id ?? "new"), () => api.createEntity(type, data)),

    update: (type: EntityType, id: string, expectedVersion: number, data: Record<string, unknown>) =>
      guard(type, id, () => api.updateEntity(type, id, expectedVersion, data)),

    remove: (type: EntityType, id: string, expectedVersion: number) =>
      guard(type, id, () => api.deleteEntity(type, id, expectedVersion)),

    /** Any other write, under the same rules: one request, one reload. A frame is not a generic entity, so it is named here. */
    apply: (type: EntityType | "keyframe", id: string, run: () => Promise<unknown>) => guard(type, id, run),
  };
}

export type Saver = ReturnType<typeof createSaver>;
```

- [ ] **Step 6: The hook in `main.tsx`, and the dialog's wording**

In `packages/editor/src/main.tsx`, change the import `import { createApi } from "./api/client";` to `import { createApi, wasWrite } from "./api/client";`, and replace the `onUnauthorized` option with:

```tsx
        onUnauthorized: request => {
          const state = useEditorStore.getState();
          // A signed-out visitor's requests 401 too (locks, presence); only a
          // session that was signed in has "expired". One that already has
          // still hears about a write that was in flight when it did.
          if (state.user || state.sessionEnd === "expired") state.endSession("expired", wasWrite(request));
        },
```

In `packages/editor/src/auth/AuthGate.tsx`, add `const unsaved = useEditorStore(s => s.sessionEndUnsaved);` under the `sessionEnd` line, and replace the dialog's `description` prop with:

```tsx
          description={
            unsaved
              ? "Sign in to carry on where you were. Your last change was not saved."
              : "Sign in to carry on where you were."
          }
```

- [ ] **Step 7: Run the tests and the typecheck**

Run: `npx vitest run packages/editor/src/api/client.test.ts packages/editor/src/state packages/editor/src/auth packages/editor/src/shell --poolOptions.threads.maxThreads=2 --poolOptions.threads.minThreads=1`
Expected: PASS.
Run: `npx tsc -b`
Expected: exit 0.

- [ ] **Step 8: Commit**

```bash
git add packages/editor/src/api/client.ts packages/editor/src/api/client.test.ts packages/editor/src/state/store.ts packages/editor/src/state/store.test.ts packages/editor/src/state/save.ts packages/editor/src/state/save.test.ts packages/editor/src/main.tsx packages/editor/src/auth/AuthGate.tsx packages/editor/src/auth/AuthGate.test.tsx
git commit -m "fix(editor): an expired session says only what is true; a failed save offers Retry

The sign-in dialog said the last change was not saved every time, though
usually the presence poll notices an expiry before any save does. The
client now tells its 401 hook which request was refused, and the dialog
says so only when a write was.

A save that fails for any other reason is now a toast that stays, with
Retry when trying again could help: a dropped connection or a server
fault, never a refusal. A write that landed counts as saved even if the
reload after it failed, and offers a reload rather than a second write.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Owners while the team loads, 401s in the Build panels, and housekeeping

This is the rest of what Plan 1 left for Plan 2's first task. While the team loads, an owner showed as "TM", which reads as a real person. The floor switcher never said the team had failed to load. Three Build panels still show a raw "api error 401" beside the sign-in dialog; Build stays on the old screen until Plan 3, so they are fixed here. The same item listed SurveyApp and CaptureVideo too; those are retired in Task 15, and the new screens route every write through the saver, which handles a 401 without a toast of its own.

**Files:**
- Modify: `packages/editor/src/shell/OwnerAvatars.tsx`
- Modify: `packages/editor/src/shell/FloorSwitcher.tsx:94-118`
- Modify: `packages/editor/src/panels/FloorplanPanel.tsx:25-61`, `packages/editor/src/panels/AssetLibrary.tsx:297-300`, `packages/editor/src/panels/PublishButton.tsx:266-268`
- Modify: `packages/editor/src/App.tsx:36`
- Modify: `packages/server/src/images/thumbnail.test.ts`
- Test: `packages/editor/src/shell/OwnerAvatars.test.tsx` (create), `packages/editor/src/shell/Header.test.tsx`, `packages/editor/src/panels/FloorplanPanel.test.tsx`, `packages/editor/src/panels/AssetLibrary.test.tsx`, `packages/editor/src/panels/PublishButton.test.tsx` (create)

**Interfaces:**
- Consumes: `isUnauthorized` from `api/client.ts`; `teamStatus` from the store.
- Produces: `OwnerAvatars` renders an owner whose name is not loaded as `role="img"` named `Owner – name not loaded`, with a glyph and no initials.

- [ ] **Step 1: Write the failing tests**

Create `packages/editor/src/shell/OwnerAvatars.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useEditorStore } from "../state/store";
import { sampleTeam } from "../testing/fakeApi";
import { OwnerAvatars } from "./OwnerAvatars";

beforeEach(() => useEditorStore.getState().reset());

describe("OwnerAvatars", () => {
  it("names an owner who is on the team", () => {
    useEditorStore.getState().setTeam(sampleTeam);
    render(<OwnerAvatars ids={["u_sc"]} />);
    expect(screen.getByRole("img", { name: "Stef Chan" }).textContent).toBe("SC");
  });

  it("shows an owner as a glyph, not initials, while the team is still loading", () => {
    render(<OwnerAvatars ids={["u_sc"]} />);
    const owner = screen.getByRole("img", { name: "Owner – name not loaded" });
    // "TM" read as a real teammate; a glyph does not.
    expect(owner.textContent).toBe("");
  });

  it("says the same when the team failed to load", () => {
    useEditorStore.getState().setTeamLoadError();
    render(<OwnerAvatars ids={["u_sc"]} />);
    expect(screen.getByRole("img", { name: "Owner – name not loaded" })).toBeTruthy();
  });

  it("calls someone no longer on the team a former teammate, once the team has loaded", () => {
    useEditorStore.getState().setTeam([]);
    render(<OwnerAvatars ids={["u_gone"]} />);
    expect(screen.getByRole("img", { name: "Former teammate" })).toBeTruthy();
  });
});
```

In `packages/editor/src/shell/Header.test.tsx`, inside `describe("Header", …)`, add:

```tsx
  it("says in the switcher when the team could not be loaded", async () => {
    useEditorStore.getState().setTeamLoadError();
    renderHeader();
    fireEvent.click(screen.getByRole("button", { name: /Floor L1/ }));
    expect(await screen.findByText(/couldn't load the team/i)).toBeTruthy();
  });
```

In `packages/editor/src/panels/FloorplanPanel.test.tsx`, add `import { ApiError } from "../api/client";` to the imports, and inside `describe("FloorplanPanel", …)` add:

```tsx
  it("leaves an expired session to the sign-in dialog instead of showing a raw 401", async () => {
    const d = deps({ uploadLevelImage: vi.fn(async () => { throw new ApiError(401, null); }) });
    render(<FloorplanPanel {...d} />);
    fireEvent.change(screen.getByLabelText(/add a floorplan/i), {
      target: { files: [new File([new Uint8Array([1])], "L1.png")] },
    });
    await waitFor(() => expect(uploadCalls(d)).toHaveLength(1));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(useEditorStore.getState().status).toBeNull();
  });
```

In `packages/editor/src/panels/AssetLibrary.test.tsx`, add `import { ApiError } from "../api/client";`, and inside `describe("AssetLibrary", …)` add:

```tsx
  it("leaves an expired session to the sign-in dialog instead of showing a raw 401", async () => {
    const expired = api({ uploadAsset: vi.fn(async () => { throw new ApiError(401, null); }) });
    render(<AssetLibrary api={expired} onPlace={vi.fn()} />);
    await waitFor(() => screen.getByText("library-arch.glb"));
    fireEvent.change(screen.getByLabelText(/upload a \.glb/i), {
      target: { files: [new File([new Uint8Array([1])], "big.glb")] },
    });
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(useEditorStore.getState().status).toBeNull();
  });
```

Create `packages/editor/src/panels/PublishButton.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, type Api } from "../api/client";
import { useEditorStore } from "../state/store";
import { PublishButton } from "./PublishButton";

beforeEach(() => {
  useEditorStore.getState().reset();
  useEditorStore.getState().setReport({ issues: [], errorCount: 0, warningCount: 0, ok: true });
});

describe("the old editor's PublishButton", () => {
  it("leaves an expired session to the sign-in dialog instead of showing a raw 401", async () => {
    const publish = vi.fn(async () => { throw new ApiError(401, null); });
    render(<PublishButton api={{ publish } as unknown as Api} />);
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    await waitFor(() => expect(publish).toHaveBeenCalled());
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(useEditorStore.getState().status).toBeNull();
  });
});
```

In `packages/server/src/images/thumbnail.test.ts`, change the first import to `import { mkdtemp, readdir, rename, writeFile } from "node:fs/promises";` and the mock to:

```ts
vi.mock("node:fs/promises", async importOriginal => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, writeFile: vi.fn(actual.writeFile), rename: vi.fn(actual.rename) };
});
```

Then, inside `describe("readThumbnail", …)`, add:

```ts
  it("cleans up its temp file when the rename into place fails", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "oth-thumb-"));
    const stored = await storeAsset(dataDir, await jpeg(1920, 1080), "jpg");
    vi.mocked(writeFile).mockClear();
    vi.mocked(rename).mockRejectedValueOnce(new Error("EPERM"));
    await expect(readThumbnail(dataDir, stored, 240)).rejects.toThrow("EPERM");
    // The temp file was written this time, so there was something to clean up.
    expect(vi.mocked(writeFile).mock.calls.some(([p]) => String(p).endsWith(".tmp"))).toBe(true);
    expect(await readdir(join(dataDir, "thumbs"))).toEqual([]);
  });
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run packages/editor/src/shell/OwnerAvatars.test.tsx packages/editor/src/shell/Header.test.tsx packages/editor/src/panels/FloorplanPanel.test.tsx packages/editor/src/panels/AssetLibrary.test.tsx packages/editor/src/panels/PublishButton.test.tsx packages/server/src/images/thumbnail.test.ts --poolOptions.threads.maxThreads=2 --poolOptions.threads.minThreads=1`
Expected: FAIL. The loading owner is named "Team member" and reads "TM"; there is no switcher message; each panel sets `status` to "api error 401". The thumbnail test should already PASS, because it pins behaviour that exists; if it fails, the cleanup in `readThumbnail` is wrong, so stop and report.

- [ ] **Step 3: Owners, and the switcher's message**

Replace `packages/editor/src/shell/OwnerAvatars.tsx` with:

```tsx
import { useEditorStore } from "../state/store";
import { Avatar } from "../ui/Avatar";

const NOT_LOADED = "Owner – name not loaded";

/** A person-shaped glyph: initials for a name nobody has seen would read as someone real. */
function UnknownOwner({ size }: { size: number }) {
  const glyph = Math.round(size * 0.6);
  return (
    <span
      role="img"
      aria-label={NOT_LOADED}
      title={NOT_LOADED}
      className="inline-grid shrink-0 place-items-center rounded-full bg-stone-300 text-white"
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 16 16" width={glyph} height={glyph} aria-hidden="true" fill="currentColor">
        <circle cx="8" cy="5" r="3" />
        <path d="M2 15c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5z" />
      </svg>
    </span>
  );
}

/**
 * A floor's owners as overlapping avatars. An id for someone no longer on the
 * team still renders — as "Former teammate" — rather than vanishing, so a
 * floor never looks unowned when it is not.
 *
 * Until the team has loaded, or when it failed to, an id missing from it
 * means nothing: it may simply not have arrived. It renders as a glyph named
 * for exactly that, never as a guess.
 */
export function OwnerAvatars({ ids, size = 22 }: { ids: readonly string[]; size?: number }) {
  const team = useEditorStore(s => s.team);
  const teamStatus = useEditorStore(s => s.teamStatus);
  return (
    <span className="flex -space-x-1.5">
      {ids.map(id => {
        const member = team.find(m => m.id === id);
        return (
          <span key={id} className="rounded-full ring-2 ring-white">
            {member ? (
              <Avatar userId={id} name={member.displayName} size={size} />
            ) : teamStatus === "loaded" ? (
              <Avatar userId={id} name="Former teammate" size={size} />
            ) : (
              <UnknownOwner size={size} />
            )}
          </span>
        );
      })}
    </span>
  );
}
```

In `packages/editor/src/shell/FloorSwitcher.tsx`, add `const teamStatus = useEditorStore(s => s.teamStatus);` under the `me` line. Replace the `{open && ( <ul className="w-80"> … </ul> )}` block with:

```tsx
      {open && (
        <div className="w-80">
          {teamStatus === "error" && (
            <p className="px-2 pb-1 text-xs text-danger">
              Couldn't load the team, so owners show without names. Reload the page to try again.
            </p>
          )}
          <ul>
            {sortedLevels(model).map(level => {
              const to = href({ name: "floor", code: level.code, tab, params: {} });
              const build = model ? floorProgress(model, report, levelImages, level.id).build : null;
              return (
                <li key={level.id}>
                  <PopoverClose asChild>
                    <a
                      href={to}
                      onClick={followLink(to)}
                      className={`flex items-center gap-2 rounded px-2 py-1.5 hover:bg-stone-100 ${
                        level.id === current.id ? "bg-stone-100" : ""
                      }`}
                    >
                      <span className="w-8 font-semibold">{level.code}</span>
                      <span className="min-w-0 flex-1 truncate text-stone-600">{level.nameEn}</span>
                      {mine(level) && <YoursTag />}
                      <OwnerAvatars ids={level.ownerIds} size={20} />
                      {build && (
                        <span className="w-14">
                          <Progress value={build.done} max={build.total} label={`${level.code} build progress`} />
                        </span>
                      )}
                    </a>
                  </PopoverClose>
                </li>
              );
            })}
          </ul>
        </div>
      )}
```

Keep the comment above the block.

- [ ] **Step 4: The Build panels say nothing of their own on a 401**

In `packages/editor/src/panels/FloorplanPanel.tsx`, change `import type { Api } from "../api/client";` to `import { isUnauthorized, type Api } from "../api/client";`. Then add this as the first line of each of the three `catch (err) {` blocks, in `upload`, `saveImage` and `applyScale`:

```ts
      // The sign-in dialog over the page is the message; a raw 401 beside it is noise.
      if (isUnauthorized(err)) return;
```

In `packages/editor/src/panels/AssetLibrary.tsx`, change the import to `import { isUnauthorized, type Api } from "../api/client";`, and add the same two lines as the first lines of the `catch (err) {` block in `upload`.

In `packages/editor/src/panels/PublishButton.tsx`, change the import to `import { isUnauthorized, type Api } from "../api/client";`, and add the same two lines as the first lines of its `catch (err) {` block.

In `packages/editor/src/App.tsx`, replace the docstring `/** The map editor. Only ever rendered signed in: AuthGate sees to that. */` with:

```tsx
/**
 * The map editor — the Build tab, until Plan 3 rebuilds it. It stays mounted
 * through an expired session: AuthGate keeps it behind the sign-in dialog.
 */
```

- [ ] **Step 5: Run the tests and the typecheck**

Run: `npx vitest run packages/editor/src/shell packages/editor/src/panels packages/editor/src/App.test.tsx packages/server/src/images/thumbnail.test.ts --poolOptions.threads.maxThreads=2 --poolOptions.threads.minThreads=1`
Expected: PASS.
Run: `npx tsc -b`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add packages/editor/src/shell/OwnerAvatars.tsx packages/editor/src/shell/OwnerAvatars.test.tsx packages/editor/src/shell/FloorSwitcher.tsx packages/editor/src/shell/Header.test.tsx packages/editor/src/panels/FloorplanPanel.tsx packages/editor/src/panels/FloorplanPanel.test.tsx packages/editor/src/panels/AssetLibrary.tsx packages/editor/src/panels/AssetLibrary.test.tsx packages/editor/src/panels/PublishButton.tsx packages/editor/src/panels/PublishButton.test.tsx packages/editor/src/App.tsx packages/server/src/images/thumbnail.test.ts
git commit -m "fix(editor): honest owners while the team loads; no raw 401s in Build

An owner whose name has not arrived showed as \"TM\", which reads as a
real teammate; it is now a glyph named \"Owner – name not loaded\", and
the floor switcher says when the team could not be loaded at all. The
floorplan, asset and old publish panels leave an expired session to
the sign-in dialog instead of showing \"api error 401\" beside it.

Housekeeping from plan 1: the App docstring no longer claims it only
renders signed in, and the thumbnail test now exercises a failed rename.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---
### Task 3: Server — binning and restoring a frame, on the record

Plan 1 left this for Plan 2 so that frame Undo could rely on it. Binning a frame wrote raw updates: no audit row, no version bump, no transaction. There was also a latent fault: binning an already-binned frame stamped it again, which stranded the sightings binned the first time, so Undo could no longer find them. Survey's Del key (Task 11) makes a double bin likely.

**Files:**
- Modify: `packages/server/src/entities/repository.ts` (`audit` → exported `recordAudit`; `softDeleteEntity` takes the moment)
- Modify: `packages/server/src/survey/routes.ts` (the `DELETE /:id` and `POST /:id/restore` keyframe handlers)
- Test: `packages/server/src/survey/routes.test.ts`

**Interfaces:**
- Produces:
  - `recordAudit(db, entityType: string, entityId: string, action: string, actorId: string | null, before: Row | null, after: Row | null): Promise<void>`.
  - `softDeleteEntity(db, type, id, expectedVersion, actorId, at?: Date)`: `deletedAt` and `updatedAt` are both `at`, which defaults to now.
  - `DELETE /api/keyframes/:id` → 204. A frame that is already binned is left as it is, still 204.
  - `POST /api/keyframes/:id/restore` → `{ sightings: number }`, 404 or 422 as before.
  - Both endpoints run in one transaction, bump each row's version and write an audit row per entity.

- [ ] **Step 1: Write the failing tests**

In `packages/server/src/survey/routes.test.ts`, add these imports:

```ts
import { and, eq } from "drizzle-orm";
import { auditLog, keyframes as keyframeRows, sightings as sightingRows } from "../db/schema";
```

and add at the end of the file:

```ts
describe("binning and restoring a frame, on the record", () => {
  async function taggedFrame(): Promise<string> {
    const body = await json<{ keyframe: { id: string } }>(await grab(png(10, 10)));
    await post("/api/entities/place", { data: { id: "pl_a", nameEn: "Somewhere", category: "retail" } });
    await post("/api/entities/sighting", { data: { id: "sg_a", placeId: "pl_a", keyframeId: body.keyframe.id } });
    return body.keyframe.id;
  }
  const bin = (kf: string) => app.request(`/api/keyframes/${kf}`, { method: "DELETE", headers: { cookie } });
  const restore = (kf: string) => app.request(`/api/keyframes/${kf}/restore`, { method: "POST", headers: { cookie } });
  const frameRow = async (kf: string) => (await db.select().from(keyframeRows).where(eq(keyframeRows.id, kf)))[0]!;
  const tagRow = async (id: string) => (await db.select().from(sightingRows).where(eq(sightingRows.id, id)))[0]!;
  const actions = async (type: string, id: string) =>
    (await db.select().from(auditLog)
      .where(and(eq(auditLog.entityType, type), eq(auditLog.entityId, id)))
      .orderBy(auditLog.at))
      .map(r => r.action);

  it("bins the frame and its tags with one stamp, one version on, each in the audit log", async () => {
    const kf = await taggedFrame();
    expect((await bin(kf)).status).toBe(204);
    const frame = await frameRow(kf);
    const tag = await tagRow("sg_a");
    expect(frame.version).toBe(1);
    expect(tag.version).toBe(1);
    expect(tag.deletedAt?.getTime()).toBe(frame.deletedAt?.getTime());
    expect(await actions("keyframe", kf)).toEqual(["delete"]);
    expect(await actions("sighting", "sg_a")).toEqual(["create", "delete"]);
  });

  it("restores them one version on again, also in the audit log", async () => {
    const kf = await taggedFrame();
    await bin(kf);
    expect(await json(await restore(kf))).toEqual({ sightings: 1 });
    expect((await frameRow(kf)).version).toBe(2);
    expect((await tagRow("sg_a")).deletedAt).toBeNull();
    expect(await actions("keyframe", kf)).toEqual(["delete", "restore"]);
    expect((await actions("sighting", "sg_a")).at(-1)).toBe("restore");
  });

  it("leaves a binned frame as it was when it is binned again, so its tags still come back", async () => {
    // Del pressed twice is the likely way this happens.
    const kf = await taggedFrame();
    await bin(kf);
    expect((await bin(kf)).status).toBe(204);
    expect((await frameRow(kf)).version).toBe(1);
    expect(await json(await restore(kf))).toEqual({ sightings: 1 });
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run packages/server/src/survey/routes.test.ts --poolOptions.threads.maxThreads=2 --poolOptions.threads.minThreads=1`
Expected: FAIL. The versions stay 0, there are no `keyframe` audit rows, and after a second bin the restore reports `sightings: 0`.

- [ ] **Step 3: The repository — audit on record, delete at a given moment**

In `packages/server/src/entities/repository.ts`:

Rename `async function audit(` to `export async function recordAudit(`, add this docstring above it:

```ts
/**
 * One row of the audit log. Exported for the writes that are not generic
 * entities — a keyframe arrives as bytes and has its own routes — so they are
 * on the record like everything else.
 */
```

and replace each of the four `await audit(` calls with `await recordAudit(`.

Replace `softDeleteEntity` with:

```ts
/**
 * `at` lets several rows share one deletion moment, which is how an Undo later
 * finds exactly the rows retired together: a frame and its tags, a rejected
 * place and its tags.
 */
export async function softDeleteEntity(
  db: Database, type: EntityType, id: string, expectedVersion: number, actorId: string | null,
  at: Date = new Date(),
): Promise<Row> {
  const { table } = entityRegistry[type];

  const before = await findRow(db, type, id);
  if (!before) throw new NotFoundError();

  const updated = (await db
    .update(table)
    .set({
      deletedAt: at,
      version: sql`${table.version} + 1`,
      updatedBy: actorId,
      updatedAt: at,
    } as never)
    .where(and(eq(table.id, id), eq(table.version, expectedVersion)))
    .returning()) as Row[];

  const after = updated[0];
  if (!after) throw new VersionConflictError(toModelRow(before));

  await recordAudit(db, type, id, "delete", actorId, before, after);
  return after;
}
```

- [ ] **Step 4: The keyframe routes**

In `packages/server/src/survey/routes.ts`, replace the imports with:

```ts
import { randomUUID } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { Hono } from "hono";
import type { AppEnv } from "../app";
import { readAsset, storeAsset } from "../assets/storage";
import { requireUser } from "../auth/middleware";
import type { Database } from "../db/client";
import type { Row } from "../db/rows";
import { captures, keyframes, sightings } from "../db/schema";
import { toModelRow } from "../db/rows";
import { recordAudit, restoreEntity, softDeleteEntity } from "../entities/repository";
import { IMAGE_MAX_BYTES, InvalidImageError, readImageSize } from "../images/inspect";
import { readThumbnail, thumbnailWidth } from "../images/thumbnail";
```

Replace the `keyframeRoutes.delete("/:id", …)` handler and its docstring with:

```ts
/**
 * Retires a frame and everything said about it.
 *
 * A soft delete, like every other removal here, so a frame binned by mistake is
 * recoverable. The sightings go with it: a label pointing at a frame nobody can
 * see is worse than no label, because it still counts toward a place.
 *
 * One transaction and one moment for the lot, each row one version on and in
 * the audit log. The shared moment is how Undo finds exactly these sightings
 * again, so a frame already binned is left alone: a second stamp would strand
 * the tags binned with the first.
 */
keyframeRoutes.delete("/:id", async c => {
  const id = c.req.param("id");
  const by = c.get("user").id;
  const found = await c.get("db").transaction(async t => {
    const tx = t as unknown as Database;
    const [before] = await tx.select().from(keyframes).where(eq(keyframes.id, id));
    if (!before) return false;
    if (before.deletedAt) return true;

    const at = new Date();
    const tagged = await tx.select().from(sightings)
      .where(and(eq(sightings.keyframeId, id), isNull(sightings.deletedAt)));
    for (const s of tagged) await softDeleteEntity(tx, "sighting", s.id, s.version, by, at);

    const [after] = await tx.update(keyframes)
      .set({ deletedAt: at, version: sql`${keyframes.version} + 1`, updatedBy: by, updatedAt: at })
      .where(eq(keyframes.id, id))
      .returning();
    await recordAudit(tx, "keyframe", id, "delete", by, before as Row, (after ?? null) as Row | null);
    return true;
  });

  if (!found) return c.json({ error: "not found" }, 404);
  return c.body(null, 204);
});
```

Replace the `keyframeRoutes.post("/:id/restore", …)` handler and its docstring with:

```ts
/**
 * Undoes binning a frame.
 *
 * The frame and its sightings were retired at one moment, so that moment is
 * how the right sightings come back: a tag removed by hand earlier has an
 * older one, and stays removed. On the record and in one transaction, like
 * the bin.
 */
keyframeRoutes.post("/:id/restore", async c => {
  const id = c.req.param("id");
  const by = c.get("user").id;
  const result = await c.get("db").transaction(async t => {
    const tx = t as unknown as Database;
    const [before] = await tx.select().from(keyframes).where(eq(keyframes.id, id));
    if (!before) return { status: 404 as const };
    if (!before.deletedAt) return { status: 422 as const };

    const binned = await tx.select().from(sightings)
      .where(and(eq(sightings.keyframeId, id), eq(sightings.deletedAt, before.deletedAt)));
    for (const s of binned) await restoreEntity(tx, "sighting", s.id, s.version, by);

    const [after] = await tx.update(keyframes)
      .set({ deletedAt: null, version: sql`${keyframes.version} + 1`, updatedBy: by, updatedAt: new Date() })
      .where(eq(keyframes.id, id))
      .returning();
    await recordAudit(tx, "keyframe", id, "restore", by, before as Row, (after ?? null) as Row | null);
    return { status: 200 as const, sightings: binned.length };
  });

  if (result.status === 404) return c.json({ error: "not found" }, 404);
  if (result.status === 422) return c.json({ error: "not deleted" }, 422);
  return c.json({ sightings: result.sightings });
});
```

- [ ] **Step 5: Run the tests and the typecheck**

Run: `npx vitest run packages/server/src/survey packages/server/src/entities --poolOptions.threads.maxThreads=2 --poolOptions.threads.minThreads=1`
Expected: PASS, including the earlier "restores a binned frame with the tags binned with it, and not ones removed by hand before".
Run: `npx tsc -b`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/entities/repository.ts packages/server/src/survey/routes.ts packages/server/src/survey/routes.test.ts
git commit -m "fix(server): binning and restoring a frame is audited, transactional and versioned

A frame and its tags now go, and come back, in one transaction, each row
one version on and in the audit log like every other write. Binning a
frame that is already binned leaves it alone: stamping it a second time
stranded the tags binned with the first, which Undo finds by that stamp.

softDeleteEntity takes the moment, so rows retired together share one,
and recordAudit is exported for writes that are not generic entities.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Server — every review decision can be undone: reject and accept

Plan 1's generic restore brings back a rejected place but leaves its tags deleted. Reject also stamped the place and each tag at a slightly different moment, so nothing could tell which tags went with it. Accept has no undo at all. This task gives reject and accept each an exact undo.

**Files:**
- Modify: `packages/server/src/survey/review.ts`
- Modify: `packages/server/src/entities/routes.ts:255-277` (the restore handler)
- Test: `packages/server/src/survey/review.test.ts`

**Interfaces:**
- Consumes: `softDeleteEntity(…, at)`, `restoreEntity` from Task 3's repository.
- Produces:
  - `POST /api/places/:id/accept { expectedVersion, nameEn, category, levelId? }` → `{ sightings: number; confirmed: string[] }`. Only still-proposed tags are confirmed, and `confirmed` lists them. `levelId` files the place under a floor.
  - `POST /api/places/:id/reject { expectedVersion }`: the place and its tags share one `deletedAt`.
  - `POST /api/places/:id/reopen { expectedVersion, nameEn, category, levelId: string | null, sightingIds: string[] }` → `{ sightings: number }`. The place goes back to proposed with those fields, and the listed tags go back to proposed. One transaction.
  - `restorePlace(db, id, expectedVersion, actorId): Promise<{ entity: Row; sightings: number }>`.
  - `POST /api/entities/place/:id/restore` → `{ entity, sightings }`. It brings back the tags that share the place's `deletedAt`.

- [ ] **Step 1: Write the failing tests**

In `packages/server/src/survey/review.test.ts`, add the import `import { eq } from "drizzle-orm";` and `import { places as placeRows, sightings as sightingRows } from "../db/schema";`. Under the `post` helper, add:

```ts
const del = (path: string, body: unknown) =>
  app.request(path, {
    method: "DELETE",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify(body),
  });
```

Inside `describe("accepting a proposal", …)`, add:

```ts
  it("files a place with no floor under the floor it was accepted on", async () => {
    await post("/api/places/pl_1/accept", { expectedVersion: 0, nameEn: "Festive Mall", category: "retail", levelId: "oth-L1" });
    expect((await byId("place")).get("pl_1")?.levelId).toBe("oth-L1");
  });

  it("confirms only the tags that were still claims, and says which, for Undo", async () => {
    await createEntity(db, "sighting", { id: "sg_h", placeId: "pl_1", keyframeId: "kf_3", status: "confirmed" }, null);
    const res = await post("/api/places/pl_1/accept", { expectedVersion: 0, nameEn: "Festive Mall", category: "retail" });
    const body = await json<{ sightings: number; confirmed: string[] }>(res);
    expect(body.sightings).toBe(2);
    expect([...body.confirmed].sort()).toEqual(["sg_1", "sg_2"]);
    // Typed by a person, so already theirs: untouched.
    expect((await byId("sighting")).get("sg_h")?.version).toBe(0);
  });
```

At the end of the file, add:

```ts
describe("undoing a reject", () => {
  it("stamps the place and its tags with one moment", async () => {
    await post("/api/places/pl_1/reject", { expectedVersion: 0 });
    const [place] = await db.select().from(placeRows).where(eq(placeRows.id, "pl_1"));
    const tags = await db.select().from(sightingRows).where(eq(sightingRows.placeId, "pl_1"));
    expect(tags).toHaveLength(2);
    for (const tag of tags) expect(tag.deletedAt?.getTime()).toBe(place!.deletedAt?.getTime());
  });

  it("brings the tags back with the place", async () => {
    await post("/api/places/pl_1/reject", { expectedVersion: 0 });
    const res = await post("/api/entities/place/pl_1/restore", { expectedVersion: 1 });
    expect(res.status).toBe(200);
    expect(await json(res)).toMatchObject({ sightings: 2 });
    expect((await byId("place")).get("pl_1")?.status).toBe("proposed");
    expect([...(await byId("sighting")).keys()].sort()).toEqual(["sg_1", "sg_2", "sg_3"]);
  });

  it("leaves a tag removed by hand before the reject removed", async () => {
    await del("/api/entities/sighting/sg_2", { expectedVersion: 0 });
    // Stamps are to the millisecond; make sure the reject's is a later one.
    await new Promise(resolve => setTimeout(resolve, 5));
    await post("/api/places/pl_1/reject", { expectedVersion: 0 });
    await post("/api/entities/place/pl_1/restore", { expectedVersion: 1 });
    expect([...(await byId("sighting")).keys()].sort()).toEqual(["sg_1", "sg_3"]);
  });

  it("refuses when someone has touched the place since, and brings nothing back", async () => {
    await post("/api/places/pl_1/reject", { expectedVersion: 0 });
    expect((await post("/api/entities/place/pl_1/restore", { expectedVersion: 0 })).status).toBe(409);
    expect((await byId("sighting")).has("sg_1")).toBe(false);
  });
});

describe("undoing an accept", () => {
  async function accepted(): Promise<string[]> {
    await createEntity(db, "sighting", { id: "sg_h", placeId: "pl_1", keyframeId: "kf_3", status: "confirmed" }, null);
    const res = await post("/api/places/pl_1/accept", {
      expectedVersion: 0, nameEn: "Festive Mall", category: "lifestyle", levelId: "oth-L1",
    });
    return (await json<{ confirmed: string[] }>(res)).confirmed;
  }

  it("puts the proposal back as it was, and the tags it confirmed back to claims", async () => {
    const confirmed = await accepted();
    const res = await post("/api/places/pl_1/reopen", {
      expectedVersion: 1, nameEn: "Festve Mall", category: "retail", levelId: null, sightingIds: confirmed,
    });
    expect(res.status).toBe(200);
    expect((await byId("place")).get("pl_1")).toMatchObject({
      status: "proposed", nameEn: "Festve Mall", category: "retail", levelId: null,
    });
    const tags = await byId("sighting");
    expect(tags.get("sg_1")?.status).toBe("proposed");
    expect(tags.get("sg_2")?.status).toBe("proposed");
    expect(tags.get("sg_h")?.status).toBe("confirmed");
  });

  it("refuses when someone has changed the place since, and changes nothing", async () => {
    const confirmed = await accepted();
    const res = await post("/api/places/pl_1/reopen", {
      expectedVersion: 0, nameEn: "Festve Mall", category: "retail", levelId: null, sightingIds: confirmed,
    });
    expect(res.status).toBe(409);
    expect((await byId("place")).get("pl_1")?.status).toBe("confirmed");
    expect((await byId("sighting")).get("sg_1")?.status).toBe("confirmed");
  });

  it("400s a body without what it puts back", async () => {
    expect((await post("/api/places/pl_1/reopen", { expectedVersion: 1 })).status).toBe(400);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run packages/server/src/survey/review.test.ts --poolOptions.threads.maxThreads=2 --poolOptions.threads.minThreads=1`
Expected: FAIL. `levelId` is ignored; `confirmed` is missing; the tags' stamps differ from the place's; restore brings back no tags; `/reopen` is a 404.

- [ ] **Step 3: Reject, accept, reopen and restore**

Replace `packages/server/src/survey/review.ts` with:

```ts
import { and, eq, inArray, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../app";
import { requireUser } from "../auth/middleware";
import type { Database } from "../db/client";
import type { Row } from "../db/rows";
import { places, sightings } from "../db/schema";
import {
  NotDeletedError, NotFoundError, VersionConflictError,
  restoreEntity, softDeleteEntity, updateEntity,
} from "../entities/repository";

const Version = z.number().int().nonnegative();

const AcceptBody = z.object({
  expectedVersion: Version,
  nameEn: z.string().trim().min(1),
  category: z.string(),
  /** Files a place that has no floor of its own under the floor it was reviewed on. */
  levelId: z.string().min(1).optional(),
});
const RejectBody = z.object({ expectedVersion: Version });
const ReopenBody = z.object({
  expectedVersion: Version,
  nameEn: z.string().trim().min(1),
  category: z.string(),
  levelId: z.string().min(1).nullable(),
  sightingIds: z.array(z.string().min(1)),
});

/**
 * Accept or reject what a labelling agent proposed, place and sightings as one.
 *
 * The review queue used to do this as one request per sighting, each followed
 * by a full reload of the model — a dozen round trips for a place seen in
 * eleven frames, with 185 places waiting. It is also one claim, so it commits
 * or fails as one: a stale version leaves every row as it was.
 *
 * Every decision here has an exact undo (spec §10): reject is undone by the
 * generic restore, which brings back the tags that share the place's
 * deletion moment; accept by `reopen`; merge by `unmerge`.
 */
export const placeReviewRoutes = new Hono<AppEnv>();
placeReviewRoutes.use("*", requireUser);

async function sightingsOf(db: Database, placeId: string) {
  return db.select().from(sightings)
    .where(and(eq(sightings.placeId, placeId), isNull(sightings.deletedAt)));
}

function failure(err: unknown) {
  if (err instanceof VersionConflictError) {
    return { body: { error: "version conflict", current: err.current }, status: 409 as const };
  }
  if (err instanceof NotFoundError) return { body: { error: "not found" }, status: 404 as const };
  if (err instanceof NotDeletedError) return { body: { error: "not deleted" }, status: 422 as const };
  return { body: { error: "invalid", detail: String(err) }, status: 422 as const };
}

placeReviewRoutes.post("/:id/accept", async c => {
  const body = AcceptBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: "expected { expectedVersion, nameEn, category }" }, 400);
  const actor = c.get("user").id;
  const id = c.req.param("id");
  const { expectedVersion, nameEn, category, levelId } = body.data;
  try {
    const confirmed = await c.get("db").transaction(async t => {
      const tx = t as unknown as Database;
      await updateEntity(tx, "place", id, expectedVersion, {
        status: "confirmed", nameEn, category, ...(levelId ? { levelId } : {}),
      }, actor);
      // Only what was still a claim. A tag someone typed is theirs already,
      // and Undo has to know exactly which tags this accept changed.
      const claims = (await sightingsOf(tx, id)).filter(s => s.status === "proposed");
      for (const s of claims) {
        await updateEntity(tx, "sighting", s.id, s.version, { status: "confirmed" }, actor);
      }
      return claims.map(s => s.id);
    });
    return c.json({ sightings: confirmed.length, confirmed });
  } catch (err) {
    const { body: out, status } = failure(err);
    return c.json(out, status);
  }
});

placeReviewRoutes.post("/:id/reject", async c => {
  const body = RejectBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: "expected { expectedVersion }" }, 400);
  const actor = c.get("user").id;
  const id = c.req.param("id");
  try {
    const count = await c.get("db").transaction(async t => {
      const tx = t as unknown as Database;
      // Soft, like every removal, and one moment for the place and its tags:
      // that moment is how the restore that undoes this finds them again.
      const at = new Date();
      await softDeleteEntity(tx, "place", id, body.data.expectedVersion, actor, at);
      const seen = await sightingsOf(tx, id);
      for (const s of seen) await softDeleteEntity(tx, "sighting", s.id, s.version, actor, at);
      return seen.length;
    });
    return c.json({ sightings: count });
  } catch (err) {
    const { body: out, status } = failure(err);
    return c.json(out, status);
  }
});

/**
 * Undoes an accept: the place goes back in the queue with the name, category
 * and floor it had, and the tags that accept confirmed go back to being
 * claims. Tags confirmed any other way are left alone, which is why the
 * caller names them.
 */
placeReviewRoutes.post("/:id/reopen", async c => {
  const body = ReopenBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) {
    return c.json({ error: "expected { expectedVersion, nameEn, category, levelId, sightingIds }" }, 400);
  }
  const actor = c.get("user").id;
  const id = c.req.param("id");
  const { expectedVersion, nameEn, category, levelId, sightingIds } = body.data;
  try {
    const count = await c.get("db").transaction(async t => {
      const tx = t as unknown as Database;
      // A null levelId clears it, which is how a place that had no floor gets none back.
      await updateEntity(tx, "place", id, expectedVersion, { status: "proposed", nameEn, category, levelId }, actor);
      if (sightingIds.length === 0) return 0;
      const named = await tx.select().from(sightings).where(and(
        eq(sightings.placeId, id), isNull(sightings.deletedAt), inArray(sightings.id, sightingIds),
      ));
      for (const s of named) {
        if (s.status === "confirmed") {
          await updateEntity(tx, "sighting", s.id, s.version, { status: "proposed" }, actor);
        }
      }
      return named.length;
    });
    return c.json({ sightings: count });
  } catch (err) {
    const { body: out, status } = failure(err);
    return c.json(out, status);
  }
});

/**
 * Brings back a rejected place with the tags rejected with it.
 *
 * Reject stamps the place and its tags with one moment, so that moment is how
 * the right tags come back: one removed by hand before has an older stamp and
 * stays removed. One transaction, like the reject. Used by the generic
 * restore route, so an Undo needs no special case on the client.
 */
export async function restorePlace(
  db: Database, id: string, expectedVersion: number, actorId: string,
): Promise<{ entity: Row; sightings: number }> {
  return db.transaction(async t => {
    const tx = t as unknown as Database;
    const [row] = await tx.select().from(places).where(eq(places.id, id));
    if (!row) throw new NotFoundError();
    // Refuses anything not deleted, or touched since, before a tag is touched.
    const entity = await restoreEntity(tx, "place", id, expectedVersion, actorId);
    const binned = await tx.select().from(sightings)
      .where(and(eq(sightings.placeId, id), eq(sightings.deletedAt, row.deletedAt!)));
    for (const s of binned) await restoreEntity(tx, "sighting", s.id, s.version, actorId);
    return { entity, sightings: binned.length };
  });
}
```

- [ ] **Step 4: The generic restore brings back a place's tags**

In `packages/server/src/entities/routes.ts`, add `import { restorePlace } from "../survey/review";` to the imports, and replace the `try { … }` inside `entityRoutes.post("/:type/:id/restore", …)` with:

```ts
  try {
    // A rejected place comes back with the tags rejected with it.
    if (type === "place") {
      return c.json(await restorePlace(c.get("db"), c.req.param("id"), body.data.expectedVersion, c.get("user").id));
    }
    const entity = await restoreEntity(
      c.get("db"), type, c.req.param("id"), body.data.expectedVersion, c.get("user").id,
    );
    return c.json({ entity });
  } catch (err) {
    if (err instanceof VersionConflictError) {
      return c.json({ error: "version conflict", current: err.current }, 409);
    }
    if (err instanceof NotDeletedError) return c.json({ error: "not deleted" }, 422);
    return c.json({ error: "not found" }, 404);
  }
```

- [ ] **Step 5: Run the tests and the typecheck**

Run: `npx vitest run packages/server/src/survey packages/server/src/entities --poolOptions.threads.maxThreads=2 --poolOptions.threads.minThreads=1`
Expected: PASS.
Run: `npx tsc -b`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/survey/review.ts packages/server/src/survey/review.test.ts packages/server/src/entities/routes.ts
git commit -m "feat(server): undo for review decisions — a rejected place comes back with its tags

Reject now stamps a place and its tags with one moment, and restoring the
place brings back exactly the tags with that stamp, in one transaction;
a tag removed by hand before keeps its own stamp and stays removed.

Accept confirms only the tags that were still claims and says which, and
can file a place with no floor under the floor it was reviewed on.
POST /places/:id/reopen undoes it exactly: the name, category and floor
it had, and those tags back to claims.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Server — "Same as…": merge a proposal into a place already on the map, and undo it

Spec §5.3 and §10. The real data has exactly this case: the proposal "Gate 1" and the confirmed "Gate 1" on L1, and the same for Gates 2 to 6.

**Files:**
- Modify: `packages/server/src/survey/review.ts`
- Test: `packages/server/src/survey/review.test.ts`

**Interfaces:**
- Consumes: Task 4's `placeReviewRoutes`, `sightingsOf`, `failure`, `Version`.
- Produces:
  - `POST /api/places/:id/merge { expectedVersion, into }` → `{ moved: Array<{ id: string; status: "proposed" | "confirmed" }> }`. The tags move to `into` and become confirmed, and the proposal is retired, in one transaction. Merging a place into itself is 422; a missing or deleted `into` is 404.
  - `POST /api/places/:id/unmerge { expectedVersion, moved }` → `{ sightings: number }`. The proposal comes back, and each moved tag returns to it with the status it had. A place that is not deleted is 422.

- [ ] **Step 1: Write the failing tests**

At the end of `packages/server/src/survey/review.test.ts`, add:

```ts
describe("Same as…", () => {
  // The place already on the map that the proposal turns out to be.
  beforeEach(async () => {
    await createEntity(db, "place", {
      id: "pl_c", nameEn: "Festive Mall", category: "retail", status: "confirmed", levelId: "oth-L1",
    }, null);
  });

  type Moved = { id: string; status: string };
  const byIdOrder = (a: Moved, b: Moved) => a.id.localeCompare(b.id);

  it("moves the proposal's tags to that place, confirmed, and retires the proposal", async () => {
    const res = await post("/api/places/pl_1/merge", { expectedVersion: 0, into: "pl_c" });
    expect(res.status).toBe(200);
    const body = await json<{ moved: Moved[] }>(res);
    expect([...body.moved].sort(byIdOrder)).toEqual([
      { id: "sg_1", status: "proposed" }, { id: "sg_2", status: "proposed" },
    ]);
    expect((await byId("place")).has("pl_1")).toBe(false);
    const tags = await byId("sighting");
    expect(tags.get("sg_1")).toMatchObject({ placeId: "pl_c", status: "confirmed" });
    expect(tags.get("sg_2")).toMatchObject({ placeId: "pl_c", status: "confirmed" });
    expect(tags.get("sg_3")?.placeId).toBe("pl_2");
  });

  it("refuses to merge a place into itself", async () => {
    expect((await post("/api/places/pl_1/merge", { expectedVersion: 0, into: "pl_1" })).status).toBe(422);
  });

  it("404s a place to merge into that is gone, and changes nothing", async () => {
    await post("/api/places/pl_2/reject", { expectedVersion: 0 });
    expect((await post("/api/places/pl_1/merge", { expectedVersion: 0, into: "pl_2" })).status).toBe(404);
    expect((await byId("place")).has("pl_1")).toBe(true);
  });

  it("refuses a stale version and moves nothing", async () => {
    expect((await post("/api/places/pl_1/merge", { expectedVersion: 5, into: "pl_c" })).status).toBe(409);
    expect((await byId("sighting")).get("sg_1")?.placeId).toBe("pl_1");
  });

  it("is undone exactly: the proposal back, each tag back to it as it stood", async () => {
    await createEntity(db, "sighting", { id: "sg_h", placeId: "pl_1", keyframeId: "kf_3", status: "confirmed" }, null);
    const merged = await json<{ moved: Moved[] }>(await post("/api/places/pl_1/merge", { expectedVersion: 0, into: "pl_c" }));
    const res = await post("/api/places/pl_1/unmerge", { expectedVersion: 1, moved: merged.moved });
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ sightings: 3 });
    expect((await byId("place")).get("pl_1")?.status).toBe("proposed");
    const tags = await byId("sighting");
    expect(tags.get("sg_1")).toMatchObject({ placeId: "pl_1", status: "proposed" });
    expect(tags.get("sg_h")).toMatchObject({ placeId: "pl_1", status: "confirmed" });
  });

  it("refuses to unmerge a place that was never merged away", async () => {
    expect((await post("/api/places/pl_1/unmerge", { expectedVersion: 0, moved: [] })).status).toBe(422);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run packages/server/src/survey/review.test.ts --poolOptions.threads.maxThreads=2 --poolOptions.threads.minThreads=1`
Expected: FAIL. `/merge` and `/unmerge` are 404s.

- [ ] **Step 3: Merge and unmerge**

In `packages/server/src/survey/review.ts`, under `const ReopenBody = …;`, add:

```ts
const MergeBody = z.object({ expectedVersion: Version, into: z.string().min(1) });
const MovedSighting = z.object({ id: z.string().min(1), status: z.enum(["proposed", "confirmed"]) });
const UnmergeBody = z.object({ expectedVersion: Version, moved: z.array(MovedSighting) });
```

Directly above `export async function restorePlace`, add:

```ts
/**
 * "Same as…" (spec §10): the proposal was a place already on the map. Its
 * tags move to that place, confirmed — a person has just said what they show
 * — and the proposal is retired, all in one transaction. The response lists
 * what moved and how each stood, which is exactly what `unmerge` takes back.
 */
placeReviewRoutes.post("/:id/merge", async c => {
  const body = MergeBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: "expected { expectedVersion, into }" }, 400);
  const id = c.req.param("id");
  if (body.data.into === id) return c.json({ error: "a place cannot be merged into itself" }, 422);
  const actor = c.get("user").id;
  try {
    const moved = await c.get("db").transaction(async t => {
      const tx = t as unknown as Database;
      const [target] = await tx.select().from(places)
        .where(and(eq(places.id, body.data.into), isNull(places.deletedAt)));
      if (!target) throw new NotFoundError();
      const tags = await sightingsOf(tx, id);
      // The proposal's version is the check that matters, so it goes first.
      await softDeleteEntity(tx, "place", id, body.data.expectedVersion, actor);
      for (const s of tags) {
        await updateEntity(tx, "sighting", s.id, s.version, { placeId: body.data.into, status: "confirmed" }, actor);
      }
      return tags.map(s => ({ id: s.id, status: s.status }));
    });
    return c.json({ moved });
  } catch (err) {
    const { body: out, status } = failure(err);
    return c.json(out, status);
  }
});

/**
 * Undoes a merge: the proposal comes back, and each tag that moved returns to
 * it as it stood. A tag removed since stays removed.
 */
placeReviewRoutes.post("/:id/unmerge", async c => {
  const body = UnmergeBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: "expected { expectedVersion, moved }" }, 400);
  const id = c.req.param("id");
  const actor = c.get("user").id;
  try {
    const count = await c.get("db").transaction(async t => {
      const tx = t as unknown as Database;
      await restoreEntity(tx, "place", id, body.data.expectedVersion, actor);
      const was = new Map(body.data.moved.map(m => [m.id, m.status]));
      if (was.size === 0) return 0;
      const tags = await tx.select().from(sightings)
        .where(and(inArray(sightings.id, [...was.keys()]), isNull(sightings.deletedAt)));
      for (const s of tags) {
        await updateEntity(tx, "sighting", s.id, s.version, { placeId: id, status: was.get(s.id)! }, actor);
      }
      return tags.length;
    });
    return c.json({ sightings: count });
  } catch (err) {
    const { body: out, status } = failure(err);
    return c.json(out, status);
  }
});
```

- [ ] **Step 4: Run the tests and the typecheck**

Run: `npx vitest run packages/server/src/survey/review.test.ts --poolOptions.threads.maxThreads=2 --poolOptions.threads.minThreads=1`
Expected: PASS.
Run: `npx tsc -b`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/survey/review.ts packages/server/src/survey/review.test.ts
git commit -m "feat(server): merge a proposal into a place already on the map, and undo it

POST /places/:id/merge is Review's \"Same as…\": the proposal's tags move
to the existing place, confirmed, and the proposal is retired, in one
transaction — the real survey has a proposed Gate 1 beside the confirmed
one, and Gates 2 to 6 the same. The response lists what moved and how
each tag stood, and POST /places/:id/unmerge takes exactly that back.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---
### Task 6: Survey, as pure functions — which frames need work, and which frame you are on

Spec §9 and §5.1. The spec's filter terms are: **Untagged** — no sighting; **Proposed** — at least one proposed sighting; **Tagged** — at least one sighting, all confirmed. The URL `?capture=&frame=&view=grid&filter=untagged` is read leniently: anything unknown falls back to the nearest valid view.

**Files:**
- Create: `packages/editor/src/survey/frameStatus.ts`, `packages/editor/src/survey/surveyView.ts`
- Test: `packages/editor/src/survey/frameStatus.test.ts`, `packages/editor/src/survey/surveyView.test.ts`

**Interfaces:**
- Consumes: `orderFrames` from `survey/frames.ts`; `live` from `@oth/model`.
- Produces:
  - `type FrameStatus = "untagged" | "proposed" | "tagged"`; `type SurveyFilter = "all" | FrameStatus`; `SURVEY_FILTERS: readonly SurveyFilter[]`.
  - `frameStatuses(model: MapModel | null): Map<string, FrameStatus>`. A frame with no tag is absent from the map.
  - `statusOf(statuses: ReadonlyMap<string, FrameStatus>, frameId: string): FrameStatus`.
  - `matchesFilter(status: FrameStatus, filter: SurveyFilter): boolean`.
  - `filterCounts(frameIds: readonly string[], statuses): Record<SurveyFilter, number>`.
  - `type SurveyParams = { capture: string | null; frame: string | null; view: "frame" | "grid"; filter: SurveyFilter; place: string | null }` and `readSurveyParams(params: Record<string, string>): SurveyParams`.
  - `type SurveyView = { captures: Capture[]; unfiled: Capture[]; capture: Capture | null; frames: Keyframe[]; statuses: Map<string, FrameStatus>; counts: Record<SurveyFilter, number>; shown: Keyframe[]; frame: Keyframe | null; index: number; place: Place | null }` and `surveyView(model: MapModel | null, levelId: string, params: SurveyParams): SurveyView`.
  - `stepFrame(view: SurveyView, direction: 1 | -1): Keyframe | null`.
  - `nextUntagged(view: SurveyView): Keyframe | null`.
  - `frameTime(timeMs: number): string` (`424000` → `"7m04s"`).

- [ ] **Step 1: Write the failing tests**

Create `packages/editor/src/survey/frameStatus.test.ts`:

```ts
import { parseModel } from "@oth/model";
import { describe, expect, it } from "vitest";
import { filterCounts, frameStatuses, matchesFilter, statusOf } from "./frameStatus";

const model = parseModel({
  building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
  captures: [{ id: "cap_1", kind: "video", filename: "a.mp4" }],
  keyframes: ["kf_1", "kf_2", "kf_3", "kf_4"].map((id, i) => ({
    id, captureId: "cap_1", timeMs: i * 1000, imageId: id, widthPx: 64, heightPx: 36,
  })),
  places: [
    { id: "p_mine", nameEn: "Kopitiam", category: "retail" },
    { id: "p_prop", nameEn: "Festive Mall", category: "retail", status: "proposed" },
    { id: "p_gone", nameEn: "Gone", category: "retail", deletedAt: "2026-09-01T00:00:00.000Z" },
  ],
  sightings: [
    { id: "s1", placeId: "p_mine", keyframeId: "kf_1" },
    { id: "s2", placeId: "p_prop", keyframeId: "kf_2", status: "proposed" },
    { id: "s3", placeId: "p_mine", keyframeId: "kf_2" },
    { id: "s4", placeId: "p_gone", keyframeId: "kf_3" },
  ],
});

describe("frameStatuses", () => {
  const statuses = frameStatuses(model);

  it("calls a frame whose tags are all confirmed tagged", () => {
    expect(statusOf(statuses, "kf_1")).toBe("tagged");
  });

  it("calls a frame with any proposed tag proposed, whatever else is on it", () => {
    expect(statusOf(statuses, "kf_2")).toBe("proposed");
  });

  it("counts a tag of a deleted place for nothing", () => {
    expect(statusOf(statuses, "kf_3")).toBe("untagged");
  });

  it("calls a frame nobody has tagged untagged", () => {
    expect(statusOf(statuses, "kf_4")).toBe("untagged");
  });

  it("is empty, not broken, before the model loads", () => {
    expect(frameStatuses(null).size).toBe(0);
  });
});

describe("filters", () => {
  it("lets everything through All, and only its own status through the rest", () => {
    expect(matchesFilter("proposed", "all")).toBe(true);
    expect(matchesFilter("proposed", "proposed")).toBe(true);
    expect(matchesFilter("proposed", "tagged")).toBe(false);
  });

  it("counts the frames under each filter", () => {
    expect(filterCounts(["kf_1", "kf_2", "kf_3", "kf_4"], frameStatuses(model)))
      .toEqual({ all: 4, untagged: 2, proposed: 1, tagged: 1 });
  });
});
```

Create `packages/editor/src/survey/surveyView.test.ts`:

```ts
import { parseModel } from "@oth/model";
import { describe, expect, it } from "vitest";
import { frameTime, nextUntagged, readSurveyParams, stepFrame, surveyView, type SurveyParams } from "./surveyView";

const frame = (id: string, captureId: string, timeMs: number) =>
  ({ id, captureId, timeMs, imageId: id, widthPx: 64, heightPx: 36 });

const model = parseModel({
  building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
  levels: [
    { id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6 },
    { id: "oth-L2", buildingId: "oth", code: "L2", ordinal: 2, nameEn: "L2", nameZh: "二楼", elevationM: 6, heightM: 4 },
  ],
  captures: [
    { id: "cap_b", kind: "video", filename: "B walk.mp4", levelId: "oth-L1" },
    { id: "cap_a", kind: "video", filename: "A walk.mp4", levelId: "oth-L1" },
    { id: "cap_2", kind: "video", filename: "L2 walk.mp4", levelId: "oth-L2" },
    { id: "cap_u", kind: "video", filename: "level 1" },
  ],
  keyframes: [
    frame("kf_3", "cap_a", 3000), frame("kf_1", "cap_a", 1000), frame("kf_2", "cap_a", 2000),
    frame("kf_4", "cap_a", 4000), frame("kf_b", "cap_b", 0),
  ],
  places: [
    { id: "p_mine", nameEn: "Kopitiam", category: "retail", levelId: "oth-L1" },
    { id: "p_prop", nameEn: "Festive Mall", category: "retail", status: "proposed" },
  ],
  sightings: [
    { id: "s1", placeId: "p_mine", keyframeId: "kf_1" },
    { id: "s2", placeId: "p_prop", keyframeId: "kf_2", status: "proposed" },
    { id: "s3", placeId: "p_mine", keyframeId: "kf_2" },
  ],
});

const at = (params: Partial<SurveyParams> = {}, levelId = "oth-L1") =>
  surveyView(model, levelId, { ...readSurveyParams({}), ...params });
const ids = (frames: { id: string }[]) => frames.map(f => f.id);

describe("readSurveyParams", () => {
  it("reads the address as given", () => {
    expect(readSurveyParams({ capture: "cap_a", frame: "kf_2", view: "grid", filter: "untagged", place: "p_mine" }))
      .toEqual({ capture: "cap_a", frame: "kf_2", view: "grid", filter: "untagged", place: "p_mine" });
  });

  it("falls back to the defaults for anything it does not know", () => {
    expect(readSurveyParams({ view: "list", filter: "bogus" }))
      .toEqual({ capture: null, frame: null, view: "frame", filter: "all", place: null });
  });
});

describe("surveyView", () => {
  it("lists this floor's footage by name, and footage on no floor apart", () => {
    const view = at();
    expect(view.captures.map(c => c.id)).toEqual(["cap_a", "cap_b"]);
    expect(view.unfiled.map(c => c.id)).toEqual(["cap_u"]);
  });

  it("opens the first footage when none is asked for, or when the one asked for is on another floor", () => {
    expect(at().capture?.id).toBe("cap_a");
    expect(at({ capture: "cap_2" }).capture?.id).toBe("cap_a");
  });

  it("opens the footage a frame belongs to when only the frame is given", () => {
    expect(at({ frame: "kf_b" }).capture?.id).toBe("cap_b");
  });

  it("puts the frames on their timeline", () => {
    expect(ids(at().frames)).toEqual(["kf_1", "kf_2", "kf_3", "kf_4"]);
  });

  it("opens on the first frame with no tag, when no frame is asked for", () => {
    const view = at();
    expect(view.frame?.id).toBe("kf_3");
    expect(view.index).toBe(2);
  });

  it("counts each filter over the footage in view", () => {
    expect(at().counts).toEqual({ all: 4, untagged: 2, proposed: 1, tagged: 1 });
  });

  it("opens the frame asked for even when the filter would hide it, and keeps it in the strip", () => {
    const view = at({ frame: "kf_1", filter: "untagged" });
    expect(view.frame?.id).toBe("kf_1");
    expect(ids(view.shown)).toEqual(["kf_1", "kf_3", "kf_4"]);
  });

  it("falls back to a frame of the footage when the one asked for is not in it", () => {
    expect(at({ capture: "cap_a", frame: "kf_b" }).frame?.id).toBe("kf_3");
  });

  it("shows only the frames a chosen place was seen in", () => {
    const view = at({ place: "p_mine" });
    expect(view.place?.id).toBe("p_mine");
    expect(ids(view.shown)).toEqual(["kf_1", "kf_2"]);
    expect(view.frame?.id).toBe("kf_1");
  });

  it("ignores a place that does not exist and applies the filter instead", () => {
    const view = at({ place: "p_nope", filter: "tagged" });
    expect(view.place).toBeNull();
    expect(ids(view.shown)).toEqual(["kf_1"]);
  });

  it("has no frame, not a broken one, when nothing passes the filter", () => {
    const empty = parseModel({ ...model, sightings: [] });
    const view = surveyView(empty, "oth-L1", { ...readSurveyParams({}), filter: "tagged" });
    expect(view.frame).toBeNull();
    expect(view.shown).toEqual([]);
    expect(view.index).toBe(-1);
  });

  it("has footage but no frames on a floor where nothing was grabbed yet", () => {
    const view = at({}, "oth-L2");
    expect(view.capture?.id).toBe("cap_2");
    expect(view.frames).toEqual([]);
    expect(view.frame).toBeNull();
  });

  it("is empty, not broken, before the model loads", () => {
    const view = surveyView(null, "oth-L1", readSurveyParams({}));
    expect(view.captures).toEqual([]);
    expect(view.frame).toBeNull();
    expect(view.index).toBe(-1);
  });
});

describe("stepping through frames", () => {
  it("moves to the next frame the filter lets through, from where you are", () => {
    expect(stepFrame(at({ frame: "kf_1", filter: "untagged" }), 1)?.id).toBe("kf_3");
  });

  it("moves back the same way", () => {
    expect(stepFrame(at({ frame: "kf_4", filter: "untagged" }), -1)?.id).toBe("kf_3");
  });

  it("stops at either end rather than wrapping without saying so", () => {
    expect(stepFrame(at({ frame: "kf_4" }), 1)).toBeNull();
    expect(stepFrame(at({ frame: "kf_1" }), -1)).toBeNull();
  });
});

describe("nextUntagged", () => {
  it("finds the next frame with no tag after this one", () => {
    expect(nextUntagged(at({ frame: "kf_1" }))?.id).toBe("kf_3");
  });

  it("wraps once to the start of the footage", () => {
    expect(nextUntagged(at({ frame: "kf_4" }))?.id).toBe("kf_3");
  });

  it("says there is none when every other frame has a tag", () => {
    const tagged = parseModel({
      ...model,
      sightings: ["kf_1", "kf_2", "kf_3", "kf_4"].map((kf, i) => ({ id: `t${i}`, placeId: "p_mine", keyframeId: kf })),
    });
    expect(nextUntagged(surveyView(tagged, "oth-L1", readSurveyParams({})))).toBeNull();
  });
});

describe("frameTime", () => {
  it("writes a moment the way the top row shows it", () => {
    expect(frameTime(424000)).toBe("7m04s");
    expect(frameTime(0)).toBe("0m00s");
    expect(frameTime(3_600_000)).toBe("60m00s");
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run packages/editor/src/survey/frameStatus.test.ts packages/editor/src/survey/surveyView.test.ts --poolOptions.threads.maxThreads=2 --poolOptions.threads.minThreads=1`
Expected: FAIL — `./frameStatus` and `./surveyView` do not resolve.

- [ ] **Step 3: Write `frameStatus.ts`**

Create `packages/editor/src/survey/frameStatus.ts`:

```ts
import { live, type MapModel } from "@oth/model";

/** Where a frame stands, as its stripe and the filters say it. */
export type FrameStatus = "untagged" | "proposed" | "tagged";

export type SurveyFilter = "all" | FrameStatus;
export const SURVEY_FILTERS: readonly SurveyFilter[] = ["all", "untagged", "proposed", "tagged"];

/**
 * Every frame's status, in one pass (spec §5.3): Untagged — no sighting;
 * Proposed — at least one proposed sighting; Tagged — at least one sighting,
 * all confirmed. A tag of a deleted place counts for nothing, as everywhere
 * else. A frame nobody tagged is simply absent.
 */
export function frameStatuses(model: MapModel | null): Map<string, FrameStatus> {
  const out = new Map<string, FrameStatus>();
  if (!model) return out;
  const places = new Set(live(model.places).map(p => p.id));
  for (const s of live(model.sightings)) {
    if (!places.has(s.placeId)) continue;
    if (s.status === "proposed") out.set(s.keyframeId, "proposed");
    else if (!out.has(s.keyframeId)) out.set(s.keyframeId, "tagged");
  }
  return out;
}

export function statusOf(statuses: ReadonlyMap<string, FrameStatus>, frameId: string): FrameStatus {
  return statuses.get(frameId) ?? "untagged";
}

export function matchesFilter(status: FrameStatus, filter: SurveyFilter): boolean {
  return filter === "all" || status === filter;
}

/** The numbers on the filter chips, over one set of frames. */
export function filterCounts(
  frameIds: readonly string[], statuses: ReadonlyMap<string, FrameStatus>,
): Record<SurveyFilter, number> {
  const counts: Record<SurveyFilter, number> = { all: frameIds.length, untagged: 0, proposed: 0, tagged: 0 };
  for (const id of frameIds) counts[statusOf(statuses, id)] += 1;
  return counts;
}
```

- [ ] **Step 4: Write `surveyView.ts`**

Create `packages/editor/src/survey/surveyView.ts`:

```ts
import { live, type Capture, type Keyframe, type MapModel, type Place } from "@oth/model";
import {
  SURVEY_FILTERS, filterCounts, frameStatuses, matchesFilter, statusOf,
  type FrameStatus, type SurveyFilter,
} from "./frameStatus";
import { orderFrames } from "./frames";

export type SurveyParams = {
  capture: string | null;
  frame: string | null;
  view: "frame" | "grid";
  filter: SurveyFilter;
  /** A place chosen in the side panel: only the frames it was seen in. */
  place: string | null;
};

/** The address, read leniently: anything unknown is the default, never a blank screen (spec §5.1). */
export function readSurveyParams(params: Record<string, string>): SurveyParams {
  const filter = (SURVEY_FILTERS as readonly string[]).includes(params.filter ?? "")
    ? (params.filter as SurveyFilter)
    : "all";
  return {
    capture: params.capture || null,
    frame: params.frame || null,
    view: params.view === "grid" ? "grid" : "frame",
    filter,
    place: params.place || null,
  };
}

export type SurveyView = {
  /** Footage filed under this floor, by name. */
  captures: Capture[];
  /** Footage filed under no floor yet: offered for filing, not for tagging. */
  unfiled: Capture[];
  capture: Capture | null;
  /** The capture's frames, on its timeline. */
  frames: Keyframe[];
  statuses: Map<string, FrameStatus>;
  counts: Record<SurveyFilter, number>;
  /** What the filter lets through — plus the frame in view, even once it no longer matches. */
  shown: Keyframe[];
  frame: Keyframe | null;
  /** The frame's position in `frames`, from 0; -1 with no frame. */
  index: number;
  /** The place filter, when it names a place that exists. */
  place: Place | null;
};

/**
 * Everything the survey shows for one floor and one address.
 *
 * With no frame asked for, it opens on the first frame the filter lets through
 * that has no tag — the next piece of work — or else the first it lets
 * through. The frame in view stays in `shown` after it is tagged, so tagging
 * it does not make it vanish from under you; the arrow keys then move on.
 */
export function surveyView(model: MapModel | null, levelId: string, params: SurveyParams): SurveyView {
  const statuses = frameStatuses(model);
  if (!model) {
    return {
      captures: [], unfiled: [], capture: null, frames: [], statuses,
      counts: filterCounts([], statuses), shown: [], frame: null, index: -1, place: null,
    };
  }

  const footage = live(model.captures);
  const captures = footage.filter(c => c.levelId === levelId).sort((a, b) => a.filename.localeCompare(b.filename));
  const unfiled = footage.filter(c => !c.levelId);
  const asked = params.frame ? live(model.keyframes).find(k => k.id === params.frame) : undefined;
  const capture =
    captures.find(c => c.id === params.capture) ??
    captures.find(c => c.id === asked?.captureId) ??
    captures[0] ??
    null;

  const frames = capture ? orderFrames(live(model.keyframes).filter(k => k.captureId === capture.id)) : [];
  const counts = filterCounts(frames.map(f => f.id), statuses);
  const place = (params.place && live(model.places).find(p => p.id === params.place)) || null;
  const seenIn = place
    ? new Set(live(model.sightings).filter(s => s.placeId === place.id).map(s => s.keyframeId))
    : null;
  const passes = (f: Keyframe) =>
    seenIn ? seenIn.has(f.id) : matchesFilter(statusOf(statuses, f.id), params.filter);

  const frame =
    frames.find(f => f.id === params.frame) ??
    frames.find(f => passes(f) && statusOf(statuses, f.id) === "untagged") ??
    frames.find(passes) ??
    null;
  const shown = frames.filter(f => passes(f) || f.id === frame?.id);

  return {
    captures, unfiled, capture, frames, statuses, counts, shown, frame,
    index: frame ? frames.indexOf(frame) : -1,
    place,
  };
}

/**
 * The next or previous frame the filter lets through, from where you are —
 * which may itself no longer match, having just been tagged. Stops at the
 * ends: wrapping would jump from the end of the walkthrough to its start
 * without saying so.
 */
export function stepFrame(view: SurveyView, direction: 1 | -1): Keyframe | null {
  if (!view.frame) return view.shown[0] ?? null;
  const at = view.shown.findIndex(f => f.id === view.frame!.id);
  return view.shown[at + direction] ?? null;
}

/** N: the next frame with no tag after this one, wrapping once to the start; null when there is none. */
export function nextUntagged(view: SurveyView): Keyframe | null {
  const n = view.frames.length;
  for (let k = 1; k <= n; k++) {
    const f = view.frames[(view.index + k + n) % n]!;
    if (f.id !== view.frame?.id && statusOf(view.statuses, f.id) === "untagged") return f;
  }
  return null;
}

/** `424000` → `"7m04s"`, as the top row shows a moment. */
export function frameTime(timeMs: number): string {
  const total = Math.max(0, Math.floor(timeMs / 1000));
  return `${Math.floor(total / 60)}m${String(total % 60).padStart(2, "0")}s`;
}
```

- [ ] **Step 5: Run the tests and the typecheck**

Run: `npx vitest run packages/editor/src/survey/frameStatus.test.ts packages/editor/src/survey/surveyView.test.ts --poolOptions.threads.maxThreads=2 --poolOptions.threads.minThreads=1`
Expected: PASS.
Run: `npx tsc -b`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add packages/editor/src/survey/frameStatus.ts packages/editor/src/survey/frameStatus.test.ts packages/editor/src/survey/surveyView.ts packages/editor/src/survey/surveyView.test.ts
git commit -m "feat(editor): the survey as pure functions — frame status, filters, and where you are

Untagged, Proposed and Tagged mean what the spec says, from one pass
over the sightings. One function turns the address — capture, frame,
view, filter, place — into what the survey shows, falling back to the
nearest sensible view for anything it cannot use, and opening on the
next frame with no tag. Footage filed under no floor is kept apart, to
be offered for filing rather than lost.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Keys, name suggestions, and what a tag writes

Spec §9 and §10 define the keys, and §14 wants every key map tested exhaustively. Keys are inactive while typing. The name field's suggestions list this floor's places first, with their sighting counts. This task also moves the pieces of the old `SurveyApp.tag` that decide what gets written into a tested function.

**Files:**
- Create: `packages/editor/src/ui/keys.ts`, `packages/editor/src/survey/keys.ts`, `packages/editor/src/review/keys.ts`, `packages/editor/src/survey/suggest.ts`, `packages/editor/src/survey/tagging.ts`
- Test: `packages/editor/src/ui/keys.test.tsx`, `packages/editor/src/survey/keys.test.ts`, `packages/editor/src/review/keys.test.ts`, `packages/editor/src/survey/suggest.test.ts`, `packages/editor/src/survey/tagging.test.ts`

**Interfaces:**
- Consumes: `matchPlaces` from `survey/places.ts`.
- Produces:
  - `isTypingTarget(target: EventTarget | null): boolean`.
  - `ignoreKey(event: Pick<KeyboardEvent, "key" | "target" | "ctrlKey" | "metaKey" | "altKey" | "defaultPrevented">): boolean`.
  - `useKeys(onKey: (event: KeyboardEvent) => void): void`.
  - `type SurveyCommand = "prev" | "next" | "nextUntagged" | "focusName" | "tag" | "dropBox" | "bin" | "toggleGrid"` and `surveyCommand(key: string): SurveyCommand | null`.
  - `type ReviewCommand = "accept" | "reject" | "skip" | "list" | "closeList" | "prevFrame" | "nextFrame"` and `reviewCommand(key: string): ReviewCommand | null`.
  - `normalName(name: string): string`.
  - `linkablePlaces(places, levels, levelId): Place[]`.
  - `type Suggestion = { place: Place; count: number; onFloor: boolean }` and `suggestPlaces(candidates, levels, levelId, query, counts): Suggestion[]`.
  - `exactPlace(candidates, levels, levelId, name): Place | null`.
  - `type Tag = { placeId: string | null; nameEn: string; category: TenantCategory; pathwayKindId?: string; box?: Box }`.
  - `newId(prefix: string, now?: number, random?: () => number): string`.
  - `tagWrites(tag: Tag, frameId: string, levelId: string, id?: (prefix: string) => string): { place: Record<string, unknown> | null; sighting: Record<string, unknown> }`.
  - `drawnBox(box: Box | null): Box | undefined`.
  - `walkwayColour(existing: number): string`.
  - Here `levels` is a `ReadonlyMap<string, string | undefined>` from `placeLevels`, and `counts` a `ReadonlyMap<string, number>`.

- [ ] **Step 1: Write the failing tests**

Create `packages/editor/src/ui/keys.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ignoreKey, isTypingTarget, useKeys } from "./keys";

function element(html: string): Element {
  const host = document.createElement("div");
  host.innerHTML = html;
  document.body.append(host);
  return host.firstElementChild!;
}

const press = (target: EventTarget | null, key = "a", extra: Partial<KeyboardEvent> = {}) => ({
  key, target, ctrlKey: false, metaKey: false, altKey: false, defaultPrevented: false, ...extra,
});

describe("isTypingTarget", () => {
  it("is true where a letter becomes text", () => {
    expect(isTypingTarget(element(`<input type="text">`))).toBe(true);
    expect(isTypingTarget(element(`<input type="search">`))).toBe(true);
    expect(isTypingTarget(element(`<textarea></textarea>`))).toBe(true);
    expect(isTypingTarget(element(`<select><option>a</option></select>`))).toBe(true);
    expect(isTypingTarget(element(`<div contenteditable="true"><span>x</span></div>`).firstElementChild)).toBe(true);
  });

  it("is false for controls a letter does not type into", () => {
    expect(isTypingTarget(element(`<input type="checkbox">`))).toBe(false);
    expect(isTypingTarget(element(`<button>Go</button>`))).toBe(false);
    expect(isTypingTarget(document.body)).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});

describe("ignoreKey", () => {
  it("leaves a plain key on the page to the workspace", () => {
    expect(ignoreKey(press(document.body))).toBe(false);
  });

  it("leaves a key typed into a field to the field", () => {
    expect(ignoreKey(press(element(`<input>`), "n"))).toBe(true);
  });

  it("never takes a key held with Ctrl, Cmd or Alt, which belong to the browser", () => {
    expect(ignoreKey(press(document.body, "r", { ctrlKey: true }))).toBe(true);
    expect(ignoreKey(press(document.body, "r", { metaKey: true }))).toBe(true);
    expect(ignoreKey(press(document.body, "r", { altKey: true }))).toBe(true);
  });

  it("does nothing behind a dialog or an open popover", () => {
    expect(ignoreKey(press(element(`<div role="dialog"><button>Close</button></div>`).firstElementChild))).toBe(true);
  });

  it("leaves Enter and Space on a button to press that button", () => {
    expect(ignoreKey(press(element(`<button>Go</button>`), "Enter"))).toBe(true);
    expect(ignoreKey(press(element(`<button>Go</button>`), " "))).toBe(true);
    expect(ignoreKey(press(element(`<button>Go</button>`), "a"))).toBe(false);
  });

  it("leaves a key something else already handled", () => {
    expect(ignoreKey(press(document.body, "a", { defaultPrevented: true }))).toBe(true);
  });
});

function Probe({ onKey }: { onKey: (key: string) => void }) {
  useKeys(event => onKey(event.key));
  return <input aria-label="Name" />;
}

describe("useKeys", () => {
  it("hears a key pressed on the page, and not one typed into a field", () => {
    const onKey = vi.fn();
    render(<Probe onKey={onKey} />);
    fireEvent.keyDown(document.body, { key: "n" });
    fireEvent.keyDown(screen.getByLabelText("Name"), { key: "n" });
    expect(onKey.mock.calls).toEqual([["n"]]);
  });
});
```

Create `packages/editor/src/survey/keys.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { surveyCommand } from "./keys";

describe("surveyCommand", () => {
  it("maps every key the spec lists (§9)", () => {
    expect(surveyCommand("ArrowLeft")).toBe("prev");
    expect(surveyCommand("ArrowRight")).toBe("next");
    expect(surveyCommand("n")).toBe("nextUntagged");
    expect(surveyCommand("N")).toBe("nextUntagged");
    expect(surveyCommand("t")).toBe("focusName");
    expect(surveyCommand("T")).toBe("focusName");
    expect(surveyCommand("Enter")).toBe("tag");
    expect(surveyCommand("Escape")).toBe("dropBox");
    expect(surveyCommand("Delete")).toBe("bin");
    expect(surveyCommand("g")).toBe("toggleGrid");
    expect(surveyCommand("G")).toBe("toggleGrid");
  });

  it("bins with Backspace too, which is the Delete key on a Mac laptop", () => {
    expect(surveyCommand("Backspace")).toBe("bin");
  });

  it("ignores keys it does not know, including ones that name object properties", () => {
    expect(surveyCommand("x")).toBeNull();
    expect(surveyCommand("constructor")).toBeNull();
    expect(surveyCommand("toString")).toBeNull();
  });
});
```

Create `packages/editor/src/review/keys.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { reviewCommand } from "./keys";

describe("reviewCommand", () => {
  it("maps every key the spec lists (§10)", () => {
    expect(reviewCommand("a")).toBe("accept");
    expect(reviewCommand("A")).toBe("accept");
    expect(reviewCommand("r")).toBe("reject");
    expect(reviewCommand("R")).toBe("reject");
    expect(reviewCommand("s")).toBe("skip");
    expect(reviewCommand("S")).toBe("skip");
    expect(reviewCommand("l")).toBe("list");
    expect(reviewCommand("L")).toBe("list");
    expect(reviewCommand("ArrowLeft")).toBe("prevFrame");
    expect(reviewCommand("ArrowRight")).toBe("nextFrame");
    expect(reviewCommand("Escape")).toBe("closeList");
  });

  it("ignores keys it does not know, including ones that name object properties", () => {
    expect(reviewCommand("Enter")).toBeNull();
    expect(reviewCommand("constructor")).toBeNull();
  });
});
```

Create `packages/editor/src/survey/suggest.test.ts`:

```ts
import { PlaceSchema } from "@oth/model";
import { describe, expect, it } from "vitest";
import { exactPlace, linkablePlaces, normalName, suggestPlaces } from "./suggest";

const place = (id: string, nameEn: string) => PlaceSchema.parse({ id, nameEn, category: "retail" });
const all = [
  place("p_ntuc", "NTUC FairPrice"),
  place("p_lib", "Public Library"),
  place("p_gate", "Gate 1"),
  place("p_l2", "Toilets"),
  place("p_l1_toilets", "Toilets"),
];
const levels = new Map<string, string | undefined>([
  ["p_ntuc", "oth-L1"], ["p_lib", "oth-L1"], ["p_gate", undefined], ["p_l2", "oth-L2"], ["p_l1_toilets", "oth-L1"],
]);
const counts = new Map([["p_ntuc", 7], ["p_gate", 1]]);

describe("normalName", () => {
  it("ignores case, spacing and the ends", () => {
    expect(normalName("  Gate   1 ")).toBe("gate 1");
    expect(normalName("GATE 1")).toBe(normalName("gate 1"));
  });
});

describe("linkablePlaces", () => {
  it("offers this floor's places and those with no floor yet, never another floor's", () => {
    // L2's Toilets are a different place from L1's, whatever they are called.
    expect(linkablePlaces(all, levels, "oth-L1").map(p => p.id).sort())
      .toEqual(["p_gate", "p_l1_toilets", "p_lib", "p_ntuc"]);
  });
});

describe("suggestPlaces", () => {
  const candidates = linkablePlaces(all, levels, "oth-L1");

  it("lists this floor's places first, alphabetically, with how often each was seen", () => {
    expect(suggestPlaces(candidates, levels, "oth-L1", "", counts).map(s => [s.place.nameEn, s.count, s.onFloor])).toEqual([
      ["NTUC FairPrice", 7, true],
      ["Public Library", 0, true],
      ["Toilets", 0, true],
      ["Gate 1", 1, false],
    ]);
  });

  it("narrows to what matches, a prefix match first", () => {
    const names = suggestPlaces(candidates, levels, "oth-L1", "li", counts).map(s => s.place.nameEn);
    expect(names).toEqual(["Public Library"]);
  });
});

describe("exactPlace", () => {
  const candidates = linkablePlaces(all, levels, "oth-L1");

  it("finds the place a name means, whatever its case and spacing", () => {
    expect(exactPlace(candidates, levels, "oth-L1", " ntuc   fairprice ")?.id).toBe("p_ntuc");
  });

  it("means this floor's place when another floor has one of the same name", () => {
    expect(exactPlace(candidates, levels, "oth-L1", "Toilets")?.id).toBe("p_l1_toilets");
  });

  it("links a place with no floor yet", () => {
    expect(exactPlace(candidates, levels, "oth-L1", "gate 1")?.id).toBe("p_gate");
  });

  it("finds nothing for a new name, or no name", () => {
    expect(exactPlace(candidates, levels, "oth-L1", "Fresh Bakery")).toBeNull();
    expect(exactPlace(candidates, levels, "oth-L1", "   ")).toBeNull();
  });
});
```

Create `packages/editor/src/survey/tagging.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { drawnBox, newId, tagWrites, walkwayColour } from "./tagging";

const ids = () => {
  let n = 0;
  return (prefix: string) => `${prefix}_${++n}`;
};

describe("newId", () => {
  it("makes an id the server accepts: letters, digits and underscores", () => {
    expect(newId("pl", 1_790_000_000_000, () => 0.123456789)).toMatch(/^pl_[a-z0-9]+$/);
  });

  it("differs for two made in the same millisecond", () => {
    expect(newId("sg", 1, () => 0.1)).not.toBe(newId("sg", 1, () => 0.2));
  });
});

describe("tagWrites", () => {
  it("makes a new place on the floor being surveyed, then the sighting on the frame", () => {
    const writes = tagWrites({ placeId: null, nameEn: "Kiosk", category: "retail" }, "kf_1", "oth-L1", ids());
    expect(writes.place).toEqual({ id: "pl_1", nameEn: "Kiosk", category: "retail", levelId: "oth-L1" });
    expect(writes.sighting).toEqual({ id: "sg_2", placeId: "pl_1", keyframeId: "kf_1" });
  });

  it("links an existing place without writing it again", () => {
    const writes = tagWrites({ placeId: "p_ntuc", nameEn: "NTUC FairPrice", category: "retail" }, "kf_1", "oth-L1", ids());
    expect(writes.place).toBeNull();
    expect(writes.sighting).toMatchObject({ placeId: "p_ntuc", keyframeId: "kf_1" });
  });

  it("keeps the box, and a walkway's type", () => {
    const box = { x: 0.1, y: 0.2, w: 0.3, h: 0.4 };
    const writes = tagWrites(
      { placeId: null, nameEn: "Covered link east", category: "facility", pathwayKindId: "pk-1", box },
      "kf_1", "oth-L1", ids(),
    );
    expect(writes.place).toMatchObject({ pathwayKindId: "pk-1" });
    expect(writes.sighting).toMatchObject({ box });
  });
});

describe("drawnBox", () => {
  it("keeps a box drawn on purpose", () => {
    expect(drawnBox({ x: 0.1, y: 0.1, w: 0.2, h: 0.2 })).toEqual({ x: 0.1, y: 0.1, w: 0.2, h: 0.2 });
  });

  it("drops a box too small to have been drawn on purpose, and no box at all", () => {
    expect(drawnBox({ x: 0.1, y: 0.1, w: 0.005, h: 0.3 })).toBeUndefined();
    expect(drawnBox(null)).toBeUndefined();
  });
});

describe("walkwayColour", () => {
  it("gives each new walkway type the next colour, round the palette", () => {
    expect(walkwayColour(0)).toBe("#38bdf8");
    expect(walkwayColour(6)).toBe("#38bdf8");
    expect(walkwayColour(1)).not.toBe(walkwayColour(0));
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run packages/editor/src/ui/keys.test.tsx packages/editor/src/survey/keys.test.ts packages/editor/src/review/keys.test.ts packages/editor/src/survey/suggest.test.ts packages/editor/src/survey/tagging.test.ts --poolOptions.threads.maxThreads=2 --poolOptions.threads.minThreads=1`
Expected: FAIL — none of the five modules resolve.

- [ ] **Step 3: Write the key handling**

Create `packages/editor/src/ui/keys.ts`:

```ts
import { useEffect, useRef } from "react";

/** Input types a letter does not type into. */
const NOT_TEXT = new Set(["checkbox", "radio", "button", "submit", "reset", "range", "color", "file", "image"]);

/**
 * Whether a key pressed here is text rather than a command. Spec §9 and §10:
 * the keys are inactive while typing, so the N of "NTUC" is never "next".
 * A select counts: letters pick its options.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest('[contenteditable=""], [contenteditable="true"]')) return true;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  if (target instanceof HTMLInputElement) return !NOT_TEXT.has(target.type);
  return false;
}

/**
 * Whether a key press belongs to something other than the workspace's
 * shortcuts: a field, a dialog or popover (Radix gives both role="dialog"),
 * the browser (Ctrl, Cmd, Alt), or a button that Enter and Space press.
 */
export function ignoreKey(
  event: Pick<KeyboardEvent, "key" | "target" | "ctrlKey" | "metaKey" | "altKey" | "defaultPrevented">,
): boolean {
  if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return true;
  if (isTypingTarget(event.target)) return true;
  const el = event.target instanceof Element ? event.target : null;
  if (el?.closest('[role="dialog"], [role="alertdialog"]')) return true;
  if ((event.key === "Enter" || event.key === " ") && el?.closest("button, a, summary, [role='button']")) return true;
  return false;
}

/** A workspace's shortcuts, heard on the window while it is mounted. The latest handler is always the one called. */
export function useKeys(onKey: (event: KeyboardEvent) => void): void {
  const handler = useRef(onKey);
  handler.current = onKey;
  useEffect(() => {
    const listen = (event: KeyboardEvent) => {
      if (!ignoreKey(event)) handler.current(event);
    };
    window.addEventListener("keydown", listen);
    return () => window.removeEventListener("keydown", listen);
  }, []);
}
```

Create `packages/editor/src/survey/keys.ts`:

```ts
export type SurveyCommand =
  | "prev" | "next" | "nextUntagged" | "focusName" | "tag" | "dropBox" | "bin" | "toggleGrid";

/**
 * The survey's keys (spec §9), in one table so the screen and its hints
 * agree. A Map rather than an object, so "constructor" is not a key.
 * Backspace bins too: it is the Delete key on a Mac laptop, and a bin is undone
 * from its toast.
 */
const KEYS = new Map<string, SurveyCommand>([
  ["ArrowLeft", "prev"],
  ["ArrowRight", "next"],
  ["n", "nextUntagged"], ["N", "nextUntagged"],
  ["t", "focusName"], ["T", "focusName"],
  ["Enter", "tag"],
  ["Escape", "dropBox"],
  ["Delete", "bin"], ["Backspace", "bin"],
  ["g", "toggleGrid"], ["G", "toggleGrid"],
]);

export function surveyCommand(key: string): SurveyCommand | null {
  return KEYS.get(key) ?? null;
}
```

Create `packages/editor/src/review/keys.ts`:

```ts
export type ReviewCommand = "accept" | "reject" | "skip" | "list" | "closeList" | "prevFrame" | "nextFrame";

/** Review's keys (spec §10), in one table. A Map, so "constructor" is not a key. */
const KEYS = new Map<string, ReviewCommand>([
  ["a", "accept"], ["A", "accept"],
  ["r", "reject"], ["R", "reject"],
  ["s", "skip"], ["S", "skip"],
  ["l", "list"], ["L", "list"],
  ["Escape", "closeList"],
  ["ArrowLeft", "prevFrame"],
  ["ArrowRight", "nextFrame"],
]);

export function reviewCommand(key: string): ReviewCommand | null {
  return KEYS.get(key) ?? null;
}
```

- [ ] **Step 4: Write the suggestions and the tag writes**

Create `packages/editor/src/survey/suggest.ts`:

```ts
import type { Place } from "@oth/model";
import { matchPlaces } from "./places";

/** Names compared the way people mean them: case, inner spacing and the ends ignored. */
export function normalName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * The places a tag on one floor may link to: that floor's, and those with no
 * floor yet. Another floor's "Toilets" is a different place, and linking to it
 * would put L2's toilets in L1's footage.
 */
export function linkablePlaces(
  places: readonly Place[], levels: ReadonlyMap<string, string | undefined>, levelId: string,
): Place[] {
  return places.filter(p => {
    const on = levels.get(p.id);
    return on === levelId || on === undefined;
  });
}

export type Suggestion = { place: Place; count: number; onFloor: boolean };

/** The name field's suggestions (spec §9): this floor's places first, then those on no floor, each with its sighting count. */
export function suggestPlaces(
  candidates: readonly Place[],
  levels: ReadonlyMap<string, string | undefined>,
  levelId: string,
  query: string,
  counts: ReadonlyMap<string, number>,
): Suggestion[] {
  const matched = matchPlaces(candidates, query);
  const ordered = query.trim() === "" ? [...matched].sort((a, b) => a.nameEn.localeCompare(b.nameEn)) : matched;
  const onFloor = (p: Place) => levels.get(p.id) === levelId;
  return [...ordered.filter(onFloor), ...ordered.filter(p => !onFloor(p))]
    .map(place => ({ place, count: counts.get(place.id) ?? 0, onFloor: onFloor(place) }));
}

/** The place a typed name means: this floor's first, then one with no floor. Null for a new name. */
export function exactPlace(
  candidates: readonly Place[], levels: ReadonlyMap<string, string | undefined>, levelId: string, name: string,
): Place | null {
  const wanted = normalName(name);
  if (wanted === "") return null;
  const same = candidates.filter(p => normalName(p.nameEn) === wanted);
  return same.find(p => levels.get(p.id) === levelId) ?? same[0] ?? null;
}
```

Create `packages/editor/src/survey/tagging.ts`:

```ts
import type { Box, TenantCategory } from "@oth/model";

export type Tag = {
  /** An existing place, or null when the name is new. */
  placeId: string | null;
  nameEn: string;
  category: TenantCategory;
  /** Set when what was boxed is a walkway rather than a unit. */
  pathwayKindId?: string;
  box?: Box;
};

/**
 * An id the server accepts (letters, digits, underscore) that nothing else
 * has: the time, and a little randomness for two made in one millisecond —
 * a place and its first sighting are.
 */
export function newId(prefix: string, now = Date.now(), random: () => number = Math.random): string {
  return `${prefix}_${now.toString(36)}${random().toString(36).slice(2, 8)}`;
}

/**
 * What tagging a frame writes: a new place when the name is new — filed under
 * the floor being surveyed, so it is on that floor from the start — and the
 * sighting that ties it to the frame.
 */
export function tagWrites(
  tag: Tag, frameId: string, levelId: string, id: (prefix: string) => string = newId,
): { place: Record<string, unknown> | null; sighting: Record<string, unknown> } {
  const placeId = tag.placeId ?? id("pl");
  return {
    place: tag.placeId
      ? null
      : {
          id: placeId,
          nameEn: tag.nameEn,
          category: tag.category,
          levelId,
          ...(tag.pathwayKindId ? { pathwayKindId: tag.pathwayKindId } : {}),
        },
    sighting: { id: id("sg"), placeId, keyframeId: frameId, ...(tag.box ? { box: tag.box } : {}) },
  };
}

/** A stray click leaves a box of almost no size; that is not a box, and saving it would put a dot on the frame. */
const SMALLEST = 0.01;

export function drawnBox(box: Box | null): Box | undefined {
  return box && box.w > SMALLEST && box.h > SMALLEST ? box : undefined;
}

const WALKWAY_COLOURS = ["#38bdf8", "#f2a33c", "#a78bfa", "#34d399", "#f472b6", "#facc15"];

/** The colour for the next walkway type, so a floor of walkways does not read as one blue tangle. */
export function walkwayColour(existing: number): string {
  return WALKWAY_COLOURS[existing % WALKWAY_COLOURS.length]!;
}
```

- [ ] **Step 5: Run the tests and the typecheck**

Run: `npx vitest run packages/editor/src/ui/keys.test.tsx packages/editor/src/survey/keys.test.ts packages/editor/src/review/keys.test.ts packages/editor/src/survey/suggest.test.ts packages/editor/src/survey/tagging.test.ts --poolOptions.threads.maxThreads=2 --poolOptions.threads.minThreads=1`
Expected: PASS.
Run: `npx tsc -b`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add packages/editor/src/ui/keys.ts packages/editor/src/ui/keys.test.tsx packages/editor/src/survey/keys.ts packages/editor/src/survey/keys.test.ts packages/editor/src/review/keys.ts packages/editor/src/review/keys.test.ts packages/editor/src/survey/suggest.ts packages/editor/src/survey/suggest.test.ts packages/editor/src/survey/tagging.ts packages/editor/src/survey/tagging.test.ts
git commit -m "feat(editor): the survey's and review's keys, name suggestions, and what a tag writes

One place decides when a key is a command: never while typing, behind a
dialog or popover, with Ctrl, Cmd or Alt, or when Enter is pressing a
button. The survey and review key maps are tables, tested key by key.

A name links to this floor's place, or one on no floor yet, whatever its
case and spacing — never to another floor's place of the same name. A
new place is filed under the floor being surveyed as it is made.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---
### Task 8: The frame and the tag bar

Spec §9: "The frame is scaled to fit the space left, never scrolled to. Boxes are drawn on it … the existing box editing, restyled. Directly under the frame, the tag bar." The old `PlaceTagger` did both jobs, stacked in a scrolling column. This task splits it into `FrameCanvas`, which Review reuses to correct the agent's box, and `TagBar`. Its tests move with the pieces. `PlaceTagger` itself is deleted in Task 15, together with `SurveyApp`, which still uses it.

**Files:**
- Create: `packages/editor/src/survey/fit.ts`, `packages/editor/src/survey/FrameCanvas.tsx`, `packages/editor/src/survey/TagBar.tsx`
- Test: `packages/editor/src/survey/fit.test.ts`, `packages/editor/src/survey/FrameCanvas.test.tsx`, `packages/editor/src/survey/TagBar.test.tsx`

**Interfaces:**
- Consumes: `moveBox`, `resizeBox`, `labelInside`, `Corner` from `survey/boxEdit.ts`; `FrameLabel` from `survey/labelled.ts`; `useElementSize` from `plan/useElementSize.ts`; Task 7's `suggestPlaces`, `exactPlace`, `drawnBox`, `Tag`.
- Produces:
  - `fitSize(space: { width: number; height: number }, frame: { widthPx: number; heightPx: number }): { width: number; height: number }`.
  - `FrameCanvas` props: `{ imageUrl: string; alt: string; widthPx: number; heightPx: number; labels: readonly FrameLabel[]; draft?: Box | null; onDraft?: (box: Box | null) => void; onMoveLabel: (label: FrameLabel, box: Box) => void; onRemoveLabel?: (label: FrameLabel) => void }`. Drawing is offered only when `onDraft` is given.
  - `type TagBarHandle = { focus: () => void; submit: () => void }`.
  - `TagBar` (forwardRef) props: `{ candidates: readonly Place[]; levels: ReadonlyMap<string, string | undefined>; levelId: string; counts: ReadonlyMap<string, number>; walkwayKinds: readonly PathwayKind[]; box: Box | null; onTag: (tag: Tag) => void; onAddWalkwayKind: (nameEn: string) => Promise<string | null> }`.

- [ ] **Step 1: Write the failing tests**

Create `packages/editor/src/survey/fit.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { fitSize } from "./fit";

describe("fitSize", () => {
  it("fills the width when the space is wider in shape than the frame is not", () => {
    expect(fitSize({ width: 800, height: 800 }, { widthPx: 3840, heightPx: 2160 })).toEqual({ width: 800, height: 450 });
  });

  it("fills the height when the space is wide and short", () => {
    expect(fitSize({ width: 1600, height: 450 }, { widthPx: 3840, heightPx: 2160 })).toEqual({ width: 800, height: 450 });
  });

  it("is nothing, not NaN, for a space or frame of no size", () => {
    expect(fitSize({ width: 0, height: 500 }, { widthPx: 3840, heightPx: 2160 })).toEqual({ width: 0, height: 0 });
    expect(fitSize({ width: 500, height: 500 }, { widthPx: 0, heightPx: 0 })).toEqual({ width: 0, height: 0 });
  });
});
```

Create `packages/editor/src/survey/FrameCanvas.test.tsx`:

```tsx
import { PlaceSchema, SightingSchema, type Box, type Place } from "@oth/model";
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FrameCanvas } from "./FrameCanvas";
import type { FrameLabel } from "./labelled";

const places = [
  PlaceSchema.parse({ id: "p1", nameEn: "NTUC FairPrice", category: "retail" }),
  PlaceSchema.parse({ id: "p2", nameEn: "Public Library", category: "community" }),
];

const label = (id: string, place: Place, box?: Box, status: "proposed" | "confirmed" = "confirmed"): FrameLabel => ({
  sighting: SightingSchema.parse({ id, placeId: place.id, keyframeId: "kf_1", status, ...(box ? { box } : {}) }),
  place,
});

/** Holds the drawn box the way the survey does, and shows it for the test to read. */
function Drawing({ labels = [], onMoveLabel = vi.fn(), onRemoveLabel = vi.fn() }: {
  labels?: FrameLabel[];
  onMoveLabel?: (l: FrameLabel, b: Box) => void;
  onRemoveLabel?: (l: FrameLabel) => void;
}) {
  const [draft, setDraft] = useState<Box | null>(null);
  return (
    <>
      <FrameCanvas
        imageUrl="/f.jpg" alt="frame kf_1" widthPx={640} heightPx={480} labels={labels}
        draft={draft} onDraft={setDraft} onMoveLabel={onMoveLabel} onRemoveLabel={onRemoveLabel}
      />
      <output data-testid="draft">{draft ? JSON.stringify(draft) : "none"}</output>
    </>
  );
}

function drawn(): Box | null {
  const text = screen.getByTestId("draft").textContent!;
  return text === "none" ? null : (JSON.parse(text) as Box);
}

/** The frame reports a real size; jsdom gives every element zero by default. */
beforeEach(() => {
  Element.prototype.getBoundingClientRect = vi.fn(() => ({
    left: 0, top: 0, width: 400, height: 300, right: 400, bottom: 300, x: 0, y: 0,
    toJSON: () => ({}),
  })) as unknown as typeof Element.prototype.getBoundingClientRect;
});

describe("drawing a box", () => {
  it("turns a drag into a box in fractions of the frame", () => {
    render(<Drawing />);
    const frame = screen.getByTestId("tag-frame");
    fireEvent.mouseDown(frame, { clientX: 100, clientY: 60 });
    fireEvent.mouseMove(frame, { clientX: 300, clientY: 240 });
    fireEvent.mouseUp(frame);
    const box = drawn()!;
    expect(box.x).toBeCloseTo(0.25, 2);
    expect(box.y).toBeCloseTo(0.2, 2);
    expect(box.w).toBeCloseTo(0.5, 2);
    expect(box.h).toBeCloseTo(0.6, 2);
  });

  it("draws the box while you drag", () => {
    render(<Drawing />);
    const frame = screen.getByTestId("tag-frame");
    fireEvent.mouseDown(frame, { clientX: 0, clientY: 0 });
    fireEvent.mouseMove(frame, { clientX: 200, clientY: 150 });
    expect(screen.getByTestId("tag-box")).toBeTruthy();
  });

  it("finishes a drag that is released outside the frame", () => {
    // Boxing something at the edge means letting go off the image.
    render(<Drawing />);
    const frame = screen.getByTestId("tag-frame");
    fireEvent.mouseDown(frame, { clientX: 100, clientY: 60 });
    fireEvent.mouseMove(frame, { clientX: 300, clientY: 240 });
    fireEvent.mouseUp(window);
    fireEvent.mouseMove(frame, { clientX: 380, clientY: 300 });
    expect((screen.getByTestId("tag-box") as HTMLElement).style.width).toBe("50%");
  });

  it("stops the browser dragging the image instead of drawing a box", () => {
    render(<Drawing />);
    expect((screen.getByAltText("frame kf_1") as HTMLImageElement).draggable).toBe(false);
  });

  it("offers no drawing where none is asked for", () => {
    render(<FrameCanvas imageUrl="/f.jpg" alt="frame kf_1" widthPx={640} heightPx={480} labels={[]} onMoveLabel={vi.fn()} />);
    const frame = screen.getByTestId("tag-frame");
    fireEvent.mouseDown(frame, { clientX: 0, clientY: 0 });
    fireEvent.mouseMove(frame, { clientX: 200, clientY: 150 });
    expect(screen.queryByTestId("tag-box")).toBeNull();
  });
});

describe("what has already been identified", () => {
  it("draws a box where the thing was, named", () => {
    render(<Drawing labels={[label("s1", places[0]!, { x: 0.1, y: 0.2, w: 0.3, h: 0.1 })]} />);
    expect(screen.getByTestId("label-box-s1").textContent).toContain("NTUC FairPrice");
  });

  it("places the box where the fractions say", () => {
    render(<Drawing labels={[label("s1", places[0]!, { x: 0.25, y: 0.5, w: 0.2, h: 0.1 })]} />);
    const box = screen.getByTestId("label-box-s1") as HTMLElement;
    expect(box.style.left).toBe("25%");
    expect(box.style.top).toBe("50%");
    expect(box.style.width).toBe("20%");
  });

  it("draws a proposed box dashed, so it differs by more than its colour", () => {
    render(<Drawing labels={[
      label("s1", places[0]!, { x: 0.1, y: 0.2, w: 0.2, h: 0.2 }, "proposed"),
      label("s2", places[1]!, { x: 0.5, y: 0.2, w: 0.2, h: 0.2 }),
    ]} />);
    expect(screen.getByTestId("label-box-s1").className).toContain("border-dashed");
    expect(screen.getByTestId("label-box-s2").className).not.toContain("border-dashed");
  });

  it("keeps the label and its remove control on the image when the box hugs the top", () => {
    render(<Drawing labels={[label("s1", places[0]!, { x: 0.1, y: 0, w: 0.3, h: 0.2 })]} />);
    const tag = screen.getByTestId("label-box-s1").querySelector("span")!;
    expect(tag.className).toContain("top-0");
    expect(tag.className).not.toContain("-top-5");
  });

  it("drags a misplaced box to where the thing actually is", () => {
    const onMoveLabel = vi.fn();
    render(<Drawing onMoveLabel={onMoveLabel} labels={[label("s1", places[0]!, { x: 0.1, y: 0.2, w: 0.2, h: 0.2 })]} />);
    fireEvent.mouseDown(screen.getByTitle(/Drag to move, corners to resize/), { clientX: 100, clientY: 100 });
    fireEvent.mouseMove(screen.getByTestId("tag-frame"), { clientX: 140, clientY: 130 });
    fireEvent.mouseUp(screen.getByTestId("tag-frame"));
    const moved = onMoveLabel.mock.calls[0]![1] as Box;
    expect(moved.x).toBeCloseTo(0.2, 2);
    expect(moved.y).toBeCloseTo(0.3, 2);
    expect(moved.w).toBeCloseTo(0.2, 2);
  });

  it("resizes a box that is the wrong size, holding the opposite corner", () => {
    const onMoveLabel = vi.fn();
    render(<Drawing onMoveLabel={onMoveLabel} labels={[label("s1", places[0]!, { x: 0.1, y: 0.2, w: 0.2, h: 0.2 })]} />);
    fireEvent.mouseDown(screen.getByLabelText("Resize NTUC FairPrice se"), { clientX: 120, clientY: 120 });
    fireEvent.mouseMove(screen.getByTestId("tag-frame"), { clientX: 200, clientY: 180 });
    fireEvent.mouseUp(screen.getByTestId("tag-frame"));
    const sized = onMoveLabel.mock.calls[0]![1] as Box;
    expect(sized.x).toBeCloseTo(0.1, 2);
    expect(sized.y).toBeCloseTo(0.2, 2);
    expect(sized.w).toBeCloseTo(0.4, 2);
    expect(sized.h).toBeCloseTo(0.4, 2);
  });

  it("does not start drawing a new box when an existing one is grabbed", () => {
    const onMoveLabel = vi.fn();
    render(<Drawing onMoveLabel={onMoveLabel} labels={[label("s1", places[0]!, { x: 0.1, y: 0.2, w: 0.2, h: 0.2 })]} />);
    fireEvent.mouseDown(screen.getByTitle(/Drag to move/), { clientX: 100, clientY: 100 });
    fireEvent.mouseMove(screen.getByTestId("tag-frame"), { clientX: 140, clientY: 100 });
    fireEvent.mouseUp(screen.getByTestId("tag-frame"));
    expect(onMoveLabel).toHaveBeenCalled();
    expect(drawn()).toBeNull();
  });

  it("leaves the box body transparent, so a shopfront inside a walkway can still be drawn", () => {
    render(<Drawing labels={[label("s1", places[0]!, { x: 0, y: 0.2, w: 1, h: 0.8 })]} />);
    expect(screen.getByTestId("label-box-s1").className).toContain("pointer-events-none");
  });

  it("removes a tag without dragging the box on the way out", () => {
    const onRemoveLabel = vi.fn();
    const onMoveLabel = vi.fn();
    render(<Drawing onRemoveLabel={onRemoveLabel} onMoveLabel={onMoveLabel} labels={[label("s1", places[0]!, { x: 0.1, y: 0.2, w: 0.2, h: 0.2 })]} />);
    const x = screen.getByLabelText("Remove tag NTUC FairPrice from this frame");
    fireEvent.mouseDown(x, { clientX: 100, clientY: 100 });
    fireEvent.click(x);
    expect(onRemoveLabel).toHaveBeenCalled();
    expect(onMoveLabel).not.toHaveBeenCalled();
  });

  it("still shows a tag that applies to the whole frame", () => {
    render(<Drawing labels={[label("s2", places[1]!)]} />);
    expect(screen.getByTestId("whole-frame-labels").textContent).toContain("Public Library");
  });

  it("shows nothing over a frame nobody has tagged", () => {
    render(<Drawing />);
    expect(screen.queryByTestId("whole-frame-labels")).toBeNull();
  });
});
```

Create `packages/editor/src/survey/TagBar.test.tsx`:

```tsx
import { PathwayKindSchema, PlaceSchema, type Box } from "@oth/model";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { TagBar, type TagBarHandle } from "./TagBar";

const L1 = "oth-L1";
const places = [
  PlaceSchema.parse({ id: "p1", nameEn: "NTUC FairPrice", category: "retail", levelId: L1 }),
  PlaceSchema.parse({ id: "p2", nameEn: "Public Library", category: "community", levelId: L1 }),
  PlaceSchema.parse({ id: "p3", nameEn: "Gate 1", category: "facility" }),
];
const levels = new Map<string, string | undefined>([["p1", L1], ["p2", L1], ["p3", undefined]]);
const counts = new Map([["p1", 7], ["p3", 1]]);
const kinds = [PathwayKindSchema.parse({ id: "pk-1", nameEn: "Covered link", colorHex: "#38bdf8" })];

function setup(box: Box | null = null) {
  const onTag = vi.fn();
  const onAddWalkwayKind = vi.fn(async () => "pk-2");
  const ref = createRef<TagBarHandle>();
  render(
    <TagBar
      ref={ref} candidates={places} levels={levels} levelId={L1} counts={counts}
      walkwayKinds={kinds} box={box} onTag={onTag} onAddWalkwayKind={onAddWalkwayKind}
    />,
  );
  return { onTag, onAddWalkwayKind, ref, name: screen.getByLabelText("Place name") as HTMLInputElement };
}

describe("TagBar", () => {
  it("tags the whole frame when no box is drawn", () => {
    const { onTag, name } = setup();
    fireEvent.change(name, { target: { value: "Kopitiam" } });
    fireEvent.click(screen.getByRole("button", { name: /^Tag/ }));
    expect(onTag).toHaveBeenCalledWith(expect.objectContaining({ nameEn: "Kopitiam" }));
    expect(onTag.mock.calls[0]![0].box).toBeUndefined();
  });

  it("tags the box that was drawn", () => {
    const box = { x: 0.1, y: 0.2, w: 0.3, h: 0.4 };
    const { onTag, name } = setup(box);
    fireEvent.change(name, { target: { value: "Kopitiam" } });
    fireEvent.click(screen.getByRole("button", { name: /^Tag/ }));
    expect(onTag.mock.calls[0]![0].box).toEqual(box);
  });

  it("ignores a box too small to have been drawn on purpose", () => {
    const { onTag, name } = setup({ x: 0.1, y: 0.2, w: 0.004, h: 0.004 });
    fireEvent.change(name, { target: { value: "Kopitiam" } });
    fireEvent.click(screen.getByRole("button", { name: "Tag" }));
    expect(onTag.mock.calls[0]![0].box).toBeUndefined();
  });

  it("links to a place that exists, whatever the case and spacing, rather than making a second", () => {
    const { onTag, name } = setup();
    fireEvent.change(name, { target: { value: "  ntuc   fairprice " } });
    fireEvent.click(screen.getByRole("button", { name: /Tag as NTUC FairPrice/ }));
    expect(onTag).toHaveBeenCalledWith(expect.objectContaining({ placeId: "p1" }));
  });

  it("keeps an existing place's category, rather than letting one frame change it", () => {
    const { onTag, name } = setup();
    fireEvent.change(name, { target: { value: "Public Library" } });
    expect((screen.getByLabelText("Category") as HTMLSelectElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /Tag as/ }));
    expect(onTag.mock.calls[0]![0].category).toBe("community");
  });

  it("makes a new place, with the category chosen, when the name is new", () => {
    const { onTag, name } = setup();
    fireEvent.change(name, { target: { value: "Fresh Bakery" } });
    fireEvent.change(screen.getByLabelText("Category"), { target: { value: "lifestyle" } });
    fireEvent.click(screen.getByRole("button", { name: /^Tag/ }));
    expect(onTag).toHaveBeenCalledWith(expect.objectContaining({ placeId: null, nameEn: "Fresh Bakery", category: "lifestyle" }));
  });

  it("puts the cursor in the name instead of tagging with no name", () => {
    const { onTag, name } = setup();
    fireEvent.change(name, { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: /^Tag/ }));
    expect(onTag).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(name);
  });

  it("tags on Enter, since the hands are already on the keyboard", () => {
    const { onTag, name } = setup();
    fireEvent.change(name, { target: { value: "Kopitiam" } });
    fireEvent.keyDown(name, { key: "Enter" });
    expect(onTag).toHaveBeenCalledTimes(1);
  });

  it("clears the name after tagging, ready for the next thing in frame", () => {
    const { name } = setup();
    fireEvent.change(name, { target: { value: "Kopitiam" } });
    fireEvent.click(screen.getByRole("button", { name: /^Tag/ }));
    expect(name.value).toBe("");
  });

  it("suggests this floor's places first, with how often each was seen", () => {
    setup();
    const options = [...document.querySelectorAll("#place-suggestions option")] as HTMLOptionElement[];
    expect(options.map(o => [o.value, o.label])).toEqual([
      ["NTUC FairPrice", "7 frames"],
      ["Public Library", "0 frames"],
      ["Gate 1", "1 frame · no floor yet"],
    ]);
  });

  it("says whether it is about to tag the frame or the box", () => {
    setup();
    expect(screen.getByText(/tagging the whole frame/i)).toBeTruthy();
  });

  it("can be focused and submitted from the workspace's keys", () => {
    const { onTag, ref, name } = setup();
    act(() => ref.current!.focus());
    expect(document.activeElement).toBe(name);
    fireEvent.change(name, { target: { value: "Kopitiam" } });
    act(() => ref.current!.submit());
    expect(onTag).toHaveBeenCalledTimes(1);
  });
});

describe("tagging a walkway", () => {
  it("tags the boxed floor as a walkway of a chosen type", () => {
    const { onTag, name } = setup();
    fireEvent.click(screen.getByTestId("what-walkway"));
    fireEvent.change(screen.getByLabelText("Walkway type"), { target: { value: "pk-1" } });
    fireEvent.change(name, { target: { value: "Festive Walk east" } });
    fireEvent.click(screen.getByRole("button", { name: "Tag" }));
    expect(onTag.mock.calls[0]![0]).toMatchObject({ nameEn: "Festive Walk east", pathwayKindId: "pk-1", category: "facility" });
  });

  it("hides the tenant category, which means nothing for a walkway", () => {
    setup();
    fireEvent.click(screen.getByTestId("what-walkway"));
    expect(screen.queryByLabelText("Category")).toBeNull();
  });

  it("defines a new type in place, with no prompt", async () => {
    const { onAddWalkwayKind } = setup();
    fireEvent.click(screen.getByTestId("what-walkway"));
    fireEvent.click(screen.getByRole("button", { name: "+ New type" }));
    fireEvent.change(screen.getByLabelText("New walkway type"), { target: { value: "Ramp" } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Add type" })); });
    expect(onAddWalkwayKind).toHaveBeenCalledWith("Ramp");
    expect(screen.queryByLabelText("New walkway type")).toBeNull();
  });

  it("still tags an ordinary place when that is what it is", () => {
    const { onTag, name } = setup();
    fireEvent.change(name, { target: { value: "Kopitiam" } });
    fireEvent.click(screen.getByRole("button", { name: "Tag" }));
    expect(onTag.mock.calls[0]![0].pathwayKindId).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run packages/editor/src/survey/fit.test.ts packages/editor/src/survey/FrameCanvas.test.tsx packages/editor/src/survey/TagBar.test.tsx --poolOptions.threads.maxThreads=2 --poolOptions.threads.minThreads=1`
Expected: FAIL — `./fit`, `./FrameCanvas` and `./TagBar` do not resolve.

- [ ] **Step 3: Write `fit.ts` and `FrameCanvas.tsx`**

Create `packages/editor/src/survey/fit.ts`:

```ts
/**
 * The largest size with the frame's shape that fits the space, so the frame is
 * never scrolled to (spec §9). Nothing, rather than NaN, for either of no size.
 */
export function fitSize(
  space: { width: number; height: number },
  frame: { widthPx: number; heightPx: number },
): { width: number; height: number } {
  if (space.width <= 0 || space.height <= 0 || frame.widthPx <= 0 || frame.heightPx <= 0) {
    return { width: 0, height: 0 };
  }
  const scale = Math.min(space.width / frame.widthPx, space.height / frame.heightPx);
  return { width: Math.floor(frame.widthPx * scale), height: Math.floor(frame.heightPx * scale) };
}
```

Create `packages/editor/src/survey/FrameCanvas.tsx`:

```tsx
import type { Box } from "@oth/model";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import { useElementSize } from "../plan/useElementSize";
import { labelInside, moveBox, resizeBox, type Corner } from "./boxEdit";
import { fitSize } from "./fit";
import type { FrameLabel } from "./labelled";

type Edit = { label: FrameLabel; mode: "move" | Corner; from: { x: number; y: number }; box: Box };

const CORNERS: readonly Corner[] = ["nw", "ne", "sw", "se"];

function percent(b: Box) {
  return { left: `${b.x * 100}%`, top: `${b.y * 100}%`, width: `${b.w * 100}%`, height: `${b.h * 100}%` };
}

function cornerAt(corner: Corner) {
  const left = corner === "nw" || corner === "sw";
  const top = corner === "nw" || corner === "ne";
  return {
    left: left ? -5 : undefined, right: left ? undefined : -5,
    top: top ? -5 : undefined, bottom: top ? undefined : -5,
  };
}

/**
 * One frame, as large as the space allows, with what was identified drawn on
 * it: drag a label to move its box, a corner to resize it. Where drawing is
 * offered (`onDraft`), a drag on the picture draws a new box.
 *
 * Shared by Survey, where boxes are drawn and corrected, and Review, where the
 * agent's box is corrected before deciding. Boxes are fractions of the frame,
 * so the size it is shown at never changes what is saved.
 */
export function FrameCanvas({
  imageUrl, alt, widthPx, heightPx, labels, draft = null, onDraft, onMoveLabel, onRemoveLabel,
}: {
  imageUrl: string;
  alt: string;
  widthPx: number;
  heightPx: number;
  labels: readonly FrameLabel[];
  /** A box being drawn and not yet saved. */
  draft?: Box | null;
  onDraft?: (box: Box | null) => void;
  onMoveLabel: (label: FrameLabel, box: Box) => void;
  onRemoveLabel?: (label: FrameLabel) => void;
}) {
  const [measure, space] = useElementSize();
  const frameRef = useRef<HTMLDivElement>(null);
  const [start, setStart] = useState<{ x: number; y: number } | null>(null);
  const [edit, setEdit] = useState<Edit | null>(null);

  // A drag that ends anywhere finishes the box: letting go off the picture is
  // normal when boxing something at its edge, and without this the drag
  // stayed live and the next click resized it.
  useEffect(() => {
    if (!start) return;
    const up = () => setStart(null);
    window.addEventListener("mouseup", up);
    return () => window.removeEventListener("mouseup", up);
  }, [start]);

  /** Fractions of the displayed frame. */
  function at(event: { clientX: number; clientY: number }) {
    const r = frameRef.current?.getBoundingClientRect();
    if (!r || r.width === 0 || r.height === 0) return { x: 0, y: 0 };
    return {
      x: Math.min(1, Math.max(0, (event.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (event.clientY - r.top) / r.height)),
    };
  }

  function onMouseMove(event: MouseEvent) {
    if (edit) {
      const p = at(event);
      const dx = p.x - edit.from.x;
      const dy = p.y - edit.from.y;
      const original = edit.label.sighting.box!;
      setEdit({
        ...edit,
        box: edit.mode === "move" ? moveBox(original, dx, dy) : resizeBox(original, edit.mode, dx, dy),
      });
      return;
    }
    if (!start || !onDraft) return;
    const p = at(event);
    onDraft({
      x: Math.min(start.x, p.x),
      y: Math.min(start.y, p.y),
      w: Math.abs(p.x - start.x),
      h: Math.abs(p.y - start.y),
    });
  }

  function onMouseUp() {
    if (edit) {
      onMoveLabel(edit.label, edit.box);
      setEdit(null);
      return;
    }
    setStart(null);
  }

  const fitted = space ? fitSize(space, { widthPx, heightPx }) : null;
  const boxed = labels.filter(l => l.sighting.box);
  const whole = labels.filter(l => !l.sighting.box);

  return (
    <div ref={measure} className="grid min-h-0 min-w-0 flex-1 place-items-center overflow-hidden">
      <div
        ref={frameRef}
        data-testid="tag-frame"
        className={`relative select-none bg-stone-900 ${onDraft ? "cursor-crosshair" : ""}`}
        // Before the space is measured (and always, in jsdom) the frame keeps
        // its shape at full width; once it is, it fits exactly.
        style={fitted ? { width: fitted.width, height: fitted.height } : { width: "100%", aspectRatio: `${widthPx} / ${heightPx}` }}
        // Mouse rather than pointer events: jsdom builds PointerEvent with no
        // coordinates, so a pointer drag could not be tested.
        onMouseDown={event => {
          if (!onDraft) return;
          setStart(at(event));
          onDraft(null);
        }}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onDragStart={event => event.preventDefault()}
      >
        {/*
          draggable={false} is load-bearing. A browser starts its own image
          drag on mousedown and then stops delivering mousemove, so the box
          never grew, no box was saved, and the tag fell back to the whole frame.
        */}
        <img
          src={imageUrl}
          alt={alt}
          className="block h-full w-full"
          draggable={false}
          onDragStart={event => event.preventDefault()}
        />

        {boxed.map(label => {
          const { sighting, place } = label;
          const b = edit?.label.sighting.id === sighting.id ? edit.box : sighting.box!;
          const proposed = sighting.status === "proposed";
          return (
            <div
              key={sighting.id}
              data-testid={`label-box-${sighting.id}`}
              // The body stays transparent to the mouse so a new box can still
              // be drawn over it — a shopfront inside a tagged walkway is the
              // normal case. Its label drags it, its corners resize it. A
              // proposed box is dashed, so it differs by more than colour.
              className={`pointer-events-none absolute border-2 ${
                proposed ? "border-dashed border-proposed" : "border-confirmed"
              }`}
              style={percent(b)}
            >
              {CORNERS.map(corner => (
                <button
                  key={corner}
                  type="button"
                  aria-label={`Resize ${place.nameEn} ${corner}`}
                  className="pointer-events-auto absolute h-2.5 w-2.5 border border-white bg-accent"
                  style={{ cursor: `${corner}-resize`, ...cornerAt(corner) }}
                  onMouseDown={event => {
                    event.stopPropagation();
                    setEdit({ label, mode: corner, from: at(event), box: b });
                  }}
                />
              ))}
              <span
                className={`pointer-events-auto absolute left-0 flex items-center gap-1 whitespace-nowrap rounded px-1 text-xs text-white ${
                  labelInside(b) ? "top-0" : "-top-5"
                } ${proposed ? "bg-proposed" : "bg-confirmed"}`}
                style={{ cursor: "move" }}
                title={`Drag to move, corners to resize — ${place.nameEn}${proposed ? " (proposed)" : ""}`}
                onMouseDown={event => {
                  event.stopPropagation();
                  setEdit({ label, mode: "move", from: at(event), box: b });
                }}
              >
                {proposed && <span aria-hidden="true">?</span>}
                {place.nameEn}
                {onRemoveLabel && (
                  <button
                    type="button"
                    aria-label={`Remove tag ${place.nameEn} from this frame`}
                    title="Remove this tag"
                    className="font-bold"
                    onMouseDown={event => event.stopPropagation()}
                    onClick={() => onRemoveLabel(label)}
                  >
                    ×
                  </button>
                )}
              </span>
            </div>
          );
        })}

        {/* A tag with no box still happened; it applies to the whole frame. */}
        {whole.length > 0 && (
          <div data-testid="whole-frame-labels" className="pointer-events-none absolute bottom-1 left-1 flex flex-wrap gap-1">
            {whole.map(label => {
              const proposed = label.sighting.status === "proposed";
              return (
                <span
                  key={label.sighting.id}
                  className={`pointer-events-auto flex items-center gap-1 rounded px-1 text-xs text-white ${
                    proposed ? "bg-proposed" : "bg-confirmed"
                  }`}
                >
                  {proposed && <span aria-hidden="true">?</span>}
                  {label.place.nameEn}
                  <span className="opacity-80">· whole frame</span>
                  {onRemoveLabel && (
                    <button
                      type="button"
                      aria-label={`Remove tag ${label.place.nameEn} from this frame`}
                      title="Remove this tag — it applies to the whole frame"
                      className="font-bold"
                      onMouseDown={event => event.stopPropagation()}
                      onClick={() => onRemoveLabel(label)}
                    >
                      ×
                    </button>
                  )}
                </span>
              );
            })}
          </div>
        )}

        {draft && (
          <div data-testid="tag-box" className="pointer-events-none absolute border-2 border-yours" style={percent(draft)} />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Write `TagBar.tsx`**

Create `packages/editor/src/survey/TagBar.tsx`:

```tsx
import {
  TenantCategorySchema, type Box, type PathwayKind, type Place, type TenantCategory,
} from "@oth/model";
import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { Button } from "../ui/Button";
import { exactPlace, suggestPlaces } from "./suggest";
import { drawnBox, type Tag } from "./tagging";

const CATEGORIES = TenantCategorySchema.options;

/** A browser's own suggestion list slows down beyond this, and nobody scrolls that far in it. */
const MAX_SUGGESTIONS = 60;

export type TagBarHandle = { focus: () => void; submit: () => void };

/**
 * Directly under the frame: what is in it, and Tag (spec §9).
 *
 * The name links to a place that exists before it makes a new one — naming is
 * the slow step, and without the link the seventh NTUC sighting makes a
 * seventh NTUC. Drawing a box is optional on purpose: it says which of two
 * shops is meant, and the common case is the whole frame.
 */
export const TagBar = forwardRef<TagBarHandle, {
  candidates: readonly Place[];
  levels: ReadonlyMap<string, string | undefined>;
  levelId: string;
  counts: ReadonlyMap<string, number>;
  walkwayKinds: readonly PathwayKind[];
  box: Box | null;
  onTag: (tag: Tag) => void;
  /** Makes a walkway type and says its id, or null if it could not. */
  onAddWalkwayKind: (nameEn: string) => Promise<string | null>;
}>(function TagBar({ candidates, levels, levelId, counts, walkwayKinds, box, onTag, onAddWalkwayKind }, ref) {
  const input = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<TenantCategory>("retail");
  // What is being boxed: a unit you go into, or a stretch of floor you cross.
  const [what, setWhat] = useState<"place" | "walkway">("place");
  const [kindId, setKindId] = useState("");
  const [newKind, setNewKind] = useState<string | null>(null);

  const exact = exactPlace(candidates, levels, levelId, name);
  const suggestions = suggestPlaces(candidates, levels, levelId, name, counts).slice(0, MAX_SUGGESTIONS);

  function submit() {
    const trimmed = name.trim();
    if (trimmed === "") {
      input.current?.focus();
      return;
    }
    const drawn = drawnBox(box);
    onTag({
      placeId: exact?.id ?? null,
      nameEn: trimmed,
      // A walkway is a piece of the building, not a tenant.
      category: what === "walkway" ? "facility" : exact?.category ?? category,
      ...(what === "walkway" && kindId ? { pathwayKindId: kindId } : {}),
      ...(drawn ? { box: drawn } : {}),
    });
    setName("");
  }

  useImperativeHandle(ref, () => ({ focus: () => input.current?.focus(), submit }));

  async function addKind() {
    const typed = newKind?.trim();
    if (!typed) return;
    const id = await onAddWalkwayKind(typed);
    if (id) {
      setKindId(id);
      setNewKind(null);
    }
  }

  return (
    <div className="border-t border-stone-200 bg-white px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="What is being tagged" className="flex overflow-hidden rounded border border-stone-300">
          {(["place", "walkway"] as const).map(option => (
            <button
              key={option}
              type="button"
              data-testid={`what-${option}`}
              aria-pressed={what === option}
              className={`px-3 py-1.5 text-sm ${what === option ? "bg-stone-900 text-white" : "bg-white hover:bg-stone-100"}`}
              onClick={() => setWhat(option)}
            >
              {option === "place" ? "Place" : "Walkway"}
            </button>
          ))}
        </div>

        <input
          ref={input}
          aria-label="Place name"
          list="place-suggestions"
          className="h-9 min-w-48 flex-1 rounded border border-stone-300 px-3 text-sm"
          placeholder={what === "place" ? "What is this? Type a name…" : "Name this walkway…"}
          value={name}
          onChange={event => setName(event.target.value)}
          onKeyDown={event => {
            if (event.key === "Enter") {
              event.preventDefault();
              submit();
            }
            // Out of the field, so the workspace's keys work again.
            if (event.key === "Escape") event.currentTarget.blur();
          }}
        />
        <datalist id="place-suggestions">
          {suggestions.map(s => (
            <option
              key={s.place.id}
              value={s.place.nameEn}
              label={`${s.count} frame${s.count === 1 ? "" : "s"}${s.onFloor ? "" : " · no floor yet"}`}
            />
          ))}
        </datalist>

        {what === "place" ? (
          <select
            aria-label="Category"
            className="h-9 rounded border border-stone-300 px-2 text-sm"
            // An existing place keeps its category; changing it here would edit
            // every other sighting of it by surprise.
            disabled={Boolean(exact)}
            value={exact?.category ?? category}
            onChange={event => setCategory(event.target.value as TenantCategory)}
          >
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        ) : newKind === null ? (
          <>
            <select
              aria-label="Walkway type"
              className="h-9 rounded border border-stone-300 px-2 text-sm"
              value={kindId}
              onChange={event => setKindId(event.target.value)}
            >
              <option value="">Which kind?</option>
              {walkwayKinds.map(k => <option key={k.id} value={k.id}>{k.nameEn}</option>)}
            </select>
            {/* Defining a type mid-tag beats leaving the frame to go and do it. */}
            <Button size="sm" variant="ghost" onClick={() => setNewKind("")}>+ New type</Button>
          </>
        ) : (
          <>
            <input
              aria-label="New walkway type"
              autoFocus
              className="h-9 w-44 rounded border border-stone-300 px-2 text-sm"
              placeholder="e.g. Covered link"
              value={newKind}
              onChange={event => setNewKind(event.target.value)}
              onKeyDown={event => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void addKind();
                }
                if (event.key === "Escape") setNewKind(null);
              }}
            />
            <Button size="sm" onClick={() => void addKind()}>Add type</Button>
            <Button size="sm" variant="ghost" onClick={() => setNewKind(null)}>Cancel</Button>
          </>
        )}

        <Button variant="primary" onClick={submit}>{exact ? `Tag as ${exact.nameEn}` : "Tag"}</Button>
      </div>
      <p className="mt-1.5 text-xs text-stone-500">
        {drawnBox(box) ? "Tagging the boxed area." : "Tagging the whole frame — drag on it to box something."}
      </p>
    </div>
  );
});
```

- [ ] **Step 5: Run the tests and the typecheck**

Run: `npx vitest run packages/editor/src/survey/fit.test.ts packages/editor/src/survey/FrameCanvas.test.tsx packages/editor/src/survey/TagBar.test.tsx --poolOptions.threads.maxThreads=2 --poolOptions.threads.minThreads=1`
Expected: PASS.
Run: `npx tsc -b`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add packages/editor/src/survey/fit.ts packages/editor/src/survey/fit.test.ts packages/editor/src/survey/FrameCanvas.tsx packages/editor/src/survey/FrameCanvas.test.tsx packages/editor/src/survey/TagBar.tsx packages/editor/src/survey/TagBar.test.tsx
git commit -m "feat(editor): the frame, fitted to the space, and the tag bar under it

PlaceTagger's two halves, apart: FrameCanvas shows a frame as large as
the space allows, never scrolled to, with its boxes drawn, moved and
resized as before — a proposed one dashed, so it differs by more than
colour — and Review reuses it to correct the agent's box. TagBar sits
under it: Place or Walkway, a name that links to this floor's places
first with their counts, a new walkway type typed in place instead of
a prompt, and Tag. PlaceTagger's tests move with the pieces.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---
### Task 9: The filmstrip and the Grid view, windowed

Spec §9 asks for three things. The filmstrip has 240 px thumbnails, a stripe per frame (tagged, proposed, empty), and is "windowed so only frames near the current one render, the current frame kept in view". The Grid view is "a contact sheet of the floor's frames with the same stripes, lazily loaded and windowed. Clicking a frame opens it in Frame view." The real capture has 417 frames, and rendering all of them at once is what made the old strip crawl.

**Files:**
- Create: `packages/editor/src/ui/windowing.ts`, `packages/editor/src/survey/FrameStripe.tsx`, `packages/editor/src/survey/Filmstrip.tsx`, `packages/editor/src/survey/GridView.tsx`
- Test: `packages/editor/src/ui/windowing.test.ts`, `packages/editor/src/survey/Filmstrip.test.tsx`, `packages/editor/src/survey/GridView.test.tsx`

**Interfaces:**
- Consumes: Task 6's `statusOf` and `FrameStatus`; `useElementSize`.
- Produces:
  - `visibleRange(offset: number, viewport: number, itemSize: number, count: number, overscan: number): { start: number; end: number }` (`end` is exclusive).
  - `centerOffset(index: number, itemSize: number, viewport: number): number`.
  - `STATUS_WORD: Record<FrameStatus, string>` and `FrameStripe({ status })`.
  - `Filmstrip({ frames, statuses, currentId, thumbUrl, onPick })`.
  - `GridView({ frames, statuses, currentId, thumbUrl, onOpen })`.
  - Here `frames: readonly Keyframe[]`, `statuses: ReadonlyMap<string, FrameStatus>`, `currentId: string | null`, `thumbUrl: (id: string) => string`, and `onPick` / `onOpen` take the frame id.

- [ ] **Step 1: Write the failing tests**

Create `packages/editor/src/ui/windowing.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { centerOffset, visibleRange } from "./windowing";

describe("visibleRange", () => {
  it("covers what is in view, and a few either side", () => {
    expect(visibleRange(0, 400, 100, 1000, 2)).toEqual({ start: 0, end: 7 });
    expect(visibleRange(1000, 400, 100, 1000, 2)).toEqual({ start: 8, end: 17 });
  });

  it("stops at the end of the list", () => {
    expect(visibleRange(0, 400, 100, 3, 2)).toEqual({ start: 0, end: 3 });
    expect(visibleRange(99_999, 400, 100, 10, 2)).toEqual({ start: 7, end: 10 });
  });

  it("is empty for an empty list, not broken", () => {
    expect(visibleRange(0, 400, 100, 0, 2)).toEqual({ start: 0, end: 0 });
  });
});

describe("centerOffset", () => {
  it("puts an item in the middle of the view", () => {
    expect(centerOffset(10, 100, 500)).toBe(800);
  });

  it("never scrolls before the start", () => {
    expect(centerOffset(0, 100, 500)).toBe(0);
  });
});
```

Create `packages/editor/src/survey/Filmstrip.test.tsx`:

```tsx
import { KeyframeSchema } from "@oth/model";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Filmstrip } from "./Filmstrip";
import type { FrameStatus } from "./frameStatus";

const frames = Array.from({ length: 400 }, (_, i) => KeyframeSchema.parse({
  id: `kf_${i}`, captureId: "cap_1", timeMs: i * 2000, imageId: `kf_${i}`, widthPx: 3840, heightPx: 2160,
}));
const statuses = new Map<string, FrameStatus>([["kf_0", "tagged"], ["kf_1", "proposed"]]);
const thumbUrl = (id: string) => `/api/keyframes/${id}/file?w=240`;

function strip(currentId: string, onPick = vi.fn()) {
  render(<Filmstrip frames={frames} statuses={statuses} currentId={currentId} thumbUrl={thumbUrl} onPick={onPick} />);
  return onPick;
}

describe("Filmstrip", () => {
  it("renders only the frames around the one in view, not all 400", () => {
    strip("kf_300");
    const shown = screen.getAllByRole("button");
    expect(shown.length).toBeLessThan(40);
    expect(screen.getByTestId("filmstrip-kf_300")).toBeTruthy();
    expect(screen.queryByTestId("filmstrip-kf_0")).toBeNull();
  });

  it("asks for the small copy of each frame, lazily", () => {
    strip("kf_0");
    const img = screen.getByTestId("filmstrip-kf_0").querySelector("img")!;
    expect(img.getAttribute("src")).toBe("/api/keyframes/kf_0/file?w=240");
    expect(img.getAttribute("loading")).toBe("lazy");
  });

  it("says each frame's status in words as well as colour", () => {
    strip("kf_0");
    expect(screen.getByTestId("filmstrip-kf_0").getAttribute("aria-label")).toBe("Frame 1, tagged");
    expect(screen.getByTestId("filmstrip-kf_1").getAttribute("aria-label")).toBe("Frame 2, has proposals");
    expect(screen.getByTestId("filmstrip-kf_2").getAttribute("aria-label")).toBe("Frame 3, no tags yet");
  });

  it("marks the frame in view", () => {
    strip("kf_1");
    expect(screen.getByTestId("filmstrip-kf_1").getAttribute("aria-current")).toBe("true");
    expect(screen.getByTestId("filmstrip-kf_2").getAttribute("aria-current")).toBeNull();
  });

  it("opens a frame when it is clicked", () => {
    const onPick = strip("kf_0");
    fireEvent.click(screen.getByTestId("filmstrip-kf_3"));
    expect(onPick).toHaveBeenCalledWith("kf_3");
  });

  it("follows a scroll to frames further along", () => {
    strip("kf_0");
    const el = screen.getByTestId("filmstrip");
    Object.defineProperty(el, "scrollLeft", { value: 136 * 200, configurable: true, writable: true });
    fireEvent.scroll(el);
    expect(screen.getByTestId("filmstrip-kf_200")).toBeTruthy();
  });
});
```

Create `packages/editor/src/survey/GridView.test.tsx`:

```tsx
import { KeyframeSchema } from "@oth/model";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { FrameStatus } from "./frameStatus";
import { GridView } from "./GridView";

const frames = Array.from({ length: 400 }, (_, i) => KeyframeSchema.parse({
  id: `kf_${i}`, captureId: "cap_1", timeMs: i * 2000, imageId: `kf_${i}`, widthPx: 3840, heightPx: 2160,
}));
const statuses = new Map<string, FrameStatus>([["kf_0", "tagged"]]);
const thumbUrl = (id: string) => `/api/keyframes/${id}/file?w=240`;

function grid(currentId: string | null, onOpen = vi.fn()) {
  render(<GridView frames={frames} statuses={statuses} currentId={currentId} thumbUrl={thumbUrl} onOpen={onOpen} />);
  return onOpen;
}

describe("GridView", () => {
  it("renders only the rows in view, not all 400 frames", () => {
    grid("kf_0");
    const cells = screen.getAllByRole("button");
    expect(cells.length).toBeGreaterThan(0);
    expect(cells.length).toBeLessThan(100);
  });

  it("opens on the frame you were on", () => {
    grid("kf_350");
    expect(screen.getByTestId("grid-kf_350").getAttribute("aria-current")).toBe("true");
  });

  it("opens a frame in Frame view when it is clicked", () => {
    const onOpen = grid("kf_0");
    fireEvent.click(screen.getByTestId("grid-kf_3"));
    expect(onOpen).toHaveBeenCalledWith("kf_3");
  });

  it("says each frame's status in words", () => {
    grid("kf_0");
    expect(screen.getByTestId("grid-kf_0").getAttribute("aria-label")).toBe("Open frame 1, tagged");
  });

  it("follows a scroll further down the sheet", () => {
    grid("kf_0");
    const el = screen.getByTestId("grid");
    // Five columns at the laptop width assumed before measuring: frame 200 is on row 40.
    Object.defineProperty(el, "scrollTop", { value: 40 * 150, configurable: true, writable: true });
    fireEvent.scroll(el);
    expect(screen.getByTestId("grid-kf_200")).toBeTruthy();
  });

  it("uses the small copy of each frame, lazily", () => {
    grid("kf_0");
    const img = screen.getByTestId("grid-kf_0").querySelector("img")!;
    expect(img.getAttribute("src")).toBe("/api/keyframes/kf_0/file?w=240");
    expect(img.getAttribute("loading")).toBe("lazy");
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run packages/editor/src/ui/windowing.test.ts packages/editor/src/survey/Filmstrip.test.tsx packages/editor/src/survey/GridView.test.tsx --poolOptions.threads.maxThreads=2 --poolOptions.threads.minThreads=1`
Expected: FAIL — the modules do not resolve.

- [ ] **Step 3: Write the windowing and the stripe**

Create `packages/editor/src/ui/windowing.ts`:

```ts
/**
 * Which items of a long list are worth rendering: those in view, plus a few
 * either side so a scroll shows frames rather than blanks while React catches
 * up. `end` is exclusive.
 */
export function visibleRange(
  offset: number, viewport: number, itemSize: number, count: number, overscan: number,
): { start: number; end: number } {
  if (count <= 0 || itemSize <= 0) return { start: 0, end: 0 };
  const first = Math.min(count - 1, Math.floor(Math.max(0, offset) / itemSize));
  const inView = Math.ceil(Math.max(0, viewport) / itemSize) + 1;
  return { start: Math.max(0, first - overscan), end: Math.min(count, first + inView + overscan) };
}

/** The scroll offset that puts item `index` in the middle of the view. */
export function centerOffset(index: number, itemSize: number, viewport: number): number {
  return Math.max(0, index * itemSize - (viewport - itemSize) / 2);
}
```

Create `packages/editor/src/survey/FrameStripe.tsx`:

```tsx
import type { FrameStatus } from "./frameStatus";

/** A frame's status in words, for screen readers and titles. */
export const STATUS_WORD: Record<FrameStatus, string> = {
  untagged: "no tags yet",
  proposed: "has proposals",
  tagged: "tagged",
};

const FILL: Record<FrameStatus, string> = {
  untagged: "bg-stone-200",
  proposed: "bg-proposed",
  tagged: "bg-confirmed",
};

const GLYPH: Record<FrameStatus, string> = { untagged: "", proposed: "?", tagged: "✓" };

/** The stripe under a thumbnail: its colour, and a glyph, so colour is never the only signal. */
export function FrameStripe({ status }: { status: FrameStatus }) {
  return (
    <span
      aria-hidden="true"
      data-status={status}
      className={`flex h-4 items-center justify-end px-1 text-xs leading-4 text-white ${FILL[status]}`}
    >
      {GLYPH[status]}
    </span>
  );
}
```

- [ ] **Step 4: Write the filmstrip and the grid**

Create `packages/editor/src/survey/Filmstrip.tsx`:

```tsx
import type { Keyframe } from "@oth/model";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { useElementSize } from "../plan/useElementSize";
import { centerOffset, visibleRange } from "../ui/windowing";
import { FrameStripe, STATUS_WORD } from "./FrameStripe";
import { statusOf, type FrameStatus } from "./frameStatus";

const THUMB = 128;
const ITEM = THUMB + 8;
/** Before the strip is measured (and always, in jsdom), assume a laptop-wide one. */
const FALLBACK_WIDTH = 1200;

/**
 * The footage as a strip of small frames under the tag bar, each with its
 * stripe. Only the frames around the one in view are rendered — a strip of
 * 400 full images is what made the old one crawl — and the one in view is
 * kept in the middle as you move.
 */
export function Filmstrip({ frames, statuses, currentId, thumbUrl, onPick }: {
  frames: readonly Keyframe[];
  statuses: ReadonlyMap<string, FrameStatus>;
  currentId: string | null;
  thumbUrl: (id: string) => string;
  onPick: (id: string) => void;
}) {
  const box = useRef<HTMLDivElement | null>(null);
  const [measure, size] = useElementSize();
  const ref = useCallback((el: HTMLDivElement | null) => {
    box.current = el;
    measure(el);
  }, [measure]);
  const [offset, setOffset] = useState(0);
  const width = size?.width ?? FALLBACK_WIDTH;
  const index = frames.findIndex(f => f.id === currentId);

  // The frame in view, kept in the middle whenever it changes.
  useLayoutEffect(() => {
    if (index < 0) return;
    const next = centerOffset(index, ITEM, width);
    if (box.current) box.current.scrollLeft = next;
    setOffset(next);
  }, [index, width]);

  const { start, end } = visibleRange(offset, width, ITEM, frames.length, 6);

  return (
    <div
      ref={ref}
      data-testid="filmstrip"
      aria-label="Frames"
      className="h-[100px] shrink-0 overflow-x-auto overflow-y-hidden border-t border-stone-200 bg-stone-100"
      onScroll={event => setOffset(event.currentTarget.scrollLeft)}
    >
      <div className="relative h-full" style={{ width: frames.length * ITEM }}>
        {frames.slice(start, end).map((f, i) => {
          const n = start + i;
          const status = statusOf(statuses, f.id);
          const current = f.id === currentId;
          return (
            <button
              key={f.id}
              type="button"
              data-testid={`filmstrip-${f.id}`}
              aria-label={`Frame ${n + 1}, ${STATUS_WORD[status]}`}
              aria-current={current ? "true" : undefined}
              className={`absolute top-1.5 overflow-hidden rounded border-2 bg-white ${
                current ? "border-accent" : "border-transparent hover:border-stone-400"
              }`}
              style={{ left: n * ITEM + 4, width: THUMB }}
              onClick={() => onPick(f.id)}
            >
              <img src={thumbUrl(f.id)} alt="" loading="lazy" decoding="async" draggable={false} className="block h-[72px] w-full object-cover" />
              <FrameStripe status={status} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

Create `packages/editor/src/survey/GridView.tsx`:

```tsx
import type { Keyframe } from "@oth/model";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { useElementSize } from "../plan/useElementSize";
import { centerOffset, visibleRange } from "../ui/windowing";
import { FrameStripe, STATUS_WORD } from "./FrameStripe";
import { statusOf, type FrameStatus } from "./frameStatus";

const CELL_W = 232;
const CELL_H = 150;
/** Before the sheet is measured (and always, in jsdom), assume a laptop-sized one. */
const FALLBACK = { width: 1200, height: 800 };

/**
 * A contact sheet of the footage with the same stripes (spec §9): the way to
 * see at a glance which stretches have been done. Only the rows in view are
 * rendered, and it opens scrolled to the frame you were on.
 */
export function GridView({ frames, statuses, currentId, thumbUrl, onOpen }: {
  frames: readonly Keyframe[];
  statuses: ReadonlyMap<string, FrameStatus>;
  currentId: string | null;
  thumbUrl: (id: string) => string;
  onOpen: (id: string) => void;
}) {
  const box = useRef<HTMLDivElement | null>(null);
  const [measure, size] = useElementSize();
  const ref = useCallback((el: HTMLDivElement | null) => {
    box.current = el;
    measure(el);
  }, [measure]);
  const [top, setTop] = useState(0);
  const { width, height } = size ?? FALLBACK;
  const cols = Math.max(1, Math.floor(width / CELL_W));
  const rows = Math.ceil(frames.length / cols);
  const index = frames.findIndex(f => f.id === currentId);

  useLayoutEffect(() => {
    if (index < 0) return;
    const next = centerOffset(Math.floor(index / cols), CELL_H, height);
    if (box.current) box.current.scrollTop = next;
    setTop(next);
  }, [index, cols, height]);

  const { start, end } = visibleRange(top, height, CELL_H, rows, 2);
  const cells = frames.slice(start * cols, end * cols);

  return (
    <div
      ref={ref}
      data-testid="grid"
      className="min-h-0 flex-1 overflow-y-auto bg-stone-100 p-3"
      onScroll={event => setTop(event.currentTarget.scrollTop)}
    >
      <ul aria-label="Frames" className="relative" style={{ height: rows * CELL_H }}>
        {cells.map((f, k) => {
          const i = start * cols + k;
          const status = statusOf(statuses, f.id);
          const current = f.id === currentId;
          return (
            <li
              key={f.id}
              className="absolute"
              style={{ left: (i % cols) * CELL_W, top: Math.floor(i / cols) * CELL_H, width: CELL_W - 8 }}
            >
              <button
                type="button"
                data-testid={`grid-${f.id}`}
                aria-label={`Open frame ${i + 1}, ${STATUS_WORD[status]}`}
                aria-current={current ? "true" : undefined}
                className={`block w-full overflow-hidden rounded border-2 bg-white ${
                  current ? "border-accent" : "border-transparent hover:border-stone-400"
                }`}
                onClick={() => onOpen(f.id)}
              >
                <img src={thumbUrl(f.id)} alt="" loading="lazy" decoding="async" draggable={false} className="block aspect-video w-full object-cover" />
                <FrameStripe status={status} />
              </button>
              <span className="mt-0.5 block text-xs text-stone-500">Frame {i + 1}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
```

- [ ] **Step 5: Run the tests and the typecheck**

Run: `npx vitest run packages/editor/src/ui/windowing.test.ts packages/editor/src/survey/Filmstrip.test.tsx packages/editor/src/survey/GridView.test.tsx --poolOptions.threads.maxThreads=2 --poolOptions.threads.minThreads=1`
Expected: PASS.
Run: `npx tsc -b`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add packages/editor/src/ui/windowing.ts packages/editor/src/ui/windowing.test.ts packages/editor/src/survey/FrameStripe.tsx packages/editor/src/survey/Filmstrip.tsx packages/editor/src/survey/Filmstrip.test.tsx packages/editor/src/survey/GridView.tsx packages/editor/src/survey/GridView.test.tsx
git commit -m "feat(editor): a windowed filmstrip and a contact-sheet Grid, with status stripes

Both render only what is in view — the old strip drew all 400 frames —
from the 240 px copy, lazily. The strip keeps the frame in view in its
middle; the grid opens scrolled to it. Each frame's stripe says tagged,
proposed or nothing yet in colour, a glyph and words.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---
### Task 10: Add footage — a dialog that files new footage under the floor and finds its frames

Spec §9 describes the dialog: "choose the video file (never uploaded), name (defaults to the filename), filed under this floor; *Find frames automatically* runs with progress and Cancel, frames appearing as they upload. The same dialog, opened on an existing capture, finds more frames in it." Spec §5.3 adds "Capture level at creation — Add footage files the capture under the current floor." The frame-finding loop moves out of `CaptureVideo` into a function that can be tested without a video. `CaptureVideo` itself is deleted in Task 15.

**Files:**
- Modify: `packages/editor/src/survey/autoFrames.ts` (add `freshSamples`)
- Create: `packages/editor/src/survey/findFrames.ts`, `packages/editor/src/survey/AddFootageDialog.tsx`
- Test: `packages/editor/src/survey/autoFrames.test.ts`, `packages/editor/src/survey/findFrames.test.ts`, `packages/editor/src/survey/AddFootageDialog.test.tsx`

**Interfaces:**
- Consumes: `samplePlan`, `isNewScene`, `SAMPLE_EVERY_MS` from `autoFrames.ts`; `seekTo`, `frameThumbnail`, `captureFrame` from `captureFrame.ts`; `frameFilename` from `frames.ts`; Task 6's `frameTime`; Task 7's `newId`; `Dialog`, `Button`, `Progress`, `toast`.
- Produces:
  - `freshSamples(plan: readonly number[], existingMs: readonly number[], toleranceMs?: number): number[]`.
  - `type FrameSource = { seek(timeMs): Promise<void>; thumbnail(): Uint8ClampedArray; grab(): Promise<Blob> }`.
  - `type FindProgress = { checked: number; total: number; kept: number }`.
  - `class FindFramesError { atMs: number; reason: unknown }`.
  - `findFrames({ moments, source, keep, onProgress, cancelled }): Promise<{ kept: number; stopped: boolean }>`.
  - `readVideo(video, canvas): FrameSource`.
  - `AddFootageDialog({ api, saver, level, captureId, open, onOpenChange, onCapture, reader? })`. `captureId: string | null` is null for new footage. `onCapture(id)` is called once a new capture exists. The parent mounts the dialog only while it is open, keyed by `captureId`, so each opening starts fresh.

- [ ] **Step 1: Write the failing tests**

In `packages/editor/src/survey/autoFrames.test.ts`, change the import to include `freshSamples`, and add:

```ts
describe("freshSamples", () => {
  it("skips moments that already have a frame close by, so running it again finds more rather than the same", () => {
    expect(freshSamples([0, 2000, 4000, 6000], [0, 2400])).toEqual([4000, 6000]);
  });

  it("keeps every moment for footage with no frames yet", () => {
    expect(freshSamples([0, 2000], [])).toEqual([0, 2000]);
  });
});
```

Create `packages/editor/src/survey/findFrames.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { FindFramesError, findFrames, type FindProgress, type FrameSource } from "./findFrames";

/** A video whose frames look like the given grey levels, one per moment. */
function source(levels: number[]): FrameSource {
  let at = 0;
  return {
    seek: async (timeMs: number) => { at = timeMs; },
    thumbnail: () => new Uint8ClampedArray(16).fill(levels[at / 2000] ?? 0),
    grab: async () => new Blob([String(at)]),
  };
}

describe("findFrames", () => {
  it("keeps the frames that show something new and drops the near-identical ones", async () => {
    const kept: number[] = [];
    const result = await findFrames({
      moments: [0, 2000, 4000],
      source: source([10, 11, 200]),
      keep: async (_blob, timeMs) => { kept.push(timeMs); },
      onProgress: () => {},
      cancelled: () => false,
    });
    expect(kept).toEqual([0, 4000]);
    expect(result).toEqual({ kept: 2, stopped: false });
  });

  it("says how far it has got, ending with everything checked", async () => {
    const progress: FindProgress[] = [];
    await findFrames({
      moments: [0, 2000],
      source: source([10, 200]),
      keep: async () => {},
      onProgress: p => progress.push(p),
      cancelled: () => false,
    });
    expect(progress[0]).toEqual({ checked: 0, total: 2, kept: 0 });
    expect(progress.at(-1)).toEqual({ checked: 2, total: 2, kept: 2 });
  });

  it("stops between frames when asked to, keeping what it has", async () => {
    let stop = false;
    const result = await findFrames({
      moments: [0, 2000, 4000],
      source: source([10, 200, 10]),
      keep: async () => { stop = true; },
      onProgress: () => {},
      cancelled: () => stop,
    });
    expect(result).toEqual({ kept: 1, stopped: true });
  });

  it("says at which moment it stopped when a frame could not be kept", async () => {
    const failure = new TypeError("Failed to fetch");
    const run = findFrames({
      moments: [0, 2000],
      source: source([10, 200]),
      keep: async (_blob, timeMs) => { if (timeMs === 2000) throw failure; },
      onProgress: () => {},
      cancelled: () => false,
    });
    await expect(run).rejects.toBeInstanceOf(FindFramesError);
    await run.catch((err: FindFramesError) => {
      expect(err.atMs).toBe(2000);
      expect(err.reason).toBe(failure);
    });
  });
});
```

Create `packages/editor/src/survey/AddFootageDialog.test.tsx`:

```tsx
import { parseModel, type Level } from "@oth/model";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, type Api } from "../api/client";
import type { Saver } from "../state/save";
import { useEditorStore } from "../state/store";
import { useToasts } from "../ui/toast";
import { AddFootageDialog } from "./AddFootageDialog";
import type { FrameSource } from "./findFrames";

const model = parseModel({
  building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
  levels: [{ id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "Level 1", nameZh: "一楼", elevationM: 0, heightM: 6 }],
  captures: [{ id: "cap_1", kind: "video", filename: "L1 walk.mp4", levelId: "oth-L1" }],
  keyframes: [
    { id: "kf_1", captureId: "cap_1", timeMs: 0, imageId: "kf_1", widthPx: 64, heightPx: 36 },
    { id: "kf_2", captureId: "cap_1", timeMs: 2000, imageId: "kf_2", widthPx: 64, heightPx: 36 },
  ],
});
const L1 = model.levels[0] as Level;

/** Every moment looks different, so every one is kept. */
function reader(): () => FrameSource {
  let n = 0;
  return () => ({
    seek: async () => {},
    thumbnail: () => new Uint8ClampedArray(16).fill((n++ * 97) % 256),
    grab: async () => new Blob(["jpeg"]),
  });
}

function setup({ captureId = null, upload = vi.fn(async () => ({})) }: {
  captureId?: string | null;
  upload?: ReturnType<typeof vi.fn>;
} = {}) {
  const api = { uploadKeyframe: upload } as unknown as Api;
  const saver = {
    create: vi.fn(async () => true),
    update: vi.fn(async () => true),
    refresh: vi.fn(async () => {}),
  };
  const onOpenChange = vi.fn();
  const onCapture = vi.fn();
  render(
    <AddFootageDialog
      api={api} saver={saver as unknown as Saver} level={L1} captureId={captureId}
      open onOpenChange={onOpenChange} onCapture={onCapture} reader={reader()}
    />,
  );
  return { upload, saver, onOpenChange, onCapture };
}

/** Opens a six-second video and lets its length load. */
function openVideo() {
  fireEvent.change(screen.getByLabelText("Choose the video file"), {
    target: { files: [new File([new Uint8Array([1])], "L1 east.mp4", { type: "video/mp4" })] },
  });
  const video = screen.getByTestId("footage-video");
  Object.defineProperty(video, "duration", { value: 6, configurable: true });
  fireEvent.loadedMetadata(video);
}

beforeEach(() => {
  useEditorStore.getState().reset();
  useEditorStore.getState().setModel(model);
  useToasts.getState().clear();
  URL.createObjectURL = vi.fn(() => "blob:local-video");
  URL.revokeObjectURL = vi.fn();
});

describe("AddFootageDialog", () => {
  it("says the footage is filed under this floor and the video is never uploaded", () => {
    setup();
    expect(screen.getByText(/filed under L1/i).textContent).toMatch(/never uploaded/i);
  });

  it("names the footage after its file unless told otherwise", () => {
    setup();
    openVideo();
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("L1 east.mp4");
  });

  it("files new footage under this floor, then keeps and uploads each new frame", async () => {
    const { saver, upload, onCapture, onOpenChange } = setup();
    openVideo();
    fireEvent.click(screen.getByRole("button", { name: /find frames automatically/i }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(saver.create).toHaveBeenCalledWith("capture", expect.objectContaining({
      kind: "video", filename: "L1 east.mp4", levelId: "oth-L1", durationMs: 6000,
    }));
    const id = (saver.create.mock.calls[0] as unknown as [string, { id: string }])[1].id;
    expect(onCapture).toHaveBeenCalledWith(id);
    expect(upload).toHaveBeenCalledTimes(3);
    expect(upload.mock.calls.map(c => (c as unknown[])[1])).toEqual([id, id, id]);
    expect(useToasts.getState().toasts[0]!.message).toBe("Kept 3 frames from L1 east.mp4.");
  });

  it("finds more frames in footage that has some, skipping the moments it already has", async () => {
    const { saver, upload } = setup({ captureId: "cap_1" });
    openVideo();
    fireEvent.click(screen.getByRole("button", { name: /find frames automatically/i }));
    await waitFor(() => expect(upload).toHaveBeenCalledTimes(1));
    expect((upload.mock.calls[0] as unknown[]).slice(1, 3)).toEqual(["cap_1", 4000]);
    expect(saver.create).not.toHaveBeenCalled();
  });

  it("renames existing footage when its name is changed", async () => {
    const { saver } = setup({ captureId: "cap_1" });
    openVideo();
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "L1 walk, east end" } });
    fireEvent.click(screen.getByRole("button", { name: /find frames automatically/i }));
    await waitFor(() => expect(saver.update).toHaveBeenCalledWith("capture", "cap_1", 0, { filename: "L1 walk, east end" }));
  });

  it("says where it stopped when a frame will not upload, and stays open to run again", async () => {
    const upload = vi.fn()
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const { onOpenChange } = setup({ upload });
    openVideo();
    fireEvent.click(screen.getByRole("button", { name: /find frames automatically/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/stopped at 0m02s.*run it again/i);
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("leaves an expired session to the sign-in dialog", async () => {
    const upload = vi.fn(async () => { throw new ApiError(401, null); });
    setup({ upload });
    openVideo();
    fireEvent.click(screen.getByRole("button", { name: /find frames automatically/i }));
    await waitFor(() => expect(upload).toHaveBeenCalled());
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("says so when the video's length is not known yet", () => {
    setup();
    fireEvent.change(screen.getByLabelText("Choose the video file"), {
      target: { files: [new File([new Uint8Array([1])], "a.mp4", { type: "video/mp4" })] },
    });
    fireEvent.click(screen.getByRole("button", { name: /find frames automatically/i }));
    expect(screen.getByRole("alert")).toHaveTextContent(/length isn't known yet/i);
  });

  it("offers nothing to run before a video is chosen", () => {
    setup();
    expect((screen.getByRole("button", { name: /find frames automatically/i }) as HTMLButtonElement).disabled).toBe(true);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run packages/editor/src/survey/autoFrames.test.ts packages/editor/src/survey/findFrames.test.ts packages/editor/src/survey/AddFootageDialog.test.tsx --poolOptions.threads.maxThreads=2 --poolOptions.threads.minThreads=1`
Expected: FAIL — `freshSamples`, `./findFrames` and `./AddFootageDialog` do not exist.

- [ ] **Step 3: Fresh samples, and the loop on its own**

At the end of `packages/editor/src/survey/autoFrames.ts`, add:

```ts
/**
 * The moments not already covered by a frame the footage has — so running it
 * again on the same video finds more frames rather than the same ones twice,
 * and a run that stopped halfway carries on from where it stopped.
 */
export function freshSamples(
  plan: readonly number[], existingMs: readonly number[], toleranceMs = SAMPLE_EVERY_MS / 2,
): number[] {
  return plan.filter(t => !existingMs.some(e => Math.abs(e - t) < toleranceMs));
}
```

Create `packages/editor/src/survey/findFrames.ts`:

```ts
import { isNewScene } from "./autoFrames";

/** A video, as far as finding frames in it needs. The real one seeks and draws; a test's is numbers. */
export type FrameSource = {
  /** Moves to a moment and waits until that frame can be drawn. */
  seek: (timeMs: number) => Promise<void>;
  /** A tiny copy of the frame on screen, for telling frames apart. */
  thumbnail: () => Uint8ClampedArray;
  /** The frame on screen, as a JPEG. */
  grab: () => Promise<Blob>;
};

export type FindProgress = { checked: number; total: number; kept: number };

/** Where a run stopped, and why, so it can say which moment to look at. */
export class FindFramesError extends Error {
  constructor(public readonly atMs: number, public readonly reason: unknown) {
    super(`stopped at ${atMs} ms`);
    this.name = "FindFramesError";
  }
}

/**
 * Walks the moments given, keeps each frame that shows something new, and
 * hands it over as soon as it is taken — so frames appear while the rest of
 * the footage is still being read. Checks for Cancel between frames.
 */
export async function findFrames({ moments, source, keep, onProgress, cancelled }: {
  moments: readonly number[];
  source: FrameSource;
  keep: (blob: Blob, timeMs: number) => Promise<void>;
  onProgress: (progress: FindProgress) => void;
  cancelled: () => boolean;
}): Promise<{ kept: number; stopped: boolean }> {
  let kept = 0;
  let previous: Uint8ClampedArray | null = null;
  for (const [i, timeMs] of moments.entries()) {
    if (cancelled()) return { kept, stopped: true };
    onProgress({ checked: i, total: moments.length, kept });
    try {
      await source.seek(timeMs);
      const thumb = source.thumbnail();
      if (!isNewScene(previous, thumb)) continue;
      previous = thumb;
      await keep(await source.grab(), timeMs);
      kept++;
    } catch (err) {
      throw new FindFramesError(timeMs, err);
    }
  }
  onProgress({ checked: moments.length, total: moments.length, kept });
  return { kept, stopped: false };
}
```

- [ ] **Step 4: Write the dialog**

Create `packages/editor/src/survey/AddFootageDialog.tsx`:

```tsx
import { live, type Level } from "@oth/model";
import { useEffect, useRef, useState } from "react";
import { ApiError, isUnauthorized, type Api } from "../api/client";
import type { Saver } from "../state/save";
import { useEditorStore } from "../state/store";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { Progress } from "../ui/Progress";
import { toast } from "../ui/toast";
import { freshSamples, samplePlan } from "./autoFrames";
import { captureFrame, frameThumbnail, seekTo } from "./captureFrame";
import { FindFramesError, findFrames, type FindProgress, type FrameSource } from "./findFrames";
import { frameFilename } from "./frames";
import { frameTime } from "./surveyView";
import { newId } from "./tagging";

/** How a browser reads frames: seek the video, draw it on a canvas. */
export function readVideo(video: HTMLVideoElement, canvas: HTMLCanvasElement): FrameSource {
  return {
    seek: timeMs => seekTo(video, timeMs / 1000),
    thumbnail: () => frameThumbnail(video, canvas),
    grab: () => captureFrame(video, canvas),
  };
}

/** Frames are shown in batches: reloading the model after each of 400 uploads would be the slow part. */
const REFRESH_EVERY = 10;

type Target = { id: string; filename: string };

function why(reason: unknown): string {
  if (reason instanceof ApiError) return `the server refused a frame (HTTP ${reason.status}).`;
  if (reason instanceof Error && /read|seek|video/i.test(reason.message)) return `${reason.message}.`;
  return "a frame didn't upload. Check your connection.";
}

/**
 * Add footage (spec §9): a video from this computer, never uploaded — it is
 * opened as an object URL and only the frames worth keeping are sent. New
 * footage is filed under this floor as it is made (spec §5.3). Opened on
 * existing footage, it looks through the video again for moments that have
 * no frame yet, and renames it if the name was changed.
 */
export function AddFootageDialog({ api, saver, level, captureId, open, onOpenChange, onCapture, reader = readVideo }: {
  api: Pick<Api, "uploadKeyframe">;
  saver: Pick<Saver, "create" | "update" | "refresh">;
  level: Level;
  /** Existing footage to find more frames in, or null for new footage. */
  captureId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Told the new footage's id once it exists, so the workspace can show it behind the dialog. */
  onCapture: (captureId: string) => void;
  /** Seam for tests: jsdom can neither seek a video nor draw one. */
  reader?: (video: HTMLVideoElement, canvas: HTMLCanvasElement) => FrameSource;
}) {
  const capture = useEditorStore(s =>
    captureId ? live(s.model?.captures ?? []).find(c => c.id === captureId) ?? null : null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cancelled = useRef(false);
  const [url, setUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [name, setName] = useState(capture?.filename ?? "");
  const [durationMs, setDurationMs] = useState<number | null>(null);
  const [made, setMade] = useState<Target | null>(null);
  const [progress, setProgress] = useState<FindProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const running = progress !== null;

  // The video is a whole file held in memory; let it go when the dialog does.
  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url);
  }, [url]);

  function choose(file: File) {
    setUrl(URL.createObjectURL(file));
    setFileName(file.name);
    setDurationMs(null);
    setError(null);
    if (!capture && name.trim() === "") setName(file.name);
  }

  /** The footage frames go into: this one, renamed if asked, or new footage filed under this floor. */
  async function target(): Promise<Target | null> {
    if (capture) {
      const filename = name.trim();
      if (filename !== "" && filename !== capture.filename) {
        if (!(await saver.update("capture", capture.id, capture.version, { filename }))) return null;
      }
      return { id: capture.id, filename: filename || capture.filename };
    }
    if (made) return made;
    const filename = name.trim() || fileName || "footage";
    const id = newId("cap");
    const ok = await saver.create("capture", {
      id, kind: "video", filename, levelId: level.id,
      ...(durationMs ? { durationMs: Math.round(durationMs) } : {}),
    });
    if (!ok) return null;
    const next = { id, filename };
    setMade(next);
    onCapture(id);
    return next;
  }

  async function run() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    if (!durationMs) {
      setError("The video's length isn't known yet. Give it a moment, then try again.");
      return;
    }
    setError(null);
    const into = await target();
    if (!into) return;

    const existing = live(useEditorStore.getState().model?.keyframes ?? [])
      .filter(k => k.captureId === into.id)
      .flatMap(k => (k.timeMs === undefined ? [] : [k.timeMs]));
    const moments = freshSamples(samplePlan(durationMs), existing);
    if (moments.length === 0) {
      setError("Every stretch of this video already has a frame.");
      return;
    }

    cancelled.current = false;
    setProgress({ checked: 0, total: moments.length, kept: 0 });
    let uploaded = 0;
    try {
      const result = await findFrames({
        moments,
        source: reader(video, canvas),
        cancelled: () => cancelled.current,
        onProgress: setProgress,
        keep: async (blob, timeMs) => {
          await api.uploadKeyframe(blob, into.id, timeMs, frameFilename(into, timeMs));
          uploaded++;
          // Frames appear as they upload, a batch at a time.
          if (uploaded % REFRESH_EVERY === 0) await saver.refresh().catch(() => {});
        },
      });
      await saver.refresh().catch(() => {});
      toast({
        tone: "success",
        message: result.stopped
          ? `Stopped. Kept ${result.kept} frames — run it again to carry on.`
          : `Kept ${result.kept} frames from ${into.filename}.`,
      });
      onOpenChange(false);
    } catch (err) {
      await saver.refresh().catch(() => {});
      setProgress(null);
      const reason = err instanceof FindFramesError ? err.reason : err;
      // The sign-in dialog over the page is the message.
      if (isUnauthorized(reason)) return;
      const at = err instanceof FindFramesError ? ` at ${frameTime(err.atMs)}` : "";
      setError(`Stopped${at}: ${why(reason)} Frames kept so far stay — run it again and it carries on from there.`);
    }
  }

  async function grabOne() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    setError(null);
    const into = await target();
    if (!into) return;
    const timeMs = video.currentTime * 1000;
    try {
      const blob = await reader(video, canvas).grab();
      await api.uploadKeyframe(blob, into.id, timeMs, frameFilename(into, timeMs));
      await saver.refresh().catch(() => {});
      toast({ tone: "success", message: `Added the frame at ${frameTime(timeMs)}.` });
    } catch (err) {
      if (!isUnauthorized(err)) setError(`Couldn't add that frame: ${why(err)}`);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        if (!running) onOpenChange(next);
      }}
      title={capture ? `Find more frames in ${capture.filename}` : "Add footage"}
      description={`Filed under ${level.code}. The video is never uploaded — only the frames worth keeping are.`}
      dismissible={!running}
    >
      <div className="space-y-3">
        <label className="block">
          <span className="text-xs font-medium text-stone-600">Video file</span>
          <input
            type="file"
            accept="video/*"
            aria-label="Choose the video file"
            disabled={running}
            className="mt-1 block w-full text-sm"
            onChange={event => {
              const file = event.target.files?.[0];
              if (file) choose(file);
            }}
          />
        </label>
        {capture && !url && (
          <p className="text-xs text-stone-500">Open {capture.filename} from this computer to look through it again.</p>
        )}
        <label className="block">
          <span className="text-xs font-medium text-stone-600">Name</span>
          <input
            aria-label="Name"
            value={name}
            disabled={running}
            placeholder="Defaults to the file's name"
            onChange={event => setName(event.target.value)}
            className="mt-1 h-9 w-full rounded border border-stone-300 px-2 text-sm"
          />
        </label>
        {url && (
          <video
            ref={videoRef}
            src={url}
            controls
            preload="metadata"
            data-testid="footage-video"
            className="max-h-56 w-full rounded bg-black"
            onLoadedMetadata={event => {
              const seconds = event.currentTarget.duration;
              setDurationMs(Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : null);
            }}
          />
        )}
        <canvas ref={canvasRef} className="hidden" />
        {progress && (
          <div role="status" className="space-y-1.5">
            <Progress value={progress.checked} max={progress.total} label="Looking through the video" />
            <p className="text-sm">
              Looking through the video — {progress.checked} of {progress.total} checked, {progress.kept} kept.
            </p>
          </div>
        )}
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          {running ? (
            <Button onClick={() => { cancelled.current = true; }}>Cancel</Button>
          ) : (
            <>
              <Button disabled={!url} onClick={() => void grabOne()}>Grab this frame</Button>
              <Button variant="primary" disabled={!url} onClick={() => void run()}>Find frames automatically</Button>
            </>
          )}
        </div>
      </div>
    </Dialog>
  );
}
```

- [ ] **Step 5: Run the tests and the typecheck**

Run: `npx vitest run packages/editor/src/survey/autoFrames.test.ts packages/editor/src/survey/findFrames.test.ts packages/editor/src/survey/AddFootageDialog.test.tsx --poolOptions.threads.maxThreads=2 --poolOptions.threads.minThreads=1`
Expected: PASS.
Run: `npx tsc -b`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add packages/editor/src/survey/autoFrames.ts packages/editor/src/survey/autoFrames.test.ts packages/editor/src/survey/findFrames.ts packages/editor/src/survey/findFrames.test.ts packages/editor/src/survey/AddFootageDialog.tsx packages/editor/src/survey/AddFootageDialog.test.tsx
git commit -m "feat(editor): Add footage — a dialog that files footage under the floor and finds its frames

The video is chosen from this computer and never uploaded; new footage
is named after its file and filed under the floor it was added on, so
its places land on that floor. Find frames automatically runs with
progress and Cancel, and frames appear in batches as they upload.
Opened on existing footage, it skips moments that already have a
frame, so a second run finds more rather than the same, and a run that
stopped carries on. A failure says at which moment it stopped.

The frame-finding loop is out of CaptureVideo and tested on its own.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---
### Task 11: The Survey workspace

This task puts spec §9 together. The top row holds the capture picker, `Frame 212 of 445 · 7m04s`, the filter chips, the Frame | Grid toggle and **+ Add footage**. Below it come the frame, the tag bar and the filmstrip; the right panel shows *On this frame* and *Places on L1*; and the keys work throughout. The real walkthrough is filed under no floor, so the workspace offers to file it (Review Focus 1). Binning a frame and removing a tag each offer Undo. The shared Undo toast is written here, because this is its first user.

**Files:**
- Modify: `packages/editor/src/ui/undo.ts` (add `offerUndo`; `deleteWithUndo` uses it)
- Create: `packages/editor/src/survey/FramePanel.tsx`, `packages/editor/src/survey/FrameView.tsx`, `packages/editor/src/survey/SurveyWorkspace.tsx`
- Test: `packages/editor/src/ui/undo.test.ts`, `packages/editor/src/survey/SurveyWorkspace.test.tsx`

**Interfaces:**
- Consumes: Tasks 6–10 (`surveyView`, `readSurveyParams`, `stepFrame`, `nextUntagged`, `frameTime`, `SURVEY_FILTERS`, `useKeys`, `surveyCommand`, `linkablePlaces`, `tagWrites`, `newId`, `walkwayColour`, `FrameCanvas`, `TagBar`, `Filmstrip`, `GridView`, `AddFootageDialog`); `setParams` from `route.ts`; `labelsForFrame`; `sightingCounts`, `matchPlaces`; `deleteWithUndo`; Task 1's `Saver.apply("keyframe", …)`.
- Produces:
  - `offerUndo({ message, undone, what, run, refresh }: { message: string; undone: string; what: string; run: () => Promise<unknown>; refresh: () => Promise<void> }): void`.
  - `SurveyWorkspace({ api, saver, level, params }: { api: Api; saver: Saver; level: Level; params: Record<string, string> })`.
  - `FramePanel({ labels, places, counts, levelCode, placeFilter, onRemove, onPickPlace })`.
  - `FrameView({ api, frame, alt, labels, draft, onDraft, onMoveLabel, onRemoveLabel, tagBar, candidates, levels, levelId, counts, walkwayKinds, onTag, onAddWalkwayKind, strip })`.

- [ ] **Step 1: Write the failing tests**

In `packages/editor/src/ui/undo.test.ts`, change the import to `import { deleteWithUndo, offerUndo } from "./undo";`, and add at the end:

```ts
describe("offerUndo", () => {
  it("says what came back when Undo works, and reloads", async () => {
    const run = vi.fn(async () => ({}));
    const refresh = vi.fn(async () => {});
    offerUndo({ message: "Binned frame 3", undone: "Frame 3 is back", what: "frame 3", run, refresh });
    await useToasts.getState().toasts[0]!.action!.run();
    expect(run).toHaveBeenCalledTimes(1);
    expect(useToasts.getState().toasts.at(-1)).toMatchObject({ tone: "success", message: "Frame 3 is back" });
    expect(refresh).toHaveBeenCalled();
  });

  it("reloads even when the undo is refused, and says why", async () => {
    const refresh = vi.fn(async () => {});
    offerUndo({
      message: "Accepted Gate 1", undone: "Gate 1 is back in the queue", what: "Gate 1",
      run: async () => { throw new ConflictError({ version: 5 }, null); },
      refresh,
    });
    await useToasts.getState().toasts[0]!.action!.run();
    expect(useToasts.getState().toasts.at(-1)!.message).toMatch(/changed since/i);
    expect(refresh).toHaveBeenCalled();
  });
});
```

Create `packages/editor/src/survey/SurveyWorkspace.test.tsx`:

```tsx
import { parseModel, type Level } from "@oth/model";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Api } from "../api/client";
import { useCurrentRoute } from "../route";
import { createSaver } from "../state/save";
import { useEditorStore } from "../state/store";
import { fakeApi } from "../testing/fakeApi";
import { useToasts } from "../ui/toast";
import { SurveyWorkspace } from "./SurveyWorkspace";

const frame = (id: string, captureId: string, timeMs: number) =>
  ({ id, captureId, timeMs, imageId: id, widthPx: 640, heightPx: 360 });

const model = parseModel({
  building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
  levels: [{ id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "Level 1", nameZh: "一楼", elevationM: 0, heightM: 6 }],
  captures: [
    { id: "cap_1", kind: "video", filename: "L1 walk.mp4", levelId: "oth-L1" },
    // The real walkthrough: filed under no floor.
    { id: "cap_u", kind: "video", filename: "level 1" },
  ],
  pathwayKinds: [{ id: "pk-1", nameEn: "Covered link", colorHex: "#38bdf8" }],
  keyframes: [frame("kf_1", "cap_1", 1000), frame("kf_2", "cap_1", 2000), frame("kf_3", "cap_1", 3000), frame("kf_u", "cap_u", 0)],
  places: [
    { id: "p_kopi", nameEn: "Kopitiam", category: "retail", levelId: "oth-L1" },
    { id: "p_prop", nameEn: "Festive Mall", category: "retail", status: "proposed", levelId: "oth-L1" },
  ],
  sightings: [
    { id: "s1", placeId: "p_kopi", keyframeId: "kf_1", box: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 } },
    { id: "s2", placeId: "p_prop", keyframeId: "kf_2", status: "proposed" },
  ],
});
const L1 = model.levels[0] as Level;

/** The workspace as the floor hosts it: its parameters come from the address. */
function Hosted({ api }: { api: Api }) {
  const route = useCurrentRoute();
  const saver = createSaver(api, { validate: false });
  return <SurveyWorkspace api={api} saver={saver} level={L1} params={route.name === "floor" ? route.params : {}} />;
}

function at(search = "", api = fakeApi({ getModel: vi.fn().mockResolvedValue(model) })) {
  window.history.pushState({}, "", `/floors/L1/survey${search}`);
  render(<Hosted api={api} />);
  return api as unknown as Record<string, ReturnType<typeof vi.fn>>;
}

const param = (name: string) => new URLSearchParams(window.location.search).get(name);
const key = (k: string, target: Element = document.body) => fireEvent.keyDown(target, { key: k });

beforeEach(() => {
  useEditorStore.getState().reset();
  useEditorStore.getState().setUser({ id: "u_sc", email: "sc@oth.local", displayName: "Stef Chan" });
  useEditorStore.getState().setModel(model);
  useToasts.getState().clear();
  URL.createObjectURL = vi.fn(() => "blob:local-video");
  URL.revokeObjectURL = vi.fn();
});

describe("SurveyWorkspace", () => {
  it("opens on the first frame with no tag, and says where it is in the footage", () => {
    at();
    expect(screen.getByText(/Frame 3 of 3/)).toBeTruthy();
    expect(screen.getByText(/0m03s/)).toBeTruthy();
  });

  it("counts the frames under each filter", () => {
    at();
    const chips = within(screen.getByRole("group", { name: "Show frames" }));
    expect(chips.getByRole("button", { name: /Untagged/ }).textContent).toContain("1");
    expect(chips.getByRole("button", { name: /Proposed/ }).textContent).toContain("1");
    expect(chips.getByRole("button", { name: /^Tagged/ }).textContent).toContain("1");
  });

  it("shows the frame at the size tagging needs, and the strip at the small one", () => {
    at();
    expect(screen.getByAltText("Frame 3 of 3").getAttribute("src")).toBe("/api/keyframes/kf_3/file?w=1600");
    expect(screen.getByTestId("filmstrip-kf_1").querySelector("img")!.getAttribute("src")).toBe("/api/keyframes/kf_1/file?w=240");
  });

  it("moves between frames with the arrow keys, and the address follows", () => {
    at();
    key("ArrowLeft");
    expect(param("frame")).toBe("kf_2");
    expect(screen.getByText(/Frame 2 of 3/)).toBeTruthy();
  });

  it("goes to the next frame with no tag on N", () => {
    at("?frame=kf_1");
    key("n");
    expect(param("frame")).toBe("kf_3");
  });

  it("takes letters typed into the name as text, not as commands", () => {
    // Review Focus 2: the N of "NTUC" is not "next untagged".
    at("?frame=kf_1");
    key("n", screen.getByLabelText("Place name"));
    key("g", screen.getByLabelText("Place name"));
    expect(param("frame")).toBe("kf_1");
    expect(param("view")).toBeNull();
  });

  it("tags a new name as a place on this floor, then ties it to the frame", async () => {
    const api = at();
    const name = screen.getByLabelText("Place name");
    fireEvent.change(name, { target: { value: "Kiosk" } });
    key("Enter", name);
    await waitFor(() => expect(api.createEntity).toHaveBeenCalledTimes(2));
    const [placeCall, sightingCall] = api.createEntity.mock.calls as [string, Record<string, unknown>][];
    expect(placeCall![0]).toBe("place");
    expect(placeCall![1]).toMatchObject({ nameEn: "Kiosk", levelId: "oth-L1" });
    expect(sightingCall![0]).toBe("sighting");
    expect(sightingCall![1]).toMatchObject({ placeId: placeCall![1].id, keyframeId: "kf_3" });
  });

  it("links a name that exists, whatever its case, rather than making it again", async () => {
    // Review Focus 3.
    const api = at();
    fireEvent.change(screen.getByLabelText("Place name"), { target: { value: "  kopitiam " } });
    fireEvent.click(screen.getByRole("button", { name: /Tag as Kopitiam/ }));
    await waitFor(() => expect(api.createEntity).toHaveBeenCalledTimes(1));
    expect(api.createEntity).toHaveBeenCalledWith("sighting", expect.objectContaining({ placeId: "p_kopi", keyframeId: "kf_3" }));
  });

  it("puts the cursor in the name on T", () => {
    at();
    key("t");
    expect(document.activeElement).toBe(screen.getByLabelText("Place name"));
  });

  it("bins the frame with Del, moves on, and Undo brings it back", async () => {
    const api = at();
    key("Delete");
    expect(param("frame")).toBe("kf_2");
    await waitFor(() => expect(useToasts.getState().toasts.some(t => t.message === "Binned frame 3")).toBe(true));
    expect(api.deleteKeyframe).toHaveBeenCalledWith("kf_3");
    const shown = useToasts.getState().toasts.find(t => t.message === "Binned frame 3")!;
    await act(async () => { await shown.action!.run(); });
    expect(api.restoreKeyframe).toHaveBeenCalledWith("kf_3");
  });

  it("does not bin the next frame too when Del is pressed again before the first has gone", async () => {
    // Review Focus 4.
    const api = at();
    key("Delete");
    key("Delete");
    await waitFor(() => expect(api.deleteKeyframe).toHaveBeenCalled());
    expect(api.deleteKeyframe).toHaveBeenCalledTimes(1);
  });

  it("removes a tag from the side panel, with Undo", async () => {
    const api = at("?frame=kf_1");
    fireEvent.click(screen.getByRole("button", { name: "Remove Kopitiam from this frame" }));
    await waitFor(() =>
      expect(useToasts.getState().toasts.some(t => t.message === "Deleted the tag Kopitiam" && t.action)).toBe(true));
    expect(api.deleteEntity).toHaveBeenCalledWith("sighting", "s1", 0);
  });

  it("offers to file footage that is on no floor under this one", async () => {
    // Review Focus 1: the real walkthrough has no level.
    const api = at();
    expect(screen.getByRole("status").textContent).toMatch(/level 1.*1 frame.*isn't filed under a floor/);
    fireEvent.click(screen.getByRole("button", { name: "File under L1" }));
    await waitFor(() => expect(api.updateEntity).toHaveBeenCalledWith("capture", "cap_u", 0, { levelId: "oth-L1" }));
  });

  it("shows the contact sheet on G, and a frame chosen there opens in Frame view", () => {
    at();
    key("g");
    expect(param("view")).toBe("grid");
    fireEvent.click(screen.getByTestId("grid-kf_1"));
    expect(param("view")).toBeNull();
    expect(param("frame")).toBe("kf_1");
  });

  it("shows only the frames a place was seen in when it is chosen", () => {
    at();
    const panel = within(screen.getByRole("complementary", { name: "This frame and the floor's places" }));
    fireEvent.click(panel.getByRole("button", { name: /^Kopitiam/ }));
    expect(param("place")).toBe("p_kopi");
    expect(screen.getByRole("button", { name: /Seen: Kopitiam/ })).toBeTruthy();
    expect(screen.getByText(/Frame 1 of 3/)).toBeTruthy();
  });

  it("falls back to this floor's footage and all frames for an address it cannot use", () => {
    at("?capture=nope&filter=bogus&view=list");
    expect(screen.getByText(/Frame 3 of 3/)).toBeTruthy();
    expect(within(screen.getByRole("group", { name: "Show frames" })).getByRole("button", { name: "All" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("says there is no footage yet and offers to add some", () => {
    useEditorStore.getState().setModel(parseModel({ ...model, captures: [], keyframes: [], sightings: [] }));
    at();
    expect(screen.getByText(/No footage on L1 yet/)).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "+ Add footage" })[0]!);
    expect(screen.getByRole("dialog", { name: "Add footage" })).toBeTruthy();
  });

  it("stays on screen when the session expires", () => {
    at();
    act(() => useEditorStore.getState().endSession("expired"));
    expect(screen.getByText(/Frame 3 of 3/)).toBeTruthy();
  });

  it("loads nothing itself: the shell's one load is the only one", () => {
    const api = at();
    expect(api.getModel).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run packages/editor/src/ui/undo.test.ts packages/editor/src/survey/SurveyWorkspace.test.tsx --poolOptions.threads.maxThreads=2 --poolOptions.threads.minThreads=1`
Expected: FAIL — `offerUndo` is not exported; `./SurveyWorkspace` does not resolve.

- [ ] **Step 3: One Undo toast for everything**

In `packages/editor/src/ui/undo.ts`, above `deleteWithUndo`, add:

```ts
/**
 * An Undo on the toast that says what just happened (spec §10: "Accepted
 * Festive Mall · Undo"). Undoing runs `run`, then reloads whatever the outcome
 * so the screen shows what the server now has. A teammate's change since is
 * refused rather than overwritten, and the toast says so; a 401 says nothing,
 * because the sign-in dialog over the page is the message.
 */
export function offerUndo({ message, undone, what, run, refresh }: {
  message: string;
  /** Said when the undo worked: "Frame 3 is back". */
  undone: string;
  /** What was undone, for the failure messages. */
  what: string;
  run: () => Promise<unknown>;
  refresh: () => Promise<void>;
}): void {
  toast({
    message,
    action: {
      label: "Undo",
      run: async () => {
        try {
          await run();
          toast({ message: undone, tone: "success" });
        } catch (err) {
          if (isUnauthorized(err)) return;
          toast({
            tone: "error",
            message:
              err instanceof ConflictError
                ? `Couldn't undo: ${what} was changed since. Reload to see the latest.`
                : `Couldn't undo ${what}. Check your connection and try again.`,
          });
        } finally {
          await refresh().catch(() => {});
        }
      },
    },
  });
}
```

Then replace the `toast({ … })` call inside `deleteWithUndo` (everything from `toast({` through its closing `});`, before `return done.length === removals.length;`) with:

```ts
  offerUndo({
    message: `Deleted ${label}`,
    undone: `Restored ${label}`,
    what: label,
    run: async () => {
      for (const r of [...done].reverse()) await api.restoreEntity(r.type, r.id, r.version + 1);
    },
    refresh: saver.refresh,
  });
```

- [ ] **Step 4: The side panel and the frame's column**

Create `packages/editor/src/survey/FramePanel.tsx`:

```tsx
import type { Place } from "@oth/model";
import { useState } from "react";
import type { FrameLabel } from "./labelled";
import { matchPlaces } from "./places";

/**
 * The right-hand panel (spec §9): what is tagged on this frame, each
 * removable, and the floor's places, searchable. Choosing a place narrows the
 * frames to the ones it was seen in.
 */
export function FramePanel({ labels, places, counts, levelCode, placeFilter, onRemove, onPickPlace }: {
  labels: readonly FrameLabel[];
  places: readonly Place[];
  counts: ReadonlyMap<string, number>;
  levelCode: string;
  placeFilter: string | null;
  onRemove: (label: FrameLabel) => void;
  onPickPlace: (placeId: string | null) => void;
}) {
  const [query, setQuery] = useState("");
  const shown = query.trim() === ""
    ? [...places].sort((a, b) => a.nameEn.localeCompare(b.nameEn))
    : matchPlaces(places, query);

  return (
    <aside aria-label="This frame and the floor's places" className="flex w-72 shrink-0 flex-col border-l border-stone-200 bg-white">
      <section className="border-b border-stone-200 p-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-stone-500">On this frame</h2>
        {labels.length === 0 ? (
          <p className="mt-1 text-xs text-stone-500">Nothing tagged here yet.</p>
        ) : (
          <ul className="mt-1 space-y-1">
            {labels.map(label => (
              <li key={label.sighting.id} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate">
                  {label.place.nameEn}
                  <span className="ml-1 text-xs text-stone-500">
                    {label.sighting.box ? "boxed" : "whole frame"}
                    {label.sighting.status === "proposed" ? " · proposed" : ""}
                  </span>
                </span>
                <button
                  type="button"
                  aria-label={`Remove ${label.place.nameEn} from this frame`}
                  className="rounded px-1.5 text-stone-500 hover:bg-stone-100 hover:text-danger"
                  onClick={() => onRemove(label)}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="flex min-h-0 flex-1 flex-col p-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-stone-500">
          Places on {levelCode} ({places.length})
        </h2>
        <input
          type="search"
          aria-label={`Search places on ${levelCode}`}
          placeholder="Search…"
          value={query}
          onChange={event => setQuery(event.target.value)}
          className="mt-2 h-8 rounded border border-stone-300 px-2 text-sm"
        />
        <ul className="mt-2 min-h-0 flex-1 overflow-y-auto">
          {shown.map(p => (
            <li key={p.id}>
              <button
                type="button"
                aria-pressed={placeFilter === p.id}
                title="Show only the frames this place is seen in"
                className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left ${
                  placeFilter === p.id ? "bg-accent-soft text-accent" : "hover:bg-stone-100"
                }`}
                onClick={() => onPickPlace(placeFilter === p.id ? null : p.id)}
              >
                <span className="min-w-0 flex-1 truncate">{p.nameEn}</span>
                {p.status === "proposed" && <span className="text-xs text-proposed">proposed</span>}
                <span className="text-xs text-stone-500">×{counts.get(p.id) ?? 0}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </aside>
  );
}
```

Create `packages/editor/src/survey/FrameView.tsx`:

```tsx
import type { Box, Keyframe, PathwayKind, Place } from "@oth/model";
import type { Ref } from "react";
import type { Api } from "../api/client";
import { Kbd } from "../ui/Kbd";
import { Filmstrip } from "./Filmstrip";
import { FrameCanvas } from "./FrameCanvas";
import type { FrameStatus } from "./frameStatus";
import type { FrameLabel } from "./labelled";
import { TagBar, type TagBarHandle } from "./TagBar";
import type { Tag } from "./tagging";

const HINTS: ReadonlyArray<[string, string]> = [
  ["← →", "frames"], ["N", "next untagged"], ["T", "name"], ["Enter", "tag"],
  ["Esc", "drop box"], ["Del", "bin frame"], ["G", "grid"],
];

/**
 * Frame view (spec §9): the frame as large as the space left, the tag bar
 * directly under it, the keys that drive it, and the filmstrip at the bottom.
 */
export function FrameView({
  api, frame, alt, labels, draft, onDraft, onMoveLabel, onRemoveLabel, tagBar,
  candidates, levels, levelId, counts, walkwayKinds, onTag, onAddWalkwayKind, strip,
}: {
  api: Pick<Api, "keyframeFileUrl">;
  frame: Keyframe;
  alt: string;
  labels: readonly FrameLabel[];
  draft: Box | null;
  onDraft: (box: Box | null) => void;
  onMoveLabel: (label: FrameLabel, box: Box) => void;
  onRemoveLabel: (label: FrameLabel) => void;
  tagBar: Ref<TagBarHandle>;
  candidates: readonly Place[];
  levels: ReadonlyMap<string, string | undefined>;
  levelId: string;
  counts: ReadonlyMap<string, number>;
  walkwayKinds: readonly PathwayKind[];
  onTag: (tag: Tag) => void;
  onAddWalkwayKind: (nameEn: string) => Promise<string | null>;
  strip: { frames: readonly Keyframe[]; statuses: ReadonlyMap<string, FrameStatus>; onPick: (id: string) => void };
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 bg-stone-900 p-3">
        <FrameCanvas
          // Wide enough to read a shop sign; the box is in fractions, so the
          // size shown does not change what is saved.
          imageUrl={api.keyframeFileUrl(frame.id, 1600)}
          alt={alt}
          widthPx={frame.widthPx}
          heightPx={frame.heightPx}
          labels={labels}
          draft={draft}
          onDraft={onDraft}
          onMoveLabel={onMoveLabel}
          onRemoveLabel={onRemoveLabel}
        />
      </div>
      <TagBar
        ref={tagBar}
        candidates={candidates}
        levels={levels}
        levelId={levelId}
        counts={counts}
        walkwayKinds={walkwayKinds}
        box={draft}
        onTag={onTag}
        onAddWalkwayKind={onAddWalkwayKind}
      />
      <p className="flex flex-wrap gap-x-3 gap-y-1 border-t border-stone-200 bg-white px-4 py-1.5 text-xs text-stone-500">
        {HINTS.map(([k, what]) => (
          <span key={k}><Kbd>{k}</Kbd> {what}</span>
        ))}
      </p>
      <Filmstrip
        frames={strip.frames}
        statuses={strip.statuses}
        currentId={frame.id}
        thumbUrl={id => api.keyframeFileUrl(id, 240)}
        onPick={strip.onPick}
      />
    </div>
  );
}
```

- [ ] **Step 5: The workspace**

Create `packages/editor/src/survey/SurveyWorkspace.tsx`:

```tsx
import { live, placeLevels, type Box, type Level } from "@oth/model";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Api } from "../api/client";
import { setParams } from "../route";
import type { Saver } from "../state/save";
import { useEditorStore } from "../state/store";
import { Button } from "../ui/Button";
import { Chip } from "../ui/Chip";
import { Kbd } from "../ui/Kbd";
import { useKeys } from "../ui/keys";
import { toast } from "../ui/toast";
import { deleteWithUndo, offerUndo } from "../ui/undo";
import { AddFootageDialog } from "./AddFootageDialog";
import { FramePanel } from "./FramePanel";
import { SURVEY_FILTERS, type SurveyFilter } from "./frameStatus";
import { FrameView } from "./FrameView";
import { GridView } from "./GridView";
import { surveyCommand } from "./keys";
import { labelsForFrame, type FrameLabel } from "./labelled";
import { sightingCounts } from "./places";
import { linkablePlaces } from "./suggest";
import { frameTime, nextUntagged, readSurveyParams, stepFrame, surveyView } from "./surveyView";
import type { TagBarHandle } from "./TagBar";
import { newId, tagWrites, walkwayColour, type Tag } from "./tagging";

const FILTER_LABEL: Record<SurveyFilter, string> = {
  all: "All", untagged: "Untagged", proposed: "Proposed", tagged: "Tagged",
};

function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="grid flex-1 place-items-center p-8">
      <div className="max-w-md space-y-3 text-center text-sm text-stone-600">{children}</div>
    </div>
  );
}

/**
 * One floor's survey (spec §9): its footage, a frame at a time or as a
 * contact sheet, and what is in each frame.
 *
 * The address is the state — capture, frame, view, filter, place — so any
 * frame is a link. The model is the shell's one load; this screen never loads
 * it, and it stays mounted through an expired session: there is no early
 * return on a missing user.
 */
export function SurveyWorkspace({ api, saver, level, params }: {
  api: Api;
  saver: Saver;
  level: Level;
  params: Record<string, string>;
}) {
  const model = useEditorStore(s => s.model);
  const read = useMemo(() => readSurveyParams(params), [params]);
  const view = useMemo(() => surveyView(model, level.id, read), [model, level.id, read]);
  const levels = useMemo(() => (model ? placeLevels(model) : new Map<string, string | undefined>()), [model]);
  const counts = useMemo(() => sightingCounts(live(model?.sightings ?? [])), [model]);
  const candidates = useMemo(
    () => linkablePlaces(live(model?.places ?? []), levels, level.id), [model, levels, level.id]);
  const floorPlaces = useMemo(
    () => candidates.filter(p => levels.get(p.id) === level.id), [candidates, levels, level.id]);
  const frame = view.frame;
  const labels = useMemo(() => (frame ? labelsForFrame(model, frame.id) : []), [model, frame]);
  const [draft, setDraft] = useState<Box | null>(null);
  const [footage, setFootage] = useState<{ captureId: string | null } | null>(null);
  const tagBar = useRef<TagBarHandle>(null);
  // One write at a time: a second Enter or Del before the first has landed
  // would tag twice, or bin the frame that has just come into view.
  const busy = useRef(false);

  // A drawn box belongs to the frame it was drawn on.
  useEffect(() => setDraft(null), [frame?.id]);

  async function once(work: () => Promise<void>) {
    if (busy.current) return;
    busy.current = true;
    try {
      await work();
    } finally {
      busy.current = false;
    }
  }

  const tag = (t: Tag) => once(async () => {
    if (!frame) return;
    setDraft(null);
    const writes = tagWrites(t, frame.id, level.id);
    if (writes.place && !(await saver.create("place", writes.place))) return;
    await saver.create("sighting", writes.sighting);
  });

  const bin = () => once(async () => {
    if (!frame) return;
    const number = view.index + 1;
    const next = stepFrame(view, 1) ?? stepFrame(view, -1);
    // On to the next frame at once; back to this one if the bin did not go through.
    setParams({ frame: next?.id ?? null });
    if (!(await saver.apply("keyframe", frame.id, () => api.deleteKeyframe(frame.id)))) {
      setParams({ frame: frame.id });
      return;
    }
    offerUndo({
      message: `Binned frame ${number}`,
      undone: `Frame ${number} is back`,
      what: `frame ${number}`,
      run: () => api.restoreKeyframe(frame.id),
      refresh: saver.refresh,
    });
  });

  const removeLabel = (label: FrameLabel) => void deleteWithUndo({
    api, saver,
    removals: [{ type: "sighting", id: label.sighting.id, version: label.sighting.version }],
    label: `the tag ${label.place.nameEn}`,
  });

  const moveLabel = (label: FrameLabel, box: Box) =>
    void saver.update("sighting", label.sighting.id, label.sighting.version, { box });

  async function addWalkwayKind(nameEn: string): Promise<string | null> {
    const id = newId("pk");
    const made = await saver.create("pathwayKind", {
      id, nameEn, colorHex: walkwayColour(live(model?.pathwayKinds ?? []).length),
    });
    return made ? id : null;
  }

  useKeys(event => {
    const command = surveyCommand(event.key);
    if (!command) return;
    const grid = read.view === "grid";
    switch (command) {
      case "prev":
      case "next": {
        const to = stepFrame(view, command === "next" ? 1 : -1);
        if (to) setParams({ frame: to.id });
        break;
      }
      case "nextUntagged": {
        const to = nextUntagged(view);
        if (to) setParams({ frame: to.id });
        else if (view.frames.length > 0) toast({ message: "Every frame in this footage has a tag." });
        break;
      }
      case "focusName":
        if (!grid) tagBar.current?.focus();
        break;
      case "tag":
        // In the grid, Enter opens the frame; in Frame view it tags.
        if (grid) setParams({ view: null });
        else tagBar.current?.submit();
        break;
      case "dropBox":
        setDraft(null);
        break;
      case "bin":
        void bin();
        break;
      case "toggleGrid":
        setParams({ view: grid ? null : "grid" });
        break;
    }
    event.preventDefault();
  });

  if (!model) return <p className="p-8 text-sm text-stone-500">Loading the survey…</p>;

  const capture = view.capture;
  const hasFrames = view.frames.length > 0;
  const openFootage = (captureId: string | null) => setFootage({ captureId });

  const unfiled = view.unfiled.map(c => {
    const n = live(model.keyframes).filter(k => k.captureId === c.id).length;
    return (
      <div key={c.id} role="status" className="flex items-center gap-3 border-b border-yours/30 bg-yours-soft px-4 py-2 text-sm">
        <span className="min-w-0 flex-1">
          <strong>{c.filename}</strong> ({n} frame{n === 1 ? "" : "s"}) isn't filed under a floor, so nothing in it counts toward one yet.
        </span>
        <Button size="sm" onClick={() => void saver.update("capture", c.id, c.version, { levelId: level.id })}>
          File under {level.code}
        </Button>
      </div>
    );
  });

  let body: ReactNode;
  if (!capture) {
    body = (
      <Empty>
        <p className="text-base font-medium text-stone-900">No footage on {level.code} yet.</p>
        <p>Add the walkthrough you filmed, and the frames worth tagging are found for you.</p>
        <Button variant="primary" onClick={() => openFootage(null)}>+ Add footage</Button>
      </Empty>
    );
  } else if (!hasFrames) {
    body = (
      <Empty>
        <p className="text-base font-medium text-stone-900">No frames in {capture.filename} yet.</p>
        <Button variant="primary" onClick={() => openFootage(capture.id)}>Find frames</Button>
      </Empty>
    );
  } else if (view.shown.length === 0) {
    body = (
      <Empty>
        <p>
          {view.place
            ? `${view.place.nameEn} isn't seen in this footage.`
            : `No frames here are ${FILTER_LABEL[read.filter].toLowerCase()}.`}
        </p>
      </Empty>
    );
  } else if (read.view === "grid") {
    body = (
      <GridView
        frames={view.shown}
        statuses={view.statuses}
        currentId={frame?.id ?? null}
        thumbUrl={id => api.keyframeFileUrl(id, 240)}
        onOpen={id => setParams({ view: null, frame: id })}
      />
    );
  } else if (frame) {
    body = (
      <FrameView
        api={api}
        frame={frame}
        alt={`Frame ${view.index + 1} of ${view.frames.length}`}
        labels={labels}
        draft={draft}
        onDraft={setDraft}
        onMoveLabel={moveLabel}
        onRemoveLabel={removeLabel}
        tagBar={tagBar}
        candidates={candidates}
        levels={levels}
        levelId={level.id}
        counts={counts}
        walkwayKinds={live(model.pathwayKinds)}
        onTag={t => void tag(t)}
        onAddWalkwayKind={addWalkwayKind}
        strip={{ frames: view.shown, statuses: view.statuses, onPick: id => setParams({ frame: id }) }}
      />
    );
  }

  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-w-0 flex-1 flex-col">
        {unfiled}
        <div className="flex flex-wrap items-center gap-3 border-b border-stone-200 bg-white px-4 py-2">
          {view.captures.length > 1 && (
            <select
              aria-label="Footage"
              className="h-8 rounded border border-stone-300 px-2 text-sm"
              value={capture?.id ?? ""}
              onChange={event => setParams({ capture: event.target.value, frame: null, place: null })}
            >
              {view.captures.map(c => <option key={c.id} value={c.id}>{c.filename}</option>)}
            </select>
          )}
          {frame && (
            <span className="text-sm font-medium">
              Frame {view.index + 1} of {view.frames.length}
              {frame.timeMs !== undefined && <span className="text-stone-500"> · {frameTime(frame.timeMs)}</span>}
            </span>
          )}
          {hasFrames && (
            <div role="group" aria-label="Show frames" className="flex flex-wrap items-center gap-1.5">
              {SURVEY_FILTERS.map(f => (
                <Chip
                  key={f}
                  selected={!view.place && read.filter === f}
                  count={f === "all" ? undefined : view.counts[f]}
                  // The frame in view stays; the strip and the arrows follow the filter.
                  onClick={() => setParams({ filter: f === "all" ? null : f, place: null })}
                >
                  {FILTER_LABEL[f]}
                </Chip>
              ))}
              {view.place && (
                <Chip selected onClick={() => setParams({ place: null, frame: null })}>Seen: {view.place.nameEn} ×</Chip>
              )}
            </div>
          )}
          <div className="ml-auto flex items-center gap-2">
            {hasFrames && (
              <div role="group" aria-label="View" className="flex overflow-hidden rounded border border-stone-300">
                {(["frame", "grid"] as const).map(v => (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={read.view === v}
                    className={`px-3 py-1 text-sm ${read.view === v ? "bg-stone-900 text-white" : "bg-white hover:bg-stone-100"}`}
                    onClick={() => setParams({ view: v === "grid" ? "grid" : null })}
                  >
                    {v === "frame" ? "Frame" : <>Grid <Kbd>G</Kbd></>}
                  </button>
                ))}
              </div>
            )}
            {capture && (
              <Button size="sm" variant="ghost" title={`Look through ${capture.filename} again for frames it missed`} onClick={() => openFootage(capture.id)}>
                Find more frames
              </Button>
            )}
            <Button size="sm" variant="primary" onClick={() => openFootage(null)}>+ Add footage</Button>
          </div>
        </div>
        {body}
      </div>
      {hasFrames && (
        <FramePanel
          labels={labels}
          places={floorPlaces}
          counts={counts}
          levelCode={level.code}
          placeFilter={view.place?.id ?? null}
          onRemove={removeLabel}
          onPickPlace={id => setParams({ place: id, frame: null })}
        />
      )}
      {footage && (
        <AddFootageDialog
          key={footage.captureId ?? "new"}
          api={api}
          saver={saver}
          level={level}
          captureId={footage.captureId}
          open
          onOpenChange={open => { if (!open) setFootage(null); }}
          onCapture={id => setParams({ capture: id, frame: null, place: null, filter: null })}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 6: Run the tests and the typecheck**

Run: `npx vitest run packages/editor/src/ui/undo.test.ts packages/editor/src/survey --poolOptions.threads.maxThreads=2 --poolOptions.threads.minThreads=1`
Expected: PASS. The old `SurveyApp` and `PlaceTagger` tests still pass too; they go in Task 15.
Run: `npx tsc -b`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add packages/editor/src/ui/undo.ts packages/editor/src/ui/undo.test.ts packages/editor/src/survey/FramePanel.tsx packages/editor/src/survey/FrameView.tsx packages/editor/src/survey/SurveyWorkspace.tsx packages/editor/src/survey/SurveyWorkspace.test.tsx
git commit -m "feat(editor): the Survey workspace — frame first, keyboard driven, one link per frame

The frame is the largest thing on screen with the tag bar directly under
it; the top row counts Untagged, Proposed and Tagged and toggles Frame
and Grid; the side panel lists what is on this frame and the floor's
places, and choosing one narrows the frames to where it was seen. The
keys work everywhere but in a field, and every frame, filter and place
is in the address.

Footage filed under no floor — the real walkthrough is — is offered for
filing under this floor. Binning a frame and removing a tag each offer
Undo, through one shared Undo toast that reloads whatever the outcome.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---
### Task 12: Review, as logic — the queue, the decisions, and their Undo

Spec §10 and §5.3. This task covers one floor's queue of proposals, the "Same as…" candidates, the evidence frames, and the four decisions with their Undo, all tested without a screen. The queue also has a second scope for proposals on no floor. These have no level of their own and no frame on filed footage, so no floor's queue would ever show them (Review Focus 1); the real data has six, and about 150 until the walkthrough is filed.

**Files:**
- Modify: `packages/editor/src/api/client.ts` (`acceptPlace`; add `reopenPlace`, `mergePlace`, `unmergePlace`, `MovedSighting`)
- Modify: `packages/editor/src/flow/floorProgress.ts` (add `reviewCounts`; `floorProgress` uses it)
- Modify: `packages/editor/src/testing/fakeApi.ts`
- Create: `packages/editor/src/review/queue.ts`, `packages/editor/src/review/decide.ts`
- Test: `packages/editor/src/api/client.test.ts`, `packages/editor/src/flow/floorProgress.test.ts`, `packages/editor/src/review/queue.test.ts`, `packages/editor/src/review/decide.test.ts`

**Interfaces:**
- Consumes: Tasks 4–5's endpoints; Task 11's `offerUndo`; `proposedPlaces` and `ProposedPlace` from `survey/review.ts`; Task 7's `normalName`.
- Produces:
  - `type MovedSighting = { id: string; status: "proposed" | "confirmed" }`.
  - `api.acceptPlace(id, v, { nameEn, category, levelId? }) → { sightings: number; confirmed: string[] }`.
  - `api.reopenPlace(id, v, { nameEn, category, levelId: string | null, sightingIds: string[] }) → { sightings: number }`.
  - `api.mergePlace(id, v, into) → { moved: MovedSighting[] }`.
  - `api.unmergePlace(id, v, moved) → { sightings: number }`.
  - `reviewCounts(model: MapModel, levelId: string, levels?: Map<string, string | undefined>): { confirmed: number; proposed: number }`.
  - `type ReviewScope = "floor" | "floorless"` and `type ReviewParams = { place: string | null; listOpen: boolean; scope: ReviewScope }`.
  - `readReviewParams(params: Record<string, string>): ReviewParams`.
  - `reviewQueue(model: MapModel | null, levelId: string, scope?: ReviewScope): ProposedPlace[]`.
  - `floorlessProposals(model: MapModel | null): ProposedPlace[]`.
  - `currentProposal(queue, placeId: string | null): ProposedPlace | null`.
  - `nextProposal(queue, currentId: string): ProposedPlace | null`.
  - `sameAs(model: MapModel, levelId: string, proposal: Place, name: string): Place[]`.
  - `type Evidence = { sighting: Sighting; frame: Keyframe }` and `evidenceFor(model: MapModel, sightings: readonly Sighting[]): Evidence[]`.
  - `type ReviewDeps = { api: Pick<Api, "acceptPlace" | "reopenPlace" | "rejectPlace" | "restoreEntity" | "mergePlace" | "unmergePlace">; saver: Pick<Saver, "apply" | "refresh"> }`.
  - `acceptProposal(deps, entry, fields: { nameEn: string; category: string }, levelId): Promise<boolean>`.
  - `rejectProposal(deps, entry): Promise<boolean>`.
  - `mergeProposal(deps, entry, into: Place): Promise<boolean>`.
  - `acceptProposals(deps, entries, levelId): Promise<number>`.

- [ ] **Step 1: Write the failing tests**

In `packages/editor/src/api/client.test.ts`, inside `describe("api client", …)`, add:

```ts
  it("posts the review undo and merge requests where the server expects them", async () => {
    const fetchImpl = mockFetch(200, { sightings: 1, confirmed: ["sg_1"], moved: [] });
    const api = createApi({ fetchImpl });
    await api.acceptPlace("pl_1", 0, { nameEn: "Gate 1", category: "facility", levelId: "oth-L1" });
    await api.reopenPlace("pl_1", 1, { nameEn: "Gate 1", category: "facility", levelId: null, sightingIds: ["sg_1"] });
    await api.mergePlace("pl_1", 0, "pl_c");
    await api.unmergePlace("pl_1", 1, [{ id: "sg_1", status: "proposed" }]);
    const sent = fetchImpl.mock.calls.map(([url, init]) => [url, JSON.parse(String(init?.body))]);
    expect(sent).toEqual([
      ["/api/places/pl_1/accept", { expectedVersion: 0, nameEn: "Gate 1", category: "facility", levelId: "oth-L1" }],
      ["/api/places/pl_1/reopen", { expectedVersion: 1, nameEn: "Gate 1", category: "facility", levelId: null, sightingIds: ["sg_1"] }],
      ["/api/places/pl_1/merge", { expectedVersion: 0, into: "pl_c" }],
      ["/api/places/pl_1/unmerge", { expectedVersion: 1, moved: [{ id: "sg_1", status: "proposed" }] }],
    ]);
  });
```

In `packages/editor/src/flow/floorProgress.test.ts`, add `reviewCounts` to the import from `./floorProgress`, and add at the end:

```ts
describe("reviewCounts", () => {
  it("counts confirmed and still-proposed places on a floor, by the floor they are on", () => {
    const model = parseModel({
      building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
      levels: [{ id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6 }],
      captures: [{ id: "cap_1", kind: "video", filename: "a.mp4", levelId: "oth-L1" }],
      keyframes: [{ id: "kf_1", captureId: "cap_1", timeMs: 0, imageId: "kf_1", widthPx: 64, heightPx: 36 }],
      places: [
        { id: "p1", nameEn: "Mine", category: "retail", levelId: "oth-L1" },
        { id: "p2", nameEn: "Seen on L1", category: "retail", status: "proposed" },
        { id: "p3", nameEn: "Nowhere", category: "retail", status: "proposed" },
      ],
      sightings: [{ id: "s1", placeId: "p2", keyframeId: "kf_1", status: "proposed" }],
    });
    expect(reviewCounts(model, "oth-L1")).toEqual({ confirmed: 1, proposed: 1 });
  });
});
```

If `floorProgress.test.ts` does not already import `parseModel` from `@oth/model`, add it.

Create `packages/editor/src/review/queue.test.ts`:

```ts
import { parseModel } from "@oth/model";
import { describe, expect, it } from "vitest";
import {
  currentProposal, evidenceFor, floorlessProposals, nextProposal, readReviewParams, reviewQueue, sameAs,
} from "./queue";

const frame = (id: string, captureId: string, timeMs: number) =>
  ({ id, captureId, timeMs, imageId: id, widthPx: 64, heightPx: 36 });

const model = parseModel({
  building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
  levels: [
    { id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6 },
    { id: "oth-L2", buildingId: "oth", code: "L2", ordinal: 2, nameEn: "L2", nameZh: "二楼", elevationM: 6, heightM: 4 },
  ],
  captures: [
    { id: "cap_1", kind: "video", filename: "L1.mp4", levelId: "oth-L1" },
    { id: "cap_2", kind: "video", filename: "L2.mp4", levelId: "oth-L2" },
  ],
  keyframes: [frame("kf_2", "cap_1", 2000), frame("kf_1", "cap_1", 1000), frame("kf_9", "cap_2", 0)],
  places: [
    { id: "p_big", nameEn: "Festive Mall", category: "retail", status: "proposed" },
    { id: "p_gate", nameEn: "Gate 1", category: "facility", status: "proposed" },
    { id: "p_conf", nameEn: "Gate 1", category: "facility", levelId: "oth-L1" },
    { id: "p_prop_twin", nameEn: "Gate 1", category: "facility", status: "proposed", levelId: "oth-L1" },
    { id: "p_l2_gate", nameEn: "Gate 1", category: "facility", levelId: "oth-L2" },
    { id: "p_up", nameEn: "Up there", category: "retail", status: "proposed" },
    { id: "p_none", nameEn: "No frames", category: "retail", status: "proposed" },
  ],
  sightings: [
    { id: "s2", placeId: "p_big", keyframeId: "kf_2", status: "proposed" },
    { id: "s1", placeId: "p_big", keyframeId: "kf_1", status: "proposed" },
    { id: "s3", placeId: "p_gate", keyframeId: "kf_1", status: "proposed" },
    { id: "s9", placeId: "p_up", keyframeId: "kf_9", status: "proposed" },
    { id: "s_gone", placeId: "p_gate", keyframeId: "kf_deleted", status: "proposed" },
  ],
});
const ids = (queue: { place: { id: string } }[]) => queue.map(q => q.place.id);

describe("readReviewParams", () => {
  it("reads the address as given", () => {
    expect(readReviewParams({ place: "p_big", list: "open", scope: "floorless" }))
      .toEqual({ place: "p_big", listOpen: true, scope: "floorless" });
  });

  it("falls back to the defaults for anything it does not know", () => {
    expect(readReviewParams({ list: "yes", scope: "everywhere" }))
      .toEqual({ place: null, listOpen: false, scope: "floor" });
  });
});

describe("reviewQueue", () => {
  it("holds the proposals on this floor, by the floor their frames were filmed on, most-evidenced first", () => {
    expect(ids(reviewQueue(model, "oth-L1"))).toEqual(["p_big", "p_gate", "p_prop_twin"]);
    expect(ids(reviewQueue(model, "oth-L2"))).toEqual(["p_up"]);
  });

  it("holds, in the floorless scope, the proposals no floor's queue would ever show", () => {
    expect(ids(reviewQueue(model, "oth-L1", "floorless"))).toEqual(["p_none"]);
    expect(ids(floorlessProposals(model))).toEqual(["p_none"]);
  });

  it("is empty, not broken, before the model loads", () => {
    expect(reviewQueue(null, "oth-L1")).toEqual([]);
    expect(floorlessProposals(null)).toEqual([]);
  });
});

describe("moving through the queue", () => {
  const queue = reviewQueue(model, "oth-L1");

  it("shows the proposal asked for, or the first when that one is decided or unknown", () => {
    expect(currentProposal(queue, "p_gate")?.place.id).toBe("p_gate");
    expect(currentProposal(queue, "p_decided")?.place.id).toBe("p_big");
    expect(currentProposal(queue, null)?.place.id).toBe("p_big");
    expect(currentProposal([], null)).toBeNull();
  });

  it("goes on to the next, wrapping to the start", () => {
    expect(nextProposal(queue, "p_big")?.place.id).toBe("p_gate");
    expect(nextProposal(queue, "p_prop_twin")?.place.id).toBe("p_big");
  });

  it("has nothing next when this was the last one", () => {
    expect(nextProposal(queue.slice(0, 1), "p_big")).toBeNull();
  });
});

describe("sameAs", () => {
  const gate = model.places.find(p => p.id === "p_gate")!;

  it("offers a confirmed place on this floor with the same name, whatever its case and spacing", () => {
    // Review Focus 3.
    expect(sameAs(model, "oth-L1", gate, "  gate   1 ").map(p => p.id)).toEqual(["p_conf"]);
  });

  it("never offers the proposal itself, another proposal, or another floor's place", () => {
    const offered = sameAs(model, "oth-L1", gate, "Gate 1").map(p => p.id);
    expect(offered).not.toContain("p_gate");
    expect(offered).not.toContain("p_prop_twin");
    expect(offered).not.toContain("p_l2_gate");
  });

  it("offers nothing for a blank name", () => {
    expect(sameAs(model, "oth-L1", gate, "  ")).toEqual([]);
  });
});

describe("evidenceFor", () => {
  it("puts a proposal's frames on their timeline, leaving out any that are gone", () => {
    const [big] = reviewQueue(model, "oth-L1");
    expect(evidenceFor(model, big!.sightings).map(e => e.frame.id)).toEqual(["kf_1", "kf_2"]);
    const gate = reviewQueue(model, "oth-L1").find(q => q.place.id === "p_gate")!;
    expect(evidenceFor(model, gate.sightings).map(e => e.frame.id)).toEqual(["kf_1"]);
  });
});
```

Create `packages/editor/src/review/decide.test.ts`:

```ts
import { PlaceSchema, SightingSchema } from "@oth/model";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConflictError } from "../api/client";
import { useEditorStore } from "../state/store";
import type { ProposedPlace } from "../survey/review";
import { useToasts } from "../ui/toast";
import { acceptProposal, acceptProposals, mergeProposal, rejectProposal, type ReviewDeps } from "./decide";

function entry(id: string, extra: Record<string, unknown> = {}): ProposedPlace {
  return {
    place: PlaceSchema.parse({ id, nameEn: `Name ${id}`, category: "retail", status: "proposed", version: 3, ...extra }),
    sightings: [SightingSchema.parse({ id: `s_${id}`, placeId: id, keyframeId: "kf_1", status: "proposed" })],
  };
}

function deps() {
  const api = {
    acceptPlace: vi.fn(async (id: string) => ({ sightings: 1, confirmed: [`s_${id}`] })),
    reopenPlace: vi.fn(async () => ({ sightings: 1 })),
    rejectPlace: vi.fn(async () => ({ sightings: 1 })),
    restoreEntity: vi.fn(async () => ({})),
    mergePlace: vi.fn(async () => ({ moved: [{ id: "s_p1", status: "proposed" as const }] })),
    unmergePlace: vi.fn(async () => ({ sightings: 1 })),
  };
  const saver = {
    apply: vi.fn(async (_type: string, _id: string, run: () => Promise<unknown>) => { await run(); return true; }),
    refresh: vi.fn(async () => {}),
  };
  return { api, saver, both: { api, saver } as unknown as ReviewDeps };
}

const lastToast = () => useToasts.getState().toasts.at(-1)!;
const undo = async () => { await useToasts.getState().toasts.find(t => t.action)!.action!.run(); };

beforeEach(() => {
  useToasts.getState().clear();
  useEditorStore.getState().reset();
});

describe("acceptProposal", () => {
  it("accepts with the corrections, files a floorless place under this floor, and offers Undo", async () => {
    const { api, both } = deps();
    expect(await acceptProposal(both, entry("p1"), { nameEn: "Festive Mall", category: "lifestyle" }, "oth-L1")).toBe(true);
    expect(api.acceptPlace).toHaveBeenCalledWith("p1", 3, { nameEn: "Festive Mall", category: "lifestyle", levelId: "oth-L1" });
    expect(lastToast()).toMatchObject({ message: "Accepted Festive Mall", action: { label: "Undo" } });
  });

  it("leaves a place's own floor alone", async () => {
    const { api, both } = deps();
    await acceptProposal(both, entry("p1", { levelId: "oth-L2" }), { nameEn: "X", category: "retail" }, "oth-L1");
    expect((api.acceptPlace.mock.calls[0] as unknown[])[2]).toEqual({ nameEn: "X", category: "retail" });
  });

  it("undoes exactly: the name, category and floor it had, and the tags it confirmed", async () => {
    const { api, saver, both } = deps();
    await acceptProposal(both, entry("p1"), { nameEn: "Festive Mall", category: "lifestyle" }, "oth-L1");
    await undo();
    expect(api.reopenPlace).toHaveBeenCalledWith("p1", 4, {
      nameEn: "Name p1", category: "retail", levelId: null, sightingIds: ["s_p1"],
    });
    expect(saver.refresh).toHaveBeenCalled();
  });

  it("offers no Undo when the accept did not go through", async () => {
    const { saver, both } = deps();
    saver.apply.mockResolvedValueOnce(false);
    expect(await acceptProposal(both, entry("p1"), { nameEn: "X", category: "retail" }, "oth-L1")).toBe(false);
    expect(useToasts.getState().toasts).toHaveLength(0);
  });
});

describe("rejectProposal", () => {
  it("rejects, and Undo restores the place with its tags", async () => {
    const { api, both } = deps();
    expect(await rejectProposal(both, entry("p1"))).toBe(true);
    expect(api.rejectPlace).toHaveBeenCalledWith("p1", 3);
    expect(lastToast().message).toBe("Rejected Name p1");
    await undo();
    expect(api.restoreEntity).toHaveBeenCalledWith("place", "p1", 4);
  });
});

describe("mergeProposal", () => {
  it("merges into the place already there, and Undo sends back exactly what moved", async () => {
    const { api, both } = deps();
    const into = PlaceSchema.parse({ id: "p_conf", nameEn: "Gate 1", category: "facility" });
    expect(await mergeProposal(both, entry("p1"), into)).toBe(true);
    expect(api.mergePlace).toHaveBeenCalledWith("p1", 3, "p_conf");
    expect(lastToast().message).toBe("Merged Name p1 into Gate 1");
    await undo();
    expect(api.unmergePlace).toHaveBeenCalledWith("p1", 4, [{ id: "s_p1", status: "proposed" }]);
  });
});

describe("acceptProposals", () => {
  it("accepts several as they stand, reloads once, and offers one Undo for all", async () => {
    const { api, saver, both } = deps();
    expect(await acceptProposals(both, [entry("p1"), entry("p2")], "oth-L1")).toBe(2);
    expect(api.acceptPlace.mock.calls.map(c => c[0])).toEqual(["p1", "p2"]);
    expect(saver.refresh).toHaveBeenCalledTimes(1);
    expect(lastToast().message).toBe("Accepted 2 places");
    await undo();
    expect(api.reopenPlace.mock.calls.map(c => (c as unknown[])[0])).toEqual(["p2", "p1"]);
  });

  it("stops at a place a teammate changed, shows the conflict, and Undo covers the ones that went through", async () => {
    const { api, both } = deps();
    api.acceptPlace
      .mockResolvedValueOnce({ sightings: 1, confirmed: ["s_p1"] })
      .mockRejectedValueOnce(new ConflictError({ id: "p2", version: 9 }, null));
    expect(await acceptProposals(both, [entry("p1"), entry("p2"), entry("p3")], "oth-L1")).toBe(1);
    expect(api.acceptPlace).toHaveBeenCalledTimes(2);
    expect(useEditorStore.getState().conflict?.entityId).toBe("p2");
    expect(lastToast().message).toBe("Accepted Name p1");
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run packages/editor/src/api/client.test.ts packages/editor/src/flow/floorProgress.test.ts packages/editor/src/review --poolOptions.threads.maxThreads=2 --poolOptions.threads.minThreads=1`
Expected: FAIL. `reopenPlace`, `mergePlace` and `unmergePlace` do not exist; `reviewCounts` is not exported; `./queue` and `./decide` do not resolve.

- [ ] **Step 3: The client's review endpoints**

In `packages/editor/src/api/client.ts`, above `export type ApiOptions`, add:

```ts
/** A tag moved by a merge, and how it stood before: what an unmerge puts back. */
export type MovedSighting = { id: string; status: "proposed" | "confirmed" };
```

Replace the `acceptPlace` entry with:

```ts
    /**
     * Confirms a proposed place, with any corrections, and the tags that were
     * still claims — saying which, for Undo. `levelId` files a place with no
     * floor of its own under the floor it was reviewed on.
     */
    acceptPlace: (id: string, expectedVersion: number, data: { nameEn: string; category: string; levelId?: string }) =>
      request<{ sightings: number; confirmed: string[] }>(`/api/places/${id}/accept`, {
        method: "POST",
        body: json({ expectedVersion, ...data }),
      }),

    /** Undoes an accept: the place back in the queue as it was, and the tags it confirmed back to claims. */
    reopenPlace: (
      id: string, expectedVersion: number,
      data: { nameEn: string; category: string; levelId: string | null; sightingIds: string[] },
    ) =>
      request<{ sightings: number }>(`/api/places/${id}/reopen`, {
        method: "POST",
        body: json({ expectedVersion, ...data }),
      }),

    /** "Same as…": the proposal's tags move to a place already on the map, and the proposal retires. */
    mergePlace: (id: string, expectedVersion: number, into: string) =>
      request<{ moved: MovedSighting[] }>(`/api/places/${id}/merge`, {
        method: "POST",
        body: json({ expectedVersion, into }),
      }),

    /** Undoes a merge, with exactly the tags it moved. */
    unmergePlace: (id: string, expectedVersion: number, moved: MovedSighting[]) =>
      request<{ sightings: number }>(`/api/places/${id}/unmerge`, {
        method: "POST",
        body: json({ expectedVersion, moved }),
      }),
```

In `packages/editor/src/testing/fakeApi.ts`, replace the `acceptPlace` line with:

```ts
    acceptPlace: vi.fn().mockResolvedValue({ sightings: 1, confirmed: ["sg_1"] }),
    reopenPlace: vi.fn().mockResolvedValue({ sightings: 1 }),
    mergePlace: vi.fn().mockResolvedValue({ moved: [] }),
    unmergePlace: vi.fn().mockResolvedValue({ sightings: 0 }),
```

- [ ] **Step 4: One count of a floor's review, shared**

In `packages/editor/src/flow/floorProgress.ts`, above `export type FloorProgress`, add:

```ts
/**
 * Places on one floor: confirmed, and still waiting on a person (spec §5.3).
 * A rejected proposal is deleted and leaves both counts, so the bar never
 * goes backwards on a reject. `levels` saves a second pass when the caller
 * already has them.
 */
export function reviewCounts(
  model: MapModel, levelId: string, levels: Map<string, string | undefined> = placeLevels(model),
): { confirmed: number; proposed: number } {
  const places = live(model.places).filter(p => levels.get(p.id) === levelId);
  return {
    confirmed: places.filter(p => p.status === "confirmed").length,
    proposed: places.filter(p => p.status === "proposed").length,
  };
}
```

In `floorProgress`, delete the line `const places = live(model.places).filter(p => levels.get(p.id) === levelId);` and replace the `review: { … },` entry with `review: reviewCounts(model, levelId, levels),`.

- [ ] **Step 5: The queue**

Create `packages/editor/src/review/queue.ts`:

```ts
import { live, placeLevels, type Keyframe, type MapModel, type Place, type Sighting } from "@oth/model";
import { proposedPlaces, type ProposedPlace } from "../survey/review";
import { normalName } from "../survey/suggest";

export type ReviewScope = "floor" | "floorless";
export type ReviewParams = { place: string | null; listOpen: boolean; scope: ReviewScope };

/** The address, read leniently (spec §5.1: `?place=&list=open`). */
export function readReviewParams(params: Record<string, string>): ReviewParams {
  return {
    place: params.place || null,
    listOpen: params.list === "open",
    scope: params.scope === "floorless" ? "floorless" : "floor",
  };
}

/**
 * The proposals to decide on one floor, most-evidenced first — a name seen in
 * nine frames settles nine frames. A proposal is on the floor its frames were
 * filmed on (`placeLevel`). The "floorless" scope holds the ones on no floor
 * at all, which no floor's queue would otherwise ever show.
 */
export function reviewQueue(model: MapModel | null, levelId: string, scope: ReviewScope = "floor"): ProposedPlace[] {
  if (!model) return [];
  const levels = placeLevels(model);
  return proposedPlaces(model).filter(({ place }) => {
    const on = levels.get(place.id);
    return scope === "floor" ? on === levelId : on === undefined;
  });
}

export function floorlessProposals(model: MapModel | null): ProposedPlace[] {
  return reviewQueue(model, "", "floorless");
}

/** The proposal the address asks for, or the first — the one asked for may have been decided since. */
export function currentProposal(queue: readonly ProposedPlace[], placeId: string | null): ProposedPlace | null {
  return queue.find(q => q.place.id === placeId) ?? queue[0] ?? null;
}

/** What comes after `currentId` once it is decided or skipped: the next, wrapping to the start; null when it was the last. */
export function nextProposal(queue: readonly ProposedPlace[], currentId: string): ProposedPlace | null {
  const i = queue.findIndex(q => q.place.id === currentId);
  const rest = i < 0 ? [...queue] : [...queue.slice(i + 1), ...queue.slice(0, i)];
  return rest[0] ?? null;
}

/**
 * "Same as…" (spec §10): confirmed places on this floor with the name being
 * decided, however it is spaced or cased. Merging into one of them beats a
 * duplicate. Another floor's place of the same name is a different place.
 */
export function sameAs(model: MapModel, levelId: string, proposal: Place, name: string): Place[] {
  const wanted = normalName(name);
  if (wanted === "") return [];
  const levels = placeLevels(model);
  return live(model.places).filter(p =>
    p.id !== proposal.id &&
    p.status === "confirmed" &&
    levels.get(p.id) === levelId &&
    normalName(p.nameEn) === wanted);
}

export type Evidence = { sighting: Sighting; frame: Keyframe };

/** The frames a proposal was read from, on their timeline; a tag whose frame is gone shows nothing. */
export function evidenceFor(model: MapModel, sightings: readonly Sighting[]): Evidence[] {
  const frames = new Map(live(model.keyframes).map(k => [k.id, k]));
  return sightings
    .flatMap(sighting => {
      const frame = frames.get(sighting.keyframeId);
      return frame ? [{ sighting, frame }] : [];
    })
    .sort((a, b) => (a.frame.timeMs ?? 0) - (b.frame.timeMs ?? 0));
}
```

- [ ] **Step 6: The decisions**

Create `packages/editor/src/review/decide.ts`:

```ts
import type { Place } from "@oth/model";
import { ConflictError, isUnauthorized, type Api, type MovedSighting } from "../api/client";
import type { Saver } from "../state/save";
import { useEditorStore } from "../state/store";
import type { ProposedPlace } from "../survey/review";
import { toast } from "../ui/toast";
import { offerUndo } from "../ui/undo";

export type ReviewDeps = {
  api: Pick<Api, "acceptPlace" | "reopenPlace" | "rejectPlace" | "restoreEntity" | "mergePlace" | "unmergePlace">;
  saver: Pick<Saver, "apply" | "refresh">;
};

/** The fields accept sends: a place with no floor of its own is filed under the one it was accepted on. */
function acceptFields(place: Place, fields: { nameEn: string; category: string }, levelId: string) {
  return { ...fields, ...(place.levelId ? {} : { levelId }) };
}

/** What Undo puts back after an accept: the place as it was, and the tags that accept confirmed. */
function reopen(api: ReviewDeps["api"], place: Place, confirmed: string[]) {
  return api.reopenPlace(place.id, place.version + 1, {
    nameEn: place.nameEn, category: place.category, levelId: place.levelId ?? null, sightingIds: confirmed,
  });
}

/**
 * Accepts one proposal with any corrections, and offers Undo. Every decision
 * leaves the place one version on, so Undo expects exactly that: a teammate's
 * change since is refused, not overwritten.
 */
export async function acceptProposal(
  { api, saver }: ReviewDeps, entry: ProposedPlace, fields: { nameEn: string; category: string }, levelId: string,
): Promise<boolean> {
  const { place } = entry;
  let confirmed: string[] = [];
  const ok = await saver.apply("place", place.id, async () => {
    ({ confirmed } = await api.acceptPlace(place.id, place.version, acceptFields(place, fields, levelId)));
  });
  if (!ok) return false;
  offerUndo({
    message: `Accepted ${fields.nameEn}`,
    undone: `${place.nameEn} is back in the queue`,
    what: fields.nameEn,
    run: () => reopen(api, place, confirmed),
    refresh: saver.refresh,
  });
  return true;
}

/** Rejects one proposal; Undo is the restore that brings its tags back with it. */
export async function rejectProposal({ api, saver }: ReviewDeps, entry: ProposedPlace): Promise<boolean> {
  const { place } = entry;
  if (!(await saver.apply("place", place.id, () => api.rejectPlace(place.id, place.version)))) return false;
  offerUndo({
    message: `Rejected ${place.nameEn}`,
    undone: `${place.nameEn} is back in the queue`,
    what: place.nameEn,
    run: () => api.restoreEntity("place", place.id, place.version + 1),
    refresh: saver.refresh,
  });
  return true;
}

/** "Same as…": merges the proposal into a place already there; Undo sends back exactly what moved. */
export async function mergeProposal({ api, saver }: ReviewDeps, entry: ProposedPlace, into: Place): Promise<boolean> {
  const { place } = entry;
  let moved: MovedSighting[] = [];
  const ok = await saver.apply("place", place.id, async () => {
    ({ moved } = await api.mergePlace(place.id, place.version, into.id));
  });
  if (!ok) return false;
  offerUndo({
    message: `Merged ${place.nameEn} into ${into.nameEn}`,
    undone: `${place.nameEn} is back in the queue`,
    what: `the merge into ${into.nameEn}`,
    run: () => api.unmergePlace(place.id, place.version + 1, moved),
    refresh: saver.refresh,
  });
  return true;
}

/**
 * Accepts several at once, as they stand: one request each, one reload at
 * the end. Stops at the first that fails — a teammate's change is shown as a
 * conflict, not overwritten — and one Undo covers the ones that went through.
 */
export async function acceptProposals(
  { api, saver }: ReviewDeps, entries: readonly ProposedPlace[], levelId: string,
): Promise<number> {
  const done: { place: Place; confirmed: string[] }[] = [];
  let failed: { place: Place; err: unknown } | null = null;
  for (const { place } of entries) {
    try {
      const { confirmed } = await api.acceptPlace(
        place.id, place.version, acceptFields(place, { nameEn: place.nameEn, category: place.category }, levelId));
      done.push({ place, confirmed });
    } catch (err) {
      failed = { place, err };
      break;
    }
  }
  await saver.refresh().catch(() => {});

  if (failed && !isUnauthorized(failed.err)) {
    if (failed.err instanceof ConflictError) {
      useEditorStore.getState().setConflict({ entityType: "place", entityId: failed.place.id, current: failed.err.current });
    } else {
      toast({ tone: "error", message: `Couldn't accept ${failed.place.nameEn}. Check your connection and try again.` });
    }
  }

  if (done.length > 0) {
    const label = done.length === 1 ? done[0]!.place.nameEn : `${done.length} places`;
    offerUndo({
      message: `Accepted ${label}`,
      undone: `${label} ${done.length === 1 ? "is" : "are"} back in the queue`,
      what: label,
      run: async () => {
        for (const d of [...done].reverse()) await reopen(api, d.place, d.confirmed);
      },
      refresh: saver.refresh,
    });
  }
  return done.length;
}
```

- [ ] **Step 7: Run the tests and the typecheck**

Run: `npx vitest run packages/editor/src/api/client.test.ts packages/editor/src/flow packages/editor/src/review packages/editor/src/survey/ReviewPanel.test.tsx --poolOptions.threads.maxThreads=2 --poolOptions.threads.minThreads=1`
Expected: PASS. The old ReviewPanel still type-checks against the widened `acceptPlace`.
Run: `npx tsc -b`
Expected: exit 0.

- [ ] **Step 8: Commit**

```bash
git add packages/editor/src/api/client.ts packages/editor/src/api/client.test.ts packages/editor/src/flow/floorProgress.ts packages/editor/src/flow/floorProgress.test.ts packages/editor/src/testing/fakeApi.ts packages/editor/src/review/queue.ts packages/editor/src/review/queue.test.ts packages/editor/src/review/decide.ts packages/editor/src/review/decide.test.ts
git commit -m "feat(editor): review as logic — one floor's queue, Same as…, and a decision's exact Undo

The queue is a floor's proposals by the floor their frames were filmed
on, most-evidenced first; a second scope holds the proposals on no floor
at all, which no floor's queue would otherwise show. Same as… offers a
confirmed place on the floor with the name being decided, however it is
spaced or cased, and never another floor's.

Accept, reject, merge and accepting several each offer Undo, and each
undo puts back exactly what the decision changed — or says a teammate
changed it since, rather than overwriting them.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---
### Task 13: The Review workspace — one proposal at a time

Spec §10 asks for these things:
- a progress line (*15 of 185 decided on L1*);
- the evidence frame, large, with the agent's box drawn, ← → through its other frames, and the box correctable in place;
- name, category, the agent's note and who proposed it;
- **Accept (A) · Reject (R) · Skip (S)**, with the next proposal loading immediately;
- letter keys ignored while a field has focus. Inside the name field, Enter accepts, as Survey's Enter tags;
- **Same as…** when the name matches an existing place on the floor;
- an undo toast for every decision.

Each proposal's name field is keyed by the proposal's id, so a correction typed for one never carries over to the next. The list drawer comes in Task 14.

**Files:**
- Create: `packages/editor/src/review/ProposalFocus.tsx`, `packages/editor/src/review/ReviewWorkspace.tsx`
- Test: `packages/editor/src/review/ReviewWorkspace.test.tsx`

**Interfaces:**
- Consumes: Task 12's queue and decisions; Task 8's `FrameCanvas`; Task 7's `useKeys` and `reviewCommand`; `reviewCounts`; `setParams`.
- Produces:
  - `ReviewWorkspace({ api, saver, level, params }: { api: Api; saver: Saver; level: Level; params: Record<string, string> })`.
  - `ProposalFocus({ api, entry, evidence, findSame, onAccept, onReject, onSkip, onMerge, onMoveBox })`, mounted with `key={entry.place.id}`.

- [ ] **Step 1: Write the failing tests**

Create `packages/editor/src/review/ReviewWorkspace.test.tsx`:

```tsx
import { parseModel, type Level } from "@oth/model";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConflictError, type Api } from "../api/client";
import { useCurrentRoute } from "../route";
import { createSaver } from "../state/save";
import { useEditorStore } from "../state/store";
import { fakeApi } from "../testing/fakeApi";
import { useToasts } from "../ui/toast";
import { ReviewWorkspace } from "./ReviewWorkspace";

const frame = (id: string, captureId: string, timeMs: number) =>
  ({ id, captureId, timeMs, imageId: id, widthPx: 640, heightPx: 360 });

const reviewModel = parseModel({
  building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
  levels: [
    { id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "Level 1", nameZh: "一楼", elevationM: 0, heightM: 6 },
    { id: "oth-L2", buildingId: "oth", code: "L2", ordinal: 2, nameEn: "Level 2", nameZh: "二楼", elevationM: 6, heightM: 4 },
  ],
  captures: [
    { id: "cap_1", kind: "video", filename: "L1.mp4", levelId: "oth-L1" },
    { id: "cap_2", kind: "video", filename: "L2.mp4", levelId: "oth-L2" },
  ],
  keyframes: [frame("kf_1", "cap_1", 1000), frame("kf_2", "cap_1", 2000), frame("kf_9", "cap_2", 0)],
  places: [
    { id: "p_big", nameEn: "Festive Mall", category: "retail", status: "proposed", proposedBy: "claude-code", notes: "Fascia reads FESTIVE MALL." },
    { id: "p_small", nameEn: "Gate 1", category: "facility", status: "proposed", proposedBy: "claude-code" },
    { id: "p_conf", nameEn: "Gate 1", category: "facility", levelId: "oth-L1" },
    { id: "p_l2", nameEn: "Up there", category: "retail", status: "proposed" },
    { id: "p_none", nameEn: "No frames", category: "retail", status: "proposed", notes: "From the directory." },
  ],
  sightings: [
    { id: "s1", placeId: "p_big", keyframeId: "kf_1", status: "proposed", box: { x: 0.1, y: 0.2, w: 0.3, h: 0.2 } },
    { id: "s2", placeId: "p_big", keyframeId: "kf_2", status: "proposed" },
    { id: "s3", placeId: "p_small", keyframeId: "kf_1", status: "proposed" },
    { id: "s9", placeId: "p_l2", keyframeId: "kf_9", status: "proposed" },
  ],
});
const L1 = reviewModel.levels[0] as Level;

function Hosted({ api }: { api: Api }) {
  const route = useCurrentRoute();
  const saver = createSaver(api, { validate: false });
  return <ReviewWorkspace api={api} saver={saver} level={L1} params={route.name === "floor" ? route.params : {}} />;
}

function at(search = "", overrides: Record<string, unknown> = {}) {
  const api = fakeApi({ getModel: vi.fn().mockResolvedValue(reviewModel), ...overrides });
  window.history.pushState({}, "", `/floors/L1/review${search}`);
  render(<Hosted api={api} />);
  return api as unknown as Record<string, ReturnType<typeof vi.fn>>;
}

const param = (name: string) => new URLSearchParams(window.location.search).get(name);
const key = (k: string, target: Element = document.body) => fireEvent.keyDown(target, { key: k });
const nameField = () => screen.getByLabelText("Name") as HTMLInputElement;
const toastSaying = (message: string) => useToasts.getState().toasts.find(t => t.message === message);

beforeEach(() => {
  useEditorStore.getState().reset();
  useEditorStore.getState().setUser({ id: "u_sc", email: "sc@oth.local", displayName: "Stef Chan" });
  useEditorStore.getState().setModel(reviewModel);
  useToasts.getState().clear();
});

describe("ReviewWorkspace", () => {
  it("shows one proposal at a time, the most-evidenced first, and how far the floor has got", () => {
    at();
    expect(nameField().value).toBe("Festive Mall");
    expect(screen.getByText("1 of 3 decided on L1")).toBeTruthy();
    expect(screen.getByText("Fascia reads FESTIVE MALL.")).toBeTruthy();
    expect(screen.getByText(/Proposed by claude-code · 2 frames/)).toBeTruthy();
  });

  it("shows the evidence large, with the agent's box drawn on it", () => {
    at();
    expect(screen.getByAltText(/Evidence for Festive Mall: frame 1 of 2/).getAttribute("src")).toBe("/api/keyframes/kf_1/file?w=1600");
    expect(screen.getByTestId("label-box-s1")).toBeTruthy();
  });

  it("steps through the proposal's other frames with the arrow keys", () => {
    at();
    key("ArrowRight");
    expect(screen.getByAltText(/frame 2 of 2/).getAttribute("src")).toBe("/api/keyframes/kf_2/file?w=1600");
  });

  it("A accepts with the corrections typed, files it under this floor, and shows the next at once", async () => {
    const api = at();
    fireEvent.change(nameField(), { target: { value: "Festive Mall Tampines" } });
    key("a");
    expect(param("place")).toBe("p_small");
    await waitFor(() => expect(api.acceptPlace).toHaveBeenCalledWith("p_big", 0, {
      nameEn: "Festive Mall Tampines", category: "retail", levelId: "oth-L1",
    }));
  });

  it("offers Undo on the accept, which puts the proposal back as it was", async () => {
    const api = at();
    key("a");
    await waitFor(() => expect(toastSaying("Accepted Festive Mall")).toBeTruthy());
    await act(async () => { await toastSaying("Accepted Festive Mall")!.action!.run(); });
    expect(api.reopenPlace).toHaveBeenCalledWith("p_big", 1, expect.objectContaining({
      nameEn: "Festive Mall", category: "retail", levelId: null,
    }));
  });

  it("takes letters typed into the name as text, not as decisions", () => {
    // Review Focus 2: the R of "Rice Garden" is not Reject.
    const api = at();
    key("r", nameField());
    key("a", nameField());
    expect(api.rejectPlace).not.toHaveBeenCalled();
    expect(api.acceptPlace).not.toHaveBeenCalled();
    expect(param("place")).toBeNull();
  });

  it("accepts with Enter from inside the name, as corrected", async () => {
    const api = at();
    fireEvent.change(nameField(), { target: { value: "Festive Mall East" } });
    key("Enter", nameField());
    await waitFor(() => expect(api.acceptPlace).toHaveBeenCalledWith("p_big", 0, expect.objectContaining({ nameEn: "Festive Mall East" })));
  });

  it("R rejects, and Undo brings the place back with its tags", async () => {
    const api = at();
    key("r");
    await waitFor(() => expect(toastSaying("Rejected Festive Mall")).toBeTruthy());
    expect(api.rejectPlace).toHaveBeenCalledWith("p_big", 0);
    await act(async () => { await toastSaying("Rejected Festive Mall")!.action!.run(); });
    expect(api.restoreEntity).toHaveBeenCalledWith("place", "p_big", 1);
  });

  it("S skips without deciding anything", () => {
    const api = at();
    key("s");
    expect(param("place")).toBe("p_small");
    expect(api.acceptPlace).not.toHaveBeenCalled();
    expect(api.rejectPlace).not.toHaveBeenCalled();
  });

  it("decides two different proposals when A is pressed twice, never the same one twice", async () => {
    // Review Focus 4.
    const api = at();
    key("a");
    key("a");
    await waitFor(() => expect(api.acceptPlace).toHaveBeenCalledTimes(2));
    expect(api.acceptPlace.mock.calls.map(c => (c as unknown[])[0])).toEqual(["p_big", "p_small"]);
  });

  it("comes back to a proposal whose decision did not go through", async () => {
    const api = at("", { acceptPlace: vi.fn().mockRejectedValue(new ConflictError({ id: "p_big", version: 4 }, null)) });
    key("a");
    await waitFor(() => expect(api.acceptPlace).toHaveBeenCalled());
    await waitFor(() => expect(param("place")).toBe("p_big"));
    expect(useEditorStore.getState().conflict?.entityId).toBe("p_big");
  });

  it("offers Same as… when the name matches a place already on this floor, and merges into it", async () => {
    // Review Focus 3.
    const api = at("?place=p_small");
    fireEvent.click(screen.getByRole("button", { name: "Same as Gate 1" }));
    await waitFor(() => expect(api.mergePlace).toHaveBeenCalledWith("p_small", 0, "p_conf"));
  });

  it("offers Same as… for a name corrected to match, whatever its case", () => {
    at();
    fireEvent.change(nameField(), { target: { value: "  gate 1" } });
    expect(screen.getByRole("button", { name: "Same as Gate 1" })).toBeTruthy();
  });

  it("corrects the agent's box in place", async () => {
    Element.prototype.getBoundingClientRect = vi.fn(() => ({
      left: 0, top: 0, width: 400, height: 300, right: 400, bottom: 300, x: 0, y: 0, toJSON: () => ({}),
    })) as unknown as typeof Element.prototype.getBoundingClientRect;
    const api = at();
    fireEvent.mouseDown(screen.getByTitle(/Drag to move/), { clientX: 100, clientY: 100 });
    fireEvent.mouseMove(screen.getByTestId("tag-frame"), { clientX: 140, clientY: 100 });
    fireEvent.mouseUp(screen.getByTestId("tag-frame"));
    await waitFor(() => expect(api.updateEntity).toHaveBeenCalledWith("sighting", "s1", 0, expect.objectContaining({ box: expect.any(Object) })));
  });

  it("offers the proposals on no floor, and one with no frame can still be decided", async () => {
    // Review Focus 1 and 5.
    const api = at();
    fireEvent.click(screen.getByRole("button", { name: /1 on no floor/ }));
    expect(param("scope")).toBe("floorless");
    expect(nameField().value).toBe("No frames");
    expect(screen.getByText(/No frame shows this proposal/)).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
    key("a");
    await waitFor(() => expect(api.acceptPlace).toHaveBeenCalledWith("p_none", 0, expect.objectContaining({ levelId: "oth-L1" })));
  });

  it("falls back to the first proposal for a link to one already decided", () => {
    at("?place=p_gone");
    expect(nameField().value).toBe("Festive Mall");
  });

  it("says the queue is clear rather than showing nothing", () => {
    useEditorStore.getState().setModel(parseModel({
      ...reviewModel,
      places: reviewModel.places.filter(p => p.status === "confirmed"),
      sightings: [],
    }));
    at();
    expect(screen.getByText("Nothing waiting on L1.")).toBeTruthy();
    expect(screen.getByText("1 place confirmed here.")).toBeTruthy();
  });

  it("stays on screen when the session expires", () => {
    at();
    act(() => useEditorStore.getState().endSession("expired"));
    expect(nameField().value).toBe("Festive Mall");
  });

  it("loads nothing itself: the shell's one load is the only one", () => {
    const api = at();
    expect(api.getModel).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run packages/editor/src/review/ReviewWorkspace.test.tsx --poolOptions.threads.maxThreads=2 --poolOptions.threads.minThreads=1`
Expected: FAIL — `./ReviewWorkspace` does not resolve.

- [ ] **Step 3: The proposal in focus**

Create `packages/editor/src/review/ProposalFocus.tsx`:

```tsx
import {
  TenantCategorySchema, type Box, type Place, type Sighting, type TenantCategory,
} from "@oth/model";
import { useState } from "react";
import type { Api } from "../api/client";
import { FrameCanvas } from "../survey/FrameCanvas";
import type { ProposedPlace } from "../survey/review";
import { Button } from "../ui/Button";
import { Kbd } from "../ui/Kbd";
import { useKeys } from "../ui/keys";
import { reviewCommand } from "./keys";
import type { Evidence } from "./queue";

const CATEGORIES = TenantCategorySchema.options;

/**
 * One proposal: the evidence as large as the space allows, the claim under
 * it, and the decision (spec §10). The agent reads a sign and is sometimes
 * wrong, so the frame it read is the largest thing on screen, with its box on
 * it to correct.
 *
 * Mounted per proposal (keyed by its id), so a correction typed for one never
 * carries over to the next.
 */
export function ProposalFocus({ api, entry, evidence, findSame, onAccept, onReject, onSkip, onMerge, onMoveBox }: {
  api: Pick<Api, "keyframeFileUrl">;
  entry: ProposedPlace;
  evidence: readonly Evidence[];
  /** Places already on this floor with the name as typed now. */
  findSame: (name: string) => Place[];
  onAccept: (fields: { nameEn: string; category: TenantCategory }) => void;
  onReject: () => void;
  onSkip: () => void;
  onMerge: (into: Place) => void;
  onMoveBox: (sighting: Sighting, box: Box) => void;
}) {
  const { place } = entry;
  const [name, setName] = useState(place.nameEn);
  const [category, setCategory] = useState<TenantCategory>(place.category);
  const [shown, setShown] = useState(0);
  const index = Math.min(shown, evidence.length - 1);
  const at = index >= 0 ? evidence[index]! : null;
  const same = findSame(name);
  const canAccept = name.trim() !== "";

  const accept = () => {
    if (canAccept) onAccept({ nameEn: name.trim(), category });
  };
  const step = (by: 1 | -1) => setShown(i => Math.max(0, Math.min(evidence.length - 1, i + by)));

  useKeys(event => {
    const command = reviewCommand(event.key);
    if (command === "accept") accept();
    else if (command === "reject") onReject();
    else if (command === "skip") onSkip();
    else if (command === "prevFrame") step(-1);
    else if (command === "nextFrame") step(1);
    else return;
    event.preventDefault();
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col bg-stone-900 p-3">
        {at ? (
          <FrameCanvas
            imageUrl={api.keyframeFileUrl(at.frame.id, 1600)}
            alt={`Evidence for ${place.nameEn}: frame ${index + 1} of ${evidence.length}`}
            widthPx={at.frame.widthPx}
            heightPx={at.frame.heightPx}
            labels={[{ sighting: at.sighting, place }]}
            onMoveLabel={(label, box) => onMoveBox(label.sighting, box)}
          />
        ) : (
          <p className="m-auto max-w-sm text-center text-sm text-stone-300">
            No frame shows this proposal. Decide from its name and the note below.
          </p>
        )}
        {evidence.length > 1 && (
          <div className="mt-2 flex items-center justify-center gap-3 text-sm text-stone-200">
            <Button size="sm" aria-label="Previous frame" disabled={index <= 0} onClick={() => step(-1)}>←</Button>
            <span>Frame {index + 1} of {evidence.length}</span>
            <Button size="sm" aria-label="Next frame" disabled={index >= evidence.length - 1} onClick={() => step(1)}>→</Button>
          </div>
        )}
      </div>

      <div className="border-t border-stone-200 bg-white px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <input
            aria-label="Name"
            value={name}
            onChange={event => setName(event.target.value)}
            onKeyDown={event => {
              // Letters here are text, so A cannot accept from inside the
              // field; Enter does, as corrected. Esc steps out to the keys.
              if (event.key === "Enter") {
                event.preventDefault();
                accept();
              }
              if (event.key === "Escape") event.currentTarget.blur();
            }}
            className="h-9 min-w-56 flex-1 rounded border border-stone-300 px-3 text-sm"
          />
          <select
            aria-label="Category"
            value={category}
            onChange={event => setCategory(event.target.value as TenantCategory)}
            className="h-9 rounded border border-stone-300 px-2 text-sm"
          >
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <Button variant="primary" disabled={!canAccept} onClick={accept}>Accept <Kbd>A</Kbd></Button>
          <Button onClick={onReject}>Reject <Kbd>R</Kbd></Button>
          <Button variant="ghost" onClick={onSkip}>Skip <Kbd>S</Kbd></Button>
        </div>
        {same.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-2 rounded bg-accent-soft px-3 py-2 text-sm">
            <span>Already on the map:</span>
            {same.map(p => (
              <Button key={p.id} size="sm" onClick={() => onMerge(p)}>Same as {p.nameEn}</Button>
            ))}
            <span className="text-xs text-stone-600">Merging moves these frames to it instead of making a second one.</span>
          </div>
        )}
        {place.notes && <p className="mt-2 text-sm text-stone-700">{place.notes}</p>}
        <p className="mt-1 text-xs text-stone-500">
          {place.proposedBy ? `Proposed by ${place.proposedBy}` : "Proposed"} · {entry.sightings.length} frame{entry.sightings.length === 1 ? "" : "s"}
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: The workspace**

Create `packages/editor/src/review/ReviewWorkspace.tsx`:

```tsx
import type { Level } from "@oth/model";
import { useMemo } from "react";
import type { Api } from "../api/client";
import { reviewCounts } from "../flow/floorProgress";
import { setParams } from "../route";
import type { Saver } from "../state/save";
import { useEditorStore } from "../state/store";
import { Button } from "../ui/Button";
import { Kbd } from "../ui/Kbd";
import { Progress } from "../ui/Progress";
import { useKeys } from "../ui/keys";
import { acceptProposal, mergeProposal, rejectProposal } from "./decide";
import { reviewCommand } from "./keys";
import { ProposalFocus } from "./ProposalFocus";
import {
  currentProposal, evidenceFor, floorlessProposals, nextProposal, readReviewParams, reviewQueue, sameAs,
  type ReviewScope,
} from "./queue";

/**
 * One floor's proposals, one at a time (spec §10): the evidence large, the
 * claim under it, Accept · Reject · Skip. The next proposal is on screen the
 * moment you decide, and every decision can be undone from its toast.
 *
 * The address is the state (place, list, scope). Like Survey, it never loads
 * the model and never returns early on a missing user.
 */
export function ReviewWorkspace({ api, saver, level, params }: {
  api: Api;
  saver: Saver;
  level: Level;
  params: Record<string, string>;
}) {
  const model = useEditorStore(s => s.model);
  const read = useMemo(() => readReviewParams(params), [params]);
  const queue = useMemo(() => reviewQueue(model, level.id, read.scope), [model, level.id, read.scope]);
  const floorless = useMemo(() => (read.scope === "floor" ? floorlessProposals(model).length : 0), [model, read.scope]);
  const current = currentProposal(queue, read.place);
  const deps = { api, saver };

  /**
   * The next proposal loads at once — a second A decides it, not this one
   * again. If this decision does not go through, the view comes back to it,
   * where the conflict banner or error toast says why.
   */
  async function decide(placeId: string, run: () => Promise<boolean>) {
    setParams({ place: nextProposal(queue, placeId)?.place.id ?? null });
    if (!(await run())) setParams({ place: placeId });
  }

  const toScope = (scope: ReviewScope) => setParams({ scope: scope === "floor" ? null : scope, place: null });

  useKeys(event => {
    const command = reviewCommand(event.key);
    if (command === "list") setParams({ list: read.listOpen ? null : "open" });
    else if (command === "closeList" && read.listOpen) setParams({ list: null });
    else return;
    event.preventDefault();
  });

  if (!model) return <p className="p-8 text-sm text-stone-500">Loading the proposals…</p>;

  const counts = reviewCounts(model, level.id);
  const total = counts.confirmed + counts.proposed;

  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-3 border-b border-stone-200 bg-white px-4 py-2">
          {read.scope === "floor" ? (
            <>
              <span className="text-sm font-medium">{counts.confirmed} of {total} decided on {level.code}</span>
              <span className="w-40">
                <Progress value={counts.confirmed} max={total} label={`Review progress on ${level.code}`} tone="confirmed" />
              </span>
              {floorless > 0 && (
                <Button size="sm" variant="ghost" onClick={() => toScope("floorless")}>{floorless} on no floor →</Button>
              )}
            </>
          ) : (
            <>
              <span className="text-sm font-medium">
                {queue.length} proposal{queue.length === 1 ? "" : "s"} on no floor
              </span>
              <span className="text-xs text-stone-500">Accepting one here files it under {level.code}.</span>
              <Button size="sm" variant="ghost" onClick={() => toScope("floor")}>← Back to {level.code}</Button>
            </>
          )}
          <Button
            size="sm"
            className="ml-auto"
            aria-pressed={read.listOpen}
            onClick={() => setParams({ list: read.listOpen ? null : "open" })}
          >
            List <Kbd>L</Kbd>
          </Button>
        </div>

        {current ? (
          <ProposalFocus
            key={current.place.id}
            api={api}
            entry={current}
            evidence={evidenceFor(model, current.sightings)}
            findSame={name => sameAs(model, level.id, current.place, name)}
            onAccept={fields => void decide(current.place.id, () => acceptProposal(deps, current, fields, level.id))}
            onReject={() => void decide(current.place.id, () => rejectProposal(deps, current))}
            onSkip={() => setParams({ place: nextProposal(queue, current.place.id)?.place.id ?? current.place.id })}
            onMerge={into => void decide(current.place.id, () => mergeProposal(deps, current, into))}
            onMoveBox={(sighting, box) => void saver.update("sighting", sighting.id, sighting.version, { box })}
          />
        ) : (
          <div className="grid flex-1 place-items-center p-8">
            <div className="max-w-md space-y-2 text-center text-sm text-stone-600">
              {read.scope === "floor" ? (
                <>
                  <p className="text-base font-medium text-stone-900">Nothing waiting on {level.code}.</p>
                  <p>
                    {counts.confirmed > 0
                      ? `${counts.confirmed} place${counts.confirmed === 1 ? "" : "s"} confirmed here.`
                      : "Proposals appear here once this floor's footage has been labelled."}
                  </p>
                  {floorless > 0 && (
                    <Button onClick={() => toScope("floorless")}>Review the {floorless} on no floor</Button>
                  )}
                </>
              ) : (
                <>
                  <p className="text-base font-medium text-stone-900">No proposals are on no floor.</p>
                  <Button onClick={() => toScope("floor")}>Back to {level.code}</Button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run the tests and the typecheck**

Run: `npx vitest run packages/editor/src/review --poolOptions.threads.maxThreads=2 --poolOptions.threads.minThreads=1`
Expected: PASS.
Run: `npx tsc -b`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add packages/editor/src/review/ProposalFocus.tsx packages/editor/src/review/ReviewWorkspace.tsx packages/editor/src/review/ReviewWorkspace.test.tsx
git commit -m "feat(editor): the Review workspace — one proposal at a time, decided from the frame

The evidence is the largest thing on screen, at the 1600 px size, with
the agent's box on it to correct before deciding; the arrow keys step
through its other frames. Name, category, the agent's note and who
proposed it sit under it, with Accept, Reject and Skip on A, R and S —
never while typing — and the next proposal loads the moment you
decide. A decision that does not go through brings its proposal back
into view. Same as… offers a place already on the floor with the name
being decided. The proposals on no floor, and one with no frame at
all, can still be reached and decided.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---
### Task 14: The list drawer — jump to a proposal, or accept several at once

Spec §10: "**List (L)** opens a drawer of the floor's proposals: filter, jump to one, tick several and accept them together." Accepting several gives one Undo for all of them (Task 12's `acceptProposals`). The drawer is open while the address says `list=open`.

**Files:**
- Create: `packages/editor/src/review/ProposalDrawer.tsx`
- Modify: `packages/editor/src/review/ReviewWorkspace.tsx`
- Test: `packages/editor/src/review/ProposalDrawer.test.tsx`, `packages/editor/src/review/ReviewWorkspace.test.tsx`

**Interfaces:**
- Consumes: Task 12's `acceptProposals` and `ProposedPlace`; Task 13's `ReviewWorkspace`.
- Produces: `ProposalDrawer({ queue, currentId, onJump, onAcceptMany, onClose }: { queue: readonly ProposedPlace[]; currentId: string | null; onJump: (placeId: string) => void; onAcceptMany: (entries: ProposedPlace[]) => Promise<void>; onClose: () => void })`.

- [ ] **Step 1: Write the failing tests**

Create `packages/editor/src/review/ProposalDrawer.test.tsx`:

```tsx
import { PlaceSchema, SightingSchema } from "@oth/model";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ProposedPlace } from "../survey/review";
import { ProposalDrawer } from "./ProposalDrawer";

const entry = (id: string, nameEn: string, frames: number): ProposedPlace => ({
  place: PlaceSchema.parse({ id, nameEn, category: "retail", status: "proposed" }),
  sightings: Array.from({ length: frames }, (_, i) =>
    SightingSchema.parse({ id: `${id}_s${i}`, placeId: id, keyframeId: `kf_${i}`, status: "proposed" })),
});
const queue = [entry("p1", "Festive Mall", 3), entry("p2", "Gate 1", 1), entry("p3", "Gate 2", 1)];

function setup(currentId = "p1") {
  const onJump = vi.fn();
  const onAcceptMany = vi.fn(async () => {});
  const onClose = vi.fn();
  render(<ProposalDrawer queue={queue} currentId={currentId} onJump={onJump} onAcceptMany={onAcceptMany} onClose={onClose} />);
  return { onJump, onAcceptMany, onClose, drawer: within(screen.getByRole("complementary", { name: "Proposals" })) };
}

describe("ProposalDrawer", () => {
  it("lists the floor's proposals with how often each was seen, the current one marked", () => {
    const { drawer } = setup();
    expect(drawer.getByRole("heading", { name: "Proposals (3)" })).toBeTruthy();
    expect(drawer.getByRole("button", { name: /^Festive Mall/ }).getAttribute("aria-current")).toBe("true");
    expect(drawer.getByText("3 frames · retail")).toBeTruthy();
  });

  it("jumps to a proposal", () => {
    const { drawer, onJump } = setup();
    fireEvent.click(drawer.getByRole("button", { name: /^Gate 1/ }));
    expect(onJump).toHaveBeenCalledWith("p2");
  });

  it("narrows the list to names that match", () => {
    const { drawer } = setup();
    fireEvent.change(drawer.getByLabelText("Filter proposals"), { target: { value: "gate" } });
    expect(drawer.queryByRole("button", { name: /^Festive Mall/ })).toBeNull();
    expect(drawer.getByRole("button", { name: /^Gate 2/ })).toBeTruthy();
  });

  it("accepts the ticked ones together", async () => {
    const { drawer, onAcceptMany } = setup();
    fireEvent.click(drawer.getByLabelText("Tick Gate 1"));
    fireEvent.click(drawer.getByLabelText("Tick Gate 2"));
    await act(async () => { fireEvent.click(drawer.getByRole("button", { name: "Accept 2 ticked" })); });
    expect(onAcceptMany).toHaveBeenCalledWith([queue[1], queue[2]]);
    expect(drawer.getByRole("button", { name: "Accept 0 ticked" })).toHaveProperty("disabled", true);
  });

  it("ticks everything the filter shows, and only that", () => {
    const { drawer } = setup();
    fireEvent.change(drawer.getByLabelText("Filter proposals"), { target: { value: "gate" } });
    fireEvent.click(drawer.getByLabelText("Tick all shown"));
    fireEvent.change(drawer.getByLabelText("Filter proposals"), { target: { value: "" } });
    expect((drawer.getByLabelText("Tick Festive Mall") as HTMLInputElement).checked).toBe(false);
    expect((drawer.getByLabelText("Tick Gate 1") as HTMLInputElement).checked).toBe(true);
    expect(drawer.getByRole("button", { name: "Accept 2 ticked" })).toBeTruthy();
  });

  it("closes", () => {
    const { drawer, onClose } = setup();
    fireEvent.click(drawer.getByRole("button", { name: "Close the list" }));
    expect(onClose).toHaveBeenCalled();
  });
});
```

In `packages/editor/src/review/ReviewWorkspace.test.tsx`, inside `describe("ReviewWorkspace", …)`, add:

```tsx
  it("opens the list on L and closes it on Esc, and the address says so", () => {
    at();
    key("l");
    expect(param("list")).toBe("open");
    expect(screen.getByRole("complementary", { name: "Proposals" })).toBeTruthy();
    key("Escape");
    expect(param("list")).toBeNull();
  });

  it("accepts several ticked in the list, with one Undo for all", async () => {
    const api = at("?list=open");
    fireEvent.click(screen.getByLabelText("Tick Festive Mall"));
    fireEvent.click(screen.getByLabelText("Tick Gate 1"));
    fireEvent.click(screen.getByRole("button", { name: "Accept 2 ticked" }));
    await waitFor(() => expect(toastSaying("Accepted 2 places")).toBeTruthy());
    expect(api.acceptPlace.mock.calls.map(c => (c as unknown[])[0])).toEqual(["p_big", "p_small"]);
  });
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run packages/editor/src/review --poolOptions.threads.maxThreads=2 --poolOptions.threads.minThreads=1`
Expected: FAIL — `./ProposalDrawer` does not resolve, and the workspace shows no drawer.

- [ ] **Step 3: Write the drawer**

Create `packages/editor/src/review/ProposalDrawer.tsx`:

```tsx
import { useState } from "react";
import type { ProposedPlace } from "../survey/review";
import { Button } from "../ui/Button";

/**
 * Every proposal on the floor at once (spec §10): filter by name, jump to one,
 * or tick several that need no correction and accept them together. What
 * needs a closer look is still decided one at a time, from its frame.
 */
export function ProposalDrawer({ queue, currentId, onJump, onAcceptMany, onClose }: {
  queue: readonly ProposedPlace[];
  currentId: string | null;
  onJump: (placeId: string) => void;
  onAcceptMany: (entries: ProposedPlace[]) => Promise<void>;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [ticked, setTicked] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const q = query.trim().toLowerCase();
  const shown = q === ""
    ? queue
    : queue.filter(({ place }) => place.nameEn.toLowerCase().includes(q) || place.nameZh.toLowerCase().includes(q));
  // A tick on something decided meanwhile, here or by a teammate, counts for nothing.
  const chosen = queue.filter(({ place }) => ticked.has(place.id));
  const allShown = shown.length > 0 && shown.every(({ place }) => ticked.has(place.id));

  const toggle = (ids: string[], on: boolean) =>
    setTicked(prev => {
      const next = new Set(prev);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });

  async function acceptChosen() {
    setBusy(true);
    try {
      await onAcceptMany(chosen);
      setTicked(new Set());
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside aria-label="Proposals" className="flex w-80 shrink-0 flex-col border-l border-stone-200 bg-white">
      <div className="flex items-center border-b border-stone-200 px-3 py-2">
        <h2 className="text-sm font-semibold">Proposals ({queue.length})</h2>
        <button
          type="button"
          aria-label="Close the list"
          className="ml-auto rounded px-2 text-stone-500 hover:bg-stone-100"
          onClick={onClose}
        >
          ×
        </button>
      </div>
      <div className="space-y-2 border-b border-stone-200 p-3">
        <input
          type="search"
          aria-label="Filter proposals"
          placeholder="Filter by name…"
          value={query}
          onChange={event => setQuery(event.target.value)}
          className="h-8 w-full rounded border border-stone-300 px-2 text-sm"
        />
        <label className="flex items-center gap-2 text-xs text-stone-600">
          <input
            type="checkbox"
            aria-label="Tick all shown"
            checked={allShown}
            onChange={event => toggle(shown.map(({ place }) => place.id), event.target.checked)}
          />
          Tick all shown
        </label>
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto p-1">
        {shown.map(({ place, sightings }) => (
          <li key={place.id} className="flex items-center gap-2 rounded px-2 py-1 hover:bg-stone-50">
            <input
              type="checkbox"
              aria-label={`Tick ${place.nameEn}`}
              checked={ticked.has(place.id)}
              onChange={event => toggle([place.id], event.target.checked)}
            />
            <button
              type="button"
              aria-current={place.id === currentId ? "true" : undefined}
              className={`min-w-0 flex-1 text-left ${place.id === currentId ? "font-semibold text-accent" : ""}`}
              onClick={() => onJump(place.id)}
            >
              <span className="block truncate">{place.nameEn}</span>
              <span className="block text-xs text-stone-500">
                {sightings.length} frame{sightings.length === 1 ? "" : "s"} · {place.category}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <div className="border-t border-stone-200 p-3">
        <Button variant="primary" className="w-full" disabled={chosen.length === 0 || busy} onClick={() => void acceptChosen()}>
          Accept {chosen.length} ticked
        </Button>
      </div>
    </aside>
  );
}
```

- [ ] **Step 4: Put the drawer in the workspace**

In `packages/editor/src/review/ReviewWorkspace.tsx`, change the decide import to `import { acceptProposal, acceptProposals, mergeProposal, rejectProposal } from "./decide";`, add `import { ProposalDrawer } from "./ProposalDrawer";`, and directly before the final `</div>` of the returned tree — after the `<div className="flex min-w-0 flex-1 flex-col">…</div>` column — add:

```tsx
      {read.listOpen && (
        <ProposalDrawer
          queue={queue}
          currentId={current?.place.id ?? null}
          onJump={placeId => setParams({ place: placeId })}
          onAcceptMany={async entries => { await acceptProposals(deps, entries, level.id); }}
          onClose={() => setParams({ list: null })}
        />
      )}
```

- [ ] **Step 5: Run the tests and the typecheck**

Run: `npx vitest run packages/editor/src/review --poolOptions.threads.maxThreads=2 --poolOptions.threads.minThreads=1`
Expected: PASS.
Run: `npx tsc -b`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add packages/editor/src/review/ProposalDrawer.tsx packages/editor/src/review/ProposalDrawer.test.tsx packages/editor/src/review/ReviewWorkspace.tsx packages/editor/src/review/ReviewWorkspace.test.tsx
git commit -m "feat(editor): Review's list drawer — filter, jump, and accept several at once

L opens every proposal on the floor beside the one in focus: filter by
name, jump to one, or tick the ones that need no correction and accept
them together, with one Undo for them all. The drawer is in the address
(list=open), and Esc closes it.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---
### Task 15: Wire it in — the floor's Survey and Review tabs are the new workspaces; the old screens go

`FloorWorkspace` hosts the two new workspaces and gives them one non-validating saver. `SurveyApp`, `PlaceTagger`, `CaptureVideo` and `ReviewPanel` are deleted with their tests; their kept tests already moved in Tasks 8 and 10. This also retires two items Plan 1 carried forward:
- the raw "api error 401" toasts in SurveyApp and CaptureVideo. Every write in the new screens goes through the saver or checks `isUnauthorized`.
- the double model load on the Survey and Review tabs. The old screens each loaded the model again; the new ones never load. Build keeps the old `App`, and with it one extra load, until Plan 3.

**Files:**
- Modify: `packages/editor/src/floor/FloorWorkspace.tsx`
- Modify: `packages/editor/src/shell/Workspace.test.tsx`
- Modify: `packages/editor/src/survey/autoFrames.ts:1-7` (a comment naming CaptureVideo)
- Delete: `packages/editor/src/survey/SurveyApp.tsx`, `SurveyApp.test.tsx`, `PlaceTagger.tsx`, `PlaceTagger.test.tsx`, `CaptureVideo.tsx`, `CaptureVideo.test.tsx`, `ReviewPanel.tsx`, `ReviewPanel.test.tsx` (all under `packages/editor/src/survey/`)

**Interfaces:**
- Consumes: `SurveyWorkspace` (Task 11), `ReviewWorkspace` (Tasks 13–14).
- Produces: `FloorWorkspace` renders `SurveyWorkspace` for `tab === "survey"` and `ReviewWorkspace` for `tab === "review"`, both with `params={route.params}` and one `createSaver(api, { validate: false })`. Build is unchanged.

- [ ] **Step 1: Write the failing tests**

In `packages/editor/src/shell/Workspace.test.tsx`, add `vi` to the vitest import. Replace the test `it("keeps a floor's tab on screen through an expired session", …)` with:

```tsx
  // I1: an expired session must not blank a floor's tab behind the sign-in
  // dialog. App.test.tsx pins the same rule for Build, which needs WebGL.
  it("keeps a floor's tab on screen through an expired session", async () => {
    const api = fakeApi();
    window.history.pushState({}, "", "/floors/L1/survey");
    render(
      <AuthGate api={api}>
        <Workspace api={api} />
      </AuthGate>,
    );
    expect(await screen.findByText(/Frame 2 of 2/)).toBeTruthy();

    act(() => useEditorStore.getState().endSession("expired"));

    expect(screen.getByText(/Frame 2 of 2/)).toBeTruthy();
    expect(screen.getByRole("dialog", { name: /session ended/i })).toBeTruthy();
  });

  it("shows the new Survey on the Survey tab", async () => {
    at("/floors/L1/survey");
    // sampleModel: two frames on L1, the first carrying a proposal, so it opens on the second.
    expect(await screen.findByText(/Frame 2 of 2/)).toBeTruthy();
    expect(screen.getByRole("group", { name: "Show frames" })).toBeTruthy();
  });

  it("shows one proposal at a time on the Review tab", async () => {
    at("/floors/L1/review");
    expect(await screen.findByDisplayValue("Festive Mall")).toBeTruthy();
    expect(screen.getByText("0 of 1 decided on L1")).toBeTruthy();
  });

  it("loads the model once, whichever of Survey and Review is open", async () => {
    // The old screens each loaded it again, and doubled every error toast.
    const api = fakeApi();
    window.history.pushState({}, "", "/floors/L1/survey");
    render(<Workspace api={api} />);
    await screen.findByText(/Frame 2 of 2/);
    fireEvent.click(screen.getByRole("link", { name: /Review/ }));
    await screen.findByDisplayValue("Festive Mall");
    expect((api as unknown as { getModel: ReturnType<typeof vi.fn> }).getModel).toHaveBeenCalledTimes(1);
  });
```

and add `fireEvent` to the `@testing-library/react` import.

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run packages/editor/src/shell/Workspace.test.tsx --poolOptions.threads.maxThreads=2 --poolOptions.threads.minThreads=1`
Expected: FAIL. The Survey tab still shows the old SurveyApp, which has no "Frame 2 of 2" until a capture is picked, and the model loads twice.

- [ ] **Step 3: Host the new workspaces**

Replace `packages/editor/src/floor/FloorWorkspace.tsx` with:

```tsx
import { live } from "@oth/model";
import { useEffect, useMemo } from "react";
import type { Api } from "../api/client";
import { App } from "../App";
import { findLevel, pickTab } from "../flow/floors";
import { ReviewWorkspace } from "../review/ReviewWorkspace";
import { href, navigate, type FloorRoute } from "../route";
import { createSaver, type Saver } from "../state/save";
import { useEditorStore } from "../state/store";
import { SurveyWorkspace } from "../survey/SurveyWorkspace";
import { recall, remember } from "../ui/remember";
import { toast } from "../ui/toast";

/**
 * One floor's workspace: finds the floor, makes it the active level, picks and
 * remembers the tab, and shows it.
 *
 * Survey and Review share one saver that skips validation: every survey rule
 * is a warning, so nothing they write can change what blocks publishing, and
 * skipping it saves half a second on every tag. Neither loads the model —
 * the shell already has. Build is still the old editor until Plan 3.
 */
export function FloorWorkspace({ api, route }: { api: Api; saver: Saver; route: FloorRoute }) {
  const model = useEditorStore(s => s.model);
  const activeLevelId = useEditorStore(s => s.activeLevelId);
  const setActiveLevel = useEditorStore(s => s.setActiveLevel);
  const surveySaver = useMemo(() => createSaver(api, { validate: false }), [api]);
  const level = findLevel(model, route.code);

  useEffect(() => {
    if (level && level.id !== activeLevelId) setActiveLevel(level.id);
  }, [level, activeLevelId, setActiveLevel]);

  useEffect(() => {
    if (!model || level) return;
    toast({ tone: "error", message: `There is no floor ${route.code}. Pick one from the floors.` });
    navigate("/floors", { replace: true });
  }, [model, level, route.code]);

  useEffect(() => {
    if (!model || !level) return;
    if (route.tab === null) {
      const hasFootage = live(model.captures).some(c => c.levelId === level.id);
      navigate(href({ ...route, code: level.code, tab: pickTab(recall(`lastTab.${level.code}`), hasFootage) }), { replace: true });
      return;
    }
    remember(`lastTab.${level.code}`, route.tab);
    remember("lastFloor", level.code);
  }, [model, level, route]);

  if (!model || !level || route.tab === null) {
    return <p className="p-8 text-sm text-stone-500">Loading the floor…</p>;
  }
  if (route.tab === "survey") {
    return <SurveyWorkspace api={api} saver={surveySaver} level={level} params={route.params} />;
  }
  if (route.tab === "review") {
    return <ReviewWorkspace api={api} saver={surveySaver} level={level} params={route.params} />;
  }
  return <App api={api} embedded />;
}
```

- [ ] **Step 4: Retire the old screens**

```bash
git rm packages/editor/src/survey/SurveyApp.tsx packages/editor/src/survey/SurveyApp.test.tsx packages/editor/src/survey/PlaceTagger.tsx packages/editor/src/survey/PlaceTagger.test.tsx packages/editor/src/survey/CaptureVideo.tsx packages/editor/src/survey/CaptureVideo.test.tsx packages/editor/src/survey/ReviewPanel.tsx packages/editor/src/survey/ReviewPanel.test.tsx
```

In the header comment of `packages/editor/src/survey/autoFrames.ts`, the last sentence ends "…and that lives in CaptureVideo." Change it to end "…and that lives in `captureFrame.ts`, driven by `findFrames.ts`."

Then confirm nothing still names them:

Run: `git grep -n -E "SurveyApp|PlaceTagger|CaptureVideo|ReviewPanel" -- packages/editor/src`
Expected: no matches. A match in code means a task was missed, so stop and report.

- [ ] **Step 5: Run the editor's tests and the typecheck**

Run: `npx vitest run packages/editor/src/shell packages/editor/src/floor packages/editor/src/survey packages/editor/src/review packages/editor/src/App.test.tsx --poolOptions.threads.maxThreads=2 --poolOptions.threads.minThreads=1`
Expected: PASS.
Run: `npx tsc -b`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add packages/editor/src/floor/FloorWorkspace.tsx packages/editor/src/shell/Workspace.test.tsx packages/editor/src/survey/autoFrames.ts
git commit -m "feat(editor): the floor's Survey and Review tabs are the new workspaces

FloorWorkspace hosts SurveyWorkspace and ReviewWorkspace with one saver
that skips validation, and neither loads the model: the shell's one
load is the only one, so the double load and its doubled error toasts
are gone from these tabs. SurveyApp, PlaceTagger, CaptureVideo and
ReviewPanel are retired, and with them the raw 401 toasts plan 1 left
in SurveyApp and CaptureVideo; their kept tests moved with the pieces.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---
### Task 16: Verify it end to end on a copy of the real data, and record it

**Files:**
- Modify: `docs/design-and-plans/README.md` (the Workspace overhaul row)
- Modify: `docs/design-and-plans/plans/2026-09-27-survey-and-review.md` (tick the boxes)
- Scratch only, never committed: `$SCRATCH/plan2-data/`, `$SCRATCH/plan2-walk/walk.cjs` and its screenshots. Here `$SCRATCH` is the session's scratchpad directory.

**Interfaces:**
- Consumes: the whole plan.

- [ ] **Step 1: The full suite, throttled**

Run: `npx vitest run --poolOptions.threads.maxThreads=2 --poolOptions.threads.minThreads=1`
Expected: every file passes, with no unhandled errors. Report the totals. A failure in a file this plan did not touch is still reported, by name.

- [ ] **Step 2: Typecheck and build**

Run: `npx tsc -b`
Expected: exit 0.
Run: `npm run build`
Expected: `✓ built`. The only warning allowed is the existing chunk-size notice.

- [ ] **Step 3: A sandbox copy of the real data, served on :3055**

Never run against `packages/server/data` in the main checkout: the dev server on :3000 owns it, and PGlite allows one writer. From the worktree root, in Git Bash:

```bash
SCRATCH="<the session scratchpad directory>"
rm -rf "$SCRATCH/plan2-data" && mkdir -p "$SCRATCH/plan2-data" "$SCRATCH/plan2-walk"
cp -r ../../../packages/server/data/dev-db ../../../packages/server/data/assets "$SCRATCH/plan2-data/"
rm -f "$SCRATCH/plan2-data/dev-db/postmaster.pid"
```

Start the sandbox server in the background (`run_in_background`):

```bash
cd packages/server && DATA_DIR="$SCRATCH/plan2-data" PORT=3055 npx tsx src/index.ts
```

Run: `curl -s http://localhost:3055/api/health`
Expected: `{"ok":true}`. The server serves the `packages/editor/dist` built in Step 2. Signing in is picking a name, and the copy already has "Demo Author".

- [ ] **Step 4: Walk Survey and Review with Playwright**

Create `$SCRATCH/plan2-walk/walk.cjs`. It is scratch, so it is not committed:

```js
// Drives Survey and Review on the :3055 sandbox copy of the real data.
// Usage: node walk.cjs <folder for screenshots>
const path = require("node:path");
const { chromium } = require("C:/Users/qhuip/Repositories/my_library/node_modules/playwright");

const BASE = "http://localhost:3055";
const OUT = process.argv[2];
const results = [];

function check(name, ok, detail = "") {
  results.push({ name, ok: Boolean(ok) });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(20_000);
  let modelLoads = 0;
  page.on("request", r => {
    if (r.method() === "GET" && new URL(r.url()).pathname === "/api/model") modelLoads++;
  });
  const shot = name => page.screenshot({ path: path.join(OUT, `${name}.png`) });
  const toast = text => page.getByText(text).last();
  const undo = () => page.getByRole("button", { name: "Undo" }).last().click();
  const blur = () => page.evaluate(() => document.activeElement && document.activeElement.blur());
  const param = name => new URL(page.url()).searchParams.get(name);

  try {
    // Sign in by picking a name.
    await page.goto(`${BASE}/`);
    await page.getByLabel(/who are you/i).selectOption({ label: "Demo Author" });
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.getByRole("heading", { name: "Floors" }).waitFor();
    check("signs in by picking a name and lands on Floors", true);

    // Survey: the real walkthrough is on no floor, so it is offered for filing.
    modelLoads = 0;
    await page.goto(`${BASE}/floors/L1/survey`);
    const banner = page.getByRole("status").filter({ hasText: "isn't filed under a floor" });
    await banner.waitFor();
    check("offers to file the walkthrough that is on no floor", true, await banner.innerText());
    check("loads the model once on opening Survey", modelLoads === 1, `${modelLoads} loads`);
    await shot("01-survey-unfiled");
    await page.getByRole("button", { name: "File under L1" }).click();
    const counter = page.getByText(/Frame \d+ of \d+/).first();
    await counter.waitFor();
    const total = Number((await counter.innerText()).match(/of (\d+)/)[1]);
    check("files it, and shows its frames", total > 100, await counter.innerText());
    const pageScrolls = await page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight + 1);
    check("fits the frame on screen, never scrolled to", !pageScrolls);
    await shot("02-survey-frame");

    // Filters and keys.
    const untagged = await page.getByRole("group", { name: "Show frames" }).getByRole("button", { name: /Untagged/ }).innerText();
    check("counts the untagged frames", /\d/.test(untagged), untagged);
    await blur();
    const start = param("frame");
    await page.keyboard.press("ArrowRight");
    check("→ moves on, and the address follows", param("frame") && param("frame") !== start, `${start} → ${param("frame")}`);
    await page.keyboard.press("n");
    check("N goes to a frame with no tag", Boolean(param("frame")));
    const here = param("frame");
    await page.getByLabel("Place name").click();
    await page.keyboard.type("ntuc");
    check("letters typed into the name stay text", param("frame") === here && (await page.getByLabel("Place name").inputValue()) === "ntuc");
    await page.getByLabel("Place name").fill("");

    // Draw a box, tag a new place, then remove the tag and undo that.
    const box = await page.getByTestId("tag-frame").boundingBox();
    await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.3);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5, { steps: 5 });
    await page.mouse.up();
    await page.getByLabel("Place name").fill("Plan check kiosk");
    await page.getByLabel("Place name").press("Enter");
    const boxed = page.getByTestId(/^label-box-/).filter({ hasText: "Plan check kiosk" });
    await boxed.waitFor();
    check("tags a new place with the box drawn", (await boxed.count()) === 1);
    await shot("03-survey-tagged");
    await page.getByRole("button", { name: "Remove Plan check kiosk from this frame" }).click();
    await toast("Deleted the tag Plan check kiosk").waitFor();
    await undo();
    await toast("Restored the tag Plan check kiosk").waitFor();
    check("removing a tag offers Undo, and Undo brings it back", true);

    // Bin the frame, then undo.
    await blur();
    await page.keyboard.press("Delete");
    await toast(/Binned frame \d+/).waitFor();
    await undo();
    await toast(/Frame \d+ is back/).waitFor();
    check("Del bins the frame, and Undo brings it back", true);

    // Grid.
    await page.keyboard.press("g");
    await page.getByTestId("grid").waitFor();
    const cells = await page.getByTestId("grid").getByRole("button").count();
    check("G shows the contact sheet, only the rows in view", cells > 0 && cells < 150, `${cells} of ${total} rendered`);
    await shot("04-survey-grid");
    await page.keyboard.press("g");

    // Review.
    modelLoads = 0;
    await page.getByRole("link", { name: /^Review/ }).click();
    const progress = page.getByText(/decided on L1/);
    await progress.waitFor();
    check("Review shows how far L1 has got", true, await progress.innerText());
    check("switching tab loads nothing more", modelLoads === 0, `${modelLoads} loads`);
    await shot("05-review");
    const name = page.getByLabel("Name", { exact: true });

    await name.focus();
    await name.press("End");
    const typedOver = await name.inputValue();
    await page.keyboard.type("r");
    check("an R typed into the name is text, not Reject", (await name.inputValue()) === `${typedOver}r`);
    await name.fill(typedOver);

    await blur();
    const first = await name.inputValue();
    await page.keyboard.press("a");
    await toast(`Accepted ${first}`).waitFor();
    const second = await name.inputValue();
    check("A accepts, and the next proposal is there at once", second !== first, `${first} → ${second}`);
    await undo();
    await toast(`${first} is back in the queue`).waitFor();
    check("Undo puts an accepted proposal back", true);

    await blur();
    const rejected = await name.inputValue();
    await page.keyboard.press("r");
    await toast(`Rejected ${rejected}`).waitFor();
    await undo();
    await toast(`${rejected} is back in the queue`).waitFor();
    check("R rejects, and Undo brings it back with its tags", true);

    // Same as…: the proposed Gate 1 beside the confirmed one.
    await blur();
    await page.keyboard.press("l");
    const drawer = page.getByRole("complementary", { name: "Proposals" });
    await drawer.waitFor();
    await drawer.getByLabel("Filter proposals").fill("Gate 1");
    await drawer.getByText("Gate 1", { exact: true }).first().click();
    const same = page.getByRole("button", { name: "Same as Gate 1" });
    await same.waitFor();
    check("offers Same as… for the proposed Gate 1", true);
    await shot("06-review-same-as");
    await same.click();
    await toast("Merged Gate 1 into Gate 1").waitFor();
    await undo();
    await toast("Gate 1 is back in the queue").waitFor();
    check("merges into the place already there, and Undo takes it back", true);

    // Accept two from the list, then undo both.
    await drawer.getByLabel("Filter proposals").fill("");
    const ticks = drawer.getByLabel(/^Tick (?!all)/);
    await ticks.nth(0).check();
    await ticks.nth(1).check();
    await drawer.getByRole("button", { name: "Accept 2 ticked" }).click();
    await toast("Accepted 2 places").waitFor();
    await undo();
    await toast("2 places are back in the queue").waitFor();
    check("accepts two ticked in the list, with one Undo", true);
    await blur();
    await page.keyboard.press("Escape");
    check("Esc closes the list", param("list") === null);

    // The proposals on no floor, some with no frame at all.
    const noFloor = page.getByRole("button", { name: /on no floor/ });
    if (await noFloor.count()) {
      await noFloor.first().click();
      const none = page.getByText("No frame shows this proposal", { exact: false });
      check("reaches the proposals on no floor; one with no frame says so", await none.isVisible());
      await shot("07-review-no-floor");
    } else {
      check("no proposals are on no floor in this copy", true);
    }

    // Add footage says where it files.
    await page.getByRole("link", { name: "Survey" }).click();
    await page.getByRole("button", { name: "+ Add footage" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Add footage" });
    await dialog.waitFor();
    check("Add footage files under this floor and never uploads the video", /Filed under L1.*never uploaded/s.test(await dialog.innerText()));
    await shot("08-add-footage");
    await page.keyboard.press("Escape");
  } catch (err) {
    check(`the walk stopped: ${err.message.split("\n")[0]}`, false);
    await shot("error").catch(() => {});
  } finally {
    await browser.close();
    const failed = results.filter(r => !r.ok).length;
    console.log(`\n${results.length - failed} passed, ${failed} failed`);
    process.exitCode = failed ? 1 : 0;
  }
})();
```

Run: `node "$SCRATCH/plan2-walk/walk.cjs" "$SCRATCH/plan2-walk"`
Expected: every line `PASS`, ending `N passed, 0 failed`. Open the screenshots with the Read tool and check four things by eye:
- the frame fills the space above the tag bar;
- a proposed box is dashed;
- the grid has stripes;
- the Review evidence is large, with the agent's box on it.

For a `FAIL`, find the cause with superpowers:systematic-debugging and fix it in the task that owns it. Commit the fix on its own, then run Steps 1, 2 and 4 again.

- [ ] **Step 5: Stop the sandbox**

Kill only the process listening on :3055 (PowerShell):

```powershell
Get-NetTCPConnection -LocalPort 3055 -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

Leave `$SCRATCH/plan2-data` in the scratchpad; it is never committed. Make sure no vitest process is left running.

- [ ] **Step 6: Record the plan in the design journal**

In `docs/design-and-plans/README.md`, in the Workspace overhaul row, replace the plan cell with:

```
1. [`plans/2026-09-27-workspace-foundation.md`](plans/2026-09-27-workspace-foundation.md)<br>2. [`plans/2026-09-27-survey-and-review.md`](plans/2026-09-27-survey-and-review.md)<br>3–4. Build, Deploy — to follow
```

Tick every box in this plan that was done.

- [ ] **Step 7: Commit**

```bash
git add docs/design-and-plans/README.md docs/design-and-plans/plans/2026-09-27-survey-and-review.md
git commit -m "docs(plan): workspace overhaul, plan 2 done — survey and review

Both workspaces are built, tested and walked on a copy of the real
data: the walkthrough filed under L1 from the Survey banner, a tag,
a bin and their Undos, the grid, and in Review an accept, a reject, a
Same as… merge and a batch accept, each undone.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## What Plan 1 carried forward, and where it went

| Item from Plan 1's list | Where |
|---|---|
| Expired-session dialog says "not saved" when it was | Task 1 |
| Owner avatars show "TM" while the team loads; the switcher has no failure message | Task 2 |
| Raw 401s: FloorplanPanel, AssetLibrary, panels/PublishButton | Task 2 |
| Raw 401s: SurveyApp, CaptureVideo | Retired with those screens, Task 15 |
| App docstring; the thumbnail test's failed rename | Task 2 |
| Undoing a reject brings back the place's sightings | Task 4 |
| Keyframe delete and restore audited, transactional, versioned | Task 3 |
| (Plan 3's list) Screens and sessions: no early return on `user` | Global Constraints; tests in Tasks 11 and 13 |
| (Plan 3's list) Double load | Gone for Survey and Review, Task 15; Build's stays until Plan 3 |
| (Plan 3's list) Error toasts offer Retry | The saver, Task 1: every screen's writes, Build's included |
| (Plan 3's list) `deleteWithUndo` refreshes in `finally` | Task 11, through `offerUndo`. What it says when only part of an undo succeeds is still Plan 3's. |
| (Plan 3's list) Key each name field by entity id | Review's, Task 13. Build's are still Plan 3's. |

## Left for later plans

- **Build (Plan 3):** the rest of its list — lift placement that can orphan a portal, Build's name fields keyed by id, Build's own double load, and what a partial `deleteWithUndo` says.
- **Deploy (Plan 4):** the live data's walkthrough is still on no floor. After import, one click on *File under L1* in L1's Survey files it; the teammate note should say so, or `data:import` can file it.
- **Not offered, on purpose:** deleting a whole capture. Spec §9 does not list it, and it cannot be undone (its restore is refused). The server endpoint stays. A wrong frame is binned, with Undo, and footage is renamed from *Find more frames*.
