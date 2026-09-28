import { WebIO } from "@gltf-transform/core";
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { blocksGeometry } from "../blocks";
import { GlbWriter } from "./gltfWrite";
import { linear } from "./testing";

describe("GlbWriter", () => {
  it("writes nothing for an empty geometry, which glTF can't hold", () => {
    expect(new GlbWriter().mesh("nothing", blocksGeometry([]), { name: "wall", colour: "#cdc0a3" })).toBeNull();
  });

  it("gives parts with one paint one material, in glTF's linear colour and not metallic", () => {
    const writer = new GlbWriter();
    const wall = writer.material({ name: "wall", colour: "#cdc0a3", doubleSided: true });
    expect(writer.material({ name: "wall", colour: "#cdc0a3", doubleSided: true })).toBe(wall);
    const [r, g, b, alpha] = wall.getBaseColorFactor();
    const want = linear("#cdc0a3");
    expect(r).toBeCloseTo(want[0], 6);
    expect(g).toBeCloseTo(want[1], 6);
    expect(b).toBeCloseTo(want[2], 6);
    expect(alpha).toBe(1);
    expect(wall.getAlphaMode()).toBe("OPAQUE");
    expect(wall.getMetallicFactor()).toBe(0);
    expect(wall.getDoubleSided()).toBe(true);
  });

  it("blends a see-through paint", () => {
    const glass = new GlbWriter().material({ name: "balustrade", colour: "#9fb3c8", opacity: 0.6 });
    expect(glass.getAlphaMode()).toBe("BLEND");
    expect(glass.getAlpha()).toBeCloseTo(0.6);
  });

  it("keeps an indexed geometry's indices, and writes a readable .glb", async () => {
    const writer = new GlbWriter();
    writer.doc.createScene("s").addChild(writer.mesh("box", new THREE.BoxGeometry(1, 2, 3), { name: "box", colour: "#ffffff" })!);
    const back = await new WebIO().readBinary(await writer.write());
    const primitive = back.getRoot().listMeshes()[0]!.listPrimitives()[0]!;
    expect(primitive.getIndices()?.getCount()).toBe(36);
    expect(primitive.getAttribute("POSITION")?.getMax([0, 0, 0])).toEqual([0.5, 1, 1.5]);
  });

  it("says in the file what made it and where its origin is", async () => {
    const writer = new GlbWriter();
    writer.setNote("Origin here.", { floors: ["L1"] });
    const { json } = await new WebIO().binaryToJSON(await writer.write());
    expect(json.asset.generator).toBe("OTH map editor. Origin here.");
    expect(json.asset.copyright).toBe("Origin here.");
    expect(json.extras).toEqual({ othExport: { note: "Origin here.", floors: ["L1"] } });
  });
});
