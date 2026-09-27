import type { Box } from "@oth/model";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import { useElementSize } from "../plan/useElementSize";
import { labelInside, moveBox, resizeBox, type Corner } from "./boxEdit";
import { fitSize } from "./fit";
import type { FrameLabel } from "./labelled";

type Edit = { label: FrameLabel; mode: "move" | Corner; from: { x: number; y: number }; box: Box };

const CORNERS: readonly Corner[] = ["nw", "ne", "sw", "se"];

function percent(b: Box) {
  return { left: `${b.x * 100}%`, top: `${b.y * 100}%`, width: `${b.w * 100}%`, height: `${b.h * 100}%` };
}

function cornerAt(corner: Corner) {
  const left = corner === "nw" || corner === "sw";
  const top = corner === "nw" || corner === "ne";
  return {
    left: left ? -5 : undefined, right: left ? undefined : -5,
    top: top ? -5 : undefined, bottom: top ? undefined : -5,
  };
}

/**
 * One frame, as large as the space allows, with what was identified drawn on
 * it: drag a label to move its box, a corner to resize it. Where drawing is
 * offered (`onDraft`), a drag on the picture draws a new box.
 *
 * Shared by Survey, where boxes are drawn and corrected, and Review, where the
 * agent's box is corrected before deciding. Boxes are fractions of the frame,
 * so the size it is shown at never changes what is saved.
 */
export function FrameCanvas({
  imageUrl, alt, widthPx, heightPx, labels, draft = null, onDraft, onMoveLabel, onRemoveLabel,
}: {
  imageUrl: string;
  alt: string;
  widthPx: number;
  heightPx: number;
  labels: readonly FrameLabel[];
  /** A box being drawn and not yet saved. */
  draft?: Box | null;
  onDraft?: (box: Box | null) => void;
  onMoveLabel: (label: FrameLabel, box: Box) => void;
  onRemoveLabel?: (label: FrameLabel) => void;
}) {
  const [measure, space] = useElementSize();
  const frameRef = useRef<HTMLDivElement>(null);
  const [start, setStart] = useState<{ x: number; y: number } | null>(null);
  const [edit, setEdit] = useState<Edit | null>(null);

  // A drag that ends anywhere finishes the box: letting go off the picture is
  // normal when boxing something at its edge, and without this the drag
  // stayed live and the next click resized it.
  useEffect(() => {
    if (!start) return;
    const up = () => setStart(null);
    window.addEventListener("mouseup", up);
    return () => window.removeEventListener("mouseup", up);
  }, [start]);

  /** Fractions of the displayed frame. */
  function at(event: { clientX: number; clientY: number }) {
    const r = frameRef.current?.getBoundingClientRect();
    if (!r || r.width === 0 || r.height === 0) return { x: 0, y: 0 };
    return {
      x: Math.min(1, Math.max(0, (event.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (event.clientY - r.top) / r.height)),
    };
  }

  function onMouseMove(event: MouseEvent) {
    if (edit) {
      const p = at(event);
      const dx = p.x - edit.from.x;
      const dy = p.y - edit.from.y;
      const original = edit.label.sighting.box!;
      setEdit({
        ...edit,
        box: edit.mode === "move" ? moveBox(original, dx, dy) : resizeBox(original, edit.mode, dx, dy),
      });
      return;
    }
    if (!start || !onDraft) return;
    const p = at(event);
    onDraft({
      x: Math.min(start.x, p.x),
      y: Math.min(start.y, p.y),
      w: Math.abs(p.x - start.x),
      h: Math.abs(p.y - start.y),
    });
  }

  function onMouseUp() {
    if (edit) {
      onMoveLabel(edit.label, edit.box);
      setEdit(null);
      return;
    }
    setStart(null);
  }

  const fitted = space ? fitSize(space, { widthPx, heightPx }) : null;
  const boxed = labels.filter(l => l.sighting.box);
  const whole = labels.filter(l => !l.sighting.box);

  return (
    <div ref={measure} className="grid min-h-0 min-w-0 flex-1 place-items-center overflow-hidden">
      <div
        ref={frameRef}
        data-testid="tag-frame"
        className={`relative select-none bg-stone-900 ${onDraft ? "cursor-crosshair" : ""}`}
        // Before the space is measured (and always, in jsdom) the frame keeps
        // its shape at full width; once it is, it fits exactly.
        style={fitted ? { width: fitted.width, height: fitted.height } : { width: "100%", aspectRatio: `${widthPx} / ${heightPx}` }}
        // Mouse rather than pointer events: jsdom builds PointerEvent with no
        // coordinates, so a pointer drag could not be tested.
        onMouseDown={event => {
          if (!onDraft) return;
          setStart(at(event));
          onDraft(null);
        }}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onDragStart={event => event.preventDefault()}
      >
        {/*
          draggable={false} is load-bearing. A browser starts its own image
          drag on mousedown and then stops delivering mousemove, so the box
          never grew, no box was saved, and the tag fell back to the whole frame.
        */}
        <img
          src={imageUrl}
          alt={alt}
          className="block h-full w-full"
          draggable={false}
          onDragStart={event => event.preventDefault()}
        />

        {boxed.map(label => {
          const { sighting, place } = label;
          const b = edit?.label.sighting.id === sighting.id ? edit.box : sighting.box!;
          const proposed = sighting.status === "proposed";
          return (
            <div
              key={sighting.id}
              data-testid={`label-box-${sighting.id}`}
              // The body stays transparent to the mouse so a new box can still
              // be drawn over it — a shopfront inside a tagged walkway is the
              // normal case. Its label drags it, its corners resize it. A
              // proposed box is dashed, so it differs by more than colour.
              className={`pointer-events-none absolute border-2 ${
                proposed ? "border-dashed border-proposed" : "border-confirmed"
              }`}
              style={percent(b)}
            >
              {CORNERS.map(corner => (
                <button
                  key={corner}
                  type="button"
                  aria-label={`Resize ${place.nameEn} ${corner}`}
                  className="pointer-events-auto absolute h-2.5 w-2.5 border border-white bg-accent"
                  style={{ cursor: `${corner}-resize`, ...cornerAt(corner) }}
                  onMouseDown={event => {
                    event.stopPropagation();
                    setEdit({ label, mode: corner, from: at(event), box: b });
                  }}
                />
              ))}
              <span
                // A proposed box's chip: white text on bg-proposed reaches only
                // 4.1:1, under the 4.5:1 AA minimum for 13px text, so it takes
                // the soft fill with dark text and a border instead — the same
                // colour the dashed border already uses, just not as text on it.
                className={`pointer-events-auto absolute left-0 flex items-center gap-1 whitespace-nowrap rounded px-1 text-xs ${
                  labelInside(b) ? "top-0" : "-top-5"
                } ${proposed ? "border border-proposed bg-proposed-soft text-stone-900" : "bg-confirmed text-white"}`}
                style={{ cursor: "move" }}
                title={`Drag to move, corners to resize — ${place.nameEn}${proposed ? " (proposed)" : ""}`}
                onMouseDown={event => {
                  event.stopPropagation();
                  setEdit({ label, mode: "move", from: at(event), box: b });
                }}
              >
                {proposed && <span aria-hidden="true">?</span>}
                {place.nameEn}
                {onRemoveLabel && (
                  <button
                    type="button"
                    aria-label={`Remove tag ${place.nameEn} from this frame`}
                    title="Remove this tag"
                    className="font-bold"
                    onMouseDown={event => event.stopPropagation()}
                    onClick={() => onRemoveLabel(label)}
                  >
                    ×
                  </button>
                )}
              </span>
            </div>
          );
        })}

        {/* A tag with no box still happened; it applies to the whole frame. */}
        {whole.length > 0 && (
          <div data-testid="whole-frame-labels" className="pointer-events-none absolute bottom-1 left-1 flex flex-wrap gap-1">
            {whole.map(label => {
              const proposed = label.sighting.status === "proposed";
              return (
                <span
                  key={label.sighting.id}
                  className={`pointer-events-auto flex items-center gap-1 rounded px-1 text-xs ${
                    proposed ? "border border-proposed bg-proposed-soft text-stone-900" : "bg-confirmed text-white"
                  }`}
                >
                  {proposed && <span aria-hidden="true">?</span>}
                  {label.place.nameEn}
                  <span className="opacity-80">· whole frame</span>
                  {onRemoveLabel && (
                    <button
                      type="button"
                      aria-label={`Remove tag ${label.place.nameEn} from this frame`}
                      title="Remove this tag — it applies to the whole frame"
                      className="font-bold"
                      onMouseDown={event => event.stopPropagation()}
                      onClick={() => onRemoveLabel(label)}
                    >
                      ×
                    </button>
                  )}
                </span>
              );
            })}
          </div>
        )}

        {draft && (
          <div data-testid="tag-box" className="pointer-events-none absolute border-2 border-yours" style={percent(draft)} />
        )}
      </div>
    </div>
  );
}
