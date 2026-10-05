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

/** The error and every cause behind it, each once: a cause may lead back. */
function* chain(err: unknown): Generator<unknown> {
  const seen = new Set<unknown>();
  for (let e: unknown = err; e != null && !seen.has(e); e = (e as { cause?: unknown }).cause) {
    seen.add(e);
    yield e;
  }
}

function carriesQueryValues(err: unknown): boolean {
  for (const e of chain(err)) {
    if (typeof e !== "object" || e === null) continue;
    if ("params" in e) return true;
    if ("detail" in e && (e as { detail?: unknown }).detail != null) return true;
  }
  return false;
}

/**
 * Everything the error carries but its cause, which the walk prints itself,
 * and but the values. What is left is what an operator acts on: pg's `code`,
 * `constraint`, `table`, `column`, `schema`, `routine`, and drizzle's SQL.
 */
function detailsOf(err: object): Record<string, unknown> {
  const details: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(err)) {
    if (key === "cause") continue;
    if (key === "params") details.params = `${Array.isArray(value) ? value.length : 1} ${HIDDEN}`;
    // An absent detail says so, rather than reading as one that was hidden.
    else if (key === "detail") details.detail = value == null ? value : HIDDEN;
    else details[key] = value;
  }
  return details;
}

/** A stack's frames alone, which name files and not values, so they are kept. */
function framesOf(err: unknown): string {
  const stack = (err as { stack?: unknown } | null)?.stack;
  if (typeof stack !== "string") return "";
  return stack.split("\n").filter(line => /^\s+at /.test(line)).join("\n");
}

/**
 * The error written out as console.error would, but by hand, so that the
 * values never reach the text: each error in the chain gives its name, its
 * message up to "params:", and its other properties with `params` and `detail`
 * hidden. The outermost stack's frames follow.
 */
function printWithoutQueryValues(err: unknown): string {
  const parts: string[] = [];
  for (const e of chain(err)) {
    if (e instanceof Error) {
      const details = detailsOf(e);
      const rest = Object.keys(details).length ? ` ${inspect(details, { depth: 4 })}` : "";
      parts.push(`${e.name}: ${messageWithoutParams(e.message)}${rest}`);
    } else {
      parts.push(inspect(typeof e === "object" && e !== null ? detailsOf(e) : e, { depth: 4 }));
    }
  }
  const frames = framesOf(err);
  return frames ? `${parts.join("\ncaused by: ")}\n${frames}` : parts.join("\ncaused by: ");
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
  const copy = new Error(redactSecrets(messageWithoutParams(err.message)));
  copy.name = redactSecrets(err.name);
  copy.stack = hidden;
  return copy;
}
