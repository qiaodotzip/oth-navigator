import { live, type Placement, type Ring, type Room, type Vec2 } from "@oth/model";
import { roomColor } from "@oth/renderer";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { levelBelow } from "../flow/floors";
import type { SpaceKind } from "../flow/newSpace";
import { ringsOnActiveLevel, roomsOnActiveLevel, useEditorStore } from "../state/store";
import { displayBBox, displayCalibration, imageForLevel } from "../state/underlay";
import { Kbd } from "../ui/Kbd";
import { isTyping } from "../ui/typing";
import { draggedOffset, movedEnough, type PlanOffset } from "./align";
import { BELOW_STROKE, SELECTED_FILL, SELECTED_STROKE, SPACE_STROKE } from "./colours";
import { contentBBox, hasArea } from "./content";
import { DrawingHint } from "./DrawingHint";
import { PathwayShape } from "./PathwayShape";
import { PlacementMarker } from "./PlacementMarker";
import { snapPoint } from "./snapping";
import { Underlay } from "./Underlay";
import { VertexHandles } from "./VertexHandles";
import { fitViewport, panViewport, screenToWorld, worldToScreen, zoomViewport } from "./viewport";

const SNAP_TOLERANCE_PX = 10;
const GRID_M = 0.25;

const PORTAL_LETTER = { lift: "L", escalator: "Es", stair: "S", ramp: "R" } as const;

/**
 * Spaces are washes over the plan, not paint on it (spec §11): the architect's
 * drawing has to show through for a trace to be checked against it.
 */
const SPACE_FILL_OPACITY = 0.55;

/**
 * An Align drag: where it was pressed, where the plan's corner sat then, and
 * the zoom it began at, so a wheel turned mid-drag does not rescale a movement
 * already made.
 */
type AlignDrag = { from: Vec2; start: PlanOffset; pixelsPerMetre: number };

/** Where the plan's corner sits with the pointer here; null while the press is not yet a drag. */
function alignedAt(drag: AlignDrag, event: { clientX: number; clientY: number }): PlanOffset | null {
  const dx = event.clientX - drag.from[0];
  const dy = event.clientY - drag.from[1];
  return movedEnough(dx, dy) ? draggedOffset(drag.start, dx, dy, drag.pixelsPerMetre) : null;
}

/**
 * A point on the plan that means something: an entrance, or a stop of a lift or
 * stair. Drawn at a fixed screen size, since a point has no extent to scale.
 */
function PointMarker({
  testId, at, letter, fill, square = false, selected, title, onClick, pointerEvents,
}: {
  testId: string;
  at: [number, number];
  letter: string;
  fill: string;
  square?: boolean;
  selected: boolean;
  title: string;
  onClick: (event: React.MouseEvent) => void;
  pointerEvents?: "none";
}) {
  const [x, y] = at;
  const stroke = selected ? SELECTED_STROKE : "#ffffff";
  return (
    <g data-testid={testId} onClick={onClick} pointerEvents={pointerEvents} style={{ cursor: "pointer" }}>
      <title>{title}</title>
      {square ? (
        <rect x={x - 9} y={y - 9} width={18} height={18} rx={3} fill={fill} stroke={stroke} strokeWidth={2} />
      ) : (
        <circle cx={x} cy={y} r={9} fill={fill} stroke={stroke} strokeWidth={2} />
      )}
      <text
        x={x}
        y={y + 4}
        textAnchor="middle"
        fontSize={letter.length > 1 ? 8 : 11}
        fontWeight={700}
        fill="#ffffff"
        pointerEvents="none"
      >
        {letter}
      </text>
    </g>
  );
}

export type PlanCanvasProps = {
  width: number;
  height: number;
  /** One callback for every polygon tool; the kind says which tool drew it. */
  onCommitSpace?: (kind: SpaceKind, ring: Ring) => void;
  onCommitPathway?: (polyline: Vec2[]) => void;
  onCommitDoorway?: (a: Vec2, b: Vec2) => void;
  onCommitPoint?: (p: Vec2) => void;
  onReshapeRoom?: (room: Room, ring: Ring) => void;
  onMovePlacement?: (placement: Placement, position: [number, number, number]) => void;
  /** Resolves a level image id to a URL. */
  imageUrl?: (imageId: string) => string;
  /** Footprints of the floor below, drawn faintly so this floor's plan can be lined up on them. */
  belowRings?: readonly Ring[];
  /**
   * Once per drag with the Align tool: where the plan's top-left corner now
   * sits, in world metres. Return the save, and the plan stays where it was
   * dropped until the save settles.
   */
  onMoveUnderlay?: (offset: PlanOffset) => void | Promise<unknown>;
  /** False where the page has its own guide, which then carries the drawing hint. */
  showHint?: boolean;
  /**
   * SVG drawn over the spaces, pathways and details, and under the corner
   * handles and markers: room labels, and the layers later parts add. Each
   * overlay reads the viewport from the store, as the canvas does, and sets
   * its own pointer events. A label lets clicks through to the room beneath.
   */
  overlays?: ReactNode;
};

export function PlanCanvas({
  width,
  height,
  onCommitSpace,
  onCommitPathway,
  onCommitDoorway,
  onCommitPoint,
  onReshapeRoom,
  onMovePlacement,
  imageUrl,
  belowRings,
  onMoveUnderlay,
  showHint = true,
  overlays,
}: PlanCanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const state = useEditorStore();
  const rooms = roomsOnActiveLevel(state);
  const rings = ringsOnActiveLevel(state);
  const [cursor, setCursor] = useState<Vec2 | null>(null);
  const [draggingPlacement, setDraggingPlacement] = useState<{ id: string; from: Vec2 } | null>(null);
  const [placementAt, setPlacementAt] = useState<Vec2 | null>(null);

  const image = imageForLevel(state.levelImages, state.activeLevelId);
  // Drawn at its scale, or at a provisional metre per pixel until it has one,
  // so a plan can be seen — and measured on — before anyone has scaled it.
  const calibration = displayCalibration(image);
  const underlay = displayBBox(image);
  const [alignDrag, setAlignDrag] = useState<AlignDrag | null>(null);
  // Where the plan is shown instead of where it is saved: under the pointer
  // mid-drag, then where it was dropped until that save lands.
  const [alignAt, setAlignAt] = useState<PlanOffset | null>(null);
  const alignSaving = useRef(0);
  const alignDragging = useRef(false);

  // Shapes take clicks only for Select. Otherwise a click lands on whatever
  // room is under the pointer instead of the drawing surface beneath it, and an
  // entrance — always inside an area — could never be placed.
  const shapeEvents = state.tool === "select" ? undefined : "none";

  const selectedRoom =
    state.selection?.type === "room" ? rooms.find(r => r.id === state.selection?.id) ?? null : null;

  // Fit once per level, not on every render. Refitting continuously would snap
  // the canvas back the instant anyone panned, which is worse than not fitting.
  const fittedFor = useRef<string | null>(null);
  // Keyed on the image and its scale too, so adding a floorplan, or scaling
  // one, re-frames to include it.
  const fitKey = `${state.activeLevelId ?? ""}:${image?.id ?? ""}:${image?.metresPerPixel ?? "unscaled"}`;

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
    const drag = draggingPlacement;
    const placement = state.model?.placements.find(p => p.id === drag.id);
    if (!placement) return;

    const dragged = (event: MouseEvent) =>
      movedEnough(event.clientX - drag.from[0], event.clientY - drag.from[1]);
    const onMove = (event: MouseEvent) => setPlacementAt(dragged(event) ? pointerWorld(event) : null);
    const onUp = (event: MouseEvent) => {
      setDraggingPlacement(null);
      setPlacementAt(null);
      // One save per gesture, as with vertex dragging, and from the release
      // itself: a quick flick lets go before its last move has rendered.
      if (!dragged(event)) return;
      const at = pointerWorld(event);
      onMovePlacement?.(placement, [at[0], at[1], placement.position[2]]);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  });

  /**
   * Dragging the plan with the Align tool. The same shape as the placement
   * drag: no dependency array, so the handlers always see the current drag,
   * and one save on release rather than one per pixel.
   */
  useEffect(() => {
    if (!alignDrag) return;
    const drag = alignDrag;
    const onMove = (event: MouseEvent) => setAlignAt(alignedAt(drag, event) ?? drag.start);
    const onUp = (event: MouseEvent) => {
      // From the release itself: a quick flick lets go before its last move has rendered.
      const at = alignedAt(drag, event);
      alignDragging.current = false;
      setAlignDrag(null);
      const saving = at ? onMoveUnderlay?.(at) : undefined;
      if (at && saving instanceof Promise) {
        // Held where it was dropped until the save lands. Let go at once, the
        // plan jumps back to where it was saved, then forward again.
        setAlignAt(at);
        alignSaving.current += 1;
        saving
          .finally(() => {
            alignSaving.current -= 1;
            if (alignSaving.current === 0 && !alignDragging.current) setAlignAt(null);
          })
          // A failed save is the caller's to report; here it only means the
          // plan goes back to where it is saved.
          .catch(() => {});
        return;
      }
      // An earlier drop still on its way keeps the plan where that one left it.
      setAlignAt(alignSaving.current > 0 ? at ?? drag.start : null);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  });

  /**
   * Panning: drag empty canvas in Select, or middle-drag / Space-drag in any
   * tool. A drawing tool owns the left button, so it needs a way to move the
   * view that is not also a click.
   */
  const spaceHeld = useRef(false);
  const [pan, setPan] = useState<{ from: Vec2; origin: typeof state.viewport } | null>(null);
  // A drag ends in a click on the same element; that click is not a corner.
  const panMoved = useRef(false);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.code === "Space" && !isTyping(event.target)) spaceHeld.current = true;
    };
    const up = (event: KeyboardEvent) => {
      if (event.code === "Space") spaceHeld.current = false;
    };
    // Alt-Tabbing away mid-hold never fires keyup, so every later click on
    // the canvas would be swallowed as a pan until Space is pressed again.
    const blur = () => {
      spaceHeld.current = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, []);

  useEffect(() => {
    if (!pan) return;
    const onMove = (event: MouseEvent) => {
      const dx = event.clientX - pan.from[0];
      const dy = event.clientY - pan.from[1];
      if (Math.abs(dx) + Math.abs(dy) > 2) panMoved.current = true;
      state.setViewport(panViewport(pan.origin, dx, dy));
    };
    const onUp = () => setPan(null);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [pan, state]);

  function startPan(event: React.MouseEvent) {
    // The Align tool drags the plan itself, not the view.
    if (state.tool === "align-plan" && calibration && event.button === 0 && !spaceHeld.current) {
      event.preventDefault();
      alignDragging.current = true;
      setAlignDrag({
        from: [event.clientX, event.clientY],
        // From where the plan is shown, which is where the last drop left it
        // while that save is still on its way.
        start: alignAt ?? { offsetX: calibration.offsetX, offsetY: calibration.offsetY },
        pixelsPerMetre: state.viewport.scale,
      });
      return;
    }
    const wantsPan =
      event.button === 1 || spaceHeld.current || (event.button === 0 && state.tool === "select");
    if (!wantsPan) return;
    // Middle-click would otherwise start the browser's autoscroll.
    event.preventDefault();
    panMoved.current = false;
    setPan({ from: [event.clientX, event.clientY], origin: state.viewport });
  }

  // With nothing to frame, fitViewport centres the origin, which is still a
  // better answer than wherever the view had drifted to.
  const fitToLevel = () => state.setViewport(fitViewport(contentBBox(rings, underlay), width, height));

  // The snap indicator belongs to a drawing tool. Without this it freezes
  // wherever the pointer last was and follows you into Select, looking like the
  // canvas is still armed.
  useEffect(() => {
    if (state.tool === "select") setCursor(null);
  }, [state.tool]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (!state.draft || isTyping(event.target)) return;
      if (event.key === "Escape") {
        // Claimed, so the page's own Escape (let go of the tool) waits for the next press.
        event.preventDefault();
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

  /**
   * A browser fires two clicks before `dblclick`, so finishing a shape lands
   * its end point two or three times over. Committed as-is that gives every
   * shape a zero-length edge, and a double-click on empty canvas commits a
   * pathway with no length at all.
   */
  function withoutRepeats(points: readonly Vec2[]): Vec2[] {
    return points.filter((p, i) => {
      const prev = points[i - 1];
      return !prev || p[0] !== prev[0] || p[1] !== prev[1];
    });
  }

  function commitDraft() {
    if (!state.draft) return;
    const draft = withoutRepeats(state.draft);
    // Below three points it is not a ring, and the model would reject it.
    if (draft.length >= 3) {
      if (state.tool === "draw-room") onCommitSpace?.("room", draft);
      if (state.tool === "draw-area") onCommitSpace?.("area", draft);
      if (state.tool === "draw-detail") onCommitSpace?.("detail", draft);
    }
    // A pathway is a line, so two points is enough; a ring needs three.
    if (state.tool === "draw-pathway" && draft.length >= 2) onCommitPathway?.(draft);
    if (state.tool === "draw-doorway" && draft.length >= 2) {
      onCommitDoorway?.(draft[0]!, draft[draft.length - 1]!);
    }
    state.clearDraft();
    setCursor(null);
  }

  function onSurfaceClick(event: React.MouseEvent) {
    if (panMoved.current || spaceHeld.current) {
      panMoved.current = false;
      return;
    }
    if (state.tool === "select" || state.tool === "align-plan") return;

    if (state.tool === "calibrate") {
      // Raw and unsnapped: you are measuring the image, not the geometry, and
      // snapping to a room corner would silently corrupt the measurement.
      if ((state.calibrationDraft?.length ?? 0) >= 2) state.beginCalibration();
      state.pushCalibrationPoint(rawWorld(event));
      return;
    }

    const p = pointerWorld(event);

    if (
      state.tool === "draw-room" ||
      state.tool === "draw-area" ||
      state.tool === "draw-detail" ||
      state.tool === "draw-pathway" ||
      state.tool === "draw-doorway"
    ) {
      if (!state.draft) state.beginDraft();
      state.pushDraftPoint(p);
      return;
    }

    if (state.tool === "place-entrance" || state.tool === "place-portal") {
      // Unsnapped. Snapping is for corners; it would pull a point onto the
      // nearest wall, which is the boundary of the space it belongs inside.
      onCommitPoint?.(rawWorld(event));
    }
  }

  function onWheel(event: React.WheelEvent) {
    const rect = svgRef.current?.getBoundingClientRect();
    const anchor: Vec2 = [event.clientX - (rect?.left ?? 0), event.clientY - (rect?.top ?? 0)];
    state.setViewport(zoomViewport(state.viewport, event.deltaY < 0 ? 1.1 : 1 / 1.1, anchor));
  }

  const ringPoints = (ring: readonly Vec2[]) =>
    ring.map(p => worldToScreen(state.viewport, p).join(",")).join(" ");

  const renderRoom = (room: Room) => (
    <polygon
      key={room.id}
      data-testid={`room-${room.id}`}
      points={ringPoints(room.footprint)}
      fill={state.selection?.id === room.id ? SELECTED_FILL : roomColor(room.kind)}
      fillOpacity={SPACE_FILL_OPACITY}
      pointerEvents={shapeEvents}
      stroke={SPACE_STROKE}
      strokeWidth={1}
      onClick={event => {
        // Drawing tools own the surface; clicking a room must not steal the point.
        if (state.tool !== "select") return;
        event.stopPropagation();
        state.select({ type: "room", id: room.id });
      }}
    />
  );

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
            calibration={alignAt ? { ...calibration, ...alignAt } : calibration}
            viewport={state.viewport}
            widthPx={image.widthPx}
            heightPx={image.heightPx}
            opacity={image.opacity}
          />
        )}

        {belowRings?.map((ring, i) => (
          <polygon
            key={`below-${i}`}
            data-testid="below-ring"
            points={ringPoints(ring)}
            fill="none"
            stroke={BELOW_STROKE}
            strokeOpacity={0.7}
            strokeWidth={1}
            strokeDasharray="4 3"
            pointerEvents="none"
          />
        ))}

        <rect
          data-testid="plan-surface"
          x={0}
          y={0}
          width={width}
          height={height}
          fill="transparent"
          style={{
            cursor: pan || alignDrag ? "grabbing"
              : state.tool === "select" ? "grab"
              : state.tool === "align-plan" ? "move"
              : "crosshair",
          }}
          onMouseDown={startPan}
          onClick={onSurfaceClick}
          onDoubleClick={commitDraft}
          onMouseMove={event => {
            if (state.tool === "select" || state.tool === "align-plan" || pan) return;
            // The indicator shows where a click will land, so it snaps only
            // for the tools that snap.
            const unsnapped =
              state.tool === "calibrate" || state.tool === "place-entrance" || state.tool === "place-portal";
            setCursor(unsnapped ? rawWorld(event) : pointerWorld(event));
          }}
          onMouseLeave={() => setCursor(null)}
        />

        {rooms.filter(r => r.kind !== "detail").map(renderRoom)}

        {/*
          Painted over the rooms, not under them. Even as a wash, a room's fill
          all but hides a pathway drawn beneath it, exactly where it matters
          most: crossing a floor, or running along a row of shop fronts.
        */}
        {state.model?.pathways
          .filter(p => p.levelId === state.activeLevelId)
          .map(p => (
            <PathwayShape
              key={p.id}
              id={p.id}
              polyline={p.polyline}
              widthM={p.widthM}
              viewport={state.viewport}
              // A floor of walkways in one colour is a tangle; the type's
              // colour is what makes it readable.
              color={state.model?.pathwayKinds.find(k => k.id === p.kindId)?.colorHex}
              selected={state.selection?.id === p.id}
              pointerEvents={shapeEvents}
              onClick={event => {
                if (state.tool !== "select") return;
                event.stopPropagation();
                state.select({ type: "pathway", id: p.id });
              }}
            />
          ))}

        {/* A detail stands on the floor and on anything crossing it. */}
        {rooms.filter(r => r.kind === "detail").map(renderRoom)}

        {overlays}

        {state.tool === "select" && selectedRoom && (
          <VertexHandles
            // Keyed on the room: a corner picked on one room must not stay
            // picked on the next, or Delete would take a corner of the wrong one.
            key={selectedRoom.id}
            room={selectedRoom}
            viewport={state.viewport}
            toWorld={pointerWorld}
            onCommit={ring => onReshapeRoom?.(selectedRoom, ring)}
          />
        )}

        {state.model?.placements
          .filter(p => p.levelId === state.activeLevelId)
          .map(p => {
            const at = draggingPlacement?.id === p.id && placementAt
              ? placementAt
              : ([p.position[0], p.position[1]] as Vec2);
            const kind = p.objectKindId && state.model ? live(state.model.objectKinds).find(k => k.id === p.objectKindId) : undefined;
            const asset = p.assetId ? state.model?.assets.find(a => a.id === p.assetId) : undefined;
            return (
              <PlacementMarker
                key={p.id}
                testId={`placement-${p.id}`}
                at={worldToScreen(state.viewport, at)}
                rotationDeg={p.rotationDeg}
                object={Boolean(p.objectKindId)}
                selected={state.selection?.id === p.id}
                title={kind?.nameEn ?? asset?.filename ?? "Placement"}
                movable={state.tool === "select"}
                pointerEvents={shapeEvents}
                onMouseDown={event => {
                  if (state.tool !== "select") return;
                  event.stopPropagation();
                  state.select({ type: "placement", id: p.id });
                  setDraggingPlacement({ id: p.id, from: [event.clientX, event.clientY] });
                }}
              />
            );
          })}

        {/*
          Where lifts stop on other levels but not yet on this one. Each level
          frames itself, so "click the same spot" means nothing on screen
          without a mark to click on. Never clickable itself: a Portal click on
          it lands on the canvas at that spot, which is what joins the lift.
        */}
        {(() => {
          const endpoints = (state.model?.portalEndpoints ?? []).filter(ep => !ep.deletedAt);
          const stopsHere = new Set(
            endpoints.filter(ep => ep.levelId === state.activeLevelId).map(ep => ep.portalId),
          );
          return endpoints
            .filter(ep => ep.levelId !== state.activeLevelId && !stopsHere.has(ep.portalId))
            .map(ep => {
              const [x, y] = worldToScreen(state.viewport, ep.point);
              const level = state.model?.levels.find(l => l.id === ep.levelId);
              return (
                <g key={`ghost-${ep.id}`} data-testid={`portal-ghost-${ep.id}`} pointerEvents="none">
                  <rect
                    x={x - 9} y={y - 9} width={18} height={18} rx={3}
                    fill="none" stroke="#1d4ed8" strokeWidth={1.5} strokeDasharray="3 2"
                  />
                  <text x={x + 13} y={y + 4} fontSize={13} fill="#1d4ed8">
                    {level?.code ?? ""}
                  </text>
                </g>
              );
            });
        })()}

        {state.model?.entrances
          .filter(e => e.levelId === state.activeLevelId && !e.deletedAt)
          .map(e => (
            <PointMarker
              key={e.id}
              testId={`entrance-${e.id}`}
              pointerEvents={shapeEvents}
              at={worldToScreen(state.viewport, e.point)}
              letter="E"
              fill="#047857"
              selected={state.selection?.id === e.id}
              title={e.nameEn || "Entrance"}
              onClick={event => {
                if (state.tool !== "select") return;
                event.stopPropagation();
                state.select({ type: "entrance", id: e.id });
              }}
            />
          ))}

        {state.model?.portalEndpoints
          .filter(ep => ep.levelId === state.activeLevelId && !ep.deletedAt)
          .map(ep => {
            const portal = state.model?.portals.find(p => p.id === ep.portalId);
            return (
              <PointMarker
                key={ep.id}
                testId={`portal-endpoint-${ep.id}`}
                pointerEvents={shapeEvents}
                at={worldToScreen(state.viewport, ep.point)}
                letter={PORTAL_LETTER[portal?.kind ?? "lift"]}
                fill="#1d4ed8"
                square
                selected={state.selection?.id === ep.id}
                title={portal?.nameEn || portal?.kind || "Lift or stair"}
                onClick={event => {
                  if (state.tool !== "select") return;
                  event.stopPropagation();
                  state.select({ type: "portalEndpoint", id: ep.id });
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
            fill={state.tool === "draw-pathway" ? "none" : "rgba(242,163,60,0.2)"}
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

      {showHint && state.tool !== "select" && (
        <DrawingHint
          tool={state.tool}
          pointCount={(state.tool === "calibrate" ? state.calibrationDraft : state.draft)?.length ?? 0}
          context={{
            hasPlan: Boolean(image),
            floorBelow: state.activeLevelId ? levelBelow(state.model, state.activeLevelId)?.code ?? null : null,
          }}
        />
      )}

      {/*
        Stacked with Fit in one column, so the warning can never sit over the
        canvas's own controls, and clear of the hint's corner. The column lets
        clicks through to the plan; only the controls themselves take them.
      */}
      <div className="pointer-events-none absolute bottom-3 right-3 flex flex-col items-end gap-2">
        {image && image.metresPerPixel == null && (
          // Drawn at a provisional metre per pixel, an unscaled plan looks
          // usable; anything traced on it now comes out the wrong size.
          <p
            role="status"
            data-testid="scale-warning"
            className="max-w-xs rounded border border-yours bg-yours-soft px-3 py-2 text-xs text-yours shadow-sm"
          >
            <span aria-hidden className="font-semibold">!</span> <span className="font-semibold">Warning:</span>{" "}
            This plan is not to scale yet. Measure a known distance before you draw on it.
          </p>
        )}
        <div className="pointer-events-auto flex items-center gap-2">
          <span className="rounded bg-white/90 px-2 py-1 text-xs text-stone-500 shadow-sm">
            Drag to pan · Space-drag while drawing · scroll to zoom
          </span>
          <button
            type="button"
            aria-label="Fit to floor"
            className="inline-flex items-center gap-1.5 rounded border border-stone-300 bg-white px-3 py-1 text-sm shadow-sm hover:bg-stone-100"
            onClick={fitToLevel}
          >
            Fit <Kbd>F</Kbd>
          </button>
        </div>
      </div>
    </div>
  );
}
