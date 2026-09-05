# Presence and Lock Indicators Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show who else is in the editor, which floor they are on, and what they are holding — so four people tracing eight floors do not start the same edit twice.

**Architecture:** The server half already exists and is untouched apart from one gap: presence heartbeat, an SSE stream and a list endpoint; advisory entity locks with a 5-minute TTL, acquire returning 423 when someone else holds it. What is missing is the entire client half — nothing calls `acquireLock`, `releaseLock` or `heartbeat`, and nothing sets `presence` in the store. One hook drives all of it on a single timer.

**Tech Stack:** TypeScript, Hono, Drizzle, React, Zustand, Vitest. No new dependencies.

**Spec:** none. This is client wiring for a design already settled in
[`specs/2026-09-04-oth-map-model-design.md`](../specs/2026-09-04-oth-map-model-design.md) §10,
so the decisions that needed making are recorded below rather than in a separate document.

## Design decisions

**Locks warn, they never block.** `version` is the real correctness guarantee — a
409 and the existing conflict banner — and the lock exists only to stop two
people *starting* the same edit. So a locked entity stays fully editable and the
UI says who is in it. Blocking would add a second, weaker correctness mechanism
that can strand an entity for five minutes when someone closes a laptop.

**Acquire on selection, not on first edit.** You want to know before you start
dragging vertices, and selecting is the earliest honest signal of intent.
Released when the selection changes or the tab goes away; the TTL covers a crash.

**Poll, do not stream.** The server has an SSE presence stream and it stays
there, but the client must run a heartbeat timer regardless, and one timer that
also fetches presence and locks is one code path instead of two — testable in
jsdom, which has no `EventSource`. For four people, five-second staleness is
invisible. Wire the stream when the team is large enough for that to be false.

## Global Constraints

- Presence TTL on the server is **30 s**; lock TTL is **300 s**. The client timer runs every **5 s**, well inside both.
- **Never block an edit on a lock.** No disabled inputs, no refusal to save.
- Your own locks are not shown back to you — a badge on every row you touch is noise.
- Run `npm run typecheck` as its own step and read it **before** committing.
- Stage explicit paths. Never `git add -A` — `docs/OTH_Project_Plan.*` and `docs/figures/` are the user's and must stay untracked.

---

## File Structure

| File | Responsibility |
|---|---|
| `packages/server/src/locks/service.ts` | `activeLocks` returns the holder's display name |
| `packages/editor/src/api/client.ts` | `listLocks`, `listPresence` |
| `packages/editor/src/state/store.ts` | `locks` and `setLocks` |
| `packages/editor/src/collab/useCollaboration.ts` | one timer: heartbeat, presence, locks; acquire/release on selection |
| `packages/editor/src/collab/locks.ts` | `lockFor` — pure lookup, "who holds this, if not me" |
| `packages/editor/src/panels/PresenceBar.tsx` | who else is here, and on which floor |
| `packages/editor/src/panels/LockBanner.tsx` | "Wei is editing this" for the current selection |

---

## Task 1: Locks carry the holder's name

**Files:**
- Modify: `packages/server/src/locks/service.ts`
- Test: `packages/server/src/locks/service.test.ts`

**Interfaces:**
- Produces: `Lock` gains `lockedByName: string`. `GET /api/locks` returns it unchanged otherwise.

- [ ] **Step 1: Write the failing test**

Append to `packages/server/src/locks/service.test.ts`:

```ts
it("names the holder, since a user id tells nobody anything", async () => {
  const user = await createUser(db, {
    email: "wei@example.com", password: "passphrase", displayName: "Wei",
  });
  await acquireLock(db, "room", "L1-a", user.id, 300);
  expect((await activeLocks(db))[0]?.lockedByName).toBe("Wei");
});

it("falls back to the id when the user has been removed", async () => {
  await acquireLock(db, "room", "L1-b", "user_gone", 300);
  expect((await activeLocks(db))[0]?.lockedByName).toBe("user_gone");
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run packages/server/src/locks`
Expected: FAIL — `lockedByName` is undefined.

- [ ] **Step 3: Join the users table**

In `packages/server/src/locks/service.ts`:

```ts
export type Lock = {
  entityType: string;
  entityId: string;
  lockedBy: string;
  /** Display name of the holder — a raw user id tells a teammate nothing. */
  lockedByName: string;
  lockedAt: Date;
  expiresAt: Date;
};
```

```ts
export async function activeLocks(db: Database): Promise<Lock[]> {
  const rows = await db
    .select({ lock: entityLocks, displayName: users.displayName })
    .from(entityLocks)
    .leftJoin(users, eq(entityLocks.lockedBy, users.id))
    .where(gt(entityLocks.expiresAt, new Date()));

  return rows.map(r => ({
    ...r.lock,
    // A left join so a lock held by a since-deleted user still lists.
    lockedByName: r.displayName ?? r.lock.lockedBy,
  }));
}
```

Import `users` from `../db/schema`.

- [ ] **Step 4: Run and commit**

```bash
npx vitest run packages/server
npm run typecheck
git add packages/server/src/locks/service.ts packages/server/src/locks/service.test.ts
git commit -m "feat(server): locks carry the holder's display name"
```

---

## Task 2: The collaboration hook

**Files:**
- Create: `packages/editor/src/collab/locks.ts`, `src/collab/locks.test.ts`, `src/collab/useCollaboration.ts`, `src/collab/useCollaboration.test.tsx`
- Modify: `packages/editor/src/api/client.ts`, `src/state/store.ts`

**Interfaces:**
- Consumes: `Lock.lockedByName` (Task 1).
- Produces:
  - `LockEntry = { entityType: string; entityId: string; lockedBy: string; lockedByName: string }`
  - store: `locks: LockEntry[]`, `setLocks(l)`
  - `api.listLocks(): Promise<LockEntry[]>`, `api.listPresence(): Promise<PresenceEntry[]>`
  - `lockFor(locks, selection, myUserId): LockEntry | null`
  - `useCollaboration(api: Api): void`

- [ ] **Step 1: Write the failing pure test**

`packages/editor/src/collab/locks.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { lockFor } from "./locks";

const held = [
  { entityType: "room", entityId: "L1-a", lockedBy: "user_wei", lockedByName: "Wei" },
  { entityType: "room", entityId: "L1-b", lockedBy: "user_me", lockedByName: "Me" },
];

describe("lockFor", () => {
  it("finds who is holding the selected entity", () => {
    expect(lockFor(held, { type: "room", id: "L1-a" }, "user_me")?.lockedByName).toBe("Wei");
  });

  it("says nothing about a lock I hold myself", () => {
    // A badge on every row you touch is noise, not information.
    expect(lockFor(held, { type: "room", id: "L1-b" }, "user_me")).toBeNull();
  });

  it("says nothing when the entity is not held", () => {
    expect(lockFor(held, { type: "room", id: "L1-c" }, "user_me")).toBeNull();
  });

  it("says nothing when nothing is selected", () => {
    expect(lockFor(held, null, "user_me")).toBeNull();
  });

  it("matches on type as well as id, since ids are only unique per type", () => {
    expect(lockFor(held, { type: "placement", id: "L1-a" }, "user_me")).toBeNull();
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run packages/editor/src/collab`
Expected: FAIL — no such module.

- [ ] **Step 3: Implement the lookup**

`packages/editor/src/collab/locks.ts`:

```ts
import type { Selection } from "../state/store";

export type LockEntry = {
  entityType: string;
  entityId: string;
  lockedBy: string;
  lockedByName: string;
};

/**
 * Who is holding the selected entity, if it is not me.
 *
 * My own locks are deliberately invisible: I already know I am editing this,
 * and a badge on every row I touch would be noise rather than information.
 */
export function lockFor(
  locks: readonly LockEntry[],
  selection: Selection,
  myUserId: string | null,
): LockEntry | null {
  if (!selection) return null;
  return locks.find(
    l => l.entityType === selection.type && l.entityId === selection.id && l.lockedBy !== myUserId,
  ) ?? null;
}
```

- [ ] **Step 4: Store and client**

In `packages/editor/src/state/store.ts` add `locks: LockEntry[]` to the state, `setLocks: (l: LockEntry[]) => void`, `locks: []` to `initial`, and `setLocks: locks => set({ locks })`.

In `packages/editor/src/api/client.ts`, beside the existing lock calls:

```ts
    listLocks: async () =>
      (await request<{ locks: LockEntry[] }>("/api/locks")).locks,

    listPresence: async () =>
      (await request<{ presence: PresenceEntry[] }>("/api/presence")).presence,
```

- [ ] **Step 5: Write the failing hook test**

`packages/editor/src/collab/useCollaboration.test.tsx`:

```tsx
import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useEditorStore } from "../state/store";
import { useCollaboration } from "./useCollaboration";

function fakeApi(overrides: Record<string, unknown> = {}) {
  return {
    heartbeat: vi.fn().mockResolvedValue(undefined),
    listPresence: vi.fn().mockResolvedValue([
      { userId: "user_wei", displayName: "Wei", levelId: "oth-L1" },
    ]),
    listLocks: vi.fn().mockResolvedValue([
      { entityType: "room", entityId: "L1-a", lockedBy: "user_wei", lockedByName: "Wei" },
    ]),
    acquireLock: vi.fn().mockResolvedValue({}),
    releaseLock: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function Probe({ api }: { api: never }) {
  useCollaboration(api);
  return null;
}

beforeEach(() => {
  useEditorStore.getState().reset();
});

describe("useCollaboration", () => {
  it("reports where I am, so others see which floor I am on", async () => {
    const api = fakeApi();
    useEditorStore.getState().setActiveLevel("oth-L3");
    render(<Probe api={api as never} />);
    await waitFor(() => expect(api.heartbeat).toHaveBeenCalledWith("oth-L3"));
  });

  it("puts presence and locks in the store", async () => {
    render(<Probe api={fakeApi() as never} />);
    await waitFor(() => expect(useEditorStore.getState().presence).toHaveLength(1));
    expect(useEditorStore.getState().locks).toHaveLength(1);
  });

  it("claims the entity I select, so others are warned early", async () => {
    const api = fakeApi();
    render(<Probe api={api as never} />);
    useEditorStore.getState().select({ type: "room", id: "L1-x" });
    await waitFor(() => expect(api.acquireLock).toHaveBeenCalledWith("room", "L1-x"));
  });

  it("releases it when I select something else", async () => {
    const api = fakeApi();
    render(<Probe api={api as never} />);
    useEditorStore.getState().select({ type: "room", id: "L1-x" });
    await waitFor(() => expect(api.acquireLock).toHaveBeenCalled());
    useEditorStore.getState().select({ type: "room", id: "L1-y" });
    await waitFor(() => expect(api.releaseLock).toHaveBeenCalledWith("room", "L1-x"));
  });

  it("carries on when the claim is refused, since a lock only warns", async () => {
    const api = fakeApi({ acquireLock: vi.fn().mockRejectedValue(new Error("423")) });
    render(<Probe api={api as never} />);
    useEditorStore.getState().select({ type: "room", id: "L1-x" });
    // The poll still runs and nothing throws into React.
    await waitFor(() => expect(useEditorStore.getState().locks).toHaveLength(1));
  });

  it("does not claim anything when nothing is selected", async () => {
    const api = fakeApi();
    render(<Probe api={api as never} />);
    await waitFor(() => expect(api.listLocks).toHaveBeenCalled());
    expect(api.acquireLock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 6: Implement the hook**

`packages/editor/src/collab/useCollaboration.ts`:

```ts
import { useEffect } from "react";
import type { Api } from "../api/client";
import { useEditorStore } from "../state/store";

/** Well inside the server's 30 s presence TTL and 300 s lock TTL. */
const POLL_MS = 5_000;

/**
 * Everything the editor does to stay aware of other people, on one timer.
 *
 * The server also offers an SSE presence stream. This polls instead: a
 * heartbeat timer has to exist regardless, and one timer that also fetches
 * presence and locks is a single code path rather than two — testable in jsdom,
 * which has no EventSource. Five seconds of staleness is invisible for a team
 * of four.
 */
export function useCollaboration(api: Api): void {
  const activeLevelId = useEditorStore(s => s.activeLevelId);
  const selection = useEditorStore(s => s.selection);
  const setPresence = useEditorStore(s => s.setPresence);
  const setLocks = useEditorStore(s => s.setLocks);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        await api.heartbeat(activeLevelId);
        const [presence, locks] = await Promise.all([api.listPresence(), api.listLocks()]);
        if (cancelled) return;
        setPresence(presence);
        setLocks(locks);
      } catch {
        // Awareness is a nicety. A blip must never surface as an error to
        // someone who is mid-edit.
      }
    }

    void poll();
    const timer = setInterval(() => void poll(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [api, activeLevelId, setPresence, setLocks]);

  useEffect(() => {
    if (!selection) return;
    const { type, id } = selection;
    // Refused is fine: the lock only warns, and the poll will show who holds it.
    void api.acquireLock(type, id).catch(() => {});
    return () => {
      void api.releaseLock(type, id).catch(() => {});
    };
  }, [api, selection]);
}
```

- [ ] **Step 7: Run and commit**

```bash
npx vitest run packages/editor
npm run typecheck
git add packages/editor/src/collab packages/editor/src/api/client.ts packages/editor/src/state/store.ts
git commit -m "feat(editor): one timer for presence, locks and the heartbeat"
```

---

## Task 3: Showing who is here

**Files:**
- Create: `packages/editor/src/panels/PresenceBar.tsx`, `src/panels/PresenceBar.test.tsx`
- Modify: `packages/editor/src/App.tsx`

**Interfaces:**
- Consumes: `store.presence`, `store.user`.
- Produces: `PresenceBar` — no props.

- [ ] **Step 1: Write the failing test**

`packages/editor/src/panels/PresenceBar.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useEditorStore } from "../state/store";
import { PresenceBar } from "./PresenceBar";

const me = { id: "user_me", email: "me@example.com", displayName: "Stef" };

beforeEach(() => {
  useEditorStore.getState().reset();
  useEditorStore.getState().setUser(me);
  useEditorStore.getState().setModel(model);   // two levels, oth-L1 and oth-L2
});

describe("PresenceBar", () => {
  it("shows nothing when I am the only one here", () => {
    useEditorStore.getState().setPresence([
      { userId: "user_me", displayName: "Stef", levelId: "oth-L1" },
    ]);
    const { container } = render(<PresenceBar />);
    // A chip saying "just you" is noise; silence is the right answer.
    expect(container.textContent).toBe("");
  });

  it("names everyone else who is here", () => {
    useEditorStore.getState().setPresence([
      { userId: "user_me", displayName: "Stef", levelId: "oth-L1" },
      { userId: "user_wei", displayName: "Wei", levelId: "oth-L2" },
    ]);
    render(<PresenceBar />);
    expect(screen.getByText(/Wei/)).toBeTruthy();
    expect(screen.queryByText(/Stef/)).toBeNull();
  });

  it("says which floor they are on, by its code not its id", () => {
    useEditorStore.getState().setPresence([
      { userId: "user_wei", displayName: "Wei", levelId: "oth-L2" },
    ]);
    render(<PresenceBar />);
    expect(screen.getByTestId("presence-user_wei").textContent).toContain("L2");
  });

  it("copes with someone on no level yet", () => {
    useEditorStore.getState().setPresence([
      { userId: "user_wei", displayName: "Wei", levelId: null },
    ]);
    render(<PresenceBar />);
    expect(screen.getByTestId("presence-user_wei")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run packages/editor/src/panels/PresenceBar.test.tsx`
Expected: FAIL — no such module.

- [ ] **Step 3: Implement it**

`packages/editor/src/panels/PresenceBar.tsx`:

```tsx
import { useEditorStore } from "../state/store";

/**
 * Who else is in the editor and which floor they are on.
 *
 * Silent when you are alone: a chip reading "just you" is noise, and the point
 * of this strip is to catch your eye only when it means something.
 */
export function PresenceBar() {
  const presence = useEditorStore(s => s.presence);
  const model = useEditorStore(s => s.model);
  const me = useEditorStore(s => s.user);

  const others = presence.filter(p => p.userId !== me?.id);
  if (others.length === 0) return null;

  const levelCode = (levelId: string | null) =>
    levelId ? model?.levels.find(l => l.id === levelId)?.code ?? levelId : "—";

  return (
    <div className="flex items-center gap-1 text-xs">
      {others.map(p => (
        <span
          key={p.userId}
          data-testid={`presence-${p.userId}`}
          className="rounded-full bg-stone-200 px-2 py-0.5"
          title={`${p.displayName} is on ${levelCode(p.levelId)}`}
        >
          {p.displayName} · {levelCode(p.levelId)}
        </span>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Wire it and run**

In `App.tsx`, call `useCollaboration(api)` beside the other hooks, and put
`<PresenceBar />` in the header after `<LevelTabs />`, inside a `flex-1` spacer
so it sits to the right.

```bash
npx vitest run packages/editor
npm run typecheck
git add packages/editor/src/panels/PresenceBar.tsx packages/editor/src/panels/PresenceBar.test.tsx packages/editor/src/App.tsx
git commit -m "feat(editor): show who else is here and which floor they are on"
```

---

## Task 4: Showing what is held

**Files:**
- Create: `packages/editor/src/panels/LockBanner.tsx`, `src/panels/LockBanner.test.tsx`
- Modify: `packages/editor/src/panels/LayersPanel.tsx`, `src/panels/LayersPanel.test.tsx`, `src/App.tsx`

**Interfaces:**
- Consumes: `lockFor` (Task 2), `store.locks`, `store.user`.
- Produces: `LockBanner` — no props.

- [ ] **Step 1: Write the failing tests**

`packages/editor/src/panels/LockBanner.test.tsx`:

```tsx
describe("LockBanner", () => {
  it("says nothing when what I selected is free", () => {
    useEditorStore.getState().select({ type: "room", id: "L1-free" });
    const { container } = render(<LockBanner />);
    expect(container.textContent).toBe("");
  });

  it("names who is in the entity I just selected", () => {
    useEditorStore.getState().setLocks([
      { entityType: "room", entityId: "L1-a", lockedBy: "user_wei", lockedByName: "Wei" },
    ]);
    useEditorStore.getState().select({ type: "room", id: "L1-a" });
    render(<LockBanner />);
    expect(screen.getByRole("status").textContent).toContain("Wei");
  });

  it("says the edit is still allowed, because the lock only warns", () => {
    useEditorStore.getState().setLocks([
      { entityType: "room", entityId: "L1-a", lockedBy: "user_wei", lockedByName: "Wei" },
    ]);
    useEditorStore.getState().select({ type: "room", id: "L1-a" });
    render(<LockBanner />);
    expect(screen.getByRole("status").textContent).toMatch(/can still edit/i);
  });

  it("says nothing about a lock I hold myself", () => {
    useEditorStore.getState().setLocks([
      { entityType: "room", entityId: "L1-a", lockedBy: "user_me", lockedByName: "Stef" },
    ]);
    useEditorStore.getState().select({ type: "room", id: "L1-a" });
    const { container } = render(<LockBanner />);
    expect(container.textContent).toBe("");
  });
});
```

Append to `packages/editor/src/panels/LayersPanel.test.tsx`:

```tsx
  it("marks a row someone else is holding", () => {
    useEditorStore.getState().setUser({ id: "user_me", email: "m@e.com", displayName: "Me" });
    useEditorStore.getState().setLocks([
      { entityType: "room", entityId: "L1-lobby", lockedBy: "user_wei", lockedByName: "Wei" },
    ]);
    setup();
    expect(screen.getByTestId("layer-L1-lobby").textContent).toContain("Wei");
  });

  it("does not mark a row I am holding myself", () => {
    useEditorStore.getState().setUser({ id: "user_me", email: "m@e.com", displayName: "Me" });
    useEditorStore.getState().setLocks([
      { entityType: "room", entityId: "L1-lobby", lockedBy: "user_me", lockedByName: "Me" },
    ]);
    setup();
    expect(screen.getByTestId("layer-L1-lobby").textContent).not.toContain("🔒");
  });
```

- [ ] **Step 2: Run and watch them fail**

Run: `npx vitest run packages/editor/src/panels`
Expected: FAIL — no `LockBanner`, no lock marker in the layers row.

- [ ] **Step 3: Implement the banner**

`packages/editor/src/panels/LockBanner.tsx`:

```tsx
import { lockFor } from "../collab/locks";
import { useEditorStore } from "../state/store";

/**
 * Warns that someone else is in the thing you just selected — and says plainly
 * that you may edit it anyway.
 *
 * The lock is advisory. `version` is what actually prevents a lost update, and
 * if you both save you get the conflict banner. Pretending otherwise would let
 * a closed laptop strand a room for five minutes.
 */
export function LockBanner() {
  const locks = useEditorStore(s => s.locks);
  const selection = useEditorStore(s => s.selection);
  const me = useEditorStore(s => s.user);

  const held = lockFor(locks, selection, me?.id ?? null);
  if (!held) return null;

  return (
    <div role="status" className="border-b bg-amber-50 px-3 py-2 text-xs text-amber-900">
      🔒 {held.lockedByName} is editing this. You can still edit it — you will be
      warned if you both save.
    </div>
  );
}
```

- [ ] **Step 4: Mark the layer rows**

In `LayersPanel.tsx`, read the locks and the current user, then per item:

```tsx
  const locks = useEditorStore(s => s.locks);
  const me = useEditorStore(s => s.user);
```

```tsx
                const heldBy = lockFor(locks, { type: layerEntityType(item.type), id: item.id }, me?.id ?? null);
```

and inside the row, after the label button:

```tsx
                    {heldBy && (
                      <span className="shrink-0 text-xs" title={`${heldBy.lockedByName} is editing this`}>
                        🔒 {heldBy.lockedByName}
                      </span>
                    )}
```

- [ ] **Step 5: Wire the banner**

In `App.tsx`, put `<LockBanner />` directly above `<ConflictBanner />` — the
advisory warning sits above the one that means a save actually failed.

- [ ] **Step 6: Run everything and commit**

```bash
npm test
npm run typecheck
npm run build
git add packages/editor/src
git commit -m "feat(editor): show who is holding what, without ever blocking an edit"
```

---

## Done criteria

- `npm test` green, `npm run typecheck` clean, editor builds.
- Two browsers signed in as different people see each other in the header within five seconds, with the right floor.
- Selecting an entity claims it; selecting another releases the first.
- The second person to select the same room sees a named warning and can still edit and save it.
- Nobody ever sees their own lock reflected back at them.
- A lock held by a user who has been deleted still lists, showing the raw id rather than crashing.

## Self-review

**Coverage.** §10 of the map-model spec asks for presence plus per-entity locking as the alternative to CRDT co-editing. Server was already built; Tasks 2–4 are the client half, and Task 1 closes the one gap that would have shown a raw user id in the UI.

**Placeholders.** Task 3's test references a `model` fixture with two levels that the implementer must define at the top of the file, following `LayersPanel.test.tsx`. Task 4's test file needs the same `beforeEach` setup as the other panel tests.

**Type consistency.** `LockEntry` is defined in `collab/locks.ts` and imported by the store, the API client, `LockBanner` and `LayersPanel`. `lockFor` takes `Selection`, so `LayersPanel` maps its `LayerEntityType` through `layerEntityType` first — the same narrowing already used for saving.
