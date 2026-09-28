import { BUILD_STEPS, type BuildStepId } from "../flow/floorProgress";
import type { Tool } from "../state/store";

export type StepGuide = {
  /** The one instruction the guide shows while no tool is in use. */
  instruction: string;
  /** The tools this step offers besides Select, which every step has. */
  tools: Tool[];
};

/**
 * Spec §11's table, as data: what each step asks for and the tools it offers.
 * The to-do half of the table is `build/todo.ts`.
 */
export const STEP_GUIDES: Record<BuildStepId, StepGuide> = {
  floorplan: {
    instruction: "Add this floor's plan, set its scale, then drag it into line with the floor below, or with the rooms already on this floor.",
    tools: ["calibrate", "align-plan"],
  },
  rooms: {
    instruction: "Trace each open area, then each room. Click the corners; click the first corner again to close.",
    tools: ["draw-area", "draw-room"],
  },
  pathways: {
    instruction: "Draw a line down the middle of every walkway, so every room has a way in.",
    tools: ["draw-pathway"],
  },
  entrances: {
    instruction: "Mark each way in from outside, and every lift, escalator and stair. Stops on other floors show dashed.",
    tools: ["place-entrance", "place-portal"],
  },
  bind: {
    instruction: "Select a room, then pick the surveyed place it is.",
    tools: [],
  },
  dressing: {
    instruction: "Draw the details worth modelling, export them for Blender, then place the models that come back.",
    tools: ["draw-detail"],
  },
};

/** Each tool's key, shown beside it in the guide. `build/keys.ts` handles them. */
export const TOOL_KEYS: Partial<Record<Tool, string>> = {
  select: "V",
  "draw-area": "A",
  "draw-room": "R",
  "draw-pathway": "P",
  "place-entrance": "E",
  "place-portal": "L",
};

/** The step that offers a tool — where its key takes you. Select is on every step, so it has none. */
export function stepOfTool(tool: Tool): BuildStepId | null {
  return BUILD_STEPS.find(s => STEP_GUIDES[s.id].tools.includes(tool))?.id ?? null;
}

/** A `?step=` value, or null for a missing or unknown one. */
export function parseStep(value: string | undefined): BuildStepId | null {
  return BUILD_STEPS.find(s => s.id === value)?.id ?? null;
}
