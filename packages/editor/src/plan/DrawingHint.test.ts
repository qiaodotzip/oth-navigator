import { describe, expect, it } from "vitest";
import { hintFor } from "./DrawingHint";

describe("hintFor", () => {
  it("says nothing for Select", () => {
    expect(hintFor("select", 0)).toBeNull();
  });

  it("asks for the real distance once both points of a measurement are down", () => {
    expect(hintFor("calibrate", 1)?.how).toContain("(1/2)");
    expect(hintFor("calibrate", 2)?.how).toBe("Now type the real distance.");
  });

  describe("aligning the plan", () => {
    it("points at the floor below's outlines, by name", () => {
      expect(hintFor("align-plan", 0, { hasPlan: true, floorBelow: "L1" })?.how)
        .toBe("Drag the plan until its walls sit on the dashed outlines of L1, the floor below.");
    });

    it("on the lowest floor, says nothing of a floor below", () => {
      const how = hintFor("align-plan", 0, { hasPlan: true, floorBelow: null })?.how ?? "";
      expect(how).toMatch(/lowest floor/);
      expect(how).not.toMatch(/below|dashed/i);
    });

    it("asks for a plan first on a floor with none", () => {
      expect(hintFor("align-plan", 0, { hasPlan: false, floorBelow: "L1" })?.how)
        .toBe("There is no plan on this floor yet. Add one first, then drag it into line.");
    });

    it("says only what is always true when it is not told about the floor", () => {
      const how = hintFor("align-plan", 0)?.how ?? "";
      expect(how).toMatch(/drag the plan/i);
      expect(how).not.toMatch(/below|dashed|lowest/i);
    });
  });
});
