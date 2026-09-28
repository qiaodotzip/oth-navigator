import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, posix } from "node:path";

/**
 * Where a stored file lives under a data folder. Stored paths are written
 * with forward slashes, so a database carried between Windows and Linux
 * still finds its files. Rows the laptop wrote before that have
 * backslashes, and those read the same way here.
 */
export function assetFile(dataDir: string, storagePath: string): string {
  return join(dataDir, ...storagePath.split(/[\\/]/));
}

/**
 * Content-addressed. Two teammates uploading the same export share one file, and
 * a published bundle can reference assets by hash without copying duplicates.
 */
export async function storeAsset(dataDir: string, bytes: Uint8Array, extension = "glb") {
  const checksum = createHash("sha256").update(bytes).digest("hex");
  const storagePath = posix.join("assets", checksum.slice(0, 2), `${checksum}.${extension}`);
  const full = assetFile(dataDir, storagePath);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, bytes);
  return { checksum, storagePath };
}

/**
 * Returns a plain Uint8Array rather than a Buffer: Node's Buffer is typed over
 * ArrayBufferLike, which may be a SharedArrayBuffer, and Hono's response body
 * will not accept that.
 */
export async function readAsset(dataDir: string, storagePath: string): Promise<Uint8Array> {
  return new Uint8Array(await readFile(assetFile(dataDir, storagePath)));
}
