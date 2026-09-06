import { TenantCategorySchema, type Box, type Keyframe, type Place } from "@oth/model";
import { useEffect, useRef, useState } from "react";
import type { FrameLabel } from "./labelled";
import { matchPlaces } from "./places";

const CATEGORIES = TenantCategorySchema.options;

export type Tag = {
  /** An existing place, or null when the name is new. */
  placeId: string | null;
  nameEn: string;
  category: (typeof CATEGORIES)[number];
  box?: Box;
};

/**
 * Tag what is in a frame.
 *
 * Drawing a box is optional on purpose: it says *which* of two shops you mean,
 * and making it compulsory would put a chore in front of the common case where
 * the whole frame is the thing.
 */
export function PlaceTagger({
  keyframe,
  imageUrl,
  places,
  labels,
  onTag,
}: {
  keyframe: Keyframe;
  imageUrl: string;
  places: readonly Place[];
  /** What has already been said about this frame, drawn over it. */
  labels: readonly FrameLabel[];
  onTag: (tag: Tag) => void;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<Tag["category"]>("retail");
  const [start, setStart] = useState<{ x: number; y: number } | null>(null);
  const [box, setBox] = useState<Box | null>(null);

  /**
   * A drag that ends anywhere finishes the box.
   *
   * Releasing outside the frame is normal when boxing something at the edge,
   * and without this the drag stayed live and the next click resized it.
   */
  useEffect(() => {
    if (!start) return;
    const up = () => setStart(null);
    window.addEventListener("mouseup", up);
    return () => window.removeEventListener("mouseup", up);
  }, [start]);

  const matches = matchPlaces(places, name);
  const exact = places.find(p => p.nameEn.toLowerCase() === name.trim().toLowerCase());

  /** Fractions of the displayed frame, so a box survives any resize. */
  function at(event: { clientX: number; clientY: number }) {
    const r = frameRef.current?.getBoundingClientRect();
    if (!r || r.width === 0 || r.height === 0) return { x: 0, y: 0 };
    return {
      x: Math.min(1, Math.max(0, (event.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (event.clientY - r.top) / r.height)),
    };
  }

  function submit() {
    const trimmed = name.trim();
    if (trimmed === "") return;
    // A stray click leaves a box of almost no size; that is not a box, and
    // saving it would put a dot on the frame instead of an outline.
    const drawn = box && box.w > 0.01 && box.h > 0.01 ? box : null;
    onTag({
      placeId: exact?.id ?? null,
      nameEn: trimmed,
      category: exact?.category ?? category,
      ...(drawn ? { box: drawn } : {}),
    });
    setName("");
    setBox(null);
  }

  return (
    <div className="space-y-2">
      <div
        ref={frameRef}
        data-testid="tag-frame"
        className="relative select-none"
        // Mouse rather than pointer events: jsdom builds PointerEvent with no
        // coordinates, so a pointer drag could not be tested.
        onMouseDown={e => {
          setStart(at(e));
          setBox(null);
        }}
        onMouseMove={e => {
          if (!start) return;
          const p = at(e);
          setBox({
            x: Math.min(start.x, p.x),
            y: Math.min(start.y, p.y),
            w: Math.abs(p.x - start.x),
            h: Math.abs(p.y - start.y),
          });
        }}
        onMouseUp={() => setStart(null)}
        onDragStart={e => e.preventDefault()}
      >
        {/*
          draggable={false} is load-bearing. A browser starts its own image
          drag on mousedown and then stops delivering mousemove, so the box
          never grew, no box was saved, and the label fell back to the
          whole-frame chip in the corner — which looked like the box had moved.
        */}
        <img
          src={imageUrl}
          alt={`frame ${keyframe.id}`}
          className="w-full"
          draggable={false}
          onDragStart={e => e.preventDefault()}
        />

        {/*
          What was identified, drawn where it was identified. Without this the
          only way to know whether a frame has been looked at is to read the
          places list and guess.
        */}
        {labels.filter(l => l.sighting.box).map(({ sighting, place }) => {
          const b = sighting.box!;
          return (
            <div
              key={sighting.id}
              data-testid={`label-box-${sighting.id}`}
              className={`pointer-events-none absolute border-2 ${
                place.status === "proposed" ? "border-sky-400" : "border-emerald-500"
              }`}
              style={{
                left: `${b.x * 100}%`,
                top: `${b.y * 100}%`,
                width: `${b.w * 100}%`,
                height: `${b.h * 100}%`,
              }}
            >
              <span
                className={`absolute -top-5 left-0 whitespace-nowrap rounded px-1 text-xs text-white ${
                  place.status === "proposed" ? "bg-sky-500" : "bg-emerald-600"
                }`}
              >
                {place.nameEn}
              </span>
            </div>
          );
        })}

        {/* Labels with no box still happened; they just apply to the whole frame. */}
        {labels.some(l => !l.sighting.box) && (
          <div
            data-testid="whole-frame-labels"
            className="pointer-events-none absolute bottom-1 left-1 flex flex-wrap gap-1"
          >
            {labels.filter(l => !l.sighting.box).map(({ sighting, place }) => (
              <span
                key={sighting.id}
                className={`rounded px-1 text-xs text-white ${
                  place.status === "proposed" ? "bg-sky-500/90" : "bg-emerald-600/90"
                }`}
              >
                {place.nameEn}
              </span>
            ))}
          </div>
        )}
        {box && (
          <div
            data-testid="tag-box"
            className="pointer-events-none absolute border-2 border-amber-400"
            style={{
              left: `${box.x * 100}%`,
              top: `${box.y * 100}%`,
              width: `${box.w * 100}%`,
              height: `${box.h * 100}%`,
            }}
          />
        )}
      </div>

      <div className="flex gap-2">
        <input
          aria-label="Place name"
          list="place-suggestions"
          className="min-w-0 flex-1 rounded border px-2 py-1 text-sm"
          placeholder="What is this? Type a name…"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter") submit();
          }}
        />
        <datalist id="place-suggestions">
          {matches.map(p => <option key={p.id} value={p.nameEn} />)}
        </datalist>

        <select
          aria-label="Category"
          className="rounded border px-2 py-1 text-sm"
          // An existing place keeps its category; changing it here would edit
          // every other sighting of it by surprise.
          disabled={Boolean(exact)}
          value={exact?.category ?? category}
          onChange={e => setCategory(e.target.value as Tag["category"])}
        >
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        <button className="rounded bg-stone-800 px-3 py-1 text-sm text-white" onClick={submit}>
          {exact ? `Tag as ${exact.nameEn}` : "Tag"}
        </button>
      </div>

      <p className="text-xs text-stone-500">
        {box ? "Tagging the boxed area." : "Tagging the whole frame — drag a box to be specific."}
      </p>
    </div>
  );
}
