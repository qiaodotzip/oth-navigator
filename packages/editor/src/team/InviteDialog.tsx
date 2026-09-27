import { useState, type FormEvent } from "react";
import { ApiError, isUnauthorized, type Api, type TeamMember } from "../api/client";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";

const FIELD = "mt-1 w-full rounded border border-stone-300 px-2.5 py-1.5";

/** Name and email; the server makes the account and a one-time password. */
export function InviteDialog({
  api,
  open,
  onOpenChange,
  onInvited,
}: {
  api: Api;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInvited: (result: { user: TeamMember; password: string }) => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const result = await api.inviteUser(email.trim(), name.trim());
      setName("");
      setEmail("");
      onInvited(result);
    } catch (err) {
      // A 401 means the session expired; the sign-in dialog over the page
      // says so, and this would only contradict it.
      if (!isUnauthorized(err)) {
        setError(
          err instanceof ApiError && err.status === 409
            ? "Someone with that email is already on the team."
            : err instanceof ApiError && err.status === 400
              ? "Check the name and the email address."
              : "Couldn't send the invite. Check your connection and try again.",
        );
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Invite a teammate" description="They'll get a one-time password to sign in with.">
      <form onSubmit={submit} className="space-y-3">
        <label className="block text-sm">
          Name
          <input className={FIELD} autoComplete="off" value={name} required onChange={e => setName(e.target.value)} />
        </label>
        <label className="block text-sm">
          Email
          <input className={FIELD} type="email" autoComplete="off" spellCheck={false} value={email} required onChange={e => setEmail(e.target.value)} />
        </label>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={busy}>{busy ? "Sending…" : "Send invite"}</Button>
        </div>
      </form>
    </Dialog>
  );
}
