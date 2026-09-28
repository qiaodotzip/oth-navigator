import { href, type FloorTab } from "../route";
import { SETUP_STEP_IDS, type ClaudeChangeGroup, type SetupStepId } from "./types";

/** The steps Claude does, each run with its own slash command. */
export type ClaudeStepId = Extract<SetupStepId, "label" | "rooms" | "things" | "paths">;

export type WizardStep = {
  id: SetupStepId;
  /** The step bar's word for it: nine must fit beside the header's buttons. */
  short: string;
  /** Its heading, and its name everywhere else. */
  title: string;
};

/** Spec §4.1's table, in 6C's `SETUP_STEPS` order. */
export const WIZARD_STEPS: readonly WizardStep[] = [
  { id: "footage", short: "Footage", title: "Add footage" },
  { id: "label", short: "Labels", title: "Label the survey" },
  { id: "review", short: "Review", title: "Review Claude's labels" },
  { id: "floorplan", short: "Floorplan", title: "Floorplan" },
  { id: "rooms", short: "Rooms", title: "Rooms from the PDF" },
  { id: "things", short: "Places", title: "Places and objects" },
  { id: "paths", short: "Pathways", title: "Pathways and entrances" },
  { id: "check", short: "Check", title: "Check Claude's work" },
  { id: "finish", short: "Finish", title: "Finish" },
];

export const STEP_COUNT = WIZARD_STEPS.length;

export function wizardStep(id: SetupStepId): WizardStep {
  return WIZARD_STEPS.find(s => s.id === id)!;
}

/** Its number in an address, 1 to 9. */
export function stepNumber(id: SetupStepId): number {
  return SETUP_STEP_IDS.indexOf(id) + 1;
}

/** The step an address names, or null when it names none of the nine. */
export function stepAt(n: number | undefined): SetupStepId | null {
  return n !== undefined && Number.isInteger(n) ? SETUP_STEP_IDS[n - 1] ?? null : null;
}

/** The MCP prompts 6C registers; Claude Code shows each as `/mcp__oth__<prompt>`. */
const PROMPTS: Record<ClaudeStepId, string> = {
  label: "label_survey", rooms: "map_rooms", things: "place_things", paths: "draw_paths",
};

/** What to paste into Claude Code for a Claude step on this floor. */
export function slashCommand(id: ClaudeStepId, levelCode: string): string {
  return `/mcp__oth__${PROMPTS[id]} ${levelCode}`;
}

/** The groups of Claude's changes each Claude step makes: its "last changes" lists only these. */
export const STEP_GROUPS: Record<ClaudeStepId, readonly ClaudeChangeGroup[]> = {
  label: ["labels", "frames"],
  rooms: ["rooms", "drafts", "names", "stops"],
  things: ["places", "objects"],
  paths: ["pathways", "entrances"],
};

/** What to watch while Claude works: labels show in the counts only, the rest on the map too. */
export const WATCH: Record<ClaudeStepId, string> = {
  label: "watch the counts below as it labels the survey's frames",
  rooms: "watch the rooms fill in on the map",
  things: "watch places and objects appear on the map",
  paths: "watch the pathways appear on the map",
};

/** The step's own tool, for doing it by hand (spec §4.2). */
export function doItMyself(id: ClaudeStepId, levelCode: string): { label: string; to: string } {
  const tab = (t: FloorTab, params: Record<string, string> = {}) => href({ name: "floor", code: levelCode, tab: t, params });
  switch (id) {
    case "label":
      return { label: "Do it myself in Survey", to: tab("survey") };
    case "rooms":
      return { label: "Do it myself on Build", to: tab("build", { step: "rooms" }) };
    case "things":
      return { label: "Do it myself on the Places tab", to: tab("places") };
    case "paths":
      return { label: "Do it myself on Build", to: tab("build", { step: "pathways" }) };
  }
}
