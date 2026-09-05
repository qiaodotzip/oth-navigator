import { describe, expect, it } from "vitest";
import { levelChecklist } from "../flow/checklist";
import type { Tool } from "./store";
import { TOOL_LABELS, TOOLBAR_TOOLS } from "./tools";

const steps = levelChecklist({ model: null, levelId: null, image: null, report: null });

describe("tools", () => {
  it("names every tool, so no button can render blank", () => {
    for (const t of TOOLBAR_TOOLS) expect(TOOL_LABELS[t]).toBeTruthy();
  });

  it("offers every tool the guided flow uses, so nobody is stranded on a step", () => {
    // Calibrate is the exception: it is armed by the Floorplan panel, which is
    // where the measurement it produces is typed in.
    const fromFlow = steps.flatMap(s => s.tools).filter(t => t !== "calibrate");
    for (const t of fromFlow) expect(TOOLBAR_TOOLS).toContain(t);
  });

  it("offers the pathway tool, which is how anything becomes reachable", () => {
    expect(TOOLBAR_TOOLS).toContain<Tool>("draw-pathway");
  });
});
