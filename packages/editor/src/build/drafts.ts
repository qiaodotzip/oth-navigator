import { bboxOfRing, live, pointInPolygon, type BBox, type MapModel, type Room, type RoomDraft } from "@oth/model";
import { useEffect } from "react";
import { create } from "zustand";
import type { Api } from "../api/client";
import { useEditorStore } from "../state/store";
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
  setDrafts: (levelId, drafts) => {
    change(levelId);
    set(s => {
      // A draft in hand that this floor's new list no longer has is let go; one on another floor is not.
      const wasHere = (s.byLevel[levelId] ?? []).some(d => d.id === s.selectedId);
      const stillHere = drafts.some(d => d.id === s.selectedId);
      return { byLevel: { ...s.byLevel, [levelId]: drafts }, selectedId: wasHere && !stillHere ? null : s.selectedId };
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
    const drafts = await api.listRoomDrafts(levelId);
    if (latest()) useDrafts.getState().setDrafts(levelId, drafts);
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
