import { useState } from "react";
import type { LayerItem } from "../flow/layers";
import { levelLayers } from "../flow/layers";
import { useEditorStore } from "../state/store";

export function LayersPanel({
  onRename,
  onDelete,
}: {
  onRename: (item: LayerItem, nameEn: string) => void;
  onDelete: (item: LayerItem) => void;
}) {
  const model = useEditorStore(s => s.model);
  const levelId = useEditorStore(s => s.activeLevelId);
  const selection = useEditorStore(s => s.selection);
  const select = useEditorStore(s => s.select);
  const [editing, setEditing] = useState<string | null>(null);

  const groups = levelLayers(model, levelId);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <h2 className="border-b px-3 py-2 text-xs font-semibold uppercase tracking-wide text-stone-500">
        Layers
      </h2>

      <div className="min-h-0 flex-1 overflow-auto p-2 text-sm">
        {groups.map(group => (
          <section key={group.type} className="mb-2">
            <div className="px-1 py-1 text-xs font-medium text-stone-500">
              {group.label} ({group.items.length})
            </div>

            {group.items.length === 0 && (
              <div className="px-1 pb-1 text-xs italic text-stone-400">none yet</div>
            )}

            <ul>
              {group.items.map(item => {
                const isSelected = selection?.id === item.id;
                return (
                  <li
                    key={item.id}
                    data-testid={`layer-${item.id}`}
                    className={`group flex items-center gap-1 rounded px-1 py-0.5 ${
                      isSelected ? "bg-stone-800 text-white" : "hover:bg-stone-100"
                    }`}
                  >
                    {editing === item.id ? (
                      <input
                        aria-label={`Rename ${item.label}`}
                        autoFocus
                        defaultValue={item.label}
                        className="min-w-0 flex-1 rounded border px-1 text-xs text-stone-900"
                        onBlur={e => {
                          setEditing(null);
                          const next = e.target.value.trim();
                          if (next && next !== item.label) onRename(item, next);
                        }}
                        onKeyDown={e => {
                          if (e.key === "Enter") e.currentTarget.blur();
                          if (e.key === "Escape") setEditing(null);
                        }}
                      />
                    ) : (
                      <button
                        className="min-w-0 flex-1 truncate text-left"
                        title={item.id}
                        onClick={() => select({ type: item.type, id: item.id })}
                      >
                        {item.label}
                      </button>
                    )}

                    {item.renamable && editing !== item.id && (
                      <button
                        aria-label={`Rename ${item.label}`}
                        className="opacity-0 group-hover:opacity-100"
                        onClick={() => setEditing(item.id)}
                      >
                        ✎
                      </button>
                    )}

                    <button
                      aria-label={`Delete ${item.label}`}
                      className="opacity-0 group-hover:opacity-100"
                      onClick={() => onDelete(item)}
                    >
                      🗑
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
