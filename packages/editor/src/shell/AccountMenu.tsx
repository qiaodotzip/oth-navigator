import type { Api } from "../api/client";
import { followLink } from "../route";
import { useEditorStore } from "../state/store";
import { Avatar } from "../ui/Avatar";
import { Popover, PopoverClose } from "../ui/Popover";

const ITEM = "block w-full rounded px-2 py-1.5 text-left hover:bg-stone-100";

/** You: your name, the team, and signing out. */
export function AccountMenu({ api }: { api: Api }) {
  const user = useEditorStore(s => s.user);
  const endSession = useEditorStore(s => s.endSession);
  if (!user) return null;

  return (
    <Popover
      align="end"
      trigger={
        <button type="button" aria-label="Account" className="rounded-full">
          <Avatar userId={user.id} name={user.displayName} size={28} />
        </button>
      }
    >
      <div className="px-2 py-1">
        {/* Name only: email is a hidden slug (e.g. wei@team.oth.local) since sign-in dropped passwords. */}
        <div className="font-medium">{user.displayName}</div>
      </div>
      <hr className="my-1 border-stone-200" />
      <PopoverClose asChild>
        <a className={ITEM} href="/team" onClick={followLink("/team")}>Team</a>
      </PopoverClose>
      <PopoverClose asChild>
        <button
          type="button"
          className={ITEM}
          onClick={async () => {
            // Ended here, before the request that makes it so: a presence poll
            // that lands mid-sign-out must not read this as an expired session.
            endSession("signed-out");
            await api.logout().catch(() => {});
          }}
        >
          Sign out
        </button>
      </PopoverClose>
    </Popover>
  );
}
