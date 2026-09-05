import { useEditorStore } from "../state/store";

/**
 * Who else is in the editor, and which floor they are on.
 *
 * Silent when you are alone: a chip reading "just you" is noise, and the point
 * of this strip is to catch your eye only when it means something.
 */
export function PresenceBar() {
  const presence = useEditorStore(s => s.presence);
  const model = useEditorStore(s => s.model);
  const me = useEditorStore(s => s.user);

  const others = presence.filter(p => p.userId !== me?.id);
  if (others.length === 0) return null;

  const levelCode = (levelId: string | null) =>
    levelId ? model?.levels.find(l => l.id === levelId)?.code ?? levelId : "—";

  return (
    <div className="flex items-center gap-1 text-xs">
      {others.map(p => (
        <span
          key={p.userId}
          data-testid={`presence-${p.userId}`}
          className="rounded-full bg-stone-200 px-2 py-0.5"
          title={`${p.displayName} is on ${levelCode(p.levelId)}`}
        >
          {p.displayName} · {levelCode(p.levelId)}
        </span>
      ))}
    </div>
  );
}
