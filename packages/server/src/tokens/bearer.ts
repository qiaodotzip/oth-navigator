/** The one address a Claude Code token opens (spec §6.2). */
export const MCP_PATH = "/mcp";

/** The token in `Authorization: Bearer …`, or null. The scheme's case does not matter (RFC 6750). */
export function bearerSecret(header: string | null | undefined): string | null {
  const match = /^Bearer\s+(\S+)\s*$/i.exec(header ?? "");
  return match?.[1] ?? null;
}
