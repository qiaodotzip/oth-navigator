import { useEditorStore } from "../state/store";
import { Avatar } from "../ui/Avatar";

/**
 * A floor's owners as overlapping avatars. An id for someone no longer on the
 * team still renders — as "Former teammate" — rather than vanishing, so a
 * floor never looks unowned when it is not.
 */
export function OwnerAvatars({ ids, size = 22 }: { ids: readonly string[]; size?: number }) {
  const team = useEditorStore(s => s.team);
  return (
    <span className="flex -space-x-1.5">
      {ids.map(id => (
        <span key={id} className="rounded-full ring-2 ring-white">
          <Avatar userId={id} name={team.find(m => m.id === id)?.displayName ?? "Former teammate"} size={size} />
        </span>
      ))}
    </span>
  );
}
