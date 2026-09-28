import { describe, expect, it } from "vitest";
import { draggedOffset } from "./align";

describe("draggedOffset", () => {
  it("moves the plan east and north as it is dragged right and up", () => {
    // 10 px per metre: 50 px right is 5 m east; 20 px up is 2 m north.
    expect(draggedOffset({ offsetX: 0, offsetY: 0 }, 50, -20, 10)).toEqual({ offsetX: 5, offsetY: 2 });
  });

  it("stays where it started for a drag that went nowhere", () => {
    expect(draggedOffset({ offsetX: -25, offsetY: 300 }, 0, 0, 3)).toEqual({ offsetX: -25, offsetY: 300 });
  });

  it("rounds to the centimetre, so a drag does not save fourteen decimal places", () => {
    expect(draggedOffset({ offsetX: 0, offsetY: 0 }, 1, 1, 3)).toEqual({ offsetX: 0.33, offsetY: -0.33 });
  });
});
