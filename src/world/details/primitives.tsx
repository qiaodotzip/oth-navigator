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
  return (
    <group position={position}>
      <mesh position={[0, PLANTER_H / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[PLANTER_W, PLANTER_H, PLANTER_D]} />
        <meshStandardMaterial color={PLANTER_COLOR} />
      </mesh>
      <mesh position={[0, PLANTER_H + BUSH_R * 0.75, 0]} castShadow receiveShadow>
        <icosahedronGeometry args={[BUSH_R, 0]} />
        <meshStandardMaterial color={green} flatShading />
      </mesh>
      <mesh
        position={[BUSH_R * 0.4, PLANTER_H + BUSH_R * 1.05, -BUSH_R * 0.3]}
        castShadow
      >
        <icosahedronGeometry args={[BUSH_R * 0.6, 0]} />
        <meshStandardMaterial color={green} flatShading />
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
