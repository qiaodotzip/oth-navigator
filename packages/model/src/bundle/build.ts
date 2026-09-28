import { createHash } from "node:crypto";
import { bakeNavGrid } from "../nav/grid";
import { live } from "../primitives";
import type { MapModel } from "../schema/model";
import { validateModel } from "../validation/validate";
import { stableStringify } from "./serialise";

export type BundleFile = { path: string; contents: string };

export type BundleMeta = {
  version: string;
  createdAt: string;
  createdBy: string;
  notes?: string;
};

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function byId<T extends { id: string }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * Snapshots a model into the immutable published bundle.
 *
 * Throws if validation reports any error — the publish gate refuses to ship a
 * broken model rather than letting a visitor-facing app render it. Soft-deleted
 * entities never reach the bundle.
 *
 * Text files only: the .glb assets live on the server's volume and are copied
 * alongside these by the publish endpoint. This package does no I/O.
 */
export function buildBundle(model: MapModel, meta: BundleMeta): BundleFile[] {
  const report = validateModel(model);
  if (!report.ok) {
    const first = report.issues.find(i => i.severity === "error");
    throw new Error(
      `Refusing to publish: validation failed with ${report.errorCount} error(s). First: ${first?.code} — ${first?.message}`,
    );
  }

  const levels = byId(live(model.levels));
  const files: BundleFile[] = [];

  files.push({
    path: "building.json",
    // Owners are who does the editing — nothing a visitor needs, and user ids
    // have no business in a public file.
    contents: stableStringify({
      building: model.building,
      levels: levels.map(({ ownerIds: _owners, ...rest }) => rest),
    }),
  });

  for (const level of levels) {
    files.push({
      path: `levels/${level.code}.json`,
      contents: stableStringify({
        levelId: level.id,
        code: level.code,
        rooms: byId(live(model.rooms).filter(r => r.levelId === level.id)),
        doorways: byId(live(model.doorways).filter(d => d.levelId === level.id)),
        entrances: byId(live(model.entrances).filter(e => e.levelId === level.id)),
        tenants: byId(live(model.tenants).filter(t => t.levelId === level.id)),
      }),
    });
  }

  files.push({
    path: "nav.json",
    contents: stableStringify({
      portals: byId(live(model.portals)),
      portalEndpoints: byId(live(model.portalEndpoints)),
      navHints: byId(live(model.navHints)),
      grids: levels.map(level => {
        const grid = bakeNavGrid(model, level.id);
        return {
          levelId: grid.levelId,
          originX: grid.originX,
          originY: grid.originY,
          cols: grid.cols,
          rows: grid.rows,
          cellSizeM: grid.cellSizeM,
          /** Packed bitmask, base64. ~60 KB per level at OTH's footprint. */
          bits: Buffer.from(grid.bits).toString("base64"),
        };
      }),
    }),
  });

  files.push({
    path: "placements.json",
    contents: stableStringify({
      assets: byId(live(model.assets)),
      // The size and model every object of a kind is drawn with (spec §5.3).
      objectKinds: byId(live(model.objectKinds)),
      // The tags an object was placed from point into the survey layer, which stays server-side.
      placements: byId(live(model.placements)).map(({ sightingIds: _tags, ...placement }) => placement),
    }),
  });

  const checksums: Record<string, string> = {};
  for (const f of files) checksums[f.path] = sha256(f.contents);

  files.push({
    path: "manifest.json",
    contents: stableStringify({
      version: meta.version,
      createdAt: meta.createdAt,
      createdBy: meta.createdBy,
      notes: meta.notes ?? "",
      warningCount: report.warningCount,
      files: files.map(f => f.path).sort(),
      checksums,
    }),
  });

  return files;
}
