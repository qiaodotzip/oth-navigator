import { useState } from "react";
import type { ProposedPlace } from "../survey/review";
import { Button } from "../ui/Button";

/**
 * Every proposal on the floor at once (spec §10): filter by name, jump to one,
 * or tick several that need no correction and accept them together. What
 * needs a closer look is still decided one at a time, from its frame.
 *
 * `decided` is what the workspace has decided, or is still deciding, and has
 * not yet seen reloaded. It is left out, so nothing can be ticked and decided
 * a second time.
 */
export function ProposalDrawer({ queue, decided, currentId, onJump, onAcceptMany, onClose }: {
  queue: readonly ProposedPlace[];
  decided: ReadonlySet<string>;
  currentId: string | null;
  onJump: (placeId: string) => void;
  onAcceptMany: (entries: ProposedPlace[]) => Promise<void>;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [ticked, setTicked] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const open = queue.filter(({ place }) => !decided.has(place.id));
  const q = query.trim().toLowerCase();
  const shown = q === ""
    ? open
    : open.filter(({ place }) => place.nameEn.toLowerCase().includes(q) || place.nameZh.toLowerCase().includes(q));
  // A tick on something decided meanwhile, here or by a teammate, counts for nothing.
  const chosen = open.filter(({ place }) => ticked.has(place.id));
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
      // Only the ones sent: a tick made while they were being accepted stays.
      toggle(chosen.map(({ place }) => place.id), false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside aria-label="Proposals" className="flex w-80 shrink-0 flex-col border-l border-stone-200 bg-white">
      <div className="flex items-center border-b border-stone-200 px-3 py-2">
        <h2 className="text-sm font-semibold">Proposals ({open.length})</h2>
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
          // As in the name field: Esc steps out to the keys, and a second Esc closes the list.
          onKeyDown={event => { if (event.key === "Escape") event.currentTarget.blur(); }}
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
              className={`min-w-0 flex-1 text-left text-sm ${place.id === currentId ? "font-semibold text-accent" : ""}`}
              onClick={() => onJump(place.id)}
            >
              <span className="block truncate">{place.nameEn}</span>
              <span className="block text-xs font-normal text-stone-500">
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
