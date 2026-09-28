import { Document, Material, WebIO } from "@gltf-transform/core";
import { describe, expect, it, vi } from "vitest";
import { copyModelInto } from "./modelCopy";
import { glbFromJson, triangleGlb } from "./testing";

function exportDoc(): Document {
  const doc = new Document();
  doc.createBuffer();
  return doc;
}

describe("copyModelInto", () => {
  it("copies a model's nodes, mesh, material and texture into the export", async () => {
    const doc = exportDoc();
    const [body] = (await copyModelInto(doc, await triangleGlb()))!.place();
    expect(body!.getName()).toBe("body");
    expect(body!.listChildren().map(n => n.getName())).toEqual(["lid"]);
    expect(doc.getRoot().listMeshes().map(m => m.getName())).toEqual(["bin"]);
    const [material] = doc.getRoot().listMaterials();
    expect(material!.getName()).toBe("bin green");
    expect(material!.getBaseColorFactor()).toEqual([0.1, 0.5, 0.2, 1]);
    expect(material!.getBaseColorTexture()?.getImage()).toEqual(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]));
  });

  it("keeps everything in the export's one buffer, so the file still writes as a .glb", async () => {
    const doc = exportDoc();
    const scene = doc.createScene("s");
    for (const node of (await copyModelInto(doc, await triangleGlb()))!.place()) scene.addChild(node);
    expect(doc.getRoot().listBuffers()).toHaveLength(1);
    const back = await new WebIO().readBinary(await new WebIO().writeBinary(doc));
    expect(back.getRoot().listNodes().map(n => n.getName()).sort()).toEqual(["body", "lid"]);
    expect(back.getRoot().listTextures()).toHaveLength(1);
  });

  it("places one model many times with fresh nodes, sharing its mesh", async () => {
    const doc = exportDoc();
    const model = (await copyModelInto(doc, await triangleGlb()))!;
    const [first] = model.place();
    const [second] = model.place();
    expect(second).not.toBe(first);
    expect(second!.listChildren()[0]).not.toBe(first!.listChildren()[0]);
    expect(second!.getMesh()).toBe(first!.getMesh());
    const firstMaterial = first!.getMesh()!.listPrimitives()[0]!.getMaterial();
    const secondMaterial = second!.getMesh()!.listPrimitives()[0]!.getMaterial();
    expect(secondMaterial).toBe(firstMaterial);
    expect(secondMaterial!.getBaseColorTexture()).toBe(firstMaterial!.getBaseColorTexture());
    expect(doc.getRoot().listMeshes()).toHaveLength(1);
    expect(doc.getRoot().listMaterials()).toHaveLength(1);
    expect(doc.getRoot().listTextures()).toHaveLength(1);
    expect(doc.getRoot().listNodes()).toHaveLength(4);
  });

  it("logs and returns null, without throwing, when the copy step itself breaks", async () => {
    const doc = exportDoc();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const graph = vi.spyOn(doc, "getGraph").mockImplementation(() => {
      throw new Error("boom");
    });
    try {
      expect(await copyModelInto(doc, await triangleGlb())).toBeNull();
      expect(warn).toHaveBeenCalledTimes(1);
      const [message, error] = warn.mock.calls[0]!;
      expect(message).toBe("3D export: couldn't copy a model");
      expect(error).toBeInstanceOf(Error);
    } finally {
      graph.mockRestore();
      warn.mockRestore();
    }
  });

  it("disposes whatever it already copied when a later copy breaks (M8), leaving nothing unused behind", async () => {
    const doc = exportDoc();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const copy = vi.spyOn(Material.prototype, "copy").mockImplementation(() => {
      throw new Error("material copy boom");
    });
    try {
      expect(await copyModelInto(doc, await triangleGlb())).toBeNull();
      expect(doc.getRoot().listNodes()).toEqual([]);
      expect(doc.getRoot().listMeshes()).toEqual([]);
      expect(doc.getRoot().listMaterials()).toEqual([]);
      expect(doc.getRoot().listTextures()).toEqual([]);
      expect(doc.getRoot().listAccessors()).toEqual([]);
    } finally {
      copy.mockRestore();
      warn.mockRestore();
    }
  });

  it("turns away bytes that are not a glTF binary", async () => {
    expect(await copyModelInto(exportDoc(), new Uint8Array([1, 2, 3, 4]))).toBeNull();
  });

  it("turns away a model that needs an extension it can't read, such as Draco, as the upload check does", async () => {
    const draco = glbFromJson({
      asset: { version: "2.0" },
      extensionsUsed: ["KHR_draco_mesh_compression"],
      extensionsRequired: ["KHR_draco_mesh_compression"],
      scenes: [{ nodes: [] }],
      scene: 0,
    });
    expect(await copyModelInto(exportDoc(), draco)).toBeNull();
  });

  it("turns away a file with nothing in its scene", async () => {
    expect(await copyModelInto(exportDoc(), glbFromJson({ asset: { version: "2.0" }, scenes: [{ nodes: [] }], scene: 0 }))).toBeNull();
  });
});
