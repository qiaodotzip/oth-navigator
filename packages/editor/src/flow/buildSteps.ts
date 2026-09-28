import { stepForCode, type StepId } from "./checklist";

/**
 * The six build steps and which one owns each validation code. On their own
 * here, below both `floorProgress` and `build/todo`, because a step's tick is
 * read from its to-do list: each needs these, and progress needs the list.
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
 * place could be it, that place is already on Bind places as unbound, and
 * where none could, the answer is to film it in Survey. Listing it too turned
 * Bind places' 11 places into 177 rows.
 */
export function buildStepForCode(code: string): BuildStepId | null {
  if (code === "room.unsurveyed") return null;
  if (code.startsWith("place.")) return "bind";
  const step = stepForCode(code);
  return step ? FROM_CHECKLIST[step] : null;
}
