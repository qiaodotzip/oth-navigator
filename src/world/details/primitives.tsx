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
