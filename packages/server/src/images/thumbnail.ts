import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import sharp from "sharp";
import { readAsset } from "../assets/storage";

/**
 * The only widths ever made: filmstrip, review card, and the frame you label.
 *
 * A fixed few, so a request for 241 px cannot mint a new file, and the cache
 * stays at most three small files per frame.
 */
const WIDTHS = [240, 320, 1600] as const;

/**
 * Which kept size serves a request for `requested` pixels, or null to serve
 * the original — when it is already no wider, or the ask is beyond every size.
 */
export function thumbnailWidth(requested: number, originalWidth: number): number | null {
  if (!Number.isFinite(requested) || requested <= 0) return null;
  const width = WIDTHS.find(w => w >= requested);
  if (width === undefined || width >= originalWidth) return null;
  return width;
}

/**
 * A frame at a smaller width, made on first request and kept beside the assets.
 *
 * 4K walkthrough frames are about 0.7 MB each; a filmstrip of 445 of them was
 * a third of a gigabyte for a strip of 56-pixel thumbnails. Keyed on the
 * checksum, so a replaced frame can never be served a stale thumbnail.
 */
export async function readThumbnail(
  dataDir: string,
  stored: { storagePath: string; checksum: string },
  width: number,
): Promise<Uint8Array> {
  const path = join(dataDir, "thumbs", `${stored.checksum}-w${width}.jpg`);
  try {
    return new Uint8Array(await readFile(path));
  } catch {
    // Not made yet.
  }
  const original = await readAsset(dataDir, stored.storagePath);
  const bytes = new Uint8Array(
    await sharp(original).resize({ width, withoutEnlargement: true }).jpeg({ quality: 78 }).toBuffer(),
  );
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes);
  return bytes;
}
