import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { alreadyHasRoomsWords, linedUpWords, LineUpWarning, lineUpWords, notCheckedWords } from "./LineUpWarning";

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

  it("names where Align actually is, when it isn't this step (Build's drafts review)", () => {
    expect(lineUpWords({ dx: 11.5, dy: -4.6, pairs: 7 }, "L1", "the Floorplan step")).toBe(
      "The drawing sits about 11.5 m east and 4.6 m south of the rooms already on L1. "
      + "Line it up with Align on the Floorplan step, then run Find rooms again.",
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

describe("linedUpWords", () => {
  it("says the drawing lines up with the floor's rooms, by floor code (contract v4)", () => {
    expect(linedUpWords("L1")).toBe("The drawing lines up with L1's rooms.");
    expect(linedUpWords("B2")).toBe("The drawing lines up with B2's rooms.");
  });
});

describe("notCheckedWords", () => {
  it("says the drawing couldn't be checked against the floor's rooms, and to look before step 5, singular for one", () => {
    expect(notCheckedWords("L1", 228)).toBe("Couldn't check the drawing against L1's 228 rooms: look before step 5.");
    expect(notCheckedWords("L2", 1)).toBe("Couldn't check the drawing against L2's 1 room: look before step 5.");
  });
});

describe("LineUpWarning", () => {
  it("shows its words with a warning mark", () => {
    render(<LineUpWarning>Test warning words.</LineUpWarning>);
    expect(screen.getByText("Test warning words.")).toBeTruthy();
  });
});
