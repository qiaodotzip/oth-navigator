import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";

export function Scene() {
  return (
    <Canvas camera={{ position: [10, 10, 10], fov: 50 }}>
      <ambientLight intensity={0.6} />
      <directionalLight position={[10, 10, 5]} intensity={1} />
      <mesh>
        <boxGeometry args={[3, 1, 3]} />
        <meshStandardMaterial color="#F2A33C" />
      </mesh>
      <gridHelper args={[20, 20, "#666", "#444"]} />
      <OrbitControls />
    </Canvas>
  );
}
