import { live, placeLevels, type MapModel, type Place } from "@oth/model";
import { stepForCode, type StepId } from "./checklist";

/**
 * The six build steps, which one owns each validation code, and which places
 * Bind places is about. On their own here, below both `floorProgress` and
 * `build/todo`, because a step's tick is read from its to-do list: each needs
 * these, and progress needs the list.
 */

export type BuildStepId = "floorplan" | "rooms" | "pathways" | "entrances" | "bind" | "dressing";

/** The six build steps, in the order a floor is built, with what "next" says for each. */
export const BUILD_STEPS: ReadonlyArray<{ id: BuildStepId; label: string; next: string }> = [
  { id: "floorplan", label: "Floorplan", next: "add the floorplan and set its scale" },
  { id: "rooms", label: "Areas & rooms", next: "trace areas and rooms" },
  { id: "pathways", label: "Pathways", next: "draw pathways" },
  { id: "entrances", label: "Entrances & lifts", next: "mark entrances, lifts and stairs" },
  { id: "bind", label: "Bind places", next: "bind surveyed places to rooms" },
  { id: "dressing", label: "Dressing", next: "dress the details" },
];

const FROM_CHECKLIST: Record<StepId, BuildStepId> = {
  floorplan: "floorplan",
  scale: "floorplan",
  rooms: "rooms",
  connect: "pathways",
  entrances: "entrances",
  portals: "entrances",
  dressing: "dressing",
};

/**
 * Which build step owns a validation code. A place with no room, or bound to
 * one its neighbours disagree with, is answered by binding.
 *
 * A room nobody has filmed (`room.unsurveyed`) is no step's: where a surveyed
 * place could be it, that place is already on Bind places as waiting (see
 * `floorUnits`), and where none could, the answer is to film it in Survey.
 * Listing it too turned Bind places' 11 places into 177 rows.
 */
export function buildStepForCode(code: string): BuildStepId | null {
  if (code === "room.unsurveyed") return null;
  if (code.startsWith("place.")) return "bind";
  const step = stepForCode(code);
  return step ? FROM_CHECKLIST[step] : null;
}

/** One floor's surveyed units: those with their room, and those waiting for one. */
export type FloorUnits = { bound: Place[]; waiting: Place[] };

/**
 * The places Bind places is about on one floor. Its picker, its tick and its
 * to-do list all read this one rule, so they cannot disagree about a place.
 *
 * - A unit is a confirmed place that is not a walkway. A proposal is still
 *   Review's to decide, and a walkway is built as a path, not bound to a room.
 * - A unit is bound only while its room is on the map. Deleting a room leaves
 *   its place naming it, and the validator asks only that some room be named.
 *   Counting that as bound would drop the place from the picker, tick the
 *   step and file its to-do nowhere, so a room deleted to be drawn again
 *   (L1's concourse, with Gates 2–6) would lose its places for good.
 * - A bound unit is on its room's floor. One waiting for a room is on its own
 *   floor, or the one it was filmed on. `undefined` asks for the units no
 *   floor claims.
 *
 * `levels` saves a second pass when the caller already has them.
 */
export function floorUnits(
  model: MapModel,
  levelId: string | undefined,
  levels: Map<string, string | undefined> = placeLevels(model),
): FloorUnits {
  const roomFloor = new Map(live(model.rooms).map(r => [r.id, r.levelId]));
  const units: FloorUnits = { bound: [], waiting: [] };
  for (const place of live(model.places)) {
    if (place.status !== "confirmed" || place.pathwayKindId) continue;
    const bound = place.roomId ? roomFloor.get(place.roomId) : undefined;
    if (bound !== undefined) {
      if (bound === levelId) units.bound.push(place);
    } else if (levels.get(place.id) === levelId) {
      units.waiting.push(place);
    }
  }
  return units;
}
