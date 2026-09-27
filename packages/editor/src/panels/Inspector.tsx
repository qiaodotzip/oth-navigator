import { roomsOnActiveLevel, useEditorStore } from "../state/store";

export function Inspector({
  onRename,
  onResize,
}: {
  onRename: (id: string, version: number, nameEn: string) => void;
  onResize: (id: string, version: number, heightM: number) => void;
}) {
  const state = useEditorStore();
  const selection = state.selection;
  if (!selection || selection.type !== "room") {
    return <p className="p-3 text-sm text-stone-500">Nothing selected.</p>;
  }

  const room = roomsOnActiveLevel(state).find(r => r.id === selection.id);
  if (!room) return null;

  return (
    <div className="space-y-3 p-3 text-sm">
      <div>
        <div className="text-xs uppercase tracking-wide text-stone-500">{room.kind}</div>
        <div className="font-mono text-xs">{room.id}</div>
      </div>
      <label className="block">
        Name
        <input
          key={room.id}
          className="mt-1 w-full rounded border px-2 py-1"
          defaultValue={room.nameEn}
          onBlur={e => onRename(room.id, room.version, e.target.value)}
        />
      </label>
      <label className="block">
        Height (m)
        <input
          key={room.id}
          aria-label="Height (m)"
          type="number"
          min={0.1}
          step={0.1}
          className="mt-1 w-full rounded border px-2 py-1"
          defaultValue={room.heightM}
          onBlur={e => {
            const next = Number(e.target.value);
            // For a detail this is the dimension a modeller works to, so a typo
            // that silently saved zero would be worse than ignoring it.
            if (Number.isFinite(next) && next > 0 && next !== room.heightM) {
              onResize(room.id, room.version, next);
            }
          }}
        />
      </label>
      <div className="text-xs text-stone-500">
        {room.kind} · {room.walkable ? "walkable" : "not walkable"} · v{room.version}
      </div>
      <div className="text-xs text-stone-500">Verification: {room.verification.status}</div>
    </div>
  );
}
