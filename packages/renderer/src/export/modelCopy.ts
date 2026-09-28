import { Node as GltfNode, PropertyType, WebIO, type Document, type Property } from "@gltf-transform/core";

type PropertyClass<T extends Property> = new (graph: ReturnType<Document["getGraph"]>) => T;

/**
 * A fresh copy of a node tree that shares its meshes, materials and cameras.
 * `Node.clone()` can't do this: gltf-transform refuses to copy a node without
 * a resolver, because its children would end up with two parents.
 */
function cloneTree(doc: Document, node: GltfNode): GltfNode {
  const resolve = <T extends Property>(property: T): T =>
    property instanceof GltfNode ? (cloneTree(doc, property) as unknown as T) : property;
  return doc.createNode().copy(node, resolve);
}

/**
 * An uploaded model, copied into the export once. Each `place()` hands out
 * its node trees for one more object: the copies themselves the first time,
 * then fresh trees sharing the same meshes, so ten wastebins cost one model.
 */
export class ModelTemplate {
  private placed = 0;

  constructor(private readonly doc: Document, private readonly roots: readonly GltfNode[]) {}

  place(): GltfNode[] {
    this.placed += 1;
    return this.placed === 1 ? [...this.roots] : this.roots.map(root => cloneTree(this.doc, root));
  }
}

/**
 * Reads an uploaded .glb and copies its scene into `target`: its nodes, and
 * the meshes, materials, textures and accessors they use, all into the
 * target's one buffer, since a .glb may hold only one.
 *
 * It reads with no extensions registered, as the server's upload check does
 * (server/src/assets/inspect.ts). So a model needing one, such as Draco, was
 * never accepted, and is turned away here the same way. Optional extensions
 * are dropped. Null for anything it can't read or that has nothing in its scene.
 */
export async function copyModelInto(target: Document, bytes: Uint8Array): Promise<ModelTemplate | null> {
  let source: Document;
  try {
    source = await new WebIO().readBinary(bytes);
  } catch {
    return null;
  }
  const scene = source.getRoot().getDefaultScene() ?? source.getRoot().listScenes()[0];
  const nodes = scene?.listChildren() ?? [];
  if (nodes.length === 0) return null;

  const buffer = target.getRoot().listBuffers()[0] ?? target.createBuffer();
  const copies = new Map<Property, Property>();
  const resolve = <T extends Property>(property: T): T => {
    if (property.propertyType === PropertyType.BUFFER) return buffer as unknown as T;
    const known = copies.get(property);
    if (known) return known as T;
    const copy = new (property.constructor as PropertyClass<T>)(target.getGraph());
    copies.set(property, copy);
    copy.copy(property, resolve);
    return copy;
  };
  try {
    return new ModelTemplate(target, nodes.map(node => resolve(node)));
  } catch {
    return null;
  }
}
