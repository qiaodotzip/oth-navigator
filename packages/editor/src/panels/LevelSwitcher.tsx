import { useEditorStore } from "../state/store";

export function LevelSwitcher() {
  const model = useEditorStore(s => s.model);
  const activeLevelId = useEditorStore(s => s.activeLevelId);
  const setActiveLevel = useEditorStore(s => s.setActiveLevel);
  if (!model) return null;

  // Highest first, so the list reads like the building looks.
  const ordered = [...model.levels].sort((a, b) => b.ordinal - a.ordinal);

  return (
    <div className="flex flex-col gap-1 p-2">
      {ordered.map(level => (
        <button
          key={level.id}
          onClick={() => setActiveLevel(level.id)}
          className={`rounded px-2 py-1 text-sm ${
            level.id === activeLevelId ? "bg-stone-800 text-white" : "bg-white hover:bg-stone-200"
          }`}
        >
          {level.code}
        </button>
      ))}
    </div>
  );
}
