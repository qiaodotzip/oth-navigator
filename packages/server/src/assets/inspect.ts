import { NodeIO } from "@gltf-transform/core";

export class InvalidAssetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidAssetError";
  }
}

export type GlbStats = {
  triangleCount: number;
  bbox: { minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number };
};

/**
 * Reads a .glb well enough to enforce the spec's budgets and to know where the
 * asset sits, so a placement's bounding box can be checked against its anchor
 * room. Anything unreadable is the uploader's problem, not a 500.
 */
export async function inspectGlb(bytes: Uint8Array): Promise<GlbStats> {
  if (bytes.byteLength === 0) throw new InvalidAssetError("empty upload");

  let doc;
  try {
    doc = await new NodeIO().readBinary(bytes);
  } catch (err) {
    throw new InvalidAssetError(`not a readable glTF 2.0 binary: ${String(err)}`);
  }

  let triangleCount = 0;
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const position = prim.getAttribute("POSITION");
      if (!position) continue;
      const indices = prim.getIndices();

      triangleCount += Math.floor((indices ? indices.getCount() : position.getCount()) / 3);

      for (let i = 0; i < position.getCount(); i++) {
        const [x = 0, y = 0, z = 0] = position.getElement(i, [0, 0, 0]);
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (z < minZ) minZ = z;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
        if (z > maxZ) maxZ = z;
      }
    }
  }

  if (!Number.isFinite(minX)) {
    throw new InvalidAssetError("no geometry: the file contains no positioned mesh");
  }

  return { triangleCount, bbox: { minX, minY, minZ, maxX, maxY, maxZ } };
}
