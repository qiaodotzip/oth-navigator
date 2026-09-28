import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { users } from "../../db/schema";
import { assembleModel } from "../../model/assemble";
import type { ToolContext } from "../context";
import { replyJson, runTool } from "../results";
import { summariseFloors } from "../views";

/** Read tools carry readOnlyHint, so Claude Code need not ask before each (spec §6.3). */
export const READ_ONLY = { readOnlyHint: true } as const;

export async function teamNames(ctx: ToolContext): Promise<Map<string, string>> {
  const rows = await ctx.db.select({ id: users.id, name: users.displayName }).from(users);
  return new Map(rows.map(r => [r.id, r.name]));
}

export function registerReadTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool("list_floors", {
    title: "List floors",
    description:
      "Every floor, lowest first: its id and code, who owns it, and how far its map has come " +
      "(rooms drawn, surveyed places confirmed and still proposed, and confirmed places bound to a room). Start here.",
    inputSchema: {},
    annotations: READ_ONLY,
  }, () => runTool(ctx, async () => replyJson(summariseFloors(await assembleModel(ctx.db), await teamNames(ctx)))));
}
