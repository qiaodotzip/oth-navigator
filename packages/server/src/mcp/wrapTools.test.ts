import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { currentVia } from "../entities/via";
import type { ToolContext } from "./context";
import { Refusal, SERVER_FAILED, reply, runTool } from "./results";
import { buildMcpServer } from "./server";
import { call } from "./testing";
import { isWrapped, wrapTools } from "./wrapTools";

afterEach(() => {
  vi.restoreAllMocks();
});

function stubContext(): ToolContext {
  return {
    db: undefined as never,
    dataDir: "",
    user: { id: "u_wei", email: "wei@example.com", displayName: "Wei" },
    token: { id: "tok_1", name: "Wei's laptop", mayPublish: false },
    limits: undefined as never,
    now: () => new Date(),
    seenOn: vi.fn(),
  };
}

async function connected(server: McpServer): Promise<Client> {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  const client = new Client({ name: "oth-test", version: "1.0.0" });
  await client.connect(clientSide);
  return client;
}

describe("wrapTools", () => {
  it("answers a tool that throws outside runTool with no detail, and logs it without the token", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const secret = `oth_pat_${"q".repeat(43)}`;
    const server = wrapTools(new McpServer({ name: "oth-map", version: "1.0.0" }), stubContext());
    server.registerTool("broken", { description: "Throws before it reaches runTool." }, () => {
      throw new Error(`relation "places" does not exist at ${secret}`);
    });
    const { text, isError } = await call(await connected(server), "broken");
    expect(isError).toBe(true);
    expect(text).toBe(SERVER_FAILED);
    const printed = logged.mock.calls.flat().map(a => (a instanceof Error ? `${a.message} ${a.stack}` : String(a))).join(" ");
    expect(printed).toContain("[redacted]");
    expect(printed).not.toContain(secret);
  });

  it("answers a refusal thrown outside runTool as a refusal", async () => {
    const server = wrapTools(new McpServer({ name: "oth-map", version: "1.0.0" }), stubContext());
    server.registerTool("picky", {}, () => {
      throw new Refusal("There is no floor L9.");
    });
    expect(await call(await connected(server), "picky")).toMatchObject({ isError: true, text: "There is no floor L9." });
  });

  it("marks everything a tool does as through its token, and passes its arguments on", async () => {
    const server = wrapTools(new McpServer({ name: "oth-map", version: "1.0.0" }), stubContext());
    server.registerTool("who", { inputSchema: { note: z.string() } }, async ({ note }) => reply(`${note} via ${currentVia() ?? "the app"}`));
    expect(await call(await connected(server), "who", { note: "hello" })).toMatchObject({ isError: false, text: "hello via tok_1" });
  });

  it("shows the person's Claude once a call, even when the tool runs runTool itself", async () => {
    const ctx = stubContext();
    const server = wrapTools(new McpServer({ name: "oth-map", version: "1.0.0" }), ctx);
    server.registerTool("inner", {}, () => runTool(ctx, async () => reply("ok")));
    await call(await connected(server), "inner");
    expect(ctx.seenOn).toHaveBeenCalledTimes(1);
  });

  it("wraps a handler put in later with update", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const server = wrapTools(new McpServer({ name: "oth-map", version: "1.0.0" }), stubContext());
    const tool = server.registerTool("later", {}, () => reply("ok"));
    tool.update({
      callback: () => {
        throw new Error("relation \"places\" does not exist");
      },
    });
    expect(await call(await connected(server), "later")).toMatchObject({ isError: true, text: SERVER_FAILED });
  });

  it("closes the other ways to register a tool around it: tool() and registerToolTask", () => {
    const server = wrapTools(new McpServer({ name: "oth-map", version: "1.0.0" }), stubContext());
    expect(() => server.tool("old", () => reply("ok"))).toThrow(/registerTool/);
    expect(() => server.experimental.tasks.registerToolTask("task", {}, {
      createTask: async () => { throw new Error("unused"); },
      getTask: async () => { throw new Error("unused"); },
      getTaskResult: async () => { throw new Error("unused"); },
    })).toThrow(/registerTool/);
  });

  it("leaves no tool on the map's server unwrapped", () => {
    const server = buildMcpServer(stubContext());
    const tools = (server as unknown as { _registeredTools: Record<string, { handler: unknown }> })._registeredTools;
    expect(Object.keys(tools)).toEqual(expect.arrayContaining(["list_floors", "suggest_paths", "connect_rooms"]));
    for (const [name, tool] of Object.entries(tools)) expect(isWrapped(tool.handler), name).toBe(true);
  });
});
