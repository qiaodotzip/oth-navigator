import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

/**
 * Content-addressed. Two teammates uploading the same export share one file, and
 * a published bundle can reference assets by hash without copying duplicates.
 */
export async function storeAsset(dataDir: string, bytes: Uint8Array, extension = "glb") {
  const checksum = createHash("sha256").update(bytes).digest("hex");
  const storagePath = join("assets", checksum.slice(0, 2), `${checksum}.${extension}`);
  const full = join(dataDir, storagePath);
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
  return new Uint8Array(await readFile(join(dataDir, storagePath)));
}
