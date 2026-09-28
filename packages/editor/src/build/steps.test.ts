import { describe, expect, it } from "vitest";
import { levelChecklist } from "../flow/checklist";
import { BUILD_STEPS } from "../flow/floorProgress";
import { TOOL_LABELS } from "../state/tools";
import { buildKeyAction } from "./keys";
import { STEP_GUIDES, TOOL_KEYS, parseStep, stepOfTool } from "./steps";

const offered = Object.values(STEP_GUIDES).flatMap(g => g.tools);

describe("STEP_GUIDES", () => {
  it("guides each of the six steps with one instruction", () => {
    for (const { id } of BUILD_STEPS) expect(STEP_GUIDES[id].instruction).toMatch(/\.$/);
  });

  it("lines a plan up with the floor below, or with the rooms already on this floor, in one sentence", () => {
    expect(STEP_GUIDES.floorplan.instruction).toBe(
      "Add this floor's plan, set its scale, then drag it into line with the floor below, or with the rooms already on this floor.",
    );
  });

  it("names every tool it offers, so no button renders blank", () => {
    for (const tool of offered) expect(TOOL_LABELS[tool]).toBeTruthy();
  });

  it("offers every tool the checklist uses, so nobody is stranded on a step", () => {
    const used = levelChecklist({ model: null, levelId: null, image: null, report: null }).flatMap(s => s.tools);
    for (const tool of used) expect(offered).toContain(tool);
  });

  it("never offers Doorway, which pathways replaced and nothing saves", () => {
    expect(offered).not.toContain("draw-doorway");
  });

  it("offers each tool on one step only, so a key has one step to go to", () => {
    expect(new Set(offered).size).toBe(offered.length);
  });
});

describe("stepOfTool", () => {
  it("finds the step that offers a tool", () => {
    expect(stepOfTool("draw-pathway")).toBe("pathways");
    expect(stepOfTool("place-portal")).toBe("entrances");
    expect(stepOfTool("calibrate")).toBe("floorplan");
    expect(stepOfTool("align-plan")).toBe("floorplan");
    expect(stepOfTool("draw-detail")).toBe("dressing");
  });

  it("gives Select no step of its own: it is on all of them", () => {
    expect(stepOfTool("select")).toBeNull();
  });
});

describe("parseStep", () => {
  it("reads a step from the address", () => {
    expect(parseStep("pathways")).toBe("pathways");
  });

  it("refuses anything that is not one of the six", () => {
    for (const bad of [undefined, "", "Pathways", "walls", "step=rooms"]) expect(parseStep(bad)).toBeNull();
  });
});

describe("TOOL_KEYS", () => {
  it("shows only keys that really pick that tool", () => {
    for (const [tool, key] of Object.entries(TOOL_KEYS)) {
      expect(buildKeyAction({ key: key!.toLowerCase() })).toEqual({ kind: "tool", tool });
    }
  });
});
