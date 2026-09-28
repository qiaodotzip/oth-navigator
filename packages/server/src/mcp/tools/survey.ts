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
import { Refusal, count, reply, runTool } from "../results";

const ID = z.string().min(1).max(120);
const VERSION = z.number().int().min(0).describe("The version you last read, from get or get_floor, where a version left out is 0.");
const FRACTION = z.number().min(0).max(1);
const BOX = z.object({ x: FRACTION, y: FRACTION, w: FRACTION, h: FRACTION })
  .describe("Which part of the frame, in fractions of it: x and y from the top left, then w and h.");
/** Metres. Over 10 m is almost always centimetres typed as metres (6A's MAX_OBJECT_SIDE_M). */
const SIDE = z.number().positive().max(10);
const SIZE = z.object({ w: SIDE, d: SIDE, h: SIDE })
  .describe("A new kind's size in metres: width, depth and height, estimated from the frame. Left out, 0.5 × 0.5 × 1.");
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
      "box says which part of the frame, when it shows more than one thing. Your tags arrive as proposals. " +
      "A tag on a new or proposed place waits in Review with its place: a person accepts it there, or you do " +
      `with review_place when ${name} asks you to. Review lists only proposed places, so a tag on a place ` +
      "already confirmed is not shown there: it stays a proposal until review_place with decision accept runs " +
      `on that place, which confirms its proposed tags. ${name} can ask you to do that.` +
      " Objects, such as a wastebin or a water cooler: set object true and box each one. By name, a kind with the " +
      "same name is found (capitals and spacing aside, so \"Wastebin\" finds \"wastebin\" but \"waste bin\" does not), " +
      "or one is made at size; by the placeId of a proposal (status proposed), the proposal becomes the kind's place. " +
      "Two of an object in one frame are two tags, each with its own box.",
    inputSchema: {
      frameId: ID,
      placeId: ID.optional(),
      nameEn: z.string().trim().min(1).max(120).optional(),
      category: TenantCategorySchema.optional(),
      box: BOX.optional(),
      object: z.boolean().optional().describe("True when the frame shows an object, such as a wastebin: the tag goes on its kind's place."),
      size: SIZE.optional(),
    },
    annotations: WRITES,
  }, input => runTool(ctx, async () => {
    const tagged = await refusing(tagFrame(ctx.db, input, ctx.user.id, claim));
    if (tagged.levelId) ctx.seenOn(tagged.levelId);
    const lines = [JSON.stringify({ ...tagged, status: claim.status })];
    // No screen in the app would ever show this tag, so the model has to be
    // told what does confirm it.
    if (claim.status === "proposed" && tagged.placeStatus === "confirmed") {
      lines.push(
        `${tagged.placeId} is already confirmed, and Review lists only proposed places, so this tag is not shown ` +
        `there. It stays a proposal until review_place with decision accept runs on ${tagged.placeId}, which confirms its ` +
        `proposed tags. ${name} can ask you to do that.`,
      );
    }
    if (input.size && tagged.objectKindId && !tagged.newKind) {
      lines.push("That kind of object exists already, at its own size, so size was not used. update the objectKind to change it.");
    }
    return reply(lines.join("\n"));
  }));

  server.registerTool("review_place", {
    title: "Review a place",
    description: [
      "Decides a surveyed place, as Review does. decision is one of:",
      "accept confirms it and its proposed tags (nameEn and category correct it, and levelId files one that has no floor);",
      "reject removes it and its tags (restore undoes it);",
      "merge says it is the same as the place into: its tags move there, confirmed, and it goes;",
      "reopen puts an accepted place back in the queue as it was: send the nameEn, category, levelId and sightingIds",
      "accept's answer gave, and those tags go back to proposed.",
      "expectedVersion is the place's version from get or get_floor.",
    ].join(" "),
    inputSchema: {
      placeId: ID,
      decision: z.enum(["accept", "reject", "merge", "reopen"]),
      expectedVersion: VERSION,
      nameEn: z.string().trim().min(1).max(120).optional(),
      category: TenantCategorySchema.optional(),
      levelId: ID.nullable().optional().describe("For reopen, null puts back a place that had no floor."),
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
      // The place as it was, as Review's own Undo sends it (editor/src/review/decide.ts):
      // accept may have renamed, recategorised or filed it, and reopen puts all three back.
      const was = `nameEn ${JSON.stringify(place.nameEn)}, category ${JSON.stringify(place.category)}, ` +
        `levelId ${JSON.stringify(place.levelId ?? null)}`;
      return reply(
        `Accepted ${nameEn} and ${count(confirmed.length, "tag")}. It is now at version ${expectedVersion + 1}. ` +
        `To undo: review_place with decision reopen, expectedVersion ${expectedVersion + 1}, ${was} ` +
        `and sightingIds ${JSON.stringify(confirmed)}.`,
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
      expectedVersion, nameEn, category,
      // Given as null, it clears the floor accept filed; left out, it keeps the one the place has.
      levelId: input.levelId === undefined ? (place.levelId ?? null) : input.levelId,
      sightingIds: input.sightingIds ?? [],
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
