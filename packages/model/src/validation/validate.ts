import type { MapModel } from "../schema/model";
import { referenceRules } from "./rules/references";
import { structureRules } from "./rules/structure";
import type { Rule, ValidationReport } from "./types";

export const ALL_RULES: Rule[] = [...structureRules, ...referenceRules];

/**
 * Runs every rule and sorts errors first. The publish gate refuses on
 * `ok === false`; the editor's validation panel shows the same report live.
 */
export function validateModel(model: MapModel, rules: Rule[] = ALL_RULES): ValidationReport {
  const issues = rules.flatMap(rule => rule(model));
  issues.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "error" ? -1 : 1));
  const errorCount = issues.filter(i => i.severity === "error").length;
  return {
    issues,
    errorCount,
    warningCount: issues.length - errorCount,
    ok: errorCount === 0,
  };
}
