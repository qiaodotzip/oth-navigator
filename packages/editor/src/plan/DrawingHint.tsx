import type { Tool } from "../state/store";

const WHAT: Partial<Record<Tool, string>> = {
  "draw-area": "Drawing an open area",
  "draw-room": "Drawing a room",
  "draw-pathway": "Drawing a pathway",
  "draw-detail": "Drawing a detail",
  "draw-doorway": "Drawing a doorway",
  "place-entrance": "Placing an entrance",
  "place-portal": "Placing a lift or stair",
  calibrate: "Measuring a known distance",
  "align-plan": "Aligning the plan",
};

function howTo(tool: Tool, pointCount: number): string {
  if (tool === "draw-room") {
    if (pointCount === 0) return "Click to place the first corner.";
    if (pointCount < 3) return `${pointCount} of at least 3 corners. Backspace undoes, Esc cancels.`;
    return "Click the first corner again to close, or double-click. Backspace undoes.";
  }
  if (tool === "draw-area") {
    if (pointCount === 0) return "Click a corner of the open space.";
    return pointCount < 3
      ? `${pointCount} of at least 3 corners. Backspace undoes, Esc cancels.`
      : "Click the first corner again to close, or double-click. Backspace undoes.";
  }
  if (tool === "draw-pathway") {
    // The commonest surprise: people draw a loop expecting it to fill. A
    // pathway is a line with a width, so a loop comes out as a ring.
    return pointCount < 2
      ? "Click along the middle of where people walk — a line, not an outline."
      : "Keep clicking, then double-click to finish. For a filled open space, use Draw area instead.";
  }
  if (tool === "draw-detail") {
    if (pointCount === 0) return "Click a corner of the thing itself — its real extent.";
    return pointCount < 3
      ? `${pointCount} of at least 3 corners. Backspace undoes, Esc cancels.`
      : "Click the first corner again to close, or double-click.";
  }
  if (tool === "draw-doorway") {
    return pointCount === 0
      ? "Click one side of the opening."
      : "Click the other side, then double-click to finish.";
  }
  if (tool === "calibrate") {
    // The drawn scale bars on OTH's sheets are wrong; a dimensioned grid bay is not.
    return pointCount < 2
      ? `Click two points a known distance apart — a structural grid bay, not the drawn scale bar (${pointCount}/2).`
      : "Now type the real distance below.";
  }
  if (tool === "align-plan") {
    return "Drag the plan until its walls sit on the dashed outlines of the floor below.";
  }
  return "Click where it goes.";
}

/**
 * What a tool is doing and how to finish it. The canvas's own hint and the
 * Build guide both say this, so there is one wording to learn.
 */
export function hintFor(tool: Tool, pointCount: number): { what: string; how: string } | null {
  const what = WHAT[tool];
  return what ? { what, how: howTo(tool, pointCount) } : null;
}

/**
 * Says what you are doing and how to finish. Without it the drawing tools are
 * discoverable only by guessing that double-click ends a shape.
 */
export function DrawingHint({ tool, pointCount }: { tool: Tool; pointCount: number }) {
  const hint = hintFor(tool, pointCount);
  if (!hint) return null;

  return (
    <div
      data-testid="drawing-hint"
      className="pointer-events-none absolute left-3 top-3 rounded bg-stone-900/85 px-3 py-2 text-xs text-white"
    >
      <div className="font-medium">{hint.what}</div>
      <div className="opacity-80">{hint.how}</div>
    </div>
  );
}
