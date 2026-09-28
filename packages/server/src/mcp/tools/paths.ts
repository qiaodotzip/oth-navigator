import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { assembleModel } from "../../model/assemble";
import { MAX_LINK_M } from "../../paths/connect";
import { SurfaceTooLarge } from "../../paths/raster";
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
      "links join each doorway, lift, escalator or stair stop, and entrance to the nearest point on a line it can " +
      `reach in a straight line, within ${MAX_LINK_M} m. Links have no width. unconnected lists the ones that could ` +
      "not be joined, and why. " +
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
