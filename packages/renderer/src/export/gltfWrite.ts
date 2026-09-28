import {
  ColorUtils, Document, WebIO,
  type Buffer as GltfBuffer, type Material, type Mesh, type Node as GltfNode, type Scene,
} from "@gltf-transform/core";
import * as THREE from "three";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/** How a part is painted in the file. */
export type Paint = {
  /** The material's name, which Blender lists. Parts with the same paint share one material. */
  name: string;
  /** The preview's colour, as sRGB hex ("#e7ddc7"). */
  colour: string;
  /** Below 1 the material blends, as the preview's see-through parts do. */
  opacity?: number;
  /** Walls, rails, shafts, flights and strips are drawn from both sides in the preview. */
  doubleSided?: boolean;
};

/**
 * Writes three.js geometry into a glTF document with @gltf-transform, so an
 * export is a pure function returning bytes, testable without a browser.
 *
 * WebIO rather than NodeIO: NodeIO's constructor imports `node:fs`, which the
 * editor's browser can't. WebIO only fetches for files that point elsewhere,
 * which a .glb never does, so it reads and writes the same way in Node.
 *
 * Normals are left out. Every piece the preview builds is flat-shaded, and a
 * loader given no normals must compute flat ones (glTF 2.0, "Meshes"), so the
 * file shades the same and is smaller.
 */
export class GlbWriter {
  readonly doc = new Document();
  private readonly buffer: GltfBuffer;
  private readonly materials = new Map<string, Material>();

  constructor() {
    this.buffer = this.doc.createBuffer();
  }

  /**
   * One material per paint. The preview's colours are sRGB and glTF's are
   * linear, so each is converted. Metallic is 0 as in three's standard
   * material: glTF's default of 1 would render every wall dark.
   */
  material(paint: Paint): Material {
    const opacity = paint.opacity ?? 1;
    const doubleSided = paint.doubleSided ?? false;
    const key = `${paint.name}|${paint.colour}|${opacity}|${doubleSided}`;
    const known = this.materials.get(key);
    if (known) return known;
    const [r, g, b] = ColorUtils.hexToFactor<[number, number, number]>(Number.parseInt(paint.colour.slice(1), 16), [0, 0, 0]);
    const material = this.doc.createMaterial(paint.name)
      .setBaseColorFactor([r, g, b, opacity])
      .setAlphaMode(opacity < 1 ? "BLEND" : "OPAQUE")
      .setDoubleSided(doubleSided)
      .setMetallicFactor(0)
      .setRoughnessFactor(1);
    this.materials.set(key, material);
    return material;
  }

  /** The geometry as one painted mesh, or null when it has no triangle: glTF can't hold an empty mesh. */
  geometryMesh(name: string, geometry: THREE.BufferGeometry, paint: Paint): Mesh | null {
    const position = geometry.getAttribute("position");
    if (!position || position.count < 3) return null;
    const indexed = mergedPositions(geometry);
    const primitive = this.doc.createPrimitive()
      .setAttribute("POSITION", this.accessor(`${name} position`, indexed.position, "VEC3"))
      .setIndices(this.accessor(`${name} indices`, indexed.index, "SCALAR"))
      .setMaterial(this.material(paint));
    return this.doc.createMesh(name).addPrimitive(primitive);
  }

  /** A node holding the geometry, named; null when the geometry is empty. */
  mesh(name: string, geometry: THREE.BufferGeometry, paint: Paint): GltfNode | null {
    const mesh = this.geometryMesh(name, geometry, paint);
    return mesh ? this.doc.createNode(name).setMesh(mesh) : null;
  }

  /**
   * What the file says about itself: the note in its generator and copyright,
   * the rest in its extras — set on the document root and repeated on the
   * scene, since Blender's importer reads scene extras as custom properties
   * but never looks at the document root's.
   */
  setNote(scene: Scene, note: string, extras: Record<string, unknown>): void {
    const asset = this.doc.getRoot().getAsset();
    asset.generator = `OTH map editor. ${note}`;
    asset.copyright = note;
    const payload = { othExport: { note, ...extras } };
    this.doc.getRoot().setExtras(payload);
    scene.setExtras(payload);
  }

  write(): Promise<Uint8Array> {
    return new WebIO().writeBinary(this.doc);
  }

  private accessor(name: string, array: Float32Array | Uint32Array, type: "VEC3" | "SCALAR") {
    return this.doc.createAccessor(name).setArray(array).setType(type).setBuffer(this.buffer);
  }
}

/**
 * A geometry's positions, merged to unique vertices and indexed (spec M7), so
 * a loader gets one entry per corner instead of one per triangle and a
 * modeller can select an edge loop. Only position is merged on — this writer
 * never sends normals or UVs, so two triangles that only differ in an
 * attribute we don't write must still merge.
 */
function mergedPositions(geometry: THREE.BufferGeometry): { position: Float32Array; index: Uint32Array } {
  const bare = new THREE.BufferGeometry();
  bare.setAttribute("position", geometry.getAttribute("position").clone());
  const sourceIndex = geometry.getIndex();
  if (sourceIndex) bare.setIndex(sourceIndex.clone());
  const merged = mergeVertices(bare);
  return {
    position: new Float32Array(merged.getAttribute("position").array as ArrayLike<number>),
    index: new Uint32Array(merged.getIndex()!.array as ArrayLike<number>),
  };
}
