import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SELECTED_FILL } from "./colours";
import { MODEL_FILL, OBJECT_FILL, PlacementMarker } from "./PlacementMarker";

function marker(rotationDeg: number, extra: { object?: boolean; selected?: boolean } = {}) {
  render(
    <svg>
      <PlacementMarker
        testId="m" at={[100, 100]} rotationDeg={rotationDeg} object={extra.object ?? true}
        selected={extra.selected ?? false} title="wastebin" movable onMouseDown={vi.fn()}
      />
    </svg>,
  );
  const line = screen.getByTestId("m-front");
  return {
    dx: Number(line.getAttribute("x2")) - 100,
    dy: Number(line.getAttribute("y2")) - 100,
    square: screen.getByTestId("m").querySelector("rect")!,
  };
}

describe("PlacementMarker", () => {
  it("points its front down the screen, south, at rotation 0", () => {
    const { dx, dy } = marker(0);
    expect(dx).toBeCloseTo(0);
    expect(dy).toBeGreaterThan(0);
  });

  it("points it east at 90°, as the 3D model turns, and turns the square with it", () => {
    const { dx, dy, square } = marker(90);
    expect(dx).toBeGreaterThan(0);
    expect(dy).toBeCloseTo(0);
    // SVG turns clockwise on screen; the plan turns anticlockwise.
    expect(square.getAttribute("transform")).toBe("rotate(-90 100 100)");
  });

  it("fills an object stone grey", () => {
    expect(marker(0).square.getAttribute("fill")).toBe(OBJECT_FILL);
  });

  it("fills a placed model violet", () => {
    expect(marker(0, { object: false }).square.getAttribute("fill")).toBe(MODEL_FILL);
  });

  it("fills a selected one teal", () => {
    expect(marker(0, { selected: true }).square.getAttribute("fill")).toBe(SELECTED_FILL);
  });

  it("names itself on hover", () => {
    marker(0);
    expect(screen.getByTestId("m").querySelector("title")?.textContent).toBe("wastebin");
  });
});
