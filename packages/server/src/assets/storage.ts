import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, posix, relative, sep } from "node:path";

/**
 * A stored path's segments, split on either separator whatever system this
 * runs on: rows written since say assets/8b/…, the laptop's older rows say
 * assets\8b\….
 *
 * Anything but a plain relative path is refused rather than followed, since
 * a path can arrive from outside this server (an imported export): a "." or
 * ".." segment, an empty one (a leading, doubled or trailing separator), and
 * a colon, which on Windows names a drive or a file's hidden stream.
 */
export function storedPathSegments(storagePath: string): string[] {
  const segments = storagePath.split(/[\\/]/);
  if (segments.some(s => s === "" || s === "." || s === ".." || s.includes(":"))) {
    throw new Error(`not a stored file path: ${JSON.stringify(storagePath)}`);
  }
  return segments;
}

/**
 * Where a stored file lives under a data folder. Stored paths are written
 * with forward slashes, so a database carried between Windows and Linux
 * still finds its files. Rows the laptop wrote before that have
 * backslashes, and those read the same way here. Never a file outside the
 * data folder, whatever the path says.
 */
export function assetFile(dataDir: string, storagePath: string): string {
  const full = join(dataDir, ...storedPathSegments(storagePath));
  // The segments above cannot climb out, and this says so of the result
  // itself, so a rule missed there still cannot reach outside.
  const inside = relative(dataDir, full);
  if (inside === ".." || inside.startsWith(`..${sep}`) || isAbsolute(inside)) {
    throw new Error(`not a stored file path: ${JSON.stringify(storagePath)}`);
  }
  return full;
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
