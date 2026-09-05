import type { ValidationIssue } from "@oth/model";
import type { ChecklistStep, StepId, StepStatus } from "./checklist";

export type SectionId = "floorplan" | "rooms" | "connect" | "entrances" | "portals" | "dressing";

export type StepSection = {
  id: SectionId;
  label: string;
  /** Null for a section that is optional polish rather than a required step. */
  status: StepStatus | null;
  detail: string;
  steps: ChecklistStep[];
  issues: ValidationIssue[];
};

/** Which checklist steps live under which section header. */
const MEMBERS: Record<Exclude<SectionId, "dressing">, StepId[]> = {
  floorplan: ["floorplan", "scale"],
  rooms: ["rooms"],
  connect: ["connect"],
  entrances: ["entrances"],
  portals: ["portals"],
};

const LABELS: Record<SectionId, string> = {
  floorplan: "Floorplan",
  rooms: "Areas & rooms",
  connect: "Pathways",
  entrances: "Entrances",
  portals: "Lifts & stairs",
  dressing: "Dressing",
};

/**
 * Groups the checklist into collapsible sections, so a section owns its
 * controls instead of scattering them down one long scroll.
 *
 * "Add floorplan" and "Set the scale" belong under one Floorplan header: they
 * are two halves of the same job, and splitting them made the panel read as
 * six unrelated errands.
 *
 * Dressing has no checklist step because placed assets are optional polish, not
 * something a level is incomplete without — so it carries no status dot.
 */
export function stepSections(steps: readonly ChecklistStep[]): StepSection[] {
  const byId = new Map(steps.map(s => [s.id, s]));

  const required = (Object.keys(MEMBERS) as Exclude<SectionId, "dressing">[]).map(id => {
    const members = MEMBERS[id].map(sid => byId.get(sid)).filter((s): s is ChecklistStep => !!s);
    return {
      id,
      label: LABELS[id],
      // A section is done only when every step under it is.
      status: (members.every(s => s.status === "done") ? "done" : "todo") as StepStatus,
      // The last unfinished member's detail is the most useful summary; if all
      // are done, the last one's is.
      detail: (members.find(s => s.status === "todo") ?? members[members.length - 1])?.detail ?? "",
      steps: members,
      issues: members.flatMap(s => s.issues),
    };
  });

  const dressing = byId.get("dressing");

  return [
    ...required,
    {
      id: "dressing",
      label: LABELS.dressing,
      // Deliberately no status: placed assets are polish, not something a level
      // is incomplete without. It still carries its own warnings and its tool.
      status: null,
      detail: dressing?.detail ?? "",
      steps: dressing ? [dressing] : [],
      issues: dressing?.issues ?? [],
    },
  ];
}

/** The first unfinished section — the one the panel opens by default. */
export function nextSectionId(sections: readonly StepSection[]): SectionId | null {
  return sections.find(s => s.status === "todo")?.id ?? null;
}
