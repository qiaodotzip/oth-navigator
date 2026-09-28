import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { alreadyHasRoomsWords, LineUpWarning, lineUpWords } from "./LineUpWarning";

describe("lineUpWords", () => {
  it("says how far east/west and north/south the drawing sits, rounded to 0.1 m", () => {
    expect(lineUpWords({ dx: 11.5, dy: -4.6, pairs: 7 }, "L1")).toBe(
      "The drawing sits about 11.5 m east and 4.6 m south of the rooms already on L1. "
      + "Line it up with Align on this step, then run Find rooms again.",
    );
  });

  it("says west and north for the other signs", () => {
    expect(lineUpWords({ dx: -2.34, dy: 0.96, pairs: 5 }, "L2")).toBe(
      "The drawing sits about 2.3 m west and 1 m north of the rooms already on L2. "
      + "Line it up with Align on this step, then run Find rooms again.",
    );
  });
});

describe("alreadyHasRoomsWords", () => {
  it("says how many rooms the floor already has, singular for one", () => {
    expect(alreadyHasRoomsWords("L1", 228)).toBe(
      "L1 already has 228 rooms: line the plan up with them first (Align), so Find rooms can match them.",
    );
    expect(alreadyHasRoomsWords("L1", 1)).toBe(
      "L1 already has 1 room: line the plan up with them first (Align), so Find rooms can match them.",
    );
  });
});

describe("LineUpWarning", () => {
  it("shows its words with a warning mark", () => {
    render(<LineUpWarning>Test warning words.</LineUpWarning>);
    expect(screen.getByText("Test warning words.")).toBeTruthy();
  });
});
