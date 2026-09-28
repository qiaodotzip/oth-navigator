/**
 * Saves bytes as a file through the browser's download.
 *
 * Copied into a definite ArrayBuffer first: under TypeScript 5.9 a Uint8Array
 * may be backed by a SharedArrayBuffer as far as the types go, which Blob
 * rejects. The blob URL is let go a moment later rather than at once, so the
 * browser has started saving before it goes.
 */
export function downloadBytes(bytes: Uint8Array, filename: string, type: string): void {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  const url = URL.createObjectURL(new Blob([buffer], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
