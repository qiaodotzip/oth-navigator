/**
 * PDFs built by hand for tests: Helvetica, straight lines and text, nothing
 * else. The architect's sheet never enters the repo (spec §9), so the tests
 * draw a storey plan in miniature instead.
 */
export type SyntheticPage = {
  width: number;
  height: number;
  rotate?: 0 | 90 | 180 | 270;
  /** Where the MediaBox starts. The content is moved with it, so the sheet looks the same. */
  origin?: [number, number];
  /**
   * Marks laid over the sheet, as a reviewer's stamp or cloud is: each a box
   * [x, y, w, h] and what its appearance draws, in the box's own space.
   */
  annotations?: readonly { rect: readonly [number, number, number, number]; appearance: string }[];
  content: string;
};

export function syntheticPdf(pages: readonly SyntheticPage[]): Uint8Array {
  const kids = pages.map((_, i) => `${4 + i * 2} 0 R`).join(" ");
  const objects: string[] = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  // Annotations and their appearances follow the pages, numbered on from them.
  const after: string[] = [];
  let next = 4 + pages.length * 2;
  pages.forEach((page, i) => {
    const [ox, oy] = page.origin ?? [0, 0];
    const body = ox || oy ? `q 1 0 0 1 ${ox} ${oy} cm\n${page.content}\nQ` : page.content;
    const annots = (page.annotations ?? []).map(({ rect: [x, y, w, h], appearance }) => {
      const ref = next;
      next += 2;
      after.push(
        `<< /Type /Annot /Subtype /Square /Rect [${ox + x} ${oy + y} ${ox + x + w} ${oy + y + h}] /F 4 /AP << /N ${ref + 1} 0 R >> >>`,
        `<< /Type /XObject /Subtype /Form /BBox [0 0 ${w} ${h}] /Length ${appearance.length} >>\nstream\n${appearance}\nendstream`,
      );
      return `${ref} 0 R`;
    });
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [${ox} ${oy} ${ox + page.width} ${oy + page.height}] ` +
        `/Rotate ${page.rotate ?? 0} /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + i * 2} 0 R` +
        `${annots.length ? ` /Annots [${annots.join(" ")}]` : ""} >>`,
      `<< /Length ${body.length} >>\nstream\n${body}\nendstream`,
    );
  });
  objects.push(...after);
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) out += `${String(o).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(out);
}

/** Helvetica's advance widths (per 1000), which pdf.js uses for this base-14 font: enough to centre a label. */
const HELVETICA: Record<string, number> = {
  " ": 278, ":": 278, "0": 556, "1": 556, "2": 556, "3": 556, "4": 556, "5": 556, "6": 556, "7": 556, "8": 556, "9": 556,
  A: 667, B: 667, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278, J: 500, K: 667, L: 556, M: 833,
  N: 722, O: 778, P: 667, Q: 778, R: 722, S: 667, T: 611, U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611,
};
export const textWidth = (s: string, size: number) =>
  [...s].reduce((w, ch) => w + (HELVETICA[ch] ?? 556), 0) * size / 1000;

export const line = (x0: number, y0: number, x1: number, y1: number, w = 0.4) =>
  `${w} w ${x0} ${y0} m ${x1} ${y1} l S`;
export const rect = (x: number, y: number, w: number, h: number, lw = 0.4) => `${lw} w ${x} ${y} ${w} ${h} re S`;
export const fillRect = (x: number, y: number, w: number, h: number) => `${x} ${y} ${w} ${h} re f`;
export const text = (x: number, y: number, size: number, s: string) => `BT /F1 ${size} Tf ${x} ${y} Td (${s}) Tj ET`;
/** Text reading up the sheet, as a run of dimensions down its side is printed. */
export const textUp = (x: number, y: number, size: number, s: string) =>
  `BT /F1 ${size} Tf 0 1 -1 0 ${x} ${y} Tm (${s}) Tj ET`;
/** Text centred on `xc`, baseline at `y`. */
export const centred = (xc: number, y: number, size: number, s: string) => text(xc - textWidth(s, size) / 2, y, size, s);
/** Text reading up the sheet, centred on `yc`, baseline at `x`. */
export const centredUp = (x: number, yc: number, size: number, s: string) =>
  textUp(x, yc - textWidth(s, size) / 2, size, s);

/**
 * A landscape drawing stored as CAD exports store one, and as L1's sheet is
 * saved: turned into a portrait page, with /Rotate turning it back. Shown, it
 * looks exactly like the upright sheet, text included.
 */
export function storedTurned(content: string, turn: 90 | 270, width = 400, height = 300): SyntheticPage {
  const cm = turn === 90 ? `0 1 -1 0 ${height} 0` : `0 -1 1 0 0 ${width}`;
  return { width: height, height: width, rotate: turn, content: `q ${cm} cm\n${content}\nQ` };
}

/** Metres per point of `planSheet`: 9 m bays printed 18 pt apart. */
export const PLAN_SHEET_SCALE = 0.5;

/**
 * A storey plan in miniature, on a 400 × 300 pt sheet at 0.5 m per point
 * (so 200 × 150 m, under the 400 m that asks for 0.07 m per pixel):
 * - a shop and a changing room, 12 × 10 m each, joined by a 0.9 m door;
 * - a void beside them, 9 × 10 m;
 * - an escalator in a 6 × 5 m box, and a plaza the drawing leaves open;
 * - a run of nine 9 m grid dimensions along the top, and another up the side, clear of each other;
 * - a title block that prints a scale, as OTH's sheets do, well away from the drawing.
 */
export function planSheet({ dimensions = true }: { dimensions?: boolean } = {}): string {
  const parts = [
    rect(100, 150, 66, 20),
    line(124, 150, 124, 158.1),
    line(124, 159.9, 124, 170),
    line(148, 150, 148, 170),
    rect(100, 125, 12, 10),
    centred(112, 159, 2, "SHOP"),
    centred(136, 160.4, 2, "CHANGING"),
    centred(136, 158.0, 2, "ROOM"),
    centred(157, 159, 2, "VOID"),
    centred(106, 129.5, 1, "ESCALATOR"),
    centred(170, 110, 2, "PLAZA"),
    text(300, 20, 3, "SCALE 1 : 500"),
  ];
  if (dimensions) {
    for (let i = 0; i < 9; i++) {
      parts.push(centred(80 + 18 * i, 200, 1.5, "9000"));
      parts.push(centredUp(58, 30 + 18 * i, 1.5, "9000"));
    }
  }
  return parts.join("\n");
}
