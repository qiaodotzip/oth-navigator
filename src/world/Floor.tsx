import { useMemo } from "react";
import * as THREE from "three";
import type { Floor as FloorData, Polygon } from "@/data/types";
import { getDecorator } from "./decorators";

function polygonToShape(p: Polygon, depth: number): THREE.Shape {
  const shape = new THREE.Shape();
  const [x0, y0] = p.points[0];
  shape.moveTo(x0, depth - y0);
  for (let i = 1; i < p.points.length; i++) {
    shape.lineTo(p.points[i][0], depth - p.points[i][1]);
  }
  shape.closePath();
  return shape;
}

const COLORS: Record<Polygon["type"], string> = {
  room: "#E6DCC4",
  corridor: "#D6CBB0",
  landmark: "#F2A33C",
  void: "#A0A0A0",
};

const DECORATED_SLAB_COLOR = "#C9B98A";
const DECORATED_SLAB_HEIGHT = 0.12;

export function Floor({ data, yOffset = 0 }: { data: FloorData; yOffset?: number }) {
  const items = useMemo(
    () =>
      data.polygons.map(p => {
        const Decorator = getDecorator(p);
        const slabHeight = Decorator ? DECORATED_SLAB_HEIGHT : p.heightMeters;
        const shape = polygonToShape(p, data.bounds.depth);
        const geometry = new THREE.ExtrudeGeometry(shape, {
          depth: slabHeight,
          bevelEnabled: false,
        });
        geometry.rotateX(-Math.PI / 2);
        return {
          id: p.id,
          geometry,
          color: Decorator ? DECORATED_SLAB_COLOR : COLORS[p.type],
          Decorator,
          polygon: p,
        };
      }),
    [data],
  );

  return (
    <group position={[-data.bounds.width / 2, yOffset, data.bounds.depth / 2]}>
      {items.map(m => (
        <group key={m.id}>
          <mesh geometry={m.geometry} castShadow receiveShadow>
            <meshStandardMaterial color={m.color} />
          </mesh>
          {m.Decorator && <m.Decorator polygon={m.polygon} depth={data.bounds.depth} />}
        </group>
      ))}
    </group>
  );
}
