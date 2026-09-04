import { describe, expect, it } from "vitest";
import { MODEL_PACKAGE_VERSION } from "./index";

describe("@oth/model", () => {
  it("exposes a package version", () => {
    expect(MODEL_PACKAGE_VERSION).toBe("0.1.0");
  });
});
