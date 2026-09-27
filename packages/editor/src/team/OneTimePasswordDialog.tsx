import type { TeamMember } from "../api/client";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { toast } from "../ui/toast";
import { inviteMessage } from "./inviteMessage";

export type Issued = { user: TeamMember; password: string; kind: "invite" | "reset" };

/**
 * A one-time password, shown once. Closing this forgets it — it is stored
 * nowhere in the clear — so the copy button is right beside it, and if it is
 * lost the answer is simply another reset.
 */
export function OneTimePasswordDialog({ issued, onClose }: { issued: Issued | null; onClose: () => void }) {
  if (!issued) return null;
  const message = inviteMessage(issued.kind, window.location.origin, issued.user.email, issued.password);

  return (
    <Dialog
      open
      onOpenChange={open => {
        if (!open) onClose();
      }}
      title={issued.kind === "invite" ? `${issued.user.displayName} is invited` : `${issued.user.displayName}'s new password`}
      description="This password is shown once. Copy it now — if it's lost, reset it again."
    >
      <div className="space-y-3">
        <div className="rounded border border-stone-200 bg-stone-50 p-3">
          <div className="text-xs text-stone-500">{issued.user.email}</div>
          <div className="mt-1 select-all font-mono text-base">{issued.password}</div>
        </div>
        <div className="flex justify-end gap-2">
          <Button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(message);
                toast({ tone: "success", message: "Copied. Send it to them directly, not in a group chat." });
              } catch {
                toast({ tone: "error", message: "Couldn't copy. Select the password above and copy it by hand." });
              }
            }}
          >
            Copy invite message
          </Button>
          <Button variant="primary" onClick={onClose}>Done</Button>
        </div>
      </div>
    </Dialog>
  );
}
