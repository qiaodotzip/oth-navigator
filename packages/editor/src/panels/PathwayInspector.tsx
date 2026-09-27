import type { Pathway } from "@oth/model";
import type { Saver } from "../state/save";
import { useEditorStore } from "../state/store";

/**
 * What a selected walkway is. Type, name and width, which are the three things
 * that differ between one stretch of floor and another.
 */
export function PathwayInspector({ saver }: { saver: Saver }) {
  const model = useEditorStore(s => s.model);
  const selection = useEditorStore(s => s.selection);

  if (selection?.type !== "pathway") {
    return <p className="p-3 text-xs text-stone-500">Select a walkway to give it a type.</p>;
  }

  const pathway: Pathway | undefined = model?.pathways.find(p => p.id === selection.id);
  if (!pathway) return null;
  const kinds = model?.pathwayKinds ?? [];

  const set = (data: Record<string, unknown>) =>
    void saver.update("pathway", pathway.id, pathway.version, data);

  return (
    <div className="space-y-3 p-3 text-sm">
      <label className="block text-xs">
        Type
        <select
          aria-label="Walkway type"
          className="mt-1 w-full rounded border px-2 py-1 text-sm"
          // "" rather than undefined: a select with no matching option shows
          // blank anyway, and this makes "none" an explicit, choosable state.
          value={pathway.kindId ?? ""}
          onChange={e => set({ kindId: e.target.value === "" ? null : e.target.value })}
        >
          <option value="">No type yet</option>
          {kinds.map(k => <option key={k.id} value={k.id}>{k.nameEn}</option>)}
        </select>
      </label>

      {kinds.length === 0 && (
        <p className="text-xs italic text-stone-400">
          No types defined yet — add some under Walkway types.
        </p>
      )}

      <label className="block text-xs">
        Name (optional)
        <input
          aria-label="Walkway name"
          className="mt-1 w-full rounded border px-2 py-1 text-sm"
          defaultValue={pathway.nameEn}
          onBlur={e => {
            if (e.target.value !== pathway.nameEn) set({ nameEn: e.target.value });
          }}
        />
      </label>

      <label className="block text-xs">
        Width (m)
        <input
          aria-label="Walkway width"
          type="number"
          min={0.5}
          step={0.1}
          className="mt-1 w-full rounded border px-2 py-1 text-sm"
          defaultValue={pathway.widthM}
          onBlur={e => {
            const next = Number(e.target.value);
            if (Number.isFinite(next) && next > 0 && next !== pathway.widthM) set({ widthM: next });
          }}
        />
      </label>

      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          aria-label="Step free"
          checked={pathway.stepFree}
          onChange={e => set({ stepFree: e.target.checked })}
        />
        Step free
      </label>
    </div>
  );
}
