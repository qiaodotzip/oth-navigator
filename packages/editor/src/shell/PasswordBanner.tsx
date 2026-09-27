import { useState } from "react";
import type { Api } from "../api/client";
import { useEditorStore } from "../state/store";
import { Button } from "../ui/Button";
import { ChangePasswordDialog } from "./ChangePasswordDialog";

/** Until you set your own password, a quiet line asks you to. */
export function PasswordBanner({ api }: { api: Api }) {
  const user = useEditorStore(s => s.user);
  const [open, setOpen] = useState(false);
  if (!user?.mustChangePassword) return null;

  return (
    <div role="status" className="flex items-center gap-3 border-b border-yours/30 bg-yours-soft px-4 py-2 text-sm">
      You're signed in with a one-time password.
      <Button size="sm" onClick={() => setOpen(true)}>Set your own</Button>
      <ChangePasswordDialog api={api} open={open} onOpenChange={setOpen} />
    </div>
  );
}
