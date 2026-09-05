import { TenantCategorySchema, type Box, type Keyframe, type Place } from "@oth/model";
import { useRef, useState } from "react";
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
  onTag,
}: {
  keyframe: Keyframe;
  imageUrl: string;
  places: readonly Place[];
  onTag: (tag: Tag) => void;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<Tag["category"]>("retail");
  const [start, setStart] = useState<{ x: number; y: number } | null>(null);
  const [box, setBox] = useState<Box | null>(null);

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
    onTag({
      placeId: exact?.id ?? null,
      nameEn: trimmed,
      category: exact?.category ?? category,
      ...(box ? { box } : {}),
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
      >
        <img src={imageUrl} alt={`frame ${keyframe.id}`} className="w-full" />
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
