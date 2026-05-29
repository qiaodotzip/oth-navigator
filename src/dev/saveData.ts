/**
 * Write an editor's JSON straight into `public/data/<name>` via the dev-only
 * `/__save` middleware (see vite.config.ts). Returns the repo-relative path on
 * success. Only works while running the Vite dev server — in a production build
 * the endpoint doesn't exist, so callers should keep the download/export path
 * as a fallback.
 */
export async function saveDataFile(name: string, data: unknown): Promise<string> {
  const res = await fetch("/__save", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, data }),
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => res.statusText);
    throw new Error(`save failed (${res.status}): ${msg}`);
  }
  const json = (await res.json()) as { path?: string };
  return json.path ?? `public/data/${name}`;
}
