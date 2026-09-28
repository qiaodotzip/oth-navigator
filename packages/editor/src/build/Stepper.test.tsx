import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Stepper } from "./Stepper";

// Shaped like the real L1: columns too small to publish on Areas & rooms,
// rooms no pathway reaches, and places waiting for a room.
const done = { floorplan: true, rooms: false, pathways: true, entrances: false, bind: false, dressing: false };
const counts = {
  floorplan: { errors: 0, warnings: 0 },
  rooms: { errors: 12, warnings: 2 },
  pathways: { errors: 0, warnings: 168 },
  entrances: { errors: 1, warnings: 1 },
  bind: { errors: 0, warnings: 11 },
  dressing: { errors: 0, warnings: 0 },
};

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
    expect(nav.getByRole("button", { name: /^Areas & rooms/ }).getAttribute("aria-current")).toBe("step");
    expect(nav.getByRole("button", { name: /^Pathways/ }).getAttribute("aria-current")).toBeNull();
  });

  it("marks a finished step in words as well as with a tick, and counts nothing on an empty list", () => {
    const button = setup().getByRole("button", { name: "Floorplan, done" });
    expect(button.textContent).toBe("✓Floorplan");
  });

  it("counts errors apart from warnings, each in words and with its own sign", () => {
    const button = setup().getByRole("button", { name: "Areas & rooms, 12 errors, 2 warnings" });
    expect(button.textContent).not.toContain("✓");
    expect(button.textContent).toContain("✕12");
    expect(button.textContent).toContain("!2");
  });

  it("never shows a bare tick over warnings", () => {
    const button = setup().getByRole("button", { name: "Pathways, done, 168 warnings" });
    expect(button.textContent).toContain("✓");
    expect(button.textContent).toContain("!168");
  });

  it("says one error and one warning in the singular", () => {
    expect(setup().getByRole("button", { name: "Entrances & lifts, 1 error, 1 warning" })).toBeTruthy();
  });

  it("goes to a step when it is chosen", () => {
    const onChoose = vi.fn();
    fireEvent.click(setup(onChoose).getByRole("button", { name: /^Pathways/ }));
    expect(onChoose).toHaveBeenCalledWith("pathways");
  });
});
