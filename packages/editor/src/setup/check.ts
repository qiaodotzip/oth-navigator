import { live, type Keyframe, type MapModel } from "@oth/model";
import { ConflictError } from "../api/client";
import { SELECTABLE_TYPES, parseSelectParam, selectParam, type Selectable } from "../build/selection";
import type { Selection } from "../state/store";
import { serverWords } from "../ui/failure";
import { CHECK_GROUPS, type CheckGroup, type ClaudeChange } from "./types";

export type CheckSection = { group: CheckGroup | "other"; label: string; rows: ClaudeChange[] };

export const SECTION_LABEL: Record<CheckGroup | "other", string> = {
  rooms: "Rooms made from drafts",
  drafts: "Drafts rejected or set aside",
  names: "Names or kinds changed",
  stops: "Stops made",
  places: "Places bound",
  objects: "Objects placed",
  pathways: "Pathways",
  entrances: "Entrances",
  frames: "Frames binned",
  other: "Other changes",
};

const KNOWN: ReadonlySet<string> = new Set(CHECK_GROUPS);

/**
 * Claude's changes in spec §8's groups, in its order, empty groups left out.
 * Objects placed from a capture-order guess come first: they are the likeliest
 * to be wrong. Anything without a group goes last, so nothing Claude did here
 * is hidden, except its survey labels: those can run to thousands, and Review
 * is their check. They are counted, for a line saying so.
 */
export function checkSections(changes: readonly ClaudeChange[]): { sections: CheckSection[]; labels: number } {
  const groups: (CheckGroup | "other")[] = [...CHECK_GROUPS, "other"];
  const sections = groups.map(group => {
    let rows = changes.filter(c => (group === "other" ? !KNOWN.has(c.group) && c.group !== "labels" : c.group === group));
    if (group === "objects") rows = [...rows.filter(c => c.confidence === "low"), ...rows.filter(c => c.confidence !== "low")];
    return { group, label: SECTION_LABEL[group], rows };
  });
  return {
    sections: sections.filter(s => s.rows.length > 0),
    labels: changes.filter(c => c.group === "labels").length,
  };
}

/**
 * What Show selects for a change, if it is still on this floor. A stop is
 * shown at its end here, and a place at the room it is bound to. A draft is
 * not on the map, and Show has nothing to select.
 */
export function showTarget(
  model: MapModel | null, change: Pick<ClaudeChange, "entityType" | "entityId">, levelId: string,
): NonNullable<Selection> | null {
  if (!model) return null;
  const { entityType: type, entityId: id } = change;
  let wanted: NonNullable<Selection> | null = null;
  if (type === "place") {
    const roomId = live(model.places).find(p => p.id === id)?.roomId;
    wanted = roomId ? { type: "room", id: roomId } : null;
  } else if (type === "portal") {
    const stop = live(model.portalEndpoints).find(e => e.portalId === id && e.levelId === levelId);
    wanted = stop ? { type: "portalEndpoint", id: stop.id } : null;
  } else if (SELECTABLE_TYPES.has(type)) {
    wanted = { type: type as Selectable, id };
  }
  // Only what is still there, on this floor.
  return wanted ? parseSelectParam(selectParam(wanted), model, levelId) : null;
}

/** Up to three frames an object was placed from, shown beside it (spec §8). */
export function objectFrames(model: MapModel | null, change: Pick<ClaudeChange, "entityType" | "entityId">): Keyframe[] {
  if (!model || change.entityType !== "placement") return [];
  // Undone, the placement is deleted; its frames still say what it was.
  const placement = model.placements.find(p => p.id === change.entityId);
  if (!placement) return [];
  const sightings = new Map(model.sightings.map(s => [s.id, s]));
  const frames = new Map(live(model.keyframes).map(k => [k.id, k]));
  const out: Keyframe[] = [];
  for (const id of placement.sightingIds) {
    const frame = frames.get(sightings.get(id)?.keyframeId ?? "");
    if (frame && !out.includes(frame)) out.push(frame);
  }
  return out.slice(0, 3);
}

/**
 * Why an undo was refused, in the server's words, without a closing full
 * stop; null when it wasn't a refusal. A 409 is a refusal: something since
 * depends on the change (spec §8). Anything else is a failure to report.
 */
export function undoRefusal(err: unknown): string | null {
  if (!(err instanceof ConflictError)) return null;
  const reason = (err.body as { reason?: unknown } | null)?.reason;
  if (typeof reason === "string" && reason.trim() !== "") return reason.trim().replace(/\.$/, "");
  return serverWords(err) ?? "it has changed since Claude made it";
}
