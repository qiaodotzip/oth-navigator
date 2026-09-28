import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useEditorStore } from "../state/store";
import { StepGuide } from "./StepGuide";
import { STEP_GUIDES } from "./steps";

beforeEach(() => useEditorStore.getState().reset());

describe("StepGuide", () => {
  it("names the step and gives its one instruction", () => {
    render(<StepGuide step="pathways" />);
    const guide = screen.getByRole("region", { name: "Pathways guide" });
    expect(guide.textContent).toContain(STEP_GUIDES.pathways.instruction);
  });

  it("offers Select and the step's own tools, each with its key", () => {
    render(<StepGuide step="entrances" />);
    expect(screen.getAllByRole("button").map(b => b.textContent)).toEqual(["SelectV", "EntranceE", "Lift or stairL"]);
  });

  it("arms a tool when it is pressed, and shows it armed", () => {
    render(<StepGuide step="rooms" />);
    fireEvent.click(screen.getByRole("button", { name: /draw room/i }));
    expect(useEditorStore.getState().tool).toBe("draw-room");
    expect(screen.getByRole("button", { name: /draw room/i }).getAttribute("aria-pressed")).toBe("true");
  });

  it("says how to finish while a tool is in use, instead of the step's instruction", () => {
    useEditorStore.getState().setTool("draw-room");
    render(<StepGuide step="rooms" />);
    expect(screen.getByTestId("guide-text").textContent).toMatch(/drawing a room/i);
  });

  it("counts a scale measurement's own points", () => {
    useEditorStore.getState().setTool("calibrate");
    useEditorStore.getState().pushCalibrationPoint([0, 0]);
    render(<StepGuide step="floorplan" />);
    expect(screen.getByTestId("guide-text").textContent).toContain("(1/2)");
  });

  it("shows the step's other tools under its own", () => {
    render(<StepGuide step="rooms" extras={<button type="button">Import DXF</button>} />);
    expect(screen.getByRole("button", { name: "Import DXF" })).toBeTruthy();
  });
});
