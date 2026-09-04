import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../app";
import { requireUser } from "../auth/middleware";
import { PublishBlockedError, publish } from "./service";

const Body = z.object({ notes: z.string().max(2000).optional() });

export const publishRoutes = new Hono<AppEnv>();

publishRoutes.post("/publish", requireUser, async c => {
  const body = Body.safeParse(await c.req.json().catch(() => ({})));
  try {
    const result = await publish(c.get("db"), c.get("dataDir"), {
      createdBy: c.get("user").id,
      notes: body.success ? body.data.notes : undefined,
    });
    return c.json(result, 201);
  } catch (err) {
    if (err instanceof PublishBlockedError) {
      return c.json({ error: "validation failed", report: err.report }, 422);
    }
    throw err;
  }
});

/** Published bundles are public: this is what the visitor app reads. */
publishRoutes.get("/published/:version/*", async c => {
  const version = c.req.param("version");
  const rest = c.req.path.split(`/published/${version}/`)[1] ?? "";
  // Reject traversal before touching the filesystem.
  if (rest.includes("..")) return c.json({ error: "bad path" }, 400);
  try {
    const bytes = new Uint8Array(await readFile(join(c.get("dataDir"), "published", version, rest)));
    const type = rest.endsWith(".glb") ? "model/gltf-binary" : "application/json";
    return c.body(bytes.buffer as ArrayBuffer, 200, {
      "content-type": type,
      "cache-control": "public, max-age=31536000, immutable",
    });
  } catch {
    return c.json({ error: "not found" }, 404);
  }
});
