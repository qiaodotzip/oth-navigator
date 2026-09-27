import { mkdtemp, readdir, rename, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import { storeAsset } from "../assets/storage";
import { readImageSize } from "./inspect";
import { readThumbnail, thumbnailWidth } from "./thumbnail";

vi.mock("node:fs/promises", async importOriginal => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, writeFile: vi.fn(actual.writeFile), rename: vi.fn(actual.rename) };
});

async function jpeg(width: number, height: number): Promise<Uint8Array> {
  const buf = await sharp({ create: { width, height, channels: 3, background: "#7a7a7a" } })
    .jpeg()
    .toBuffer();
  return new Uint8Array(buf);
}

describe("thumbnailWidth", () => {
  it("rounds a requested width up to one of the few sizes kept", () => {
    // A handful of sizes, so the cache cannot grow one file per pixel width.
    expect(thumbnailWidth(200, 3840)).toBe(240);
    expect(thumbnailWidth(240, 3840)).toBe(240);
    expect(thumbnailWidth(300, 3840)).toBe(320);
    expect(thumbnailWidth(1000, 3840)).toBe(1600);
  });

  it("serves the original when it is no wider than what was asked for", () => {
    expect(thumbnailWidth(1600, 1280)).toBeNull();
    expect(thumbnailWidth(240, 200)).toBeNull();
  });

  it("serves the original for a width beyond the largest size kept", () => {
    expect(thumbnailWidth(3000, 3840)).toBeNull();
  });

  it("serves the original for a width that is not a number", () => {
    expect(thumbnailWidth(Number.NaN, 3840)).toBeNull();
    expect(thumbnailWidth(0, 3840)).toBeNull();
  });
});

describe("readThumbnail", () => {
  it("shrinks a frame to the width asked for, keeping its shape", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "oth-thumb-"));
    const stored = await storeAsset(dataDir, await jpeg(1920, 1080), "jpg");
    const bytes = await readThumbnail(dataDir, stored, 240);
    const size = readImageSize(bytes);
    expect(size.format).toBe("jpeg");
    expect(size.widthPx).toBe(240);
    expect(size.heightPx).toBe(135);
  });

  it("makes each size once, then serves it from disk", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "oth-thumb-"));
    const stored = await storeAsset(dataDir, await jpeg(1920, 1080), "jpg");
    const first = await readThumbnail(dataDir, stored, 240);
    const second = await readThumbnail(dataDir, stored, 240);
    expect(second).toEqual(first);
    expect(await readdir(join(dataDir, "thumbs"))).toHaveLength(1);
  });

  // M2: a reader must never see a truncated file, and a process killed
  // mid-write must not leave a permanently broken thumbnail behind.
  it("writes through a temp file, leaving no .tmp behind on success", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "oth-thumb-"));
    const stored = await storeAsset(dataDir, await jpeg(1920, 1080), "jpg");
    await readThumbnail(dataDir, stored, 240);
    const names = await readdir(join(dataDir, "thumbs"));
    expect(names).toHaveLength(1);
    expect(names[0]).not.toMatch(/\.tmp$/);
    expect(vi.mocked(writeFile).mock.calls.some(([p]) => String(p).endsWith(".tmp"))).toBe(true);
  });

  it("cleans up its temp file when the write fails", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "oth-thumb-"));
    const stored = await storeAsset(dataDir, await jpeg(1920, 1080), "jpg");
    vi.mocked(writeFile).mockRejectedValueOnce(new Error("disk full"));
    await expect(readThumbnail(dataDir, stored, 240)).rejects.toThrow("disk full");
    const names = await readdir(join(dataDir, "thumbs")).catch(() => []);
    expect(names).toHaveLength(0);
  });

  it("cleans up its temp file when the rename into place fails", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "oth-thumb-"));
    const stored = await storeAsset(dataDir, await jpeg(1920, 1080), "jpg");
    vi.mocked(writeFile).mockClear();
    vi.mocked(rename).mockRejectedValueOnce(new Error("EPERM"));
    await expect(readThumbnail(dataDir, stored, 240)).rejects.toThrow("EPERM");
    // The temp file was written this time, so there was something to clean up.
    expect(vi.mocked(writeFile).mock.calls.some(([p]) => String(p).endsWith(".tmp"))).toBe(true);
    expect(await readdir(join(dataDir, "thumbs"))).toEqual([]);
  });
});
