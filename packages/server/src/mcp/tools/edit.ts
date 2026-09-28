import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Row } from "../../db/rows";
import { ENTITY_TYPES, entityRegistry, type EntityType } from "../../entities/registry";
import { createEntity, restoreEntity, softDeleteEntity, updateEntity } from "../../entities/repository";
import { binFrame, restoreFrame } from "../../survey/frames";
import { restorePlace } from "../../survey/review";
import { CLAUDE_TAG_STATUS } from "../../tokens/policy";
import type { ToolContext } from "../context";
import { refuseIfLocked } from "../guards";
import { Refusal, count, reply, runTool } from "../results";

const ID = z.string().min(1).max(120);
const VERSION = z.number().int().min(0).describe("The version you last read, from get or get_floor.");
const REMOVABLE = [...ENTITY_TYPES, "keyframe"] as const;

/** Spec §6.1: a token can't change floor owners. */
const OWNERS = "A token can't change who owns a floor. A teammate does that on the Floors page.";
const STATUS = "A place's or a tag's status changes only through review_place, which keeps its tags in step.";

/** The row as it stands, deleted or not. */
async function find(ctx: ToolContext, type: EntityType, id: string): Promise<Row | undefined> {
  const { table } = entityRegistry[type];
  return ((await ctx.db.select().from(table).where(eq(table.id, id))) as Row[])[0];
}

/** Postgres's unique_violation, from pg and PGlite alike. An entity table's only unique key is its id. */
function isDuplicate(err: unknown): boolean {
  return (err as { code?: unknown } | null)?.code === "23505";
}

function onFloor(ctx: ToolContext, row: Row): void {
  if (typeof row.levelId === "string") ctx.seenOn(row.levelId);
}

export function registerEditTools(server: McpServer, ctx: ToolContext): void {
  const claimant = `Claude Code (${ctx.user.displayName})`;

  server.registerTool("create", {
    title: "Create",
    description:
      `Adds one thing to the map. type is one of: ${ENTITY_TYPES.join(", ")}. data is the whole thing as the model ` +
      "defines it, with an id you choose (letters, digits, hyphen and underscore), such as the room L1-shop-12. " +
      "Places and tags you add arrive as proposals.",
    inputSchema: { type: z.enum(ENTITY_TYPES), data: z.record(z.unknown()) },
    annotations: { readOnlyHint: false, destructiveHint: false },
  }, ({ type, data }) => runTool(ctx, async () => {
    if (type === "level" && Array.isArray(data.ownerIds) && data.ownerIds.length > 0) throw new Refusal(OWNERS);
    const id = typeof data.id === "string" ? data.id : "";
    const taken = id ? await find(ctx, type, id) : undefined;
    if (taken) {
      throw new Refusal(taken.deletedAt == null
        ? `There is already a ${type} ${id}. Choose another id, or update that one.`
        : `There is already a ${type} ${id}, but it is deleted. restore brings it back, or choose another id.`);
    }
    // Spec §11.3, whichever tool it comes through.
    const input = type === "place" || type === "sighting" ? { ...data, status: CLAUDE_TAG_STATUS, proposedBy: claimant } : data;
    let row: Row;
    try {
      row = await createEntity(ctx.db, type, input, ctx.user.id);
    } catch (err) {
      // Someone added the same id between the look above and this write.
      if (isDuplicate(err)) throw new Refusal(`Not saved: ${type} ${id} already exists, added while this ran. Read it with get, then choose another id or update that one.`);
      throw err;
    }
    onFloor(ctx, row);
    return reply(`Created ${type} ${String(row.id)}, at version 0.`);
  }));

  server.registerTool("update", {
    title: "Update",
    description:
      "Changes some fields of one thing. expectedVersion is its version when you read it: if someone changed it " +
      "since, nothing is saved and you are told what it is now. A field set to null is cleared. A floor's owners " +
      "can't be changed from here, and a place's or tag's status changes only through review_place.",
    inputSchema: { type: z.enum(ENTITY_TYPES), id: ID, expectedVersion: VERSION, data: z.record(z.unknown()) },
    annotations: { readOnlyHint: false, destructiveHint: false },
  }, ({ type, id, expectedVersion, data }) => runTool(ctx, async () => {
    if (type === "level" && "ownerIds" in data) throw new Refusal(OWNERS);
    if ((type === "place" || type === "sighting") && ("status" in data || "proposedBy" in data)) throw new Refusal(STATUS);
    await refuseIfLocked(ctx.db, [{ type, id }]);
    const row = await updateEntity(ctx.db, type, id, expectedVersion, data, ctx.user.id);
    onFloor(ctx, row);
    return reply(`Saved ${type} ${id}: it is now at version ${String(row.version)}.`);
  }, { type, id, sent: expectedVersion }));

  server.registerTool("delete", {
    title: "Delete",
    description:
      "Removes one thing, softly: nothing is gone, and the answer says how to restore it. type keyframe bins a " +
      "frame with its tags. A place is removed with review_place reject, which takes its tags with it. A capture is " +
      "removed only in the app.",
    inputSchema: { type: z.enum(REMOVABLE), id: ID, expectedVersion: VERSION },
    annotations: { readOnlyHint: false, destructiveHint: true },
  }, ({ type, id, expectedVersion }) => runTool(ctx, async () => {
    if (type === "capture") throw new Refusal("A capture goes with all its frames and can't be restored, so only a person removes one, in the app.");
    if (type === "place") throw new Refusal("Remove a place with review_place reject, which takes its tags with it and can be restored.");
    await refuseIfLocked(ctx.db, [{ type, id }]);
    if (type === "keyframe") {
      const binned = await binFrame(ctx.db, id, ctx.user.id, expectedVersion);
      if (binned === "missing") throw new Refusal(`There is no frame ${id}.`);
      if (binned === "already") throw new Refusal(`Frame ${id} is already binned; restore brings it back.`);
      return reply(
        `Binned frame ${id} with ${count(binned.sightings, "tag")}. ` +
        `To undo: restore with type "keyframe", id "${id}" and expectedVersion ${expectedVersion + 1}.`,
      );
    }
    // Ruling 10: deleting it again would stamp a new moment on it, and a tag
    // binned with its frame, or rejected with its place, would then no longer
    // come back with them. /api/entities is left as it is.
    if ((await find(ctx, type, id))?.deletedAt != null) throw new Refusal(`${type} ${id} is already deleted; restore brings it back.`);
    const row = await softDeleteEntity(ctx.db, type, id, expectedVersion, ctx.user.id);
    onFloor(ctx, row);
    return reply(
      `Deleted ${type} ${id}; nothing is gone. ` +
      `To undo: restore with type "${type}", id "${id}" and expectedVersion ${String(row.version)}.`,
    );
  }, { type, id, sent: expectedVersion }));

  server.registerTool("restore", {
    title: "Restore",
    description:
      "Brings back something deleted, at the version its delete left (the delete's answer says it). A place comes " +
      "back with the tags rejected with it, and a frame with its tags.",
    inputSchema: { type: z.enum(REMOVABLE), id: ID, expectedVersion: VERSION },
    annotations: { readOnlyHint: false, destructiveHint: false },
  }, ({ type, id, expectedVersion }) => runTool(ctx, async () => {
    if (type === "capture") throw new Refusal("A capture's delete is final; it is not restored.");
    await refuseIfLocked(ctx.db, [{ type, id }]);
    if (type === "keyframe") {
      const back = await restoreFrame(ctx.db, id, ctx.user.id, expectedVersion);
      if (back === "missing") throw new Refusal(`There is no frame ${id}.`);
      if (back === "not-deleted") throw new Refusal(`Frame ${id} isn't binned.`);
      // restoreFrame refuses any version but the one sent, and moves it one on.
      return reply(`Restored frame ${id} with ${count(back.sightings, "tag")}, at version ${expectedVersion + 1}.`);
    }
    if (type === "place") {
      const back = await restorePlace(ctx.db, id, expectedVersion, ctx.user.id);
      return reply(`Restored place ${id} with ${count(back.sightings, "tag")}, at version ${String(back.entity.version)}.`);
    }
    const row = await restoreEntity(ctx.db, type, id, expectedVersion, ctx.user.id);
    onFloor(ctx, row);
    return reply(`Restored ${type} ${id}, at version ${String(row.version)}.`);
  }, { type, id, sent: expectedVersion }));
}
