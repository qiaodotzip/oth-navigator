import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { ToolContext } from "./context";
import { runTool } from "./results";

type Handler = (...args: unknown[]) => CallToolResult | Promise<CallToolResult>;

/**
 * Every tool registered on `server` runs through runTool, whatever its handler
 * does itself. Whatever a handler throws outside its own runTool, the SDK would
 * send back to the model as its raw message, which can carry a query or a
 * path, and a write made there would not be marked as through the token.
 *
 * The older `tool()` form registers without passing through `registerTool`,
 * so it is closed.
 */
export function wrapTools(server: McpServer, ctx: ToolContext): McpServer {
  const register = server.registerTool.bind(server) as (name: string, config: object, handler: Handler) => unknown;
  server.registerTool = ((name: string, config: object, handler: Handler) =>
    register(name, config, (...args: unknown[]) => runTool(ctx, async () => handler(...args)))) as typeof server.registerTool;
  server.tool = (() => {
    throw new Error("Register tools with registerTool, which runs each one through runTool.");
  }) as typeof server.tool;
  return server;
}
