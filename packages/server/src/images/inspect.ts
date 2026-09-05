export class InvalidImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidImageError";
  }
}

/** Comfortably fits a 300 DPI storey plan. */
export const IMAGE_MAX_BYTES = 20 * 1024 * 1024;

export type ImageInfo = { format: "png" | "jpeg"; widthPx: number; heightPx: number };

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Start-of-frame markers. Every other 0xFFxx segment carries a length we skip. */
const SOF_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7,
  0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);

function isPng(bytes: Uint8Array): boolean {
  return PNG_SIGNATURE.every((b, i) => bytes[i] === b);
}

function readPng(bytes: Uint8Array): ImageInfo {
  // signature(8) + length(4) + "IHDR"(4) + width(4) + height(4)
  if (bytes.byteLength < 24) throw new InvalidImageError("truncated PNG header");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { format: "png", widthPx: view.getUint32(16), heightPx: view.getUint32(20) };
}

function readJpeg(bytes: Uint8Array): ImageInfo {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 2; // past SOI

  while (offset + 1 < bytes.byteLength) {
    if (bytes[offset] !== 0xff) {
      offset++;
      continue;
    }
    const marker = bytes[offset + 1]!;
    // Padding and standalone markers carry no length.
    if (marker === 0xff || marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    if (marker === 0xd9) break; // end of image
    if (offset + 3 >= bytes.byteLength) break;

    const length = view.getUint16(offset + 2);
    if (SOF_MARKERS.has(marker)) {
      if (offset + 9 > bytes.byteLength) throw new InvalidImageError("truncated JPEG frame header");
      return {
        format: "jpeg",
        heightPx: view.getUint16(offset + 5),
        widthPx: view.getUint16(offset + 7),
      };
    }
    if (length < 2) throw new InvalidImageError("malformed JPEG segment length");
    offset += 2 + length;
  }

  throw new InvalidImageError("no JPEG frame header found");
}

/**
 * Confirms the bytes really are a PNG or JPEG and reads their dimensions by
 * parsing the header directly. Forty lines against a dependency, and it doubles
 * as the upload's validation gate the way `inspectGlb` does for meshes.
 */
export function readImageSize(bytes: Uint8Array): ImageInfo {
  if (bytes.byteLength === 0) throw new InvalidImageError("empty upload");

  const info = isPng(bytes)
    ? readPng(bytes)
    : bytes[0] === 0xff && bytes[1] === 0xd8
      ? readJpeg(bytes)
      : null;

  if (!info) throw new InvalidImageError("not a PNG or JPEG file");
  if (info.widthPx <= 0 || info.heightPx <= 0) {
    throw new InvalidImageError("image reports zero width or height");
  }
  return info;
}
