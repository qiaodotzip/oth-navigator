import { Html } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { memo, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  LABEL_COLOURS, LABEL_FONT_PX, cameraView, sceneLabelsToShow, shownLabelsKey, viewProbe,
  type LabelTone, type RoomLabel, type ShownLabel,
} from "./labelFit";

/**
 * Inline styles, not Tailwind: the editor's stylesheet is built from the
 * editor's own files and never sees these.
 */
const PILL: CSSProperties = {
  font: `500 ${LABEL_FONT_PX}px "Inter Variable", Inter, system-ui, sans-serif`,
  whiteSpace: "nowrap",
  // Solid, not translucent: LABEL_COLOURS' ratios hold on white only, and a
  // selected room or a void showing through took the ✓, "proposed" and the
  // grey under 4.5:1.
  background: "#ffffff",
  borderRadius: 4,
  padding: "0 4px",
  color: LABEL_COLOURS.name,
};

/**
 * No pointer events, so a click lands on the room beneath and selects it.
 * One object for every label: Html recomputes its styles when this changes.
 */
const PASS_THROUGH: CSSProperties = { pointerEvents: "none" };

/**
 * One label, memoised on plain values. Html re-renders its own React root on
 * every render, so without this a zoom that cut one name short would redraw
 * every pill on the floor.
 */
const SceneLabel = memo(function SceneLabel({ text, tone, x, y, z }: {
  text: string; tone: LabelTone; x: number; y: number; z: number;
}) {
  return (
    // zIndexRange keeps labels under the app's own popovers and toasts;
    // drei's default reaches 16,777,271.
    <Html position={[x, y, z]} center zIndexRange={[10, 0]} style={PASS_THROUGH}>
      <span style={PILL}>
        {tone === "confirmed" && <span style={{ color: LABEL_COLOURS.confirmed }}>✓ </span>}
        <span style={{ color: tone === "drawing" ? LABEL_COLOURS.drawing : LABEL_COLOURS.name }}>{text}</span>
        {tone === "proposed" && <em style={{ color: LABEL_COLOURS.proposed }}> proposed</em>}
      </span>
    </Html>
  );
});

/**
 * The active floor's room names in the 3D preview (spec §4), drawn as HTML
 * over the canvas by drei's `Html`. Only the labels in view, and fitting
 * their room at the camera's distance, are mounted: at most L1's 252, and far
 * fewer at any one time.
 *
 * `fullHeightWalls` is the scene's own (`MapScene`), so each label sits on
 * the walls the scene draws rather than floating over them or sinking in.
 */
export function SceneRoomLabels({ labels, elevationM, fullHeightWalls = false }: {
  labels: readonly RoomLabel[]; elevationM: number; fullHeightWalls?: boolean;
}) {
  const invalidate = useThree(state => state.invalidate);
  const [shown, setShown] = useState<ShownLabel[]>([]);
  const shownKey = useRef("");
  const probe = useMemo(viewProbe, []);

  // The scene renders on demand. New labels with the camera still, or a new
  // set just mounted, would otherwise wait for someone to touch the view.
  useEffect(() => {
    invalidate();
  }, [labels, elevationM, fullHeightWalls, shown, invalidate]);

  useFrame(({ camera, size }) => {
    const next = sceneLabelsToShow(labels, cameraView(camera, size.height, elevationM, probe), fullHeightWalls);
    // Set only on a change. Setting it every frame would keep the demand loop
    // awake for as long as the preview is open.
    const key = shownLabelsKey(next);
    if (key !== shownKey.current) {
      shownKey.current = key;
      setShown(next);
    }
  });

  return (
    <>
      {shown.map(({ roomId, text, tone, position: [x, y, z] }) => (
        <SceneLabel key={roomId} text={text} tone={tone} x={x} y={y} z={z} />
      ))}
    </>
  );
}
