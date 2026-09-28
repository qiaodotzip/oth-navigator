/** The largest PDF a floor's plan may come from: a CAD sheet with every layer on runs to tens of megabytes. */
export const PDF_MAX_BYTES = 50 * 1024 * 1024;

const SIGNATURE = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-

/**
 * Whether the bytes are a PDF by their header, which readers accept anywhere
 * in the first 1024 bytes. Nothing more is read: the server never parses a
 * PDF (spec §5.1). A pdf.js bug read here would be a server bug.
 */
export function looksLikePdf(bytes: Uint8Array): boolean {
  const last = Math.min(bytes.length - SIGNATURE.length, 1024 - SIGNATURE.length);
  for (let i = 0; i <= last; i++) {
    if (SIGNATURE.every((b, j) => bytes[i + j] === b)) return true;
  }
  return false;
}

/** The longest filename kept, as PlanSourceSchema holds it. */
export const FILENAME_MAX = 255;

/** A sent file's name cut to FILENAME_MAX, never between the two halves of one character. */
export function capFilename(name: string): string {
  return name.slice(0, FILENAME_MAX).replace(/[\uD800-\uDBFF]$/, "");
}

/** A download name that cannot break out of its header. */
export function attachmentName(filename: string): string {
  const safe = filename.replace(/[^\w.\- ]/g, "_").slice(0, 120) || "plan";
  return /\.pdf$/i.test(safe) ? safe : `${safe}.pdf`;
}
