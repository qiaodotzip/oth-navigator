import type { Tool } from "../state/store";

const WHAT: Partial<Record<Tool, string>> = {
  "draw-room": "Drawing a room",
  "draw-doorway": "Drawing a doorway",
  "place-entrance": "Placing an entrance",
  "place-portal": "Placing a lift or stair",
  calibrate: "Measuring a known distance",
};

function howTo(tool: Tool, pointCount: number): string {
  if (tool === "draw-room") {
    if (pointCount === 0) return "Click to place the first corner.";
    if (pointCount < 3) return `${pointCount} of at least 3 corners. Backspace undoes, Esc cancels.`;
    return "Click the first corner again to close, or double-click. Backspace undoes.";
  }
  if (tool === "draw-doorway") {
    return pointCount === 0
      ? "Click one side of the opening."
      : "Click the other side, then double-click to finish.";
  }
  if (tool === "calibrate") {
    return pointCount < 2
      ? `Click two points a known distance apart (${pointCount}/2).`
      : "Now type the real distance in the Floorplan panel.";
  }
  return "Click where it goes.";
}

/**
 * Says what you are doing and how to finish. Without it the drawing tools are
 * discoverable only by guessing that double-click ends a shape.
 */
export function DrawingHint({ tool, pointCount }: { tool: Tool; pointCount: number }) {
  const what = WHAT[tool];
  if (!what) return null;

  return (
    <div
      data-testid="drawing-hint"
      className="pointer-events-none absolute left-3 top-3 rounded bg-stone-900/85 px-3 py-2 text-xs text-white"
    >
      <div className="font-medium">{what}</div>
      <div className="opacity-80">{howTo(tool, pointCount)}</div>
    </div>
  );
}
