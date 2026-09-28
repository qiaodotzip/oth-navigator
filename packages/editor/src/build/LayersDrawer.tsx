import { useState } from "react";
import type { Api } from "../api/client";
import { lockFor } from "../collab/locks";
import { layerEntityType, levelLayers, type LayerItem } from "../flow/layers";
import { removalsFor } from "../flow/removeLayer";
import type { Saver } from "../state/save";
import { useEditorStore, type Selection } from "../state/store";
import { Button } from "../ui/Button";
import { deleteWithUndo } from "../ui/undo";

/**
 * Everything on the floor, by kind: find a thing by name, rename it, or
 * delete it — with Undo rather than "are you sure?".
 */
export function LayersDrawer({
  api,
  saver,
  onClose,
  onChoose,
}: {
  api: Api;
  saver: Saver;
  onClose: () => void;
  onChoose: (target: NonNullable<Selection>) => void;
}) {
  const model = useEditorStore(s => s.model);
  const levelId = useEditorStore(s => s.activeLevelId);
  const selection = useEditorStore(s => s.selection);
  const locks = useEditorStore(s => s.locks);
  const me = useEditorStore(s => s.user);
  const [editing, setEditing] = useState<string | null>(null);

  const rename = (item: LayerItem, nameEn: string) =>
    void saver.update(layerEntityType(item.type), item.id, item.version, { nameEn });

  // Through removalsFor, so deleting a lift's last stop takes the lift with it
  // and Undo brings both back.
  const remove = (item: LayerItem) => {
    if (!model) return;
    void deleteWithUndo({ api, saver, removals: removalsFor(model, item), label: item.label });
  };

  return (
    <aside
      aria-label="Layers"
      className="absolute bottom-14 right-3 top-3 z-20 flex w-72 flex-col rounded border border-stone-200 bg-white shadow-lg"
    >
      <div className="flex items-center justify-between border-b border-stone-200 px-3 py-2">
        <h2 className="text-sm font-semibold">Layers</h2>
        <Button variant="ghost" size="sm" aria-label="Close layers" onClick={onClose}>
          ×
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-2">
        {levelLayers(model, levelId).map(group => (
          <section key={group.type} className="mb-2">
            <h3 className="px-1 py-1 text-xs font-medium text-stone-500">
              {group.label} ({group.items.length})
            </h3>
            {group.items.length === 0 && <p className="px-1 pb-1 text-xs italic text-stone-500">none yet</p>}
            <ul>
              {group.items.map(item => {
                const target: NonNullable<Selection> = { type: layerEntityType(item.type), id: item.id };
                // Locks are held on the entity, so an area is looked up as the room it is.
                const heldBy = lockFor(locks, target, me?.id ?? null);
                const isSelected = selection?.id === item.id;
                return (
                  <li
                    key={item.id}
                    data-testid={`layer-${item.id}`}
                    className={`group flex items-center gap-1 rounded px-1 py-0.5 text-sm ${
                      isSelected ? "bg-accent-soft text-accent" : "hover:bg-stone-100"
                    }`}
                  >
                    {editing === item.id ? (
                      <input
                        // Uncontrolled, so keyed by the thing it renames: React
                        // must never reuse one field, and what was typed in it,
                        // for another row.
                        key={item.id}
                        aria-label={`Rename ${item.label}`}
                        autoFocus
                        defaultValue={item.label}
                        className="min-w-0 flex-1 rounded border border-stone-300 px-1 text-sm text-stone-900"
                        onBlur={e => {
                          setEditing(null);
                          const next = e.target.value.trim();
                          if (next && next !== item.label) rename(item, next);
                        }}
                        onKeyDown={e => {
                          if (e.key === "Enter") e.currentTarget.blur();
                          if (e.key === "Escape") setEditing(null);
                        }}
                      />
                    ) : (
                      <button
                        type="button"
                        title={item.id}
                        aria-current={isSelected ? "true" : undefined}
                        className="min-w-0 flex-1 truncate text-left"
                        onClick={() => onChoose(target)}
                      >
                        {item.label}
                      </button>
                    )}
                    {heldBy && (
                      <span className="shrink-0 text-xs" title={`${heldBy.lockedByName} is editing this`}>
                        🔒 {heldBy.lockedByName}
                      </span>
                    )}
                    {item.renamable && editing !== item.id && (
                      <button
                        type="button"
                        aria-label={`Rename ${item.label}`}
                        className="rounded px-1 text-xs text-stone-500 opacity-0 hover:text-stone-900 focus:opacity-100 group-hover:opacity-100"
                        onClick={() => setEditing(item.id)}
                      >
                        Rename
                      </button>
                    )}
                    <button
                      type="button"
                      aria-label={`Delete ${item.label}`}
                      className="rounded px-1 text-xs text-danger opacity-0 focus:opacity-100 group-hover:opacity-100"
                      onClick={() => remove(item)}
                    >
                      Delete
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </aside>
  );
}
