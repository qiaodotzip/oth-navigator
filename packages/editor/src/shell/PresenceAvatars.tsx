import { useEditorStore } from "../state/store";
import { Avatar } from "../ui/Avatar";

/**
 * Who else is in the app, and on which floor. Silent when you are alone: this
 * should catch your eye only when it means something.
 */
export function PresenceAvatars() {
  const presence = useEditorStore(s => s.presence);
  const model = useEditorStore(s => s.model);
  const me = useEditorStore(s => s.user);

  const others = presence.filter(p => p.userId !== me?.id);
  if (others.length === 0) return null;

  const where = (levelId: string | null) =>
    (levelId && model?.levels.find(l => l.id === levelId)?.code) || "Floors";

  return (
    <div className="flex -space-x-1.5" aria-label="Also here">
      {others.map(p => (
        <span key={p.userId} data-testid={`presence-${p.userId}`} className="rounded-full ring-2 ring-white">
          <Avatar userId={p.userId} name={`${p.displayName} · ${where(p.levelId)}`} size={26} />
        </span>
      ))}
    </div>
  );
}
