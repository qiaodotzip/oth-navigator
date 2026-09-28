import { describe, expect, it } from "vitest";
import { CLAUDE_STEPS, isClaudeStep, isSetupStep, SETUP_STEPS, type SetupStepId } from "./steps";

describe("isSetupStep", () => {
  it("accepts every step in SETUP_STEPS", () => {
    for (const step of SETUP_STEPS) expect(isSetupStep(step), step).toBe(true);
  });

  it("rejects anything that isn't one of them", () => {
    expect(isSetupStep("bogus")).toBe(false);
    expect(isSetupStep("")).toBe(false);
    expect(isSetupStep("Label")).toBe(false);
  });
});

describe("isClaudeStep", () => {
  it("accepts the steps Claude does", () => {
    for (const step of CLAUDE_STEPS) expect(isClaudeStep(step), step).toBe(true);
  });

  it("rejects a person's steps", () => {
    const persons = SETUP_STEPS.filter((s): s is SetupStepId => !(CLAUDE_STEPS as readonly string[]).includes(s));
    expect(persons.length).toBeGreaterThan(0);
    for (const step of persons) expect(isClaudeStep(step), step).toBe(false);
  });
});
