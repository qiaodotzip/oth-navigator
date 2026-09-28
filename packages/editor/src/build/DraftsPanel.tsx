import type { RoomDraft, RoomKind } from "@oth/model";
import { useEffect, useRef, useState } from "react";
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
  const tool = useEditorStore(s => s.tool);
  const view = useDraftView(levelId);
  const selectedId = useDrafts(s => s.selectedId);
  const showCovered = useDrafts(s => s.showCovered);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<RoomKind>("room");
  const [busy, setBusy] = useState(false);
  // The state is for the buttons; this is for a key pressed again before they re-render.
  const deciding = useRef(false);

  const shown = showCovered ? [...view.review, ...view.covered.map(c => c.draft)] : view.review;
  const selected = shown.find(d => d.id === selectedId) ?? null;
  const coveredIds = new Set(view.covered.map(c => c.draft.id));

  // A new draft in hand starts from its own name and kind. Keyed on its id
  // alone: a reload that brings back the same draft keeps a name being typed.
  useEffect(() => {
    if (selected) {
      setName(selected.nameEn);
      setKind(selected.kind);
    }
  }, [selected?.id]);
  // One thing is selected at a time: a room or pathway picked on the plan lets go of the draft.
  useEffect(() => {
    if (mapSelection) useDrafts.getState().select(null);
  }, [mapSelection]);
  // So does a drawing tool, Draw by hand's included: while you draw, A and R
  // pick Build's tools again, and never decide a draft you have put down.
  useEffect(() => {
    if (tool !== "select") useDrafts.getState().select(null);
  }, [tool]);

  const ctx: ReviewContext | null = levelId ? { api, saver, levelId } : null;

  function take(d: RoomDraft | null) {
    if (d) {
      // A draft taken up lets go of the room or pathway, as clicking one on
      // the plan does, and is reviewed with Select, as drafts are clicked with it.
      const s = useEditorStore.getState();
      s.select(null);
      if (s.tool !== "select") s.setTool("select");
    }
    useDrafts.getState().select(d?.id ?? null);
    if (d) useDrafts.getState().frameBox(draftBox(d));
  }

  /** The draft to take up after a decision, if the reload since still has it. */
  function takeIfStill(d: RoomDraft | null) {
    const now = levelId ? useDrafts.getState().byLevel[levelId] ?? [] : [];
    take(d && now.some(x => x.id === d.id) ? d : null);
  }

  async function decide(run: () => Promise<unknown>) {
    if (deciding.current) return;
    deciding.current = true;
    setBusy(true);
    try {
      await run();
    } finally {
      deciding.current = false;
      setBusy(false);
    }
  }

  const accept = () => {
    if (!selected || !ctx || !name.trim()) return;
    const after = nextDraft(shown, selected.id);
    void decide(async () => {
      if (await acceptDrafts(ctx, [{ draft: selected, nameEn: name.trim(), kind }])) takeIfStill(after);
    });
  };
  const reject = () => {
    if (!selected || !ctx) return;
    const after = nextDraft(shown, selected.id);
    void decide(async () => {
      if (await rejectDraft(ctx, selected)) takeIfStill(after);
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
    // Draw area lets go of the draft in hand too (the effect above).
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
