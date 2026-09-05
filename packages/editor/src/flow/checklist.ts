import type { MapModel, ValidationIssue, ValidationReport } from "@oth/model";
import type { LevelImage } from "../api/client";
import type { Tool } from "../state/store";

export type StepId = "floorplan" | "scale" | "rooms" | "connect" | "entrances" | "portals";
export type StepStatus = "todo" | "done";

export type ChecklistStep = {
  id: StepId;
  label: string;
  status: StepStatus;
  detail: string;
  /** The tool this step is done with, if any. */
  tool: Tool | null;
  issues: ValidationIssue[];
};

export type ChecklistInput = {
  model: MapModel | null;
  levelId: string | null;
  image: LevelImage | null;
  report: ValidationReport | null;
};

/**
 * Which step owns a validation code.
 *
 * This is the whole point of the checklist: nine identical
 * `level.portals.none` warnings become the status of one step per level
 * instead of a wall of text nobody reads.
 */
export function stepForCode(code: string): StepId | null {
  if (code.startsWith("room.footprint") || code.startsWith("room.hole")) return "rooms";
  if (code === "room.name.missing" || code === "room.id.duplicate") return "rooms";
  if (code === "room.unreachable" || code.startsWith("doorway.")) return "connect";
  if (code.startsWith("building.entrances") || code.startsWith("entrance.")) return "entrances";
  if (code.startsWith("level.portals") || code.startsWith("portal")) return "portals";
  return null;
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function levelChecklist(input: ChecklistInput): ChecklistStep[] {
  const { model, levelId, image, report } = input;

  const rooms = model && levelId ? model.rooms.filter(r => r.levelId === levelId) : [];
  const doorways = model && levelId ? model.doorways.filter(d => d.levelId === levelId) : [];
  const entrances = model?.entrances ?? [];
  const endpoints = model && levelId ? model.portalEndpoints.filter(p => p.levelId === levelId) : [];

  // Issues on this level, plus building-wide ones, which carry no level.
  const relevant = (report?.issues ?? []).filter(i => i.levelId == null || i.levelId === levelId);
  const byStep = new Map<StepId, ValidationIssue[]>();
  for (const issue of relevant) {
    const step = stepForCode(issue.code);
    if (!step) continue;
    byStep.set(step, [...(byStep.get(step) ?? []), issue]);
  }
  const issuesFor = (id: StepId) => byStep.get(id) ?? [];

  const unreachable = issuesFor("connect").filter(i => i.code === "room.unreachable");

  return [
    {
      id: "floorplan",
      label: "Add floorplan",
      status: image ? "done" : "todo",
      detail: image ? image.filename : "none yet",
      tool: null,
      issues: [],
    },
    {
      id: "scale",
      label: "Set the scale",
      status: image?.metresPerPixel != null ? "done" : "todo",
      detail:
        image?.metresPerPixel != null
          ? `${image.metresPerPixel.toFixed(4)} m per pixel`
          : "not set",
      tool: "calibrate",
      issues: [],
    },
    {
      id: "rooms",
      label: "Trace rooms",
      status: rooms.length > 0 ? "done" : "todo",
      detail: rooms.length > 0 ? plural(rooms.length, "room") : "none yet",
      tool: "draw-room",
      issues: issuesFor("rooms"),
    },
    {
      id: "connect",
      label: "Connect them",
      // A single room has nothing to be connected to, so it counts as done.
      status:
        unreachable.length === 0 && (rooms.length <= 1 || doorways.length > 0) ? "done" : "todo",
      detail:
        unreachable.length > 0
          ? `${plural(unreachable.length, "room")} unreachable`
          : plural(doorways.length, "doorway"),
      tool: "draw-doorway",
      issues: issuesFor("connect"),
    },
    {
      id: "entrances",
      label: "Mark entrances",
      // Building-wide: an entrance on L1 is what makes the whole building reachable.
      status: entrances.length > 0 ? "done" : "todo",
      detail: entrances.length > 0 ? plural(entrances.length, "entrance") : "none yet",
      tool: "place-entrance",
      issues: issuesFor("entrances"),
    },
    {
      id: "portals",
      label: "Lifts and stairs",
      status: endpoints.length > 0 ? "done" : "todo",
      detail:
        endpoints.length > 0
          ? `${plural(endpoints.length, "endpoint")} here`
          : "none serving this level",
      tool: "place-portal",
      issues: issuesFor("portals"),
    },
  ];
}
