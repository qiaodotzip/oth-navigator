import type { SetupPrompt } from "./index";

export const drawPaths: SetupPrompt = {
  name: "draw_paths",
  step: "paths",
  title: "Pathways and entrances",
  description: "Step 7 of a floor's setup: draw a first pass of the floor's pathways and entrances, until routes reach its rooms. Takes the floor's code, such as L1.",
  tools: ["step_status", "suggest_paths", "view_plan", "get_floor", "create", "update", "delete", "check_floor", "finish_step"],
  goal: floor => `Goal: routes reach every room on ${floor}, along pathways, from entrances.`,
  steps: floor => [
    `1. Call \`step_status\` with floor "${floor}". Read \`get_floor\` part summary, then parts entrances, pathways, places and rooms, a page at a time. The summary gives the floor's id, the levelId every \`create\` needs (\`suggest_paths\` gives it too). Don't add an entrance \`get_floor\` already lists.`,
    `2. Call \`suggest_paths\` with floor "${floor}" now, before any entrance: its lines, links, what it couldn't connect, and entranceGuesses, a point for each gate or entrance place bound to a room.`,
    '3. Entrances: for each place that is a way in from outside, such as "Gate 4", "Main entrance" or "Entrance from MRT", `create` an entrance: type "entrance", with levelId, roomId (the walkable area it stands in), point and nameEn, the place\'s name. ' +
      "Look along that room's edge with `view_plan`: where the drawing shows the gate, put the point just inside the walkable area there; where it shows nothing better, use the entranceGuesses point. Never leave the floor with no entrances while entranceGuesses has some; name for a person a way in with neither. " +
      "Name each entrance you placed from a guess in your report, for a person to move in Check. " +
      `Then call \`suggest_paths\` with floor "${floor}" again: it only links the entrances that already exist.`,
    "4. On a real floor `suggest_paths` gives a busy network (around 140 lines on L1), longest first. A line with drawn true runs along a pathway the floor already has: leave it out, and draw the rest. Trim the others before you draw:",
    '   - network 0 is the main network. A line on any other network is an island cut off from it: leave it out unless a link ends on it, and name it in your report;',
    '   - a line whose ends are both "fork" or "loop" is part of a corridor: keep it;',
    '   - a line with an "end" end stops dead: keep it if a link ends on it or its reaches is not empty (on a floor with no doorways, a dead end into a room is that room\'s way in);',
    "   - leave out a line whose crosses is not empty, unless `view_plan` shows that room is open floor;",
    "   - two lines side by side along one corridor: draw the wider one, not both.",
    '5. Check them over the drawing with `view_plan`, one box (in metres) for every ten lines or so. Leave out a line that crosses a wall or a shop, and move one that hugs an edge. `create` the pathways you keep: type "pathway", with an id you choose, levelId, polyline and widthM. Give nameEn only to the ones people say out loud, such as "the concourse". Create each link as a short pathway too, unless `get_floor`\'s pathways already has one between the same two points.',
    `6. Call \`check_floor\` with floor "${floor}". Fix any entrance.offFloor error first, an entrance standing on a wall or off the walkable floor: move it into the open part of a room. ` +
      "`check_floor` lists at most 100 problems and says the total; pass codes to see just those.",
    `7. The loop: call \`check_floor\` with floor "${floor}" and codes ["area.unreachable", "room.noAccess"]. For each room it lists, draw a line you left out only when it is on network 0, its crosses is empty and its reaches has that room. ` +
      "For a room on an island, first draw a short bridge from the nearest drawn line, only where `view_plan` shows open floor between them, then that island's lines. " +
      "Otherwise draw a short pathway into the room, or name it for a person. `update` a polyline to extend it, or `delete` one you created in this run that is wrong. " +
      "Then call `check_floor` again: that is one round. Do at most 5 rounds, and stop early only when a round reaches no new room: don't stop while `check_floor` lists a room you can still reach.",
    "What `suggest_paths` couldn't connect, such as a doorway with no floor traced beyond it, needs a person: say which in your report.",
    "Draw the whole first pass in this run. If you do have to stop, running this again carries on: `suggest_paths` marks drawn the lines the floor has pathways along.",
  ],
  stop: floor =>
    `\`check_floor\` with floor "${floor}" and codes ["area.unreachable", "room.noAccess"] gives none, or only ones a person must fix: ` +
    "give how many, and name up to 20",
  example: "Drew 14 pathways (the concourse, the link bridge) and 3 entrances; 2 rooms need a person",
};
