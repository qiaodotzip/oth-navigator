import "dotenv/config";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { cors } from "hono/cors";
import OpenAI from "openai";

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

if (process.env.NODE_ENV === "production") {
  app.use("/*", serveStatic({ root: "./dist" }));
  app.get("/*", serveStatic({ path: "./dist/index.html" }));
}

const port = Number(process.env.PORT ?? 3000);
serve({ fetch: app.fetch, port }, info => {
  console.log(`[server] listening on http://localhost:${info.port}`);
});
