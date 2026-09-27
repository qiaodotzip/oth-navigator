import type { MapModel, ValidationReport } from "@oth/model";
import { href } from "../route";
import { BUILD_STEPS, buildStepForCode } from "./floorProgress";
import { sortedLevels } from "./floors";

export type Blocker = { message: string; link: string | null; stepLabel: string | null };
export type BlockerGroup = { key: string; label: string; items: Blocker[] };

/**
 * What stops Publish, grouped by floor, each linked to the step that fixes it.
 *
 * Errors only: warnings never block. Building-wide problems (no entrance at
 * all, a lift that connects nothing) come first and link nowhere, since no one
 * floor owns them.
 */
export function publishBlockers(model: MapModel | null, report: ValidationReport | null): BlockerGroup[] {
  if (!model || !report) return [];
  const errors = report.issues.filter(i => i.severity === "error");
  if (errors.length === 0) return [];

  const groups: BlockerGroup[] = [];
  const building = errors.filter(i => !i.levelId);
  if (building.length > 0) {
    groups.push({
      key: "building",
      label: "Whole building",
      items: building.map(i => ({ message: i.message, link: null, stepLabel: null })),
    });
  }

  for (const level of sortedLevels(model)) {
    const here = errors.filter(i => i.levelId === level.id);
    if (here.length === 0) continue;
    groups.push({
      key: level.id,
      label: `${level.code} · ${level.nameEn}`,
      items: here.map(i => {
        const step = buildStepForCode(i.code);
        return {
          message: i.message,
          link: step ? href({ name: "floor", code: level.code, tab: "build", params: { step } }) : null,
          stepLabel: step ? BUILD_STEPS.find(s => s.id === step)!.label : null,
        };
      }),
    });
  }
  return groups;
}
