import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { assembleModel } from "../../model/assemble";
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
      "A first pass of one floor's pathways, worked out from its walkable areas. lines are centre lines in metres, " +
      "each with a width. links join each doorway, lift or stair stop and entrance to the nearest line with a straight " +
      "segment. unconnected lists the ones that could not be joined, and why. Nothing is saved: check it over " +
      "view_plan, then create the pathways you agree with (type pathway, with polyline and widthM).",
    inputSchema: { floor: FLOOR },
    annotations: READ_ONLY,
  }, ({ floor }) => runTool(ctx, async () => {
    const model = await assembleModel(ctx.db);
    const level = levelFor(ctx, model, floor);
    try {
      return replyJson({ floor: level.code, ...suggestPaths(model, level.id) });
    } catch (err) {
      if (err instanceof SurfaceTooLarge) throw new Refusal(`Nothing suggested for ${level.code}. ${err.message}`);
      throw err;
    }
  }));
}
