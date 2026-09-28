import type { RoomDraft, RoomKind } from "@oth/model";
import { useEffect, useRef, useState } from "react";
import type { Api, RoomDraftRow, TeamMember } from "../api/client";
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

/** "Set aside by Stef Chan's Claude: <its reason>", for a draft Claude left for a person; null for any other. */
function setAsideWords(d: RoomDraftRow, team: readonly TeamMember[]): string | null {
  if (!d.setAside) return null;
  const who = team.find(m => m.id === d.setAside!.by)?.displayName;
  return `Set aside by ${who ? `${who}'s` : "a teammate's"} Claude: ${d.setAside.reason}`;
}

/**
 * Each open space's name for its buttons. The drawing can print one name
 * twice (two plazas), and two buttons both called "Plaza" can't be told
 * apart by ear, so a repeated name is counted: "Plaza (1 of 2)".
 */
function openSpaceNames(open: readonly RoomDraft[]): Map<string, string> {
  const total = new Map<string, number>();
  for (const d of open) total.set(d.nameEn, (total.get(d.nameEn) ?? 0) + 1);
  const seen = new Map<string, number>();
  return new Map(open.map(d => {
    const of = total.get(d.nameEn)!;
    const n = (seen.get(d.nameEn) ?? 0) + 1;
    seen.set(d.nameEn, n);
    return [d.id, of > 1 ? `${d.nameEn} (${n} of ${of})` : d.nameEn];
  }));
}

/**
 * The review of a floor's drafts, beside Find rooms in the drawing (spec §5.2
 * step 7). The draft in hand shows its name to correct, its kind and its
 * area. Accept, Reject and Skip each take up the next draft, and the plan
 * frames it. Accept all takes every draft still to review, but never one
 * already on the map: those are accepted one at a time, knowingly.
 *
 * "Next" is the list's own order: largest first, as the server sends the
 * drafts, with those already on the map after the rest when they are shown.
 * After the last it goes round to the first, so Skip never runs out.
 *
 * One decision at a time: while an accept, reject or Done is on its way,
 * the buttons are off and the keys, Skip's included, do nothing. Skip there
 * would move the draft in hand, and the decision would then take up the one
 * after the draft it decided, not after the one you skipped to.
 *
 * A draft Claude set aside for a person waits with the rest, counted among
 * those to review, and says whose Claude set it aside and why. Accept all
 * leaves those out: like one already on the map, each is decided knowingly.
 */
export function DraftsPanel({ api, saver }: { api: Api; saver: Saver }) {
  const levelId = useEditorStore(s => s.activeLevelId);
  const mapSelection = useEditorStore(s => s.selection);
  const tool = useEditorStore(s => s.tool);
  const team = useEditorStore(s => s.team);
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
  const setAside = view.review.filter(d => d.setAside).length;
  // What Accept all takes: every draft to review but those Claude set aside for a person.
  const free = view.review.filter(d => !d.setAside);

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
    if (selected && !deciding.current) take(nextDraft(shown, selected.id));
  };
  const acceptAll = () => {
    if (!ctx) return;
    // The draft in hand goes with its corrections; the rest as they were found.
    const decisions = free.map(d => (d.id === selected?.id && name.trim()
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
  /** An open space drawn, or not wanted: off the list, with Undo. */
  const doneWith = (d: RoomDraft) => {
    if (!ctx) return;
    void decide(() => rejectDraft(ctx, d, { done: `Took ${d.nameEn} off the list`, undone: `${d.nameEn} is back on the list` }));
  };

  useDraftKeys(selected ? { accept, reject, skip } : null);

  if (!levelId || view.review.length + view.covered.length + view.open.length === 0) return null;
  const openNames = openSpaceNames(view.open);

  return (
    <section aria-label="Drafts from the drawing" className="space-y-2">
      <p className="text-xs text-stone-700">
        <span className="font-medium">{`${plural(view.review.length, "draft", "drafts")} to review`}</span>
        {setAside > 0 && ` · ${setAside} set aside by Claude`}
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
          {selected.setAside && <p className="text-xs text-yours">{setAsideWords(selected, team)}</p>}
          <div className="flex flex-wrap gap-1">
            <Button size="sm" variant="primary" disabled={busy || !name.trim()} onClick={accept}>Accept <Kbd>A</Kbd></Button>
            <Button size="sm" disabled={busy} onClick={reject}>Reject <Kbd>R</Kbd></Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={skip}>Skip <Kbd>S</Kbd></Button>
          </div>
        </div>
      ) : shown.length > 0 ? (
        <Button size="sm" onClick={() => take(shown[0]!)}>Review the drafts</Button>
      ) : null}
      {free.length > 1 && (
        <Button size="sm" disabled={busy} onClick={acceptAll}>
          {setAside > 0 ? `Accept all ${free.length} not set aside` : `Accept all ${free.length} to review`}
        </Button>
      )}
      {view.open.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-stone-700">{`Draw by hand (${view.open.length})`}</h3>
          <p className="text-xs text-stone-600">The drawing leaves these open, so they have no shape to add.</p>
          <ul className="mt-1 space-y-1">
            {view.open.map(d => {
              const label = openNames.get(d.id) ?? d.nameEn;
              const aside = setAsideWords(d, team);
              return (
                <li key={d.id}>
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="ghost" onClick={() => drawByHand(d)}>{label}</Button>
                    <Button size="sm" variant="ghost" aria-label={`Done with ${label}`} disabled={busy} onClick={() => doneWith(d)}>
                      Done
                    </Button>
                  </div>
                  {aside && <p className="pl-2.5 text-xs text-yours">{aside}</p>}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
