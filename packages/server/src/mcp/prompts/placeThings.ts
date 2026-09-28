import type { SetupPrompt } from "./index";

export const placeThings: SetupPrompt = {
  name: "place_things",
  step: "things",
  title: "Places and objects",
  description: "Step 6 of a floor's setup: bind the survey's places to their rooms, and put the objects filmed on the floor on the map. Takes the floor's code, such as L1.",
  tools: ["step_status", "get_floor", "view_plan", "view_frame", "bind_place", "suggest_object_spots", "create", "finish_step"],
  goal: floor => `Goal: the places surveyed on ${floor} are bound to the rooms they are, and the objects filmed on ${floor} are on the map.`,
  steps: floor => [
    `1. Call \`step_status\` with floor "${floor}", then \`get_floor\`: its rooms, the places surveyed on it (a place with roomId null is not bound yet), the kinds of object, and the objects already on the floor.`,
    "Places:",
    "2. For each confirmed place not bound yet, and not an object (objectKindId set) or a walkway, find its room: match the survey's name against the rooms' names, look at the room with `view_plan` around it, and at the place's frames with `view_frame` when the names don't agree. Then `bind_place` it, with both versions.",
    "3. Leave a place you can't place with confidence, and name it in your report.",
    "Objects:",
    `4. Call \`suggest_object_spots\` with floor "${floor}". Each suggestion is one object, with the frames it was seen in, the rooms that fixed where it is, a confidence, and the placement to create. It skips what is on the map already, so asking again gives only what is left.`,
    "5. Check each one against its frames (`view_frame`) and the drawing (`view_plan` around one of its rooms). Low confidence is a guess from filming order: look hardest at those.",
    '6. `create` each one you agree with: type "placement", with the placement it gives. Move its position or turn its rotationDeg first if you judged them wrong. Leave out the ones you doubt, and say which in your report.',
  ],
  stop: floor => `every confirmed place on ${floor} is bound or named in your report, and \`suggest_object_spots\` gives nothing more you would place`,
  example: "Bound 88 places, 6 left for a person; placed 23 objects, 4 low confidence",
};
