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
