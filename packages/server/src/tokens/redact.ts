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
 * Where drizzle puts the values a failed query was given: at the end of the
 * message, after the SQL, and in a `params` property of its own.
 *
 * They are hidden as a whole rather than matched for secrets. A session id is
 * a credential and looks like nothing in particular, so a pattern would let it
 * through — as would any value nobody thought of. Everything from "params:" to
 * the end of the message goes, because a value may hold a newline itself.
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

function carriesQueryParams(err: unknown): boolean {
  for (const e of chain(err)) if (typeof e === "object" && e !== null && "params" in e) return true;
  return false;
}

/** Everything the error carries but its cause, which the walk prints itself. */
function detailsOf(err: object): Record<string, unknown> {
  const details: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(err)) {
    if (key === "cause") continue;
    details[key] = key === "params" ? `${Array.isArray(value) ? value.length : 1} ${HIDDEN}` : value;
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
 * message without them, and its other properties with `params` replaced by a
 * count. The outermost stack's frames follow.
 */
function printWithoutQueryParams(err: unknown): string {
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
  const values = carriesQueryParams(err);
  const full = values ? printWithoutQueryParams(err) : inspect(err, { depth: 5 });
  const hidden = redactSecrets(full);
  if (!values && hidden === full) return err;
  if (!(err instanceof Error)) return hidden;
  const copy = new Error(redactSecrets(messageWithoutParams(err.message)));
  copy.name = redactSecrets(err.name);
  copy.stack = hidden;
  return copy;
}
