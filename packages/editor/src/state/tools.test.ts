import { describe, expect, it } from "vitest";
import type { Tool } from "./store";
import { TOOL_LABELS } from "./tools";

describe("tools", () => {
  it("names every tool, so no button can render blank", () => {
    const all: Tool[] = [
      "select", "draw-area", "draw-room", "draw-detail", "draw-pathway",
      "draw-doorway", "place-entrance", "place-portal", "calibrate", "align-plan",
    ];
    for (const t of all) expect(TOOL_LABELS[t]).toBeTruthy();
  });

  it("calls a lift stop what the team calls it", () => {
    expect(TOOL_LABELS["place-portal"]).toBe("Lift or stair");
  });
});
