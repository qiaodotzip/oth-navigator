import { useMemo } from "react";
import type { Detail, Facing, Floor as FloorData, Pt } from "@/data/types";
import {
  BenchMesh,
  BENCH_CLUSTER_DEPTH,
  BENCH_SPACING,
  RoundClusterMesh,
  StallMesh,
  STALL_COLORS,
  STALL_D,
  STALL_SPACING,
} from "./details/primitives";

const SLAB_Y = 0.15;

type StallItem = { pos: [number, number]; rotY: number; color: string };
type BenchItem = { pos: [number, number]; rotY: number };
type RoundItem = { pos: [number, number] };

function rectBounds(rect: [Pt, Pt]) {
  const minX = Math.min(rect[0][0], rect[1][0]);
  const maxX = Math.max(rect[0][0], rect[1][0]);
  const minY = Math.min(rect[0][1], rect[1][1]);
  const maxY = Math.max(rect[0][1], rect[1][1]);
  return { minX, maxX, minY, maxY, w: maxX - minX, h: maxY - minY };
}

function facingToRotY(facing: Facing): number {
  switch (facing) {
    case "S":
      return 0;
    case "N":
      return Math.PI;
    case "E":
      return -Math.PI / 2;
    case "W":
      return Math.PI / 2;
  }
}

function planStallRow(detail: Extract<Detail, { type: "stall-row" }>): StallItem[] {
  const b = rectBounds(detail.rect);
  const horizontal = b.w >= b.h;
  // Row runs along the LONG axis. Stalls placed every STALL_SPACING.
  const longSpan = horizontal ? b.w : b.h;
  const longMin = horizontal ? b.minX : b.minY;
  const shortCenter = horizontal ? (b.minY + b.maxY) / 2 : (b.minX + b.maxX) / 2;
  const n = Math.max(1, Math.floor((longSpan - 0.2) / STALL_SPACING));
  const start = longMin + (longSpan - n * STALL_SPACING) / 2 + STALL_SPACING / 2;
  const rotY = facingToRotY(detail.facing);
  const items: StallItem[] = [];
  for (let i = 0; i < n; i++) {
    const longPos = start + i * STALL_SPACING;
    const pos: [number, number] = horizontal
      ? [longPos, shortCenter]
      : [shortCenter, longPos];
    items.push({
      pos,
      rotY,
      color: STALL_COLORS[i % STALL_COLORS.length],
    });
  }
  return items;
}

function planStallIsland(detail: Extract<Detail, { type: "stall-island" }>): StallItem[] {
  const b = rectBounds(detail.rect);
  const horizontal = b.w >= b.h;
  const longSpan = horizontal ? b.w : b.h;
  const longMin = horizontal ? b.minX : b.minY;
  const shortCenter = horizontal ? (b.minY + b.maxY) / 2 : (b.minX + b.maxX) / 2;
  const n = Math.max(1, Math.floor((longSpan - 0.2) / STALL_SPACING));
  const start = longMin + (longSpan - n * STALL_SPACING) / 2 + STALL_SPACING / 2;
  const items: StallItem[] = [];
  // North row (smaller short) faces -short → "N" for horizontal, "W" for vertical
  // South row faces +short → "S" for horizontal, "E" for vertical
  const northFacing: Facing = horizontal ? "N" : "W";
  const southFacing: Facing = horizontal ? "S" : "E";
  const northShort = shortCenter - STALL_D / 2 - 0.05;
  const southShort = shortCenter + STALL_D / 2 + 0.05;
  for (let i = 0; i < n; i++) {
    const longPos = start + i * STALL_SPACING;
    const northPos: [number, number] = horizontal
      ? [longPos, northShort]
      : [northShort, longPos];
    const southPos: [number, number] = horizontal
      ? [longPos, southShort]
      : [southShort, longPos];
    items.push({
      pos: northPos,
      rotY: facingToRotY(northFacing),
      color: STALL_COLORS[(i * 2) % STALL_COLORS.length],
    });
    items.push({
      pos: southPos,
      rotY: facingToRotY(southFacing),
      color: STALL_COLORS[(i * 2 + 3) % STALL_COLORS.length],
    });
  }
  return items;
}

function planBenchRows(detail: Extract<Detail, { type: "bench-rows" }>): BenchItem[] {
  const b = rectBounds(detail.rect);
  const horizontal = b.w >= b.h;
  const longSpan = horizontal ? b.w : b.h;
  const shortSpan = horizontal ? b.h : b.w;
  const longMin = horizontal ? b.minX : b.minY;
  const shortMin = horizontal ? b.minY : b.minX;
  const nCols = Math.max(1, Math.floor((longSpan - 0.2) / BENCH_SPACING));
  const colStart = longMin + (longSpan - nCols * BENCH_SPACING) / 2 + BENCH_SPACING / 2;
  const nRows = Math.max(1, Math.floor(shortSpan / (BENCH_CLUSTER_DEPTH + 0.3)));
  const rowStep = shortSpan / nRows;
  const rotY = horizontal ? 0 : Math.PI / 2;
  const items: BenchItem[] = [];
  for (let r = 0; r < nRows; r++) {
    const shortPos = shortMin + (r + 0.5) * rowStep;
    for (let c = 0; c < nCols; c++) {
      const longPos = colStart + c * BENCH_SPACING;
      const pos: [number, number] = horizontal
        ? [longPos, shortPos]
        : [shortPos, longPos];
      items.push({ pos, rotY });
    }
  }
  return items;
}

export function FloorDetails({ floor }: { floor: FloorData }) {
  const layout = useMemo(() => {
    const stalls: StallItem[] = [];
    const benches: BenchItem[] = [];
    const rounds: RoundItem[] = [];
    for (const d of floor.details ?? []) {
      if (d.type === "stall-row") stalls.push(...planStallRow(d));
      else if (d.type === "stall-island") stalls.push(...planStallIsland(d));
      else if (d.type === "bench-rows") benches.push(...planBenchRows(d));
      else if (d.type === "round-table") rounds.push({ pos: d.point });
    }
    return { stalls, benches, rounds };
  }, [floor]);

  const depth = floor.bounds.depth;
  const width = floor.bounds.width;
  const toLocal = (px: number, py: number): [number, number, number] => [
    px - width / 2,
    SLAB_Y,
    py - depth / 2,
  ];

  return (
    <group>
      {layout.stalls.map((s, i) => (
        <StallMesh
          key={`s${i}`}
          position={toLocal(s.pos[0], s.pos[1])}
          rotY={s.rotY}
          color={s.color}
        />
      ))}
      {layout.benches.map((b, i) => (
        <BenchMesh
          key={`b${i}`}
          position={toLocal(b.pos[0], b.pos[1])}
          rotY={b.rotY}
        />
      ))}
      {layout.rounds.map((r, i) => (
        <RoundClusterMesh key={`r${i}`} position={toLocal(r.pos[0], r.pos[1])} />
      ))}
    </group>
  );
}
