import { useState, type FormEvent } from "react";
import { ApiError, isUnauthorized, type Api } from "../api/client";
import { useEditorStore } from "../state/store";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { toast } from "../ui/toast";

const FIELD = "mt-1 w-full rounded border border-stone-300 px-2.5 py-1.5";

/** Change your own password. You stay signed in; the one-time prompt goes away. */
export function ChangePasswordDialog({
  api,
  open,
  onOpenChange,
}: {
  api: Api;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const user = useEditorStore(s => s.user);
  const setUser = useEditorStore(s => s.setUser);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (next.length < 10) return setError("Use at least 10 characters.");
    if (next !== again) return setError("The two new passwords don't match.");
    setBusy(true);
    try {
      await api.changePassword(current, next);
      if (user) setUser({ ...user, mustChangePassword: false });
      setCurrent("");
      setNext("");
      setAgain("");
      toast({ tone: "success", message: "Password changed." });
      onOpenChange(false);
    } catch (err) {
      // The 422 for a wrong current password must always show: it is not the
      // session expiring. A 401 needs nothing of its own — the sign-in dialog
      // over the page already says so.
      if (err instanceof ApiError && err.status === 422) {
        setError("Your current password is not right.");
      } else if (!isUnauthorized(err)) {
        setError("Couldn't change it. Check your connection and try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Change password" description="At least 10 characters. You'll stay signed in.">
      <form onSubmit={submit} className="space-y-3">
        <label className="block text-sm">
          Current password
          <input className={FIELD} type="password" autoComplete="current-password" value={current} onChange={e => setCurrent(e.target.value)} />
        </label>
        <label className="block text-sm">
          New password
          <input className={FIELD} type="password" autoComplete="new-password" value={next} onChange={e => setNext(e.target.value)} />
        </label>
        <label className="block text-sm">
          New password, again
          <input className={FIELD} type="password" autoComplete="new-password" value={again} onChange={e => setAgain(e.target.value)} />
        </label>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? "Changing…" : "Change password"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
