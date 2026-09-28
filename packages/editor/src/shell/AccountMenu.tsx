import { useState } from "react";
import type { Api } from "../api/client";
import { followLink } from "../route";
import { useEditorStore } from "../state/store";
import { Avatar } from "../ui/Avatar";
import { Popover, PopoverClose } from "../ui/Popover";

const ITEM = "block w-full rounded px-2 py-1.5 text-left hover:bg-stone-100";

/** You: your name, the team, and signing out. */
export function AccountMenu({ api }: { api: Api }) {
  const [open, setOpen] = useState(false);
  const user = useEditorStore(s => s.user);
  const endSession = useEditorStore(s => s.endSession);
  if (!user) {
    // A session that ends with the menu open must not reopen it on sign-in.
    if (open) setOpen(false);
    return null;
  }

  return (
    <Popover
      align="end"
      open={open}
      onOpenChange={setOpen}
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
      <a
        className={ITEM}
        href="/team"
        onClick={event => {
          // Closed by hand: followLink's preventDefault also stops PopoverClose,
          // which left the menu open over the Team page.
          followLink("/team")(event);
          setOpen(false);
        }}
      >
        Team
      </a>
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
