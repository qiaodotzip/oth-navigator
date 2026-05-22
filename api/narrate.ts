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

export const config = { runtime: "nodejs" };

export default async function handler(req: Request) {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
  const body = await req.json();
  const { query, profile, services, segmentKeys } = body ?? {};
  if (!query || !services) return new Response("missing fields", { status: 400 });

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  try {
    const completion = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL ?? "gpt-4o",
      response_format: { type: "json_schema", json_schema: SCHEMA },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: JSON.stringify({
            query,
            profile,
            services,
            segmentKeys,
          }),
        },
      ],
    });
    const text = completion.choices[0]?.message?.content ?? "{}";
    return new Response(text, {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
