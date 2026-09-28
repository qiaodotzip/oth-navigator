import { Document, WebIO } from "@gltf-transform/core";
import { describe, expect, it } from "vitest";
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
    expect(doc.getRoot().listMeshes()).toHaveLength(1);
    expect(doc.getRoot().listNodes()).toHaveLength(4);
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
