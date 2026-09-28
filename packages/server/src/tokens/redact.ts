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
 */
export function redactError(err: unknown): unknown {
  if (typeof err === "string") return redactSecrets(err);
  if (!(err instanceof Error)) return err;
  const text = `${err.message}\n${err.stack ?? ""}`;
  if (redactSecrets(text) === text) return err;
  const copy = new Error(redactSecrets(err.message));
  copy.name = err.name;
  copy.stack = err.stack === undefined ? undefined : redactSecrets(err.stack);
  return copy;
}
