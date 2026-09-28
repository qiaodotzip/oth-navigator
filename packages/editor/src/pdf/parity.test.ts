import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pointInPolygon, type Ring } from "@oth/model";
import { describe, expect, it } from "vitest";
import { prepareFind } from "./extract";
import { findRooms } from "./findRooms";
import { openPdf } from "./pdfjs";
import { readSheet } from "./sheet";

/**
 * By hand only (spec §9): the port against scripts/extract-storey-plan.py on
 * the real L1 sheet, which never enters the repo.
 *
 *   OTH_L1_PDF="C:/Users/qhuip/Repositories/oth_navigation/docs/1st Level - Floor Plan.pdf" \
 *     bash .superpowers/run-tests.sh vitest packages/editor/src/pdf/parity.test.ts
 */
const sheetPath = process.env.OTH_L1_PDF;

type Shape = { footprint: Ring; holes: readonly Ring[] };

function bounds(ring: Ring) {
  const xs = ring.map(p => p[0]);
  const ys = ring.map(p => p[1]);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

function overlaps(a: Ring, b: Ring): boolean {
  const p = bounds(a);
  const q = bounds(b);
  return p.minX < q.maxX && q.minX < p.maxX && p.minY < q.maxY && q.minY < p.maxY;
}

/** Intersection over union, by sampling both on a 0.25 m grid. */
function iou(a: Shape, b: Shape, step = 0.25): number {
  const p = bounds([...a.footprint, ...b.footprint]);
  let both = 0;
  let either = 0;
  for (let x = p.minX + step / 2; x < p.maxX; x += step) {
    for (let y = p.minY + step / 2; y < p.maxY; y += step) {
      const inA = pointInPolygon([x, y], a.footprint, a.holes);
      const inB = pointInPolygon([x, y], b.footprint, b.holes);
      if (inA || inB) either++;
      if (inA && inB) both++;
    }
  }
  return either === 0 ? 0 : both / either;
}

describe.skipIf(!sheetPath)("parity with scripts/extract-storey-plan.py on the real L1 sheet", () => {
  it("reads 0.750504 m per point, and finds the spaces the script found", async () => {
    const { doc, close } = await openPdf(new Uint8Array(await readFile(sheetPath!)));
    try {
      const page = await doc.getPage(1);
      const reading = await readSheet(page);
      const S = reading.calibration.metresPerPoint!;
      expect(Math.abs(S - 0.750504) / 0.750504).toBeLessThan(1e-4);

      // The script's own placement: its --origin (628.03, 489.39) in unrotated points is
      // (792 − 628.03, 489.39) on the sheet as shown, and its --window runs x −20…280 m, y 300…10 m.
      const X0 = reading.width - 628.03;
      const Y0 = 489.39;
      const sheet = { clipPt: [X0 - 20 / S, Y0 - 300 / S, X0 + 280 / S, Y0 - 10 / S] as const, pointsPerPixel: 0.05 / S };
      const result = findRooms(await prepareFind(doc, page, sheet, { metresPerPixel: 0.05, offsetX: -20, offsetY: 300 }, 0.05));

      // From the worktree root, where the command above runs: under jsdom, import.meta.url is not a file URL.
      const file = resolve(process.cwd(), "packages/server/src/cli/data/l1-spaces.json");
      const reference = JSON.parse(await readFile(file, "utf8")) as { spaces: (Shape & { nameEn: string })[] };
      // Part B leaves escalators out and keeps voids, both on purpose: compare the rest.
      const theirs = reference.spaces.filter(s => !/escalator/i.test(s.nameEn));
      const ours = result.drafts.filter(d => d.footprint && d.kind !== "void").map(d => ({ footprint: d.footprint!, holes: d.holes ?? [] }));
      const best = theirs.map(t => Math.max(0, ...ours.filter(o => overlaps(t.footprint, o.footprint)).map(o => iou(t, o))));
      best.sort((a, b) => a - b);
      const median = best[Math.floor(best.length / 2)]!;
      console.log(`parity: ${ours.length} found, ${theirs.length} in l1-spaces.json, median IoU ${median.toFixed(3)}, ${S} m per point`);
      expect(Math.abs(ours.length - theirs.length) / theirs.length).toBeLessThanOrEqual(0.05);
      expect(median).toBeGreaterThanOrEqual(0.95);
    } finally {
      await close();
    }
  }, 280_000);
});
