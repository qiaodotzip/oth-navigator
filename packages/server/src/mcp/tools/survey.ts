import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { TenantCategorySchema } from "@oth/model";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { places } from "../../db/schema";
import { BindRefusal, bindPlace } from "../../survey/bind";
import { UnknownLevelError, acceptPlace, mergePlace, rejectPlace, reopenPlace } from "../../survey/review";
import { TagRefusal, tagFrame } from "../../survey/tag";
import { CLAUDE_TAG_STATUS } from "../../tokens/policy";
import type { ToolContext } from "../context";
import { refuseIfLocked } from "../guards";
import { Refusal, count, reply, replyJson, runTool } from "../results";

const ID = z.string().min(1).max(120);
const VERSION = z.number().int().min(0).describe("The version you last read, from get or get_floor.");
const FRACTION = z.number().min(0).max(1);
const BOX = z.object({ x: FRACTION, y: FRACTION, w: FRACTION, h: FRACTION })
  .describe("Which part of the frame, in fractions of it: x and y from the top left, then w and h.");
const WRITES = { readOnlyHint: false, destructiveHint: false } as const;

/** The survey's own refusals, as refusals the model reads. */
async function refusing<T>(work: Promise<T>): Promise<T> {
  try {
    return await work;
  } catch (err) {
    if (err instanceof TagRefusal || err instanceof BindRefusal || err instanceof UnknownLevelError) {
      throw new Refusal(err.message);
    }
    throw err;
  }
}

export function registerSurveyTools(server: McpServer, ctx: ToolContext): void {
  const name = ctx.user.displayName;
  const claim = { status: CLAUDE_TAG_STATUS, proposedBy: `Claude Code (${name})` };

  server.registerTool("tag_frame", {
    title: "Tag a frame",
    description:
      "Says what a frame shows: a place already surveyed (placeId), or a new one (nameEn and category). " +
      "box says which part of the frame, when it shows more than one thing. Your tags arrive as proposals: " +
      `a person accepts them in Review, or you do with review_place when ${name} asks you to.`,
    inputSchema: {
      frameId: ID,
      placeId: ID.optional(),
      nameEn: z.string().trim().min(1).max(120).optional(),
      category: TenantCategorySchema.optional(),
      box: BOX.optional(),
    },
    annotations: WRITES,
  }, input => runTool(ctx, async () => {
    const tagged = await refusing(tagFrame(ctx.db, input, ctx.user.id, claim));
    if (tagged.levelId) ctx.seenOn(tagged.levelId);
    return replyJson({ ...tagged, status: claim.status });
  }));

  server.registerTool("review_place", {
    title: "Review a place",
    description: [
      "Decides a surveyed place, as Review does. decision is one of:",
      "accept confirms it and its proposed tags (nameEn and category correct it, and levelId files one that has no floor);",
      "reject removes it and its tags (restore undoes it);",
      "merge says it is the same as the place into: its tags move there, confirmed, and it goes;",
      "reopen puts an accepted place back in the queue, and sightingIds are the tags accept confirmed, which go back to proposed.",
      "expectedVersion is the place's version from get or get_floor.",
    ].join(" "),
    inputSchema: {
      placeId: ID,
      decision: z.enum(["accept", "reject", "merge", "reopen"]),
      expectedVersion: VERSION,
      nameEn: z.string().trim().min(1).max(120).optional(),
      category: TenantCategorySchema.optional(),
      levelId: ID.optional(),
      into: ID.optional(),
      sightingIds: z.array(ID).max(500).optional(),
    },
    annotations: WRITES,
  }, input => runTool(ctx, async () => {
    const { placeId, decision, expectedVersion } = input;
    const [place] = await ctx.db.select().from(places).where(eq(places.id, placeId));
    if (!place || place.deletedAt) throw new Refusal(`There is no place ${placeId}.`);
    await refuseIfLocked(ctx.db, [{ type: "place", id: placeId }, ...(input.into ? [{ type: "place", id: input.into }] : [])]);
    if (place.levelId) ctx.seenOn(place.levelId);
    const nameEn = input.nameEn ?? place.nameEn;
    const category = input.category ?? place.category;

    if (decision === "accept") {
      const confirmed = await refusing(acceptPlace(ctx.db, placeId, {
        expectedVersion, nameEn, category, ...(input.levelId ? { levelId: input.levelId } : {}),
      }, ctx.user.id));
      return reply(
        `Accepted ${nameEn} and ${count(confirmed.length, "tag")}. It is now at version ${expectedVersion + 1}. ` +
        `To undo: review_place with decision reopen, expectedVersion ${expectedVersion + 1} and sightingIds ${JSON.stringify(confirmed)}.`,
      );
    }
    if (decision === "reject") {
      const n = await rejectPlace(ctx.db, placeId, expectedVersion, ctx.user.id);
      return reply(
        `Rejected ${place.nameEn} and ${count(n, "tag")}. ` +
        `To undo: restore with type "place", id "${placeId}" and expectedVersion ${expectedVersion + 1}.`,
      );
    }
    if (decision === "merge") {
      if (!input.into) throw new Refusal("merge needs into: the place this one is the same as.");
      if (input.into === placeId) throw new Refusal("A place can't be merged into itself.");
      // Checked here so a missing target is not reported as the place itself missing.
      const [target] = await ctx.db.select().from(places).where(eq(places.id, input.into));
      if (!target || target.deletedAt) throw new Refusal(`There is no place ${input.into} to merge into.`);
      const moved = await mergePlace(ctx.db, placeId, input.into, expectedVersion, ctx.user.id);
      return reply(`Merged ${place.nameEn} into ${input.into}: ${count(moved.length, "tag")} moved there, confirmed.`);
    }
    const n = await refusing(reopenPlace(ctx.db, placeId, {
      expectedVersion, nameEn, category, levelId: input.levelId ?? place.levelId ?? null, sightingIds: input.sightingIds ?? [],
    }, ctx.user.id));
    return reply(`Reopened ${nameEn}: it waits in Review again, with ${count(n, "tag")} back to proposed.`);
  }, { type: "place", id: input.placeId, sent: input.expectedVersion }));

  server.registerTool("bind_place", {
    title: "Bind a place to a room",
    description:
      "Says which traced room a confirmed, surveyed place is, as Build's Bind places does. The place takes the room " +
      "and its floor, and the room is marked seen in a photo, with the place's confirmed frames as evidence. " +
      "The room must be on the map, and on the place's floor when it has one. Both versions come from get or get_floor.",
    inputSchema: { placeId: ID, placeVersion: VERSION, roomId: ID, roomVersion: VERSION },
    annotations: WRITES,
  }, input => runTool(ctx, async () => {
    await refuseIfLocked(ctx.db, [{ type: "place", id: input.placeId }, { type: "room", id: input.roomId }]);
    const bound = await refusing(bindPlace(ctx.db, input, ctx.user.id, ctx.now()));
    ctx.seenOn(bound.levelId);
    return reply(bound.verified
      ? `Bound ${input.placeId} to room ${input.roomId}, and marked the room seen in ${count(bound.evidence.length, "photo")}.`
      : `Bound ${input.placeId} to room ${input.roomId}. The room stays unverified: the place has no confirmed photo yet.`);
  }, [
    { type: "place", id: input.placeId, sent: input.placeVersion },
    { type: "room", id: input.roomId, sent: input.roomVersion },
  ]));
}
