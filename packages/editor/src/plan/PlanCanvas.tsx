import type { Placement, Ring, Room, Vec2 } from "@oth/model";
import { roomColor } from "@oth/renderer";
import { useEffect, useRef, useState } from "react";
import { ringsOnActiveLevel, roomsOnActiveLevel, useEditorStore } from "../state/store";
import { imageCalibration, imageForLevel, underlayBBox } from "../state/underlay";
import { contentBBox, hasArea } from "./content";
import { DrawingHint } from "./DrawingHint";
import { snapPoint } from "./snapping";
import { Underlay } from "./Underlay";
import { VertexHandles } from "./VertexHandles";
import { fitViewport, screenToWorld, worldToScreen, zoomViewport } from "./viewport";

const SNAP_TOLERANCE_PX = 10;
const GRID_M = 0.25;

export type PlanCanvasProps = {
  width: number;
  height: number;
  onCommitRoom?: (ring: Ring) => void;
  onCommitDoorway?: (a: Vec2, b: Vec2) => void;
  onCommitPoint?: (p: Vec2) => void;
  onReshapeRoom?: (room: Room, ring: Ring) => void;
  onMovePlacement?: (placement: Placement, position: [number, number, number]) => void;
  /** Resolves a level image id to a URL. */
  imageUrl?: (imageId: string) => string;
};

export function PlanCanvas({
  width,
  height,
  onCommitRoom,
  onCommitDoorway,
  onCommitPoint,
  onReshapeRoom,
  onMovePlacement,
  imageUrl,
}: PlanCanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const state = useEditorStore();
  const rooms = roomsOnActiveLevel(state);
  const rings = ringsOnActiveLevel(state);
  const [cursor, setCursor] = useState<Vec2 | null>(null);
  const [draggingPlacement, setDraggingPlacement] = useState<string | null>(null);
  const [placementAt, setPlacementAt] = useState<Vec2 | null>(null);

  const image = imageForLevel(state.levelImages, state.activeLevelId);
  const calibration = imageCalibration(image);
  const underlay = underlayBBox(image);

  const selectedRoom =
    state.selection?.type === "room" ? rooms.find(r => r.id === state.selection?.id) ?? null : null;

  // Fit once per level, not on every render. Refitting continuously would snap
  // the canvas back the instant anyone panned, which is worse than not fitting.
  const fittedFor = useRef<string | null>(null);
  // Keyed on the image too, so adding a floorplan re-frames to include it.
  const fitKey = `${state.activeLevelId ?? ""}:${image?.id ?? ""}`;

  useEffect(() => {
    if (!state.activeLevelId || fittedFor.current === fitKey) return;
    const box = contentBBox(rings, underlay);
    if (!hasArea(box)) return;
    fittedFor.current = fitKey;
    state.setViewport(fitViewport(box, width, height));
  }, [fitKey, state, rings, underlay, width, height]);

  /**
   * Placement dragging.
   *
   * Mouse events rather than pointer events: jsdom gives PointerEvent no
   * coordinates, so a pointer-based drag cannot be tested.
   *
   * Deliberately no dependency array. The handlers must close over the current
   * viewport and drag position, and re-deriving them each render is the simplest
   * way to guarantee that. It costs nothing when idle because the early return
   * below attaches no listener unless a drag is actually in progress.
   */
  useEffect(() => {
    if (!draggingPlacement) return;
    const placement = state.model?.placements.find(p => p.id === draggingPlacement);
    if (!placement) return;

    const onMove = (event: MouseEvent) => setPlacementAt(pointerWorld(event));
    const onUp = () => {
      const at = placementAt;
      setDraggingPlacement(null);
      setPlacementAt(null);
      // One save per gesture, as with vertex dragging.
      if (at) onMovePlacement?.(placement, [at[0], at[1], placement.position[2]]);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  });

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (!state.draft) return;
      if (event.key === "Escape") {
        state.clearDraft();
        setCursor(null);
      }
      if (event.key === "Backspace") {
        event.preventDefault();
        state.popDraftPoint();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state]);

  function rawWorld(event: { clientX: number; clientY: number }): Vec2 {
    const rect = svgRef.current?.getBoundingClientRect();
    return screenToWorld(state.viewport, [
      event.clientX - (rect?.left ?? 0),
      event.clientY - (rect?.top ?? 0),
    ]);
  }

  function pointerWorld(event: { clientX: number; clientY: number }): Vec2 {
    // Tolerance is expressed in pixels so snapping feels the same at every zoom.
    return snapPoint(rawWorld(event), { rings }, {
      toleranceM: SNAP_TOLERANCE_PX / state.viewport.scale,
      gridM: GRID_M,
    }).point;
  }

  function commitDraft() {
    const draft = state.draft;
    if (!draft) return;
    // Below three points it is not a ring, and the model would reject it.
    if (state.tool === "draw-room" && draft.length >= 3) onCommitRoom?.(draft);
    if (state.tool === "draw-doorway" && draft.length >= 2) {
      onCommitDoorway?.(draft[0]!, draft[draft.length - 1]!);
    }
    state.clearDraft();
    setCursor(null);
  }

  function onSurfaceClick(event: React.MouseEvent) {
    if (state.tool === "select") return;

    if (state.tool === "calibrate") {
      // Raw and unsnapped: you are measuring the image, not the geometry, and
      // snapping to a room corner would silently corrupt the measurement.
      if ((state.calibrationDraft?.length ?? 0) >= 2) state.beginCalibration();
      state.pushCalibrationPoint(rawWorld(event));
      return;
    }

    const p = pointerWorld(event);

    if (state.tool === "draw-room" || state.tool === "draw-doorway") {
      if (!state.draft) state.beginDraft();
      state.pushDraftPoint(p);
      return;
    }

    if (state.tool === "place-entrance" || state.tool === "place-portal") {
      onCommitPoint?.(p);
    }
  }

  function onWheel(event: React.WheelEvent) {
    const rect = svgRef.current?.getBoundingClientRect();
    const anchor: Vec2 = [event.clientX - (rect?.left ?? 0), event.clientY - (rect?.top ?? 0)];
    state.setViewport(zoomViewport(state.viewport, event.deltaY < 0 ? 1.1 : 1 / 1.1, anchor));
  }

  const ringPoints = (ring: readonly Vec2[]) =>
    ring.map(p => worldToScreen(state.viewport, p).join(",")).join(" ");

  return (
    <div className="relative" style={{ width, height }}>
      <svg
        ref={svgRef}
        data-testid="plan-canvas"
        width={width}
        height={height}
        className="bg-stone-50"
        onWheel={onWheel}
      >
        {image && calibration && imageUrl && (
          <Underlay
            src={imageUrl(image.id)}
            calibration={calibration}
            viewport={state.viewport}
            widthPx={image.widthPx}
            heightPx={image.heightPx}
            opacity={image.opacity}
          />
        )}

        <rect
          data-testid="plan-surface"
          x={0}
          y={0}
          width={width}
          height={height}
          fill="transparent"
          onClick={onSurfaceClick}
          onDoubleClick={commitDraft}
          onMouseMove={event => {
            if (state.tool === "select") return;
            setCursor(state.tool === "calibrate" ? rawWorld(event) : pointerWorld(event));
          }}
        />

        {rooms.map(room => (
          <polygon
            key={room.id}
            data-testid={`room-${room.id}`}
            points={ringPoints(room.footprint)}
            fill={roomColor(room.kind, { selected: state.selection?.id === room.id })}
            stroke="#57534e"
            strokeWidth={1}
            onClick={event => {
              // Drawing tools own the surface; clicking a room must not steal the point.
              if (state.tool !== "select") return;
              event.stopPropagation();
              state.select({ type: "room", id: room.id });
            }}
          />
        ))}

        {state.tool === "select" && selectedRoom && (
          <VertexHandles
            room={selectedRoom}
            viewport={state.viewport}
            toWorld={pointerWorld}
            onCommit={ring => onReshapeRoom?.(selectedRoom, ring)}
          />
        )}

        {state.model?.placements
          .filter(p => p.levelId === state.activeLevelId)
          .map(p => {
            const at = draggingPlacement === p.id && placementAt
              ? placementAt
              : ([p.position[0], p.position[1]] as Vec2);
            const [x, y] = worldToScreen(state.viewport, at);
            return (
              <rect
                key={p.id}
                data-testid={`placement-${p.id}`}
                x={x - 5}
                y={y - 5}
                width={10}
                height={10}
                fill={state.selection?.id === p.id ? "#f2a33c" : "#8b5cf6"}
                stroke="#4c1d95"
                strokeWidth={1}
                style={{ cursor: state.tool === "select" ? "move" : "default" }}
                onMouseDown={event => {
                  if (state.tool !== "select") return;
                  event.stopPropagation();
                  state.select({ type: "placement", id: p.id });
                  setDraggingPlacement(p.id);
                }}
              />
            );
          })}

        {state.calibrationDraft && state.calibrationDraft.length > 0 && (
          <polyline
            data-testid="calibration-line"
            points={ringPoints(state.calibrationDraft)}
            fill="none"
            stroke="#2563eb"
            strokeWidth={2}
            strokeDasharray="6 4"
          />
        )}

        {state.draft && state.draft.length > 0 && (
          <polyline
            data-testid="draft"
            points={ringPoints(state.draft)}
            fill="rgba(242,163,60,0.2)"
            stroke="#f2a33c"
            strokeWidth={2}
          />
        )}

        {state.draft && state.draft.length > 0 && cursor && (
          <polyline
            data-testid="rubber-band"
            points={ringPoints([state.draft[state.draft.length - 1]!, cursor])}
            fill="none"
            stroke="#f2a33c"
            strokeWidth={1.5}
            strokeDasharray="4 4"
          />
        )}

        {state.draft?.map((p, i) => {
          const [cx, cy] = worldToScreen(state.viewport, p);
          return (
            <circle
              key={`draft-${i}`}
              data-testid={`draft-vertex-${i}`}
              cx={cx}
              cy={cy}
              r={i === 0 ? 6 : 4}
              fill={i === 0 ? "#f2a33c" : "#ffffff"}
              stroke="#b45309"
              strokeWidth={2}
              style={{ cursor: i === 0 ? "pointer" : "default" }}
              onClick={event => {
                // Clicking the first corner closes the shape.
                if (i !== 0) return;
                event.stopPropagation();
                commitDraft();
              }}
            />
          );
        })}

        {cursor && (
          // Snapping you cannot see is indistinguishable from the canvas moving
          // your click somewhere you did not intend.
          <circle
            data-testid="snap-indicator"
            cx={worldToScreen(state.viewport, cursor)[0]}
            cy={worldToScreen(state.viewport, cursor)[1]}
            r={7}
            fill="none"
            stroke="#2563eb"
            strokeWidth={2}
            pointerEvents="none"
          />
        )}
      </svg>

      {state.tool !== "select" && (
        <DrawingHint tool={state.tool} pointCount={state.draft?.length ?? 0} />
      )}
    </div>
  );
}
