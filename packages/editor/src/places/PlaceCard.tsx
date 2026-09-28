import type { MapModel, Place, Room } from "@oth/model";
import { useId, useMemo, useState } from "react";
import type { Api } from "../api/client";
import { followLink } from "../route";
import { useEditorStore } from "../state/store";
import { Button } from "../ui/Button";
import { BoxedFrame } from "./BoxedFrame";
import { bestEvidence, imageWidthFor, statusLine, surveyLink, type Evidence } from "./evidence";
import { placesByRoom } from "./labels";

/** The photo's width in CSS pixels: the inspector column's, inside the card's padding. */
const PHOTO_CSS_PX = 296;
/** A row's thumbnail: `w-20`, as Bind places' are. */
const THUMB_CSS_PX = 80;

type CardApi = Pick<Api, "keyframeFileUrl">;

/** The frame at the width to ask for: in device pixels, or a 2x laptop screen gets a blurred sign. */
function frameSrc(api: CardApi, shown: Evidence, cssPx: number): string {
  return api.keyframeFileUrl(shown.frame.id, imageWidthFor(cssPx * (window.devicePixelRatio || 1), shown.sighting.box));
}

/** A ✓ only once a person has checked both the place and the photo shown. */
function vouched(place: Place, shown: Evidence | undefined): boolean {
  return place.status === "confirmed" && shown?.sighting.status === "confirmed";
}

/**
 * The answer to "how do I know this is the Starbucks?" (spec §4): the place
 * bound to the selected room, who confirmed it, and the photo that shows it,
 * with its other frames a click away.
 *
 * A room can hold several places: on L1 each west concourse holds three, on
 * purpose. They are listed alike, by name, as short rows, and a row opens to
 * its photo one at a time: three full photos would push the room's own fields
 * out of the column.
 *
 * Keyed by room where it is used, so the row and frame you had open on one
 * room do not carry over to the next.
 */
export function PlaceCard({ api, room, onBindOne, pickerBelow = false }: {
  api: CardApi;
  room: Room;
  /** Absent on Bind places, where binding happens just below. */
  onBindOne?: () => void;
  /** Whether Bind places' picker is just below: the inspector knows, as it lays the picker out. */
  pickerBelow?: boolean;
}) {
  const model = useEditorStore(s => s.model);
  const headingId = useId();
  const [open, setOpen] = useState<string | null>(null);
  const bound = useMemo(() => (model ? placesByRoom(model).get(room.id) ?? [] : []), [model, room.id]);

  if (!model) return null;

  const only = bound.length === 1 ? bound[0] : undefined;

  if (bound.length === 0) {
    // Kept short, as the picker below needs the column's height.
    return (
      <section aria-label="Surveyed place" className="shrink-0 border-b border-stone-200 px-3 py-2">
        <p className="text-xs text-stone-600">
          No surveyed place is bound to this room.{pickerBelow ? " Pick it below." : ""}
        </p>
        {onBindOne && (
          <Button size="sm" className="mt-2" onClick={onBindOne}>
            Bind one
          </Button>
        )}
      </section>
    );
  }

  if (only) {
    return (
      <section aria-label="Surveyed place" className="shrink-0 border-b border-stone-200 p-3">
        <h3 id={headingId} className="text-sm font-semibold text-stone-900">{only.nameEn}</h3>
        <PlaceDetails api={api} model={model} place={only} headingId={headingId} />
      </section>
    );
  }

  return (
    <section aria-label="Surveyed place" className="shrink-0 space-y-1 border-b border-stone-200 px-3 py-2">
      <p className="text-xs text-stone-600">{bound.length} places are bound to this room.</p>
      <ul>
        {bound.map(place => (
          <PlaceRow
            key={place.id}
            api={api}
            model={model}
            place={place}
            open={open === place.id}
            onToggle={() => setOpen(o => (o === place.id ? null : place.id))}
          />
        ))}
      </ul>
    </section>
  );
}

/**
 * One of several places, as a row: its best frame small, its name, and in a
 * word whether it is confirmed. The whole row is its name's button (the
 * button's ::after covers it), which opens the place's details in place of
 * the row's summary. The button stays mounted either way, so focus stays on it.
 */
function PlaceRow({ api, model, place, open, onToggle }: {
  api: CardApi;
  model: MapModel;
  place: Place;
  open: boolean;
  onToggle: () => void;
}) {
  const headingId = useId();
  const best = useMemo(() => bestEvidence(model, place.id)[0], [model, place.id]);
  const link = best ? surveyLink(model, best.frame) : null;

  return (
    <li aria-labelledby={headingId}>
      <div className="relative -mx-1 flex items-center gap-2 rounded px-1 py-1 hover:bg-stone-100">
        {!open &&
          (best ? (
            <BoxedFrame
              src={frameSrc(api, best, THUMB_CSS_PX)}
              frame={best.frame}
              box={best.sighting.box}
              tone={best.sighting.status}
              alt=""
              className="w-20 shrink-0"
            />
          ) : (
            <span className="flex aspect-video w-20 shrink-0 items-center justify-center rounded bg-stone-100 text-xs text-stone-600">
              No photo
            </span>
          ))}
        <div className="min-w-0 flex-1">
          <h3 id={headingId} className="text-sm font-semibold text-stone-900">
            <button
              type="button"
              aria-expanded={open}
              onClick={onToggle}
              className="block w-full truncate text-left after:absolute after:inset-0 after:content-['']"
            >
              {place.nameEn}
            </button>
          </h3>
          {!open && (
            <p className="flex flex-wrap gap-x-2 text-xs text-stone-700">
              <span>
                {vouched(place, best) && <span aria-hidden className="text-confirmed">✓ </span>}
                {place.status === "confirmed" ? "Confirmed" : "Proposed"}
              </span>
              {/* Above the row's button, so it is a link of its own. */}
              {link && <SurveyLink to={link} describedBy={headingId} className="relative" />}
            </p>
          )}
        </div>
      </div>
      {open && <PlaceDetails api={api} model={model} place={place} headingId={headingId} />}
    </li>
  );
}

/** A place in full: its category, who confirmed it and when, its frames best first, and the way to Survey. */
function PlaceDetails({ api, model, place, headingId }: {
  api: CardApi;
  model: MapModel;
  place: Place;
  /** The place's heading, which names the controls here among several places' alike. */
  headingId: string;
}) {
  const team = useEditorStore(s => s.team);
  const [index, setIndex] = useState(0);
  const evidence = useMemo(() => bestEvidence(model, place.id), [model, place.id]);

  // The frames can shrink under you, when a teammate bins one, so the step is clamped.
  const at = Math.min(index, Math.max(0, evidence.length - 1));
  const shown = evidence[at];
  const link = shown ? surveyLink(model, shown.frame) : null;

  return (
    <div className="space-y-2">
      <div>
        <p className="text-xs text-stone-600">{place.category}</p>
        <p className="text-xs text-stone-700">
          {vouched(place, shown) && <span aria-hidden className="text-confirmed">✓ </span>}
          {statusLine(place, shown, team)}
        </p>
      </div>

      {shown ? (
        <figure>
          <BoxedFrame
            src={frameSrc(api, shown, PHOTO_CSS_PX)}
            frame={shown.frame}
            box={shown.sighting.box}
            tone={shown.sighting.status}
            alt={`${place.nameEn}, as filmed`}
          />
          <figcaption className="mt-1 flex items-center gap-2 text-xs text-stone-600">
            <span>Seen in {evidence.length} frame{evidence.length === 1 ? "" : "s"}</span>
            {evidence.length > 1 && (
              <span className="ml-auto flex items-center gap-1">
                <StepButton label={`Previous frame of ${place.nameEn}`} stopped={at === 0} onStep={() => setIndex(at - 1)}>
                  ←
                </StepButton>
                <span aria-live="polite">{at + 1} of {evidence.length}</span>
                <StepButton label={`Next frame of ${place.nameEn}`} stopped={at === evidence.length - 1} onStep={() => setIndex(at + 1)}>
                  →
                </StepButton>
              </span>
            )}
          </figcaption>
        </figure>
      ) : (
        <p className="text-xs text-stone-600">There is no photo of this place yet.</p>
      )}

      {link && <SurveyLink to={link} describedBy={headingId} />}
    </div>
  );
}

/**
 * ← or →. At the end it stays enabled and does nothing, and says so with
 * aria-disabled: disabling it would drop the focus of whoever just pressed it.
 */
function StepButton({ label, stopped, onStep, children }: {
  label: string;
  stopped: boolean;
  onStep: () => void;
  children: string;
}) {
  return (
    <Button
      size="sm"
      variant="ghost"
      aria-label={label}
      aria-disabled={stopped}
      className="aria-disabled:cursor-not-allowed aria-disabled:opacity-40 aria-disabled:hover:bg-transparent"
      onClick={() => {
        if (!stopped) onStep();
      }}
    >
      {children}
    </Button>
  );
}

/** Open in Survey, described by its place's name: several places mean several of these. */
function SurveyLink({ to, describedBy, className = "" }: { to: string; describedBy: string; className?: string }) {
  return (
    <a
      href={to}
      onClick={followLink(to)}
      aria-describedby={describedBy}
      className={`inline-block whitespace-nowrap text-xs font-medium text-accent underline ${className}`}
    >
      Open in Survey
    </a>
  );
}
