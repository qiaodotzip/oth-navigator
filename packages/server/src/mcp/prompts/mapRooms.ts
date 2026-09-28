import type { SetupPrompt } from "./index";

export const mapRooms: SetupPrompt = {
  name: "map_rooms",
  step: "rooms",
  title: "Rooms from the PDF",
  description: "Step 5 of a floor's setup: decide the room drafts Find rooms read from the floorplan PDF, and make the stops. Takes the floor's code, such as L1.",
  tools: ["step_status", "list_drafts", "view_plan", "get_floor", "decide_drafts", "make_stop", "check_floor", "finish_step"],
  goal: floor => `Goal: every room draft read from ${floor}'s floorplan PDF is decided, so the floor's rooms are on the map.`,
  steps: floor => [
    `1. Call \`step_status\` with floor "${floor}" to see where its setup stands. Read \`get_floor\` part summary, then part rooms, a page at a time: the rooms already on ${floor}, each with its centre and, for a lift, escalator or stair, its stop.`,
    `2. Call \`list_drafts\` with floor "${floor}": the drafts waiting for a decision, largest first, 50 at a time. onMapAs names a room already on the map that a draft copies; overlaps lists the rooms it lies over, each with its share, how much of the draft is over that room. If it has no drafts at all, and its counts are all 0, nobody has run Find rooms on ${floor} yet: stop and say so, and don't mark the step done. ` +
      "If `list_drafts` gives lineUp, the drawing doesn't line up with the rooms already on the floor, by about dx, dy metres. Decide nothing: stop, say so, and ask a person to line the plan up with the rooms (Build's Floorplan step, Align) and run Find rooms again. Don't mark the step done.",
    "3. Before every `decide_drafts` call, not only the first, look with `view_plan` at every part of the floor its drafts lie in, one box (in metres) per part, until the boxes cover all of them. `view_plan` outlines the rooms already on the map, not the drafts: find each draft by its labelPoint, where its name is printed, and compare names with `get_floor`'s rooms.",
    "4. Decide them with `decide_drafts`, up to 100 at a time. Copy each id exactly as `list_drafts` gives it. A refusal names the draft by its id: fix that one and send the call again.",
    "   - accept a real space. Correct its name to what the drawing or the survey calls it (nameEn), and its kind: room for a shop, office or anything entered through a door; area for open floor people cross; service for back of house; void for a hole in the floor; detail for a column, planter or other thing standing on the floor;",
    '   - before you accept one, check its name against `get_floor`\'s rooms. Never accept a draft whose specific name a room on the floor already has, such as "Fire Command Centre" (a name many spaces share, such as Shop or Store, is not specific): reject it as a copy when that room is where the draft is, or set it aside when the room is elsewhere;',
    "   - reject junk: a label read as a space, a sliver, or a copy of a room already on the map (onMapAs);",
    "   - a draft over an open area is not by itself a reason to set it aside. share is how much of the draft lies over a room, so it is near 1 both for a copy and for a smaller space inside one; a copy is onMapAs already. " +
      "Look at the room beneath with `view_plan` around it: reject the draft when it is the same space as that room (the room's name, or the same outline on the drawing); " +
      'otherwise never accept a draft that lies mostly (share 0.6 or more) inside a room of kind room, unless it is likeAStop: set it aside, reason "Inside <room name>, which may hold two spaces: a person should decide."; ' +
      "accept it when it is a smaller space inside an open area (the room beneath is kind area), such as a shop in a concourse;",
    '   - set aside what a person should decide: a space the drawing leaves open (open is true), or one you can\'t make out. Give each a reason, one line a person reads beside the draft in Build, such as "Open on the drawing: trace it by hand".',
    `5. Lifts, escalators and stairs: Find rooms leaves lifts, escalators and stairs out of its drafts, so look for them among the floor's rooms too. A room named like one, such as "Escalator - 07", "Lift A" or "Stairs", becomes a stop with \`make_stop\`: floor "${floor}", the room's id and version (\`get_floor\`'s rooms and \`decide_drafts\` give both), and kind lift, escalator or stair. \`list_drafts\` marks a draft named like one likeAStop true: accept it first, unless its onMapAs names a room already on the map: make the stop from that room and reject the draft as a copy. Skip a room \`get_floor\` already shows as a stop, and leave a lobby or landing beside one a room. ` +
      'When a name holds two stops, such as "Escalator - 05 Escalator - 06", or `make_stop` refuses a room, leave it and name it in your report.',
    "At most 3 `decide_drafts` calls a run (a refused call decides nothing, so it doesn't count), then report what is left and stop.",
  ],
  stop: floor => `\`list_drafts\` with floor "${floor}" shows none waiting, and every room named like a lift, escalator or stairs is a stop or named in your report`,
  example: "Accepted 180, rejected 20, set aside 15; made 12 stops",
};
