import { describe, expect, it } from "vitest";
import { InvalidImageError, readImageSize } from "./inspect";

/** A minimal but structurally real PNG header: signature + IHDR. */
function png(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13); // IHDR length
  bytes.set([0x49, 0x48, 0x44, 0x52], 12); // "IHDR"
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

/** SOI, a JFIF APP0 segment, then an SOF0 carrying the dimensions. */
function jpeg(width: number, height: number): Uint8Array {
  const bytes: number[] = [0xff, 0xd8];
  bytes.push(0xff, 0xe0, 0x00, 0x04, 0x00, 0x00); // APP0, length 4
  bytes.push(0xff, 0xc0, 0x00, 0x11, 0x08);       // SOF0, length 17, precision 8
  bytes.push((height >> 8) & 0xff, height & 0xff);
  bytes.push((width >> 8) & 0xff, width & 0xff);
  return new Uint8Array(bytes);
}

describe("readImageSize", () => {
  it("reads PNG dimensions", () => {
    expect(readImageSize(png(3000, 2121))).toEqual({ format: "png", widthPx: 3000, heightPx: 2121 });
  });

  it("reads JPEG dimensions", () => {
    expect(readImageSize(jpeg(3000, 2121))).toEqual({ format: "jpeg", widthPx: 3000, heightPx: 2121 });
  });

  it("skips JPEG segments before the frame header", () => {
    // The APP0 above is exactly such a segment; a parser assuming SOF came
    // first would read its bytes as dimensions.
    expect(readImageSize(jpeg(640, 480)).widthPx).toBe(640);
  });

  it("rejects a file that is neither", () => {
    expect(() => readImageSize(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]))).toThrow(InvalidImageError);
  });

  it("rejects an empty upload", () => {
    expect(() => readImageSize(new Uint8Array())).toThrow(InvalidImageError);
  });

  it("rejects a truncated PNG rather than reading past the end", () => {
    expect(() => readImageSize(png(100, 100).slice(0, 20))).toThrow(InvalidImageError);
  });

  it("rejects a JPEG with no frame header", () => {
    expect(() => readImageSize(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]))).toThrow(InvalidImageError);
  });

  it("rejects zero dimensions", () => {
    expect(() => readImageSize(png(0, 100))).toThrow(InvalidImageError);
  });
});
