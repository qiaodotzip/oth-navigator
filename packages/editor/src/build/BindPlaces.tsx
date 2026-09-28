import { live, placeLevels, type Place, type Room } from "@oth/model";
import { useState } from "react";
import type { Api } from "../api/client";
import type { Saver } from "../state/save";
import { useEditorStore } from "../state/store";
import { matchPlaces } from "../survey/places";
import { Button } from "../ui/Button";
import { toast } from "../ui/toast";

/** Thumbnails are 240 px wide: the server makes them from the 4K frames. */
const THUMB_WIDTH = 240;

/** The first frame each place was seen in — the picture that says "this one". */
function firstFrames(sightings: readonly { placeId: string; keyframeId: string }[]): Map<string, string> {
  const frames = new Map<string, string>();
  for (const s of sightings) if (!frames.has(s.placeId)) frames.set(s.placeId, s.keyframeId);
  return frames;
}

/**
 * Binds a traced room to the place someone filmed there — where the geometry
 * and the footage, two independent descriptions of the building, meet. It is
 * also the first thing that moves a room off "unverified".
 */
export function BindPlaces({
  api,
  saver,
  room,
  pendingPlaceId,
  onBound,
}: {
  api: Api;
  saver: Saver;
  room: Room;
  pendingPlaceId: string | null;
  onBound: () => void;
}) {
  const model = useEditorStore(s => s.model);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  if (!model) return null;

  const bound = live(model.places).find(p => p.roomId === room.id);
  if (bound) {
    return (
      <p className="text-xs text-stone-700">
        <span aria-hidden className="text-confirmed">✓ </span>Bound to <span className="font-medium">{bound.nameEn}</span> from the survey.
      </p>
    );
  }

  // Confirmed units nothing has claimed: a proposal is still Review's to
  // decide, and a walkway is built as a path, not bound to a room.
  const open = live(model.places).filter(p => p.status === "confirmed" && !p.pathwayKindId && !p.roomId);
  if (open.length === 0) {
    return (
      <p className="text-xs text-stone-600">
        No confirmed places are waiting for a room. Tag and review this floor's footage first.
      </p>
    );
  }

  const floors = placeLevels(model);
  const pendingFirst = (a: Place, b: Place) => Number(b.id === pendingPlaceId) - Number(a.id === pendingPlaceId);
  const here = matchPlaces(open.filter(p => floors.get(p.id) === room.levelId), query).sort(pendingFirst);
  const floorless = matchPlaces(open.filter(p => floors.get(p.id) === undefined), query).sort(pendingFirst);
  const sightings = live(model.sightings);
  const frames = firstFrames(sightings);
  const code = model.levels.find(l => l.id === room.levelId)?.code ?? "this floor";

  async function bind(place: Place) {
    setBusy(true);
    const evidence = sightings.filter(s => s.placeId === place.id).map(s => s.keyframeId);
    try {
      // The place takes the room's floor as well, so one filmed on footage
      // with no floor is filed where it was found. When it does not land, the
      // saver has already said why (with Retry where that could help), and
      // the room is left unverified rather than vouched for by nothing.
      if (!(await saver.update("place", place.id, place.version, { roomId: room.id, levelId: room.levelId }))) return;
      await saver.update("room", room.id, room.version, {
        verification: { status: "photo", evidence, verifiedAt: new Date().toISOString() },
      });
      toast({ tone: "success", message: `Bound ${room.nameEn || room.id} to ${place.nameEn}.` });
      onBound();
    } finally {
      setBusy(false);
    }
  }

  const row = (p: Place) => {
    const frame = frames.get(p.id);
    return (
      <li key={p.id}>
        <button
          type="button"
          disabled={busy}
          aria-label={`Bind to ${p.nameEn}`}
          onClick={() => void bind(p)}
          className={`flex w-full items-center gap-2 rounded p-1 text-left hover:bg-stone-100 disabled:opacity-40 ${
            p.id === pendingPlaceId ? "ring-2 ring-accent-ring" : ""
          }`}
        >
          {frame ? (
            <img
              src={api.keyframeFileUrl(frame, THUMB_WIDTH)}
              alt=""
              loading="lazy"
              className="h-12 w-20 shrink-0 rounded bg-stone-200 object-cover"
            />
          ) : (
            <span className="flex h-12 w-20 shrink-0 items-center justify-center rounded bg-stone-100 text-xs text-stone-600">
              No frame
            </span>
          )}
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium">{p.nameEn}</span>
            <span className="block text-xs text-stone-500">
              {p.category}
              {p.id === pendingPlaceId ? " · from your to-do" : ""}
            </span>
          </span>
        </button>
      </li>
    );
  };

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold text-stone-700">Which place is this?</h3>
      <input
        aria-label="Find a place"
        placeholder="Find a place…"
        value={query}
        onChange={e => setQuery(e.target.value)}
        className="w-full rounded border border-stone-300 px-2 py-1 text-sm"
      />
      {here.length > 0 ? (
        <ul aria-label={`On ${code}`} className="space-y-1">{here.map(row)}</ul>
      ) : (
        <p className="text-xs text-stone-500">
          {query ? `Nothing on ${code} matches "${query}".` : `No places filmed on ${code} are waiting for a room.`}
        </p>
      )}
      {floorless.length > 0 && (
        <details>
          <summary className="cursor-pointer text-xs text-stone-600">Places with no floor ({floorless.length})</summary>
          <ul aria-label="With no floor" className="mt-1 space-y-1">{floorless.map(row)}</ul>
        </details>
      )}
    </div>
  );
}

/** The Bind places guide's line: which place you are finding a room for, and its frame. */
export function BindTools({
  api,
  pendingPlaceId,
  onCancel,
}: {
  api: Api;
  pendingPlaceId: string | null;
  onCancel: () => void;
}) {
  const model = useEditorStore(s => s.model);
  const place = pendingPlaceId ? live(model?.places ?? []).find(p => p.id === pendingPlaceId) : undefined;
  if (!model || !place) {
    return <p className="text-xs text-stone-600">Or pick a place from the to-do list, then click the room it is in.</p>;
  }
  const frame = live(model.sightings).find(s => s.placeId === place.id)?.keyframeId;

  return (
    <div role="status" className="flex items-start gap-2">
      {frame && (
        <img
          src={api.keyframeFileUrl(frame, THUMB_WIDTH)}
          alt={`Where ${place.nameEn} was filmed`}
          className="h-14 w-24 shrink-0 rounded bg-stone-200 object-cover"
        />
      )}
      <div className="flex-1 space-y-1 text-xs text-stone-700">
        <p>
          Click the room where you see <span className="font-medium">{place.nameEn}</span>.
        </p>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
