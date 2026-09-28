import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseModel } from "@oth/model";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { suggestionSvg } from "./debugSvg";
import { walkableAt, walkableRaster } from "./raster";
import { MAX_WIDTH_M, MIN_WIDTH_M, suggestPaths } from "./suggest";

/**
 * By hand only: suggestPaths on the real floors, from a model dumped off a
 * scratch copy of the dev database (Plan 6D, Task 7 says how). It never runs
 * in the suite, since the data never enters the repo.
 *
 *   OTH_MODEL_JSON=<scratch>/model.json OTH_PATHS_OUT=<scratch> \
 *     bash .superpowers/run-tests.sh vitest packages/server/src/paths/real.test.ts
 */
const modelPath = process.env.OTH_MODEL_JSON;
const outDir = process.env.OTH_PATHS_OUT;

describe.skipIf(!modelPath)("suggestPaths on the real floors", () => {
  for (const code of ["L1", "L2"]) {
    it(`proposes ${code}'s paths in under 2 s, every line on the walkable surface`, async () => {
      const model = parseModel(JSON.parse(await readFile(modelPath!, "utf8")));
      const level = model.levels.find(l => l.code === code)!;
      const started = performance.now();
      const s = suggestPaths(model, level.id);
      const ms = performance.now() - started;
      console.log(`${code}: ${s.lines.length} lines, ${s.links.length} links, ${s.unconnected.length} unconnected, ${Math.round(ms)} ms`);
      if (outDir) {
        const svg = suggestionSvg(model, level.id, s);
        await writeFile(join(outDir, `paths-${code}.svg`), svg);
        await sharp(Buffer.from(svg)).png().toFile(join(outDir, `paths-${code}.png`));
      }
      expect(ms).toBeLessThan(2000);
      expect(s.lines.length).toBeGreaterThan(0);
      const surface = walkableRaster(model, level.id);
      const off = s.lines.flatMap(l => l.polyline).filter(p => !walkableAt(surface, p));
      expect(off).toEqual([]);
      for (const line of s.lines) {
        expect(line.widthM).toBeGreaterThanOrEqual(MIN_WIDTH_M);
        expect(line.widthM).toBeLessThanOrEqual(MAX_WIDTH_M);
      }
    });
  }
});
