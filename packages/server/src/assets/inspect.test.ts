import { Document, NodeIO } from "@gltf-transform/core";
import { describe, expect, it } from "vitest";
import { InvalidAssetError, inspectGlb } from "./inspect";

/** Three triangles spanning 2 m x 3 m x 1 m. */
async function boxGlb(): Promise<Uint8Array> {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const position = doc.createAccessor()
    .setArray(new Float32Array([
      0, 0, 0, 2, 0, 0, 2, 3, 0,
      0, 0, 0, 2, 3, 0, 0, 3, 0,
      0, 0, 1, 2, 0, 1, 2, 3, 1,
    ]))
    .setType("VEC3")
    .setBuffer(buffer);
  const prim = doc.createPrimitive().setAttribute("POSITION", position);
  const mesh = doc.createMesh().addPrimitive(prim);
  doc.createScene().addChild(doc.createNode().setMesh(mesh));
  return new NodeIO().writeBinary(doc);
}

describe("inspectGlb", () => {
  it("counts triangles", async () => {
    expect((await inspectGlb(await boxGlb())).triangleCount).toBe(3);
  });

  it("computes the bounding box in metres", async () => {
    const { bbox } = await inspectGlb(await boxGlb());
    expect(bbox.minX).toBeCloseTo(0);
    expect(bbox.maxX).toBeCloseTo(2);
    expect(bbox.maxY).toBeCloseTo(3);
    expect(bbox.maxZ).toBeCloseTo(1);
  });

  it("rejects bytes that are not a glTF at all", async () => {
    await expect(inspectGlb(new Uint8Array([1, 2, 3, 4]))).rejects.toBeInstanceOf(InvalidAssetError);
  });

  it("rejects an empty upload", async () => {
    await expect(inspectGlb(new Uint8Array())).rejects.toBeInstanceOf(InvalidAssetError);
  });
});
