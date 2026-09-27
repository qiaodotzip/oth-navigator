import { useEditorStore } from "../state/store";
import { Avatar } from "../ui/Avatar";

const NOT_LOADED = "Owner – name not loaded";

/** A person-shaped glyph: initials for a name nobody has seen would read as someone real. */
function UnknownOwner({ size }: { size: number }) {
  const glyph = Math.round(size * 0.6);
  return (
    <span
      role="img"
      aria-label={NOT_LOADED}
      title={NOT_LOADED}
      className="inline-grid shrink-0 place-items-center rounded-full bg-stone-300 text-white"
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 16 16" width={glyph} height={glyph} aria-hidden="true" fill="currentColor">
        <circle cx="8" cy="5" r="3" />
        <path d="M2 15c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5z" />
      </svg>
    </span>
  );
}

/**
 * A floor's owners as overlapping avatars. An id for someone no longer on the
 * team still renders — as "Former teammate" — rather than vanishing, so a
 * floor never looks unowned when it is not.
 *
 * Until the team has loaded, or when it failed to, an id missing from it
 * means nothing: it may simply not have arrived. It renders as a glyph named
 * for exactly that, never as a guess.
 */
export function OwnerAvatars({ ids, size = 22 }: { ids: readonly string[]; size?: number }) {
  const team = useEditorStore(s => s.team);
  const teamStatus = useEditorStore(s => s.teamStatus);
  return (
    <span className="flex -space-x-1.5">
      {ids.map(id => {
        const member = team.find(m => m.id === id);
        return (
          <span key={id} className="rounded-full ring-2 ring-white">
            {member ? (
              <Avatar userId={id} name={member.displayName} size={size} />
            ) : teamStatus === "loaded" ? (
              <Avatar userId={id} name="Former teammate" size={size} />
            ) : (
              <UnknownOwner size={size} />
            )}
          </span>
        );
      })}
    </span>
  );
}
