import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { validateModel, type ValidationReport } from "@oth/model";
import { buildBundle } from "@oth/model/bundle";
import { isNull } from "drizzle-orm";
import type { Database } from "../db/client";
import { assets, publishedVersions } from "../db/schema";
import { assembleModel } from "../model/assemble";

export class PublishBlockedError extends Error {
  constructor(public readonly report: ValidationReport) {
    super(`publish blocked: ${report.errorCount} validation error(s)`);
    this.name = "PublishBlockedError";
  }
}

/** Sortable and human-readable: 2026-09-04T12-00-00-000Z. */
function versionId(now: Date): string {
  return now.toISOString().replace(/[:.]/g, "-");
}

export type PublishInput = { createdBy: string; notes?: string };

/**
 * Snapshots the editing database into an immutable published bundle.
 *
 * Validation runs first and nothing is written if it fails — a half-written
 * bundle directory is worse than no bundle at all.
 */
export async function publish(db: Database, dataDir: string, input: PublishInput) {
  const model = await assembleModel(db);

  const report = validateModel(model);
  if (!report.ok) throw new PublishBlockedError(report);

  const now = new Date();
  const version = versionId(now);
  const files = buildBundle(model, {
    version,
    createdAt: now.toISOString(),
    createdBy: input.createdBy,
    notes: input.notes ?? "",
  });

  const root = join(dataDir, "published", version);
  for (const file of files) {
    const full = join(root, file.path);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, file.contents, "utf8");
  }

  // Copy the referenced .glb files alongside. The bundle builder is I/O-free,
  // so this is the server's half of the contract.
  const assetRows = await db.select().from(assets).where(isNull(assets.deletedAt));
  const referenced = new Set(model.placements.map(p => p.assetId));
  for (const asset of assetRows) {
    if (!referenced.has(asset.id)) continue;
    const dest = join(root, "assets", `${asset.checksum}.glb`);
    await mkdir(dirname(dest), { recursive: true });
    await copyFile(join(dataDir, asset.storagePath), dest);
  }

  const manifest = JSON.parse(files.find(f => f.path === "manifest.json")?.contents ?? "{}");

  await db.insert(publishedVersions).values({
    id: version,
    createdBy: input.createdBy,
    notes: input.notes ?? "",
    warningCount: report.warningCount,
    manifest,
  });

  await writeFile(
    join(dataDir, "published", "latest.json"),
    JSON.stringify({ version, publishedAt: now.toISOString() }),
    "utf8",
  );

  return { version, warningCount: report.warningCount, manifest };
}
