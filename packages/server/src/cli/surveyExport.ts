import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { and, eq, isNull } from "drizzle-orm";
import { readAsset } from "../assets/storage";
import type { Database } from "../db/client";
import { captures, keyframes, places } from "../db/schema";

/**
 * Writes one capture's frames to a folder, with everything an agent needs to
 * label them.
 *
 * The labelling runs in whoever's Claude Code session is open — mine or a
 * teammate's — rather than behind a server-side API key. That costs nothing per
 * run, works the same for everyone, and keeps the judgement where it belongs.
 * The contract is this folder: frames in, one JSON out, `survey:import` back.
 */
export async function exportCaptureForLabelling(
  db: Database, dataDir: string, captureId: string, outDir: string,
): Promise<{ frames: number; dir: string }> {
  const [capture] = await db.select().from(captures).where(eq(captures.id, captureId));
  if (!capture) throw new Error(`no capture ${captureId}`);

  const frames = await db.select().from(keyframes)
    .where(and(eq(keyframes.captureId, captureId), isNull(keyframes.deletedAt)));
  frames.sort((a, b) => (a.timeMs ?? 0) - (b.timeMs ?? 0));

  const known = await db.select().from(places).where(isNull(places.deletedAt));

  const dir = join(outDir, captureId);
  await mkdir(join(dir, "frames"), { recursive: true });

  for (const frame of frames) {
    const bytes = await readAsset(dataDir, frame.storagePath);
    const ext = frame.storagePath.endsWith(".png") ? "png" : "jpg";
    await writeFile(join(dir, "frames", `${frame.id}.${ext}`), bytes);
  }

  await writeFile(join(dir, "manifest.json"), JSON.stringify({
    captureId,
    filename: capture.filename,
    kind: capture.kind,
    levelId: capture.levelId,
    frames: frames.map(f => ({
      keyframeId: f.id,
      file: `frames/${f.id}.${f.storagePath.endsWith(".png") ? "png" : "jpg"}`,
      timeMs: f.timeMs,
      widthPx: f.widthPx,
      heightPx: f.heightPx,
    })),
    // So a second pass links to what the first pass named instead of
    // duplicating it.
    knownPlaces: known.map(p => ({ id: p.id, nameEn: p.nameEn, category: p.category })),
  }, null, 2), "utf8");

  await writeFile(join(dir, "LABELLING.md"), INSTRUCTIONS, "utf8");
  return { frames: frames.length, dir };
}

const INSTRUCTIONS = `# Labelling this capture

You are proposing what is in each frame. Nothing you write here is treated as
true — a person reviews every proposal before it becomes part of the map — so
propose what you can actually see and say when you are unsure.

## What to do

1. Read \`manifest.json\`. It lists every frame and the places already named.
2. Look at each image under \`frames/\`.
3. Write \`proposals.json\` next to the manifest, in the shape below.
4. Tell whoever asked you to run \`survey:import <path to proposals.json>\`.

## The shape

\`\`\`json
{
  "captureId": "cap_...",
  "proposals": [
    {
      "keyframeId": "kf_...",
      "nameEn": "NTUC FairPrice",
      "category": "retail",
      "box": { "x": 0.1, "y": 0.2, "w": 0.3, "h": 0.4 },
      "placeId": "pl_existing",
      "note": "sign partly obscured"
    }
  ]
}
\`\`\`

- \`keyframeId\` — required, and must be one from the manifest.
- \`nameEn\` — required. What the sign actually says. Do not invent a name for
  something you cannot read; describe it instead ("unmarked shopfront").
- \`category\` — one of: government, healthcare, community, retail, lifestyle,
  sports, facility.
- \`box\` — optional, in fractions of the frame. Include it only when the frame
  shows more than one thing and it says which you mean.
- \`placeId\` — optional. If the thing is already in \`knownPlaces\`, use its id
  so the seventh sighting of a shop links rather than making a seventh shop.
- \`levelId\` — optional, like "oth-L3". Set it when the frame tells you the
  floor, such as a directory board. Otherwise the capture's floor is used.
- \`note\` — optional. Say what you were unsure about; the reviewer reads it.

## The point

One label per *individual* thing, not per category. Every shop, counter, kiosk
and machine gets its own identity, because that is what a visitor asks for by
name. A frame with four shopfronts should produce four proposals.
`;
