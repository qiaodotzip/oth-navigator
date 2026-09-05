import { readFile, stat } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Hono } from "hono";
import type { AppEnv } from "./app";

const here = dirname(fileURLToPath(import.meta.url));

/** Where `npm run build --workspace @oth/editor` puts its output. */
export const DEFAULT_EDITOR_DIST = resolve(here, "../../editor/dist");

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".woff2": "font/woff2",
  ".glb": "model/gltf-binary",
};

async function readIfFile(path: string): Promise<Uint8Array | null> {
  try {
    if (!(await stat(path)).isFile()) return null;
    return new Uint8Array(await readFile(path));
  } catch {
    return null;
  }
}

/**
 * Serves the built editor so Railway runs one service rather than two.
 *
 * Registered after the API routes, so `/api/*` always wins. When no build is
 * present — the normal case in development, where Vite serves the editor — this
 * says so instead of returning a bare "not found", which is what someone
 * opening the server's root actually needs to be told.
 */
export function staticRoutes(editorDist: string = DEFAULT_EDITOR_DIST) {
  const routes = new Hono<AppEnv>();

  routes.get("/*", async c => {
    const path = c.req.path;
    if (path.startsWith("/api/")) return c.notFound();

    // Check the decoded form too: %2e%2e survives URL normalisation.
    let decoded = path;
    try {
      decoded = decodeURIComponent(path);
    } catch {
      return c.json({ error: "bad path" }, 400);
    }
    if (decoded.includes("..")) return c.json({ error: "bad path" }, 400);

    const isRoot = path === "/";
    const relative = isRoot ? "index.html" : path.replace(/^\//, "");
    const direct = await readIfFile(join(editorDist, relative));

    if (direct) {
      const type = CONTENT_TYPES[extname(relative).toLowerCase()] ?? "application/octet-stream";
      // Vite fingerprints its assets, so they can be cached hard; index.html cannot.
      const cache = relative === "index.html"
        ? "no-cache"
        : "public, max-age=31536000, immutable";
      return c.body(direct.buffer as ArrayBuffer, 200, { "content-type": type, "cache-control": cache });
    }

    // The root, or any path without a file extension, is a document request:
    // hand back the app shell so client-side routes work on a hard refresh.
    if (isRoot || !extname(relative)) {
      const index = await readIfFile(join(editorDist, "index.html"));
      if (index) {
        return c.body(index.buffer as ArrayBuffer, 200, {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-cache",
        });
      }
      return c.json({
        error: "editor build not found",
        detail:
          "This is the OTH API. In development the editor runs separately on :5180 " +
          "(npm run dev --workspace @oth/editor). To serve it from here, build it first: " +
          "npm run build --workspace @oth/editor",
        api: "/api/health",
      }, 404);
    }

    return c.json({ error: "not found" }, 404);
  });

  return routes;
}
