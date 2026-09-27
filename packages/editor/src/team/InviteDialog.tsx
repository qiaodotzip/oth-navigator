import { useState, type FormEvent } from "react";
import { ApiError, isUnauthorized, type Api, type TeamMember } from "../api/client";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";

const FIELD = "mt-1 w-full rounded border border-stone-300 px-2.5 py-1.5";

/** Just a name: there's no password to set, so adding someone is all it takes. */
export function InviteDialog({
  api,
  open,
  onOpenChange,
  onInvited,
}: {
  api: Api;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInvited: (member: TeamMember) => void;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const { user } = await api.inviteUser(name.trim());
      setName("");
      onInvited(user);
    } catch (err) {
      // A 401 means the session expired; the sign-in dialog over the page
      // says so, and this would only contradict it.
      if (!isUnauthorized(err)) {
        setError(
          err instanceof ApiError && err.status === 409
            ? ((err.body as { error?: string } | null)?.error ?? "Someone with that name is already on the team.")
            : err instanceof ApiError && err.status === 400
              ? "Check the name."
              : "Couldn't add them. Check your connection and try again.",
        );
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Add a teammate" description="They'll sign in by picking their name from the list.">
      <form onSubmit={submit} className="space-y-3">
        <label className="block text-sm">
          Name
          <input className={FIELD} autoComplete="off" value={name} required onChange={e => setName(e.target.value)} />
        </label>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={busy}>{busy ? "Adding…" : "Add teammate"}</Button>
        </div>
      </form>
    </Dialog>
  );
}
