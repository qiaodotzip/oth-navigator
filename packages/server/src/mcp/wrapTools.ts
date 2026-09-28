import type { McpServer, RegisteredTool } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { ToolContext } from "./context";
import { runTool } from "./results";

type Handler = (...args: unknown[]) => CallToolResult | Promise<CallToolResult>;

/** Every handler wrapTools has made, so a test can check that no tool escaped it. */
const wrapped = new WeakSet<object>();

export function isWrapped(handler: unknown): boolean {
  return typeof handler === "function" && wrapped.has(handler);
}

function closed(form: string): () => never {
  return () => {
    throw new Error(`${form} is closed: register tools with registerTool, which runs each one through runTool.`);
  };
}

/**
 * Every tool registered on `server` runs through runTool, whatever its handler
 * does itself. Whatever a handler throws outside its own runTool, the SDK would
 * send back to the model as its raw message, which can carry a query or a
 * path, and a write made there would not be marked as through the token.
 *
 * A handler swapped in later with `update` is wrapped too. The SDK's other
 * ways in, `tool()` and the experimental `registerToolTask`, register without
 * passing through `registerTool`, so they are closed.
 */
export function wrapTools(server: McpServer, ctx: ToolContext): McpServer {
  const wrap = (handler: Handler): Handler => {
    const through: Handler = (...args) => runTool(ctx, async () => handler(...args));
    wrapped.add(through);
    return through;
  };

  const register = server.registerTool.bind(server) as (name: string, config: object, handler: Handler) => RegisteredTool;
  server.registerTool = ((name: string, config: object, handler: Handler) => {
    const tool = register(name, config, wrap(handler));
    const update = tool.update as (updates: { callback?: Handler }) => void;
    tool.update = ((updates: { callback?: Handler }) =>
      update(updates.callback ? { ...updates, callback: wrap(updates.callback) } : updates)) as typeof tool.update;
    return tool;
  }) as typeof server.registerTool;

  server.tool = closed("tool()") as typeof server.tool;
  server.experimental.tasks.registerToolTask = closed("registerToolTask") as typeof server.experimental.tasks.registerToolTask;
  return server;
}
