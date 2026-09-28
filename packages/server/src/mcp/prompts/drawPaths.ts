import type { SetupPrompt } from "./index";

export const drawPaths: SetupPrompt = {
  name: "draw_paths",
  step: "paths",
  title: "Pathways and entrances",
  description: "Step 7 of a floor's setup: draw a first pass of the floor's pathways and entrances, until routes reach its rooms. Takes the floor's code, such as L1.",
  tools: ["step_status", "suggest_paths", "view_plan", "get_floor", "create", "update", "delete", "check_floor", "finish_step"],
  goal: floor => `Goal: routes reach every room on ${floor}, along pathways, from entrances.`,
  steps: floor => [
    `1. Call \`step_status\` with floor "${floor}". Read \`get_floor\` part summary, then parts entrances, pathways, places and rooms, a page at a time: what is drawn already, the places that are ways in, and each room's centre. The summary gives the floor's id, the levelId every \`create\` needs (\`suggest_paths\` gives it too). Don't add an entrance \`get_floor\` already lists.`,
    '2. Entrances: for each place that is a way in from outside, such as "Gate 4", "Main entrance" or "Entrance from MRT", `create` an entrance where it meets the walkable floor: type "entrance", with levelId, roomId (the walkable area it stands in), point and nameEn. ' +
      "A place has no point of its own: find the gate on the drawing with `view_plan` around the room it is bound to, or along the building's edge, and put the point just inside the walkable area there; a room's centre from `get_floor` is where to start looking. " +
      "If a gate's room is a large open area, you can't tell where the gate is from the room alone: look along the building's edge in that room with `view_plan`. If you still can't place it, name it for a person. " +
      "Do this before calling `suggest_paths`, which only links the entrances that already exist.",
    `3. Call \`suggest_paths\` with floor "${floor}": centre lines through the walkable floor with their widths, the short links joining each doorway, stop and entrance to them, and what it couldn't connect. A line with drawn true runs along a pathway the floor already has: leave it out, and draw the rest.`,
    "4. On a real floor `suggest_paths` gives a busy network (around 140 lines on L1), longest first. Trim it before you draw:",
    '   - network 0 is the main network. A line on any other network is an island cut off from it: leave it out unless a link ends on it, and name it in your report;',
    '   - a line whose ends are both "fork" or "loop" is part of a corridor: keep it;',
    '   - a line with an "end" end stops dead: keep it only if a link ends on it;',
    "   - two lines side by side along one corridor: draw the wider one, not both.",
    '5. Check them over the drawing with `view_plan`, one box (in metres) for every ten lines or so. Leave out a line that crosses a wall or a shop, and move one that hugs an edge. `create` the pathways you keep: type "pathway", with an id you choose, levelId, polyline and widthM. Name the ones people say out loud, such as "the link bridge" or "the concourse", with nameEn, and leave the rest unnamed. Create each link as a short pathway too, unless `get_floor`\'s pathways already has one between the same two points.',
    `6. Call \`check_floor\` with floor "${floor}". Fix any entrance.offFloor error first — it means an entrance you created stands on a wall or off the walkable floor; move it into the open part of a room, or run a pathway through it. Then, for each area.unreachable error or room.noAccess warning, add a pathway or extend one (\`update\` its polyline), or \`delete\` one you created in this run that is wrong, then check again. ` +
      '`check_floor` lists at most 100 problems and says the total; pass codes, such as ["area.unreachable", "entrance.offFloor"], to see just those.',
    "What `suggest_paths` couldn't connect, such as a doorway with no floor traced beyond it, needs a person: say which in your report.",
    "Draw the whole first pass in this run. If you do have to stop, running this again carries on: `suggest_paths` marks drawn the lines the floor has pathways along.",
  ],
  stop: floor =>
    `\`check_floor\` with floor "${floor}" and codes ["area.unreachable", "room.noAccess"] gives none, or only ones a person must fix: ` +
    "give how many, and name up to 20",
  example: "Drew 14 pathways (the concourse, the link bridge) and 3 entrances; 2 rooms need a person",
};
