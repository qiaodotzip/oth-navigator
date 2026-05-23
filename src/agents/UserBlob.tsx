import { Html } from "@react-three/drei";
import type { Floor } from "@/data/types";

const TOWN_SQUARE_M: [number, number] = [128, 73];

export function UserBlob({ floor }: { floor: Floor }) {
  if (floor.id !== "L1") return null;
  const [mx, my] = TOWN_SQUARE_M;
  const x = mx - floor.bounds.width / 2;
  const z = floor.bounds.depth / 2 - my;
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.5, 0]} castShadow>
        <capsuleGeometry args={[0.45, 0.9, 6, 12]} />
        <meshStandardMaterial color="#E91E63" emissive="#E91E63" emissiveIntensity={0.25} />
      </mesh>
      <mesh position={[0, 1.4, 0]} castShadow>
        <sphereGeometry args={[0.32, 24, 24]} />
        <meshStandardMaterial color="#F2C5A0" />
      </mesh>
      <Html position={[0, 2.4, 0]} center distanceFactor={70}>
        <div className="pointer-events-none whitespace-nowrap rounded-full bg-pink-600 px-2 py-0.5 text-[10px] font-semibold text-white shadow-md">
          You are here
        </div>
      </Html>
    </group>
  );
}
