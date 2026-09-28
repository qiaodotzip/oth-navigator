import type { MapModel, ValidationIssue, ValidationReport } from "@oth/model";
import { issueMessage, portalStops } from "../build/todo";
import { href } from "../route";
import { BUILD_STEPS, buildStepForCode } from "./floorProgress";
import { sortedLevels } from "./floors";

export type Blocker = { message: string; link: string | null; stepLabel: string | null };
export type BlockerGroup = { key: string; label: string; items: Blocker[] };

/**
 * What stops Publish, grouped by floor, each linked to the step that fixes it.
 *
 * Errors only: warnings never block. Building-wide problems (no entrance at
 * all, a lift with no stops) come first and link nowhere, since no one floor
 * owns them.
 */
export function publishBlockers(model: MapModel | null, report: ValidationReport | null): BlockerGroup[] {
  if (!model || !report) return [];
  const errors = report.issues.filter(i => i.severity === "error");
  if (errors.length === 0) return [];

  const levels = sortedLevels(model);
  // The floor an error is fixed on. A lift or stair's error names no floor,
  // but it is fixed at a stop, where the to-do lists it: every new lift has
  // one stop until its next is added, so filing it under the whole building
  // made each one a blocker that linked nowhere.
  const floorOf = (issue: ValidationIssue): string | undefined => {
    if (issue.levelId || issue.entityType !== "portal") return issue.levelId;
    const stops = new Set(portalStops(model, issue.entityId).map(e => e.levelId));
    return levels.find(l => stops.has(l.id))?.id;
  };
  const filed = errors.map(issue => ({ issue, levelId: floorOf(issue) }));

  const groups: BlockerGroup[] = [];
  const building = filed.filter(f => !f.levelId);
  if (building.length > 0) {
    groups.push({
      key: "building",
      label: "Whole building",
      items: building.map(({ issue }) => ({ message: issueMessage(model, issue), link: null, stepLabel: null })),
    });
  }

  for (const level of levels) {
    const here = filed.filter(f => f.levelId === level.id);
    if (here.length === 0) continue;
    groups.push({
      key: level.id,
      label: `${level.code} · ${level.nameEn}`,
      items: here.map(({ issue }) => {
        const step = buildStepForCode(issue.code);
        return {
          message: issueMessage(model, issue),
          link: step ? href({ name: "floor", code: level.code, tab: "build", params: { step } }) : null,
          stepLabel: step ? BUILD_STEPS.find(s => s.id === step)!.label : null,
        };
      }),
    });
  }
  return groups;
}
