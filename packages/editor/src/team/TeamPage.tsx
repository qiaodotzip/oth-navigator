import { useState } from "react";
import type { Api, TeamMember } from "../api/client";
import { sortedLevels } from "../flow/floors";
import { useEditorStore } from "../state/store";
import { Avatar } from "../ui/Avatar";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { toast } from "../ui/toast";
import { InviteDialog } from "./InviteDialog";
import { OneTimePasswordDialog, type Issued } from "./OneTimePasswordDialog";

/**
 * The team: who is on it, which floors each owns, who is online now, and
 * invites and password resets — without anyone opening a terminal.
 */
export function TeamPage({ api }: { api: Api }) {
  const team = useEditorStore(s => s.team);
  const setTeam = useEditorStore(s => s.setTeam);
  const model = useEditorStore(s => s.model);
  const presence = useEditorStore(s => s.presence);
  const [inviting, setInviting] = useState(false);
  const [resetting, setResetting] = useState<TeamMember | null>(null);
  const [issued, setIssued] = useState<Issued | null>(null);

  const levels = sortedLevels(model);
  const reload = () => api.listUsers().then(setTeam).catch(() => {});

  async function reset(member: TeamMember) {
    setResetting(null);
    try {
      const result = await api.resetUserPassword(member.id);
      setIssued({ ...result, kind: "reset" });
    } catch {
      toast({ tone: "error", message: `Couldn't reset ${member.displayName}'s password. Try again.` });
    }
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="flex items-center">
        <div>
          <h1 className="text-xl font-semibold">Team</h1>
          <p className="text-xs text-stone-500">Everyone here can invite, reset passwords and assign floors.</p>
        </div>
        <Button variant="primary" className="ml-auto" onClick={() => setInviting(true)}>Invite a teammate</Button>
      </div>

      <table className="mt-5 w-full border-separate border-spacing-0 text-sm">
        <thead className="text-left text-xs uppercase tracking-wide text-stone-500">
          <tr>
            <th className="border-b border-stone-200 py-2">Name</th>
            <th className="border-b border-stone-200 py-2">Email</th>
            <th className="border-b border-stone-200 py-2">Floors</th>
            <th className="border-b border-stone-200 py-2">Now</th>
            <th className="border-b border-stone-200 py-2"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {team.map(member => {
            const floors = levels.filter(l => l.ownerIds.includes(member.id)).map(l => l.code);
            const online = presence.find(p => p.userId === member.id);
            const where = online?.levelId ? model?.levels.find(l => l.id === online.levelId)?.code : null;
            return (
              <tr key={member.id} aria-label={member.displayName}>
                <td className="border-b border-stone-100 py-2">
                  <span className="flex items-center gap-2">
                    <Avatar userId={member.id} name={member.displayName} />
                    {member.displayName}
                  </span>
                </td>
                <td className="border-b border-stone-100 py-2 text-stone-600">{member.email}</td>
                <td className="border-b border-stone-100 py-2">
                  {floors.length > 0 ? (
                    <span className="flex gap-1">{floors.map(code => <span key={code} className="rounded bg-stone-100 px-1.5">{code}</span>)}</span>
                  ) : (
                    <span className="text-stone-400">none yet</span>
                  )}
                </td>
                <td className="border-b border-stone-100 py-2 text-xs">
                  {online ? <span className="text-confirmed">● Online{where ? ` · ${where}` : ""}</span> : ""}
                </td>
                <td className="border-b border-stone-100 py-2 text-right">
                  <Button size="sm" variant="ghost" onClick={() => setResetting(member)}>Reset password</Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <InviteDialog
        api={api}
        open={inviting}
        onOpenChange={setInviting}
        onInvited={result => {
          setInviting(false);
          setIssued({ ...result, kind: "invite" });
          void reload();
        }}
      />

      <Dialog
        open={resetting !== null}
        onOpenChange={open => {
          if (!open) setResetting(null);
        }}
        title={resetting ? `Reset ${resetting.displayName}'s password?` : "Reset password?"}
        description="Their current password stops working at once. You'll get a one-time password to send them."
      >
        <div className="flex justify-end gap-2">
          <Button onClick={() => setResetting(null)}>Cancel</Button>
          {resetting && (
            <Button variant="danger" onClick={() => void reset(resetting)}>
              Reset {resetting.displayName}'s password
            </Button>
          )}
        </div>
      </Dialog>

      <OneTimePasswordDialog issued={issued} onClose={() => setIssued(null)} />
    </div>
  );
}
