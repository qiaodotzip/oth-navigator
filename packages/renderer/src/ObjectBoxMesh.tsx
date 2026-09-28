import type { Placement } from "@oth/model";
import { Html } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { OBJECT_BOX_COLOUR, objectBoxGeometry, type ObjectSize } from "./objectBox";
import { placementTransform } from "./placementTransform";

/**
 * Inline styles, not Tailwind: the editor's stylesheet is built from the
 * editor's own files and never sees these. The same pill as the room labels.
 */
const NAME: CSSProperties = {
  font: '500 13px "Inter Variable", Inter, system-ui, sans-serif',
  whiteSpace: "nowrap",
  background: "rgba(255, 255, 255, 0.9)",
  borderRadius: 4,
  padding: "0 4px",
  color: "#1c1917",
};

/**
 * An object whose kind has no model yet: a box of the kind's size in a
 * neutral colour, with the kind's name on hover (spec §5.3). Turned and
 * scaled as a placed model is, so the model that replaces it lands the same.
 */
export function ObjectBoxMesh({ placement, size, name }: { placement: Placement; size: ObjectSize; name: string }) {
  const geometry = useMemo(() => objectBoxGeometry(size), [size.w, size.d, size.h]);
  const [hovered, setHovered] = useState(false);
  const invalidate = useThree(state => state.invalidate);
  useEffect(() => () => geometry.dispose(), [geometry]);
  // The scene renders on demand; the name would otherwise wait for the next orbit.
  useEffect(() => invalidate(), [hovered, invalidate]);

  const t = placementTransform(placement);
  return (
    <group position={t.position} rotation={[0, t.rotationY, 0]} scale={t.scale}>
      <mesh
        geometry={geometry}
        castShadow
        receiveShadow
        onPointerOver={event => {
          event.stopPropagation();
          setHovered(true);
        }}
        onPointerOut={() => setHovered(false)}
      >
        <meshStandardMaterial color={OBJECT_BOX_COLOUR} />
      </mesh>
      {hovered && (
        // Under the app's own popovers, and letting clicks through, as the room labels do.
        <Html position={[0, size.h + 0.3, 0]} center zIndexRange={[10, 0]} style={{ pointerEvents: "none" }}>
          <span style={NAME}>{name}</span>
        </Html>
      )}
    </group>
  );
}
