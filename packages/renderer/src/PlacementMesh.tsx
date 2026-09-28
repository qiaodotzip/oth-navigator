import { placementModelAsset, type ObjectKind, type Placement } from "@oth/model";
import { useGLTF } from "@react-three/drei";
import { Component, type ReactNode } from "react";
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

/**
 * Forgets the placed models' loads, failed ones included. The loader keeps a
 * failure for the page's whole life, so without this, showing the scene again
 * throws the same error at once instead of trying the file again. An object
 * shows its kind's model, so that is the one to forget.
 */
export function forgetPlacementModels(
  placements: readonly Pick<Placement, "assetId" | "objectKindId">[],
  assetUrl: (assetId: string) => string,
  objectKinds: readonly ObjectKind[] = [],
): void {
  const urls = new Set<string>();
  for (const p of placements) {
    const assetId = placementModelAsset({ objectKinds }, p);
    if (assetId) urls.add(assetUrl(assetId));
  }
  for (const url of urls) useGLTF.clear(url);
}

/**
 * One placed model that will not load — its file gone, a broken upload —
 * draws its fallback, and the rest of the level draws as usual. An object's
 * fallback is its kind's box, so it never just vanishes; a placed model has
 * none. Suspense does not catch a failed load, only a pending one. The
 * failure is forgotten as it is caught, so the next time the scene mounts the
 * file is tried again.
 */
export class PlacementBoundary extends Component<
  { url: string; fallback?: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch() {
    useGLTF.clear(this.props.url);
  }

  override render() {
    return this.state.failed ? this.props.fallback ?? null : this.props.children;
  }
}
