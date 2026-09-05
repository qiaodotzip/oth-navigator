import { describe, expect, it } from "vitest";
import type { ChecklistStep, StepId, StepStatus } from "./checklist";
import { nextSectionId, stepSections } from "./sections";

function step(id: StepId, status: StepStatus, detail = ""): ChecklistStep {
  return { id, label: id, status, detail, tool: null, issues: [] };
}

const allTodo: ChecklistStep[] = [
  step("floorplan", "todo", "none yet"),
  step("scale", "todo", "not set"),
  step("rooms", "todo", "none yet"),
  step("connect", "todo", "0 doorways"),
  step("entrances", "todo", "none yet"),
  step("portals", "todo", "none serving this level"),
];

const sections = (steps: ChecklistStep[]) =>
  Object.fromEntries(stepSections(steps).map(s => [s.id, s]));

describe("stepSections", () => {
  it("returns the sections in order, with dressing last", () => {
    expect(stepSections(allTodo).map(s => s.id)).toEqual([
      "floorplan", "rooms", "connect", "entrances", "portals", "dressing",
    ]);
  });

  it("puts the floorplan and scale steps under one header", () => {
    expect(sections(allTodo).floorplan?.steps.map(s => s.id)).toEqual(["floorplan", "scale"]);
  });

  it("is done only when every step under it is", () => {
    const half = [step("floorplan", "done"), step("scale", "todo"), ...allTodo.slice(2)];
    expect(sections(half).floorplan?.status).toBe("todo");
  });

  it("is done when all its steps are", () => {
    const both = [step("floorplan", "done"), step("scale", "done", "0.07 m per pixel"), ...allTodo.slice(2)];
    expect(sections(both).floorplan?.status).toBe("done");
  });

  it("summarises with the first unfinished step, which is what you act on next", () => {
    const half = [step("floorplan", "done", "L1.png"), step("scale", "todo", "not set"), ...allTodo.slice(2)];
    expect(sections(half).floorplan?.detail).toBe("not set");
  });

  it("summarises a finished section with its last step", () => {
    const both = [step("floorplan", "done", "L1.png"), step("scale", "done", "0.07 m per pixel"), ...allTodo.slice(2)];
    expect(sections(both).floorplan?.detail).toBe("0.07 m per pixel");
  });

  it("gives dressing no status, because a level is not incomplete without it", () => {
    expect(sections(allTodo).dressing?.status).toBeNull();
  });

  it("collects the issues of every step it contains", () => {
    const withIssue: ChecklistStep = {
      ...step("rooms", "todo"),
      issues: [{
        severity: "error", code: "room.footprint.selfIntersecting", message: "bowtie",
        entityType: "room", entityId: "L1-a",
      }],
    };
    const s = sections([allTodo[0]!, allTodo[1]!, withIssue, ...allTodo.slice(3)]);
    expect(s.rooms?.issues).toHaveLength(1);
  });

  it("survives steps it does not recognise being absent", () => {
    expect(stepSections([])).toHaveLength(6);
  });
});

describe("nextSectionId", () => {
  it("is the first unfinished section", () => {
    expect(nextSectionId(stepSections(allTodo))).toBe("floorplan");
  });

  it("moves on once earlier sections are done", () => {
    const done = [
      step("floorplan", "done"), step("scale", "done"),
      step("rooms", "todo"), ...allTodo.slice(3),
    ];
    expect(nextSectionId(stepSections(done))).toBe("rooms");
  });

  it("is null when everything required is done", () => {
    const all = allTodo.map(s => ({ ...s, status: "done" as StepStatus }));
    expect(nextSectionId(stepSections(all))).toBeNull();
  });
});
