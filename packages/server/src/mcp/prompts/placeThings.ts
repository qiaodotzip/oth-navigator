import type { SetupPrompt } from "./index";

export const placeThings: SetupPrompt = {
  name: "place_things",
  step: "things",
  title: "Places and objects",
  description: "Step 6 of a floor's setup: bind the survey's places to their rooms, and put the objects filmed on the floor on the map. Takes the floor's code, such as L1.",
  tools: ["step_status", "get_floor", "view_plan", "view_frame", "bind_place", "suggest_object_spots", "create", "check_floor", "finish_step"],
  goal: floor => `Goal: the places surveyed on ${floor} are bound to the rooms they are, and the objects filmed on ${floor} are on the map.`,
  steps: floor => [
    `1. Call \`step_status\` with floor "${floor}": its things counts say how many places are left unbound; use its numbers in your report and note. ` +
      "Read `get_floor` part summary, then part places (a place with no roomId is not bound yet), part rooms and part objects, a page at a time.",
    "Places:",
    "2. For each confirmed place not bound yet, and not an object (objectKindId) or a walkway (pathwayKindId), find its room: match the survey's name against the rooms' names, and look with `view_plan` around the room. " +
      "Where the names alone don't settle it, look at the place's frames with `view_frame` (`get_floor`'s places give up to 3 for each). " +
      "Bind when they agree: `bind_place`, with both versions (a version `get_floor` leaves out is 0).",
    "3. Leave a place you can't place with confidence, and name it in your report.",
    "Objects:",
    `4. Call \`suggest_object_spots\` with floor "${floor}". Each suggestion is one object, with the frames it was seen in, the rooms that fixed where it is (anchors), a confidence, and the placement you would pass to \`create\`. It skips what is on the map already, so asking again gives only what is left. unplaced lists the sightings it couldn't place, each with why: name them in your report.`,
    "5. Check each one against its frames (`view_frame`) and the drawing (`view_plan` around one of its rooms). Low confidence is a guess: look hardest at those. A suggestion with no anchors was placed from a frame nearby that had some; if several share one position, don't place them, and name them.",
    '6. `create` each one you agree with: type "placement", with the placement it gives. Move its position or turn its rotationDeg first if you judged them wrong. Leave out the ones you doubt, and say which in your report.',
    "At most 60 binds and 40 objects a run, then report what is left and stop.",
  ],
  stop: floor =>
    `every confirmed place on ${floor} is bound or named in your report, and \`suggest_object_spots\` gives nothing more you would place. ` +
    "If you bound and placed nothing, don't mark the step done: say what stopped you, so a person can fix it and run this again. " +
    "On a run again that finds nothing left to do, finishing is fine when `step_status` shows nothing unbound (things.unbound 0)",
  example: "Bound 88 places, 6 left for a person; placed 23 objects, 4 low confidence",
};
