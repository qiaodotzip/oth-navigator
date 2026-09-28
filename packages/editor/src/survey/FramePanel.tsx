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
                  // The same name as the × on the frame: one action, one name.
                  aria-label={`Remove tag ${label.place.nameEn} from this frame`}
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
                {p.status === "proposed" && (
                  // Ruling 13: the proposed blue as 13 px text on white is only
                  // 4.1:1, so the word sits on the soft fill in dark text.
                  <span className="rounded border border-proposed bg-proposed-soft px-1 text-xs text-stone-900">proposed</span>
                )}
                <span className="text-xs text-stone-500">×{counts.get(p.id) ?? 0}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </aside>
  );
}
