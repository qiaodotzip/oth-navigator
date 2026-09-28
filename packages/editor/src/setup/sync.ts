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
