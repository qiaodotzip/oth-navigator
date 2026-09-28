import { bboxOfRing, draftMatch, live, type BBox, type Room, type RoomDraft } from "@oth/model";
import { useEffect } from "react";
import { create } from "zustand";
import type { Api, LineUp, RoomDraftRow } from "../api/client";
import { draftNameSpot, type DraftShape } from "../plan/DraftLayer";
import { useEditorStore } from "../state/store";
import { reportFailure } from "../ui/failure";

type DraftsState = {
  /** Each floor's drafts waiting for review, as the server last gave them, Claude's set-aside marks and all. */
  byLevel: Readonly<Record<string, RoomDraftRow[]>>;
  /**
   * Each floor's line-up warning, from its drafts' last load (contract v3):
   * how far the plan sits from the rooms already there. Undefined once none
   * is known — cleared by every load, since a stale one would be wrong.
   */
  lineUpByLevel: Readonly<Record<string, LineUp | undefined>>;
  /** The draft in hand. Part B's own, so the map's selection (state/store.ts) is left alone. */
  selectedId: string | null;
  /** Whether drafts already on the map are drawn too. */
  showCovered: boolean;
  /** What the finder is doing while it runs; null when it is not. */
  finding: string | null;
  /** A request to frame part of the plan. `seq` makes the same box asked twice two requests. */
  frame: { box: BBox; seq: number } | null;
  setDrafts: (levelId: string, drafts: RoomDraftRow[], lineUp?: LineUp) => void;
  select: (id: string | null) => void;
  setShowCovered: (on: boolean) => void;
  setFinding: (words: string | null) => void;
  frameBox: (box: BBox) => void;
  reset: () => void;
};

const initial = { byLevel: {}, lineUpByLevel: {}, selectedId: null, showCovered: false, finding: null, frame: null };

/**
 * Each floor's count of what has changed its drafts, a load's start included.
 * A load keeps what it read only if nothing has since: a GET that answers
 * after a search's save, or after a newer GET, would bring back drafts they replaced.
 */
const changes = new Map<string, number>();
function change(levelId: string): number {
  const n = (changes.get(levelId) ?? 0) + 1;
  changes.set(levelId, n);
  return n;
}

export const useDrafts = create<DraftsState>(set => ({
  ...initial,
  setDrafts: (levelId, drafts, lineUp) => {
    change(levelId);
    set(s => {
      // A draft in hand that this floor's new list no longer has is let go; one on another floor is not.
      const wasHere = (s.byLevel[levelId] ?? []).some(d => d.id === s.selectedId);
      const stillHere = drafts.some(d => d.id === s.selectedId);
      return {
        byLevel: { ...s.byLevel, [levelId]: drafts },
        lineUpByLevel: { ...s.lineUpByLevel, [levelId]: lineUp },
        selectedId: wasHere && !stillHere ? null : s.selectedId,
      };
    });
  },
  select: id => set({ selectedId: id }),
  setShowCovered: on => set({ showCovered: on }),
  setFinding: words => set({ finding: words }),
  frameBox: box => set(s => ({ frame: { box, seq: (s.frame?.seq ?? 0) + 1 } })),
  reset: () => set(initial),
}));

/**
 * A floor's drafts from the server. True when they came. When the floor's
 * drafts changed while they were on their way, the newer ones stand, and a
 * failure is not reported: there is nothing to retry for.
 */
export async function loadDrafts(api: Pick<Api, "listRoomDrafts">, levelId: string): Promise<boolean> {
  const mine = change(levelId);
  const latest = () => changes.get(levelId) === mine;
  try {
    const { drafts, lineUp } = await api.listRoomDrafts(levelId);
    if (latest()) useDrafts.getState().setDrafts(levelId, drafts, lineUp);
    return true;
  } catch (err) {
    if (latest()) reportFailure(err, { doing: "load the drafts from the drawing", retry: () => loadDrafts(api, levelId).then(() => {}) });
    return false;
  }
}

/** Keeps the open floor's drafts loaded, for its to-do count and its Areas & rooms step. */
export function useRoomDrafts(api: Pick<Api, "listRoomDrafts">, levelId: string | null): void {
  useEffect(() => {
    if (levelId) void loadDrafts(api, levelId);
  }, [api, levelId]);
}

/**
 * A floor's line-up warning, from its drafts' last load (contract v3):
 * undefined while it hasn't loaded, or once the server finds nothing worth
 * one. The Floorplan step, the rooms Claude step and Build's drafts review
 * all read the same value, so they never disagree.
 */
export function useLineUp(levelId: string | null): LineUp | undefined {
  return useDrafts(s => (levelId ? s.lineUpByLevel[levelId] : undefined));
}

export type DraftView = {
  review: RoomDraftRow[];
  covered: { draft: RoomDraftRow; roomId: string }[];
  /** Spaces the drawing leaves open: drawn by hand at their names. */
  open: RoomDraftRow[];
  /** How each draft with an outline is drawn, by id: worked out here, once per sort, not on every frame. */
  shapes: ReadonlyMap<string, DraftShape>;
};

/**
 * A floor's drafts, sorted for review (spec §5.2 step 6). A draft is under
 * "already on the map" when it and a room there are mostly each other: it
 * covers more than half of the room, and the room more than half of it. One
 * way alone would hide a new hall built round a riser, since the hall covers
 * all of the riser. A column is measured against columns only, so a hall is
 * never taken for a column standing in it.
 *
 * A draft Claude set aside is a person's to decide, so it is always to
 * review, even when it is already on the map: hidden there, the person it
 * was left for would never see it.
 */
export function draftView(drafts: readonly RoomDraftRow[], rooms: readonly Room[]): DraftView {
  const shapes = new Map<string, DraftShape>();
  const view: DraftView = { review: [], covered: [], open: [], shapes };
  for (const d of drafts) {
    if (!d.footprint) {
      view.open.push(d);
      continue;
    }
    const { copyOf, overRooms } = draftMatch(d, rooms);
    shapes.set(d.id, { ...draftNameSpot(d), overRooms });
    if (copyOf && !d.setAside) view.covered.push({ draft: d, roomId: copyOf.id });
    else view.review.push(d);
  }
  return view;
}

const NO_DRAFTS: readonly RoomDraftRow[] = [];
let lastView: { drafts: readonly RoomDraftRow[] | undefined; rooms: string; levelId: string | null; view: DraftView } | null = null;

/**
 * The open floor's drafts, sorted. One answer, shared by the plan, the review
 * and the to-do count, until the drafts or the floor's rooms change: the sort
 * samples every room a draft touches, so it is done once, not three times a
 * render. Keyed on the rooms' ids and versions rather than the model, since
 * every save reloads the whole model, and a pathway or a place saved leaves
 * the sort as it was.
 */
export function useDraftView(levelId: string | null): DraftView {
  const drafts = useDrafts(s => (levelId ? s.byLevel[levelId] : undefined));
  const model = useEditorStore(s => s.model);
  const rooms = model && levelId ? live(model.rooms).filter(r => r.levelId === levelId) : [];
  const roomsKey = rooms.map(r => `${r.id}@${r.version}`).join(" ");
  if (!lastView || lastView.drafts !== drafts || lastView.rooms !== roomsKey || lastView.levelId !== levelId) {
    lastView = { drafts, rooms: roomsKey, levelId, view: draftView(drafts ?? NO_DRAFTS, rooms) };
  }
  return lastView.view;
}

/** `b`, grown by `m` metres on every side: the one padding rule, so every framed box reads the same. */
export function padBox(b: BBox, m: number): BBox {
  return { minX: b.minX - m, minY: b.minY - m, maxX: b.maxX + m, maxY: b.maxY + m };
}

/** The part of the plan to show for a draft: its shape with 4 m round it, or 15 m round an open space's name. */
export function draftBox(d: Pick<RoomDraft, "footprint" | "labelPoint">): BBox {
  if (d.footprint) return padBox(bboxOfRing(d.footprint), 4);
  const [x, y] = d.labelPoint;
  return padBox({ minX: x, minY: y, maxX: x, maxY: y }, 15);
}
