import { TenantCategorySchema } from "@oth/model";
import { useState } from "react";
import type { Api } from "../api/client";
import type { Saver } from "../state/save";
import { useEditorStore } from "../state/store";
import { proposedPlaces, reviewProgress } from "./review";

/**
 * The queue of what a labelling agent claimed, waiting on a person.
 *
 * Nothing an agent writes counts until it is accepted here, so this is the
 * whole safeguard: the agent reads a sign and is sometimes wrong, and the frame
 * it read is shown beside its claim so the judgement takes a glance rather than
 * a database query.
 */
export function ReviewPanel({ api, saver }: { api: Api; saver: Saver }) {
  const model = useEditorStore(s => s.model);
  const [busy, setBusy] = useState<string | null>(null);

  const queue = proposedPlaces(model);
  const { proposed, confirmed } = reviewProgress(model);

  async function accept(placeId: string, nameEn: string, category: string) {
    const entry = queue.find(q => q.place.id === placeId);
    if (!entry) return;
    setBusy(placeId);
    await saver.update("place", placeId, entry.place.version, {
      status: "confirmed", nameEn, category,
    });
    // The sightings are confirmed with it: they are the same claim, and leaving
    // them proposed would put the place back in the queue forever.
    for (const s of entry.sightings) {
      await saver.update("sighting", s.id, s.version, { status: "confirmed" });
    }
    setBusy(null);
  }

  async function reject(placeId: string) {
    const entry = queue.find(q => q.place.id === placeId);
    if (!entry) return;
    setBusy(placeId);
    for (const s of entry.sightings) await saver.remove("sighting", s.id, s.version);
    await saver.remove("place", placeId, entry.place.version);
    setBusy(null);
  }

  if (proposed === 0) {
    return (
      <p className="p-3 text-xs text-stone-500">
        {confirmed > 0
          ? `Nothing waiting. ${confirmed} place${confirmed === 1 ? "" : "s"} confirmed.`
          : "Nothing proposed yet. Label a capture and import it to fill this queue."}
      </p>
    );
  }

  return (
    <div className="space-y-3 p-2">
      <p className="px-1 text-xs text-stone-500">
        {proposed} waiting, {confirmed} confirmed. Nothing here is part of the map until you accept it.
      </p>

      {queue.map(({ place, sightings }) => (
        <ReviewCard
          key={place.id}
          api={api}
          place={place}
          frameIds={sightings.map(s => s.keyframeId)}
          busy={busy === place.id}
          onAccept={(name, category) => void accept(place.id, name, category)}
          onReject={() => void reject(place.id)}
        />
      ))}
    </div>
  );
}

function ReviewCard({
  api, place, frameIds, busy, onAccept, onReject,
}: {
  api: Api;
  place: { id: string; nameEn: string; category: string; levelId?: string; notes: string; proposedBy: string };
  frameIds: string[];
  busy: boolean;
  onAccept: (nameEn: string, category: string) => void;
  onReject: () => void;
}) {
  const [name, setName] = useState(place.nameEn);
  const [category, setCategory] = useState(place.category);

  return (
    <div data-testid={`review-${place.id}`} className="rounded border bg-white p-2">
      <div className="flex gap-1 overflow-x-auto pb-2">
        {/* The evidence, first: the claim is only as good as the frame it came from. */}
        {frameIds.slice(0, 6).map(id => (
          <img
            key={id}
            src={api.keyframeFileUrl(id, 320)}
            loading="lazy"
            decoding="async"
            alt={`frame ${id}`}
            className="h-16 shrink-0 rounded"
          />
        ))}
        {frameIds.length > 6 && (
          <span className="self-center px-1 text-xs text-stone-500">
            +{frameIds.length - 6} more
          </span>
        )}
      </div>

      <input
        aria-label={`Name for ${place.id}`}
        className="w-full rounded border px-2 py-1 text-sm"
        value={name}
        onChange={e => setName(e.target.value)}
      />

      <div className="mt-1 flex gap-1">
        <select
          aria-label={`Category for ${place.id}`}
          className="flex-1 rounded border px-1 py-1 text-xs"
          value={category}
          onChange={e => setCategory(e.target.value)}
        >
          {TenantCategorySchema.options.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <button
          className="rounded bg-stone-800 px-3 py-1 text-xs text-white disabled:opacity-40"
          disabled={busy || name.trim() === ""}
          onClick={() => onAccept(name.trim(), category)}
        >
          Accept
        </button>
        <button
          className="rounded border px-3 py-1 text-xs disabled:opacity-40"
          disabled={busy}
          onClick={onReject}
        >
          Reject
        </button>
      </div>

      <p className="mt-1 text-xs text-stone-500">
        {place.levelId ?? "no level"} · {frameIds.length} frame{frameIds.length === 1 ? "" : "s"}
        {place.proposedBy ? ` · by ${place.proposedBy}` : ""}
      </p>
      {place.notes && <p className="mt-1 text-xs italic text-stone-500">{place.notes}</p>}
    </div>
  );
}
