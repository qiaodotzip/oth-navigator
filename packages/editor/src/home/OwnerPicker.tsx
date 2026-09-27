import type { Level } from "@oth/model";
import { OwnerAvatars } from "../shell/OwnerAvatars";
import type { Saver } from "../state/save";
import { useEditorStore } from "../state/store";
import { Avatar } from "../ui/Avatar";
import { Popover } from "../ui/Popover";

/** Who owns a floor, set from the floor's own card. */
export function OwnerPicker({ level, saver }: { level: Level; saver: Pick<Saver, "update"> }) {
  const team = useEditorStore(s => s.team);

  const toggle = (id: string) => {
    const next = level.ownerIds.includes(id) ? level.ownerIds.filter(x => x !== id) : [...level.ownerIds, id];
    void saver.update("level", level.id, level.version, { ownerIds: next });
  };

  return (
    <Popover
      align="end"
      trigger={
        // Above the card's stretched link, so it is clickable on its own.
        <button type="button" aria-label={`Owners of ${level.code}`} className="relative z-10 rounded-full">
          {level.ownerIds.length > 0 ? (
            <OwnerAvatars ids={level.ownerIds} />
          ) : (
            <span className="rounded-full border border-dashed border-stone-300 px-2 py-0.5 text-xs text-stone-500">+ Owner</span>
          )}
        </button>
      }
    >
      <p className="px-2 pb-1 text-xs text-stone-500">Who owns {level.code}?</p>
      {team.length === 0 && <p className="px-2 text-xs text-stone-500">Loading the team…</p>}
      <ul>
        {team.map(member => (
          <li key={member.id}>
            <label className="flex items-center gap-2 rounded px-2 py-1 hover:bg-stone-100">
              <input
                type="checkbox"
                aria-label={member.displayName}
                checked={level.ownerIds.includes(member.id)}
                onChange={() => toggle(member.id)}
              />
              <Avatar userId={member.id} name={member.displayName} size={20} />
              {member.displayName}
            </label>
          </li>
        ))}
      </ul>
    </Popover>
  );
}
