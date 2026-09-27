import { describe, expect, it } from "vitest";
import { surveyCommand } from "./keys";

describe("surveyCommand", () => {
  it("maps every key the spec lists (§9)", () => {
    expect(surveyCommand("ArrowLeft")).toBe("prev");
    expect(surveyCommand("ArrowRight")).toBe("next");
    expect(surveyCommand("n")).toBe("nextUntagged");
    expect(surveyCommand("N")).toBe("nextUntagged");
    expect(surveyCommand("t")).toBe("focusName");
    expect(surveyCommand("T")).toBe("focusName");
    expect(surveyCommand("Enter")).toBe("tag");
    expect(surveyCommand("Escape")).toBe("dropBox");
    expect(surveyCommand("Delete")).toBe("bin");
    expect(surveyCommand("g")).toBe("toggleGrid");
    expect(surveyCommand("G")).toBe("toggleGrid");
  });

  it("bins with Backspace too, which is the Delete key on a Mac laptop", () => {
    expect(surveyCommand("Backspace")).toBe("bin");
  });

  it("ignores keys it does not know, including ones that name object properties", () => {
    expect(surveyCommand("x")).toBeNull();
    expect(surveyCommand("constructor")).toBeNull();
    expect(surveyCommand("toString")).toBeNull();
  });
});
