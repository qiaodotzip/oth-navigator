import { useState } from "react";
import type { Api } from "../api/client";
import { followLink } from "../route";
import { useEditorStore } from "../state/store";
import { Avatar } from "../ui/Avatar";
import { Popover, PopoverClose } from "../ui/Popover";
import { ChangePasswordDialog } from "./ChangePasswordDialog";

const ITEM = "block w-full rounded px-2 py-1.5 text-left hover:bg-stone-100";

/** You: your name, your password, the team, and signing out. */
export function AccountMenu({ api }: { api: Api }) {
  const user = useEditorStore(s => s.user);
  const endSession = useEditorStore(s => s.endSession);
  const [changing, setChanging] = useState(false);
  if (!user) return null;

  return (
    <>
      <Popover
        align="end"
        trigger={
          <button type="button" aria-label="Account" className="rounded-full">
            <Avatar userId={user.id} name={user.displayName} size={28} />
          </button>
        }
      >
        <div className="px-2 py-1">
          <div className="font-medium">{user.displayName}</div>
          <div className="text-xs text-stone-500">{user.email}</div>
        </div>
        <hr className="my-1 border-stone-200" />
        <PopoverClose asChild>
          <button type="button" className={ITEM} onClick={() => setChanging(true)}>Change password</button>
        </PopoverClose>
        <PopoverClose asChild>
          <a className={ITEM} href="/team" onClick={followLink("/team")}>Team</a>
        </PopoverClose>
        <PopoverClose asChild>
          <button
            type="button"
            className={ITEM}
            onClick={async () => {
              // Signed out on purpose: the sign-in screen, not an "expired" prompt.
              await api.logout().catch(() => {});
              endSession("signed-out");
            }}
          >
            Sign out
          </button>
        </PopoverClose>
      </Popover>
      <ChangePasswordDialog api={api} open={changing} onOpenChange={setChanging} />
    </>
  );
}
