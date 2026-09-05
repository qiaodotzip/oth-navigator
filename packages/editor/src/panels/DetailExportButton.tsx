import { DETAIL_ORIGIN_NOTE, buildDetailGlb, detailContextRooms } from "@oth/renderer";
import { activeLevel, roomsOnActiveLevel, useEditorStore } from "../state/store";

/**
 * Exports the selected detail as a dimensioned block with its surroundings,
 * centred on itself. The modeller builds inside the block; the mesh comes back
 * to the same point because the placement carries the same offset.
 */
export function DetailExportButton() {
  const state = useEditorStore();
  const level = activeLevel(state);
  const rooms = roomsOnActiveLevel(state);
  const detail =
    state.selection?.type === "room"
      ? rooms.find(r => r.id === state.selection?.id && r.kind === "detail") ?? null
      : null;

  return (
    <button
      disabled={!level || !detail}
      title={DETAIL_ORIGIN_NOTE}
      className="w-full rounded border px-2 py-1 text-sm disabled:opacity-40"
      onClick={async () => {
        if (!level || !detail) return;
        const { bytes, offset } = await buildDetailGlb(
          detail, detailContextRooms(detail, rooms), level,
        );
        // Copy into a definite ArrayBuffer: a Uint8Array may be backed by a
        // SharedArrayBuffer as far as the types are concerned, which Blob rejects.
        const buf = new ArrayBuffer(bytes.byteLength);
        new Uint8Array(buf).set(bytes);
        const url = URL.createObjectURL(new Blob([buf], { type: "model/gltf-binary" }));
        const a = document.createElement("a");
        a.href = url;
        a.download = `oth-${detail.id}.glb`;
        a.click();
        URL.revokeObjectURL(url);
        state.setStatus(
          `Exported ${detail.id}, centred on (${offset[0].toFixed(2)}, ${offset[1].toFixed(2)}). ` +
          DETAIL_ORIGIN_NOTE,
        );
      }}
    >
      {detail ? `Export ${detail.id} for Blender` : "Select a detail to export"}
    </button>
  );
}
