import { useEditorStore } from "../state/store";
import { TOOL_LABELS, TOOLBAR_TOOLS } from "../state/tools";

export function Toolbar() {
  const tool = useEditorStore(s => s.tool);
  const setTool = useEditorStore(s => s.setTool);

  return (
    <div className="flex gap-1 border-b bg-white p-2">
      {TOOLBAR_TOOLS.map(t => (
        <button
          key={t}
          onClick={() => setTool(t)}
          className={`rounded px-3 py-1 text-sm ${
            tool === t ? "bg-stone-800 text-white" : "hover:bg-stone-200"
          }`}
        >
          {TOOL_LABELS[t]}
        </button>
      ))}
    </div>
  );
}
