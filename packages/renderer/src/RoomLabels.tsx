import { Html } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Frustum, Matrix4, PerspectiveCamera, Vector3 } from "three";
import { LABEL_COLOURS, LABEL_FONT_PX, sceneLabelsToShow, type RoomLabel, type ShownLabel } from "./labelFit";

/**
 * Inline styles, not Tailwind: the editor's stylesheet is built from the
 * editor's own files and never sees these.
 */
const PILL: CSSProperties = {
  font: `500 ${LABEL_FONT_PX}px "Inter Variable", Inter, system-ui, sans-serif`,
  whiteSpace: "nowrap",
  background: "rgba(255, 255, 255, 0.85)",
  borderRadius: 4,
  padding: "0 4px",
  color: LABEL_COLOURS.name,
};

/**
 * The active floor's room names in the 3D preview (spec §4), drawn as HTML
 * over the canvas by drei's `Html`. Only the labels in view, and fitting
 * their room at the camera's distance, are mounted, which is about 200 at
 * most on L1 and far fewer at any one time.
 */
export function SceneRoomLabels({ labels, elevationM }: { labels: readonly RoomLabel[]; elevationM: number }) {
  const invalidate = useThree(state => state.invalidate);
  const [shown, setShown] = useState<ShownLabel[]>([]);
  const shownKey = useRef("");
  const probe = useMemo(() => ({ frustum: new Frustum(), matrix: new Matrix4(), point: new Vector3() }), []);

  // The scene renders on demand. New labels with the camera still, or a new
  // set just mounted, would otherwise wait for someone to touch the view.
  useEffect(() => {
    invalidate();
  }, [labels, elevationM, shown, invalidate]);

  useFrame(({ camera, size }) => {
    camera.updateMatrixWorld();
    probe.matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    probe.frustum.setFromProjectionMatrix(probe.matrix);
    const next = sceneLabelsToShow(labels, {
      camera: [camera.position.x, camera.position.y, camera.position.z],
      fovDeg: camera instanceof PerspectiveCamera ? camera.fov : 45,
      heightPx: size.height,
      elevationM,
      inView: ([x, y, z]) => probe.frustum.containsPoint(probe.point.set(x, y, z)),
    });
    // Set only on a change. Setting it every frame would keep the demand loop
    // awake for as long as the preview is open.
    const key = next.map(l => `${l.roomId}:${l.text}`).join("|");
    if (key !== shownKey.current) {
      shownKey.current = key;
      setShown(next);
    }
  });

  return (
    <>
      {shown.map(label => (
        // zIndexRange keeps labels under the app's own popovers and toasts;
        // drei's default reaches 16,777,271. No pointer events, so a click
        // lands on the room beneath and selects it.
        <Html key={label.roomId} position={label.position} center zIndexRange={[10, 0]} style={{ pointerEvents: "none" }}>
          <span style={PILL}>
            {label.tone === "confirmed" && <span style={{ color: LABEL_COLOURS.confirmed }}>✓ </span>}
            <span style={{ color: label.tone === "drawing" ? LABEL_COLOURS.drawing : LABEL_COLOURS.name }}>{label.text}</span>
            {label.tone === "proposed" && <em style={{ color: LABEL_COLOURS.proposed }}> proposed</em>}
          </span>
        </Html>
      ))}
    </>
  );
}
