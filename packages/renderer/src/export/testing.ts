import { ColorUtils, WebIO, getBounds, type Document, type Material, type Node as GltfNode } from "@gltf-transform/core";
import { parseModel, type MapModel } from "@oth/model";
import type { AssetBytes } from "./floorGlb";

/*
 * Test-only: the fixture every export test builds from, and ways to read a
 * written .glb back. Nothing outside the tests imports this.
 */

export const DELETED = "2026-09-28T00:00:00.000Z";

export const sq = (x0: number, y0: number, x1: number, y1: number): Array<[number, number]> =>
  [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];

const level = (n: number, elevationM: number, heightM: number) => ({
  id: `oth-L${n}`, buildingId: "oth", code: `L${n}`, ordinal: n, nameEn: `Level ${n}`, nameZh: `${n}楼`, elevationM, heightM,
});

/**
 * Two floors and a deleted third.
 * - L1:
 *   - a hall along the south;
 *   - Starbucks (bound to a retail place) and an unnamed café side by side on its north edge;
 *   - a pathway into Starbucks, and an unnamed one in the hall;
 *   - an atrium in the hall, and a bench;
 *   - a lift, and an escalator up to L2.
 * - L2: one shop, and the lift's top stop.
 */
export const floorModel: MapModel = parseModel({
  building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
  levels: [level(1, 0, 6), level(2, 6, 5), { ...level(9, 30, 5), deletedAt: DELETED }],
  rooms: [
    { id: "L1-hall", levelId: "oth-L1", kind: "area", footprint: sq(0, -10, 20, 0), heightM: 6, walkable: true, nameEn: "Hall" },
    { id: "L1-shop", levelId: "oth-L1", kind: "room", footprint: sq(0, 0, 6, 4), heightM: 3.5, nameEn: "Starbucks" },
    { id: "L1-cafe", levelId: "oth-L1", kind: "room", footprint: sq(6, 0, 12, 4), heightM: 4 },
    { id: "L1-atrium", levelId: "oth-L1", kind: "void", footprint: sq(14, -8, 18, -4), heightM: 6, nameEn: "Atrium" },
    { id: "L1-bench", levelId: "oth-L1", kind: "detail", footprint: sq(1, -9, 3, -8), heightM: 0.9, nameEn: "Bench" },
    { id: "L1-gone", levelId: "oth-L1", kind: "room", footprint: sq(0, 10, 4, 14), heightM: 3, nameEn: "Gone", deletedAt: DELETED },
    { id: "L2-shop", levelId: "oth-L2", kind: "room", footprint: sq(0, 0, 6, 4), heightM: 3, nameEn: "Upstairs" },
  ],
  places: [{ id: "pl-sbux", nameEn: "Starbucks", category: "retail", roomId: "L1-shop" }],
  pathwayKinds: [{ id: "pk-concourse", nameEn: "Concourse", colorHex: "#f97316" }],
  pathways: [
    { id: "L1-in", levelId: "oth-L1", polyline: [[2, -5], [2, 2]], widthM: 2, nameEn: "Way in", kindId: "pk-concourse" },
    { id: "L1-east", levelId: "oth-L1", polyline: [[10, -7], [13, -7]], widthM: 1.5 },
    { id: "L1-old", levelId: "oth-L1", polyline: [[9, -5], [9, 2]], widthM: 2, deletedAt: DELETED },
  ],
  portals: [
    { id: "lift-a", kind: "lift", nameEn: "Lift A" },
    { id: "esc-1", kind: "escalator", nameEn: "Escalator 1" },
  ],
  portalEndpoints: [
    { id: "lift-a-1", portalId: "lift-a", levelId: "oth-L1", roomId: "L1-hall", point: [30, 5], footprint: sq(29, 4, 31, 6) },
    { id: "lift-a-2", portalId: "lift-a", levelId: "oth-L2", roomId: "L2-shop", point: [30, 5] },
    { id: "esc-1-1", portalId: "esc-1", levelId: "oth-L1", roomId: "L1-hall", point: [22, -8], footprint: sq(21, -9, 23, -1) },
    { id: "esc-1-2", portalId: "esc-1", levelId: "oth-L2", roomId: "L2-shop", point: [22, -2] },
  ],
});

/** For an export with no placed models to fetch. */
export const noModels: AssetBytes = async () => null;

export const readGlb = (bytes: Uint8Array): Promise<Document> => new WebIO().readBinary(bytes);

/** The file's floor nodes, in order. */
export function floorNodes(doc: Document): GltfNode[] {
  return doc.getRoot().getDefaultScene()?.listChildren() ?? [];
}

/** One floor's group ("Floors", "Walls", …). */
export function group(doc: Document, floorCode: string, name: string): GltfNode {
  const floor = floorNodes(doc).find(n => n.getName() === floorCode);
  const found = floor?.listChildren().find(n => n.getName() === name);
  if (!found) throw new Error(`No ${name} under ${floorCode}`);
  return found;
}

export const names = (node: GltfNode): string[] => node.listChildren().map(n => n.getName());

export function child(node: GltfNode, name: string): GltfNode {
  const found = node.listChildren().find(n => n.getName() === name);
  if (!found) throw new Error(`No ${name} under ${node.getName()}: ${names(node).join(", ")}`);
  return found;
}

/** World-space bounds of a node and everything under it: metres, Y up, north -Z. */
export function bounds(node: GltfNode) {
  const { min, max } = getBounds(node);
  return { minX: min[0], minY: min[1], minZ: min[2], maxX: max[0], maxY: max[1], maxZ: max[2] };
}

/** Every vertex of a node's own mesh, in world space. */
export function worldVertices(node: GltfNode): Array<[number, number, number]> {
  const m = node.getWorldMatrix();
  const out: Array<[number, number, number]> = [];
  for (const primitive of node.getMesh()?.listPrimitives() ?? []) {
    const position = primitive.getAttribute("POSITION");
    if (!position) continue;
    for (let i = 0; i < position.getCount(); i++) {
      const [x = 0, y = 0, z = 0] = position.getElement(i, [0, 0, 0]);
      out.push([
        m[0] * x + m[4] * y + m[8] * z + m[12],
        m[1] * x + m[5] * y + m[9] * z + m[13],
        m[2] * x + m[6] * y + m[10] * z + m[14],
      ]);
    }
  }
  return out;
}

export function materialOf(node: GltfNode): Material {
  const material = node.getMesh()?.listPrimitives()[0]?.getMaterial();
  if (!material) throw new Error(`${node.getName()} has no material`);
  return material;
}

/** A preview colour as the file stores it: linear, from sRGB hex. */
export function linear(hex: string): [number, number, number] {
  return ColorUtils.hexToFactor<[number, number, number]>(Number.parseInt(hex.slice(1), 16), [0, 0, 0]);
}
