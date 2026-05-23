import { useMemo } from "react";
import type { Polygon } from "@/data/types";

const STALL_W = 2.5;
const STALL_D = 1.7;
const STALL_BODY_H = 2.2;
const ROOF_H = 0.55;
const TABLE_R = 0.55;
const TABLE_H = 0.75;
const STOOL_R = 0.18;
const STOOL_H = 0.45;

const STALL_COLORS = [
  "#D9534F",
  "#F2A33C",
  "#F0AD4E",
  "#E6A56B",
  "#C9462A",
  "#B8893A",
  "#9C5A2A",
];
const TABLE_COLORS = ["#D8B57C", "#C9A06A"];
const STOOL_COLOR = "#5C3A22";

function pointInPolygon(
  px: number,
  py: number,
  polygon: [number, number][],
): boolean {
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

function polygonBounds(points: [number, number][]) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return { minX, maxX, minY, maxY };
}

type Stall = {
  px: number;
  py: number;
  rotY: number;
  color: string;
};

type TableCluster = {
  px: number;
  py: number;
  square: boolean;
  color: string;
};

function planLayout(polygon: Polygon) {
  const bounds = polygonBounds(polygon.points);
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  const laneAlongX = width >= height;

  const stalls: Stall[] = [];
  const tables: TableCluster[] = [];

  const stallSpacing = STALL_W + 0.3;
  const tableSpacingLong = 2.8;
  const tableSpacingShort = 2.2;

  if (laneAlongX) {
    const nStalls = Math.max(1, Math.floor((width - 1) / stallSpacing));
    const startX = bounds.minX + (width - nStalls * stallSpacing) / 2 + stallSpacing / 2;
    const topY = bounds.minY + STALL_D / 2 + 0.6;
    const botY = bounds.maxY - STALL_D / 2 - 0.6;

    for (let i = 0; i < nStalls; i++) {
      const x = startX + i * stallSpacing;
      if (pointInPolygon(x, topY, polygon.points)) {
        stalls.push({
          px: x,
          py: topY,
          rotY: Math.PI,
          color: STALL_COLORS[i % STALL_COLORS.length],
        });
      }
      if (pointInPolygon(x, botY, polygon.points)) {
        stalls.push({
          px: x,
          py: botY,
          rotY: 0,
          color: STALL_COLORS[(i + 3) % STALL_COLORS.length],
        });
      }
    }

    const laneMinY = topY + STALL_D / 2 + 1.1;
    const laneMaxY = botY - STALL_D / 2 - 1.1;
    const laneSpan = laneMaxY - laneMinY;
    if (laneSpan > 1.5) {
      const nX = Math.max(1, Math.floor((width - 2) / tableSpacingLong));
      const nY = Math.max(1, Math.floor(laneSpan / tableSpacingShort));
      const x0 = bounds.minX + 1 + ((width - 2) - (nX - 1) * tableSpacingLong) / 2;
      const y0 = laneMinY + (laneSpan - (nY - 1) * tableSpacingShort) / 2;
      for (let i = 0; i < nX; i++) {
        for (let j = 0; j < nY; j++) {
          const tx = x0 + i * tableSpacingLong;
          const ty = y0 + j * tableSpacingShort;
          if (pointInPolygon(tx, ty, polygon.points)) {
            const idx = i + j * nX;
            tables.push({
              px: tx,
              py: ty,
              square: (idx + i) % 3 === 0,
              color: TABLE_COLORS[idx % TABLE_COLORS.length],
            });
          }
        }
      }
    }
  } else {
    const nStalls = Math.max(1, Math.floor((height - 1) / stallSpacing));
    const startY = bounds.minY + (height - nStalls * stallSpacing) / 2 + stallSpacing / 2;
    const leftX = bounds.minX + STALL_D / 2 + 0.6;
    const rightX = bounds.maxX - STALL_D / 2 - 0.6;
    for (let i = 0; i < nStalls; i++) {
      const y = startY + i * stallSpacing;
      if (pointInPolygon(leftX, y, polygon.points)) {
        stalls.push({
          px: leftX,
          py: y,
          rotY: Math.PI / 2,
          color: STALL_COLORS[i % STALL_COLORS.length],
        });
      }
      if (pointInPolygon(rightX, y, polygon.points)) {
        stalls.push({
          px: rightX,
          py: y,
          rotY: -Math.PI / 2,
          color: STALL_COLORS[(i + 3) % STALL_COLORS.length],
        });
      }
    }
    const laneMinX = leftX + STALL_D / 2 + 1.1;
    const laneMaxX = rightX - STALL_D / 2 - 1.1;
    const laneSpan = laneMaxX - laneMinX;
    if (laneSpan > 1.5) {
      const nX = Math.max(1, Math.floor(laneSpan / tableSpacingShort));
      const nY = Math.max(1, Math.floor((height - 2) / tableSpacingLong));
      const x0 = laneMinX + (laneSpan - (nX - 1) * tableSpacingShort) / 2;
      const y0 = bounds.minY + 1 + ((height - 2) - (nY - 1) * tableSpacingLong) / 2;
      for (let i = 0; i < nX; i++) {
        for (let j = 0; j < nY; j++) {
          const tx = x0 + i * tableSpacingShort;
          const ty = y0 + j * tableSpacingLong;
          if (pointInPolygon(tx, ty, polygon.points)) {
            const idx = i + j * nX;
            tables.push({
              px: tx,
              py: ty,
              square: (idx + j) % 3 === 0,
              color: TABLE_COLORS[idx % TABLE_COLORS.length],
            });
          }
        }
      }
    }
  }

  return { stalls, tables };
}

function StallMesh({
  position,
  rotY,
  color,
}: {
  position: [number, number, number];
  rotY: number;
  color: string;
}) {
  return (
    <group position={position} rotation={[0, rotY, 0]}>
      <mesh position={[0, STALL_BODY_H / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[STALL_W, STALL_BODY_H, STALL_D]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh
        position={[0, STALL_BODY_H + ROOF_H / 2, 0]}
        rotation={[0, 0, Math.PI / 2]}
        castShadow
      >
        <cylinderGeometry args={[ROOF_H, ROOF_H, STALL_W + 0.3, 3]} />
        <meshStandardMaterial color="#4A2F22" flatShading />
      </mesh>
      <mesh position={[0, 0.45, STALL_D / 2 + 0.18]} castShadow receiveShadow>
        <boxGeometry args={[STALL_W - 0.2, 0.9, 0.35]} />
        <meshStandardMaterial color="#2C2C2C" />
      </mesh>
      <mesh position={[0, STALL_BODY_H - 0.35, STALL_D / 2 + 0.05]} castShadow>
        <boxGeometry args={[STALL_W - 0.3, 0.45, 0.06]} />
        <meshStandardMaterial
          color="#F6ECCB"
          emissive="#FFE9A8"
          emissiveIntensity={0.25}
        />
      </mesh>
      <mesh position={[STALL_W * 0.3, STALL_BODY_H - 0.35, STALL_D / 2 + 0.09]}>
        <boxGeometry args={[0.4, 0.15, 0.02]} />
        <meshStandardMaterial color="#C0392B" />
      </mesh>
      <mesh position={[-STALL_W * 0.25, STALL_BODY_H - 0.35, STALL_D / 2 + 0.09]}>
        <boxGeometry args={[0.6, 0.15, 0.02]} />
        <meshStandardMaterial color="#34495E" />
      </mesh>
    </group>
  );
}

function TableClusterMesh({
  position,
  square,
  color,
}: {
  position: [number, number, number];
  square: boolean;
  color: string;
}) {
  const stoolOffset = (square ? 0.7 : 0.85);
  const stools = [
    [stoolOffset, 0],
    [-stoolOffset, 0],
    [0, stoolOffset],
    [0, -stoolOffset],
  ] as const;
  return (
    <group position={position}>
      <mesh position={[0, TABLE_H / 2, 0]} castShadow receiveShadow>
        {square ? (
          <boxGeometry args={[TABLE_R * 2, TABLE_H, TABLE_R * 2]} />
        ) : (
          <cylinderGeometry args={[TABLE_R, TABLE_R, TABLE_H, 16]} />
        )}
        <meshStandardMaterial color={color} />
      </mesh>
      {stools.map(([sx, sz], i) => (
        <mesh
          key={i}
          position={[sx, STOOL_H / 2, sz]}
          castShadow
          receiveShadow
        >
          <cylinderGeometry args={[STOOL_R, STOOL_R, STOOL_H, 8]} />
          <meshStandardMaterial color={STOOL_COLOR} />
        </mesh>
      ))}
    </group>
  );
}

export function HawkerDecorator({
  polygon,
  depth,
}: {
  polygon: Polygon;
  depth: number;
}) {
  const layout = useMemo(() => planLayout(polygon), [polygon]);
  const toLocal = (px: number, py: number): [number, number, number] => [
    px,
    0.15,
    py - depth,
  ];

  return (
    <group>
      {layout.stalls.map((s, i) => (
        <StallMesh
          key={`s${i}`}
          position={toLocal(s.px, s.py)}
          rotY={s.rotY}
          color={s.color}
        />
      ))}
      {layout.tables.map((t, i) => (
        <TableClusterMesh
          key={`t${i}`}
          position={toLocal(t.px, t.py)}
          square={t.square}
          color={t.color}
        />
      ))}
    </group>
  );
}
