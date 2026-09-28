import type { MapModel, Place, Room } from "@oth/model";
import { useId, useMemo, useState } from "react";
import type { Api } from "../api/client";
import { offersPlaces } from "../build/BindPlaces";
import { followLink } from "../route";
import { useEditorStore } from "../state/store";
import { Button } from "../ui/Button";
import { BoxedFrame } from "./BoxedFrame";
import { bestEvidence, imageWidthFor, statusLine, surveyLink } from "./evidence";
import { placesByRoom } from "./labels";

/** The picture's width in CSS pixels: the inspector column's, inside the card's padding. */
const CARD_CSS_PX = 296;

type CardApi = Pick<Api, "keyframeFileUrl">;

/**
 * The answer to "how do I know this is the Starbucks?" (spec §4): the places
 * bound to the selected room, who confirmed each, and the photo that shows it,
 * with its other frames a click away.
 *
 * A room can hold several places: on L1 each west concourse holds three, on
 * purpose. They are listed alike, by name, each with its own photo, rather
 * than one standing for the room and the rest a footnote.
 *
 * Keyed by room where it is used, so the frame you had stepped to on one room
 * does not carry over to the next.
 */
export function PlaceCard({ api, room, onBindOne }: {
  api: CardApi;
  room: Room;
  /** Absent on Bind places, where binding happens just below. */
  onBindOne?: () => void;
}) {
  const model = useEditorStore(s => s.model);
  const bound = useMemo(() => (model ? placesByRoom(model).get(room.id) ?? [] : []), [model, room.id]);

  if (!model) return null;

  if (bound.length === 0) {
    // "Choose it below" only where there is a picker: with no place waiting
    // (`floorUnits`, which the picker reads), Bind places says so instead.
    // Kept short, as the picker needs the column's height.
    const pickerBelow = !onBindOne && offersPlaces(model, room);
    return (
      <section aria-label="Surveyed place" className="shrink-0 border-b border-stone-200 px-3 py-2">
        <p className="text-xs text-stone-600">
          No surveyed place is bound to this room.{pickerBelow ? " Choose it below." : ""}
        </p>
        {onBindOne && (
          <Button size="sm" className="mt-2" onClick={onBindOne}>
            Bind one
          </Button>
        )}
      </section>
    );
  }

  const listed = bound.length > 1;
  const entries = bound.map(place => <PlaceEntry key={place.id} api={api} model={model} place={place} listed={listed} />);

  return (
    <section aria-label="Surveyed place" className="shrink-0 space-y-2 border-b border-stone-200 p-3">
      {listed ? (
        <>
          <p className="text-xs text-stone-600">{bound.length} places are bound to this room.</p>
          <ul className="divide-y divide-stone-200">{entries}</ul>
        </>
      ) : (
        entries
      )}
    </section>
  );
}

/** One place: its name, whether it is confirmed and by whom, and its frames, best first. */
function PlaceEntry({ api, model, place, listed }: { api: CardApi; model: MapModel; place: Place; listed: boolean }) {
  const team = useEditorStore(s => s.team);
  const headingId = useId();
  const [index, setIndex] = useState(0);
  const evidence = useMemo(() => bestEvidence(model, place.id), [model, place.id]);

  // The frames can shrink under you, when a teammate bins one, so the step is clamped.
  const at = Math.min(index, Math.max(0, evidence.length - 1));
  const shown = evidence[at];
  const link = shown ? surveyLink(model, shown.frame) : null;
  const vouched = place.status === "confirmed" && shown?.sighting.status === "confirmed";

  const body = (
    <>
      <div>
        <h3 id={headingId} className="text-sm font-semibold text-stone-900">{place.nameEn}</h3>
        <p className="text-xs text-stone-600">{place.category}</p>
        <p className="text-xs text-stone-700">
          {vouched && <span aria-hidden className="text-confirmed">✓ </span>}
          {statusLine(place, shown, team)}
        </p>
      </div>

      {shown ? (
        <figure>
          <BoxedFrame
            // In device pixels, or a 2x laptop screen gets a blurred sign.
            src={api.keyframeFileUrl(shown.frame.id, imageWidthFor(CARD_CSS_PX * (window.devicePixelRatio || 1), shown.sighting.box))}
            frame={shown.frame}
            box={shown.sighting.box}
            tone={shown.sighting.status}
            alt={`${place.nameEn}, as filmed`}
          />
          <figcaption className="mt-1 flex items-center gap-2 text-xs text-stone-600">
            <span>Seen in {evidence.length} frame{evidence.length === 1 ? "" : "s"}</span>
            {evidence.length > 1 && (
              <span className="ml-auto flex items-center gap-1">
                <Button size="sm" variant="ghost" aria-label="Previous frame" disabled={at === 0} onClick={() => setIndex(at - 1)}>
                  ←
                </Button>
                <span aria-live="polite">{at + 1} of {evidence.length}</span>
                <Button size="sm" variant="ghost" aria-label="Next frame" disabled={at === evidence.length - 1} onClick={() => setIndex(at + 1)}>
                  →
                </Button>
              </span>
            )}
          </figcaption>
        </figure>
      ) : (
        <p className="text-xs text-stone-600">There is no photo of this place yet.</p>
      )}

      {link && (
        <a href={link} onClick={followLink(link)} className="inline-block text-xs font-medium text-accent underline">
          Open in Survey
        </a>
      )}
    </>
  );

  // Several places are a list, each item named by its place, so its Previous
  // frame and Open in Survey say whose they are.
  return listed ? (
    <li aria-labelledby={headingId} className="space-y-2 py-3 first:pt-0 last:pb-0">
      {body}
    </li>
  ) : (
    <div className="space-y-2">{body}</div>
  );
}
