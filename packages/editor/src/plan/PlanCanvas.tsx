import type { Ring, Vec2 } from "@oth/model";
import { roomColor } from "@oth/renderer";
import { useEffect, useRef } from "react";
import { ringsOnActiveLevel, roomsOnActiveLevel, useEditorStore } from "../state/store";
import { imageCalibration, imageForLevel, underlayBBox } from "../state/underlay";
import { contentBBox, hasArea } from "./content";
import { Underlay } from "./Underlay";
import { snapPoint } from "./snapping";
import { fitViewport, screenToWorld, worldToScreen, zoomViewport } from "./viewport";

const SNAP_TOLERANCE_PX = 10;
const GRID_M = 0.25;

export type PlanCanvasProps = {
  width: number;
  height: number;
  onCommitRoom?: (ring: Ring) => void;
  onCommitDoorway?: (a: Vec2, b: Vec2) => void;
  onCommitPoint?: (p: Vec2) => void;
  /** Resolves a level image id to a URL. */
  imageUrl?: (imageId: string) => string;
};

export function PlanCanvas({
  width, height, onCommitRoom, onCommitDoorway, onCommitPoint, imageUrl,
}: PlanCanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const state = useEditorStore();
  const rooms = roomsOnActiveLevel(state);
  const rings = ringsOnActiveLevel(state);

  const image = imageForLevel(state.levelImages, state.activeLevelId);
  const calibration = imageCalibration(image);
  const underlay = underlayBBox(image);

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

  function pointerWorld(event: { clientX: number; clientY: number }): Vec2 {
    const rect = svgRef.current?.getBoundingClientRect();
    const sx = event.clientX - (rect?.left ?? 0);
    const sy = event.clientY - (rect?.top ?? 0);
    const world = screenToWorld(state.viewport, [sx, sy]);
    // Tolerance is expressed in pixels so snapping feels the same at every zoom.
    return snapPoint(world, { rings }, {
      toleranceM: SNAP_TOLERANCE_PX / state.viewport.scale,
      gridM: GRID_M,
    }).point;
  }

  function onSurfaceClick(event: React.MouseEvent) {
    if (state.tool === "select") return;

    if (state.tool === "calibrate") {
      // Raw and unsnapped: you are measuring the image, not the geometry.
      const rect = svgRef.current?.getBoundingClientRect();
      const raw = screenToWorld(state.viewport, [
        event.clientX - (rect?.left ?? 0),
        event.clientY - (rect?.top ?? 0),
      ]);
      // A third click starts a fresh measurement rather than extending the old one.
      if ((state.calibrationDraft?.length ?? 0) >= 2) state.beginCalibration();
      state.pushCalibrationPoint(raw);
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

  function onSurfaceDoubleClick() {
    const draft = state.draft;
    if (!draft) return;

    if (state.tool === "draw-room") {
      // Below three points it is not a ring, and the model would reject it.
      if (draft.length >= 3) onCommitRoom?.(draft);
    }
    if (state.tool === "draw-doorway" && draft.length >= 2) {
      onCommitDoorway?.(draft[0]!, draft[draft.length - 1]!);
    }
    state.clearDraft();
  }

  function onWheel(event: React.WheelEvent) {
    const rect = svgRef.current?.getBoundingClientRect();
    const anchor: Vec2 = [event.clientX - (rect?.left ?? 0), event.clientY - (rect?.top ?? 0)];
    state.setViewport(zoomViewport(state.viewport, event.deltaY < 0 ? 1.1 : 1 / 1.1, anchor));
  }

  const ringPoints = (ring: Ring) =>
    ring.map(p => worldToScreen(state.viewport, p).join(",")).join(" ");

  return (
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
        x={0} y={0} width={width} height={height}
        fill="transparent"
        onClick={onSurfaceClick}
        onDoubleClick={onSurfaceDoubleClick}
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
    </svg>
  );
}
