import { Document, NodeIO } from "@gltf-transform/core";
import type { Level, Room } from "@oth/model";
import type * as THREE from "three";
import { roomGeometry } from "./geometry";
import { wallGeometry } from "./walls";

/**
 * Documented so a modeller never has to guess where the origin is.
 * Restated in the editor's export dialog and in the exported file's generator.
 */
export const CONTEXT_ORIGIN_NOTE =
  "Origin is the building origin at floor level. Units are metres. Y is up, north is -Z.";

function addMesh(
  doc: Document,
  buffer: ReturnType<Document["createBuffer"]>,
  name: string,
  geometry: THREE.BufferGeometry,
) {
  const position = geometry.getAttribute("position");
  const accessor = doc.createAccessor(`${name}-position`)
    .setArray(new Float32Array(position.array as ArrayLike<number>))
    .setType("VEC3")
    .setBuffer(buffer);

  const prim = doc.createPrimitive().setAttribute("POSITION", accessor);

  const index = geometry.getIndex();
  if (index) {
    const indices = doc.createAccessor(`${name}-indices`)
      .setArray(new Uint32Array(index.array as ArrayLike<number>))
      .setType("SCALAR")
      .setBuffer(buffer);
    prim.setIndices(indices);
  }

  const mesh = doc.createMesh(name).addPrimitive(prim);
  return doc.createNode(name).setMesh(mesh);
}

/**
 * Exports a selection of rooms as locked reference geometry for Blender or Rhino.
 *
 * Built with @gltf-transform rather than three.js GLTFExporter so it is a pure
 * function returning bytes: no WebGL context, no browser, and therefore testable.
 *
 * Deliberately one-way. Nothing in the editor turns a .glb back into a
 * footprint — the structural layer is authored in plan view and only there.
 */
export async function buildContextGlb(rooms: Room[], level: Level): Promise<Uint8Array> {
  const doc = new Document();
  doc.createBuffer();
  const buffer = doc.getRoot().listBuffers()[0]!;
  const scene = doc.createScene(`${level.code}-context`);

  // `generator` is overwritten by the writer, so the convention goes in
  // `copyright` and in root extras — both survive a round trip, which matters
  // because a modeller opening this file months later must not have to guess.
  doc.getRoot().getAsset().copyright = CONTEXT_ORIGIN_NOTE;
  doc.getRoot().setExtras({ othContext: { origin: CONTEXT_ORIGIN_NOTE, level: level.code } });

  for (const room of rooms) {
    scene.addChild(addMesh(doc, buffer, `${room.id}-floor`, roomGeometry(room)));
    scene.addChild(addMesh(doc, buffer, `${room.id}-walls`, wallGeometry(room)));
  }

  return new NodeIO().writeBinary(doc);
}
