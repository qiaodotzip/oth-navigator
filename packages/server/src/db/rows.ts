export type Row = Record<string, unknown>;

/** Audit columns are timestamps in Postgres and ISO strings in the model schema. */
const DATE_FIELDS = ["updatedAt", "deletedAt", "createdAt"] as const;

/**
 * `deletedAt` is the one column where null is meaningful rather than merely
 * absent — it is how "not deleted" is spelled, and the model schema accepts it.
 */
const NULLABLE_FIELDS = new Set<string>(["deletedAt"]);

/**
 * Converts a Drizzle row into something `@oth/model`'s schemas can parse.
 *
 * Two impedance mismatches to bridge. Drizzle hands back `Date` objects where
 * the model uses ISO strings. And Postgres spells "no value" as `null` while
 * the model's optional fields mean `undefined` — so a null optional column is
 * dropped entirely, letting the schema's own default apply.
 */
export function toModelRow(row: Row): Row {
  const out: Row = {};
  for (const [key, value] of Object.entries(row)) {
    if (value === null && !NULLABLE_FIELDS.has(key)) continue;
    out[key] = value instanceof Date ? value.toISOString() : value;
  }
  for (const field of DATE_FIELDS) {
    const value = row[field];
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
