import type { SetupPrompt } from "./index";

export const drawPaths: SetupPrompt = {
  name: "draw_paths",
  step: "paths",
  title: "Pathways and entrances",
  description: "Step 7 of a floor's setup: draw a first pass of the floor's pathways and entrances, until routes reach its rooms. Takes the floor's code, such as L1.",
  tools: ["step_status", "suggest_paths", "view_plan", "get_floor", "create", "update", "delete", "check_floor", "finish_step"],
  goal: floor => `Goal: routes reach every room on ${floor} that has a door, along pathways, from entrances.`,
  steps: floor => [
    `1. Call \`step_status\` with floor "${floor}", then \`suggest_paths\`: centre lines through the walkable floor with their widths, the short links joining each doorway, stop and entrance to them, and what it couldn't connect.`,
    "2. `suggest_paths` can hand back a busy network on a real floor — around 190 lines on L1 — so trim before you draw: keep the longest lines as each corridor's spine, drop a short side branch unless it reaches a doorway or a stop, and merge near-parallel lines that trace the same corridor twice.",
    "3. Check them over the drawing with `view_plan`. Leave out a line that crosses a wall or a shop, and move one that hugs an edge.",
    '4. `create` the pathways: type "pathway", with an id you choose, levelId, polyline and widthM. Name the ones people say out loud, such as "the link bridge" or "the concourse", with nameEn, and leave the rest unnamed. Create each link as a short pathway too.',
    '5. Entrances: for each place in `get_floor` that is a way in from outside, such as "Gate 4" or "Main entrance", `create` an entrance where it meets the walkable floor: type "entrance", with levelId, roomId (the walkable area it stands in), point and nameEn.',
    `6. Call \`check_floor\` with floor "${floor}". For each area.unreachable error or room.noAccess warning, add a pathway or extend one (\`update\` its polyline), or \`delete\` one of yours that is wrong, then check again.`,
    "What suggest_paths couldn't connect, such as a doorway with no floor traced beyond it, needs a person: say which in your report.",
  ],
  stop: floor => `\`check_floor\` with floor "${floor}" shows no area.unreachable error and no room.noAccess warning, or only ones a person must fix, which you name`,
  example: "Drew 14 pathways (the concourse, the link bridge) and 3 entrances; 2 rooms need a person",
};
