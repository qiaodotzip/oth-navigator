import type { Tool } from "./store";

/**
 * What each tool is called, everywhere it is offered.
 *
 * The guided flow and the toolbar both show these, so a teammate who learns
 * "Draw area" in the checklist finds the same word in the toolbar.
 */
export const TOOL_LABELS: Record<Tool, string> = {
  select: "Select",
  "draw-area": "Draw area",
  "draw-room": "Draw room",
  "draw-pathway": "Draw pathway",
  "draw-doorway": "Doorway",
  "place-entrance": "Entrance",
  "place-portal": "Portal",
  calibrate: "Measure scale",
};

/** The tools the toolbar offers, in the order a level is usually built. */
export const TOOLBAR_TOOLS: Tool[] = [
  "select",
  "draw-area",
  "draw-room",
  "draw-pathway",
  "place-entrance",
  "place-portal",
  // Doorway stays reachable — still right for a genuinely walled corridor —
  // but it is no longer part of the guided sequence.
  "draw-doorway",
];
