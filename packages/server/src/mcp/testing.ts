import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { createApp, type AppDeps } from "../app";
import { createUser, type User } from "../auth/users";
import type { Database } from "../db/client";
import { buildings, levels } from "../db/schema";
import { createTestDb } from "../testing/harness";
import { MCP_PATH } from "../tokens/bearer";
import { mintToken } from "../tokens/service";

export const TEAM_CODE = "red kite hill";
/** The gate cookie's key, fixed so a test can make a browser's pass. */
export const GATE_KEY = Buffer.alloc(32, 7);
export const LIST = { jsonrpc: "2.0", id: 1, method: "tools/list" } as const;

export type McpFixture = {
  db: Database;
  dataDir: string;
  app: ReturnType<typeof createApp>;
  wei: User;
  secret: string;
  tokenId: string;
  /** The SDK's own client, connected in process with a token (Wei's unless another is given). */
  connect: (secret?: string) => Promise<Client>;
  /** One raw POST, as Claude Code sends it. A header given as undefined is left out. */
  raw: (body: unknown, headers?: Record<string, string | undefined>, path?: string) => Promise<Response>;
};

/** A server with two floors, a teammate called Wei who owns L1, and a token of Wei's. */
export async function mcpFixture(
  options: { gated?: boolean; mayPublish?: boolean; deps?: Partial<AppDeps> } = {},
): Promise<McpFixture> {
  const db = await createTestDb();
  const dataDir = await mkdtemp(join(tmpdir(), "oth-mcp-"));
  const app = createApp({ db, dataDir, teamCode: options.gated ? TEAM_CODE : null, gateKey: GATE_KEY, ...options.deps });
  const wei = await createUser(db, { email: "wei@example.com", password: "unused", displayName: "Wei" });
  await db.insert(buildings).values({ id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94, rotationDeg: 0 });
  await db.insert(levels).values([
    { id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "Level 1", nameZh: "一楼", elevationM: 0, heightM: 6, ownerIds: [wei.id] },
    { id: "oth-L2", buildingId: "oth", code: "L2", ordinal: 2, nameEn: "Level 2", nameZh: "二楼", elevationM: 6, heightM: 4 },
  ]);
  const { secret, token } = await mintToken(db, wei, { name: "Wei's laptop", mayPublish: options.mayPublish ?? false });

  return {
    db, dataDir, app, wei, secret, tokenId: token.id,
    async connect(withSecret = secret) {
      const client = new Client({ name: "oth-test", version: "1.0.0" });
      await client.connect(new StreamableHTTPClientTransport(new URL(`http://localhost${MCP_PATH}`), {
        fetch: async (url, init) => app.fetch(new Request(url, init)),
        requestInit: { headers: { authorization: `Bearer ${withSecret}` } },
      }));
      return client;
    },
    async raw(body, headers = {}, path = MCP_PATH) {
      const merged: Record<string, string> = {};
      const all = {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        authorization: `Bearer ${secret}`,
        ...headers,
      };
      for (const [key, value] of Object.entries(all)) if (value !== undefined) merged[key] = value;
      return app.request(path, {
        method: "POST", headers: merged, body: typeof body === "string" ? body : JSON.stringify(body),
      });
    },
  };
}

/** A tool call's text, and whether it was refused. */
export async function call(
  client: Client, name: string, args: Record<string, unknown> = {},
): Promise<{ text: string; isError: boolean; result: CallToolResult }> {
  const result = (await client.callTool({ name, arguments: args })) as CallToolResult;
  const text = result.content
    .filter(part => part.type === "text")
    .map(part => (part as { text: string }).text)
    .join("\n");
  return { text, isError: result.isError === true, result };
}
