import { useMemo } from "react";
import type { Detail, Facing, Floor as FloorData, Pt } from "@/data/types";
import {
  BarrierMesh,
  BenchMesh,
  BENCH_CLUSTER_DEPTH,
  BENCH_SPACING,
  BushMesh,
  BUSH_SPACING,
  CourtMesh,
  EventBoothMesh,
  FootballMesh,
  ServiceCentreMesh,
  LibraryEntranceMesh,
  LibraryDecorMesh,
  MeetingRoomsMesh,
  CourtRoofMesh,
  GardenDecorMesh,
  HdbOfficeMesh,
  TheatreMesh,
  ShopBlockMesh,
  CleaningBlockMesh,
  CubicleMesh,
  CUBICLE_D,
  EscalatorMesh,
  LandscapeIslandMesh,
  LiftBlockMesh,
  RoundClusterMesh,
  SeatingBlockMesh,
  SinkMesh,
  SINK_D,
  StadiumSeatsMesh,
  StaircaseMesh,
  StageMesh,
  WalkwayBridgeMesh,
  WalkwayMesh,
  StallMesh,
  STALL_COLORS,
  STALL_D,
  STALL_SPACING,
  ToiletSlabMesh,
} from "./details/primitives";

const SLAB_Y = 0.15;

type StallItem = { pos: [number, number]; rotY: number; color: string };
type BenchItem = { pos: [number, number]; rotY: number };
type RoundItem = { pos: [number, number] };
type CubicleItem = { pos: [number, number]; rotY: number };
type SinkItem = { pos: [number, number]; rotY: number };
type ToiletSlab = { pos: [number, number]; size: [number, number] };
type CleaningItem = { pos: [number, number]; size: [number, number]; rotY: number };
type BushItem = { pos: [number, number]; variant: number };
type OrientedItem = {
  pos: [number, number];
  width: number;
  depth: number;
  rotY: number;
};
type EscalatorItem = OrientedItem & { up: boolean };

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

// For a rect + facing: the mesh's local +z aligns with the facing axis. When the
// facing is N/S, that axis is image-y, so depth = rect height; for E/W it's image-x.
function orientedFromRect(rect: [Pt, Pt], facing: Facing): OrientedItem {
  const b = rectBounds(rect);
  const vertical = facing === "N" || facing === "S";
  return {
    pos: [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2],
    width: vertical ? b.w : b.h,
    depth: vertical ? b.h : b.w,
    rotY: facingToRotY(facing),
  };
}

// Linear circulation (escalators, stairs) always runs along the rect's LONG axis;
// `facing` only chooses which end is "forward" (the up-exit / descent / ascent dir).
function orientedAlongLong(rect: [Pt, Pt], facing: Facing): OrientedItem {
  const b = rectBounds(rect);
  const horizontal = b.w >= b.h; // long axis is image-x
  let rotY: number;
  if (horizontal) {
    // travel along ±x; default east (+x). facing W flips to -x.
    rotY = facing === "W" ? -Math.PI / 2 : Math.PI / 2;
  } else {
    // travel along ±y; default south (+y). facing N flips to -y.
    rotY = facing === "N" ? Math.PI : 0;
  }
  return {
    pos: [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2],
    width: horizontal ? b.h : b.w,
    depth: horizontal ? b.w : b.h,
    rotY,
  };
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

function planToilet(detail: Extract<Detail, { type: "toilet" }>): {
  slab: ToiletSlab;
  cubicles: CubicleItem[];
  sinks: SinkItem[];
} {
  const b = rectBounds(detail.rect);
  const horizontal = b.w >= b.h;
  const longSpan = horizontal ? b.w : b.h;
  const shortSpan = horizontal ? b.h : b.w;
  const longMin = horizontal ? b.minX : b.minY;
  const shortMin = horizontal ? b.minY : b.minX;

  const slab: ToiletSlab = {
    pos: [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2],
    size: [b.w, b.h],
  };

  const cubicleSpacing = 0.95;
  const nCubicles = Math.max(1, Math.floor((longSpan - 0.2) / cubicleSpacing));
  const cubStartLong = longMin + (longSpan - nCubicles * cubicleSpacing) / 2 + cubicleSpacing / 2;
  const cubShort = shortMin + CUBICLE_D / 2 + 0.15;
  const cubRotY = horizontal ? 0 : Math.PI / 2;

  const cubicles: CubicleItem[] = [];
  for (let i = 0; i < nCubicles; i++) {
    const longPos = cubStartLong + i * cubicleSpacing;
    cubicles.push({
      pos: horizontal ? [longPos, cubShort] : [cubShort, longPos],
      rotY: cubRotY,
    });
  }

  const sinks: SinkItem[] = [];
  const hasSinks = shortSpan > 3.0;
  if (hasSinks) {
    const sinkSpacing = 0.85;
    const nSinks = Math.max(1, Math.floor((longSpan - 0.2) / sinkSpacing));
    const sinkStartLong = longMin + (longSpan - nSinks * sinkSpacing) / 2 + sinkSpacing / 2;
    const sinkShort = shortMin + shortSpan - SINK_D / 2 - 0.15;
    const sinkRotY = horizontal ? Math.PI : -Math.PI / 2;
    for (let i = 0; i < nSinks; i++) {
      const longPos = sinkStartLong + i * sinkSpacing;
      sinks.push({
        pos: horizontal ? [longPos, sinkShort] : [sinkShort, longPos],
        rotY: sinkRotY,
      });
    }
  }

  return { slab, cubicles, sinks };
}

function planGreeneryRow(detail: Extract<Detail, { type: "greenery-row" }>): BushItem[] {
  const b = rectBounds(detail.rect);
  const horizontal = b.w >= b.h;
  const longSpan = horizontal ? b.w : b.h;
  const shortSpan = horizontal ? b.h : b.w;
  const longMin = horizontal ? b.minX : b.minY;
  const shortMin = horizontal ? b.minY : b.minX;
  const nCols = Math.max(1, Math.floor((longSpan - 0.1) / BUSH_SPACING));
  const colStart = longMin + (longSpan - nCols * BUSH_SPACING) / 2 + BUSH_SPACING / 2;
  const nRows = Math.max(1, Math.floor(shortSpan / BUSH_SPACING));
  const rowStep = shortSpan / nRows;
  const items: BushItem[] = [];
  for (let r = 0; r < nRows; r++) {
    const shortPos = shortMin + (r + 0.5) * rowStep;
    for (let c = 0; c < nCols; c++) {
      const longPos = colStart + c * BUSH_SPACING;
      items.push({
        pos: horizontal ? [longPos, shortPos] : [shortPos, longPos],
        variant: (r * 7 + c * 3) % 3,
      });
    }
  }
  return items;
}

function planCleaning(detail: Extract<Detail, { type: "cleaning" }>): CleaningItem {
  const b = rectBounds(detail.rect);
  const horizontal = b.w >= b.h;
  const longSize = horizontal ? b.w : b.h;
  const shortSize = horizontal ? b.h : b.w;
  return {
    pos: [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2],
    size: [longSize, shortSize],
    rotY: horizontal ? 0 : Math.PI / 2,
  };
}

export function FloorDetails({ floor }: { floor: FloorData }) {
  const layout = useMemo(() => {
    const stalls: StallItem[] = [];
    const benches: BenchItem[] = [];
    const rounds: RoundItem[] = [];
    const cubicles: CubicleItem[] = [];
    const sinks: SinkItem[] = [];
    const toiletSlabs: ToiletSlab[] = [];
    const cleanings: CleaningItem[] = [];
    const bushes: BushItem[] = [];
    const islands: OrientedItem[] = [];
    const escalators: EscalatorItem[] = [];
    const lifts: OrientedItem[] = [];
    const stairs: OrientedItem[] = [];
    const stairsDown: OrientedItem[] = [];
    const stages: OrientedItem[] = [];
    const seatings: OrientedItem[] = [];
    const stadiums: OrientedItem[] = [];
    const bridges: OrientedItem[] = [];
    const barriers: OrientedItem[] = [];
    const footballs: OrientedItem[] = [];
    const courts: OrientedItem[] = [];
    const booths: OrientedItem[] = [];
    const shops: OrientedItem[] = [];
    const walls: OrientedItem[] = [];
    const serviceCentres: { points: [number, number][]; variant: "psc" | "family" }[] = [];
    const courtRoofs: { points: [number, number][] }[] = [];
    const gardenDecors: { points: [number, number][] }[] = [];
    const hdbOffices: { points: [number, number][] }[] = [];
    const theatres: { points: [number, number][] }[] = [];
    const walkways: { points: [number, number][] }[] = [];
    const libraryEntrances: { points: [number, number][] }[] = [];
    const libraryDecors: { points: [number, number][] }[] = [];
    const meetingRooms: { points: [number, number][] }[] = [];
    const flatRect = (rect: [Pt, Pt]): OrientedItem => {
      const b = rectBounds(rect);
      return {
        pos: [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2],
        width: b.w,
        depth: b.h,
        rotY: 0,
      };
    };
    for (const d of floor.details ?? []) {
      if (d.type === "stall-row") stalls.push(...planStallRow(d));
      else if (d.type === "stall-island") stalls.push(...planStallIsland(d));
      else if (d.type === "bench-rows") benches.push(...planBenchRows(d));
      else if (d.type === "round-table") rounds.push({ pos: d.point });
      else if (d.type === "toilet") {
        const t = planToilet(d);
        toiletSlabs.push(t.slab);
        cubicles.push(...t.cubicles);
        sinks.push(...t.sinks);
      } else if (d.type === "cleaning") {
        cleanings.push(planCleaning(d));
      } else if (d.type === "greenery-row") {
        bushes.push(...planGreeneryRow(d));
      } else if (d.type === "landscape-island") {
        const b = rectBounds(d.rect);
        islands.push({
          pos: [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2],
          width: b.w,
          depth: b.h,
          rotY: 0,
        });
      } else if (d.type === "escalator-up") {
        escalators.push({ ...orientedAlongLong(d.rect, d.facing), up: true });
      } else if (d.type === "escalator-down") {
        escalators.push({ ...orientedAlongLong(d.rect, d.facing), up: false });
      } else if (d.type === "lift-block") {
        lifts.push(orientedFromRect(d.rect, d.facing));
      } else if (d.type === "staircase") {
        stairs.push(orientedAlongLong(d.rect, d.facing));
      } else if (d.type === "staircase-down") {
        stairsDown.push(orientedAlongLong(d.rect, d.facing));
      } else if (d.type === "stage") {
        stages.push(orientedFromRect(d.rect, d.facing));
      } else if (d.type === "seating-block") {
        seatings.push(orientedFromRect(d.rect, d.facing));
      } else if (d.type === "stadium-seats") {
        stadiums.push(orientedFromRect(d.rect, d.facing));
      } else if (d.type === "walkway-bridge") {
        bridges.push(orientedAlongLong(d.rect, "S"));
      } else if (d.type === "barrier") {
        barriers.push(flatRect(d.rect));
      } else if (d.type === "football") {
        footballs.push(orientedAlongLong(d.rect, "S"));
      } else if (d.type === "court") {
        courts.push(orientedAlongLong(d.rect, "S"));
      } else if (d.type === "event-booth") {
        booths.push(flatRect(d.rect));
      } else if (d.type === "shop-block") {
        shops.push(flatRect(d.rect));
      } else if (d.type === "wall") {
        walls.push(flatRect(d.rect));
      } else if (d.type === "service-centre") {
        const W = floor.bounds.width;
        const H = floor.bounds.depth;
        serviceCentres.push({
          points: d.points.map(([px, py]) => [px - W / 2, py - H / 2] as [number, number]),
          variant: d.variant,
        });
      } else if (d.type === "walkway") {
        const W = floor.bounds.width;
        const H = floor.bounds.depth;
        walkways.push({
          points: d.points.map(([px, py]) => [px - W / 2, py - H / 2] as [number, number]),
        });
      } else if (d.type === "library-entrance") {
        const W = floor.bounds.width;
        const H = floor.bounds.depth;
        libraryEntrances.push({
          points: d.points.map(([px, py]) => [px - W / 2, py - H / 2] as [number, number]),
        });
      } else if (d.type === "library-decor") {
        const W = floor.bounds.width;
        const H = floor.bounds.depth;
        libraryDecors.push({
          points: d.points.map(([px, py]) => [px - W / 2, py - H / 2] as [number, number]),
        });
      } else if (d.type === "meeting-rooms") {
        const W = floor.bounds.width;
        const H = floor.bounds.depth;
        meetingRooms.push({
          points: d.points.map(([px, py]) => [px - W / 2, py - H / 2] as [number, number]),
        });
      } else if (d.type === "court-roof") {
        const W = floor.bounds.width;
        const H = floor.bounds.depth;
        courtRoofs.push({
          points: d.points.map(([px, py]) => [px - W / 2, py - H / 2] as [number, number]),
        });
      } else if (d.type === "garden-decor") {
        const W = floor.bounds.width;
        const H = floor.bounds.depth;
        gardenDecors.push({
          points: d.points.map(([px, py]) => [px - W / 2, py - H / 2] as [number, number]),
        });
      } else if (d.type === "hdb-office") {
        const W = floor.bounds.width;
        const H = floor.bounds.depth;
        hdbOffices.push({
          points: d.points.map(([px, py]) => [px - W / 2, py - H / 2] as [number, number]),
        });
      } else if (d.type === "theatre") {
        const W = floor.bounds.width;
        const H = floor.bounds.depth;
        theatres.push({
          points: d.points.map(([px, py]) => [px - W / 2, py - H / 2] as [number, number]),
        });
      }
    }
    return {
      stalls,
      benches,
      rounds,
      cubicles,
      sinks,
      toiletSlabs,
      cleanings,
      bushes,
      islands,
      escalators,
      lifts,
      stairs,
      stairsDown,
      stages,
      seatings,
      stadiums,
      bridges,
      barriers,
      footballs,
      courts,
      booths,
      shops,
      walls,
      serviceCentres,
      walkways,
      libraryEntrances,
      libraryDecors,
      meetingRooms,
      courtRoofs,
      gardenDecors,
      hdbOffices,
      theatres,
    };
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
      {layout.toiletSlabs.map((t, i) => (
        <ToiletSlabMesh
          key={`tslab${i}`}
          position={[t.pos[0] - width / 2, SLAB_Y + 0.02, t.pos[1] - depth / 2]}
          size={t.size}
        />
      ))}
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
      {layout.cubicles.map((c, i) => (
        <CubicleMesh
          key={`c${i}`}
          position={toLocal(c.pos[0], c.pos[1])}
          rotY={c.rotY}
        />
      ))}
      {layout.sinks.map((s, i) => (
        <SinkMesh
          key={`sink${i}`}
          position={toLocal(s.pos[0], s.pos[1])}
          rotY={s.rotY}
        />
      ))}
      {layout.cleanings.map((c, i) => (
        <CleaningBlockMesh
          key={`clean${i}`}
          position={toLocal(c.pos[0], c.pos[1])}
          size={c.size}
          rotY={c.rotY}
        />
      ))}
      {layout.bushes.map((b, i) => (
        <BushMesh
          key={`bush${i}`}
          position={toLocal(b.pos[0], b.pos[1])}
          variant={b.variant}
        />
      ))}
      {layout.islands.map((it, i) => (
        <LandscapeIslandMesh
          key={`isl${i}`}
          position={toLocal(it.pos[0], it.pos[1])}
          width={it.width}
          depth={it.depth}
          rotY={it.rotY}
        />
      ))}
      {layout.escalators.map((it, i) => (
        <EscalatorMesh
          key={`esc${i}`}
          position={toLocal(it.pos[0], it.pos[1])}
          width={it.width}
          depth={it.depth}
          rotY={it.rotY}
          up={it.up}
        />
      ))}
      {layout.lifts.map((it, i) => (
        <LiftBlockMesh
          key={`lift${i}`}
          position={toLocal(it.pos[0], it.pos[1])}
          width={it.width}
          depth={it.depth}
          rotY={it.rotY}
        />
      ))}
      {layout.stairs.map((it, i) => (
        <StaircaseMesh
          key={`stair${i}`}
          position={toLocal(it.pos[0], it.pos[1])}
          width={it.width}
          depth={it.depth}
          rotY={it.rotY}
        />
      ))}
      {layout.stairsDown.map((it, i) => (
        <StaircaseMesh
          key={`stairdn${i}`}
          position={toLocal(it.pos[0], it.pos[1])}
          width={it.width}
          depth={it.depth}
          rotY={it.rotY}
          down
        />
      ))}
      {layout.stages.map((it, i) => (
        <StageMesh
          key={`stage${i}`}
          position={toLocal(it.pos[0], it.pos[1])}
          width={it.width}
          depth={it.depth}
          rotY={it.rotY}
        />
      ))}
      {layout.seatings.map((it, i) => (
        <SeatingBlockMesh
          key={`seat${i}`}
          position={toLocal(it.pos[0], it.pos[1])}
          width={it.width}
          depth={it.depth}
          rotY={it.rotY}
        />
      ))}
      {layout.stadiums.map((it, i) => (
        <StadiumSeatsMesh
          key={`stadium${i}`}
          position={toLocal(it.pos[0], it.pos[1])}
          width={it.width}
          depth={it.depth}
          rotY={it.rotY}
        />
      ))}
      {layout.bridges.map((it, i) => (
        <WalkwayBridgeMesh
          key={`bridge${i}`}
          position={toLocal(it.pos[0], it.pos[1])}
          width={it.width}
          depth={it.depth}
          rotY={it.rotY}
        />
      ))}
      {layout.barriers.map((it, i) => (
        <BarrierMesh
          key={`barrier${i}`}
          position={toLocal(it.pos[0], it.pos[1])}
          width={it.width}
          depth={it.depth}
        />
      ))}
      {layout.footballs.map((it, i) => (
        <FootballMesh
          key={`fb${i}`}
          position={toLocal(it.pos[0], it.pos[1])}
          width={it.width}
          depth={it.depth}
          rotY={it.rotY}
        />
      ))}
      {layout.courts.map((it, i) => (
        <CourtMesh
          key={`court${i}`}
          position={toLocal(it.pos[0], it.pos[1])}
          width={it.width}
          depth={it.depth}
          rotY={it.rotY}
        />
      ))}
      {layout.booths.map((it, i) => (
        <EventBoothMesh
          key={`booth${i}`}
          position={toLocal(it.pos[0], it.pos[1])}
          width={it.width}
          depth={it.depth}
        />
      ))}
      {layout.shops.map((it, i) => (
        <ShopBlockMesh
          key={`shop${i}`}
          position={toLocal(it.pos[0], it.pos[1])}
          width={it.width}
          depth={it.depth}
        />
      ))}
      {layout.walls.map((it, i) => (
        <mesh
          key={`wall${i}`}
          position={[it.pos[0] - width / 2, SLAB_Y + 0.55, it.pos[1] - depth / 2]}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[it.width, 1.1, it.depth]} />
          <meshStandardMaterial color="#9AA1A9" />
        </mesh>
      ))}
      {layout.serviceCentres.map((sc, i) => (
        <ServiceCentreMesh key={`sc${i}`} points={sc.points} variant={sc.variant} />
      ))}
      {layout.walkways.map((wk, i) => (
        <WalkwayMesh key={`walkway${i}`} points={wk.points} />
      ))}
      {layout.libraryEntrances.map((le, i) => (
        <LibraryEntranceMesh key={`lib${i}`} points={le.points} />
      ))}
      {layout.libraryDecors.map((ld, i) => (
        <LibraryDecorMesh key={`libdecor${i}`} points={ld.points} />
      ))}
      {layout.meetingRooms.map((mr, i) => (
        <MeetingRoomsMesh key={`mr${i}`} points={mr.points} />
      ))}
      {layout.courtRoofs.map((cr, i) => (
        <CourtRoofMesh key={`croof${i}`} points={cr.points} />
      ))}
      {layout.gardenDecors.map((gd, i) => (
        <GardenDecorMesh key={`garden${i}`} points={gd.points} />
      ))}
      {layout.hdbOffices.map((ho, i) => (
        <HdbOfficeMesh key={`hdb${i}`} points={ho.points} />
      ))}
      {layout.theatres.map((th, i) => (
        <TheatreMesh key={`theatre${i}`} points={th.points} />
      ))}
    </group>
  );
}
