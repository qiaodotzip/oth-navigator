import type { SetupPrompt } from "./index";

export const mapRooms: SetupPrompt = {
  name: "map_rooms",
  step: "rooms",
  title: "Rooms from the PDF",
  description: "Step 5 of a floor's setup: decide the room drafts Find rooms read from the floorplan PDF, and make the stops. Takes the floor's code, such as L1.",
  tools: ["step_status", "list_drafts", "view_plan", "get_floor", "decide_drafts", "make_stop", "finish_step"],
  goal: floor => `Goal: every room draft read from ${floor}'s floorplan PDF is decided, so the floor's rooms are on the map.`,
  steps: floor => [
    `1. Call \`step_status\` with floor "${floor}" to see where its setup stands.`,
    `2. Call \`list_drafts\` with floor "${floor}": the drafts waiting, largest first, 50 at a time. onMapAs names a room already on the map that a draft copies, and overlaps says it lies over rooms. If it has no drafts at all, and its counts are all 0, nobody has run Find rooms on ${floor} yet: stop and say so.`,
    "3. Before you decide, look at the drafts over the drawing with `view_plan`, a part at a time (box, in metres), and compare names with `get_floor`.",
    "4. Decide them with `decide_drafts`, up to 100 at a time:",
    "   - accept a real space. Correct its name to what the drawing or the survey calls it (nameEn), and its kind: room for a shop, office or anything entered through a door; area for open floor people cross; service for back of house; void for a hole in the floor; detail for a column, planter or other thing standing on the floor;",
    "   - reject junk: a label read as a space, a sliver, or a copy of a room already on the map (onMapAs);",
    "   - set aside what a person should decide: a space the drawing leaves open (open is true), a draft that lies over rooms without being a copy of one (overlaps true, onMapAs null), or one you can't make out. Say which and why in your report.",
    `5. Lifts, escalators and stairs: \`list_drafts\` marks a draft likeAStop true when it is named like one, such as "Escalator - 07", "Lift A" or "Stairs". Once such a draft is a room, turn it into a stop with \`make_stop\`: floor "${floor}", the room's id and version (\`decide_drafts\` and \`get_floor\` give both), and kind lift, escalator or stair. A lobby or landing beside one stays a room.`,
    "At most 3 batches a run, then report what is left and stop.",
  ],
  stop: floor => `\`list_drafts\` with floor "${floor}" shows none waiting, and every room named like a lift, escalator or stairs is a stop`,
  example: "Accepted 180, rejected 20, set aside 15; made 12 stops",
};
