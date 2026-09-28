import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist/legacy/build/pdf.mjs";

export type PdfDocument = PDFDocumentProxy;
export type PdfPage = PDFPageProxy;
type Pdfjs = typeof import("pdfjs-dist/legacy/build/pdf.mjs");

/** The server's own limit (`PDF_MAX_BYTES` in `server/src/images/pdf.ts`). */
export const PDF_MAX_BYTES = 50 * 1024 * 1024;

export class PdfUnreadableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PdfUnreadableError";
  }
}

let loading: Promise<Pdfjs> | null = null;

/**
 * pdf.js, fetched the first time a PDF is opened, so its 1.5 MB stays out of
 * the bundle everyone loads. The legacy build: the modern one needs
 * Uint8Array.toHex, which Node 24 (and so every test) does not have.
 *
 * In a browser it parses in its own worker, so an untrusted file is read off
 * the page's thread. Under Node, in the tests, it parses in place and needs no
 * worker file.
 */
export function loadPdfjs(): Promise<Pdfjs> {
  loading ??= (async () => {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    if (typeof window !== "undefined" && typeof Worker !== "undefined") {
      const { default: workerSrc } = await import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url");
      pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
    }
    return pdfjs;
  })();
  return loading;
}

const SIGNATURE = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-

/** Whether the bytes are a PDF by their header, which readers accept anywhere in the first 1024 bytes. */
export function looksLikePdf(bytes: Uint8Array): boolean {
  const last = Math.min(bytes.length - SIGNATURE.length, 1024 - SIGNATURE.length);
  for (let i = 0; i <= last; i++) {
    if (SIGNATURE.every((b, j) => bytes[i + j] === b)) return true;
  }
  return false;
}

/** A file's bytes. A dropped File in some browsers, and in jsdom, has no arrayBuffer(). */
export function readBytes(blob: Blob): Promise<Uint8Array> {
  if (typeof blob.arrayBuffer === "function") return blob.arrayBuffer().then(b => new Uint8Array(b));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

/**
 * Opens a PDF. pdf.js takes over the buffer it is handed and empties it, so it
 * gets a copy: the caller still has the file to upload. A file it cannot read
 * says so as a PdfUnreadableError, which the screens word differently from a
 * lost connection. There is no `isEvalSupported` to turn off: pdf.js 6
 * evaluates no code at all, and the exact pin keeps it that way.
 */
export async function openPdf(bytes: Uint8Array): Promise<{ doc: PdfDocument; close: () => Promise<void> }> {
  const pdfjs = await loadPdfjs();
  const task = pdfjs.getDocument({ data: bytes.slice(), verbosity: 0 });
  try {
    const doc = await task.promise;
    return { doc, close: () => task.destroy() };
  } catch (err) {
    await task.destroy().catch(() => {});
    const name = (err as { name?: string } | null)?.name;
    throw new PdfUnreadableError(
      name === "PasswordException" ? "it is protected by a password" : "it isn't a PDF this app can read",
    );
  }
}
