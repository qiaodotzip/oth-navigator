import type { SetupPrompt } from "./index";

export const drawPaths: SetupPrompt = {
  name: "draw_paths",
  step: "paths",
  title: "Pathways and entrances",
  description: "Step 7 of a floor's setup: draw a first pass of the floor's pathways and entrances, until routes reach its rooms. Takes the floor's code, such as L1.",
  tools: ["step_status", "suggest_paths", "view_plan", "get_floor", "create", "update", "delete", "check_floor", "finish_step"],
  goal: floor => `Goal: routes reach every room on ${floor} that has a door, along pathways, from entrances.`,
  steps: floor => [
    `1. Call \`step_status\` with floor "${floor}". Call \`get_floor\` too: its floor.id is the levelId, and it lists the pathways and entrances the floor has. \`suggest_paths\` doesn't know what is drawn: if the floor already has pathways, don't draw its lines again; go to step 6 and add only what \`check_floor\` asks for. Don't add an entrance \`get_floor\` already lists.`,
    '2. Entrances: for each place in `get_floor` that is a way in from outside, such as "Gate 4" or "Main entrance", `create` an entrance where it meets the walkable floor: type "entrance", with levelId, roomId (the walkable area it stands in), point and nameEn. Do this before calling `suggest_paths`, which only links the entrances that already exist.',
    `3. Call \`suggest_paths\` with floor "${floor}": centre lines through the walkable floor with their widths, the short links joining each doorway, stop and entrance to them, and what it couldn't connect.`,
    "4. `suggest_paths` can hand back a busy network on a real floor — around 190 lines on L1 — so trim before you draw: keep the longest lines as each corridor's spine, drop a short side branch unless it reaches a doorway or a stop, and merge near-parallel lines that trace the same corridor twice.",
    '5. Check them over the drawing with `view_plan`. Leave out a line that crosses a wall or a shop, and move one that hugs an edge. `create` the pathways you keep: type "pathway", with an id you choose, levelId, polyline and widthM. Name the ones people say out loud, such as "the link bridge" or "the concourse", with nameEn, and leave the rest unnamed. Create each link as a short pathway too.',
    `6. Call \`check_floor\` with floor "${floor}". Fix any entrance.offFloor error first — it means an entrance you created stands on a wall or off the walkable floor; move it into the open part of a room, or run a pathway through it. Then, for each area.unreachable error or room.noAccess warning, add a pathway or extend one (\`update\` its polyline), or \`delete\` one you created in this run that is wrong, then check again.`,
    "What `suggest_paths` couldn't connect, such as a doorway with no floor traced beyond it, needs a person: say which in your report.",
    "At most 3 batches a run, then report what is left and stop.",
  ],
  stop: floor => `\`check_floor\` with floor "${floor}" shows no area.unreachable error and no room.noAccess warning, or only ones a person must fix, which you name`,
  example: "Drew 14 pathways (the concourse, the link bridge) and 3 entrances; 2 rooms need a person",
};
