import type { Ring, Room, Vec2 } from "@oth/model";
import { useEffect, useState } from "react";
import { deleteVertex, insertVertex, MIN_RING_LENGTH, moveVertex } from "./ring";
import { worldToScreen, type Viewport } from "./viewport";

/**
 * Draggable vertices on the selected room.
 *
 * Drag maths lives on window listeners rather than the handle itself, so the
 * cursor can leave the six-pixel circle mid-drag without the gesture dying.
 *
 * Mouse events rather than pointer events: jsdom constructs PointerEvent as a
 * bare Event with no clientX/clientY, so pointer-based dragging cannot be
 * tested at all. Mouse events are universally supported and we need neither
 * pen pressure nor multi-touch.
 */
export function VertexHandles({
  room,
  viewport,
  toWorld,
  onCommit,
}: {
  room: Room;
  viewport: Viewport;
  toWorld: (e: { clientX: number; clientY: number }) => Vec2;
  onCommit: (ring: Ring) => void;
}) {
  const [dragging, setDragging] = useState<number | null>(null);
  const [live, setLive] = useState<Ring | null>(null);
  const [selected, setSelected] = useState<number | null>(null);

  const ring = live ?? room.footprint;

  useEffect(() => {
    if (dragging === null) return;

    const onMove = (event: MouseEvent) => {
      setLive(current => moveVertex(current ?? room.footprint, dragging, toWorld(event)));
    };
    const onUp = () => {
      const moved = live;
      setDragging(null);
      setLive(null);
      // Commit the ring as last dragged rather than recomputing from the
      // release event: pointerup can arrive with stale or absent coordinates,
      // and a press with no movement should not write at all.
      // One save per gesture — writing on every move would fire dozens of
      // optimistic-locked updates and every one after the first would 409.
      if (moved) onCommit(moved);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragging, live, room.footprint, toWorld, onCommit]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (selected === null) return;
      if (event.key !== "Delete" && event.key !== "Backspace") return;
      if (room.footprint.length <= MIN_RING_LENGTH) return;
      event.preventDefault();
      onCommit(deleteVertex(room.footprint, selected));
      setSelected(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, room.footprint, onCommit]);

  return (
    <g>
      {ring.map((p, i) => {
        const [x, y] = worldToScreen(viewport, p);
        return (
          <circle
            key={`v-${i}`}
            data-testid={`vertex-${i}`}
            cx={x}
            cy={y}
            r={6}
            fill={selected === i ? "#f2a33c" : "#ffffff"}
            stroke="#57534e"
            strokeWidth={2}
            style={{ cursor: "grab" }}
            onMouseDown={event => {
              event.stopPropagation();
              setSelected(i);
              setDragging(i);
            }}
            onClick={event => {
              event.stopPropagation();
              setSelected(i);
            }}
          />
        );
      })}

      {ring.map((a, i) => {
        const b = ring[(i + 1) % ring.length]!;
        const mid: Vec2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        const [x, y] = worldToScreen(viewport, mid);
        return (
          <circle
            key={`m-${i}`}
            data-testid={`edge-mid-${i}`}
            cx={x}
            cy={y}
            r={4}
            fill="#d6d3d1"
            stroke="#78716c"
            strokeWidth={1}
            style={{ cursor: "copy" }}
            onClick={event => {
              event.stopPropagation();
              onCommit(insertVertex(room.footprint, i, mid));
            }}
          />
        );
      })}
    </g>
  );
}
