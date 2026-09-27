import { useEditorStore } from "../state/store";
import { Avatar } from "../ui/Avatar";

/**
 * A floor's owners as overlapping avatars. An id for someone no longer on the
 * team still renders — as "Former teammate" — rather than vanishing, so a
 * floor never looks unowned when it is not.
 *
 * Until the team has actually loaded, an id missing from it means nothing —
 * it may simply not have arrived yet — so it renders as a neutral avatar
 * rather than jumping to "Former teammate" for everyone, even briefly.
 */
export function OwnerAvatars({ ids, size = 22 }: { ids: readonly string[]; size?: number }) {
  const team = useEditorStore(s => s.team);
  const teamStatus = useEditorStore(s => s.teamStatus);
  return (
    <span className="flex -space-x-1.5">
      {ids.map(id => {
        const member = team.find(m => m.id === id);
        const name = member?.displayName ?? (teamStatus === "loaded" ? "Former teammate" : "Team member");
        return (
          <span key={id} className="rounded-full ring-2 ring-white">
            <Avatar userId={id} name={name} size={size} />
          </span>
        );
      })}
    </span>
  );
}
