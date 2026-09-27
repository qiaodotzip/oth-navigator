import { describe, expect, it } from "vitest";
import { reviewCommand } from "./keys";

describe("reviewCommand", () => {
  it("maps every key the spec lists (§10)", () => {
    expect(reviewCommand("a")).toBe("accept");
    expect(reviewCommand("A")).toBe("accept");
    expect(reviewCommand("r")).toBe("reject");
    expect(reviewCommand("R")).toBe("reject");
    expect(reviewCommand("s")).toBe("skip");
    expect(reviewCommand("S")).toBe("skip");
    expect(reviewCommand("l")).toBe("list");
    expect(reviewCommand("L")).toBe("list");
    expect(reviewCommand("ArrowLeft")).toBe("prevFrame");
    expect(reviewCommand("ArrowRight")).toBe("nextFrame");
    expect(reviewCommand("Escape")).toBe("closeList");
  });

  it("ignores keys it does not know, including ones that name object properties", () => {
    expect(reviewCommand("Enter")).toBeNull();
    expect(reviewCommand("constructor")).toBeNull();
  });
});
