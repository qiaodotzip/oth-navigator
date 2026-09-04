import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { storeAsset } from "./storage";

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

  it("actually writes the bytes", async () => {
    const d = await dir();
    const a = await storeAsset(d, new Uint8Array([7, 7]));
    expect([...(await readFile(join(d, a.storagePath)))]).toEqual([7, 7]);
  });
});
