import { objectFront } from "@oth/model";
import type { MouseEvent } from "react";
import { SELECTED_FILL, SELECTED_STROKE } from "./colours";

/** Half a marker's side, in screen pixels: a point marker's size, whatever the zoom. */
const HALF_PX = 6;
/** How far the front tick reaches from the middle: just past the square's edge. */
const TICK_PX = HALF_PX + 4;

/** A placed model: violet, as placements have always been on the plan. */
export const MODEL_FILL = "#8b5cf6";
/** An object: stone-600, the neutral of its box in 3D. */
export const OBJECT_FILL = "#57534e";

/**
 * A placement on the plan (spec §5.3): a small square at its position, turned
 * to its rotation, with a tick on the side it faces. Pressing it selects it,
 * which opens the Placement inspector, and starts a drag. Colour is not the
 * only difference: its name is on hover.
 */
export function PlacementMarker({
  testId, at, rotationDeg, object, selected, title, movable, pointerEvents, onMouseDown,
}: {
  testId: string;
  at: [number, number];
  rotationDeg: number;
  object: boolean;
  selected: boolean;
  title: string;
  movable: boolean;
  pointerEvents?: "none";
  onMouseDown: (event: MouseEvent) => void;
}) {
  const [x, y] = at;
  const [fx, fy] = objectFront(rotationDeg);
  return (
    <g data-testid={testId} pointerEvents={pointerEvents} style={{ cursor: movable ? "move" : "default" }} onMouseDown={onMouseDown}>
      <title>{title}</title>
      <rect
        x={x - HALF_PX}
        y={y - HALF_PX}
        width={HALF_PX * 2}
        height={HALF_PX * 2}
        // SVG turns clockwise on screen; the plan turns anticlockwise seen from above.
        transform={`rotate(${-rotationDeg} ${x} ${y})`}
        fill={selected ? SELECTED_FILL : object ? OBJECT_FILL : MODEL_FILL}
        stroke={selected ? SELECTED_STROKE : "#ffffff"}
        strokeWidth={1.5}
      />
      {/* Which way it faces. Screen y runs south, so the plan's y is negated. */}
      <line
        data-testid={`${testId}-front`}
        x1={x}
        y1={y}
        x2={x + fx * TICK_PX}
        y2={y - fy * TICK_PX}
        stroke={selected ? SELECTED_STROKE : "#1c1917"}
        strokeWidth={2}
        strokeLinecap="round"
        pointerEvents="none"
      />
    </g>
  );
}
