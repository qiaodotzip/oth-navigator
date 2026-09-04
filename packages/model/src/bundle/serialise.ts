/** Millimetre precision. Bundles must not churn on floating-point noise. */
export function round3(n: number): number {
  const r = Math.round(n * 1000) / 1000;
  return r === 0 ? 0 : r;
}

/**
 * JSON with sorted object keys and rounded floats. Two models that differ only
 * in key insertion order or in the twelfth decimal place produce byte-identical
 * bundles, which is what makes published versions comparable and cacheable.
 */
export function stableStringify(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "number") return JSON.stringify(round3(value));
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
  }
  return "null";
}
