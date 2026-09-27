import type { Level } from "@oth/model";
import { useState } from "react";
import { OwnerAvatars } from "../shell/OwnerAvatars";
import type { Saver } from "../state/save";
import { useEditorStore } from "../state/store";
import { Avatar } from "../ui/Avatar";
import { Popover } from "../ui/Popover";

/** Who owns a floor, set from the floor's own card. */
export function OwnerPicker({ level, saver }: { level: Level; saver: Pick<Saver, "update"> }) {
  const team = useEditorStore(s => s.team);
  const teamStatus = useEditorStore(s => s.teamStatus);
  // Serialises toggles: `level` is a stale closure until the round trip that
  // follows refreshes the store, so a second tick fired before that lands
  // would compute `next` from the same stale ownerIds and send the same
  // stale version — the first save wins, the second 409s, and the checkbox
  // silently reverts as if someone else had clicked it.
  const [busy, setBusy] = useState(false);

  const toggle = async (id: string) => {
    if (busy) return;
    const next = level.ownerIds.includes(id) ? level.ownerIds.filter(x => x !== id) : [...level.ownerIds, id];
    setBusy(true);
    try {
      await saver.update("level", level.id, level.version, { ownerIds: next });
    } finally {
      setBusy(false);
    }
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
      {teamStatus === "loading" && <p className="px-2 text-xs text-stone-500">Loading the team…</p>}
      {teamStatus === "error" && (
        <p className="px-2 text-xs text-danger">Couldn't load the team. Reload the page to try again.</p>
      )}
      <ul>
        {team.map(member => (
          <li key={member.id}>
            <label className="flex items-center gap-2 rounded px-2 py-1 hover:bg-stone-100">
              <input
                type="checkbox"
                aria-label={member.displayName}
                checked={level.ownerIds.includes(member.id)}
                disabled={busy}
                onChange={() => void toggle(member.id)}
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
