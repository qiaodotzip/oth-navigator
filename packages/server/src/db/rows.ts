export type Row = Record<string, unknown>;

/** Audit columns are timestamps in Postgres and ISO strings in the model schema. */
const DATE_FIELDS = ["updatedAt", "deletedAt", "createdAt"] as const;

/**
 * Converts a Drizzle row into something `@oth/model`'s schemas can parse.
 * Drizzle hands back `Date` objects; the model uses ISO strings, so every path
 * that feeds a row back through a schema goes through here.
 */
export function toModelRow(row: Row): Row {
  const out: Row = { ...row };
  for (const field of DATE_FIELDS) {
    const value = out[field];
    if (value instanceof Date) out[field] = value.toISOString();
  }
  return out;
}

/**
 * Removes the audit columns from a parsed model object. They are owned by the
 * repository — writing the model's string versions back into timestamp columns
 * would fail — so callers set them explicitly.
 */
export function stripAuditFields(row: Row): Row {
  const { version: _v, updatedAt: _ua, updatedBy: _ub, deletedAt: _da, ...rest } = row;
  return rest;
}
