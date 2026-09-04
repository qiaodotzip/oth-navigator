import { CONTEXT_ORIGIN_NOTE, buildContextGlb } from "@oth/renderer";
import { activeLevel, roomsOnActiveLevel, useEditorStore } from "../state/store";

/**
 * Exports the active level as locked reference geometry. The modeller opens
 * this in Blender or Rhino, models inside it, and uploads only their new mesh.
 */
export function ContextExportButton() {
  const state = useEditorStore();
  const level = activeLevel(state);
  const rooms = roomsOnActiveLevel(state);
  const setStatus = useEditorStore(s => s.setStatus);

  return (
    <button
      disabled={!level || rooms.length === 0}
      title={CONTEXT_ORIGIN_NOTE}
      className="w-full rounded border px-2 py-1 text-sm disabled:opacity-40"
      onClick={async () => {
        if (!level) return;
        const bytes = await buildContextGlb(rooms, level);
        // Copy into a definite ArrayBuffer: a Uint8Array may be backed by a
        // SharedArrayBuffer as far as the types are concerned, which Blob rejects.
        const buffer = new ArrayBuffer(bytes.byteLength);
        new Uint8Array(buffer).set(bytes);
        const url = URL.createObjectURL(new Blob([buffer], { type: "model/gltf-binary" }));
        const a = document.createElement("a");
        a.href = url;
        a.download = `oth-${level.code}-context.glb`;
        a.click();
        URL.revokeObjectURL(url);
        setStatus(`Exported ${rooms.length} rooms. ${CONTEXT_ORIGIN_NOTE}`);
      }}
    >
      Export context for Blender
    </button>
  );
}
