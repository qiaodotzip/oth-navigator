import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { assembleModel } from "../../model/assemble";
import { MAX_LINK_M } from "../../paths/connect";
import { GUESS_INSET_M, OUTWARD_M } from "../../paths/entrances";
import { SurfaceTooLarge } from "../../paths/raster";
import { CROSS_M, REACH_M } from "../../paths/reach";
import { suggestPaths } from "../../paths/suggest";
import type { ToolContext } from "../context";
import { Refusal, replyJson, runTool } from "../results";
import { FLOOR, READ_ONLY, levelFor } from "./read";

/** Spec §7.3: the pathway first pass, for the draw_paths step (§4.1 step 7). */
export function registerPathTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool("suggest_paths", {
    title: "Suggest pathways",
    description:
      "A first pass of one floor's pathways, worked out from its walkable areas. Nothing is saved. " +
      "lines are centre lines in metres, longest first. A line breaks only at a fork, and runs on through a fork " +
      "where it bends gently, so a straight aisle is one line. Each has a widthM. A pathway opens its full width " +
      "wherever it runs, so where a line crosses from one room into another, check view_plan shows an opening there. " +
      "ends says what each end of a line meets: fork (other lines), end (nothing) or loop (the line closes on itself). " +
      "network numbers the lines that join up, 0 for the network with the most length. A detached network " +
      "(network above 0) usually needs a link to the main one, or should be left out, because an unreachable " +
      "pathway blocks Publish. " +
      "drawn is true when the floor already has a pathway along the line (70% of it within that pathway's half " +
      "width and a metre, running within 30° of it): leave those out, so a second run draws only what is still " +
      "missing. A line that only crosses a pathway, or branches off one, is not drawn. " +
      `reaches lists the rooms a line's "end" ends lie inside or within ${REACH_M} m of, less the rooms its midpoint ` +
      "lies in, which it runs within rather than into: on a floor with no doorways, a dead end into a room is that " +
      `room's way in. crosses lists the rooms of kind room a line runs more than ${CROSS_M} m ` +
      "inside: a pathway there opens the room's walls. " +
      "links join each doorway, lift, escalator or stair stop, and entrance to the nearest point on a line it can " +
      `reach in a straight line, within ${MAX_LINK_M} m. Links have no width. unconnected lists the ones that could ` +
      "not be joined, and why. Only entrances that exist are linked, so call it again after creating them. " +
      "entranceGuesses gives each confirmed place named as a gate, entrance, exit or way in, bound to a room and with " +
      `no entrance of its name yet, a point ${GUESS_INSET_M} m inside that room on its longest stretch of outline with ` +
      `no room ${OUTWARD_M} m beyond it, the building's outside: a guess a person moves in Check when the drawing shows ` +
      "nothing better. " +
      "Check it over view_plan, then create the pathways you agree with: type pathway, with the reply's levelId, " +
      "a polyline and a widthM.",
    inputSchema: { floor: FLOOR },
    annotations: READ_ONLY,
  }, ({ floor }) => runTool(ctx, async () => {
    const model = await assembleModel(ctx.db);
    const level = levelFor(ctx, model, floor);
    try {
      return replyJson({ floor: level.code, levelId: level.id, ...suggestPaths(model, level.id) });
    } catch (err) {
      if (err instanceof SurfaceTooLarge) throw new Refusal(`Nothing suggested for ${level.code}. ${err.message}`);
      throw err;
    }
  }));
}
