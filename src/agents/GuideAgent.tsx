export type GuidePose = { x: number; z: number; yawRad: number; bobPhase: number };

export function GuideAgent({ pose }: { pose: GuidePose }) {
  return (
    <group position={[pose.x, 0, pose.z]} rotation={[0, pose.yawRad, 0]}>
      <mesh position={[0, 0.8, 0]} castShadow>
        <boxGeometry args={[1, 1.6, 0.6]} />
        <meshStandardMaterial color="#0066B3" />
      </mesh>
      <mesh position={[0, 1.95, 0]} castShadow>
        <sphereGeometry args={[0.35, 24, 24]} />
        <meshStandardMaterial color="#F2A33C" />
      </mesh>
    </group>
  );
}
