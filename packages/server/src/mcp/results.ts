import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { eq } from "drizzle-orm";
import { ZodError } from "zod";
import type { Database } from "../db/client";
import type { Row } from "../db/rows";
import { users } from "../db/schema";
import { NotDeletedError, NotFoundError, VersionConflictError } from "../entities/repository";
import { currentVia, withVia } from "../entities/via";
import { redactError } from "../tokens/redact";
import type { ToolContext } from "./context";

export function reply(text: string): CallToolResult {
  return { content: [{ type: "text", text }] };
}

/** Compact JSON: a model reads it as easily as indented, for fewer tokens. */
export function replyJson(value: unknown): CallToolResult {
  return reply(JSON.stringify(value));
}

export function refuse(text: string): CallToolResult {
  return { isError: true, content: [{ type: "text", text }] };
}

/** "1 tag", "3 tags". */
export function count(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/** A refusal raised from anywhere inside a tool; `runTool` answers it as one. */
export class Refusal extends Error {
  constructor(message: string) {
    super(message);
    this.name = "Refusal";
  }
}

/** What a write is about, so a conflict can say whose change it met. */
export type Subject = { type: string; id: string; sent: number };

const SINGAPORE = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Singapore", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

/** "14:02 on 28 Sep". The team works in Singapore; the server runs in UTC. */
export function singaporeTime(iso: string): string {
  const parts = Object.fromEntries(SINGAPORE.formatToParts(new Date(iso)).map(p => [p.type, p.value]));
  return `${parts.hour}:${parts.minute} on ${parts.day} ${parts.month}`;
}

/**
 * The saver's rule, for a model (spec §6.4): a conflict writes nothing, and
 * the answer says whose change it met and what the thing is now, so the
 * model reads again and decides. Nothing here retries or merges.
 */
export async function conflictText(
  db: Database, subject: Subject | readonly Subject[], current: Row | null,
): Promise<string> {
  const subjects: readonly Subject[] = Array.isArray(subject) ? subject : [subject as Subject];
  const first = subjects[0]!;
  const hit = current ? subjects.find(s => s.id === String(current.id)) : undefined;
  if (!current || !hit) {
    return `Not saved: something ${first.type} ${first.id} depends on changed while this ran. Read it again and decide.`;
  }
  let by = "";
  if (typeof current.updatedBy === "string") {
    const [who] = await db.select({ name: users.displayName }).from(users).where(eq(users.id, current.updatedBy));
    const when = typeof current.updatedAt === "string" ? ` at ${singaporeTime(current.updatedAt)}` : "";
    by = ` ${who?.name ?? "Someone"} changed it${when}.`;
  }
  return `Not saved: ${hit.type} ${hit.id} is at version ${String(current.version)} and you sent ${hit.sent}.${by} ` +
    `Its current value is ${JSON.stringify(current)}. Read it again and decide.`;
}

export const SERVER_FAILED = "Something went wrong on the server. Try again in a moment.";

function describeZod(err: ZodError): string {
  return err.issues.slice(0, 5).map(i => `${i.path.join(".") || "value"}: ${i.message}`).join("; ");
}

/**
 * Runs one tool call as its person, through its token. Every audit row it
 * writes is marked `via` the token, presence shows the person's Claude, and
 * whatever goes wrong comes back as a refusal the model can read. A raw
 * error never goes back: the SDK would pass its message on as it stands,
 * and that can carry a query or a path.
 *
 * wrapTools runs every handler through it, and most handlers run their own
 * inside. The inner one only answers errors: the call is already shown.
 */
export async function runTool(
  ctx: ToolContext, fn: () => Promise<CallToolResult>, subject?: Subject | readonly Subject[],
): Promise<CallToolResult> {
  if (currentVia() !== ctx.token.id) ctx.seenOn(null);
  try {
    return await withVia(ctx.token.id, fn);
  } catch (err) {
    if (err instanceof Refusal) return refuse(err.message);
    if (err instanceof VersionConflictError) {
      return refuse(subject
        ? await conflictText(ctx.db, subject, err.current)
        : "Not saved: something changed while this ran. Read it again and decide.");
    }
    const one = Array.isArray(subject) ? subject[0] : (subject as Subject | undefined);
    if (err instanceof NotFoundError) {
      return refuse(one
        ? `There is no ${one.type} ${one.id}, or it is deleted. get says which; restore brings back a deleted one.`
        : "Not found.");
    }
    if (err instanceof NotDeletedError) {
      return refuse(one ? `${one.type} ${one.id} isn't deleted, so there is nothing to restore.` : "It isn't deleted.");
    }
    if (err instanceof ZodError) return refuse(`Not saved: ${describeZod(err)}.`);
    console.error(`An MCP tool call for ${ctx.user.displayName} failed`, redactError(err));
    return refuse(SERVER_FAILED);
  }
}
