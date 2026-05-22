import { parse } from "svgson";
import { readFile, writeFile } from "node:fs/promises";

type PolygonType = "room" | "corridor" | "landmark" | "void";
type Polygon = {
  id: string;
  points: [number, number][];
  heightMeters: number;
  type: PolygonType;
};

const HEIGHT_BY_TYPE: Record<PolygonType, number> = {
  room: 3.5,
  corridor: 3.5,
  landmark: 4.5,
  void: 0.1,
};

function typeFromId(id: string): PolygonType {
  if (id.includes("-corridor-")) return "corridor";
  if (id.includes("-landmark-")) return "landmark";
  if (id.includes("-void-")) return "void";
  return "room";
}

function parsePathD(d: string): [number, number][] {
  const points: [number, number][] = [];
  const tokens = d.replace(/,/g, " ").split(/\s+/).filter(Boolean);
  let i = 0;
  let cx = 0;
  let cy = 0;
  while (i < tokens.length) {
    const t = tokens[i];
    if (t === "M" || t === "L") {
      cx = parseFloat(tokens[i + 1]);
      cy = parseFloat(tokens[i + 2]);
      points.push([cx, cy]);
      i += 3;
    } else if (t === "Z" || t === "z") {
      i += 1;
    } else if (!isNaN(parseFloat(t))) {
      cx = parseFloat(t);
      cy = parseFloat(tokens[i + 1]);
      points.push([cx, cy]);
      i += 2;
    } else {
      i += 1;
    }
  }
  return points;
}

export async function extractPolygons(
  svgString: string,
  floorId: string,
  metresWidth: number,
  metresDepth: number,
) {
  const parsed = await parse(svgString);
  const svgWidth = parseFloat(parsed.attributes.width ?? "1000");
  const svgHeight = parseFloat(parsed.attributes.height ?? "1000");
  const scaleX = metresWidth / svgWidth;
  const scaleY = metresDepth / svgHeight;

  const polygons: Polygon[] = [];
  const walk = (node: any) => {
    if (node.name === "path" && node.attributes?.id?.startsWith(`${floorId}-`)) {
      const id = node.attributes.id;
      const raw = parsePathD(node.attributes.d ?? "");
      const points = raw.map(
        ([x, y]) => [x * scaleX, y * scaleY] as [number, number],
      );
      if (points.length >= 3) {
        polygons.push({
          id,
          points,
          heightMeters: HEIGHT_BY_TYPE[typeFromId(id)],
          type: typeFromId(id),
        });
      }
    }
    (node.children ?? []).forEach(walk);
  };
  walk(parsed);

  return {
    id: floorId,
    bounds: { width: metresWidth, depth: metresDepth },
    polygons,
  };
}

async function main() {
  const [, , svgPath, floorId, widthStr, depthStr, outPath] = process.argv;
  if (!svgPath) {
    console.error(
      "Usage: tsx scripts/svg-to-polygons.ts <svg> <floorId> <widthM> <depthM> <out>",
    );
    process.exit(1);
  }
  const svg = await readFile(svgPath, "utf8");
  const result = await extractPolygons(
    svg,
    floorId,
    parseFloat(widthStr),
    parseFloat(depthStr),
  );
  await writeFile(outPath, JSON.stringify(result, null, 2));
  console.log(`Wrote ${result.polygons.length} polygons to ${outPath}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
