import { roomsOnActiveLevel, useEditorStore } from "../state/store";

export function Inspector({
  onRename,
}: {
  onRename: (id: string, version: number, nameEn: string) => void;
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
        <div className="text-xs uppercase tracking-wide text-stone-500">Room</div>
        <div className="font-mono text-xs">{room.id}</div>
      </div>
      <label className="block">
        Name
        <input
          className="mt-1 w-full rounded border px-2 py-1"
          defaultValue={room.nameEn}
          onBlur={e => onRename(room.id, room.version, e.target.value)}
        />
      </label>
      <div className="text-xs text-stone-500">
        {room.kind} · {room.walkable ? "walkable" : "not walkable"} · v{room.version}
      </div>
      <div className="text-xs text-stone-500">Verification: {room.verification.status}</div>
    </div>
  );
}
