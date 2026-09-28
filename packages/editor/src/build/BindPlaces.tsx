import { live, placeLevels, type MapModel, type Place, type Room } from "@oth/model";
import { useState } from "react";
import type { Api } from "../api/client";
import { floorUnits } from "../flow/buildSteps";
import { bestEvidence } from "../places/evidence";
import { placesByRoom } from "../places/labels";
import type { Saver } from "../state/save";
import { useEditorStore } from "../state/store";
import { matchPlaces } from "../survey/places";
import { Button } from "../ui/Button";
import { offerUndo } from "../ui/offerUndo";

/** Thumbnails are 240 px wide: the server makes them from the 4K frames. */
const THUMB_WIDTH = 240;

/**
 * The frame a place is shown by, the picture that says "this one": the one
 * its card and its Places row lead with, so the same place never shows two
 * different photos. A confirmed tag's comes first, since a proposed tag is
 * still a guess that Review may yet move or bin.
 */
function placeFrame(model: MapModel, placeId: string): string | undefined {
  return bestEvidence(model, placeId)[0]?.frame.id;
}

/**
 * The places a room on this floor can be bound to: this floor's units waiting
 * for a room, and those no floor claims (`floorUnits`, the rule Bind places'
 * tick and to-do read too). One whose room was deleted is waiting again. A
 * bound place is never listed, so it is never ringed as the one in hand either.
 */
function openPlaces(model: MapModel, levelId: string): { here: Place[]; floorless: Place[] } {
  const levels = placeLevels(model);
  return { here: floorUnits(model, levelId, levels).waiting, floorless: floorUnits(model, undefined, levels).waiting };
}

/** Whether a place still needs a room: one whose room was deleted does. */
function waitingForRoom(model: MapModel, place: Place): boolean {
  const levels = placeLevels(model);
  // An unbound place is filed on its own floor, or the one it was filmed on.
  return floorUnits(model, levels.get(place.id), levels).waiting.includes(place);
}

/**
 * Whether the room gets the picker: it has no place yet and there are places
 * to pick from. The inspector asks too, as the picker then has the column.
 */
export function offersPlaces(model: MapModel, room: Room): boolean {
  if (live(model.places).some(p => p.roomId === room.id)) return false;
  const { here, floorless } = openPlaces(model, room.levelId);
  return here.length + floorless.length > 0;
}

/**
 * Binds a traced room to the place someone filmed there — where the geometry
 * and the footage, two independent descriptions of the building, meet. It is
 * also the first thing that moves a room off "unverified".
 *
 * A wrong bind is undone rather than confirmed first (spec §3): the toast
 * after it carries Undo, and a bound room offers Unbind, which also reaches
 * binds made before this screen existed.
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

  const roomName = room.nameEn || "this room";

  async function unbind(place: Place) {
    setBusy(true);
    try {
      // Only the room: the place stays filed on its floor, so it is back in
      // this floor's picker, ready for the room it belongs in.
      await saver.update("place", place.id, place.version, { roomId: null });
    } finally {
      setBusy(false);
    }
  }

  // By name, as the place card above lists them. A room can hold several on
  // purpose (L1's west concourses hold three gates each), so each is named,
  // with an Unbind of its own.
  const bound = placesByRoom(model).get(room.id) ?? [];
  const [only] = bound;
  if (bound.length === 1 && only) {
    return (
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-stone-700">
          <span aria-hidden className="text-confirmed">✓ </span>Bound to <span className="font-medium">{only.nameEn}</span> from the survey.
        </p>
        <Button size="sm" disabled={busy} onClick={() => void unbind(only)}>
          Unbind
        </Button>
      </div>
    );
  }
  if (bound.length > 1) {
    return (
      <div className="space-y-1">
        <p className="text-xs text-stone-700">
          <span aria-hidden className="text-confirmed">✓ </span>Bound to {bound.length} places from the survey:
        </p>
        <ul aria-label="Bound places" className="space-y-1">
          {bound.map(place => (
            <li key={place.id} className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate text-xs font-medium text-stone-700">{place.nameEn}</span>
              <Button size="sm" disabled={busy} aria-label={`Unbind ${place.nameEn}`} onClick={() => void unbind(place)}>
                Unbind
              </Button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const open = openPlaces(model, room.levelId);
  if (open.here.length + open.floorless.length === 0) {
    return (
      <p className="text-xs text-stone-600">
        No confirmed places are waiting for a room. Tag and review this floor's footage first.
      </p>
    );
  }

  const pendingFirst = (a: Place, b: Place) => Number(b.id === pendingPlaceId) - Number(a.id === pendingPlaceId);
  const here = matchPlaces(open.here, query).sort(pendingFirst);
  const floorless = matchPlaces(open.floorless, query).sort(pendingFirst);
  const sightings = live(model.sightings);
  const code = model.levels.find(l => l.id === room.levelId)?.code ?? "this floor";

  async function bind(place: Place) {
    setBusy(true);
    // Confirmed tags only: a proposed one is a guess, and vouches for nothing.
    const evidence = sightings.filter(s => s.placeId === place.id && s.status === "confirmed").map(s => s.keyframeId);
    try {
      // The place takes the room's floor as well, so one filmed on footage
      // with no floor is filed where it was found. When it does not land, the
      // saver has already said why (with Retry where that could help), and
      // the room is left unverified rather than vouched for by nothing.
      if (!(await saver.update("place", place.id, place.version, { roomId: room.id, levelId: room.levelId }))) return;
      // "Seen in a photo" needs a photo: with no confirmed frame, the place
      // is bound but the room stays as it was.
      const verifying = evidence.length > 0;
      const verified = verifying && (await saver.update("room", room.id, room.version, {
        verification: { status: "photo", evidence, verifiedAt: new Date().toISOString() },
      }));
      // A room write that failed has its own toast, with Retry; "Bound"
      // beside it would read as though everything went through.
      if (!verifying || verified) announceBind(place, verified);
      onBound();
    } finally {
      setBusy(false);
    }
  }

  /**
   * "Bound this room to Gate 1 · Undo". Each write moved its entity on one
   * version, so Undo expects exactly that: a teammate's change since is
   * refused, not overwritten. It puts back only what the bind changed, room
   * first, the reverse of the bind; the steps are kept across attempts, so
   * Retry carries on from where the last try stopped.
   */
  function announceBind(place: Place, verified: boolean) {
    const steps: (() => Promise<unknown>)[] = [
      ...(verified
        ? [() => api.updateEntity("room", room.id, room.version + 1, { verification: room.verification })]
        : []),
      // Only places with no live room are offered, so it had none worth
      // putting back; an explicit null clears a floor it did not have either.
      () => api.updateEntity("place", place.id, place.version + 1, { roomId: null, levelId: place.levelId ?? null }),
    ];
    offerUndo({
      message: `Bound ${roomName} to ${place.nameEn}`,
      undone: `${place.nameEn} is waiting for a room again`,
      what: `the bind to ${place.nameEn}`,
      run: async () => {
        while (steps.length > 0) {
          await steps[0]!();
          steps.shift();
        }
      },
      refresh: saver.refresh,
    });
  }

  const row = (p: Place) => {
    const frame = placeFrame(model, p.id);
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
            <span className="block text-xs text-stone-600">
              {p.category}
              {p.id === pendingPlaceId ? " · from your to-do" : ""}
            </span>
          </span>
        </button>
      </li>
    );
  };

  // A column that fills what the inspector gives it (`data-place-picker` is
  // how the rail knows to give it most of its height): the question and the
  // search stay put, and the places scroll in the one box below them, the
  // floorless ones too once opened. The box's padding keeps the ring round the
  // place in hand clear of its edge.
  return (
    <div data-place-picker className="flex min-h-0 flex-1 flex-col gap-2">
      <h3 className="shrink-0 text-xs font-semibold text-stone-700">Which place is this?</h3>
      <input
        aria-label="Find a place"
        placeholder="Find a place…"
        value={query}
        onChange={e => setQuery(e.target.value)}
        className="w-full shrink-0 rounded border border-stone-300 px-2 py-1 text-sm"
      />
      <div data-testid="place-choices" className="-mx-1 min-h-0 flex-1 space-y-2 overflow-y-auto px-1 py-0.5">
        {here.length > 0 ? (
          <ul aria-label={`On ${code}`} className="space-y-1">{here.map(row)}</ul>
        ) : (
          <p className="text-xs text-stone-600">
            {query
              ? `Nothing on ${code} matches "${query}".`
              : `No places filmed on ${code} are waiting for a room. Places are confirmed in Review.`}
          </p>
        )}
        {floorless.length > 0 && (
          <details>
            <summary className="cursor-pointer text-xs text-stone-600">Places with no floor ({floorless.length})</summary>
            <ul aria-label="With no floor" className="mt-1 space-y-1">{floorless.map(row)}</ul>
          </details>
        )}
      </div>
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
  // One bound after all — by a Retry that went through late, say — already
  // has its room, so there is nothing left to ask for.
  if (!model || !place || !waitingForRoom(model, place)) {
    return <p className="text-xs text-stone-600">Or pick a place from the to-do list, then click the room it is in.</p>;
  }
  const frame = placeFrame(model, place.id);

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
