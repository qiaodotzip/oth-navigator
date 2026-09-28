import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist/legacy/build/pdf.mjs";

export type PdfDocument = PDFDocumentProxy;
export type PdfPage = PDFPageProxy;
type Pdfjs = typeof import("pdfjs-dist/legacy/build/pdf.mjs");

/** The server's own limit (`PDF_MAX_BYTES` in `server/src/images/pdf.ts`). */
export const PDF_MAX_BYTES = 50 * 1024 * 1024;

/**
 * The largest image, in pixels, that pdf.js will decode from a sheet. An A0
 * scan at 300 dpi (140 Mpx) still draws. A file that declares an image many
 * times that would take gigabytes to decode, and the tab with it, so pdf.js
 * leaves that image out instead.
 */
const MAX_IMAGE_PIXELS = 150_000_000;

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
 *
 * A fetch that fails is forgotten, so the next PDF tries again rather than
 * failing until the page is reloaded.
 */
export function loadPdfjs(): Promise<Pdfjs> {
  loading ??= (async () => {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    if (typeof window !== "undefined" && typeof Worker !== "undefined") {
      const { default: workerSrc } = await import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url");
      pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
    }
    return pdfjs;
  })().catch((err: unknown) => {
    loading = null;
    throw err;
  });
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
 * What pdf.js's failure says about the file, when it is the file's fault: a
 * PdfUnreadableError, or null for anything else. A worker that failed to load,
 * or a read cut short, is left as it was, so it is not blamed on the file.
 * From the worker, pdf.js sends any error it has no name for as
 * UnknownErrorException, a FormatError included.
 */
export function asUnreadable(err: unknown): PdfUnreadableError | null {
  const name = (err as { name?: unknown } | null)?.name;
  if (name === "PasswordException") return new PdfUnreadableError("it is protected by a password");
  if (name === "InvalidPDFException" || name === "FormatError" || name === "UnknownErrorException") {
    return new PdfUnreadableError("it isn't a PDF this app can read");
  }
  return null;
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
  const task = pdfjs.getDocument({ data: bytes.slice(), verbosity: 0, maxImageSize: MAX_IMAGE_PIXELS });
  try {
    const doc = await task.promise;
    return { doc, close: () => task.destroy() };
  } catch (err) {
    await task.destroy().catch(() => {});
    throw asUnreadable(err) ?? err;
  }
}
