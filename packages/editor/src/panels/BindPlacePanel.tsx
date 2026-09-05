import type { Place } from "@oth/model";
import { roomsOnActiveLevel, useEditorStore } from "../state/store";

export type Binding = {
  place: Place;
  roomId: string;
  roomVersion: number;
  /** The frames that show it — what makes this more than an assertion. */
  evidence: string[];
};

/**
 * Binds a traced room to the place someone photographed.
 *
 * This is where the two independent descriptions of the building meet: the
 * geometry someone traced, and the footage someone walked. Binding is also the
 * first thing in the project that moves an entity off "unverified".
 */
export function BindPlacePanel({ onBind }: { onBind: (b: Binding) => void }) {
  const state = useEditorStore();
  const model = state.model;
  const selection = state.selection;

  const room =
    selection?.type === "room"
      ? roomsOnActiveLevel(state).find(r => r.id === selection.id) ?? null
      : null;

  const places = model?.places ?? [];
  const bound = places.find(p => p.roomId === room?.id) ?? null;
  // Only what nothing else has claimed — binding two rooms to one place would
  // make the adjacency check meaningless.
  const available = places.filter(p => !p.roomId);

  if (!room) {
    return <p className="text-xs text-stone-500">Select a room to bind it to a surveyed place.</p>;
  }

  if (bound) {
    return (
      <p className="text-xs text-stone-600">
        Confirmed as <span className="font-medium">{bound.nameEn}</span> from the survey.
      </p>
    );
  }

  if (places.length === 0) {
    return (
      <p className="text-xs text-stone-500">
        Nothing surveyed yet. Label some footage in the survey tool first.
      </p>
    );
  }

  return (
    <label className="block text-xs">
      Bind to a surveyed place
      <select
        aria-label="Bind to a surveyed place"
        className="mt-1 w-full rounded border px-2 py-1 text-sm"
        value=""
        onChange={e => {
          const place = available.find(p => p.id === e.target.value);
          if (!place) return;
          onBind({
            place,
            roomId: room.id,
            roomVersion: room.version,
            evidence: (model?.sightings ?? [])
              .filter(s => s.placeId === place.id)
              .map(s => s.keyframeId),
          });
        }}
      >
        <option value="">Choose…</option>
        {available.map(p => (
          <option key={p.id} value={p.id}>{p.nameEn}</option>
        ))}
      </select>
      {available.length === 0 && (
        <span className="mt-1 block text-stone-500">Every surveyed place is already bound.</span>
      )}
    </label>
  );
}
