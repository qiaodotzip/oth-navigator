import { TenantCategorySchema, type Box, type Keyframe, type PathwayKind, type Place } from "@oth/model";
import { useEffect, useRef, useState } from "react";
import { labelInside, moveBox, resizeBox, type Corner } from "./boxEdit";
import type { FrameLabel } from "./labelled";
import { matchPlaces } from "./places";

const CATEGORIES = TenantCategorySchema.options;

export type Tag = {
  /** An existing place, or null when the name is new. */
  placeId: string | null;
  nameEn: string;
  category: (typeof CATEGORIES)[number];
  /** Set when what was boxed is a walkway rather than a unit. */
  pathwayKindId?: string;
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
  walkwayKinds,
  onTag,
  onRemoveLabel,
  onMoveLabel,
  onAddWalkwayKind,
}: {
  keyframe: Keyframe;
  imageUrl: string;
  places: readonly Place[];
  /** What has already been said about this frame, drawn over it. */
  labels: readonly FrameLabel[];
  walkwayKinds: readonly PathwayKind[];
  onTag: (tag: Tag) => void;
  /** Remove one tag from this frame, without touching the place elsewhere. */
  onRemoveLabel: (label: FrameLabel) => void;
  /** Correct a box that was drawn, or proposed, in the wrong place. */
  onMoveLabel: (label: FrameLabel, box: Box) => void;
  /** Define a new walkway type without leaving the frame you are looking at. */
  onAddWalkwayKind: (nameEn: string) => void;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<Tag["category"]>("retail");
  // What is being boxed: a unit you go into, or a stretch of floor you cross.
  const [what, setWhat] = useState<"place" | "walkway">("place");
  const [walkwayKindId, setWalkwayKindId] = useState("");
  /** An existing box being corrected: which, how, and where the drag began. */
  const [edit, setEdit] = useState<
    { label: FrameLabel; mode: "move" | Corner; from: { x: number; y: number }; box: Box } | null
  >(null);
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
      // A walkway is a piece of the building, not a tenant.
      category: what === "walkway" ? "facility" : exact?.category ?? category,
      ...(what === "walkway" && walkwayKindId ? { pathwayKindId: walkwayKindId } : {}),
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
          if (edit) {
            const p = at(e);
            const dx = p.x - edit.from.x;
            const dy = p.y - edit.from.y;
            setEdit({
              ...edit,
              box: edit.mode === "move"
                ? moveBox(edit.label.sighting.box!, dx, dy)
                : resizeBox(edit.label.sighting.box!, edit.mode, dx, dy),
            });
            return;
          }
          if (!start) return;
          const p = at(e);
          setBox({
            x: Math.min(start.x, p.x),
            y: Math.min(start.y, p.y),
            w: Math.abs(p.x - start.x),
            h: Math.abs(p.y - start.y),
          });
        }}
        onMouseUp={() => {
          if (edit) {
            onMoveLabel(edit.label, edit.box);
            setEdit(null);
            return;
          }
          setStart(null);
        }}
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
        {labels.filter(l => l.sighting.box).map(label => {
          const { sighting, place } = label;
          const b = edit?.label.sighting.id === sighting.id ? edit.box : sighting.box!;
          const inside = labelInside(b);
          return (
            <div
              key={sighting.id}
              data-testid={`label-box-${sighting.id}`}
              // The box body stays transparent to the mouse so a new box can
              // still be drawn over it — a shopfront inside a tagged walkway is
              // the normal case. Its label drags it, its corners resize it.
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
              {(["nw", "ne", "sw", "se"] as const).map(corner => (
                <button
                  key={corner}
                  aria-label={`Resize ${place.nameEn} ${corner}`}
                  className="pointer-events-auto absolute h-2 w-2 border border-white bg-sky-600"
                  style={{
                    cursor: `${corner}-resize`,
                    left: corner === "nw" || corner === "sw" ? -4 : undefined,
                    right: corner === "ne" || corner === "se" ? -4 : undefined,
                    top: corner === "nw" || corner === "ne" ? -4 : undefined,
                    bottom: corner === "sw" || corner === "se" ? -4 : undefined,
                  }}
                  onMouseDown={e => {
                    e.stopPropagation();
                    setEdit({ label, mode: corner, from: at(e), box: b });
                  }}
                />
              ))}
              <span
                className={`pointer-events-auto absolute left-0 flex items-center gap-1 whitespace-nowrap rounded px-1 text-xs text-white ${
                  inside ? "top-0" : "-top-5"
                } ${place.status === "proposed" ? "bg-sky-500" : "bg-emerald-600"}`}
                style={{ cursor: "move" }}
                title={`Drag to move, corners to resize — ${place.nameEn}`}
                onMouseDown={e => setEdit({ label, mode: "move", from: at(e), box: b })}
              >
                {place.nameEn}
                <button
                  aria-label={`Remove tag ${place.nameEn} from this frame`}
                  title="Remove this tag"
                  className="font-bold"
                  onMouseDown={e => e.stopPropagation()}
                  onClick={() => onRemoveLabel({ sighting, place })}
                >
                  x
                </button>
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
                className={`pointer-events-auto flex items-center gap-1 rounded px-1 text-xs text-white ${
                  place.status === "proposed" ? "bg-sky-500/90" : "bg-emerald-600/90"
                }`}
              >
                {place.nameEn}
                <button
                  aria-label={`Remove tag ${place.nameEn} from this frame`}
                  title="Remove this tag — it applies to the whole frame"
                  className="font-bold"
                  onMouseDown={e => e.stopPropagation()}
                  onClick={() => onRemoveLabel({ sighting, place })}
                >
                  x
                </button>
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

      <div className="flex gap-1 text-xs">
        {(["place", "walkway"] as const).map(option => (
          <button
            key={option}
            data-testid={`what-${option}`}
            className={`rounded border px-2 py-1 ${
              what === option ? "bg-stone-800 text-white" : "hover:bg-stone-100"
            }`}
            onClick={() => setWhat(option)}
          >
            {option === "place" ? "A place" : "A walkway"}
          </button>
        ))}
        <span className="self-center text-stone-500">
          {what === "place"
            ? "somewhere you go into"
            : "a stretch of floor you cross"}
        </span>
      </div>

      {what === "walkway" && (
        <div className="flex gap-2">
          <select
            aria-label="Walkway type"
            className="min-w-0 flex-1 rounded border px-2 py-1 text-sm"
            value={walkwayKindId}
            onChange={e => setWalkwayKindId(e.target.value)}
          >
            <option value="">Which kind?</option>
            {walkwayKinds.map(k => <option key={k.id} value={k.id}>{k.nameEn}</option>)}
          </select>
          <button
            className="rounded border px-2 py-1 text-xs"
            onClick={() => {
              // Defining a type mid-tag beats leaving the frame to go and do it.
              const n = window.prompt("New walkway type, e.g. Covered link");
              if (n && n.trim()) onAddWalkwayKind(n.trim());
            }}
          >
            + New type
          </button>
        </div>
      )}

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

        {what === "place" && (
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
        )}

        <button className="rounded bg-stone-800 px-3 py-1 text-sm text-white" onClick={submit}>
          {exact ? `Tag as ${exact.nameEn}` : "Tag"}
        </button>
      </div>

      <p className="text-xs text-stone-500">
        {box ? "Tagging the boxed area." : "Tagging the whole frame — drag a box to be specific."}
      </p>

      {labels.length > 0 && (
        <div data-testid="tags-on-frame" className="space-y-1 border-t pt-2">
          <p className="text-xs font-medium text-stone-500">
            Tagged in this frame ({labels.length})
          </p>
          {labels.map(label => (
            <div key={label.sighting.id} className="flex items-center gap-2 text-xs">
              <span className="min-w-0 flex-1 truncate">
                {label.place.nameEn}
                <span className="ml-1 text-stone-400">
                  {label.sighting.box ? "boxed" : "whole frame"}
                </span>
              </span>
              <button
                aria-label={`Remove ${label.place.nameEn} from this frame`}
                className="rounded border px-2 py-0.5"
                onClick={() => onRemoveLabel(label)}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
