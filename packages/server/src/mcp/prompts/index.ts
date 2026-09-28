import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { SETUP_STEPS, STEP_NAMES, stepNumber, type ClaudeStepId } from "../../setup/steps";
import { drawPaths } from "./drawPaths";
import { labelSurvey } from "./labelSurvey";
import { mapRooms } from "./mapRooms";
import { placeThings } from "./placeThings";

/**
 * One slash command of the setup wizard (spec §7.1). Claude Code shows it as
 * /mcp__oth__<name> and passes the floor. Tool names appear in its text in
 * backticks and nowhere else, so toolsNamed can check them against the real
 * tools (prompts.test.ts): a renamed tool breaks a test, not a command.
 */
export type SetupPrompt = {
  name: string;
  step: ClaudeStepId;
  title: string;
  description: string;
  tools: readonly string[];
  goal: (floor: string) => string;
  steps: (floor: string) => string[];
  /** Ends the sentence "Stop when …". */
  stop: (floor: string) => string;
  /** A finish_step note in the step's own words. */
  example: string;
};

export const PROMPTS: readonly SetupPrompt[] = [labelSurvey, mapRooms, placeThings, drawPaths];

/**
 * A floor's code or id, and nothing else. The argument is typed by the person
 * in their own Claude Code, but it is pasted into the text, so text that is
 * not a floor never gets there.
 */
export const FLOOR_ARG = z.string().trim().regex(/^[A-Za-z0-9_-]{1,40}$/, "a floor's code, such as L1").describe("The floor's code, such as L1.");

export const FINAL_LINE = "Report what you did in a few lines. Then call `finish_step`, but only if you reached the stop rule above.";

/**
 * Every prompt says this, so every prompt lists `view_plan` and `check_floor`.
 * Rehearsal 2's Claude met the token's write limit and tried to sleep in Bash
 * and PowerShell; a teammate's Claude Code would have asked them to allow a
 * shell. Reads have their own limit, so looking over the work fills the wait.
 */
export const SLOW_DOWN =
  "If a tool says to slow down, look over your work with `view_plan` or `check_floor` until the wait is over; never try to sleep or use a shell.";

/**
 * label_survey's tags are proposals, accepted or rejected at step 3, Review
 * Claude's labels; the frames it bins and the kinds it makes have Undo at
 * step 8, with the other three prompts' changes. Step 8, Check Claude's
 * work, is also where Publish lives.
 */
function draftMap(p: SetupPrompt): string {
  const check = `step ${stepNumber("check")}, ${STEP_NAMES.check}`;
  return [
    "Everything you change goes straight onto the draft map, saved under your person's name and marked as Claude's.",
    p.step === "label"
      ? `Your tags are proposals: a person accepts or rejects each one in step ${stepNumber("review")}, ${STEP_NAMES.review}. ` +
        `The frames you bin and the kinds you make are in ${check}, where each has Undo.`
      : `A person checks it in ${check}, where each change has Undo.`,
    `Don't publish: a person does, after step ${stepNumber("check")}.`,
  ].join(" ");
}

export function promptText(p: SetupPrompt, floor: string): string {
  return [
    `Set up floor ${floor} on the OTH map: step ${stepNumber(p.step)} of ${SETUP_STEPS.length}, ${STEP_NAMES[p.step]}.`,
    "",
    p.goal(floor),
    "",
    `Your tools for this step: ${p.tools.map(t => `\`${t}\``).join(", ")}.`,
    "",
    `Work on floor ${floor} only. If a tool says there is no floor ${floor}, stop and tell your person; don't choose another floor.`,
    "",
    ...p.steps(floor),
    "",
    SLOW_DOWN,
    "",
    draftMap(p),
    "",
    `Stop when ${p.stop(floor)}. If you stop before that, for whatever reason, say what is left and don't call ` +
      `\`finish_step\`: running /mcp__oth__${p.name} ${floor} again carries on from there.`,
    "",
    `When you call \`finish_step\`, send floor "${floor}", step "${p.step}", and one line for the setup screen, such as "${p.example}".`,
    "",
    FINAL_LINE,
  ].join("\n");
}

/** The tool names in a text: whatever is in backticks, once each, in the order first named. */
export function toolsNamed(text: string): string[] {
  return [...new Set([...text.matchAll(/`([a-z_]+)`/g)].map(m => m[1]!))];
}

export function registerPrompts(server: McpServer): void {
  for (const p of PROMPTS) {
    server.registerPrompt(p.name, { title: p.title, description: p.description, argsSchema: { floor: FLOOR_ARG } }, ({ floor }) => ({
      description: p.description,
      messages: [{ role: "user", content: { type: "text", text: promptText(p, floor) } }],
    }));
  }
}
