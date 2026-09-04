import { describe, expect, it } from "vitest";
import { emptyModel } from "../schema/model";
import type { Rule } from "./types";
import { validateModel } from "./validate";

const model = emptyModel({
  id: "oth",
  name: "Our Tampines Hub",
  anchorLat: 1.3531,
  anchorLng: 103.9447,
});

const errorRule: Rule = () => [
  { severity: "error", code: "test.error", message: "boom", entityType: "room", entityId: "r1" },
];

const warningRule: Rule = () => [
  { severity: "warning", code: "test.warning", message: "meh", entityType: "room", entityId: "r2" },
];

describe("validateModel", () => {
  it("reports ok for a model with no issues", () => {
    const report = validateModel(model, []);
    expect(report.ok).toBe(true);
    expect(report.issues).toEqual([]);
  });

  it("counts errors and warnings separately", () => {
    const report = validateModel(model, [errorRule, warningRule]);
    expect(report.errorCount).toBe(1);
    expect(report.warningCount).toBe(1);
  });

  it("is not ok when any error is present", () => {
    expect(validateModel(model, [errorRule]).ok).toBe(false);
  });

  it("is still ok when only warnings are present — warnings never block publish", () => {
    expect(validateModel(model, [warningRule]).ok).toBe(true);
  });

  it("orders errors before warnings so the important ones surface first", () => {
    const report = validateModel(model, [warningRule, errorRule]);
    expect(report.issues[0]?.severity).toBe("error");
  });
});
