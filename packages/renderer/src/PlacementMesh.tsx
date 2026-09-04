import type { Placement } from "@oth/model";
import { useGLTF } from "@react-three/drei";
import { modelToThree } from "./coords";

/**
 * A dressing asset in the scene.
 *
 * Deliberately inert: this renders and nothing else. No collision, no
 * contribution to the nav bake, no effect on reachability. A broken or
 * mis-scaled upload can only ever look wrong.
 */
export function PlacementMesh({ placement, url }: { placement: Placement; url: string }) {
  const { scene } = useGLTF(url);
  const [x, y, z] = modelToThree(
    placement.position[0], placement.position[1], placement.position[2],
  );

  return (
    <primitive
      object={scene.clone()}
      position={[x, y, z]}
      rotation={[0, (placement.rotationDeg * Math.PI) / 180, 0]}
      scale={placement.scale}
    />
  );
}
