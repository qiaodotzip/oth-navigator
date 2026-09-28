import type { Tool } from "./store";

/**
 * What each tool is called, everywhere it is offered.
 *
 * The step guide and the keys both use these, so a teammate who learns
 * "Draw area" in the guide finds the same words wherever the tool appears.
 */
export const TOOL_LABELS: Record<Tool, string> = {
  select: "Select",
  "draw-area": "Draw area",
  "draw-room": "Draw room",
  "draw-detail": "Draw detail",
  "draw-pathway": "Draw pathway",
  "draw-doorway": "Doorway",
  "place-entrance": "Entrance",
  // What the team calls it; "portal" is the model's word for all four kinds.
  "place-portal": "Lift or stair",
  calibrate: "Measure scale",
  "align-plan": "Align",
};

/** The tools the toolbar offers, in the order a level is usually built. */
export const TOOLBAR_TOOLS: Tool[] = [
  "select",
  "draw-area",
  "draw-room",
  "draw-pathway",
  "draw-detail",
  "place-entrance",
  "place-portal",
  // No Doorway. Pathways replaced it for this building, and the canvas never
  // saved one: offering it was offering a button that did nothing.
];
