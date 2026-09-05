import type { MapModel, ValidationIssue, ValidationReport } from "@oth/model";
import type { LevelImage } from "../api/client";
import type { Tool } from "../state/store";

export type StepId =
  | "floorplan" | "scale" | "rooms" | "connect" | "entrances" | "portals" | "dressing";
export type StepStatus = "todo" | "done";

export type ChecklistStep = {
  id: StepId;
  label: string;
  status: StepStatus;
  detail: string;
  /**
   * The tools this step is done with. More than one where a step is genuinely
   * two gestures — an area and a room are drawn differently but traced in the
   * same pass — and empty where the step is done in a panel instead.
   */
  tools: Tool[];
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
  // A place with no room, or a room nobody has seen, is answered while tracing.
  if (code.startsWith("place.") || code === "room.unsurveyed") return "rooms";
  // A room with no access is fixed by drawing a pathway to it, so it belongs
  // to the pathways step rather than to tracing.
  if (code === "area.unreachable" || code === "room.noAccess") return "connect";
  if (code.startsWith("pathway.") || code.startsWith("doorway.")) return "connect";
  if (code.startsWith("building.entrances") || code.startsWith("entrance.")) return "entrances";
  if (code.startsWith("level.portals") || code.startsWith("portal")) return "portals";
  // A detail with no model, or a model that overhangs one, is fixed in Dressing.
  if (code.startsWith("detail.") || code.startsWith("placement.")) return "dressing";
  return null;
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function levelChecklist(input: ChecklistInput): ChecklistStep[] {
  const { model, levelId, image, report } = input;

  const rooms = model && levelId ? model.rooms.filter(r => r.levelId === levelId) : [];
  const pathways = model && levelId ? model.pathways.filter(p => p.levelId === levelId) : [];
  const details = rooms.filter(r => r.kind === "detail");
  const dressed = new Set((model?.placements ?? []).map(p => p.roomId));
  const undressed = details.filter(d => !dressed.has(d.id)).length;
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

  const unreachable = issuesFor("connect").filter(i => i.code === "area.unreachable");

  return [
    {
      id: "floorplan",
      label: "Add floorplan",
      status: image ? "done" : "todo",
      detail: image ? image.filename : "none yet",
      tools: [],
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
      tools: ["calibrate"],
      issues: [],
    },
    {
      id: "rooms",
      label: "Trace areas and rooms",
      status: rooms.length > 0 ? "done" : "todo",
      detail: rooms.length > 0 ? plural(rooms.length, "room") : "none yet",
      tools: ["draw-area", "draw-room"],
      issues: issuesFor("rooms"),
    },
    {
      id: "connect",
      label: "Draw pathways",
      // Pathways are what make anything reachable now; doorways are a leftover
      // primitive that no longer drives the flow.
      //
      // A lone space needs no pathway — an entrance inside it is enough. More
      // than one, and something has to join them. Zero spaces is not done:
      // showing "done" before anything exists reads as already handled.
      status:
        rooms.length > 0 && unreachable.length === 0 && (rooms.length === 1 || pathways.length > 0)
          ? "done"
          : "todo",
      detail:
        unreachable.length > 0
          ? `${plural(unreachable.length, "space")} unreachable`
          : plural(pathways.length, "pathway"),
      tools: ["draw-pathway"],
      issues: issuesFor("connect"),
    },
    {
      id: "entrances",
      label: "Mark entrances",
      // Building-wide: an entrance on L1 is what makes the whole building reachable.
      status: entrances.length > 0 ? "done" : "todo",
      detail: entrances.length > 0 ? plural(entrances.length, "entrance") : "none yet",
      tools: ["place-entrance"],
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
      tools: ["place-portal"],
      issues: issuesFor("portals"),
    },
    {
      id: "dressing",
      label: "Add details",
      // Dressing carries no status dot in the panel — a level is not incomplete
      // without polish — so this status is only ever the type's requirement.
      status: undressed === 0 ? "done" : "todo",
      detail:
        details.length === 0
          ? "none yet"
          : `${plural(details.length, "detail")}, ${undressed} undressed`,
      tools: ["draw-detail"],
      issues: issuesFor("dressing"),
    },
  ];
}
