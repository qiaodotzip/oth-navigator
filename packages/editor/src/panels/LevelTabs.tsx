import { useEditorStore } from "../state/store";

/**
 * Levels along the top rather than down the left rail.
 *
 * You spend a session on one floor and switch rarely, so a permanent vertical
 * column was paying rail width for something used once an hour. The left side
 * is worth more as preview and layers.
 */
export function LevelTabs() {
  const model = useEditorStore(s => s.model);
  const activeLevelId = useEditorStore(s => s.activeLevelId);
  const setActiveLevel = useEditorStore(s => s.setActiveLevel);
  if (!model) return null;

  const ordered = [...model.levels].sort((a, b) => a.ordinal - b.ordinal);

  return (
    <div className="flex gap-1" role="tablist" aria-label="Level">
      {ordered.map(level => {
        const active = level.id === activeLevelId;
        return (
          <button
            key={level.id}
            role="tab"
            aria-selected={active}
            data-testid={`level-${level.code}`}
            onClick={() => setActiveLevel(level.id)}
            className={`rounded px-2.5 py-1 text-sm ${
              active ? "bg-stone-800 text-white" : "bg-stone-100 hover:bg-stone-200"
            }`}
          >
            {level.code}
          </button>
        );
      })}
    </div>
  );
}
