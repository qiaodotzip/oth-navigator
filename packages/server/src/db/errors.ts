/**
 * Postgres's unique_violation, from pg and PGlite alike, wherever drizzle has
 * put it.
 *
 * Since drizzle 0.45 a failed query arrives as a DrizzleQueryError — the SQL
 * and its parameters in the message, the database's own error as the `cause` —
 * so reading `code` off the error that was caught finds nothing, and a taken
 * id would be answered 500 rather than 409. The chain is walked instead, and
 * the earlier shape (the code on the error itself) still counts, so this holds
 * whichever way a future version throws.
 */
export function isUniqueViolation(err: unknown): boolean {
  // A cause that leads back to itself would otherwise loop forever.
  const seen = new Set<unknown>();
  for (let e: unknown = err; e != null && !seen.has(e); e = (e as { cause?: unknown }).cause) {
    seen.add(e);
    if ((e as { code?: unknown }).code === "23505") return true;
  }
  return false;
}
