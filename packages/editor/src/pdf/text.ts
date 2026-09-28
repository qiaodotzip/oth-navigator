import type { PdfPage } from "./pdfjs";

/** A box on the sheet as shown (the page's rotation applied), in PDF points, y down. */
export type Box = { x0: number; y0: number; x1: number; y1: number };

/** One run of text as pdf.js gives it, on the sheet as shown. `ux, uy` is its reading direction there. */
export type TextItem = { text: string; box: Box; ux: number; uy: number };

/** One word, about where it is printed: the script's `get_text("words")`. */
export type Word = { text: string; x: number; y: number; box: Box };

type RawItem = { str: string; transform: number[]; width: number; height: number };
type ToShown = (x: number, y: number) => [number, number];

/**
 * Where a pdf.js text item sits on the sheet as shown. Its transform places
 * the baseline's start in PDF space (y up, before the page's turn); the box is
 * the run's width along its direction and the font's height across it.
 */
export function placeItem(item: RawItem, toShown: ToShown): TextItem | null {
  const text = item.str.replace(/\s+/g, " ").trim();
  if (!text) return null;
  const [a = 0, b = 0, c = 0, d = 0, e = 0, f = 0] = item.transform;
  const along = Math.hypot(a, b) || 1;
  const up = Math.hypot(c, d) || 1;
  const [ax, ay, cx, cy] = [a / along, b / along, c / up, d / up];
  const w = item.width;
  const h = item.height;
  const corners = [
    toShown(e, f),
    toShown(e + ax * w, f + ay * w),
    toShown(e + cx * h, f + cy * h),
    toShown(e + ax * w + cx * h, f + ay * w + cy * h),
  ];
  const xs = corners.map(p => p[0]);
  const ys = corners.map(p => p[1]);
  const [s0x, s0y] = toShown(e, f);
  const [s1x, s1y] = toShown(e + ax, f + ay);
  const length = Math.hypot(s1x - s0x, s1y - s0y) || 1;
  return {
    text,
    box: { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) },
    ux: (s1x - s0x) / length,
    uy: (s1y - s0y) / length,
  };
}

/** Every run of text on a page, on the sheet as shown. Empty for a scan. */
export async function readTextItems(page: PdfPage): Promise<TextItem[]> {
  const viewport = page.getViewport({ scale: 1 });
  const toShown: ToShown = (x, y) => viewport.convertToViewportPoint(x, y) as [number, number];
  const content = await page.getTextContent();
  const out: TextItem[] = [];
  for (const item of content.items) {
    if (!("str" in item)) continue;
    const placed = placeItem(item as RawItem, toShown);
    if (placed) out.push(placed);
  }
  return out;
}

/**
 * The words of each item, each placed along the item by its characters. A CAD
 * export usually gives each dimension its own item; when it runs two together,
 * this keeps them apart.
 */
export function wordsOf(items: readonly TextItem[]): Word[] {
  const out: Word[] = [];
  for (const item of items) {
    const { box, text } = item;
    const cx = (box.x0 + box.x1) / 2;
    const cy = (box.y0 + box.y1) / 2;
    const flat = Math.abs(item.ux) >= Math.abs(item.uy);
    const length = flat ? box.x1 - box.x0 : box.y1 - box.y0;
    const sign = Math.sign(flat ? item.ux : item.uy) || 1;
    for (const m of text.matchAll(/\S+/g)) {
      const mid = (m.index! + m[0].length / 2) / text.length;
      const offset = (mid - 0.5) * length * sign;
      const half = (length * m[0].length) / text.length / 2;
      const x = flat ? cx + offset : cx;
      const y = flat ? cy : cy + offset;
      out.push({
        text: m[0], x, y,
        box: flat ? { x0: x - half, y0: box.y0, x1: x + half, y1: box.y1 } : { x0: box.x0, y0: y - half, x1: box.x1, y1: y + half },
      });
    }
  }
  return out;
}
