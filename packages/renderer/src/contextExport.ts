import { Document, NodeIO } from "@gltf-transform/core";
import { bboxOfRing, ringCentroid, type Level, type Room, type Vec2 } from "@oth/model";
import type * as THREE from "three";
import { modelToThree } from "./coords";
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

/** How far around a detail the surrounding geometry is worth sending. */
export const DETAIL_CONTEXT_MARGIN_M = 10;

export const DETAIL_ORIGIN_NOTE =
  "Origin is this detail's footprint centroid at floor level. Units are metres. " +
  "Y is up, north is -Z. Model inside the block; it is placed back at the same point.";

/**
 * The rooms worth sending as reference around a detail: the wall it stands
 * against, the shopfront it sits outside. Anything further is weight in the
 * file and clutter in the modeller's viewport.
 */
export function detailContextRooms(
  detail: Room,
  rooms: readonly Room[],
  marginM = DETAIL_CONTEXT_MARGIN_M,
): Room[] {
  const b = bboxOfRing(detail.footprint);
  const near = {
    minX: b.minX - marginM, minY: b.minY - marginM,
    maxX: b.maxX + marginM, maxY: b.maxY + marginM,
  };
  return rooms.filter(r => {
    if (r.id === detail.id || r.levelId !== detail.levelId) return false;
    const rb = bboxOfRing(r.footprint);
    // Overlap rather than containment: a long wall is near the detail even
    // though most of its length is far away.
    return rb.minX <= near.maxX && rb.maxX >= near.minX
      && rb.minY <= near.maxY && rb.maxY >= near.minY;
  });
}

/**
 * Exports one detail as a dimensioned block with its surroundings, translated
 * so the detail's own centroid is the origin.
 *
 * Centred rather than left in building coordinates on purpose. A mesh authored
 * at x = 143 m could only ever be used at x = 143 m, and rotating it would spin
 * it about the building origin a hundred metres away. The offset comes back
 * with the bytes and becomes the placement's position, so the mesh returns
 * exactly where it was modelled and is still reusable anywhere else.
 */
export async function buildDetailGlb(
  detail: Room,
  context: readonly Room[],
  level: Level,
  /** What the file says about its origin. A kind of object's export says it in its own words. */
  note: string = DETAIL_ORIGIN_NOTE,
): Promise<{ bytes: Uint8Array; offset: Vec2 }> {
  const offset = ringCentroid(detail.footprint);
  const doc = new Document();
  doc.createBuffer();
  const buffer = doc.getRoot().listBuffers()[0]!;
  const scene = doc.createScene(`${detail.id}-detail`);

  doc.getRoot().getAsset().copyright = note;
  doc.getRoot().setExtras({
    othDetail: { origin: note, level: level.code, detailId: detail.id, offset },
  });

  // One offset moves the whole scene — the block and its surroundings together
  // — so the context still sits where it really is relative to the thing being
  // modelled.
  const translation = modelToThree(-offset[0], -offset[1], 0);

  for (const room of [detail, ...context]) {
    const parts: Array<[string, THREE.BufferGeometry]> = [
      ["floor", roomGeometry(room)],
      ["walls", wallGeometry(room)],
    ];
    for (const [suffix, geometry] of parts) {
      scene.addChild(
        addMesh(doc, buffer, `${room.id}-${suffix}`, geometry).setTranslation(translation),
      );
    }
  }

  return { bytes: await new NodeIO().writeBinary(doc), offset };
}
