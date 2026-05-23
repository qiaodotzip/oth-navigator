import { useMemo } from "react";
import * as THREE from "three";
import { useStore } from "@/store";

/** True at night — used to make greenery/shops/hawker stalls emissive so they glow under Bloom. */
export function useNightGlow(): boolean {
  return useStore(s => s.timeOfDay === "night");
}

export const STALL_W = 2.4;
export const STALL_D = 1.7;
export const STALL_BODY_H = 2.2;
export const ROOF_H = 0.55;
export const STALL_SPACING = STALL_W + 0.2;

export const BENCH_TABLE_W = 2.4;
export const BENCH_TABLE_D = 0.7;
export const BENCH_TABLE_H = 0.75;
export const BENCH_SEAT_D = 0.3;
export const BENCH_SEAT_H = 0.42;
export const BENCH_OFFSET = 0.55;
export const BENCH_SPACING = BENCH_TABLE_W + 0.3;
export const BENCH_CLUSTER_DEPTH = 2 * BENCH_OFFSET + BENCH_SEAT_D;

export const ROUND_TABLE_R = 0.55;
export const ROUND_TABLE_H = 0.75;
export const STOOL_R = 0.18;
export const STOOL_H = 0.45;

export const TOILET_TILE_COLOR = "#D8DEE4";
export const TOILET_FIXTURE_COLOR = "#F0F0F0";
export const TOILET_DIVIDER_COLOR = "#A8B0B8";
export const TOILET_PARTITION_H = 1.6;
export const TOILET_PARTITION_T = 0.05;
export const CUBICLE_W = 0.85;
export const CUBICLE_D = 1.2;
export const CUBICLE_H = 0.45;
export const SINK_W = 0.6;
export const SINK_D = 0.4;
export const SINK_H = 0.85;

export const CLEANING_H = 1.6;
export const CLEANING_BAND_H = 0.45;
export const CLEANING_BODY = "#5C6068";
export const CLEANING_ACCENT = "#3A3D42";
export const CLEANING_WINDOW = "#2A2C30";
export const CLEANING_BIN_COLOR = "#8C8F95";

export const BUSH_R = 0.42;
export const BUSH_SPACING = 0.85;
export const PLANTER_W = 0.72;
export const PLANTER_D = 0.55;
export const PLANTER_H = 0.38;
export const PLANTER_COLOR = "#4A3A2A";
export const BUSH_GREENS = ["#4F7A3A", "#5C8B47", "#3E6A30"];

export const STALL_COLORS = [
  "#D9534F",
  "#F2A33C",
  "#F0AD4E",
  "#C9462A",
  "#B8893A",
  "#9C5A2A",
  "#E07A3C",
];
export const TABLE_TOP = "#D8B57C";
export const BENCH_SEAT_COLOR = "#8C6A47";
export const STOOL_COLOR = "#5C3A22";

export function StallMesh({
  position,
  rotY,
  color,
}: {
  position: [number, number, number];
  rotY: number;
  color: string;
}) {
  const night = useNightGlow();
  return (
    <group position={position} rotation={[0, rotY, 0]}>
      <mesh position={[0, STALL_BODY_H / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[STALL_W, STALL_BODY_H, STALL_D]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={night ? 0.45 : 0} />
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
          emissiveIntensity={night ? 1.6 : 0.25}
        />
      </mesh>
    </group>
  );
}

export function BenchMesh({
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

export function ToiletSlabMesh({
  position,
  size,
}: {
  position: [number, number, number];
  size: [number, number];
}) {
  const [w, d] = size;
  return (
    <mesh position={position} receiveShadow>
      <boxGeometry args={[w, 0.04, d]} />
      <meshStandardMaterial color={TOILET_TILE_COLOR} />
    </mesh>
  );
}

export function CubicleMesh({
  position,
  rotY,
}: {
  position: [number, number, number];
  rotY: number;
}) {
  return (
    <group position={position} rotation={[0, rotY, 0]}>
      <mesh
        position={[CUBICLE_W / 2 + TOILET_PARTITION_T / 2, TOILET_PARTITION_H / 2, 0]}
        castShadow
      >
        <boxGeometry args={[TOILET_PARTITION_T, TOILET_PARTITION_H, CUBICLE_D]} />
        <meshStandardMaterial color={TOILET_DIVIDER_COLOR} />
      </mesh>
      <mesh
        position={[
          -CUBICLE_W / 2 - TOILET_PARTITION_T / 2,
          TOILET_PARTITION_H / 2,
          0,
        ]}
        castShadow
      >
        <boxGeometry args={[TOILET_PARTITION_T, TOILET_PARTITION_H, CUBICLE_D]} />
        <meshStandardMaterial color={TOILET_DIVIDER_COLOR} />
      </mesh>
      <mesh
        position={[
          0,
          TOILET_PARTITION_H / 2,
          -CUBICLE_D / 2 - TOILET_PARTITION_T / 2,
        ]}
        castShadow
      >
        <boxGeometry args={[CUBICLE_W, TOILET_PARTITION_H, TOILET_PARTITION_T]} />
        <meshStandardMaterial color={TOILET_DIVIDER_COLOR} />
      </mesh>
      <mesh position={[0, CUBICLE_H / 2, -CUBICLE_D / 2 + 0.35]} castShadow receiveShadow>
        <boxGeometry args={[0.45, CUBICLE_H, 0.55]} />
        <meshStandardMaterial color={TOILET_FIXTURE_COLOR} />
      </mesh>
    </group>
  );
}

export function SinkMesh({
  position,
  rotY,
}: {
  position: [number, number, number];
  rotY: number;
}) {
  return (
    <group position={position} rotation={[0, rotY, 0]}>
      <mesh position={[0, SINK_H / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[SINK_W, SINK_H, SINK_D]} />
        <meshStandardMaterial color={TOILET_FIXTURE_COLOR} />
      </mesh>
      <mesh position={[0, SINK_H + 0.18, 0.05]} castShadow>
        <boxGeometry args={[0.05, 0.3, 0.05]} />
        <meshStandardMaterial color="#7C8590" />
      </mesh>
    </group>
  );
}

export function CleaningBlockMesh({
  position,
  size,
  rotY,
}: {
  position: [number, number, number];
  size: [number, number];
  rotY: number;
}) {
  const [longSize, shortSize] = size;
  return (
    <group position={position} rotation={[0, rotY, 0]}>
      <mesh position={[0, CLEANING_H / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[longSize, CLEANING_H, shortSize]} />
        <meshStandardMaterial color={CLEANING_BODY} />
      </mesh>
      <mesh position={[0, CLEANING_H + 0.05, 0]} castShadow>
        <boxGeometry args={[longSize + 0.15, 0.1, shortSize + 0.15]} />
        <meshStandardMaterial color={CLEANING_ACCENT} />
      </mesh>
      <mesh position={[0, 0.85, shortSize / 2 + 0.01]}>
        <boxGeometry args={[longSize - 0.2, CLEANING_BAND_H, 0.06]} />
        <meshStandardMaterial color={CLEANING_WINDOW} />
      </mesh>
      <mesh position={[0, 0.85, -shortSize / 2 - 0.01]}>
        <boxGeometry args={[longSize - 0.2, CLEANING_BAND_H, 0.06]} />
        <meshStandardMaterial color={CLEANING_WINDOW} />
      </mesh>
      <mesh
        position={[longSize / 2 - 0.4, CLEANING_H + 0.4, 0]}
        castShadow
        receiveShadow
      >
        <cylinderGeometry args={[0.22, 0.26, 0.6, 12]} />
        <meshStandardMaterial color={CLEANING_BIN_COLOR} />
      </mesh>
      <mesh
        position={[-longSize / 2 + 0.4, CLEANING_H + 0.4, 0]}
        castShadow
        receiveShadow
      >
        <cylinderGeometry args={[0.22, 0.26, 0.6, 12]} />
        <meshStandardMaterial color={CLEANING_BIN_COLOR} />
      </mesh>
    </group>
  );
}

export function BushMesh({
  position,
  variant,
}: {
  position: [number, number, number];
  variant: number;
}) {
  const green = BUSH_GREENS[variant % BUSH_GREENS.length];
  const night = useNightGlow();
  return (
    <group position={position}>
      <mesh position={[0, PLANTER_H / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[PLANTER_W, PLANTER_H, PLANTER_D]} />
        <meshStandardMaterial color={PLANTER_COLOR} />
      </mesh>
      <mesh position={[0, PLANTER_H + BUSH_R * 0.75, 0]} castShadow receiveShadow>
        <icosahedronGeometry args={[BUSH_R, 0]} />
        <meshStandardMaterial
          color={green}
          flatShading
          emissive={green}
          emissiveIntensity={night ? 0.7 : 0}
        />
      </mesh>
      <mesh
        position={[BUSH_R * 0.4, PLANTER_H + BUSH_R * 1.05, -BUSH_R * 0.3]}
        castShadow
      >
        <icosahedronGeometry args={[BUSH_R * 0.6, 0]} />
        <meshStandardMaterial
          color={green}
          flatShading
          emissive={green}
          emissiveIntensity={night ? 0.7 : 0}
        />
      </mesh>
    </group>
  );
}

export function RoundClusterMesh({ position }: { position: [number, number, number] }) {
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

// ---------- Standard / circulation / stage primitives ----------

const TRUNK_COLOR = "#8B6B4A";
const FROND_COLOR = "#3E7A34";
const ISLAND_SLAB_COLOR = "#6E8B4A";
const PARK_BENCH_COLOR = "#7C5A3A";
const ESC_UP_COLOR = "#4CAF50";
const ESC_DOWN_COLOR = "#FF8A50";
const ESC_RAIL_COLOR = "#9AA3AD";
const ESC_STEP_COLOR = "#C2C8CF";
const LIFT_BODY_COLOR = "#7E868F";
const LIFT_DOOR_COLOR = "#2F3439";
const STAIR_COLOR = "#B8BEC6";
const STAGE_PLATFORM_COLOR = "#3A2C3F";
const STAGE_SCREEN_COLOR = "#101418";
const STAGE_SCREEN_FRAME = "#33383E";
const CHAIR_COLOR = "#F2F2F0";

export const ESC_RISE = 2.4;
export const LIFT_H = 3.2;
export const STAGE_PLATFORM_H = 0.9;

export function PalmTreeMesh({
  position,
  scale = 1,
}: {
  position: [number, number, number];
  scale?: number;
}) {
  const N = 9;
  const crownY = 3.4;
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 1.7, 0]} castShadow>
        <cylinderGeometry args={[0.1, 0.18, 3.4, 7]} />
        <meshStandardMaterial color={TRUNK_COLOR} flatShading />
      </mesh>
      <mesh position={[0, crownY, 0]} castShadow>
        <icosahedronGeometry args={[0.22, 0]} />
        <meshStandardMaterial color={FROND_COLOR} flatShading />
      </mesh>
      {/* drooping fronds radiating from the crown */}
      {Array.from({ length: N }).map((_, i) => {
        const a = (i / N) * Math.PI * 2;
        return (
          <group key={i} position={[0, crownY, 0]} rotation={[0, a, 0]}>
            <mesh position={[0.65, -0.12, 0]} rotation={[0, 0, -0.55]} castShadow>
              <boxGeometry args={[1.4, 0.05, 0.3]} />
              <meshStandardMaterial color={i % 2 ? FROND_COLOR : "#4F8A40"} flatShading />
            </mesh>
          </group>
        );
      })}
      {/* coconuts */}
      {[0, 1, 2].map(i => {
        const a = (i / 3) * Math.PI * 2;
        return (
          <mesh
            key={`c${i}`}
            position={[Math.cos(a) * 0.18, crownY - 0.1, Math.sin(a) * 0.18]}
            castShadow
          >
            <sphereGeometry args={[0.1, 8, 8]} />
            <meshStandardMaterial color="#6B4A2A" />
          </mesh>
        );
      })}
    </group>
  );
}

export function ParkBenchMesh({
  position,
  rotY,
}: {
  position: [number, number, number];
  rotY: number;
}) {
  const W = 1.6;
  return (
    <group position={position} rotation={[0, rotY, 0]}>
      <mesh position={[0, 0.42, 0]} castShadow receiveShadow>
        <boxGeometry args={[W, 0.1, 0.45]} />
        <meshStandardMaterial color={PARK_BENCH_COLOR} />
      </mesh>
      <mesh position={[0, 0.72, -0.2]} castShadow>
        <boxGeometry args={[W, 0.5, 0.08]} />
        <meshStandardMaterial color={PARK_BENCH_COLOR} />
      </mesh>
    </group>
  );
}

export function LandscapeIslandMesh({
  position,
  width,
  depth,
  rotY,
}: {
  position: [number, number, number];
  width: number;
  depth: number;
  rotY: number;
}) {
  const halfW = width / 2;
  const halfD = depth / 2;
  const palms: [number, number][] =
    Math.max(width, depth) > 5
      ? [
          [-width * 0.18, 0],
          [width * 0.2, depth * 0.12],
        ]
      : [[0, 0]];
  const bushPositions: [number, number][] = [
    [-width * 0.28, -depth * 0.22],
    [width * 0.3, -depth * 0.18],
    [width * 0.05, depth * 0.28],
    [-width * 0.22, depth * 0.25],
  ];
  // Park benches lined against each side, facing outward.
  const benches: Array<{ pos: [number, number]; rotY: number }> = [
    { pos: [0, halfD + 0.35], rotY: 0 },
    { pos: [0, -halfD - 0.35], rotY: Math.PI },
    { pos: [halfW + 0.35, 0], rotY: -Math.PI / 2 },
    { pos: [-halfW - 0.35, 0], rotY: Math.PI / 2 },
  ];
  return (
    <group position={position} rotation={[0, rotY, 0]}>
      <mesh position={[0, 0.18, 0]} receiveShadow castShadow>
        <boxGeometry args={[width, 0.36, depth]} />
        <meshStandardMaterial color={ISLAND_SLAB_COLOR} />
      </mesh>
      {palms.map(([px, pz], i) => (
        <PalmTreeMesh key={`palm${i}`} position={[px, 0.36, pz]} scale={0.95} />
      ))}
      {bushPositions
        .filter(([bx, bz]) => Math.abs(bx) < halfW - 0.3 && Math.abs(bz) < halfD - 0.3)
        .map(([bx, bz], i) => (
          <mesh key={`b${i}`} position={[bx, 0.36 + 0.3, bz]} castShadow>
            <icosahedronGeometry args={[0.4, 0]} />
            <meshStandardMaterial color="#4F7A3A" flatShading />
          </mesh>
        ))}
      {benches.map((b, i) => (
        <ParkBenchMesh key={`pb${i}`} position={[b.pos[0], 0, b.pos[1]]} rotY={b.rotY} />
      ))}
    </group>
  );
}

export function EscalatorMesh({
  position,
  width,
  depth,
  rotY,
  up,
}: {
  position: [number, number, number];
  width: number;
  depth: number;
  rotY: number;
  up: boolean;
}) {
  // You board at the -z (near) end at floor level and travel toward +z.
  //   up   => far (+z) end RISES to +rise (climbs to the floor above).
  //   down => far (+z) end DESCENDS to -rise (drops to the floor below).
  const run = depth;
  const rise = ESC_RISE;
  const rampLen = Math.hypot(run, rise);
  const incline = Math.atan2(rise, run);
  const farY = up ? rise : -rise; // y of the far (+z) end
  const centerY = farY / 2;
  const tilt = up ? -incline : incline; // rotX: tilts the +z end up (up) or down (down)
  const rampW = Math.min(width, 2.2);
  const color = up ? ESC_UP_COLOR : ESC_DOWN_COLOR;
  const nSteps = Math.max(4, Math.round(run / 0.7));
  return (
    <group position={position} rotation={[0, rotY, 0]}>
      <mesh position={[0, centerY, 0]} rotation={[tilt, 0, 0]} castShadow receiveShadow>
        <boxGeometry args={[rampW, 0.18, rampLen]} />
        <meshStandardMaterial color={color} />
      </mesh>
      {/* step ridges, from floor level (-z) toward the far end */}
      {Array.from({ length: nSteps }).map((_, i) => {
        const t = (i + 0.5) / nSteps; // 0 at -z (floor) .. 1 at +z (far)
        const z = (t - 0.5) * run;
        const y = t * farY + 0.12 * Math.cos(tilt);
        return (
          <mesh key={i} position={[0, y, z]} rotation={[tilt, 0, 0]}>
            <boxGeometry args={[rampW - 0.1, 0.06, 0.12]} />
            <meshStandardMaterial color={ESC_STEP_COLOR} />
          </mesh>
        );
      })}
      {/* side rails */}
      {[rampW / 2 + 0.08, -rampW / 2 - 0.08].map((x, i) => (
        <mesh key={i} position={[x, centerY + 0.5, 0]} rotation={[tilt, 0, 0]} castShadow>
          <boxGeometry args={[0.1, 0.5, rampLen]} />
          <meshStandardMaterial color={ESC_RAIL_COLOR} />
        </mesh>
      ))}
      {/* direction arrow at the boarding (-z) end, angled up/down along travel */}
      <mesh
        position={[0, 0.6, -run / 2 - 0.2]}
        rotation={[up ? Math.PI / 2 - incline : Math.PI / 2 + incline, 0, 0]}
      >
        <coneGeometry args={[0.5, 1.0, 4]} />
        <meshStandardMaterial color={color} />
      </mesh>
    </group>
  );
}

export function LiftBlockMesh({
  position,
  width,
  depth,
  rotY,
}: {
  position: [number, number, number];
  width: number;
  depth: number;
  rotY: number;
}) {
  // Lifts line the long side; doors face +z (the lobby / facing side).
  const doorCount = Math.max(1, Math.floor(width / 1.6));
  const doorW = 0.9;
  const gap = width / doorCount;
  return (
    <group position={position} rotation={[0, rotY, 0]}>
      <mesh position={[0, LIFT_H / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[width, LIFT_H, depth]} />
        <meshStandardMaterial color={LIFT_BODY_COLOR} />
      </mesh>
      {Array.from({ length: doorCount }).map((_, i) => {
        const x = -width / 2 + gap * (i + 0.5);
        return (
          <mesh key={i} position={[x, 1.1, depth / 2 + 0.02]} castShadow>
            <boxGeometry args={[doorW, 2.0, 0.08]} />
            <meshStandardMaterial color={LIFT_DOOR_COLOR} metalness={0.3} />
          </mesh>
        );
      })}
    </group>
  );
}

export function StaircaseMesh({
  position,
  width,
  depth,
  rotY,
}: {
  position: [number, number, number];
  width: number;
  depth: number;
  rotY: number;
}) {
  // Ascends toward +z.
  const rise = Math.min(ESC_RISE, depth * 0.6);
  const nSteps = Math.max(5, Math.round(depth / 0.32));
  const going = depth / nSteps;
  const stepW = Math.min(width, 3.0);
  return (
    <group position={position} rotation={[0, rotY, 0]}>
      {Array.from({ length: nSteps }).map((_, i) => {
        const z = -depth / 2 + (i + 0.5) * going;
        const h = ((i + 1) / nSteps) * rise;
        return (
          <mesh key={i} position={[0, h / 2, z]} castShadow receiveShadow>
            <boxGeometry args={[stepW, h, going * 0.96]} />
            <meshStandardMaterial color={STAIR_COLOR} />
          </mesh>
        );
      })}
    </group>
  );
}

export function StageMesh({
  position,
  width,
  depth,
  rotY,
}: {
  position: [number, number, number];
  width: number;
  depth: number;
  rotY: number;
}) {
  // Stage faces +z (audience). Big screen at the back (-z edge).
  const screenW = width * 0.85;
  const screenH = Math.min(3.4, depth * 1.2 + 1.5);
  return (
    <group position={position} rotation={[0, rotY, 0]}>
      <mesh position={[0, STAGE_PLATFORM_H / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[width, STAGE_PLATFORM_H, depth]} />
        <meshStandardMaterial color={STAGE_PLATFORM_COLOR} />
      </mesh>
      <mesh position={[0, STAGE_PLATFORM_H + screenH / 2, -depth / 2 + 0.15]} castShadow>
        <boxGeometry args={[screenW + 0.3, screenH + 0.3, 0.25]} />
        <meshStandardMaterial color={STAGE_SCREEN_FRAME} />
      </mesh>
      <mesh position={[0, STAGE_PLATFORM_H + screenH / 2, -depth / 2 + 0.29]}>
        <boxGeometry args={[screenW, screenH, 0.08]} />
        <meshStandardMaterial color={STAGE_SCREEN_COLOR} emissive="#1B3A6B" emissiveIntensity={0.4} />
      </mesh>
    </group>
  );
}

export function ChairMesh({
  position,
  rotY,
}: {
  position: [number, number, number];
  rotY: number;
}) {
  return (
    <group position={position} rotation={[0, rotY, 0]}>
      <mesh position={[0, 0.42, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.45, 0.07, 0.45]} />
        <meshStandardMaterial color={CHAIR_COLOR} />
      </mesh>
      <mesh position={[0, 0.66, -0.2]} castShadow>
        <boxGeometry args={[0.45, 0.45, 0.06]} />
        <meshStandardMaterial color={CHAIR_COLOR} />
      </mesh>
    </group>
  );
}

const BARRIER_COLOR = "#B0202A";

export function BarrierMesh({
  position,
  width,
  depth,
}: {
  position: [number, number, number];
  width: number;
  depth: number;
}) {
  const H = 0.95;
  const T = 0.12;
  const rails: { pos: [number, number, number]; size: [number, number, number] }[] = [
    { pos: [0, H / 2, depth / 2], size: [width, H, T] },
    { pos: [0, H / 2, -depth / 2], size: [width, H, T] },
    { pos: [width / 2, H / 2, 0], size: [T, H, depth] },
    { pos: [-width / 2, H / 2, 0], size: [T, H, depth] },
  ];
  return (
    <group position={position}>
      {rails.map((r, i) => (
        <mesh key={i} position={r.pos} castShadow>
          <boxGeometry args={r.size} />
          <meshStandardMaterial color={BARRIER_COLOR} transparent opacity={0.55} />
        </mesh>
      ))}
    </group>
  );
}

export function SeatingBlockMesh({
  position,
  width,
  depth,
  rotY,
}: {
  position: [number, number, number];
  width: number;
  depth: number;
  rotY: number;
}) {
  // Rows of white plastic chairs, all facing +z (toward a stage).
  const cols = Math.max(1, Math.floor(width / 0.6));
  const rows = Math.max(1, Math.floor(depth / 0.8));
  const colStep = width / cols;
  const rowStep = depth / rows;
  const chairs: [number, number][] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      chairs.push([-width / 2 + (c + 0.5) * colStep, -depth / 2 + (r + 0.5) * rowStep]);
    }
  }
  return (
    <group position={position} rotation={[0, rotY, 0]}>
      {chairs.map(([x, z], i) => (
        <ChairMesh key={i} position={[x, 0, z]} rotY={0} />
      ))}
    </group>
  );
}

// ---------- Sports / venue primitives ----------

const PITCH_COLOR = "#2E7D32";
const LINE_COLOR = "#EFEFEF";
const COURT_COLOR = "#B5651D";
const COURT_LINE = "#F4F4F4";
const GLASS_COLOR = "#A8C8E0";
const BOOTH_CANOPY = ["#D9534F", "#F2A33C", "#4F8A40", "#5E81AC"];

// Football pitch: field runs along local Z (depth); goals at ±depth/2.
export function FootballMesh({
  position,
  width,
  depth,
  rotY,
}: {
  position: [number, number, number];
  width: number;
  depth: number;
  rotY: number;
}) {
  const halfW = width / 2;
  const halfL = depth / 2;
  const lt = 0.14;
  const lineY = 0.13;
  const circleR = Math.min(width, depth) * 0.14;
  const gw = Math.min(width * 0.4, 6);
  const gh = 1.8;
  return (
    <group position={position} rotation={[0, rotY, 0]}>
      <mesh position={[0, 0.06, 0]} receiveShadow>
        <boxGeometry args={[width, 0.12, depth]} />
        <meshStandardMaterial color={PITCH_COLOR} />
      </mesh>
      {[
        [0, lineY, halfL - lt, width - lt * 2, lt],
        [0, lineY, -halfL + lt, width - lt * 2, lt],
        [0, lineY, 0, width - lt * 2, lt],
        [halfW - lt, lineY, 0, lt, depth - lt * 2],
        [-halfW + lt, lineY, 0, lt, depth - lt * 2],
      ].map(([x, y, z, sw, sd], i) => (
        <mesh key={i} position={[x, y, z]}>
          <boxGeometry args={[sw, 0.02, sd]} />
          <meshStandardMaterial color={LINE_COLOR} />
        </mesh>
      ))}
      <mesh position={[0, lineY, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[circleR, lt * 0.4, 6, 28]} />
        <meshStandardMaterial color={LINE_COLOR} />
      </mesh>
      {[halfL, -halfL].map((z, i) => {
        const sign = z > 0 ? -1 : 1;
        return (
          <group key={i} position={[0, 0.12, z + sign * 0.25]}>
            <mesh position={[gw / 2, gh / 2, 0]} castShadow>
              <boxGeometry args={[0.1, gh, 0.1]} />
              <meshStandardMaterial color={LINE_COLOR} />
            </mesh>
            <mesh position={[-gw / 2, gh / 2, 0]} castShadow>
              <boxGeometry args={[0.1, gh, 0.1]} />
              <meshStandardMaterial color={LINE_COLOR} />
            </mesh>
            <mesh position={[0, gh, 0]} castShadow>
              <boxGeometry args={[gw, 0.1, 0.1]} />
              <meshStandardMaterial color={LINE_COLOR} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

// Sports court: surface runs along local Z; backboards at ±depth/2.
export function CourtMesh({
  position,
  width,
  depth,
  rotY,
}: {
  position: [number, number, number];
  width: number;
  depth: number;
  rotY: number;
}) {
  const halfW = width / 2;
  const halfL = depth / 2;
  const lt = 0.1;
  const lineY = 0.13;
  return (
    <group position={position} rotation={[0, rotY, 0]}>
      <mesh position={[0, 0.06, 0]} receiveShadow>
        <boxGeometry args={[width, 0.12, depth]} />
        <meshStandardMaterial color={COURT_COLOR} />
      </mesh>
      {[
        [0, lineY, halfL - lt, width - lt * 2, lt],
        [0, lineY, -halfL + lt, width - lt * 2, lt],
        [0, lineY, 0, width - lt * 2, lt],
        [halfW - lt, lineY, 0, lt, depth - lt * 2],
        [-halfW + lt, lineY, 0, lt, depth - lt * 2],
      ].map(([x, y, z, sw, sd], i) => (
        <mesh key={i} position={[x, y, z]}>
          <boxGeometry args={[sw, 0.02, sd]} />
          <meshStandardMaterial color={COURT_LINE} />
        </mesh>
      ))}
      <mesh position={[0, lineY, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[Math.min(width, depth) * 0.12, lt * 0.4, 6, 24]} />
        <meshStandardMaterial color={COURT_LINE} />
      </mesh>
      {[halfL, -halfL].map((z, i) => (
        <group key={i} position={[0, 0.12, z]}>
          <mesh position={[0, 1.5, 0]} castShadow>
            <cylinderGeometry args={[0.07, 0.07, 3, 6]} />
            <meshStandardMaterial color="#555" />
          </mesh>
          <mesh position={[0, 2.8, z > 0 ? -0.35 : 0.35]} castShadow>
            <boxGeometry args={[1.2, 0.7, 0.05]} />
            <meshStandardMaterial color={COURT_LINE} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

// Event booths: fills the rect with a grid of little market tents.
export function EventBoothMesh({
  position,
  width,
  depth,
}: {
  position: [number, number, number];
  width: number;
  depth: number;
}) {
  const spacing = 3.0;
  const cols = Math.max(1, Math.floor(width / spacing));
  const rows = Math.max(1, Math.floor(depth / spacing));
  const cstep = width / cols;
  const rstep = depth / rows;
  const booths: [number, number, number][] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      booths.push([-width / 2 + (c + 0.5) * cstep, -depth / 2 + (r + 0.5) * rstep, r + c]);
    }
  }
  return (
    <group position={position}>
      {booths.map(([x, z, k], i) => (
        <group key={i} position={[x, 0, z]}>
          <mesh position={[0, 0.5, 0]} castShadow receiveShadow>
            <boxGeometry args={[1.6, 0.9, 0.8]} />
            <meshStandardMaterial color="#C9A06A" />
          </mesh>
          {[
            [0.8, 0.4],
            [-0.8, 0.4],
            [0.8, -0.4],
            [-0.8, -0.4],
          ].map(([px, pz], j) => (
            <mesh key={j} position={[px, 1.1, pz]}>
              <boxGeometry args={[0.06, 2.2, 0.06]} />
              <meshStandardMaterial color="#8C8C8C" />
            </mesh>
          ))}
          <mesh position={[0, 2.3, 0]} castShadow>
            <boxGeometry args={[1.9, 0.18, 1.1]} />
            <meshStandardMaterial color={BOOTH_CANOPY[k % BOOTH_CANOPY.length]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

// Shop block: glass perimeter walls + a translucent roof + interior eateries.
export function ShopBlockMesh({
  position,
  width,
  depth,
}: {
  position: [number, number, number];
  width: number;
  depth: number;
}) {
  const H = 3.0;
  const T = 0.1;
  const walls: { pos: [number, number, number]; size: [number, number, number] }[] = [
    { pos: [0, H / 2, depth / 2], size: [width, H, T] },
    { pos: [0, H / 2, -depth / 2], size: [width, H, T] },
    { pos: [width / 2, H / 2, 0], size: [T, H, depth] },
    { pos: [-width / 2, H / 2, 0], size: [T, H, depth] },
  ];
  const tableCols = Math.max(1, Math.floor((width - 1) / 2.2));
  const tableXs = Array.from({ length: tableCols }, (_, i) =>
    -width / 2 + (width / tableCols) * (i + 0.5),
  );
  const night = useNightGlow();
  return (
    <group position={position}>
      {walls.map((w, i) => (
        <mesh key={i} position={w.pos}>
          <boxGeometry args={w.size} />
          <meshStandardMaterial color={GLASS_COLOR} transparent opacity={0.22} />
        </mesh>
      ))}
      <mesh position={[0, H, 0]}>
        <boxGeometry args={[width, 0.1, depth]} />
        <meshStandardMaterial color="#DCDCDC" transparent opacity={0.45} />
      </mesh>
      {/* interior light slab — glows warm at night so the shop reads as 'open' */}
      <mesh position={[0, H - 0.2, 0]}>
        <boxGeometry args={[width * 0.85, 0.08, depth * 0.85]} />
        <meshStandardMaterial
          color="#FFF1D0"
          emissive="#FFD98A"
          emissiveIntensity={night ? 1.8 : 0}
          transparent
          opacity={night ? 0.95 : 0.0}
        />
      </mesh>
      {/* eatery counter along the back wall */}
      <mesh position={[0, 0.55, -depth / 2 + 0.6]} castShadow receiveShadow>
        <boxGeometry args={[width * 0.7, 1.1, 0.6]} />
        <meshStandardMaterial color="#6B4A2A" />
      </mesh>
      {/* a few dining tables */}
      {tableXs.map((tx, i) => (
        <mesh key={i} position={[tx, 0.37, depth / 4]} castShadow>
          <cylinderGeometry args={[0.4, 0.4, 0.74, 12]} />
          <meshStandardMaterial color={TABLE_TOP} />
        </mesh>
      ))}
    </group>
  );
}

// ---------- Public Service / Family Centre ----------

const SC_FLOOR_PSC = "#ECD9BC";
const SC_FLOOR_FAMILY = "#F0DCE4";
const SC_GLASS = "#BCD8DA";
const SC_COUNTER = "#A9764B";
const SC_ACCENT_PSC = "#E08A3C";
const SC_ACCENT_FAMILY = "#D96BA0";
const SC_CHAIR = ["#2E8B8B", "#E08A3C", "#4F8A40"];
const SC_KIOSK_BODY = "#2C3138";
const SC_WALL_H = 3.0;
const SC_FLOOR_Y = 0.14;

function scPointInPoly(x: number, z: number, pts: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, zi] = pts[i];
    const [xj, zj] = pts[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Public Service Centre / Family Centre. `points` are in scene-local coords
 * (x, z) — already centred by the caller. Glass-walled, warm, lively interior.
 */
export function ServiceCentreMesh({
  points,
  variant,
}: {
  points: [number, number][];
  variant: "psc" | "family";
}) {
  const accent = variant === "psc" ? SC_ACCENT_PSC : SC_ACCENT_FAMILY;
  const floorColor = variant === "psc" ? SC_FLOOR_PSC : SC_FLOOR_FAMILY;

  const floorGeom = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) shape.lineTo(points[i][0], points[i][1]);
    shape.closePath();
    const g = new THREE.ShapeGeometry(shape);
    g.rotateX(Math.PI / 2);
    return g;
  }, [points]);

  const walls = useMemo(() => {
    const out: { pos: [number, number, number]; len: number; rotY: number }[] = [];
    for (let i = 0; i < points.length; i++) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      const dx = b[0] - a[0];
      const dz = b[1] - a[1];
      const len = Math.hypot(dx, dz);
      if (len < 0.3) continue;
      out.push({
        pos: [(a[0] + b[0]) / 2, SC_FLOOR_Y + SC_WALL_H / 2, (a[1] + b[1]) / 2],
        len,
        rotY: Math.atan2(-dz, dx),
      });
    }
    return out;
  }, [points]);

  const interior = useMemo(() => {
    let minX = Infinity,
      maxX = -Infinity,
      minZ = Infinity,
      maxZ = -Infinity;
    for (const [x, z] of points) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
    }
    const inside = (x: number, z: number) => scPointInPoly(x, z, points);

    const counters: [number, number][] = [];
    const kiosks: [number, number][] = [];
    const chairs: { pos: [number, number]; c: string }[] = [];
    const rooms: { pos: [number, number]; w: number; d: number }[] = [];
    const plants: [number, number][] = [];

    // Service counters along the back (minZ) edge.
    for (let x = minX + 2; x < maxX - 1; x += 2.6) {
      const z = minZ + 1.3;
      if (inside(x, z)) counters.push([x, z]);
    }
    // Self-service kiosks just in front of the counters.
    for (let x = minX + 2.4; x < maxX - 1; x += 2.0) {
      const z = minZ + 3.4;
      if (inside(x, z)) kiosks.push([x, z]);
    }
    // Waiting-area chairs filling the lower/central region, facing the counters.
    let ci = 0;
    for (let z = minZ + 5.2; z < maxZ - 1.2; z += 1.1) {
      for (let x = minX + 1.2; x < maxX - 1.2; x += 0.75) {
        if (inside(x, z)) {
          chairs.push({ pos: [x, z], c: SC_CHAIR[ci % SC_CHAIR.length] });
          ci++;
        }
      }
      ci++;
    }
    // A couple of glass meeting rooms in the far corner.
    const rc1: [number, number] = [maxX - 2.4, minZ + 2.2];
    if (inside(rc1[0], rc1[1])) rooms.push({ pos: rc1, w: 3.4, d: 3.4 });
    // Plants for liveliness near the entrance corners.
    for (const p of [
      [minX + 1.0, maxZ - 1.0],
      [maxX - 1.0, maxZ - 1.0],
    ] as [number, number][]) {
      if (inside(p[0], p[1])) plants.push(p);
    }
    return { counters, kiosks, chairs, rooms, plants };
  }, [points]);

  return (
    <group>
      <mesh geometry={floorGeom} position={[0, SC_FLOOR_Y, 0]} receiveShadow>
        <meshStandardMaterial color={floorColor} side={THREE.DoubleSide} />
      </mesh>
      {/* glass perimeter walls */}
      {walls.map((w, i) => (
        <mesh key={`w${i}`} position={w.pos} rotation={[0, w.rotY, 0]}>
          <boxGeometry args={[w.len, SC_WALL_H, 0.08]} />
          <meshStandardMaterial color={SC_GLASS} transparent opacity={0.22} />
        </mesh>
      ))}
      {/* service counters with a warm accent top */}
      {interior.counters.map(([x, z], i) => (
        <group key={`c${i}`} position={[x, SC_FLOOR_Y, z]}>
          <mesh position={[0, 0.55, 0]} castShadow receiveShadow>
            <boxGeometry args={[2.2, 1.1, 0.7]} />
            <meshStandardMaterial color={SC_COUNTER} />
          </mesh>
          <mesh position={[0, 1.12, 0]}>
            <boxGeometry args={[2.25, 0.08, 0.78]} />
            <meshStandardMaterial color={accent} />
          </mesh>
        </group>
      ))}
      {/* self-service kiosks with glowing screens */}
      {interior.kiosks.map(([x, z], i) => (
        <group key={`k${i}`} position={[x, SC_FLOOR_Y, z]}>
          <mesh position={[0, 0.75, 0]} castShadow>
            <boxGeometry args={[0.7, 1.5, 0.5]} />
            <meshStandardMaterial color={SC_KIOSK_BODY} />
          </mesh>
          <mesh position={[0, 1.05, 0.27]}>
            <boxGeometry args={[0.5, 0.6, 0.04]} />
            <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.5} />
          </mesh>
        </group>
      ))}
      {/* waiting-area chairs */}
      {interior.chairs.map((ch, i) => (
        <group key={`ch${i}`} position={[ch.pos[0], SC_FLOOR_Y, ch.pos[1]]}>
          <mesh position={[0, 0.42, 0]} castShadow>
            <boxGeometry args={[0.5, 0.08, 0.5]} />
            <meshStandardMaterial color={ch.c} />
          </mesh>
          <mesh position={[0, 0.66, -0.22]}>
            <boxGeometry args={[0.5, 0.42, 0.06]} />
            <meshStandardMaterial color={ch.c} />
          </mesh>
        </group>
      ))}
      {/* glass meeting rooms */}
      {interior.rooms.map((r, i) => (
        <group key={`r${i}`} position={[r.pos[0], SC_FLOOR_Y, r.pos[1]]}>
          {[
            [0, r.d / 2, r.w, 0.06],
            [0, -r.d / 2, r.w, 0.06],
            [r.w / 2, 0, 0.06, r.d],
            [-r.w / 2, 0, 0.06, r.d],
          ].map(([px, pz, sw, sd], j) => (
            <mesh key={j} position={[px, 1.25, pz]}>
              <boxGeometry args={[sw, 2.5, sd]} />
              <meshStandardMaterial color={SC_GLASS} transparent opacity={0.3} />
            </mesh>
          ))}
          <mesh position={[0, 1.3, 0]}>
            <boxGeometry args={[r.w - 0.6, 0.75, r.d - 0.6]} />
            <meshStandardMaterial color="#C9A06A" />
          </mesh>
        </group>
      ))}
      {/* plants */}
      {interior.plants.map(([x, z], i) => (
        <group key={`p${i}`} position={[x, SC_FLOOR_Y, z]}>
          <mesh position={[0, 0.25, 0]}>
            <cylinderGeometry args={[0.22, 0.26, 0.5, 8]} />
            <meshStandardMaterial color="#7A5230" />
          </mesh>
          <mesh position={[0, 0.85, 0]} castShadow>
            <icosahedronGeometry args={[0.5, 0]} />
            <meshStandardMaterial color="#4F8A40" flatShading />
          </mesh>
        </group>
      ))}
    </group>
  );
}

