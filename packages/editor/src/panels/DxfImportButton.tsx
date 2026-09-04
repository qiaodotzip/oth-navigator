import { parseDxfPolylines } from "../dxf/parse";
import { polylinesToRooms } from "../dxf/toRooms";
import type { Saver } from "../state/save";
import { useEditorStore } from "../state/store";

export function DxfImportButton({ saver }: { saver: Saver }) {
  const activeLevelId = useEditorStore(s => s.activeLevelId);
  const setStatus = useEditorStore(s => s.setStatus);

  return (
    <label className="block cursor-pointer rounded border px-2 py-1 text-center text-sm">
      Import DXF
      <input
        aria-label="Import DXF"
        type="file"
        accept=".dxf"
        className="hidden"
        onChange={async e => {
          const file = e.target.files?.[0];
          if (!file || !activeLevelId) return;
          const polys = parseDxfPolylines(await file.text());
          // Millimetres is the common CAD unit. Nothing imported is walkable
          // yet, so a wrong guess here is correctable rather than dangerous.
          const drafts = polylinesToRooms(polys, { levelId: activeLevelId, unitsToMetres: 0.001 });
          let created = 0;
          for (const draft of drafts) {
            if (await saver.create("room", draft)) created++;
          }
          setStatus(`Imported ${created} of ${polys.length} polylines from ${file.name}.`);
        }}
      />
    </label>
  );
}
