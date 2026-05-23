import "dotenv/config";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { cors } from "hono/cors";
import OpenAI from "openai";
import { getCatalog, DEMO_JOURNEY } from "./serviceCatalog";
import type { FloorId, ServiceCategory } from "../src/data/types";

const SYSTEM_PROMPT = `You are a wayfinding assistant inside One Tampines Hub (OTH) in Singapore.
You help elderly visitors find counters. Tone: warm, concise, Singapore-English-aware.
RULES:
- Pick the single best service from the catalog for the user's query.
- Produce a short narration with one segment per "segmentKey" found in the route waypoints.
- Provide narration in both English (en) and Mandarin (zh) for every segment.
- Never claim step-free routing for a service flagged stepFreeRoute=false.
- If the service genuinely lacks step-free access, say so plainly in the relevant segment.
- Do not invent services or locations.`;

const SCHEMA = {
  name: "narration",
  strict: true,
  schema: {
    type: "object",
    required: ["serviceId", "segments"],
    additionalProperties: false,
    properties: {
      serviceId: { type: "string" },
      segments: {
        type: "array",
        items: {
          type: "object",
          required: ["key", "en", "zh"],
          additionalProperties: false,
          properties: {
            key: { type: "string" },
            en: { type: "string" },
            zh: { type: "string" },
          },
        },
      },
    },
  },
} as const;

const app = new Hono();
app.use("*", cors());

app.get("/api/health", c => c.json({ ok: true }));

// Dev-only: write editor output straight into public/data/floors so the
// download-and-replace dance isn't needed. Disabled in production.
app.post("/api/save-floor", async c => {
  if (process.env.NODE_ENV === "production") {
    return c.json({ error: "disabled in production" }, 403);
  }
  const body = await c.req.json().catch(() => null);
  const floorId = body?.floorId;
  const kind = body?.kind; // "floor" | "details"
  const data = body?.data;
  if (!["L1", "L2"].includes(floorId) || !data) {
    return c.json({ error: "bad floorId or missing data" }, 400);
  }
  const dir = resolve(process.cwd(), "public/data/floors");
  try {
    if (kind === "details") {
      const path = resolve(dir, `${floorId}-details.json`);
      await writeFile(path, JSON.stringify(data, null, 2));
      return c.json({ ok: true, file: `${floorId}-details.json` });
    }
    // kind === "floor": write id/bounds/polygons but PRESERVE existing inline details.
    const path = resolve(dir, `${floorId}.json`);
    let existingDetails: unknown[] | undefined;
    try {
      const cur = JSON.parse((await readFile(path, "utf8")).replace(/^﻿/, ""));
      if (Array.isArray(cur.details)) existingDetails = cur.details;
    } catch {
      /* file may not exist yet */
    }
    const out = {
      id: data.id ?? floorId,
      bounds: data.bounds,
      polygons: data.polygons,
      ...(existingDetails ? { details: existingDetails } : {}),
    };
    await writeFile(path, JSON.stringify(out, null, 2));
    return c.json({ ok: true, file: `${floorId}.json` });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: msg }, 500);
  }
});

app.post("/api/narrate", async c => {
  const body = await c.req.json();
  const { query, profile, services, segmentKeys } = body ?? {};
  if (!query || !services) {
    return c.json({ error: "missing fields" }, 400);
  }
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return c.json({ error: "OPENAI_API_KEY not set" }, 500);
  }
  const client = new OpenAI({ apiKey });
  try {
    const completion = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL ?? "gpt-4o",
      response_format: { type: "json_schema", json_schema: SCHEMA },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: JSON.stringify({ query, profile, services, segmentKeys }),
        },
      ],
    });
    const text = completion.choices[0]?.message?.content ?? "{}";
    return new Response(text, {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[narrate] OpenAI error:", msg);
    return c.json({ error: msg }, 500);
  }
});

app.get("/api/services", c => {
  const categoryParam = c.req.query("category");
  const floorParam = c.req.query("floor");
  try {
    const category = categoryParam
      ? (categoryParam.split(",").map(s => s.trim()) as ServiceCategory[])
      : undefined;
    const floor = floorParam ? (floorParam as FloorId) : undefined;
    return c.json(getCatalog({ category, floor }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[services] catalog error:", msg);
    return c.json({ error: msg }, 500);
  }
});

app.get("/api/demo-journey", c => c.json(DEMO_JOURNEY));

if (process.env.NODE_ENV === "production") {
  app.use("/*", serveStatic({ root: "./dist" }));
  app.get("/*", serveStatic({ path: "./dist/index.html" }));
}

const port = Number(process.env.PORT ?? 3000);
serve({ fetch: app.fetch, port }, info => {
  console.log(`[server] listening on http://localhost:${info.port}`);
});
