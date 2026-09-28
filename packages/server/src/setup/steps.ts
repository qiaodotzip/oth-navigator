/**
 * A floor's guided setup, in order (spec §4.1). Plain data with no table
 * behind it, so the slash commands can name their steps, and so the setup
 * wizard's own state — once setup/service.ts is written — can number them
 * from one list.
 */
export const SETUP_STEPS = ["footage", "label", "review", "floorplan", "rooms", "things", "paths", "check", "finish"] as const;
export type SetupStepId = (typeof SETUP_STEPS)[number];

/** The steps Claude does, each run by one slash command; the rest are a person's. */
export const CLAUDE_STEPS = ["label", "rooms", "things", "paths"] as const;
export type ClaudeStepId = (typeof CLAUDE_STEPS)[number];

export const STEP_NAMES: Record<SetupStepId, string> = {
  footage: "Add footage",
  label: "Label the survey",
  review: "Review Claude's labels",
  floorplan: "Floorplan",
  rooms: "Rooms from the PDF",
  things: "Places and objects",
  paths: "Pathways and entrances",
  check: "Check Claude's work",
  finish: "Finish",
};

/** 1 to 9, as the wizard's step bar numbers them and floor_setup.step stores them. */
export function stepNumber(step: SetupStepId): number {
  return SETUP_STEPS.indexOf(step) + 1;
}

export function isSetupStep(value: string): value is SetupStepId {
  return (SETUP_STEPS as readonly string[]).includes(value);
}

export function isClaudeStep(step: SetupStepId): step is ClaudeStepId {
  return (CLAUDE_STEPS as readonly string[]).includes(step);
}
