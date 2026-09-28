import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { recordAudit } from "../../entities/repository";
import { PublishBlockedError, publish } from "../../publish/service";
import type { ToolContext } from "../context";
import { publishTooSoon } from "../limits";
import { Refusal, count, reply, runTool } from "../results";

export const NOT_ALLOWED =
  "This token may not publish. Make one with May publish ticked on the Team page, or ask a teammate to publish.";
export const VIA_CLAUDE = "via Claude Code";

export function registerPublishTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool("publish", {
    title: "Publish the map",
    description:
      "Publishes the whole map for visitors, as the Publish button does. It is refused while the map has errors " +
      "(check_floor lists them). Only a token made with May publish ticked can publish, at most once every ten " +
      "minutes. notes say what changed.",
    inputSchema: { notes: z.string().trim().max(1900).optional() },
    annotations: { readOnlyHint: false, destructiveHint: true },
  }, ({ notes }) => runTool(ctx, async () => {
    // Spec §11.1, decided on 2026-09-28: only with the tick. A different answer is this one branch.
    if (!ctx.token.mayPublish) throw new Refusal(NOT_ALLOWED);
    const at = ctx.now().getTime();
    // The request's own check passed, but another call through this token
    // may have claimed the slot since: the loser is told how long to wait.
    if (!ctx.limits.claimPublish(ctx.token.id, at)) {
      throw new Refusal(publishTooSoon(ctx.limits.publishWaitS(ctx.token.id, at)));
    }
    // The notes go into the manifest, which visitors read, so they never name the token.
    const written = notes ? `${notes} (${VIA_CLAUDE})` : VIA_CLAUDE;
    let result: Awaited<ReturnType<typeof publish>>;
    try {
      result = await publish(ctx.db, ctx.dataDir, { createdBy: ctx.user.id, notes: written });
    } catch (err) {
      // Nothing went out, so the ten-minute slot goes back.
      ctx.limits.releasePublish(ctx.token.id, at);
      if (err instanceof PublishBlockedError) {
        const first = err.report.issues.filter(i => i.severity === "error").slice(0, 10)
          .map(i => `${i.code} on ${i.entityType} ${i.entityId}`);
        throw new Refusal(
          `Not published: the map has ${count(err.report.errorCount, "error")}. The first: ${first.join("; ")}. ` +
          "check_floor lists each floor's.",
        );
      }
      throw err;
    }
    // Which token published stays on the server: runTool marks this row via
    // the token. After the try, since the publish went out and its slot is spent.
    await recordAudit(ctx.db, "publishedVersion", result.version, "publish", ctx.user.id, null, {
      id: result.version, notes: written, warningCount: result.warningCount,
    });
    return reply(`Published version ${result.version}, with ${count(result.warningCount, "warning")}.`);
  }));
}
