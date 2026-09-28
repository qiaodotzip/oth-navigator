import { Document, WebIO } from "@gltf-transform/core";
import { bboxOfRing, ringCentroid, type Level, type Room, type Vec2 } from "@oth/model";
import type * as THREE from "three";
import { modelToThree } from "./coords";
import { roomGeometry } from "./geometry";
import { wallGeometry } from "./walls";

/**
 * Documented so a modeller never has to guess where the origin is. The
 * whole-floor export (export/floorGlb.ts) writes it into its file's generator
 * and copyright, and the editor repeats it after the download.
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

  return { bytes: await new WebIO().writeBinary(doc), offset };
}
