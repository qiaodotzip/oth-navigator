import type { Vec2 } from "@oth/model";

export type DxfPolyline = { layer: string; points: Vec2[]; closed: boolean };

type Pair = { code: number; value: string };

/** DXF is a flat list of (group code, value) pairs, one per line each. */
function readPairs(text: string): Pair[] {
  // AutoCAD writes CRLF; splitting on \n alone leaves \r on every value and
  // turns every coordinate into NaN.
  const lines = text.split(/\r\n|\r|\n/);
  const pairs: Pair[] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = Number.parseInt((lines[i] ?? "").trim(), 10);
    if (Number.isNaN(code)) continue;
    pairs.push({ code, value: (lines[i + 1] ?? "").trim() });
  }
  return pairs;
}

const MIN_POINTS = 3;

/**
 * Extracts closed and open polylines. Handles both LWPOLYLINE (modern, vertices
 * inline) and POLYLINE/VERTEX (legacy, vertices as following entities), because
 * exports from older CAD seats still use the latter.
 */
export function parseDxfPolylines(text: string): DxfPolyline[] {
  const pairs = readPairs(text);
  const out: DxfPolyline[] = [];

  let current: DxfPolyline | null = null;
  let inLegacy = false;
  let pendingX: number | null = null;

  const flush = () => {
    if (current && current.points.length >= MIN_POINTS) out.push(current);
    current = null;
    inLegacy = false;
    pendingX = null;
  };

  for (const { code, value } of pairs) {
    if (code === 0) {
      if (value === "LWPOLYLINE") {
        flush();
        current = { layer: "", points: [], closed: false };
      } else if (value === "POLYLINE") {
        flush();
        current = { layer: "", points: [], closed: false };
        inLegacy = true;
      } else if (value === "VERTEX" && inLegacy) {
        pendingX = null;
      } else if (value === "SEQEND" && inLegacy) {
        // The legacy vertex list ends here; keep reading until the next entity.
        continue;
      } else {
        // Any other entity ends the one being read.
        flush();
      }
      continue;
    }

    if (!current) continue;

    if (code === 8) current.layer = value;
    else if (code === 70) current.closed = (Number.parseInt(value, 10) & 1) === 1;
    else if (code === 10) pendingX = Number.parseFloat(value);
    else if (code === 20 && pendingX !== null) {
      const y = Number.parseFloat(value);
      if (Number.isFinite(pendingX) && Number.isFinite(y)) current.points.push([pendingX, y]);
      pendingX = null;
    }
  }

  flush();
  return out;
}
