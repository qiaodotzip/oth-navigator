import { useEditorStore, type Tool } from "../state/store";

const TOOLS: { id: Tool; label: string }[] = [
  { id: "select", label: "Select" },
  { id: "draw-room", label: "Draw room" },
  { id: "draw-doorway", label: "Doorway" },
  { id: "place-entrance", label: "Entrance" },
  { id: "place-portal", label: "Portal" },
];

export function Toolbar() {
  const tool = useEditorStore(s => s.tool);
  const setTool = useEditorStore(s => s.setTool);

  return (
    <div className="flex gap-1 border-b bg-white p-2">
      {TOOLS.map(t => (
        <button
          key={t.id}
          onClick={() => setTool(t.id)}
          className={`rounded px-3 py-1 text-sm ${
            tool === t.id ? "bg-stone-800 text-white" : "hover:bg-stone-200"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
