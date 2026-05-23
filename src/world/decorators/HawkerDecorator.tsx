import { useMemo } from "react";
import type { Polygon } from "@/data/types";

const STALL_W = 2.4;
const STALL_D = 1.7;
const STALL_BODY_H = 2.2;
const ROOF_H = 0.55;
const STALL_SPACING = STALL_W + 0.2;

const BENCH_TABLE_W = 2.4;
const BENCH_TABLE_D = 0.7;
const BENCH_TABLE_H = 0.75;
const BENCH_SEAT_D = 0.3;
const BENCH_SEAT_H = 0.42;
const BENCH_OFFSET = 0.55;
const BENCH_CLUSTER_DEPTH = BENCH_TABLE_D + 2 * (BENCH_OFFSET - BENCH_TABLE_D / 2 + BENCH_SEAT_D);
const BENCH_SPACING = BENCH_TABLE_W + 0.3;

const ROUND_TABLE_R = 0.55;
const ROUND_TABLE_H = 0.75;
const STOOL_R = 0.18;
const STOOL_H = 0.45;

const STALL_COLORS = [
  "#D9534F",
  "#F2A33C",
  "#F0AD4E",
  "#C9462A",
  "#B8893A",
  "#9C5A2A",
  "#E07A3C",
];
const TABLE_TOP = "#D8B57C";
const BENCH_SEAT_COLOR = "#8C6A47";
const STOOL_COLOR = "#5C3A22";

type Stall = {
  px: number;
  py: number;
  rotY: number;
  color: string;
};

type Bench = {
  px: number;
  py: number;
  rotY: number;
};

type RoundCluster = {
  px: number;
  py: number;
};

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

function planLayout(polygon: Polygon) {
  const b = polygonBounds(polygon.points);
  const width = b.maxX - b.minX;
  const height = b.maxY - b.minY;
  const horizontal = width >= height;
  const longSpan = horizontal ? width : height;
  const shortSpan = horizontal ? height : width;
  const longMin = horizontal ? b.minX : b.minY;
  const shortMin = horizontal ? b.minY : b.minX;

  const stalls: Stall[] = [];
  const benches: Bench[] = [];
  const rounds: RoundCluster[] = [];

  const toPoly = (longPos: number, shortPos: number): [number, number] =>
    horizontal ? [longPos, shortPos] : [shortPos, longPos];

  const inside = (longPos: number, shortPos: number) => {
    const [x, y] = toPoly(longPos, shortPos);
    return pointInPolygon(x, y, polygon.points);
  };

  const pushStall = (longPos: number, shortPos: number, facingNeg: boolean, idx: number) => {
    if (!inside(longPos, shortPos)) return;
    const [px, py] = toPoly(longPos, shortPos);
    let rotY: number;
    if (horizontal) {
      rotY = facingNeg ? Math.PI : 0;
    } else {
      rotY = facingNeg ? -Math.PI / 2 : Math.PI / 2;
    }
    stalls.push({
      px,
      py,
      rotY,
      color: STALL_COLORS[idx % STALL_COLORS.length],
    });
  };

  const pushBench = (longPos: number, shortPos: number) => {
    if (!inside(longPos, shortPos)) return;
    const [px, py] = toPoly(longPos, shortPos);
    benches.push({
      px,
      py,
      rotY: horizontal ? 0 : Math.PI / 2,
    });
  };

  const pushRound = (longPos: number, shortPos: number) => {
    if (!inside(longPos, shortPos)) return;
    const [px, py] = toPoly(longPos, shortPos);
    rounds.push({ px, py });
  };

  const backRowShort = shortMin + STALL_D / 2 + 0.5;
  const nBackStalls = Math.max(1, Math.floor((longSpan - 1) / STALL_SPACING));
  const backLongStart = longMin + (longSpan - nBackStalls * STALL_SPACING) / 2 + STALL_SPACING / 2;
  for (let i = 0; i < nBackStalls; i++) {
    const longPos = backLongStart + i * STALL_SPACING;
    pushStall(longPos, backRowShort, false, i);
  }

  const hasIslands = shortSpan >= 7.5;

  if (hasIslands) {
    const islandStallCount = 3;
    const islandLen = islandStallCount * STALL_W + (islandStallCount - 1) * 0.2;
    const islandDepth = 2 * STALL_D + 0.1;
    const islandGap = 1.8;
    const maxIslands = Math.max(
      1,
      Math.floor((longSpan - 1.5 + islandGap) / (islandLen + islandGap)),
    );
    const nIslands = Math.min(maxIslands, 3);
    const islandsTotal = nIslands * islandLen + (nIslands - 1) * islandGap;
    const islandsStartCenter = longMin + (longSpan - islandsTotal) / 2 + islandLen / 2;
    const islandShortCenter = shortMin + shortSpan * 0.55;

    for (let isl = 0; isl < nIslands; isl++) {
      const islandLongCenter = islandsStartCenter + isl * (islandLen + islandGap);
      for (let i = 0; i < islandStallCount; i++) {
        const longPos = islandLongCenter - islandLen / 2 + i * (STALL_W + 0.2) + STALL_W / 2;
        const northShort = islandShortCenter - STALL_D / 2 - 0.05;
        const southShort = islandShortCenter + STALL_D / 2 + 0.05;
        pushStall(longPos, northShort, true, isl * 7 + i);
        pushStall(longPos, southShort, false, isl * 7 + i + 4);
      }
    }

    const benchBandTopMin = backRowShort + STALL_D / 2 + 0.8;
    const benchBandTopMax = islandShortCenter - islandDepth / 2 - 0.6;
    const benchBandBotMin = islandShortCenter + islandDepth / 2 + 0.6;
    const benchBandBotMax = shortMin + shortSpan - 0.4;

    placeBenchBand(benchBandTopMin, benchBandTopMax, longMin, longSpan, pushBench);
    placeBenchBand(benchBandBotMin, benchBandBotMax, longMin, longSpan, pushBench);

    const roundXPositions = [
      longMin + 0.9,
      longMin + longSpan - 0.9,
    ];
    for (const lx of roundXPositions) {
      pushRound(lx, shortMin + shortSpan - 1.0);
    }
  } else {
    const benchBandMin = backRowShort + STALL_D / 2 + 0.8;
    const benchBandMax = shortMin + shortSpan - 0.6;
    placeBenchBand(benchBandMin, benchBandMax, longMin, longSpan, pushBench);
  }

  return { stalls, benches, rounds };
}

function placeBenchBand(
  shortMin: number,
  shortMax: number,
  longMin: number,
  longSpan: number,
  pushBench: (longPos: number, shortPos: number) => void,
) {
  const span = shortMax - shortMin;
  if (span < BENCH_CLUSTER_DEPTH + 0.2) return;
  const nRows = Math.max(1, Math.floor(span / (BENCH_CLUSTER_DEPTH + 0.4)));
  const rowSpacing = span / nRows;
  const nCols = Math.max(1, Math.floor((longSpan - 1) / BENCH_SPACING));
  const colStart = longMin + (longSpan - nCols * BENCH_SPACING) / 2 + BENCH_SPACING / 2;
  for (let r = 0; r < nRows; r++) {
    const shortPos = shortMin + (r + 0.5) * rowSpacing;
    for (let c = 0; c < nCols; c++) {
      const longPos = colStart + c * BENCH_SPACING;
      pushBench(longPos, shortPos);
    }
  }
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

function BenchMesh({
  position,
  rotY,
}: {
  position: [number, number, number];
  rotY: number;
}) {
  return (
    <group position={position} rotation={[0, rotY, 0]}>
      <mesh position={[0, BENCH_TABLE_H / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[BENCH_TABLE_W, BENCH_TABLE_H, BENCH_TABLE_D]} />
        <meshStandardMaterial color={TABLE_TOP} />
      </mesh>
      {[BENCH_OFFSET, -BENCH_OFFSET].map((dz, i) => (
        <mesh
          key={i}
          position={[0, BENCH_SEAT_H / 2, dz]}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[BENCH_TABLE_W, BENCH_SEAT_H, BENCH_SEAT_D]} />
          <meshStandardMaterial color={BENCH_SEAT_COLOR} />
        </mesh>
      ))}
    </group>
  );
}

function RoundClusterMesh({ position }: { position: [number, number, number] }) {
  const stools = [
    [0.85, 0],
    [-0.85, 0],
    [0, 0.85],
    [0, -0.85],
  ] as const;
  return (
    <group position={position}>
      <mesh position={[0, ROUND_TABLE_H / 2, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[ROUND_TABLE_R, ROUND_TABLE_R, ROUND_TABLE_H, 16]} />
        <meshStandardMaterial color={TABLE_TOP} />
      </mesh>
      {stools.map(([sx, sz], i) => (
        <mesh key={i} position={[sx, STOOL_H / 2, sz]} castShadow receiveShadow>
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
      {layout.benches.map((b, i) => (
        <BenchMesh
          key={`b${i}`}
          position={toLocal(b.px, b.py)}
          rotY={b.rotY}
        />
      ))}
      {layout.rounds.map((r, i) => (
        <RoundClusterMesh key={`r${i}`} position={toLocal(r.px, r.py)} />
      ))}
    </group>
  );
}
