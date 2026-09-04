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
  down = false,
}: {
  position: [number, number, number];
  width: number;
  depth: number;
  rotY: number;
  /** false = ascends toward +z (to floor above); true = descends (to floor below). */
  down?: boolean;
}) {
  const rise = Math.min(ESC_RISE, depth * 0.6);
  const nSteps = Math.max(5, Math.round(depth / 0.32));
  const going = depth / nSteps;
  const stepW = Math.min(width, 3.0);
  const night = useNightGlow();
  const sign = down ? -1 : 1; // descend below the floor when going down
  return (
    <group position={position} rotation={[0, rotY, 0]}>
      {Array.from({ length: nSteps }).map((_, i) => {
        const z = -depth / 2 + (i + 0.5) * going;
        const h = ((i + 1) / nSteps) * rise;
        return (
          <group key={i}>
            <mesh position={[0, (sign * h) / 2, z]} castShadow receiveShadow>
              <boxGeometry args={[stepW, h, going * 0.96]} />
              <meshStandardMaterial color={STAIR_COLOR} />
            </mesh>
            {/* glowing step-edge strip lights up at night */}
            <mesh position={[0, sign * h + sign * 0.02, z + going * 0.45]}>
              <boxGeometry args={[stepW, 0.04, 0.06]} />
              <meshStandardMaterial
                color="#FFE9A8"
                emissive="#FFE08A"
                emissiveIntensity={night ? 2.0 : 0}
              />
            </mesh>
          </group>
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
  const night = useNightGlow();
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
        <meshStandardMaterial
          color={STAGE_SCREEN_COLOR}
          emissive="#2E6BD6"
          emissiveIntensity={night ? 1.8 : 0.4}
        />
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

// Tiered stadium stand: concrete steps rise away from the facing (+z) front
// edge, so the stand is HIGHEST at the back (-z) and DESCENDS to the front.
// You enter from the top and walk down to your row. Seats face +z.
export const STADIUM_TIER_DEPTH = 0.85; // depth of one row/step (metres)
export const STADIUM_RISE = 0.45; // height gained per tier
const STADIUM_RISER_COLOR = "#8A9099"; // concrete steps
const STADIUM_SEAT_W = 0.45;
const STADIUM_SEAT_SPACING = 0.62;
const STADIUM_SEAT_COLORS = ["#2E6BD6", "#D9534F", "#F2A33C", "#4F8A40", "#7E57C2"];

export function StadiumSeatsMesh({
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
  const night = useNightGlow();
  const nTiers = Math.max(1, Math.floor(depth / STADIUM_TIER_DEPTH));
  const tierStep = depth / nTiers; // depth occupied by one tier
  const nSeats = Math.max(1, Math.floor(width / STADIUM_SEAT_SPACING));
  const colStep = width / nSeats;
  return (
    <group position={position} rotation={[0, rotY, 0]}>
      {Array.from({ length: nTiers }).map((_, r) => {
        // r = 0 is the FRONT (lowest, +z edge); r = nTiers-1 is the BACK (highest, -z).
        const tierTop = (r + 1) * STADIUM_RISE;
        // Front of the stand is at +depth/2; each tier sits further back (-z).
        const zCenter = depth / 2 - (r + 0.5) * tierStep;
        const seatColor = STADIUM_SEAT_COLORS[r % STADIUM_SEAT_COLORS.length];
        return (
          <group key={r}>
            {/* solid concrete step: filled mass from the ground up to this tier */}
            <mesh position={[0, tierTop / 2, zCenter]} castShadow receiveShadow>
              <boxGeometry args={[width, tierTop, tierStep * 0.98]} />
              <meshStandardMaterial color={STADIUM_RISER_COLOR} />
            </mesh>
            {/* a row of bucket seats sitting on the step, facing +z (the front) */}
            {Array.from({ length: nSeats }).map((__, c) => {
              const x = -width / 2 + (c + 0.5) * colStep;
              return (
                <group key={c} position={[x, tierTop, zCenter + tierStep * 0.12]}>
                  <mesh position={[0, 0.22, 0]} castShadow>
                    <boxGeometry args={[STADIUM_SEAT_W, 0.08, 0.4]} />
                    <meshStandardMaterial
                      color={seatColor}
                      emissive={seatColor}
                      emissiveIntensity={night ? 0.5 : 0}
                    />
                  </mesh>
                  <mesh position={[0, 0.42, -0.2]} castShadow>
                    <boxGeometry args={[STADIUM_SEAT_W, 0.42, 0.06]} />
                    <meshStandardMaterial
                      color={seatColor}
                      emissive={seatColor}
                      emissiveIntensity={night ? 0.5 : 0}
                    />
                  </mesh>
                </group>
              );
            })}
          </group>
        );
      })}
    </group>
  );
}

// Flat pedestrian walkway bridge: a ground-level paved deck spanning the rect's
// long axis (local z), with a low rail down each long side. Not elevated — it's
// a walkable path, so routes travel ON it (see pathChecks isOnWalkway).
const BRIDGE_DECK_T = 0.12;
const BRIDGE_DECK_Y = 0.16; // sits just above the floor slab
const BRIDGE_RAIL_H = 0.9;
const BRIDGE_DECK_COLOR = "#C7CCD2";
const BRIDGE_RAIL_COLOR = "#9AA3AD";

export function WalkwayBridgeMesh({
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
  const railX = Math.max(0, width / 2 - 0.06);
  return (
    <group position={position} rotation={[0, rotY, 0]}>
      {/* flat deck */}
      <mesh position={[0, BRIDGE_DECK_Y, 0]} receiveShadow>
        <boxGeometry args={[width, BRIDGE_DECK_T, depth]} />
        <meshStandardMaterial color={BRIDGE_DECK_COLOR} />
      </mesh>
      {/* low side rails */}
      {[railX, -railX].map((x, i) => (
        <group key={i}>
          <mesh position={[x, BRIDGE_DECK_Y + BRIDGE_RAIL_H * 0.45, 0]} castShadow>
            <boxGeometry args={[0.06, BRIDGE_RAIL_H * 0.9, depth]} />
            <meshStandardMaterial color={BRIDGE_RAIL_COLOR} transparent opacity={0.55} />
          </mesh>
          <mesh position={[x, BRIDGE_DECK_Y + BRIDGE_RAIL_H, 0]} castShadow>
            <boxGeometry args={[0.12, 0.08, depth]} />
            <meshStandardMaterial color={BRIDGE_RAIL_COLOR} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

// Flat polygon walkway: a thin paved path laid on the floor, following the
// drawn polygon. Walkable (it doesn't block routing). `points` arrive already
// centred in scene-local (x, z) by the caller, matching ServiceCentreMesh.
const WALKWAY_COLOR = "#B8AFA0";

export function WalkwayMesh({ points }: { points: [number, number][] }) {
  const night = useNightGlow();
  const geom = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) shape.lineTo(points[i][0], points[i][1]);
    shape.closePath();
    const g = new THREE.ShapeGeometry(shape);
    g.rotateX(Math.PI / 2);
    return g;
  }, [points]);
  return (
    <mesh geometry={geom} position={[0, 0.18, 0]} receiveShadow>
      <meshStandardMaterial
        color={WALKWAY_COLOR}
        side={THREE.DoubleSide}
        emissive={WALKWAY_COLOR}
        emissiveIntensity={night ? 0.25 : 0}
      />
    </mesh>
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
  const night = useNightGlow();
  return (
    <group position={position} rotation={[0, rotY, 0]}>
      <mesh position={[0, 0.06, 0]} receiveShadow>
        <boxGeometry args={[width, 0.12, depth]} />
        <meshStandardMaterial
          color={COURT_COLOR}
          emissive={COURT_COLOR}
          emissiveIntensity={night ? 0.5 : 0}
        />
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
  const night = useNightGlow();
  return (
    <group position={position}>
      {booths.map(([x, z, k], i) => (
        <group key={i} position={[x, 0, z]}>
          <mesh position={[0, 0.5, 0]} castShadow receiveShadow>
            <boxGeometry args={[1.6, 0.9, 0.8]} />
            <meshStandardMaterial
              color="#C9A06A"
              emissive="#FFCC66"
              emissiveIntensity={night ? 1.1 : 0}
            />
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

  const night = useNightGlow();
  return (
    <group>
      <mesh geometry={floorGeom} position={[0, SC_FLOOR_Y, 0]} receiveShadow>
        <meshStandardMaterial
          color={floorColor}
          side={THREE.DoubleSide}
          emissive={accent}
          emissiveIntensity={night ? 0.7 : 0}
        />
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

const LIB_GLASS = "#BCD8DA";
const LIB_FLOOR = "#EDE7D6";
const LIB_ACCENT = "#3E7CB1";
const LIB_WALL_H = 3.0;
const LIB_FLOOR_Y = 0.14;
const LIB_KIOSK_BODY = "#2C3138";
const LIB_GATE = "#3A3F45";
const LIB_BOOK_COLORS = ["#B5402F", "#2E6E8E", "#4F8A40", "#E0A93C", "#7A4FA0"];

/**
 * Library entrance. `points` are scene-local (x, z), already centred by the
 * caller. Glass-walled with a doorway gap on the FIRST edge (points[0]→[1]),
 * RFID security gates flanking that gap, a row of self-checkout / borrow
 * machines a few metres inside, and book display stands deeper in.
 */
export function LibraryEntranceMesh({ points }: { points: [number, number][] }) {
  const night = useNightGlow();

  const floorGeom = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) shape.lineTo(points[i][0], points[i][1]);
    shape.closePath();
    const g = new THREE.ShapeGeometry(shape);
    g.rotateX(Math.PI / 2);
    return g;
  }, [points]);

  const plan = useMemo(() => {
    const inside = (x: number, z: number) => scPointInPoly(x, z, points);
    // Edge 0 (points[0] → points[1]) is the doorway frontage.
    const a = points[0];
    const b = points[1 % points.length];
    const ex = b[0] - a[0];
    const ez = b[1] - a[1];
    const elen = Math.hypot(ex, ez) || 1;
    const dirX = ex / elen;
    const dirZ = ez / elen;
    const midX = (a[0] + b[0]) / 2;
    const midZ = (a[1] + b[1]) / 2;
    // inward normal (flip to the side that lies inside the polygon)
    let nX = -dirZ;
    let nZ = dirX;
    if (!inside(midX + nX * 0.8, midZ + nZ * 0.8)) {
      nX = -nX;
      nZ = -nZ;
    }
    const doorHalf = Math.max(0.5, Math.min(elen * 0.28, 1.6, elen / 2 - 0.3));
    const edgeRotY = Math.atan2(-dirZ, dirX);

    type Seg = { pos: [number, number, number]; len: number; rotY: number };
    const walls: Seg[] = [];
    const pushWall = (ax: number, az: number, bx: number, bz: number) => {
      const dx = bx - ax;
      const dz = bz - az;
      const len = Math.hypot(dx, dz);
      if (len < 0.25) return;
      walls.push({
        pos: [(ax + bx) / 2, LIB_FLOOR_Y + LIB_WALL_H / 2, (az + bz) / 2],
        len,
        rotY: Math.atan2(-dz, dx),
      });
    };
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const q = points[(i + 1) % points.length];
      if (i === 0) {
        // leave a centred gap for the doorway
        pushWall(p[0], p[1], midX - dirX * doorHalf, midZ - dirZ * doorHalf);
        pushWall(midX + dirX * doorHalf, midZ + dirZ * doorHalf, q[0], q[1]);
      } else {
        pushWall(p[0], p[1], q[0], q[1]);
      }
    }

    // RFID gates: a post on each side of the gap, pulled slightly inward.
    const gates = [
      { pos: [midX - dirX * doorHalf + nX * 0.5, midZ - dirZ * doorHalf + nZ * 0.5], rotY: edgeRotY, face: 1 },
      { pos: [midX + dirX * doorHalf + nX * 0.5, midZ + dirZ * doorHalf + nZ * 0.5], rotY: edgeRotY, face: -1 },
    ];

    // Self-checkout / borrow machines: a row ~3 m inside, facing the doorway.
    const kioskRotY = Math.atan2(-nZ, nX);
    const kiosks: { pos: [number, number]; rotY: number }[] = [];
    for (let t = -elen / 2 + 1.2; t <= elen / 2 - 1.2; t += 1.9) {
      const x = midX + dirX * t + nX * 3.0;
      const z = midZ + dirZ * t + nZ * 3.0;
      if (inside(x, z)) kiosks.push({ pos: [x, z], rotY: kioskRotY });
    }

    // Book display stands: deeper inside, spaced wider.
    const stands: { pos: [number, number]; rotY: number }[] = [];
    for (let t = -elen / 2 + 1.6; t <= elen / 2 - 1.6; t += 2.8) {
      const x = midX + dirX * t + nX * 6.0;
      const z = midZ + dirZ * t + nZ * 6.0;
      if (inside(x, z)) stands.push({ pos: [x, z], rotY: edgeRotY });
    }

    return { walls, gates, kiosks, stands };
  }, [points]);

  return (
    <group>
      <mesh geometry={floorGeom} position={[0, LIB_FLOOR_Y, 0]} receiveShadow>
        <meshStandardMaterial
          color={LIB_FLOOR}
          side={THREE.DoubleSide}
          emissive={LIB_ACCENT}
          emissiveIntensity={night ? 0.5 : 0}
        />
      </mesh>
      {/* glass perimeter walls (gap on the doorway edge) */}
      {plan.walls.map((w, i) => (
        <mesh key={`lw${i}`} position={w.pos} rotation={[0, w.rotY, 0]}>
          <boxGeometry args={[w.len, LIB_WALL_H, 0.08]} />
          <meshStandardMaterial color={LIB_GLASS} transparent opacity={0.22} />
        </mesh>
      ))}
      {/* RFID security gates flanking the doorway */}
      {plan.gates.map((g, i) => (
        <group key={`lg${i}`} position={[g.pos[0], LIB_FLOOR_Y, g.pos[1]]} rotation={[0, g.rotY, 0]}>
          <mesh position={[0, 0.7, 0]} castShadow>
            <boxGeometry args={[0.18, 1.4, 0.5]} />
            <meshStandardMaterial color={LIB_GATE} />
          </mesh>
          <mesh position={[0.1 * g.face, 0.8, 0]}>
            <boxGeometry args={[0.04, 1.0, 0.12]} />
            <meshStandardMaterial color={LIB_ACCENT} emissive={LIB_ACCENT} emissiveIntensity={0.7} />
          </mesh>
        </group>
      ))}
      {/* self-checkout / borrow machines */}
      {plan.kiosks.map((k, i) => (
        <group key={`lk${i}`} position={[k.pos[0], LIB_FLOOR_Y, k.pos[1]]} rotation={[0, k.rotY, 0]}>
          <mesh position={[0, 0.55, 0]} castShadow>
            <boxGeometry args={[0.7, 1.1, 0.55]} />
            <meshStandardMaterial color={LIB_KIOSK_BODY} />
          </mesh>
          <mesh position={[0, 1.0, 0.2]} rotation={[-0.5, 0, 0]}>
            <boxGeometry args={[0.55, 0.45, 0.04]} />
            <meshStandardMaterial color={LIB_ACCENT} emissive={LIB_ACCENT} emissiveIntensity={0.6} />
          </mesh>
        </group>
      ))}
      {/* book display stands */}
      {plan.stands.map((s, i) => (
        <group key={`ls${i}`} position={[s.pos[0], LIB_FLOOR_Y, s.pos[1]]} rotation={[0, s.rotY, 0]}>
          <mesh position={[0, 0.45, 0]} castShadow receiveShadow>
            <boxGeometry args={[1.4, 0.9, 0.5]} />
            <meshStandardMaterial color="#8A6A45" />
          </mesh>
          {[-0.45, -0.15, 0.15, 0.45].map((bx, j) => (
            <mesh key={j} position={[bx, 1.02, 0]} castShadow>
              <boxGeometry args={[0.22, 0.28, 0.42]} />
              <meshStandardMaterial color={LIB_BOOK_COLORS[(i * 4 + j) % LIB_BOOK_COLORS.length]} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

const DECOR_SHELF_WOOD = "#6E4B2A";
const DECOR_BOOKS = ["#B5402F", "#2E6E8E", "#4F8A40", "#E0A93C", "#7A4FA0", "#C25E8A"];
const DECOR_TABLE = "#A9764B";
const DECOR_CHAIR = "#3E6B6B";
const DECOR_FLOOR_Y = 0.14;

/**
 * General library decorations to drop INSIDE an existing room (no walls/floor):
 * parallel rows of tall bookshelf stacks with reading tables in the aisles
 * between them, plus a few corner plants. `points` are scene-local (x, z),
 * already centred by the caller.
 */
export function LibraryDecorMesh({ points }: { points: [number, number][] }) {
  const plan = useMemo(() => {
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
    const shelves: [number, number][] = [];
    const tables: [number, number][] = [];
    const plants: [number, number][] = [];
    let row = 0;
    for (let z = minZ + 1.4; z <= maxZ - 1.4; z += 2.2, row++) {
      if (row % 2 === 0) {
        for (let x = minX + 0.9; x <= maxX - 0.9; x += 1.0) {
          if (inside(x, z)) shelves.push([x, z]);
        }
      } else {
        for (let x = minX + 1.8; x <= maxX - 1.8; x += 3.4) {
          if (inside(x, z)) tables.push([x, z]);
        }
      }
    }
    for (const p of [
      [minX + 1, minZ + 1],
      [maxX - 1, minZ + 1],
      [minX + 1, maxZ - 1],
      [maxX - 1, maxZ - 1],
    ] as [number, number][]) {
      if (inside(p[0], p[1])) plants.push(p);
    }
    return { shelves, tables, plants };
  }, [points]);

  return (
    <group>
      {/* bookshelf stacks (books face the aisles on both z sides) */}
      {plan.shelves.map(([x, z], i) => (
        <group key={`sh${i}`} position={[x, DECOR_FLOOR_Y, z]}>
          <mesh position={[0, 0.95, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.92, 1.9, 0.5]} />
            <meshStandardMaterial color={DECOR_SHELF_WOOD} />
          </mesh>
          {[0.27, -0.27].map((dz, s) =>
            [0.45, 1.0, 1.55].map((by, r) => (
              <mesh key={`${s}-${r}`} position={[0, by, dz]}>
                <boxGeometry args={[0.84, 0.32, 0.06]} />
                <meshStandardMaterial color={DECOR_BOOKS[(i + r + s) % DECOR_BOOKS.length]} />
              </mesh>
            )),
          )}
        </group>
      ))}
      {/* reading tables with chairs */}
      {plan.tables.map(([x, z], i) => (
        <group key={`rt${i}`} position={[x, DECOR_FLOOR_Y, z]}>
          <mesh position={[0, 0.74, 0]} castShadow receiveShadow>
            <boxGeometry args={[1.6, 0.06, 0.9]} />
            <meshStandardMaterial color={DECOR_TABLE} />
          </mesh>
          {[
            [0.55, 0.62],
            [-0.55, 0.62],
            [0.55, -0.62],
            [-0.55, -0.62],
          ].map(([cx, cz], j) => (
            <group key={j} position={[cx, 0, cz]}>
              <mesh position={[0, 0.42, 0]} castShadow>
                <boxGeometry args={[0.42, 0.07, 0.42]} />
                <meshStandardMaterial color={DECOR_CHAIR} />
              </mesh>
              <mesh position={[0, 0.66, cz > 0 ? 0.18 : -0.18]}>
                <boxGeometry args={[0.42, 0.4, 0.06]} />
                <meshStandardMaterial color={DECOR_CHAIR} />
              </mesh>
            </group>
          ))}
        </group>
      ))}
      {/* corner plants */}
      {plan.plants.map(([x, z], i) => (
        <group key={`pl${i}`} position={[x, DECOR_FLOOR_Y, z]}>
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

const MR_GLASS = "#BCD8DA";
const MR_TABLE = "#C9A06A";
const MR_CHAIR = ["#2E8B8B", "#E08A3C", "#4F8A40"];
const MR_FLOOR = "#E4E7EA";
const MR_FLOOR_Y = 0.14;
const MR_WALL_H = 2.6;
const MR_ACCENT = "#5E81AC";

/**
 * Meeting rooms: tiles the polygon with glass-walled rooms (only where a full
 * room fits inside), each with a central table and chairs. `points` are
 * scene-local (x, z), already centred by the caller.
 */
export function MeetingRoomsMesh({ points }: { points: [number, number][] }) {
  const night = useNightGlow();

  const floorGeom = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) shape.lineTo(points[i][0], points[i][1]);
    shape.closePath();
    const g = new THREE.ShapeGeometry(shape);
    g.rotateX(Math.PI / 2);
    return g;
  }, [points]);

  const plan = useMemo(() => {
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
    const room = 4.2;
    const gap = 1.4;
    const step = room + gap;
    const half = room / 2;
    const rooms: [number, number][] = [];
    for (let cx = minX + half + 0.4; cx <= maxX - half - 0.4; cx += step) {
      for (let cz = minZ + half + 0.4; cz <= maxZ - half - 0.4; cz += step) {
        if (
          inside(cx - half, cz - half) &&
          inside(cx + half, cz - half) &&
          inside(cx - half, cz + half) &&
          inside(cx + half, cz + half)
        ) {
          rooms.push([cx, cz]);
        }
      }
    }
    return { rooms, room };
  }, [points]);

  const w = plan.room;
  const h = MR_WALL_H;
  const walls: { pos: [number, number, number]; size: [number, number, number] }[] = [
    { pos: [0, h / 2, w / 2], size: [w, h, 0.08] },
    { pos: [0, h / 2, -w / 2], size: [w, h, 0.08] },
    { pos: [w / 2, h / 2, 0], size: [0.08, h, w] },
    { pos: [-w / 2, h / 2, 0], size: [0.08, h, w] },
  ];

  return (
    <group>
      <mesh geometry={floorGeom} position={[0, MR_FLOOR_Y, 0]} receiveShadow>
        <meshStandardMaterial
          color={MR_FLOOR}
          side={THREE.DoubleSide}
          emissive={MR_ACCENT}
          emissiveIntensity={night ? 0.4 : 0}
        />
      </mesh>
      {plan.rooms.map(([cx, cz], i) => (
        <group key={`mr${i}`} position={[cx, MR_FLOOR_Y, cz]}>
          {walls.map((wl, j) => (
            <mesh key={j} position={wl.pos}>
              <boxGeometry args={wl.size} />
              <meshStandardMaterial color={MR_GLASS} transparent opacity={0.25} />
            </mesh>
          ))}
          {/* table */}
          <mesh position={[0, 0.74, 0]} castShadow receiveShadow>
            <boxGeometry args={[w * 0.5, 0.06, w * 0.28]} />
            <meshStandardMaterial color={MR_TABLE} />
          </mesh>
          {/* chairs around the table */}
          {[
            [w * 0.32, 0],
            [-w * 0.32, 0],
            [0, w * 0.22],
            [0, -w * 0.22],
          ].map(([px, pz], j) => (
            <mesh key={`c${j}`} position={[px, 0.45, pz]} castShadow>
              <boxGeometry args={[0.45, 0.5, 0.45]} />
              <meshStandardMaterial color={MR_CHAIR[(i + j) % MR_CHAIR.length]} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

// ---------- Roof / sky-terrace polygon primitives ----------

const COURT_ROOF_Y = 6.5; // underside-to-top sits around here, above court hoops
const COURT_ROOF_T = 0.3;
const COURT_ROOF_COLOR = "#9AA1A9";
const COURT_ROOF_COLUMN = "#7E868F";

/**
 * Flat grey court roof: a thick slab covering the drawn polygon, floating at
 * COURT_ROOF_Y on support columns dropped at the polygon's bbox corners. You
 * walk underneath, so it never blocks routing. `points` are scene-local (x, z).
 */
export function CourtRoofMesh({ points }: { points: [number, number][] }) {
  const { geom, columns } = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) shape.lineTo(points[i][0], points[i][1]);
    shape.closePath();
    const g = new THREE.ExtrudeGeometry(shape, { depth: COURT_ROOF_T, bevelEnabled: false });
    g.rotateX(Math.PI / 2);
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
    const ins = 0.6;
    const cols: [number, number][] = [
      [minX + ins, minZ + ins],
      [maxX - ins, minZ + ins],
      [minX + ins, maxZ - ins],
      [maxX - ins, maxZ - ins],
    ];
    return { geom: g, columns: cols };
  }, [points]);
  return (
    <group>
      <mesh geometry={geom} position={[0, COURT_ROOF_Y, 0]} castShadow receiveShadow>
        <meshStandardMaterial color={COURT_ROOF_COLOR} side={THREE.DoubleSide} />
      </mesh>
      {columns.map(([x, z], i) => (
        <mesh key={i} position={[x, COURT_ROOF_Y / 2, z]} castShadow receiveShadow>
          <boxGeometry args={[0.32, COURT_ROOF_Y, 0.32]} />
          <meshStandardMaterial color={COURT_ROOF_COLUMN} />
        </mesh>
      ))}
    </group>
  );
}

const GARDEN_GRASS = "#5C8B47";
const GARDEN_BUSH = ["#4F7A3A", "#5C8B47", "#3E6A30"];
const GARDEN_PLANTER = "#7A5230";
const GARDEN_FLOOR_Y = 0.16;

/**
 * Lush sky-terrace garden decoration: a grass base over the drawn polygon,
 * scattered with bushes, small trees and planters. Decorative — does not block
 * routing. `points` are scene-local (x, z), already centred by the caller.
 */
export function GardenDecorMesh({ points }: { points: [number, number][] }) {
  const night = useNightGlow();
  const plan = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) shape.lineTo(points[i][0], points[i][1]);
    shape.closePath();
    const geom = new THREE.ShapeGeometry(shape);
    geom.rotateX(Math.PI / 2);
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
    const bushes: [number, number][] = [];
    const trees: [number, number][] = [];
    const planters: [number, number][] = [];
    let row = 0;
    for (let z = minZ + 0.8; z <= maxZ - 0.8; z += 1.6, row++) {
      for (let x = minX + 0.8; x <= maxX - 0.8; x += 1.6) {
        if (!inside(x, z)) continue;
        const k = ((row * 3 + Math.round(x) + 100) % 5 + 5) % 5;
        if (k === 0) trees.push([x, z]);
        else if (k === 1) planters.push([x, z]);
        else bushes.push([x, z]);
      }
    }
    return { geom, bushes, trees, planters };
  }, [points]);
  return (
    <group>
      <mesh geometry={plan.geom} position={[0, GARDEN_FLOOR_Y, 0]} receiveShadow>
        <meshStandardMaterial
          color={GARDEN_GRASS}
          side={THREE.DoubleSide}
          emissive={GARDEN_GRASS}
          emissiveIntensity={night ? 0.3 : 0}
        />
      </mesh>
      {plan.bushes.map(([x, z], i) => (
        <mesh key={`b${i}`} position={[x, GARDEN_FLOOR_Y + 0.3, z]} castShadow>
          <icosahedronGeometry args={[0.4, 0]} />
          <meshStandardMaterial
            color={GARDEN_BUSH[i % GARDEN_BUSH.length]}
            flatShading
            emissive={GARDEN_BUSH[i % GARDEN_BUSH.length]}
            emissiveIntensity={night ? 0.5 : 0}
          />
        </mesh>
      ))}
      {plan.trees.map(([x, z], i) => (
        <group key={`t${i}`} position={[x, GARDEN_FLOOR_Y, z]}>
          <mesh position={[0, 0.7, 0]} castShadow>
            <cylinderGeometry args={[0.1, 0.14, 1.4, 6]} />
            <meshStandardMaterial color="#8B6B4A" flatShading />
          </mesh>
          <mesh position={[0, 1.6, 0]} castShadow>
            <icosahedronGeometry args={[0.6, 0]} />
            <meshStandardMaterial
              color="#3E7A34"
              flatShading
              emissive="#3E7A34"
              emissiveIntensity={night ? 0.4 : 0}
            />
          </mesh>
        </group>
      ))}
      {plan.planters.map(([x, z], i) => (
        <group key={`p${i}`} position={[x, GARDEN_FLOOR_Y, z]}>
          <mesh position={[0, 0.19, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.7, 0.38, 0.55]} />
            <meshStandardMaterial color={GARDEN_PLANTER} />
          </mesh>
          <mesh position={[0, 0.55, 0]} castShadow>
            <icosahedronGeometry args={[0.32, 0]} />
            <meshStandardMaterial color="#5C8B47" flatShading />
          </mesh>
        </group>
      ))}
    </group>
  );
}

const HDB_FLOOR = "#ECE9E1";
const HDB_ACCENT = "#1C7C9C"; // HDB teal-blue branding
const HDB_COUNTER = "#A9764B";
const HDB_KIOSK_BODY = "#2C3138";
const HDB_CHAIR = "#3E6B8B";
const HDB_FLOOR_Y = 0.14;

/**
 * HDB branch office. `points` are scene-local (x, z), already centred by the
 * caller. A government housing-services hall: service counters along the back,
 * a queue ticket machine near the entrance, rows of waiting chairs facing the
 * counters, self-service payment kiosks down one side, and a few plants.
 */
export function HdbOfficeMesh({ points }: { points: [number, number][] }) {
  const night = useNightGlow();

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
        pos: [(a[0] + b[0]) / 2, HDB_FLOOR_Y + 1.5, (a[1] + b[1]) / 2],
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
    const chairs: [number, number][] = [];
    const plants: [number, number][] = [];
    let ticket: [number, number] | null = null;

    // Service counters along the back (minZ) edge.
    for (let x = minX + 2; x < maxX - 1; x += 2.6) {
      const z = minZ + 1.3;
      if (inside(x, z)) counters.push([x, z]);
    }
    // Self-service payment kiosks down the left (minX) side.
    for (let z = minZ + 3.6; z < maxZ - 1.5; z += 1.9) {
      const x = minX + 1.3;
      if (inside(x, z)) kiosks.push([x, z]);
    }
    // Waiting-area chairs filling the central band, facing the counters (-z).
    for (let z = minZ + 4.0; z < maxZ - 1.2; z += 1.15) {
      for (let x = minX + 3.0; x < maxX - 1.2; x += 0.8) {
        if (inside(x, z)) chairs.push([x, z]);
      }
    }
    // Queue ticket machine near the entrance (front-right corner).
    const tc: [number, number] = [maxX - 1.6, maxZ - 1.6];
    if (inside(tc[0], tc[1])) ticket = tc;
    // Plants near the front corners.
    for (const p of [
      [minX + 1.0, maxZ - 1.0],
      [maxX - 1.0, maxZ - 1.0],
    ] as [number, number][]) {
      if (inside(p[0], p[1])) plants.push(p);
    }
    return { counters, kiosks, chairs, plants, ticket };
  }, [points]);

  return (
    <group>
      <mesh geometry={floorGeom} position={[0, HDB_FLOOR_Y, 0]} receiveShadow>
        <meshStandardMaterial
          color={HDB_FLOOR}
          side={THREE.DoubleSide}
          emissive={HDB_ACCENT}
          emissiveIntensity={night ? 0.6 : 0}
        />
      </mesh>
      {/* low glass partition walls */}
      {walls.map((w, i) => (
        <mesh key={`hw${i}`} position={w.pos} rotation={[0, w.rotY, 0]}>
          <boxGeometry args={[w.len, 3.0, 0.08]} />
          <meshStandardMaterial color="#BCD8DA" transparent opacity={0.2} />
        </mesh>
      ))}
      {/* service counters with a teal accent top */}
      {interior.counters.map(([x, z], i) => (
        <group key={`hc${i}`} position={[x, HDB_FLOOR_Y, z]}>
          <mesh position={[0, 0.55, 0]} castShadow receiveShadow>
            <boxGeometry args={[2.2, 1.1, 0.7]} />
            <meshStandardMaterial color={HDB_COUNTER} />
          </mesh>
          <mesh position={[0, 1.12, 0]}>
            <boxGeometry args={[2.25, 0.08, 0.78]} />
            <meshStandardMaterial color={HDB_ACCENT} />
          </mesh>
          {/* staff monitor */}
          <mesh position={[0, 1.35, -0.1]}>
            <boxGeometry args={[0.5, 0.34, 0.04]} />
            <meshStandardMaterial color={HDB_KIOSK_BODY} emissive={HDB_ACCENT} emissiveIntensity={0.3} />
          </mesh>
        </group>
      ))}
      {/* self-service payment kiosks */}
      {interior.kiosks.map(([x, z], i) => (
        <group key={`hk${i}`} position={[x, HDB_FLOOR_Y, z]}>
          <mesh position={[0, 0.75, 0]} castShadow>
            <boxGeometry args={[0.7, 1.5, 0.5]} />
            <meshStandardMaterial color={HDB_KIOSK_BODY} />
          </mesh>
          <mesh position={[0.27, 1.05, 0]} rotation={[0, Math.PI / 2, 0]}>
            <boxGeometry args={[0.5, 0.6, 0.04]} />
            <meshStandardMaterial color={HDB_ACCENT} emissive={HDB_ACCENT} emissiveIntensity={0.55} />
          </mesh>
        </group>
      ))}
      {/* waiting-area chairs (back toward +z, sitter faces the counters) */}
      {interior.chairs.map(([x, z], i) => (
        <group key={`hch${i}`} position={[x, HDB_FLOOR_Y, z]}>
          <mesh position={[0, 0.42, 0]} castShadow>
            <boxGeometry args={[0.5, 0.08, 0.5]} />
            <meshStandardMaterial color={HDB_CHAIR} />
          </mesh>
          <mesh position={[0, 0.66, 0.22]}>
            <boxGeometry args={[0.5, 0.42, 0.06]} />
            <meshStandardMaterial color={HDB_CHAIR} />
          </mesh>
        </group>
      ))}
      {/* queue ticket machine */}
      {interior.ticket && (
        <group position={[interior.ticket[0], HDB_FLOOR_Y, interior.ticket[1]]}>
          <mesh position={[0, 0.7, 0]} castShadow>
            <boxGeometry args={[0.55, 1.4, 0.4]} />
            <meshStandardMaterial color={HDB_ACCENT} />
          </mesh>
          <mesh position={[0, 1.0, 0.21]}>
            <boxGeometry args={[0.4, 0.5, 0.04]} />
            <meshStandardMaterial color="#0E2A33" emissive={HDB_ACCENT} emissiveIntensity={0.5} />
          </mesh>
        </group>
      )}
      {/* plants */}
      {interior.plants.map(([x, z], i) => (
        <group key={`hp${i}`} position={[x, HDB_FLOOR_Y, z]}>
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

const THEATRE_FLOOR = "#2B2A33"; // dark auditorium floor
const THEATRE_STAGE = "#5A3A2E"; // wooden stage deck
const THEATRE_SCREEN = "#11131A";
const THEATRE_SCREEN_GLOW = "#3A4A6B";
const THEATRE_CURTAIN = "#7A1F2B"; // deep red curtains
const THEATRE_SEAT = "#8B2433"; // red auditorium seats
const THEATRE_FLOOR_Y = 0.14;
const THEATRE_STAGE_DEPTH = 4.0;
const THEATRE_STAGE_H = 0.5;

/**
 * Theatre / auditorium. `points` are scene-local (x, z), already centred by the
 * caller. The FIRST edge (points[0]→[1]) is the stage frontage: a raised wooden
 * deck with a glowing screen and red side curtains sits there, and raked rows of
 * red seats fill the rest of the polygon facing it.
 */
export function TheatreMesh({ points }: { points: [number, number][] }) {
  const night = useNightGlow();

  const floorGeom = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) shape.lineTo(points[i][0], points[i][1]);
    shape.closePath();
    const g = new THREE.ShapeGeometry(shape);
    g.rotateX(Math.PI / 2);
    return g;
  }, [points]);

  const plan = useMemo(() => {
    const inside = (x: number, z: number) => scPointInPoly(x, z, points);
    const a = points[0];
    const b = points[1 % points.length];
    const ex = b[0] - a[0];
    const ez = b[1] - a[1];
    const elen = Math.hypot(ex, ez) || 1;
    const dirX = ex / elen;
    const dirZ = ez / elen;
    const midX = (a[0] + b[0]) / 2;
    const midZ = (a[1] + b[1]) / 2;
    // inward normal (points into the polygon)
    let nX = -dirZ;
    let nZ = dirX;
    if (!inside(midX + nX * 0.8, midZ + nZ * 0.8)) {
      nX = -nX;
      nZ = -nZ;
    }
    // how far the polygon extends inward from the stage edge
    let maxReach = 0;
    for (const [px, pz] of points) {
      const s = (px - midX) * nX + (pz - midZ) * nZ;
      if (s > maxReach) maxReach = s;
    }
    // local +z points inward (away from stage); seats face -z (the stage)
    const rotY = Math.atan2(nX, nZ);
    const at = (t: number, s: number): [number, number] => [
      midX + dirX * t + nX * s,
      midZ + dirZ * t + nZ * s,
    ];
    const stageWidth = Math.min(elen * 0.94, elen - 0.4);

    // raked rows of seats, rising away from the stage
    const seats: { pos: [number, number]; y: number }[] = [];
    let row = 0;
    for (let s = THEATRE_STAGE_DEPTH + 2.0; s < maxReach - 0.6; s += 1.0, row++) {
      const riseY = 0.12 + row * 0.13;
      for (let t = -elen / 2 + 0.6; t <= elen / 2 - 0.6; t += 0.65) {
        const [x, z] = at(t, s);
        if (inside(x, z)) seats.push({ pos: [x, z], y: riseY });
      }
    }

    return {
      seats,
      rotY,
      stageCenter: at(0, THEATRE_STAGE_DEPTH / 2 + 0.3),
      screenCenter: at(0, 0.35),
      curtainL: at(-stageWidth / 2 + 0.4, 0.5),
      curtainR: at(stageWidth / 2 - 0.4, 0.5),
      stageWidth,
    };
  }, [points]);

  return (
    <group>
      <mesh geometry={floorGeom} position={[0, THEATRE_FLOOR_Y, 0]} receiveShadow>
        <meshStandardMaterial color={THEATRE_FLOOR} side={THREE.DoubleSide} />
      </mesh>
      {/* stage deck */}
      <group position={[plan.stageCenter[0], THEATRE_FLOOR_Y, plan.stageCenter[1]]} rotation={[0, plan.rotY, 0]}>
        <mesh position={[0, THEATRE_STAGE_H / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[plan.stageWidth, THEATRE_STAGE_H, THEATRE_STAGE_DEPTH]} />
          <meshStandardMaterial color={THEATRE_STAGE} />
        </mesh>
      </group>
      {/* screen / backdrop */}
      <group position={[plan.screenCenter[0], THEATRE_FLOOR_Y, plan.screenCenter[1]]} rotation={[0, plan.rotY, 0]}>
        <mesh position={[0, 2.4, 0]} castShadow>
          <boxGeometry args={[plan.stageWidth * 0.8, 4.4, 0.16]} />
          <meshStandardMaterial
            color={THEATRE_SCREEN}
            emissive={THEATRE_SCREEN_GLOW}
            emissiveIntensity={night ? 0.9 : 0.35}
          />
        </mesh>
      </group>
      {/* red side curtains framing the stage */}
      {[plan.curtainL, plan.curtainR].map((c, i) => (
        <group key={`cur${i}`} position={[c[0], THEATRE_FLOOR_Y, c[1]]} rotation={[0, plan.rotY, 0]}>
          <mesh position={[0, 2.6, 0]} castShadow>
            <boxGeometry args={[0.7, 5.2, 0.6]} />
            <meshStandardMaterial color={THEATRE_CURTAIN} />
          </mesh>
        </group>
      ))}
      {/* raked auditorium seats (back toward +z, sitter faces the stage) */}
      {plan.seats.map((st, i) => (
        <group key={`ts${i}`} position={[st.pos[0], THEATRE_FLOOR_Y + st.y, st.pos[1]]} rotation={[0, plan.rotY, 0]}>
          <mesh position={[0, 0.22, 0]} castShadow>
            <boxGeometry args={[0.52, 0.12, 0.5]} />
            <meshStandardMaterial color={THEATRE_SEAT} />
          </mesh>
          <mesh position={[0, 0.5, 0.22]}>
            <boxGeometry args={[0.52, 0.5, 0.08]} />
            <meshStandardMaterial color={THEATRE_SEAT} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

