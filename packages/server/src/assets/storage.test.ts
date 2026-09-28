import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { assetFile, readAsset, storedPathSegments, storeAsset } from "./storage";

const dir = () => mkdtemp(join(tmpdir(), "oth-assets-"));

describe("storeAsset", () => {
  it("addresses content by checksum", async () => {
    const a = await storeAsset(await dir(), new Uint8Array([1, 2, 3]));
    expect(a.checksum).toMatch(/^[0-9a-f]{64}$/);
    expect(a.storagePath).toContain(a.checksum);
  });

  it("deduplicates identical bytes to the same path", async () => {
    const d = await dir();
    const a = await storeAsset(d, new Uint8Array([1, 2, 3]));
    const b = await storeAsset(d, new Uint8Array([1, 2, 3]));
    expect(b.storagePath).toBe(a.storagePath);
  });

  it("gives different bytes different paths", async () => {
    const d = await dir();
    const a = await storeAsset(d, new Uint8Array([1, 2, 3]));
    const b = await storeAsset(d, new Uint8Array([9, 9, 9]));
    expect(b.storagePath).not.toBe(a.storagePath);
  });

  it("defaults to .glb, as meshes were the original caller", async () => {
    const a = await storeAsset(await dir(), new Uint8Array([1, 2, 3]));
    expect(a.storagePath.endsWith(".glb")).toBe(true);
  });

  it("honours an explicit extension so images are stored honestly", async () => {
    const a = await storeAsset(await dir(), new Uint8Array([1, 2, 3]), "png");
    expect(a.storagePath.endsWith(".png")).toBe(true);
  });

  it("actually writes the bytes", async () => {
    const d = await dir();
    const a = await storeAsset(d, new Uint8Array([7, 7]));
    expect([...(await readFile(join(d, a.storagePath)))]).toEqual([7, 7]);
  });

  it("writes its path with forward slashes, so a database moved to Linux still finds the file", async () => {
    const a = await storeAsset(await dir(), new Uint8Array([1, 2, 3]), "jpg");
    expect(a.storagePath).toMatch(/^assets\/[0-9a-f]{2}\/[0-9a-f]{64}\.jpg$/);
  });

  it("still reads a path a Windows laptop wrote with backslashes", async () => {
    const d = await dir();
    const a = await storeAsset(d, new Uint8Array([4, 5, 6]), "jpg");
    const windows = a.storagePath.split("/").join("\\");
    expect(Array.from(await readAsset(d, windows))).toEqual([4, 5, 6]);
  });
});

// Pure, so each case means the same on Windows and on Linux: a backslash is
// a separator here on both, not only where the operating system says so.
describe("storedPathSegments", () => {
  it("splits a path the same way whichever system wrote it", () => {
    expect(storedPathSegments("assets\\8b\\x.jpg")).toEqual(["assets", "8b", "x.jpg"]);
    expect(storedPathSegments("assets/8b/x.jpg")).toEqual(["assets", "8b", "x.jpg"]);
  });

  it.each([
    "../../etc/passwd",
    "assets/../../x",
    "assets\\..\\..\\x",
    "./assets/x.jpg",
    "C:\\Windows\\win.ini",
    "C:/Windows/win.ini",
    "/etc/passwd",
    "\\\\server\\share\\x.jpg",
    "",
  ])("refuses %j, which is not a plain path under the data folder", path => {
    expect(() => storedPathSegments(path)).toThrow(/not a stored file path/);
  });
});

describe("assetFile", () => {
  const data = join(tmpdir(), "oth-data");

  it("puts a path from either system in the same place", () => {
    expect(assetFile(data, "assets\\8b\\x.jpg")).toBe(join(data, "assets", "8b", "x.jpg"));
    expect(assetFile(data, "assets/8b/x.jpg")).toBe(join(data, "assets", "8b", "x.jpg"));
  });

  it.each(["../../etc/passwd", "assets/../../x", "C:\\Windows\\win.ini"])(
    "never leaves the data folder for %j",
    path => {
      expect(() => assetFile(data, path)).toThrow(/not a stored file path/);
    },
  );

  it("refuses a read outside the data folder before it touches the disk", async () => {
    await expect(readAsset(await dir(), "../../etc/passwd")).rejects.toThrow(/not a stored file path/);
  });
});
