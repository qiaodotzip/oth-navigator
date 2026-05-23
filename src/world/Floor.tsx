import { useMemo } from "react";
import * as THREE from "three";
import type { Detail, Floor as FloorData, Polygon, Pt } from "@/data/types";

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

const DETAILED_SLAB_COLOR = "#C9B98A";
const DETAILED_SLAB_HEIGHT = 0.12;

function pointInPolygon(px: number, py: number, polygon: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    const intersect =
      yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function detailCenter(d: Detail): Pt {
  if (d.type === "round-table") return d.point;
  if (d.type === "service-centre") {
    const n = d.points.length;
    const sx = d.points.reduce((s, [x]) => s + x, 0) / n;
    const sy = d.points.reduce((s, [, y]) => s + y, 0) / n;
    return [sx, sy];
  }
  const [a, b] = d.rect;
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

function polygonHasAnyDetail(p: Polygon, details: Detail[]): boolean {
  for (const d of details) {
    const [cx, cy] = detailCenter(d);
    if (pointInPolygon(cx, cy, p.points)) return true;
  }
  return false;
}

export function Floor({ data, yOffset = 0 }: { data: FloorData; yOffset?: number }) {
  const items = useMemo(() => {
    const details = data.details ?? [];
    return data.polygons.map(p => {
      const detailed = details.length > 0 && polygonHasAnyDetail(p, details);
      const slabHeight = detailed ? DETAILED_SLAB_HEIGHT : p.heightMeters;
      const shape = polygonToShape(p, data.bounds.depth);
      const geometry = new THREE.ExtrudeGeometry(shape, {
        depth: slabHeight,
        bevelEnabled: false,
      });
      geometry.rotateX(-Math.PI / 2);
      return {
        id: p.id,
        geometry,
        color: detailed ? DETAILED_SLAB_COLOR : COLORS[p.type],
      };
    });
  }, [data]);

  return (
    <group position={[-data.bounds.width / 2, yOffset, data.bounds.depth / 2]}>
      {items.map((m, i) => (
        <mesh key={`${m.id}-${i}`} geometry={m.geometry} castShadow receiveShadow>
          <meshStandardMaterial color={m.color} />
        </mesh>
      ))}
    </group>
  );
}
