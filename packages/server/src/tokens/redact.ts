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

/**
 * The error to log: the error itself when it holds no token, so the log keeps
 * its type and stack as they were; otherwise a copy with every token hidden.
 *
 * "Holds" means anywhere a log would print it, not just the message and the
 * stack: a cause, pg's `detail`, drizzle's `params`. So the error is read as
 * console.error reads it, and deeper, and the copy carries that whole reading
 * as its stack, redacted.
 */
export function redactError(err: unknown): unknown {
  if (typeof err === "string") return redactSecrets(err);
  const full = inspect(err, { depth: 5 });
  const hidden = redactSecrets(full);
  if (hidden === full) return err;
  if (!(err instanceof Error)) return hidden;
  const copy = new Error(redactSecrets(err.message));
  copy.name = redactSecrets(err.name);
  copy.stack = hidden;
  return copy;
}
