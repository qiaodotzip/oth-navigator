import type { MapModel } from "@oth/model";
import { useMemo } from "react";
import { modelToThree } from "./coords";
import { MARKER_STYLE, levelMarkers, type MarkerShape } from "./markers";

/** Above 1.2 m walls, so a marker is seen from any angle. */
const POLE_M = 2.6;

function Head({ shape }: { shape: MarkerShape }) {
  switch (shape) {
    case "cone": return <coneGeometry args={[0.5, 0.8, 16]} />;
    case "box": return <boxGeometry args={[0.8, 0.8, 0.8]} />;
    case "cylinder": return <cylinderGeometry args={[0.45, 0.45, 0.6, 16]} />;
    case "octahedron": return <octahedronGeometry args={[0.55]} />;
  }
}

/**
 * A level's entrance and stop markers, each a pole with its kind's head.
 * The file is not `Markers.tsx`: on a case-insensitive disk that and
 * `markers.ts` are one import, and `./Markers` loaded the wrong one.
 */
export function Markers({ model, levelId }: { model: MapModel; levelId: string }) {
  const markers = useMemo(() => levelMarkers(model, levelId), [model, levelId]);
  return (
    <>
      {markers.map(m => {
        const style = MARKER_STYLE[m.kind];
        const [x, , z] = modelToThree(m.point[0], m.point[1], 0);
        return (
          <group key={m.id} position={[x, 0, z]}>
            <mesh position={[0, POLE_M / 2, 0]}>
              <cylinderGeometry args={[0.06, 0.06, POLE_M, 8]} />
              <meshStandardMaterial color={style.colour} />
            </mesh>
            <mesh position={[0, POLE_M + 0.4, 0]} rotation={style.shape === "cone" ? [Math.PI, 0, 0] : [0, 0, 0]}>
              <Head shape={style.shape} />
              <meshStandardMaterial color={style.colour} />
            </mesh>
          </group>
        );
      })}
    </>
  );
}
