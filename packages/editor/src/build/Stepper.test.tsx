import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Stepper } from "./Stepper";

const done = { floorplan: true, rooms: false, pathways: false, entrances: false, bind: false, dressing: false };
const counts = { floorplan: 0, rooms: 3, pathways: 0, entrances: 1, bind: 190, dressing: 0 };

function setup(onChoose = vi.fn()) {
  render(<Stepper current="rooms" done={done} counts={counts} onChoose={onChoose} />);
  return within(screen.getByRole("navigation", { name: "Build steps" }));
}

describe("Stepper", () => {
  it("lists the six steps in the order a floor is built", () => {
    const labels = setup().getAllByRole("button").map(b => b.textContent ?? "");
    ["Floorplan", "Areas & rooms", "Pathways", "Entrances & lifts", "Bind places", "Dressing"]
      .forEach((label, i) => expect(labels[i]).toContain(label));
  });

  it("marks the step you are on", () => {
    const nav = setup();
    expect(nav.getByRole("button", { name: /Areas & rooms/ }).getAttribute("aria-current")).toBe("step");
    expect(nav.getByRole("button", { name: "Pathways" }).getAttribute("aria-current")).toBeNull();
  });

  it("marks a finished step in words as well as with a tick", () => {
    const button = setup().getByRole("button", { name: "Floorplan, done" });
    expect(button.textContent).toContain("✓");
  });

  it("counts what is open on a step, and says what the number is", () => {
    const nav = setup();
    expect(nav.getByRole("button", { name: "Bind places, 190 open" })).toBeTruthy();
    // Nothing open, nothing shown.
    expect(nav.getByRole("button", { name: "Pathways" })).toBeTruthy();
  });

  it("goes to a step when it is chosen", () => {
    const onChoose = vi.fn();
    fireEvent.click(setup(onChoose).getByRole("button", { name: "Pathways" }));
    expect(onChoose).toHaveBeenCalledWith("pathways");
  });
});
