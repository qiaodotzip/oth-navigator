import { inspect } from "node:util";

/**
 * `text` with every token in it hidden, for anything that goes to a log
 * (spec §6.5). Whatever follows "Bearer" goes too, token-shaped or not: an
 * Authorization header is never worth printing.
 */
export function redactSecrets(text: string): string {
  return text
    .replace(/(\bBearer\s+)\S+/gi, "$1[redacted]")
    .replace(/oth_pat_[A-Za-z0-9_-]+/g, "oth_pat_[redacted]");
}

/** What stands in for the values, in the message and in the properties alike. */
const HIDDEN = "[hidden]";

/**
 * Where a failed query puts the values it was given, and which this hides as a
 * whole rather than matching for secrets:
 *
 * - since drizzle 0.45, the end of the message, after the SQL, and a `params`
 *   property of its own;
 * - pg's `detail`, which for a not-null (23502) or check (23514) violation is
 *   `Failing row contains (…)` — every column of the row, not one key's value.
 *   `placements_asset_or_kind` fires from a plain insert, so a client posting a
 *   placement with neither a model nor a kind reaches it from the API.
 *
 * A session id is a credential and looks like nothing in particular, so a
 * pattern would let it through — as would any value nobody thought of.
 * Everything from "params:" to the end of the message goes, because a value
 * may hold a newline itself.
 */
const PARAMS_TAIL = /\nparams:[\s\S]*/;

function messageWithoutParams(message: string): string {
  return message.replace(PARAMS_TAIL, `\nparams: ${HIDDEN}`);
}

/**
 * The error and every error behind it, each once: whatever is its `cause`,
 * and the `errors` an AggregateError holds beside it. A cause may lead back,
 * so each is yielded once.
 */
function* chain(err: unknown): Generator<unknown> {
  const seen = new Set<unknown>();
  const queue: unknown[] = [err];
  while (queue.length) {
    const e = queue.shift();
    if (e == null || seen.has(e)) continue;
    seen.add(e);
    yield e;
    queue.push(readOf(e, "cause"));
    const held = readOf(e, "errors");
    if (Array.isArray(held)) queue.push(...held);
  }
}

/**
 * Whether anything here can carry the values a query was given: the `params`
 * property on any error in the chain, pg's `detail`, or — when something has
 * re-wrapped a failed query's message and left the property behind — the
 * "params:" tail in a message. Nothing in this repo re-wraps a message that
 * way, but this runs on the error path, where being sure is the point.
 */
function carriesQueryValues(err: unknown): boolean {
  for (const e of chain(err)) {
    if (PARAMS_TAIL.test(messageOf(e))) return true;
    if (typeof e !== "object" || e === null) continue;
    if ("params" in e) return true;
    if ("detail" in e && readOf(e, "detail") != null) return true;
  }
  return false;
}

/**
 * A property of something thrown.
 *
 * Reading it runs whatever getter defined it, and a getter can throw. This
 * whole file runs on the error path, and `tokens/live.ts` logs from a promise
 * nobody awaits, so a throw from here would end the process rather than print
 * a line. Nothing pg, PGlite, drizzle or Node raises is made that way; being
 * sure is cheaper than relying on that.
 */
function readOf(err: unknown, key: string): unknown {
  try {
    return (err as Record<string, unknown> | null | undefined)?.[key];
  } catch {
    return undefined;
  }
}

/** Anything at all as text, for a log line that must be written regardless. */
function asText(value: unknown): string {
  try {
    return String(value);
  } catch {
    return "an error that cannot be read";
  }
}

/** An error's message, which needn't be a string and needn't even be readable. */
function messageOf(err: unknown): string {
  const message = readOf(err, "message");
  return typeof message === "string" ? message : "";
}

/**
 * Everything the error carries but the errors behind it, which the walk prints
 * itself, and but the values. What is left is what an operator acts on: pg's
 * `code`, `constraint`, `table`, `column`, `schema`, `routine`, and the SQL.
 */
function detailsOf(err: object): Record<string, unknown> {
  const details: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(err)) {
    if (key === "cause" || key === "errors") continue;
    if (key === "params") details.params = `${Array.isArray(value) ? value.length : 1} ${HIDDEN}`;
    // An absent detail says so, rather than reading as one that was hidden.
    else if (key === "detail") details.detail = value == null ? value : HIDDEN;
    else details[key] = value;
  }
  return details;
}

/**
 * A stack's frames alone, which name files and not values, so they are kept.
 *
 * Taken as whatever follows the header V8 writes — the name, then the message
 * — rather than as the lines that read like a frame. A value may hold a
 * newline and "    at …" of its own, so a pasted room name can read as a
 * frame, and it sits in the message, ahead of every frame that is real. A
 * stack whose message cannot be found in it is not one this understands, and
 * no frames are taken from it.
 */
function framesOf(err: unknown): string {
  const stack = readOf(err, "stack");
  if (typeof stack !== "string") return "";
  const message = messageOf(err);
  let header: number;
  if (message) {
    const at = stack.indexOf(message);
    if (at < 0) return "";
    header = at + message.length;
  } else {
    // No message: V8 writes the name alone, then the frames.
    header = stack.indexOf("\n");
    if (header < 0) return "";
  }
  const rest = stack.slice(header);
  return rest.startsWith("\n") ? rest.slice(1) : "";
}

/**
 * The error written out as console.error would, but by hand, so that the
 * values never reach the text: each error in the chain gives its name, its
 * message up to "params:", and its other properties with `params` and `detail`
 * hidden. The outermost stack's frames follow.
 *
 * Reading the properties can throw where console.error would not: a getter of
 * the error's own runs here, through Object.entries. A log line is written
 * either way, from what the error says of itself, with the values still cut.
 */
function printWithoutQueryValues(err: unknown): string {
  try {
    const parts: string[] = [];
    for (const e of chain(err)) {
      if (e instanceof Error) {
        const details = detailsOf(e);
        const rest = Object.keys(details).length ? ` ${inspect(details, { depth: 4 })}` : "";
        parts.push(`${nameOf(e)}: ${messageWithoutParams(messageOf(e))}${rest}`);
      } else {
        parts.push(inspect(typeof e === "object" && e !== null ? detailsOf(e) : e, { depth: 4 }));
      }
    }
    const frames = framesOf(err);
    return frames ? `${parts.join("\ncaused by: ")}\n${frames}` : parts.join("\ncaused by: ");
  } catch {
    return messageWithoutParams(asText(err));
  }
}

/** An error's name, which needn't be readable either. */
function nameOf(err: unknown): string {
  const name = readOf(err, "name");
  return typeof name === "string" ? name : "Error";
}

/**
 * The error to log: the error itself when it holds no token and no query
 * values, so the log keeps its type and stack as they were; otherwise a copy
 * with both hidden.
 *
 * "Holds" means anywhere a log would print it, not just the message and the
 * stack: a cause, pg's `detail`, drizzle's `params`. So the error is read as
 * console.error reads it, and deeper, and the copy carries that whole reading
 * as its stack, redacted.
 */
export function redactError(err: unknown): unknown {
  if (typeof err === "string") return redactSecrets(err);
  const values = carriesQueryValues(err);
  const full = values ? printWithoutQueryValues(err) : inspect(err, { depth: 5 });
  const hidden = redactSecrets(full);
  if (!values && hidden === full) return err;
  if (!(err instanceof Error)) return hidden;
  const copy = new Error(redactSecrets(messageWithoutParams(messageOf(err))));
  copy.name = redactSecrets(nameOf(err));
  copy.stack = hidden;
  return copy;
}
